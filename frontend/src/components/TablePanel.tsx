import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow } from '../types'
import {
  calculateOverallScore,
  calculateMinConsistency,
  getConsistencyColor,
  getOverallScoreColor,
  getScoreValue,
  getMetricColor,
  normalizeScore,
  sortFeatures,
  getExplainerDisplayName
} from '../lib/d3-table-utils'
import {
  METRIC_LLM_SCORER_CONSISTENCY,
  METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
  METRIC_LLM_EXPLAINER_CONSISTENCY
} from '../lib/constants'
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

  // ============================================================================
  // HELPER TYPES AND FUNCTIONS
  // ============================================================================

  // Type for cell expansion state
  type CellType = 'score' | 'consistency'
  type ExpandedCellState = { featureId: number; explainerId: string } | null

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
  const renderMetricCircle = (label: string, value: number, color: string) => (
    <div className="table-panel__score-breakdown-item">
      <span className="table-panel__score-breakdown-label">{label}</span>
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill={color} stroke="#d1d5db" strokeWidth="1" />
      </svg>
      <span className="table-panel__score-breakdown-value">{value.toFixed(3)}</span>
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

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Handle sort click (simplified for new table structure)
  const handleSort = (sortKey: 'featureId' | 'overallScore' | 'minConsistency') => {
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
    const measureAndUpdate = (source: string = 'unknown') => {
      // Cancel any pending measurement
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame to ensure measurement happens after layout
      rafId = requestAnimationFrame(() => {
        const tableElement = container.querySelector('table')
        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight
        }

        const isScrollable = scrollState.scrollHeight > scrollState.clientHeight
        const scrollPercentage = isScrollable
          ? (scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight) * 100).toFixed(1)
          : '0.0'

        console.log(
          `[TablePanel] Measured (${source}):`,
          scrollState,
          `hasTable: ${!!tableElement},`,
          `isScrollable: ${isScrollable},`,
          `scrolled: ${scrollPercentage}%`
        )

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

  // Sort features based on current sort settings (using shared utility)
  const sortedFeatures = useMemo(() => {
    return sortFeatures(
      tableData?.features || [],
      sortBy,
      sortDirection,
      tableData
    )
  }, [tableData, sortBy, sortDirection])

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
              <th
                className="table-panel__header-cell table-panel__header-cell--id"
                onClick={() => handleSort('featureId')}
              >
                ID
                {sortBy === 'featureId' && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explainer">
                LLM Explainer
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort('overallScore')}
              >
                Overall Score
                {sortBy === 'overallScore' && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--consistency"
                onClick={() => handleSort('minConsistency')}
              >
                Min Cons.
                {sortBy === 'minConsistency' && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explanation">
                Explanation
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--empty">
                {/* Empty column for future use */}
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {sortedFeatures.map((featureRow: FeatureTableRow) => (
              <React.Fragment key={featureRow.feature_id}>
                {explainerIds.map((explainerId, explainerIdx) => {
                  const explainerData = featureRow.explainers[explainerId]
                  if (!explainerData) return null

                  // Calculate overall score
                  const overallScore = calculateOverallScore(
                    explainerData.embedding,
                    explainerData.fuzz,
                    explainerData.detection,
                    tableData.global_stats
                  )

                  // Calculate min consistency (returns value + weakest type)
                  const minConsistencyResult = calculateMinConsistency(featureRow, explainerId)

                  // Get colors for score and consistency
                  const scoreColor = overallScore !== null
                    ? getOverallScoreColor(overallScore)
                    : 'transparent'
                  const consistencyColor = minConsistencyResult !== null
                    ? getConsistencyColor(minConsistencyResult.value, minConsistencyResult.weakestType)
                    : 'transparent'

                  // Get explanation text
                  const explanationText = explainerData.explanation_text || '-'

                  return (
                    <tr
                      key={`${featureRow.feature_id}-${explainerId}`}
                      className={`table-panel__sub-row ${explainerIdx === 0 ? 'table-panel__sub-row--first' : ''}`}
                    >
                      {/* Feature ID - only show on first sub-row */}
                      {explainerIdx === 0 && (
                        <td
                          className="table-panel__cell table-panel__cell--id"
                          rowSpan={explainerIds.length}
                        >
                          {featureRow.feature_id}
                        </td>
                      )}

                      {/* LLM Explainer name */}
                      <td className="table-panel__cell table-panel__cell--explainer">
                        {getExplainerDisplayName(explainerId)}
                      </td>

                      {/* Overall score (color-coded circle) */}
                      <td
                        className="table-panel__cell table-panel__cell--score"
                        title={overallScore !== null ? `Overall Score: ${overallScore.toFixed(3)}` : 'No score data'}
                        onClick={(e) => overallScore !== null && handleCellClick('score', featureRow.feature_id, explainerId, e)}
                        style={{ cursor: overallScore !== null ? 'pointer' : 'default' }}
                      >
                        {overallScore !== null ? (
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
                            {/* Embedding score */}
                            {(() => {
                              const embedding = getScoreValue(featureRow, explainerId, 'embedding')
                              if (embedding === null || !tableData.global_stats.embedding) return null

                              const normalized = normalizeScore(embedding, tableData.global_stats.embedding)
                              if (normalized === null) return null

                              return renderMetricCircle('Emb', embedding, getMetricColor('embedding', normalized))
                            })()}

                            {/* Fuzz score (averaged) */}
                            {(() => {
                              const fuzz = getScoreValue(featureRow, explainerId, 'fuzz')
                              if (fuzz === null || !tableData.global_stats.fuzz) return null

                              const normalized = normalizeScore(fuzz, tableData.global_stats.fuzz)
                              if (normalized === null) return null

                              return renderMetricCircle('Fuzz', fuzz, getMetricColor('fuzz', normalized))
                            })()}

                            {/* Detection score (averaged) */}
                            {(() => {
                              const detection = getScoreValue(featureRow, explainerId, 'detection')
                              if (detection === null || !tableData.global_stats.detection) return null

                              const normalized = normalizeScore(detection, tableData.global_stats.detection)
                              if (normalized === null) return null

                              return renderMetricCircle('Det', detection, getMetricColor('detection', normalized))
                            })()}
                          </div>
                        )}
                      </td>

                      {/* Min consistency (color-coded circle) */}
                      <td
                        className="table-panel__cell table-panel__cell--consistency"
                        title={minConsistencyResult !== null ? `Min Consistency: ${minConsistencyResult.value.toFixed(3)}` : 'No consistency data'}
                        onClick={(e) => minConsistencyResult !== null && handleCellClick('consistency', featureRow.feature_id, explainerId, e)}
                        style={{ cursor: minConsistencyResult !== null ? 'pointer' : 'default' }}
                      >
                        {minConsistencyResult !== null ? (
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
                              {scorerConsistency !== null && renderMetricCircle('Scorer', scorerConsistency, getConsistencyColor(scorerConsistency, METRIC_LLM_SCORER_CONSISTENCY))}
                              {metricConsistency !== null && renderMetricCircle('Metric', metricConsistency, getConsistencyColor(metricConsistency, METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY))}
                              {crossConsistency !== null && renderMetricCircle('Cross', crossConsistency, getConsistencyColor(crossConsistency, METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY))}
                              {crossOverallConsistency !== null && renderMetricCircle('OvrlScr', crossOverallConsistency, getConsistencyColor(crossOverallConsistency, METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY))}
                              {explainerConsistency !== null && renderMetricCircle('Explnr', explainerConsistency, getConsistencyColor(explainerConsistency, METRIC_LLM_EXPLAINER_CONSISTENCY))}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Explanation text */}
                      <td
                        className="table-panel__cell table-panel__cell--explanation"
                        title={explanationText}
                      >
                        {explanationText}
                      </td>

                      {/* Empty cell for future use */}
                      <td className="table-panel__cell table-panel__cell--empty">
                        {/* Reserved for future features */}
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TablePanel
