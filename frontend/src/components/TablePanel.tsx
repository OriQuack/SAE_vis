import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableDataResponse, FeatureTableRow } from '../types'
import {
  calculateQualityScoreStats,
  sortFeatures,
  getExplainerDisplayName
} from '../lib/d3-table-utils'
import {
  getQualityScoreColor,
  getMetricColor,
  calculateAvgSemanticSimilarity
} from '../lib/utils'
import {
  METRIC_QUALITY_SCORE,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMANTIC_SIMILARITY
} from '../lib/constants'
import { HighlightedExplanation } from './HighlightedExplanation'
import QualityScoreBreakdown from './QualityScoreBreakdown'
import '../styles/TablePanel.css'

// ============================================================================
// MAIN TABLE PANEL COMPONENT
// ============================================================================

interface TablePanelProps {
  className?: string
}

const TablePanel: React.FC<TablePanelProps> = ({ className = '' }) => {
  const tableData = useVisualizationStore(state => state.tableData) as FeatureTableDataResponse | null
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const rightPanel = useVisualizationStore(state => state.rightPanel)
  const fetchTableData = useVisualizationStore(state => state.fetchTableData)
  const setTableScrollState = useVisualizationStore(state => state.setTableScrollState)
  const isLoading = useVisualizationStore(state => state.loading.table)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const clearNodeSelection = useVisualizationStore(state => state.clearNodeSelection)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const qualityScoreCellRef = useRef<HTMLTableCellElement>(null)
  const [cellHeight, setCellHeight] = useState<number>(40) // Natural cell height

  // Sorting state from store
  const sortBy = useVisualizationStore(state => state.tableSortBy)
  const sortDirection = useVisualizationStore(state => state.tableSortDirection)
  const setTableSort = useVisualizationStore(state => state.setTableSort)

  // ============================================================================
  // STATE
  // ============================================================================

  // State for explanation hover interactions
  const [hoveredFeatureId, setHoveredFeatureId] = useState<number | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<'above' | 'below'>('above')
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>(300)
  const [popoverLeft, setPopoverLeft] = useState<number>(0)

  // State for quality score breakdown panel
  const [hoveredQualityScore, setHoveredQualityScore] = useState<number | null>(null)
  const [qualityScorePopoverPosition, setQualityScorePopoverPosition] = useState<'above' | 'below'>('above')

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Handle sort click
  const handleSort = (sortKey: 'featureId' | typeof METRIC_QUALITY_SCORE | typeof METRIC_FEATURE_SPLITTING | typeof METRIC_SEMANTIC_SIMILARITY) => {
    // Cycle through: null → asc → desc → null
    if (sortBy === sortKey) {
      if (sortDirection === null) {
        setTableSort(sortKey, 'asc')
      } else if (sortDirection === 'asc') {
        setTableSort(sortKey, 'desc')
      } else {
        // Reset to no sort
        setTableSort(null, null)
      }
    } else {
      // New sort target, start with ascending
      setTableSort(sortKey, 'asc')
    }
  }

  // Handler for quality score hover
  const handleQualityScoreHover = useCallback((featureId: number | null, cellElement?: HTMLElement | null) => {
    setHoveredQualityScore(featureId)

    if (featureId !== null && cellElement && tableContainerRef.current) {
      const containerRect = tableContainerRef.current.getBoundingClientRect()
      const cellRect = cellElement.getBoundingClientRect()
      const spaceAbove = cellRect.top - containerRect.top

      // Use smaller height for quality score breakdown (120px)
      const breakdownHeight = 120
      setQualityScorePopoverPosition(spaceAbove < breakdownHeight ? 'below' : 'above')
    }
  }, [])

  // Handler for explanation hover interactions
  const handleFeatureHover = useCallback((featureId: number | null, rowElement?: HTMLElement | null) => {
    setHoveredFeatureId(featureId)

    if (featureId !== null && rowElement && tableContainerRef.current) {
      const containerRect = tableContainerRef.current.getBoundingClientRect()
      const rowRect = rowElement.getBoundingClientRect()
      const spaceAbove = rowRect.top - containerRect.top

      // Measure the explanation cell width
      const explanationCell = rowElement.querySelector('.table-panel__cell--explanation') as HTMLElement
      const cellWidth = explanationCell ? explanationCell.offsetWidth : 300

      // Calculate left offset of explanation cell relative to the row
      let leftOffset = 0
      if (explanationCell) {
        const cellRect = explanationCell.getBoundingClientRect()
        leftOffset = cellRect.left - rowRect.left
      }

      // Set popover dimensions and position
      setPopoverMaxHeight(cellWidth)
      setPopoverLeft(leftOffset)

      // Use dynamic height for threshold calculation
      setPopoverPosition(spaceAbove < cellWidth ? 'below' : 'above')
    }
  }, [])

  // Fetch data when component mounts or when filters change
  useEffect(() => {
    fetchTableData()
  }, [
    fetchTableData,
    leftPanel.filters.llm_explainer,
    rightPanel.filters.llm_explainer,
    leftPanel.filters.llm_scorer,
    rightPanel.filters.llm_scorer
  ])

  // Measure natural cell height for quality score pill scaling
  useEffect(() => {
    if (qualityScoreCellRef.current) {
      const height = qualityScoreCellRef.current.offsetHeight
      if (height > 0) {
        setCellHeight(height)
      }
    }
  }, [])


  // Track scroll position for vertical bar scroll indicator
  // Professional approach: Observe inner <table> element that grows when rows are added
  useEffect(() => {
    const container = tableContainerRef.current

    console.log('[TablePanel] Scroll tracking effect running:', {
      hasContainer: !!container,
      featuresLength: tableData?.features.length
    })

    if (!container) {
      console.warn('[TablePanel] No container ref available, skipping scroll tracking setup')
      return
    }

    // Track cleanup resources
    let tableObserver: ResizeObserver | null = null
    let containerObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let rafId: number | null = null
    const cleanupTimeouts: number[] = []

    // Measure and update scroll state
    const measureAndUpdate = (_source: string = 'unknown') => {
      // Cancel any pending measurement
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame to ensure measurement happens after layout
      rafId = requestAnimationFrame(() => {
        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight
        }

        // Only update state if dimensions are valid (non-zero)
        // This prevents setting invalid state during transitions
        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          setTableScrollState(scrollState)
        } else {
          console.warn('[TablePanel] Skipping state update - invalid dimensions')
        }

        rafId = null
      })
    }

    console.log('[TablePanel] Setting up scroll tracking')

    // 1. Add scroll event listener for user interactions
    const handleScrollEvent = () => measureAndUpdate('scroll-event')
    container.addEventListener('scroll', handleScrollEvent, { passive: true })

    // 2. Observe container for viewport/size changes
    containerObserver = new ResizeObserver(() => measureAndUpdate('container-resize'))
    containerObserver.observe(container)

    // 3. Find and observe inner <table> element (grows when rows are added)
    // Use retry logic to handle React timing issues
    const setupTableObserver = (): boolean => {
      const tableElement = container.querySelector('table')
      if (tableElement && !tableObserver) {
        console.log('[TablePanel] Table element found, attaching ResizeObserver')
        tableObserver = new ResizeObserver(() => measureAndUpdate('table-resize'))
        tableObserver.observe(tableElement)
        measureAndUpdate('initial')
        return true
      }
      return false
    }

    // Try to find table immediately
    if (!setupTableObserver()) {
      // Table not found yet - this is common when effect runs before headerStructure is built
      // Strategy: Retry after 100ms (gives React time to complete render cycle)
      console.log('[TablePanel] Table not found on initial check, scheduling retry in 100ms')

      const retryTimeout = window.setTimeout(() => {
        console.log('[TablePanel] Retry: checking for table element')
        if (!setupTableObserver()) {
          // Still not found after retry, set up MutationObserver as final fallback
          console.log('[TablePanel] Table still not found after retry, setting up MutationObserver')
          mutationObserver = new MutationObserver(() => {
            if (setupTableObserver() && mutationObserver) {
              console.log('[TablePanel] Table detected via MutationObserver')
              mutationObserver.disconnect()
              mutationObserver = null
            }
          })
          mutationObserver.observe(container, { childList: true, subtree: true })

          // Safety: disconnect mutation observer after 5 seconds
          const mutationTimeout = window.setTimeout(() => {
            if (mutationObserver) {
              console.log('[TablePanel] Disconnecting mutation observer (timeout)')
              mutationObserver.disconnect()
              mutationObserver = null
            }
          }, 5000)

          cleanupTimeouts.push(mutationTimeout)
        }
      }, 100)

      cleanupTimeouts.push(retryTimeout)
    }

    console.log('[TablePanel] Scroll tracking setup complete')

    // Cleanup function
    return () => {
      console.log('[TablePanel] Cleaning up scroll tracking')
      container.removeEventListener('scroll', handleScrollEvent)

      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      if (containerObserver) {
        containerObserver.disconnect()
      }

      if (tableObserver) {
        tableObserver.disconnect()
      }

      if (mutationObserver) {
        mutationObserver.disconnect()
      }

      // Clean up all retry/mutation timeouts
      cleanupTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
    }
  }, [setTableScrollState, tableData?.features.length])

  // ============================================================================
  // SORTED FEATURES
  // ============================================================================

  // Get selected node features for filtering
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const selectedFeatures = useMemo(() => getSelectedNodeFeatures(), [getSelectedNodeFeatures])

  // Sort features based on current sort settings (using shared utility)
  const sortedFeatures = useMemo(() => {
    let features = tableData?.features || []

    // Filter by selected node features if any nodes are selected
    if (selectedFeatures && selectedFeatures.size > 0) {
      features = features.filter(f => selectedFeatures.has(f.feature_id))
      console.log(`[TablePanel] Filtered to ${features.length} features from ${tableSelectedNodeIds.length} selected node(s)`)
    }

    return sortFeatures(
      features,
      sortBy,
      sortDirection,
      tableData
    )
  }, [tableData, sortBy, sortDirection, selectedFeatures, tableSelectedNodeIds.length])

  // Show loading indicator during initial fetch
  if (isLoading && (!tableData || !tableData.features || tableData.features.length === 0)) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      </div>
    )
  }

  // If no data or no explainers selected (and not loading)
  if (!tableData || !tableData.features || tableData.features.length === 0 || selectedExplainers.size === 0) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content" ref={tableContainerRef}>
          <p className="table-panel__placeholder">
            Select LLM explainers from the flowchart to view feature-level scoring data
          </p>
        </div>
      </div>
    )
  }

  // Get list of explainer IDs for iteration
  const explainerIds = tableData.explainer_ids || []

  // Render new simplified table with 3 sub-rows per feature
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Selection Header - shown when nodes are selected */}
      {tableSelectedNodeIds.length > 0 && (
        <div className="table-panel__selection-header">
          <span className="table-panel__selection-count">
            {sortedFeatures.length.toLocaleString()} / {tableData?.features.length.toLocaleString() || 0} features
          </span>
          <button
            className="table-panel__clear-selection"
            onClick={clearNodeSelection}
            title="Clear selection and show all features"
          >
            Clear ×
          </button>
        </div>
      )}

      <div
        className={`table-panel__content ${isLoading ? 'loading' : ''}`}
        ref={tableContainerRef}
      >
        <table className="table-panel__table table-panel__table--simple">
          <thead className="table-panel__thead">
            <tr className="table-panel__header-row">
              <th className="table-panel__header-cell table-panel__header-cell--index">
                {/* Empty header - no text */}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--id"
                onClick={() => handleSort('featureId')}
              >
                ID
                {sortBy === 'featureId' && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort(METRIC_FEATURE_SPLITTING)}
                title="Feature Splitting"
              >
                FS
                {sortBy === METRIC_FEATURE_SPLITTING && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort(METRIC_SEMANTIC_SIMILARITY)}
                title="Semantic Similarity"
              >
                SS
                {sortBy === METRIC_SEMANTIC_SIMILARITY && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort(METRIC_QUALITY_SCORE)}
                title="Quality Score"
              >
                QS
                {sortBy === METRIC_QUALITY_SCORE && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explanation">
                Explanation
                <span className="table-panel__highlight-legend">
                  <span className="table-panel__highlight-legend-prefix">Segment similarity:</span>
                  <span className="table-panel__highlight-legend-item">
                    <span className="table-panel__highlight-legend-swatch" style={{ backgroundColor: 'rgba(22, 163, 74, 1.0)' }} />
                    <span className="table-panel__highlight-legend-label">0.85-1.0</span>
                  </span>
                  <span className="table-panel__highlight-legend-item">
                    <span className="table-panel__highlight-legend-swatch" style={{ backgroundColor: 'rgba(22, 163, 74, 0.7)' }} />
                    <span className="table-panel__highlight-legend-label">0.7-0.85</span>
                  </span>
                </span>
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--empty">
                {/* Empty column for future use */}
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {sortedFeatures.map((featureRow: FeatureTableRow, featureIndex: number) => {
              // Count explainers with valid data for this feature (for correct rowSpan)
              const validExplainerIds = explainerIds.filter(explainerId => {
                const data = featureRow.explainers[explainerId]
                return data !== undefined && data !== null
              })

              // Skip features with no valid explainers
              if (validExplainerIds.length === 0) return null

              // Check if this feature is being hovered
              const isFeatureHovered = hoveredFeatureId === featureRow.feature_id

              return (
              <React.Fragment key={featureRow.feature_id}>
                {/* Unified explanation popover for this feature row - shown above */}
                {isFeatureHovered && (
                  <tr className="table-panel__popover-row">
                    <td colSpan={8} className={`table-panel__popover-cell table-panel__popover-cell--${popoverPosition}`}>
                      <div className="table-panel__explanation-popover" style={{ maxHeight: `${popoverMaxHeight}px`, width: `${popoverMaxHeight}px`, left: `${popoverLeft}px` }}>
                        {validExplainerIds.map((explId) => {
                          const explData = featureRow.explainers[explId]
                          if (!explData) return null

                          const explanation = explData.highlighted_explanation
                          const plainText = explData.explanation_text ?? '-'

                          return (
                            <div key={explId} className="table-panel__popover-explanation">
                              <div className="table-panel__popover-explainer-name">
                                {getExplainerDisplayName(explId)}:
                              </div>
                              <div className="table-panel__popover-text">
                                {explanation ? (
                                  <HighlightedExplanation
                                    segments={explanation.segments}
                                    explainerNames={['Llama', 'Qwen', 'OpenAI']}
                                    truncated={false}
                                  />
                                ) : (
                                  plainText
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                {/* Quality score breakdown popover - shown when hovering */}
                {hoveredQualityScore === featureRow.feature_id && tableData && (
                  <tr className="table-panel__quality-popover-row">
                    <td colSpan={8} className={`table-panel__quality-popover-cell table-panel__quality-popover-cell--${qualityScorePopoverPosition}`}>
                      <QualityScoreBreakdown
                        feature={featureRow}
                        globalStats={tableData.global_stats}
                      />
                    </td>
                  </tr>
                )}
                {/* Calculate quality score stats once per feature (for pill visualization) */}
                {(() => {
                  const qualityScoreStats = calculateQualityScoreStats(featureRow, tableData.global_stats)

                  return validExplainerIds.map((explainerId, explainerIdx) => {
                    const explainerData = featureRow.explainers[explainerId]
                    // explainerData should always exist here due to filter above, but keep check for safety
                    if (!explainerData) return null

                    // Get explanation text (safely handle null/undefined)
                    const explanationText = explainerData.explanation_text ?? '-'
                    const highlightedExplanation = explainerData.highlighted_explanation

                  return (
                    <tr
                      key={`${featureRow.feature_id}-${explainerId}`}
                      className={`table-panel__sub-row ${explainerIdx === 0 ? 'table-panel__sub-row--first' : ''}`}
                    >
                      {/* Index - only show on first sub-row */}
                      {explainerIdx === 0 && (
                        <td
                          className="table-panel__cell table-panel__cell--index"
                          rowSpan={validExplainerIds.length}
                        >
                          {featureIndex + 1}
                        </td>
                      )}

                      {/* Feature ID - only show on first sub-row */}
                      {explainerIdx === 0 && (
                        <td
                          className="table-panel__cell table-panel__cell--id"
                          rowSpan={validExplainerIds.length}
                        >
                          {featureRow.feature_id}
                        </td>
                      )}

                      {/* Feature Splitting column - Simple circle (only on first sub-row) */}
                      {explainerIdx === 0 && (
                        <td
                          className="table-panel__cell table-panel__cell--score"
                          rowSpan={validExplainerIds.length}
                          title={featureRow.feature_splitting !== null && featureRow.feature_splitting !== undefined
                            ? `Feature Splitting: ${featureRow.feature_splitting.toFixed(3)}`
                            : 'No data'}
                        >
                          {featureRow.feature_splitting !== null && featureRow.feature_splitting !== undefined ? (
                            <svg width="16" height="16" style={{ display: 'block', margin: '0 auto' }}>
                              <circle
                                cx="8"
                                cy="8"
                                r="7"
                                fill={getMetricColor('feature_splitting', featureRow.feature_splitting)}
                                stroke="none"
                              />
                            </svg>
                          ) : (
                            <span className="table-panel__no-data">-</span>
                          )}
                        </td>
                      )}

                      {/* Semantic Similarity column - Pill with range (only on first sub-row) */}
                      {explainerIdx === 0 && (() => {
                        const simStats = calculateAvgSemanticSimilarity(featureRow)

                        return (
                          <td
                            className="table-panel__cell table-panel__cell--score"
                            rowSpan={validExplainerIds.length}
                            title={simStats
                              ? `Semantic Similarity: ${simStats.avg.toFixed(3)} (${simStats.min.toFixed(3)} - ${simStats.max.toFixed(3)})`
                              : 'No data'}
                            style={{ position: 'relative' }}
                          >
                            {simStats ? (
                              <svg width="20" height="100%" viewBox={`0 0 20 ${cellHeight}`} style={{ display: 'block' }}>
                                {(() => {
                                  const svgHeight = cellHeight
                                  const centerY = svgHeight / 2
                                  const scaleFactor = svgHeight / 1

                                  const maxDeviation = (simStats.max - simStats.avg) * scaleFactor
                                  const minDeviation = (simStats.avg - simStats.min) * scaleFactor

                                  const topY = centerY - maxDeviation
                                  const bottomY = centerY + minDeviation
                                  const color = getMetricColor('semantic_similarity', simStats.avg)

                                  const pillWidth = 14
                                  const pillHeight = pillWidth + bottomY - topY
                                  const pillTop = centerY - pillHeight / 2

                                  return (
                                    <rect
                                      x={10 - pillWidth / 2}
                                      y={pillTop}
                                      width={pillWidth}
                                      height={pillHeight}
                                      rx={pillWidth / 2}
                                      ry={pillWidth / 2}
                                      fill={color}
                                    />
                                  )
                                })()}
                              </svg>
                            ) : (
                              <span className="table-panel__no-data">-</span>
                            )}
                          </td>
                        )
                      })()}

                      {/* Quality Score column - Show ONE merged cell with pill shape (only on first sub-row) */}
                      {explainerIdx === 0 && (
                        <td
                          ref={explainerIdx === 0 && featureIndex === 0 ? qualityScoreCellRef : undefined}
                          className="table-panel__cell table-panel__cell--score"
                          rowSpan={validExplainerIds.length}
                          title={qualityScoreStats ? `Quality Score: ${qualityScoreStats.avg.toFixed(3)} (${qualityScoreStats.min.toFixed(3)} - ${qualityScoreStats.max.toFixed(3)})` : 'No quality score data'}
                          onMouseEnter={(e) => qualityScoreStats && handleQualityScoreHover(featureRow.feature_id, e.currentTarget)}
                          onMouseLeave={() => handleQualityScoreHover(null)}
                          style={{ cursor: qualityScoreStats ? 'pointer' : 'default', position: 'relative' }}
                        >
                          {qualityScoreStats ? (
                            <svg width="20" height="100%" viewBox={`0 0 20 ${cellHeight}`} style={{ display: 'block' }}>
                              {(() => {
                                // Consistent pill scaling: same visual height = same actual range
                                const svgHeight = cellHeight
                                const centerY = svgHeight / 2
                                const scaleFactor = svgHeight / 1

                                const maxDeviation = (qualityScoreStats.max - qualityScoreStats.avg) * scaleFactor
                                const minDeviation = (qualityScoreStats.avg - qualityScoreStats.min) * scaleFactor

                                const topY = centerY - maxDeviation
                                const bottomY = centerY + minDeviation
                                const color = getQualityScoreColor(qualityScoreStats.avg)

                                // Pill shape dimensions
                                const pillWidth = 14
                                const pillHeight = pillWidth + bottomY - topY  // Minimum height = width (becomes circle)
                                const pillTop = centerY - pillHeight / 2  // Center the pill vertically

                                return (
                                  <g>
                                    {/* Pill shape (semicircle-rectangle-semicircle) showing quality score range */}
                                    <rect
                                      x={10 - pillWidth / 2}
                                      y={pillTop}
                                      width={pillWidth}
                                      height={pillHeight}
                                      rx={pillWidth / 2}
                                      ry={pillWidth / 2}
                                      fill={color}
                                    />
                                  </g>
                                )
                              })()}
                            </svg>
                          ) : (
                            <span className="table-panel__no-data">-</span>
                          )}
                        </td>
                      )}

                      {/* Explanation text */}
                      <td
                        className="table-panel__cell table-panel__cell--explanation"
                        title={!highlightedExplanation ? explanationText : undefined}
                        onMouseEnter={(e) => handleFeatureHover(featureRow.feature_id, e.currentTarget.parentElement)}
                        onMouseLeave={() => handleFeatureHover(null)}
                      >
                        {highlightedExplanation ? (
                          <HighlightedExplanation
                            segments={highlightedExplanation.segments}
                            explainerNames={['Llama', 'Qwen', 'OpenAI']}
                            truncated={true}
                          />
                        ) : (
                          explanationText
                        )}
                      </td>

                      {/* Empty cell for future use */}
                      <td className="table-panel__cell table-panel__cell--empty">
                        {/* Reserved for future features */}
                      </td>
                    </tr>
                  )
                })
              })()}
              </React.Fragment>
            )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}

export default TablePanel
