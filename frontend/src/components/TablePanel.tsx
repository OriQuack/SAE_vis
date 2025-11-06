import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableDataResponse } from '../types'
import {
  calculateQualityScoreStats,
  sortFeatures,
  getExplainerDisplayName
} from '../lib/d3-table-utils'
import {
  getMetricColor,
  calculateAvgSemanticSimilarity
} from '../lib/utils'
import {
  getCircleRadius,
  getCircleOpacity,
  formatCircleTooltip
} from '../lib/circle-encoding-utils'
import {
  METRIC_QUALITY_SCORE,
  METRIC_DECODER_SIMILARITY,
  METRIC_SEMANTIC_SIMILARITY,
  CATEGORY_DECODER_SIMILARITY
} from '../lib/constants'
import { HighlightedExplanation } from './HighlightedExplanation'
import ActivationExample from './ActivationExample'
import QualityScoreBreakdown from './QualityScoreBreakdown'
import DecoderSimilarityTable from './DecoderSimilarityTable'
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
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const activeStageCategory = useVisualizationStore(state => state.activeStageCategory)

  // Tag system state
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const toggleFeatureSelection = useVisualizationStore(state => state.toggleFeatureSelection)
  const selectAllFeatures = useVisualizationStore(state => state.selectAllFeatures)
  const clearFeatureSelection = useVisualizationStore(state => state.clearFeatureSelection)
  const getFeatureTags = useVisualizationStore(state => state.getFeatureTags)
  const highlightedFeatureId = useVisualizationStore(state => state.highlightedFeatureId)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const qualityScoreCellRef = useRef<HTMLTableCellElement>(null)

  // Track activation column width to pass to ActivationExample components
  const [activationColumnWidth, setActivationColumnWidth] = useState<number>(630) // Default: 45% of ~1400px

  // Ref map to track row elements for scrolling to highlighted features
  const featureRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())

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
  const [qualityScorePopoverWidth, setQualityScorePopoverWidth] = useState<number>(180)
  const [qualityScorePopoverLeft, setQualityScorePopoverLeft] = useState<number>(0)

  // Activation examples from global store (centralized cache)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Handle sort click
  const handleSort = (sortKey: 'featureId' | typeof METRIC_QUALITY_SCORE | typeof METRIC_DECODER_SIMILARITY | typeof METRIC_SEMANTIC_SIMILARITY) => {
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

      // Find the row element
      const rowElement = cellElement.parentElement as HTMLTableRowElement | null
      if (rowElement) {
        const idCell = rowElement.cells[1] as HTMLTableCellElement | undefined
        const qsCell = rowElement.cells[4] as HTMLTableCellElement | undefined

        if (idCell && qsCell) {
          const fsCellRect = idCell.getBoundingClientRect()
          const qsCellRect = qsCell.getBoundingClientRect()
          const combinedWidth = qsCellRect.right - fsCellRect.left

          const rowRect = rowElement.getBoundingClientRect()
          const leftOffset = fsCellRect.left - rowRect.left

          setQualityScorePopoverWidth(combinedWidth)
          setQualityScorePopoverLeft(leftOffset)
        }
      }

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
    // Note: fetchTableData is a stable Zustand action, no need to include in dependencies
    leftPanel.filters.llm_explainer,
    rightPanel.filters.llm_explainer,
    leftPanel.filters.llm_scorer,
    rightPanel.filters.llm_scorer
  ])

  // Measure activation column width once (eliminates shifting in ActivationExample)
  useEffect(() => {
    if (!tableContainerRef.current) return

    const measureActivationColumn = () => {
      const headerCell = tableContainerRef.current?.querySelector('.table-panel__header-cell--empty')
      if (headerCell) {
        const width = headerCell.getBoundingClientRect().width
        if (width > 0) {
          setActivationColumnWidth(width)
        }
      }
    }

    // Initial measurement
    measureActivationColumn()

    // Watch for table resize
    const observer = new ResizeObserver(measureActivationColumn)
    observer.observe(tableContainerRef.current)

    return () => observer.disconnect()
  }, [])

  // 🚀 NO FETCH NEEDED: Activation examples are pre-fetched by store.fetchTableData()
  // and available instantly from global cache (activationExamples)

  // ============================================================================
  // SORTED FEATURES
  // ============================================================================

  // Get selected node features for filtering
  const leftPanelSankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree)

  // Compute selected features with proper reactive dependencies
  const selectedFeatures = useMemo(() => {
    if (tableSelectedNodeIds.length === 0) {
      return null
    }

    const featureIds = new Set<number>()
    for (const nodeId of tableSelectedNodeIds) {
      const node = leftPanelSankeyTree?.get(nodeId)
      if (node?.featureIds) {
        node.featureIds.forEach((id: number) => featureIds.add(id))
      }
    }

    console.log('[TablePanel] Selected features computed:', {
      nodeCount: tableSelectedNodeIds.length,
      featureCount: featureIds.size
    })

    return featureIds
  }, [tableSelectedNodeIds, leftPanelSankeyTree])

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

  // Get list of explainer IDs for iteration (moved before early returns)
  const explainerIds = tableData?.explainer_ids || []

  // Calculate total row count for row-level virtualization (moved before early returns)
  const totalRowCount = useMemo(() => {
    if (!tableData || sortedFeatures.length === 0) return 0
    return sortedFeatures.reduce((sum, feature) => {
      const validExplainerCount = explainerIds.filter(explainerId => {
        const data = feature.explainers[explainerId]
        return data !== undefined && data !== null
      }).length
      return sum + validExplainerCount
    }, 0)
  }, [sortedFeatures, explainerIds, tableData])

  // Virtual scrolling for performance with large datasets (moved before early returns)
  const rowVirtualizer = useVirtualizer({
    count: totalRowCount,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 16,
    overscan: 15,
  })

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
    const measureAndUpdate = () => {
      // Cancel any pending measurement
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame to ensure measurement happens after layout
      rafId = requestAnimationFrame(() => {
        // Get virtual items to determine visible rows and features
        const virtualItems = rowVirtualizer.getVirtualItems()
        const firstVisibleRowIndex = virtualItems[0]?.index ?? 0
        const lastVisibleRowIndex = virtualItems[virtualItems.length - 1]?.index ?? 0

        // Extract visible feature IDs from visible row range
        const visibleFeatureIds = new Set<number>()
        if (sortedFeatures.length > 0 && explainerIds.length > 0) {
          let currentRowIndex = 0
          for (const feature of sortedFeatures) {
            const validExplainerCount = explainerIds.filter(explainerId => {
              const data = feature.explainers[explainerId]
              return data !== undefined && data !== null
            }).length

            // Check if this feature overlaps with visible row range
            const featureStartRow = currentRowIndex
            const featureEndRow = currentRowIndex + validExplainerCount - 1

            if (featureEndRow >= firstVisibleRowIndex && featureStartRow <= lastVisibleRowIndex) {
              visibleFeatureIds.add(feature.feature_id)
            }

            currentRowIndex += validExplainerCount

            // Early exit if we've passed the visible range
            if (currentRowIndex > lastVisibleRowIndex) break
          }
        }

        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          firstVisibleRowIndex,
          lastVisibleRowIndex,
          totalRowCount,
          visibleFeatureIds
        }

        // Only update state if dimensions are valid (non-zero)
        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          setTableScrollState(scrollState)
        }

        rafId = null
      })
    }

    // 1. Add scroll event listener for user interactions
    const handleScrollEvent = () => measureAndUpdate()
    container.addEventListener('scroll', handleScrollEvent, { passive: true })

    // 2. Observe container for viewport/size changes
    containerObserver = new ResizeObserver(() => measureAndUpdate())
    containerObserver.observe(container)

    // 3. Find and observe inner <table> element (grows when rows are added)
    // Use retry logic to handle React timing issues
    const setupTableObserver = (): boolean => {
      const tableElement = container.querySelector('table')
      if (tableElement && !tableObserver) {
        tableObserver = new ResizeObserver(() => measureAndUpdate())
        tableObserver.observe(tableElement)
        measureAndUpdate()
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
  }, [setTableScrollState, sortedFeatures])  // Re-run when features change

  // Scroll to highlighted feature when it changes (moved before early returns)
  useEffect(() => {
    if (highlightedFeatureId !== null && sortedFeatures.length > 0 && explainerIds.length > 0) {
      const featureIndex = sortedFeatures.findIndex(f => f.feature_id === highlightedFeatureId)
      if (featureIndex !== -1) {
        // Calculate row index by summing rows of all previous features
        let rowIndex = 0
        for (let i = 0; i < featureIndex; i++) {
          const feature = sortedFeatures[i]
          const validCount = explainerIds.filter(explainerId => {
            const data = feature.explainers[explainerId]
            return data !== undefined && data !== null
          }).length
          rowIndex += validCount
        }

        rowVirtualizer.scrollToIndex(rowIndex, {
          align: 'center',
          behavior: 'smooth'
        })
        const timeoutId = setTimeout(() => {
          const setHighlightedFeature = useVisualizationStore.getState().setHighlightedFeature
          setHighlightedFeature(null)
        }, 3000)
        return () => clearTimeout(timeoutId)
      } else {
        console.warn(`[TablePanel] Feature ${highlightedFeatureId} not found in current table view`)
      }
    }
  }, [highlightedFeatureId, sortedFeatures, rowVirtualizer, explainerIds])

  // Check if we should render stage-specific table (moved before other early returns)
  // Use stored category for simple and reliable check
  if (activeStageNodeId && activeStageCategory === CATEGORY_DECODER_SIMILARITY) {
    return <DecoderSimilarityTable className={className} />
  }

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
              {/* Icon button for select all/clear in index column */}
              <th className="table-panel__header-cell table-panel__header-cell--index">
                <button
                  className={`table-panel__select-all-button ${
                    tableData && tableData.features.length > 0 && selectedFeatureIds.size === tableData.features.length
                      ? 'table-panel__select-all-button--all-selected'
                      : ''
                  }`}
                  onClick={() => {
                    if (tableData && tableData.features.length > 0 && selectedFeatureIds.size === tableData.features.length) {
                      clearFeatureSelection()
                    } else {
                      selectAllFeatures()
                    }
                  }}
                  title={
                    tableData && tableData.features.length > 0 && selectedFeatureIds.size === tableData.features.length
                      ? 'Clear all selections'
                      : selectedFeatureIds.size > 0
                      ? 'Select all features'
                      : 'Select all features'
                  }
                >
                  {tableData && tableData.features.length > 0 && selectedFeatureIds.size === tableData.features.length
                    ? '✓'
                    : selectedFeatureIds.size > 0
                    ? '−'
                    : '○'}
                </button>
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
                onClick={() => handleSort(METRIC_DECODER_SIMILARITY)}
                title="Decoder Similarity"
              >
                FS
                {sortBy === METRIC_DECODER_SIMILARITY && (
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
                Activating Example
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {/* Top padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
                <td colSpan={8} />
              </tr>
            )}

            {/* Render only visible virtual items */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              // Map virtual row index to feature and explainer
              let currentRowIndex = 0
              let featureIndex = -1
              let explainerIndexInFeature = -1
              let featureRow = null
              let validExplainerIds: string[] = []

              for (let i = 0; i < sortedFeatures.length; i++) {
                const feature = sortedFeatures[i]
                const validIds = explainerIds.filter(explainerId => {
                  const data = feature.explainers[explainerId]
                  return data !== undefined && data !== null
                })

                if (currentRowIndex + validIds.length > virtualRow.index) {
                  // This feature contains the virtual row
                  featureIndex = i
                  featureRow = feature
                  validExplainerIds = validIds
                  explainerIndexInFeature = virtualRow.index - currentRowIndex
                  break
                }

                currentRowIndex += validIds.length
              }

              // Skip if we couldn't find the mapping
              if (!featureRow || explainerIndexInFeature === -1) return null

              const isFirstRowOfFeature = explainerIndexInFeature === 0
              const isFeatureHovered = hoveredFeatureId === featureRow.feature_id

              // Only render popovers on first row of feature
              return (
              <React.Fragment key={`${featureRow.feature_id}-${explainerIndexInFeature}`}>
                {/* Unified explanation popover for this feature row - shown above (only on first row) */}
                {isFirstRowOfFeature && isFeatureHovered && (
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
                {/* Quality score breakdown popover - shown when hovering (only on first row) */}
                {isFirstRowOfFeature && hoveredQualityScore === featureRow.feature_id && tableData && (
                  <tr className="table-panel__quality-popover-row">
                    <td colSpan={8} className={`table-panel__quality-popover-cell table-panel__quality-popover-cell--${qualityScorePopoverPosition}`}>
                      <div
                        className="table-panel__quality-breakdown-container"
                        style={{
                          width: `${qualityScorePopoverWidth}px`,
                          left: `${qualityScorePopoverLeft}px`
                        }}
                      >
                        <QualityScoreBreakdown
                          feature={featureRow}
                          globalStats={tableData.global_stats}
                          width={qualityScorePopoverWidth}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                {/* Render single row for current explainer */}
                {(() => {
                  const explainerId = validExplainerIds[explainerIndexInFeature]
                  const explainerData = featureRow.explainers[explainerId]
                  if (!explainerData) return null

                  const qualityScoreStats = calculateQualityScoreStats(featureRow, tableData.global_stats)
                  const explanationText = explainerData.explanation_text ?? '-'
                  const highlightedExplanation = explainerData.highlighted_explanation

                  return (
                    <tr
                      key={`${featureRow.feature_id}-${explainerId}`}
                      ref={isFirstRowOfFeature ? (el) => {
                        if (el) {
                          featureRowRefs.current.set(featureRow.feature_id, el)
                        } else {
                          featureRowRefs.current.delete(featureRow.feature_id)
                        }
                      } : undefined}
                      className={`table-panel__sub-row ${isFirstRowOfFeature ? 'table-panel__sub-row--first' : ''} ${highlightedFeatureId === featureRow.feature_id ? 'table-panel__sub-row--highlighted' : ''} ${selectedFeatureIds.has(featureRow.feature_id) ? 'table-panel__sub-row--selected' : ''}`}
                    >
                      {/* Index - shows checkmark if selected, otherwise row number */}
                      {isFirstRowOfFeature && (
                        <td
                          className="table-panel__cell table-panel__cell--index"
                          rowSpan={validExplainerIds.length}
                          onClick={() => toggleFeatureSelection(featureRow.feature_id)}
                          title="Click to select/deselect feature"
                        >
                          {selectedFeatureIds.has(featureRow.feature_id) ? (
                            <span className="table-panel__selection-indicator">✓</span>
                          ) : (
                            featureIndex + 1
                          )}
                        </td>
                      )}

                      {/* Feature ID - only show on first sub-row */}
                      {isFirstRowOfFeature && (
                        <td
                          className="table-panel__cell table-panel__cell--id"
                          rowSpan={validExplainerIds.length}
                          onClick={() => toggleFeatureSelection(featureRow.feature_id)}
                          title="Click to select/deselect feature"
                          style={{ position: 'relative' }}
                        >
                          {(() => {
                            const featureTags = getFeatureTags(featureRow.feature_id)
                            if (featureTags.length > 0) {
                              return (
                                <>
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '0.25rem',
                                      left: '50%',
                                      transform: 'translateX(-50%)',
                                      display: 'flex',
                                      gap: '0.125rem',
                                      pointerEvents: 'none'
                                    }}
                                    title={featureTags.map(t => t.name).join(', ')}
                                  >
                                    {featureTags.map((_, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          width: '0.375rem',
                                          height: '0.375rem',
                                          borderRadius: '50%',
                                          backgroundColor: '#000000',
                                          cursor: 'help',
                                          pointerEvents: 'auto'
                                        }}
                                      />
                                    ))}
                                  </div>
                                  {featureRow.feature_id}
                                </>
                              )
                            }
                            return featureRow.feature_id
                          })()}
                        </td>
                      )}

                      {/* Decoder Similarity column - Size-encoded circle (only on first sub-row) */}
                      {isFirstRowOfFeature && (() => {
                        const decoderSim = featureRow.decoder_similarity !== null && featureRow.decoder_similarity !== undefined
                          ? Number(featureRow.decoder_similarity)
                          : null

                        return (
                          <td
                            className="table-panel__cell table-panel__cell--score"
                            rowSpan={validExplainerIds.length}
                            title={decoderSim !== null && !isNaN(decoderSim)
                              ? `Decoder Similarity: ${decoderSim.toFixed(3)}\nSize = score | Opacity = consistency (single value)`
                              : 'No data'}
                          >
                            {decoderSim !== null && !isNaN(decoderSim) ? (
                              <svg width="32" height="32" style={{ display: 'block', margin: '0 auto' }}>
                                <circle
                                  cx="16"
                                  cy="16"
                                  r={getCircleRadius(decoderSim)}
                                  fill={getMetricColor('decoder_similarity', decoderSim, true)}
                                  opacity={1.0}
                                  stroke="none"
                                />
                              </svg>
                            ) : (
                              <span className="table-panel__no-data">-</span>
                            )}
                          </td>
                        )
                      })()}

                      {/* Semantic Similarity column - Size-encoded circle with opacity for consistency (only on first sub-row) */}
                      {isFirstRowOfFeature && (() => {
                        const simStats = calculateAvgSemanticSimilarity(featureRow)

                        return (
                          <td
                            className="table-panel__cell table-panel__cell--score"
                            rowSpan={validExplainerIds.length}
                            title={simStats
                              ? formatCircleTooltip('Semantic Similarity', simStats, false)
                              : 'No data'}
                          >
                            {simStats ? (
                              <svg width="32" height="32" style={{ display: 'block', margin: '0 auto' }}>
                                <circle
                                  cx="16"
                                  cy="16"
                                  r={getCircleRadius(simStats.avg)}
                                  fill={getMetricColor('semantic_similarity', simStats.avg, true)}
                                  opacity={getCircleOpacity(simStats)}
                                  stroke="none"
                                />
                              </svg>
                            ) : (
                              <span className="table-panel__no-data">-</span>
                            )}
                          </td>
                        )
                      })()}

                      {/* Quality Score column - Size-encoded circle with opacity for consistency (only on first sub-row) */}
                      {isFirstRowOfFeature && (
                        <td
                          ref={isFirstRowOfFeature && featureIndex === 0 ? qualityScoreCellRef : undefined}
                          className="table-panel__cell table-panel__cell--score"
                          rowSpan={validExplainerIds.length}
                          title={qualityScoreStats
                            ? formatCircleTooltip('Quality Score', qualityScoreStats, false)
                            : 'No quality score data'}
                          onMouseEnter={(e) => qualityScoreStats && handleQualityScoreHover(featureRow.feature_id, e.currentTarget)}
                          onMouseLeave={() => handleQualityScoreHover(null)}
                          style={{ cursor: qualityScoreStats ? 'pointer' : 'default', position: 'relative' }}
                        >
                          {qualityScoreStats ? (
                            <svg width="32" height="32" style={{ display: 'block', margin: '0 auto' }}>
                              <circle
                                cx="16"
                                cy="16"
                                r={getCircleRadius(qualityScoreStats.avg)}
                                fill="#1f2937"
                                opacity={getCircleOpacity(qualityScoreStats)}
                                stroke="none"
                              />
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

                      {/* Activation Example column */}
                      {isFirstRowOfFeature && (
                        <td
                          className="table-panel__cell"
                          rowSpan={validExplainerIds.length}
                        >
                          {activationExamples[featureRow.feature_id] ? (
                            <ActivationExample
                              examples={activationExamples[featureRow.feature_id]}
                              containerWidth={activationColumnWidth}
                            />
                          ) : (
                            <span className="table-panel__placeholder">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })()}
              </React.Fragment>
            )})}

            {/* Bottom padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{
                height: `${
                  rowVirtualizer.getTotalSize() -
                  (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0)
                }px`
              }}>
                <td colSpan={8} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}

export default TablePanel
