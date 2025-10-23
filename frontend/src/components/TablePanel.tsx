import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow } from '../types'
import {
  calculateOverallScore,
  calculateMinConsistency,
  getScoreValue,
  normalizeScore,
  sortFeatures,
  getExplainerDisplayName
} from '../lib/d3-table-utils'
import {
  getConsistencyColor,
  getOverallScoreColor,
  getMetricColor
} from '../lib/utils'
import {
  METRIC_LLM_SCORER_CONSISTENCY,
  METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
  METRIC_LLM_EXPLAINER_CONSISTENCY,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_EMBEDDING,
  CONSISTENCY_TYPE_NONE
} from '../lib/constants'
import type { ConsistencyType } from '../types'
import { HighlightedExplanation } from './HighlightedExplanation'
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

  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Sorting state from store
  const sortBy = useVisualizationStore(state => state.tableSortBy)
  const sortDirection = useVisualizationStore(state => state.tableSortDirection)
  const setTableSort = useVisualizationStore(state => state.setTableSort)

  // Column display state from store
  const scoreColumnDisplay = useVisualizationStore(state => state.scoreColumnDisplay)
  const consistencyColumnDisplay = useVisualizationStore(state => state.consistencyColumnDisplay)
  const swapMetricDisplay = useVisualizationStore(state => state.swapMetricDisplay)

  // ============================================================================
  // HELPER TYPES AND FUNCTIONS
  // ============================================================================

  // Type for cell expansion state
  type CellType = 'score' | 'consistency'
  type ExpandedCellState = { featureId: number; explainerId: string } | null

  // Helper to get display name for a metric
  const getMetricDisplayName = (metric: string): string => {
    switch(metric) {
      case 'overallScore': return 'Overall Score'
      case 'minConsistency': return 'Min Cons.'
      case METRIC_SCORE_EMBEDDING: return 'Emb.'
      case METRIC_SCORE_FUZZ: return 'Fuzz'
      case METRIC_SCORE_DETECTION: return 'Det.'
      case METRIC_LLM_SCORER_CONSISTENCY: return 'LLM Scorer'
      case METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY: return 'W-E Metric'
      case METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY: return 'C-E Metric'
      case METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY: return 'C-E OvrlScr'
      case METRIC_LLM_EXPLAINER_CONSISTENCY: return 'LLM Explnr'
      default: return metric
    }
  }

  // Generic click-outside hook
  const useClickOutside = (
    isActive: boolean,
    overlayClassName: string,
    onClose: () => void
  ) => {
    useEffect(() => {
      if (!isActive) return

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (target.closest(`.${overlayClassName}`)) return
        onClose()
      }

      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)

      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isActive, overlayClassName, onClose])
  }

  // Helper to render a metric circle
  const renderMetricCircle = (
    label: React.ReactNode,
    _value: number,
    color: string,
    sortKey?: 'overallScore' | 'minConsistency'
      | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION
      | typeof METRIC_LLM_SCORER_CONSISTENCY
      | typeof METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY
      | typeof METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY
      | typeof METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY
      | typeof METRIC_LLM_EXPLAINER_CONSISTENCY
  ) => (
    <div
      className={`table-panel__score-breakdown-item${sortKey ? ' clickable' : ''}`}
      onClick={sortKey ? (e) => { e.stopPropagation(); handleSort(sortKey); } : undefined}
      title={sortKey ? `Click to sort by this metric` : undefined}
    >
      <span className="table-panel__score-breakdown-label">
        {label}
        {sortKey && sortBy === sortKey && (
          <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
        )}
      </span>
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill={color} stroke="#d1d5db" strokeWidth="1" />
      </svg>
    </div>
  )

  // Helper to extract consistency values from explainer data
  const extractConsistencyValues = (explData: any) => {
    // 1. LLM Scorer Consistency (average of fuzz and detection)
    let scorerConsistency: number | null = null
    if (explData.llm_scorer_consistency) {
      const scorerValues: number[] = []
      if (explData.llm_scorer_consistency.fuzz) scorerValues.push(explData.llm_scorer_consistency.fuzz.value)
      if (explData.llm_scorer_consistency.detection) scorerValues.push(explData.llm_scorer_consistency.detection.value)
      if (scorerValues.length > 0) {
        scorerConsistency = scorerValues.reduce((sum, v) => sum + v, 0) / scorerValues.length
      }
    }

    // 2. Within-explanation Metric Consistency
    const metricConsistency = explData.within_explanation_metric_consistency?.value ?? null

    // 3. Cross-explanation Score Consistency (average of embedding, fuzz, detection)
    let crossConsistency: number | null = null
    if (explData.cross_explanation_metric_consistency) {
      const crossValues: number[] = []
      if (explData.cross_explanation_metric_consistency.embedding) {
        crossValues.push(explData.cross_explanation_metric_consistency.embedding.value)
      }
      if (explData.cross_explanation_metric_consistency.fuzz) {
        crossValues.push(explData.cross_explanation_metric_consistency.fuzz.value)
      }
      if (explData.cross_explanation_metric_consistency.detection) {
        crossValues.push(explData.cross_explanation_metric_consistency.detection.value)
      }
      if (crossValues.length > 0) {
        crossConsistency = crossValues.reduce((sum, v) => sum + v, 0) / crossValues.length
      }
    }

    // 4. Cross-explanation Overall Score Consistency
    const crossOverallConsistency = explData.cross_explanation_overall_score_consistency?.value ?? null

    // 5. LLM Explainer Consistency
    const explainerConsistency = explData.llm_explainer_consistency?.value ?? null

    return { scorerConsistency, metricConsistency, crossConsistency, crossOverallConsistency, explainerConsistency }
  }

  // ============================================================================
  // STATE
  // ============================================================================

  // Local state for expanded cells (combined)
  const [expandedScoreCell, setExpandedScoreCell] = useState<ExpandedCellState>(null)
  const [expandedConsistencyCell, setExpandedConsistencyCell] = useState<ExpandedCellState>(null)

  // State for explanation hover interactions
  const [hoveredFeatureId, setHoveredFeatureId] = useState<number | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<'above' | 'below'>('above')
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>(300)
  const [popoverLeft, setPopoverLeft] = useState<number>(0)

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Handle sort click (simplified for new table structure)
  const handleSort = (sortKey: 'featureId' | 'overallScore' | 'minConsistency'
    | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION
    | typeof METRIC_LLM_SCORER_CONSISTENCY
    | typeof METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY
    | typeof METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY
    | typeof METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY
    | typeof METRIC_LLM_EXPLAINER_CONSISTENCY) => {

    // Check if this is a breakdown metric being sorted (not main column metrics)
    const scoreMetrics = [METRIC_SCORE_EMBEDDING, METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION]
    const consistencyMetrics = [
      METRIC_LLM_SCORER_CONSISTENCY,
      METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
      METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
      METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
      METRIC_LLM_EXPLAINER_CONSISTENCY
    ]

    const isScoreMetric = scoreMetrics.includes(sortKey as any)
    const isConsistencyMetric = consistencyMetrics.includes(sortKey as any)
    const isOverallScore = sortKey === 'overallScore'
    const isMinConsistency = sortKey === 'minConsistency'

    // If clicking a breakdown metric or swapped main metric, perform swap
    if (isScoreMetric || isOverallScore) {
      swapMetricDisplay('score', sortKey)
    } else if (isConsistencyMetric || isMinConsistency) {
      swapMetricDisplay('consistency', sortKey)
    }

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

  // Generic cell click handler for both score and consistency
  const handleCellClick = useCallback((
    cellType: CellType,
    featureId: number,
    explainerId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation()

    const expandedCell = cellType === 'score' ? expandedScoreCell : expandedConsistencyCell
    const setExpandedCell = cellType === 'score' ? setExpandedScoreCell : setExpandedConsistencyCell

    // Toggle: if same cell clicked, close it; otherwise open new one
    if (expandedCell?.featureId === featureId && expandedCell?.explainerId === explainerId) {
      setExpandedCell(null)
    } else {
      setExpandedCell({ featureId, explainerId })
    }
  }, [expandedScoreCell, expandedConsistencyCell])

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

  // Click-outside handlers using custom hook
  useClickOutside(!!expandedScoreCell, 'table-panel__score-breakdown-overlay', () => setExpandedScoreCell(null))
  useClickOutside(!!expandedConsistencyCell, 'table-panel__consistency-breakdown-overlay', () => setExpandedConsistencyCell(null))


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
        const _tableElement = container.querySelector('table')
        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight
        }

        const isScrollable = scrollState.scrollHeight > scrollState.clientHeight
        const _scrollPercentage = isScrollable
          ? (scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight) * 100).toFixed(1)
          : '0.0'

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

  // Get rightmost stage feature IDs for filtering
  const getRightmostStageFeatureIds = useVisualizationStore(state => state.getRightmostStageFeatureIds)
  const rightmostFeatureIds = getRightmostStageFeatureIds()

  // Sort features based on current sort settings (using shared utility)
  const sortedFeatures = useMemo(() => {
    let features = tableData?.features || []

    // Filter to only rightmost stage features if available and not all features are present
    if (rightmostFeatureIds && rightmostFeatureIds.size > 0 && rightmostFeatureIds.size < features.length) {
      features = features.filter(f => rightmostFeatureIds.has(f.feature_id))
      console.log(`[TablePanel] Filtered to ${features.length} features from rightmost stage`)
    }

    return sortFeatures(
      features,
      sortBy,
      sortDirection,
      tableData
    )
  }, [tableData, sortBy, sortDirection, rightmostFeatureIds])

  // If no data or no explainers selected
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
                onClick={() => handleSort(scoreColumnDisplay)}
              >
                {getMetricDisplayName(scoreColumnDisplay)}
                {sortBy === scoreColumnDisplay && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--consistency"
                onClick={() => handleSort(consistencyColumnDisplay)}
              >
                {getMetricDisplayName(consistencyColumnDisplay)}
                {sortBy === consistencyColumnDisplay && (
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
                    <td colSpan={6} className={`table-panel__popover-cell table-panel__popover-cell--${popoverPosition}`}>
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
                {validExplainerIds.map((explainerId, explainerIdx) => {
                  const explainerData = featureRow.explainers[explainerId]
                  // explainerData should always exist here due to filter above, but keep check for safety
                  if (!explainerData) return null

                  // Calculate display values based on current column settings
                  let scoreValue: number | null = null
                  let scoreColor = 'transparent'

                  // Get score column value
                  switch(scoreColumnDisplay) {
                    case 'overallScore':
                      scoreValue = calculateOverallScore(
                        explainerData.embedding,
                        explainerData.fuzz,
                        explainerData.detection,
                        tableData.global_stats
                      )
                      scoreColor = scoreValue !== null ? getOverallScoreColor(scoreValue) : 'transparent'
                      break
                    case METRIC_SCORE_EMBEDDING:
                      scoreValue = getScoreValue(featureRow, explainerId, METRIC_SCORE_EMBEDDING)
                      if (scoreValue !== null && tableData.global_stats.embedding) {
                        const normalized = normalizeScore(scoreValue, tableData.global_stats.embedding)
                        scoreColor = normalized !== null ? getMetricColor('embedding', normalized) : 'transparent'
                      }
                      break
                    case METRIC_SCORE_FUZZ:
                      scoreValue = getScoreValue(featureRow, explainerId, METRIC_SCORE_FUZZ)
                      if (scoreValue !== null && tableData.global_stats.fuzz) {
                        const normalized = normalizeScore(scoreValue, tableData.global_stats.fuzz)
                        scoreColor = normalized !== null ? getMetricColor('fuzz', normalized) : 'transparent'
                      }
                      break
                    case METRIC_SCORE_DETECTION:
                      scoreValue = getScoreValue(featureRow, explainerId, METRIC_SCORE_DETECTION)
                      if (scoreValue !== null && tableData.global_stats.detection) {
                        const normalized = normalizeScore(scoreValue, tableData.global_stats.detection)
                        scoreColor = normalized !== null ? getMetricColor('detection', normalized) : 'transparent'
                      }
                      break
                  }

                  // Get consistency column value
                  let consistencyValue: number | null = null
                  let consistencyColor = 'transparent'
                  let consistencyType: ConsistencyType = CONSISTENCY_TYPE_NONE

                  switch(consistencyColumnDisplay) {
                    case 'minConsistency': {
                      const minResult = calculateMinConsistency(featureRow, explainerId)
                      if (minResult) {
                        consistencyValue = minResult.value
                        consistencyType = minResult.weakestType
                        consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                      }
                      break
                    }
                    case METRIC_LLM_SCORER_CONSISTENCY:
                      // Extract LLM Scorer consistency
                      if (explainerData.llm_scorer_consistency) {
                        const values: number[] = []
                        if (explainerData.llm_scorer_consistency.fuzz) values.push(explainerData.llm_scorer_consistency.fuzz.value)
                        if (explainerData.llm_scorer_consistency.detection) values.push(explainerData.llm_scorer_consistency.detection.value)
                        if (values.length > 0) {
                          consistencyValue = values.reduce((sum, v) => sum + v, 0) / values.length
                          consistencyType = METRIC_LLM_SCORER_CONSISTENCY as ConsistencyType
                          consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                        }
                      }
                      break
                    case METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY:
                      consistencyValue = explainerData.within_explanation_metric_consistency?.value ?? null
                      if (consistencyValue !== null) {
                        consistencyType = METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY as ConsistencyType
                        consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                      }
                      break
                    case METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY:
                      // Average of cross-explanation metric consistencies
                      if (explainerData.cross_explanation_metric_consistency) {
                        const values: number[] = []
                        if (explainerData.cross_explanation_metric_consistency.embedding) {
                          values.push(explainerData.cross_explanation_metric_consistency.embedding.value)
                        }
                        if (explainerData.cross_explanation_metric_consistency.fuzz) {
                          values.push(explainerData.cross_explanation_metric_consistency.fuzz.value)
                        }
                        if (explainerData.cross_explanation_metric_consistency.detection) {
                          values.push(explainerData.cross_explanation_metric_consistency.detection.value)
                        }
                        if (values.length > 0) {
                          consistencyValue = values.reduce((sum, v) => sum + v, 0) / values.length
                          consistencyType = METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY as ConsistencyType
                          consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                        }
                      }
                      break
                    case METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY:
                      consistencyValue = explainerData.cross_explanation_overall_score_consistency?.value ?? null
                      if (consistencyValue !== null) {
                        consistencyType = METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY as ConsistencyType
                        consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                      }
                      break
                    case METRIC_LLM_EXPLAINER_CONSISTENCY:
                      consistencyValue = explainerData.llm_explainer_consistency?.value ?? null
                      if (consistencyValue !== null) {
                        consistencyType = METRIC_LLM_EXPLAINER_CONSISTENCY as ConsistencyType
                        consistencyColor = getConsistencyColor(consistencyValue, consistencyType)
                      }
                      break
                  }

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

                      {/* Score column (color-coded circle) */}
                      <td
                        className="table-panel__cell table-panel__cell--score"
                        title={scoreValue !== null ? `${getMetricDisplayName(scoreColumnDisplay)}: ${scoreValue.toFixed(3)}` : 'No score data'}
                        onClick={(e) => scoreValue !== null && handleCellClick('score', featureRow.feature_id, explainerId, e)}
                        style={{ cursor: scoreValue !== null ? 'pointer' : 'default' }}
                      >
                        {scoreValue !== null ? (
                          <svg width="16" height="16" viewBox="0 0 16 16">
                            <circle
                              cx="8"
                              cy="8"
                              r="6"
                              fill={scoreColor}
                              stroke="#d1d5db"
                              strokeWidth="1"
                            />
                          </svg>
                        ) : (
                          <span className="table-panel__no-data">-</span>
                        )}

                        {/* Extended score breakdown overlay */}
                        {expandedScoreCell?.featureId === featureRow.feature_id &&
                         expandedScoreCell?.explainerId === explainerId && (
                          <div className="table-panel__score-breakdown-overlay">
                            {/* If a specific metric is displayed in column, show overall score in breakdown */}
                            {scoreColumnDisplay !== 'overallScore' && (() => {
                              const overallScore = calculateOverallScore(
                                explainerData.embedding,
                                explainerData.fuzz,
                                explainerData.detection,
                                tableData.global_stats
                              )
                              if (overallScore === null) return null
                              const color = getOverallScoreColor(overallScore)
                              return renderMetricCircle('Overall', overallScore, color, 'overallScore')
                            })()}

                            {/* Embedding score - show if not currently displayed in column */}
                            {scoreColumnDisplay !== METRIC_SCORE_EMBEDDING && (() => {
                              const embedding = getScoreValue(featureRow, explainerId, METRIC_SCORE_EMBEDDING)
                              if (embedding === null || !tableData.global_stats.embedding) return null

                              const normalized = normalizeScore(embedding, tableData.global_stats.embedding)
                              if (normalized === null) return null

                              return renderMetricCircle('Emb', embedding, getMetricColor('embedding', normalized), METRIC_SCORE_EMBEDDING)
                            })()}

                            {/* Fuzz score - show if not currently displayed in column */}
                            {scoreColumnDisplay !== METRIC_SCORE_FUZZ && (() => {
                              const fuzz = getScoreValue(featureRow, explainerId, METRIC_SCORE_FUZZ)
                              if (fuzz === null || !tableData.global_stats.fuzz) return null

                              const normalized = normalizeScore(fuzz, tableData.global_stats.fuzz)
                              if (normalized === null) return null

                              return renderMetricCircle('Fuzz', fuzz, getMetricColor('fuzz', normalized), METRIC_SCORE_FUZZ)
                            })()}

                            {/* Detection score - show if not currently displayed in column */}
                            {scoreColumnDisplay !== METRIC_SCORE_DETECTION && (() => {
                              const detection = getScoreValue(featureRow, explainerId, METRIC_SCORE_DETECTION)
                              if (detection === null || !tableData.global_stats.detection) return null

                              const normalized = normalizeScore(detection, tableData.global_stats.detection)
                              if (normalized === null) return null

                              return renderMetricCircle('Det', detection, getMetricColor('detection', normalized), METRIC_SCORE_DETECTION)
                            })()}
                          </div>
                        )}
                      </td>

                      {/* Consistency column (color-coded circle) */}
                      <td
                        className="table-panel__cell table-panel__cell--consistency"
                        title={consistencyValue !== null ? `${getMetricDisplayName(consistencyColumnDisplay)}: ${consistencyValue.toFixed(3)}` : 'No consistency data'}
                        onClick={(e) => consistencyValue !== null && handleCellClick('consistency', featureRow.feature_id, explainerId, e)}
                        style={{ cursor: consistencyValue !== null ? 'pointer' : 'default' }}
                      >
                        {consistencyValue !== null ? (
                          <svg width="16" height="16" viewBox="0 0 16 16">
                            <circle
                              cx="8"
                              cy="8"
                              r="6"
                              fill={consistencyColor}
                              stroke="#d1d5db"
                              strokeWidth="1"
                            />
                          </svg>
                        ) : (
                          <span className="table-panel__no-data">-</span>
                        )}

                        {/* Extended consistency breakdown overlay */}
                        {expandedConsistencyCell?.featureId === featureRow.feature_id &&
                         expandedConsistencyCell?.explainerId === explainerId && (() => {
                          const explData = featureRow.explainers[explainerId]
                          if (!explData) return null

                          const { scorerConsistency, metricConsistency, crossConsistency, crossOverallConsistency, explainerConsistency } = extractConsistencyValues(explData)

                          return (
                            <div className="table-panel__consistency-breakdown-overlay">
                              {/* If a specific consistency is displayed in column, show min consistency in breakdown */}
                              {consistencyColumnDisplay !== 'minConsistency' && (() => {
                                const minResult = calculateMinConsistency(featureRow, explainerId)
                                if (!minResult) return null
                                const color = getConsistencyColor(minResult.value, minResult.weakestType)
                                return renderMetricCircle(<>Min<br />Cons.</>, minResult.value, color, 'minConsistency')
                              })()}

                              {/* Show other consistency metrics except the one currently displayed */}
                              {consistencyColumnDisplay !== METRIC_LLM_SCORER_CONSISTENCY && scorerConsistency !== null &&
                                renderMetricCircle(<>LLM<br />Scorer</>, scorerConsistency, getConsistencyColor(scorerConsistency, METRIC_LLM_SCORER_CONSISTENCY), METRIC_LLM_SCORER_CONSISTENCY)}
                              {consistencyColumnDisplay !== METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY && metricConsistency !== null &&
                                renderMetricCircle(<>Within-Exp<br />Metric</>, metricConsistency, getConsistencyColor(metricConsistency, METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY), METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY)}
                              {consistencyColumnDisplay !== METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY && crossConsistency !== null &&
                                renderMetricCircle(<>Cross-Exp<br />Metric</>, crossConsistency, getConsistencyColor(crossConsistency, METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY), METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY)}
                              {consistencyColumnDisplay !== METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY && crossOverallConsistency !== null &&
                                renderMetricCircle(<>Cross-Exp<br />OvrlScr</>, crossOverallConsistency, getConsistencyColor(crossOverallConsistency, METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY), METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY)}
                              {consistencyColumnDisplay !== METRIC_LLM_EXPLAINER_CONSISTENCY && explainerConsistency !== null &&
                                renderMetricCircle(<>LLM<br />EXPLNR</>, explainerConsistency, getConsistencyColor(explainerConsistency, METRIC_LLM_EXPLAINER_CONSISTENCY), METRIC_LLM_EXPLAINER_CONSISTENCY)}
                            </div>
                          )
                        })()}
                      </td>

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
                })}
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
