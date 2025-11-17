import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableDataResponse, SortBy } from '../types'
import {
  getExplainerDisplayName,
  findMaxQualityScoreExplainer,
  sortFeatures
} from '../lib/table-utils'
import {
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_SCORE_FUZZ,
  SELECTION_CATEGORY_COLORS
} from '../lib/constants'
import {
  getRowStyleProperties
} from '../lib/table-color-utils'
import type { ScoreStats } from '../lib/circle-encoding-utils'
import ScoreCircle, { TagBadge } from './TableIndicators'
import { HighlightedExplanation } from './TableExplanation'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORIES, getBadgeColors, TAG_CATEGORY_TABLE_TITLES, TAG_CATEGORY_TABLE_INSTRUCTIONS } from '../lib/tag-constants'
import ActivationExample from './TableActivationExample'
import TableSelectionPanel from './TableSelectionPanel'
import SimilarityTaggingPopover from './TagAutomaticPopover'
import '../styles/QualityTable.css'
import '../styles/CauseTable.css'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert cause category to tag name for TagBadge
 */
function getCauseTagName(cause: 'noisy-activation' | 'missed-lexicon' | 'missed-context' | null): string {
  if (cause === 'noisy-activation') return 'Noisy Activation'
  if (cause === 'missed-lexicon') return 'Missed Lexicon'
  if (cause === 'missed-context') return 'Missed Context'
  return 'Unsure'
}

/**
 * Convert cause category to selection state for TagBadge
 */
function getCauseSelectionState(cause: 'noisy-activation' | 'missed-lexicon' | 'missed-context' | null): 'selected' | null {
  return cause ? 'selected' : null
}

// ============================================================================
// MAIN CAUSE TABLE PANEL COMPONENT
// ============================================================================

interface CauseTablePanelProps {
  className?: string
}

const CauseTablePanel: React.FC<CauseTablePanelProps> = ({ className = '' }) => {
  const tableData = useVisualizationStore(state => state.tableData) as FeatureTableDataResponse | null
  const isLoading = useVisualizationStore(state => state.loading.table)
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization)

  // Cause category selection state
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const toggleCauseCategory = useVisualizationStore(state => state.toggleCauseCategory)

  // Activation examples from global store
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Sorting state from global store
  const sortBy = useVisualizationStore(state => state.tableSortBy)
  const sortDirection = useVisualizationStore(state => state.tableSortDirection)
  const setTableSort = useVisualizationStore(state => state.setTableSort)
  const causeCategoryConfidences = useVisualizationStore(state => state.causeCategoryConfidences)
  const causeSortCategory = useVisualizationStore(state => state.causeSortCategory)

  // Table actions
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Node selection for table filtering
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Track activation column width
  const [activationColumnWidth, setActivationColumnWidth] = useState<number>(630)

  // Explanation popover state
  const [showExplanationPopover, setShowExplanationPopover] = useState<{
    featureId: number
    validExplainerIds: string[]
    featureRow: any
    position?: 'above' | 'below'
  } | null>(null)

  // ============================================================================
  // DATA PROCESSING
  // ============================================================================

  // Get list of selected explainers
  const selectedExplainers = useMemo(() => {
    if (!tableData) return new Set<string>()
    return new Set(tableData.explainer_ids)
  }, [tableData])

  // Get the left panel sankey tree to access node feature IDs
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree)

  // Get badge labels and colors from tag categories
  const causeConfig = useMemo(() => {
    const colors = getBadgeColors(TAG_CATEGORY_CAUSE)
    const category = TAG_CATEGORIES[TAG_CATEGORY_CAUSE]

    // Map state names to tag labels and colors
    // tags array: ["Missed Context", "Missed Lexicon", "Noisy Activation", "Unsure"]
    return {
      'noisy-activation': {
        label: category.tags[2], // "Noisy Activation"
        color: colors[category.tags[2]] || '#f97316'
      },
      'missed-lexicon': {
        label: category.tags[1], // "Missed Lexicon"
        color: colors[category.tags[1]] || '#a855f7'
      },
      'missed-context': {
        label: category.tags[0], // "Missed Context"
        color: colors[category.tags[0]] || '#3b82f6'
      }
    }
  }, [])  // No dependencies needed - colors are pre-computed at module load

  // Collect feature IDs from all selected nodes (for filtering)
  const selectedFeatures = useMemo(() => {
    if (tableSelectedNodeIds.length === 0) {
      return null
    }

    const featureIds = new Set<number>()
    for (const nodeId of tableSelectedNodeIds) {
      const node = sankeyTree?.get(nodeId)
      if (node?.featureIds) {
        node.featureIds.forEach((id: number) => featureIds.add(id))
      }
    }

    console.log('[CauseTablePanel] Selected features computed:', {
      nodeCount: tableSelectedNodeIds.length,
      featureCount: featureIds.size
    })

    return featureIds
  }, [tableSelectedNodeIds, sankeyTree])

  // ============================================================================
  // SORTING
  // ============================================================================

  // Handle column sort click (3-state cycle: null → asc → desc → null)
  const handleSort = (sortKey: SortBy) => {
    if (sortBy === sortKey) {
      // Same column: cycle through states
      if (sortDirection === null) {
        setTableSort(sortKey, 'asc')
      } else if (sortDirection === 'asc') {
        setTableSort(sortKey, 'desc')
      } else {
        // Reset to no sort
        setTableSort(null, null)
      }
    } else {
      // New column: start with ascending
      setTableSort(sortKey, 'asc')
    }
  }

  // Apply filtering and sorting
  const sortedFeatures = useMemo(() => {
    let features = tableData?.features || []

    // Filter by selected node features if any nodes are selected
    if (selectedFeatures && selectedFeatures.size > 0) {
      features = features.filter(f => selectedFeatures.has(f.feature_id))
      console.log(`[CauseTablePanel] Filtered to ${features.length} features from ${tableSelectedNodeIds.length} selected node(s)`)
    }

    // Apply sorting
    if (!tableData) return features

    // Handle cause_similarity sorting separately (uses causeCategoryConfidences from store)
    if (sortBy === 'cause_similarity' && sortDirection) {
      const sorted = [...features].sort((a, b) => {
        const confidencesA = causeCategoryConfidences.get(a.feature_id)
        const confidencesB = causeCategoryConfidences.get(b.feature_id)

        // Calculate score based on selected category or max confidence
        let scoreA = -Infinity
        let scoreB = -Infinity

        if (confidencesA) {
          if (causeSortCategory && confidencesA[causeSortCategory] !== undefined) {
            // Sort by selected category
            scoreA = confidencesA[causeSortCategory]
          } else {
            // Sort by maximum confidence across all categories
            scoreA = Math.max(...Object.values(confidencesA))
          }
        }

        if (confidencesB) {
          if (causeSortCategory && confidencesB[causeSortCategory] !== undefined) {
            // Sort by selected category
            scoreB = confidencesB[causeSortCategory]
          } else {
            // Sort by maximum confidence across all categories
            scoreB = Math.max(...Object.values(confidencesB))
          }
        }

        return sortDirection === 'asc' ? scoreA - scoreB : scoreB - scoreA
      })
      return sorted
    }

    return sortFeatures(features, sortBy, sortDirection, tableData)
  }, [tableData, selectedFeatures, tableSelectedNodeIds.length, sortBy, sortDirection, causeCategoryConfidences, causeSortCategory])

  const totalRowCount = sortedFeatures.length

  // ============================================================================
  // VIRTUAL SCROLLING
  // ============================================================================

  const rowVirtualizer = useVirtualizer({
    count: totalRowCount,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 54, // Fixed row height
    overscan: 5,
  })

  // ============================================================================
  // MEASURE ACTIVATION COLUMN WIDTH
  // ============================================================================

  useEffect(() => {
    if (!tableContainerRef.current) return

    const measureActivationColumn = () => {
      const headerCell = tableContainerRef.current?.querySelector(
        '.table-panel__header-cell--activation-example'
      )
      if (headerCell) {
        setActivationColumnWidth(headerCell.getBoundingClientRect().width)
      }
    }

    measureActivationColumn()

    const observer = new ResizeObserver(measureActivationColumn)
    if (tableContainerRef.current) {
      observer.observe(tableContainerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Detect whether explanation popover should appear above or below the cell
   */
  const detectExplanationPopoverPosition = (cell: HTMLElement): 'above' | 'below' => {
    const rect = cell.getBoundingClientRect()
    const container = tableContainerRef.current
    if (!container) return 'below'

    const containerRect = container.getBoundingClientRect()
    const spaceBelow = containerRect.bottom - rect.bottom
    const spaceAbove = rect.top - containerRect.top

    // If more space above and below is tight, show above
    if (spaceAbove > spaceBelow && spaceBelow < 300) {
      return 'above'
    }

    return 'below'
  }

  /**
   * Calculate score statistics for opacity encoding
   */
  const calculateScoreStats = (scores: { s1: number | null; s2: number | null; s3: number | null }): ScoreStats | null => {
    const validScores = [scores.s1, scores.s2, scores.s3].filter(s => s !== null) as number[]
    if (validScores.length === 0) return null

    const avg = validScores.reduce((sum, s) => sum + s, 0) / validScores.length
    const min = Math.min(...validScores)
    const max = Math.max(...validScores)

    return { avg, min, max }
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  /**
   * Render a score circle with size/opacity encoding
   */
  const renderScoreCircle = (
    score: number | null,
    scoreStats: ScoreStats | null,
    metricName: string
  ) => {
    return (
      <ScoreCircle
        score={score}
        scoreStats={scoreStats}
        tooltipText={
          score !== null && scoreStats
            ? `${metricName}: ${score.toFixed(3)}\nRange: [${scoreStats.min.toFixed(3)}, ${scoreStats.max.toFixed(3)}]\nSize = score | Opacity = consistency`
            : `${metricName}: N/A`
        }
      />
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show loading indicator during initial fetch
  if (isLoading && (!tableData || !tableData.features || tableData.features.length === 0)) {
    return (
      <div className={`table-panel cause-table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      </div>
    )
  }

  // If no data or no explainers selected (and not loading)
  if (!tableData || !tableData.features || tableData.features.length === 0 || selectedExplainers.size === 0) {
    return (
      <div className={`table-panel cause-table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content" ref={tableContainerRef}>
          <p className="table-panel__placeholder">
            Select LLM explainers to view cause table data
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`table-panel cause-table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Table Selection Panel - Header with actions */}
      <TableSelectionPanel
        mode="cause"
        tagLabel={TAG_CATEGORY_TABLE_TITLES[TAG_CATEGORY_CAUSE]}
        instruction={TAG_CATEGORY_TABLE_INSTRUCTIONS[TAG_CATEGORY_CAUSE]}
        onDone={moveToNextStep}
        doneButtonEnabled={true}
      />

      {/* Table Content */}
      <div className="table-panel__content" ref={tableContainerRef}>
        <table className="table-panel__table--simple">
          {/* Table Header */}
          <thead className="table-panel__thead">
            <tr className="table-panel__header-row">
              <th className="table-panel__header-cell table-panel__header-cell--index">
                <div className="table-panel__header-content">#</div>
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--feature"
                onClick={() => handleSort('featureId')}
                style={{ cursor: 'pointer' }}
              >
                <div className="table-panel__header-content">
                  Tag
                  {sortBy === 'featureId' && (
                    <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                  )}
                </div>
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort(METRIC_SEMANTIC_SIMILARITY)}
                style={{ cursor: 'pointer' }}
                title="Semantic Similarity"
              >
                <div className="table-panel__header-content">
                  Semantic Similarity
                  {sortBy === METRIC_SEMANTIC_SIMILARITY && (
                    <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                  )}
                </div>
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort(METRIC_SCORE_FUZZ)}
                style={{ cursor: 'pointer' }}
                title="Fuzz Score"
              >
                <div className="table-panel__header-content">
                  Fuzzing Score
                  {sortBy === METRIC_SCORE_FUZZ && (
                    <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                  )}
                </div>
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score-dual"
                onClick={() => handleSort('emb_det_average')}
                style={{ cursor: 'pointer' }}
                title="Embedding & Detection Scores (sorted by average)"
              >
                <div className="table-panel__header-content">
                  Embedding & Detetection Score
                  {sortBy === 'emb_det_average' && (
                    <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                  )}
                </div>
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explanation">
                <div className="table-panel__header-content">Explanation</div>
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--activation-example">
                <div className="table-panel__header-content">Activation Examples</div>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="table-panel__tbody">
            {/* Top padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
                <td colSpan={8} />
              </tr>
            )}

            {/* Render only visible virtual items */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const featureIndex = virtualRow.index
                  const featureRow = sortedFeatures[featureIndex]
                  if (!featureRow) return null

                  // Get max quality score explainer
                  const maxQualityInfo = findMaxQualityScoreExplainer(
                    featureRow,
                    tableData.global_stats
                  )

                  if (!maxQualityInfo) return null

                  const explainerId = maxQualityInfo.explainerId
                  const explainerData = featureRow.explainers[explainerId]

                  if (!explainerData) return null

                  // Get cause category state
                  const causeState = causeSelectionStates.get(featureRow.feature_id)
                  const causeSource = causeSelectionSources.get(featureRow.feature_id)

                  // Get scores for rendering
                  const semanticSim = explainerData.semantic_similarity
                    ? Object.values(explainerData.semantic_similarity)[0] || null
                    : null
                  const embedding = explainerData.embedding
                  const fuzzScores = explainerData.fuzz
                  const detectionScores = explainerData.detection

                  // Calculate score stats for opacity
                  const fuzzStats = calculateScoreStats(fuzzScores)
                  const detectionStats = calculateScoreStats(detectionScores)

                  // Get average scores
                  const fuzzAvg = fuzzStats?.avg || null
                  const detectionAvg = detectionStats?.avg || null

                  // Determine row class and background color using standard selection colors
                  const rowClassParts = ['table-panel__sub-row']
                  let rowBackgroundColor = ''

                  if (causeState) {
                    // Map cause states to standard selection colors for row backgrounds
                    // 'noisy-activation' → confirmed (blue)
                    // 'missed-lexicon' → expanded (light blue)
                    // 'missed-context' → rejected (red)
                    if (causeState === 'noisy-activation') {
                      rowClassParts.push('table-panel__sub-row--confirmed')
                      rowBackgroundColor = SELECTION_CATEGORY_COLORS.CONFIRMED.HEX
                    } else if (causeState === 'missed-lexicon') {
                      rowClassParts.push('table-panel__sub-row--expanded')
                      rowBackgroundColor = SELECTION_CATEGORY_COLORS.EXPANDED.HEX
                    } else if (causeState === 'missed-context') {
                      rowClassParts.push('table-panel__sub-row--rejected')
                      rowBackgroundColor = SELECTION_CATEGORY_COLORS.REJECTED.HEX
                    }

                    if (causeSource === 'auto') {
                      rowClassParts.push('table-panel__sub-row--auto-tagged')
                    }
                  }

                  // Add threshold line indicators
                  if (thresholdVisualization?.visible && thresholdVisualization.mode === 'cause' && featureIndex === thresholdVisualization.selectPosition) {
                    rowClassParts.push('table-panel__row--select-threshold')
                  }
                  if (thresholdVisualization?.visible && thresholdVisualization.mode === 'cause' && featureIndex === thresholdVisualization.rejectPosition) {
                    rowClassParts.push('table-panel__row--reject-threshold')
                  }

                  // Add preview stripe patterns
                  if (thresholdVisualization?.visible && thresholdVisualization.mode === 'cause' && thresholdVisualization.previewAutoSelected?.has(featureRow.feature_id)) {
                    rowClassParts.push('table-panel__row--preview-auto-selected')
                  }
                  if (thresholdVisualization?.visible && thresholdVisualization.mode === 'cause' && thresholdVisualization.previewAutoRejected?.has(featureRow.feature_id)) {
                    rowClassParts.push('table-panel__row--preview-auto-rejected')
                  }

                  const rowClass = rowClassParts.join(' ')

                  // Get valid explainer IDs for popover
                  const validExplainerIds = Object.keys(featureRow.explainers).filter(
                    id => featureRow.explainers[id] && featureRow.explainers[id].explanation_text
                  )

                  return (
                    <tr
                      key={featureRow.feature_id}
                      className={rowClass}
                      onClick={(e) => {
                        const target = e.target as HTMLElement
                        // Allow clicking anywhere on the row to toggle the cause category
                        // Only exclude tag badge (it has its own click handler with stopPropagation)
                        if (!target.closest('.tag-badge')) {
                          toggleCauseCategory(featureRow.feature_id)
                        }
                      }}
                      style={{
                        ...getRowStyleProperties(rowBackgroundColor) as React.CSSProperties,
                        cursor: 'pointer'
                      }}
                    >
                      {/* Index */}
                      <td className="table-panel__cell table-panel__cell--index">
                        {virtualRow.index + 1}
                      </td>

                      {/* Feature badge (merged checkbox + ID) */}
                      <td className="table-panel__cell table-panel__cell--feature">
                        <TagBadge
                          featureId={featureRow.feature_id}
                          tagName={getCauseTagName(causeState)}
                          tagCategoryId={TAG_CATEGORY_CAUSE}
                          selectionState={getCauseSelectionState(causeState)}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCauseCategory(featureRow.feature_id)
                          }}
                        />
                      </td>

                      {/* Semantic Similarity */}
                      <td className="table-panel__cell table-panel__cell--score">
                        {renderScoreCircle(semanticSim, null, 'Semantic Similarity')}
                      </td>

                      {/* Fuzz Score */}
                      <td className="table-panel__cell table-panel__cell--score">
                        {renderScoreCircle(fuzzAvg, fuzzStats, 'Fuzz Score')}
                      </td>

                      {/* Embedding & Detection (Side-by-Side) */}
                      <td className="table-panel__cell table-panel__cell--score-dual">
                        <div className="cause-table-panel__score-dual-container">
                          <div className="cause-table-panel__score-dual-item">
                            <div className="cause-table-panel__score-dual-label">Emb</div>
                            {renderScoreCircle(embedding, null, 'Embedding')}
                          </div>
                          <div className="cause-table-panel__score-dual-item">
                            <div className="cause-table-panel__score-dual-label">Det</div>
                            {renderScoreCircle(detectionAvg, detectionStats, 'Detection')}
                          </div>
                        </div>
                      </td>

                      {/* Explanation */}
                      <td
                        className="table-panel__cell table-panel__cell--explanation"
                        title={!explainerData.highlighted_explanation ? (explainerData.explanation_text ?? undefined) : undefined}
                        style={{ position: 'relative', overflow: 'visible' }}
                        onMouseEnter={(e) => {
                          const position = detectExplanationPopoverPosition(e.currentTarget)
                          setShowExplanationPopover({
                            featureId: featureRow.feature_id,
                            validExplainerIds,
                            featureRow,
                            position
                          })
                        }}
                        onMouseLeave={() => setShowExplanationPopover(null)}
                      >
                        <div className="table-panel__explanation-text-wrapper">
                          {explainerData.highlighted_explanation ? (
                            <HighlightedExplanation
                              segments={explainerData.highlighted_explanation.segments}
                              explainerNames={['Llama', 'Qwen', 'OpenAI']}
                              truncated={false}
                            />
                          ) : (
                            explainerData.explanation_text ?? '-'
                          )}
                        </div>

                        {/* Inline explanation popover */}
                        {showExplanationPopover && showExplanationPopover.featureId === featureRow.feature_id && (
                          <div className={`table-panel__explanation-popover table-panel__explanation-popover--${showExplanationPopover.position ?? 'below'}`}>
                            <div className="table-panel__explanation-popover-content">
                              {showExplanationPopover.validExplainerIds.map((explId: string) => {
                                const explData = showExplanationPopover.featureRow.explainers[explId]
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
                          </div>
                        )}
                      </td>

                      {/* Activating Examples */}
                      <td className="table-panel__cell table-panel__cell--activation-example" style={{ position: 'relative', overflow: 'visible' }}>
                        {activationExamples[featureRow.feature_id] ? (
                          <ActivationExample
                            examples={activationExamples[featureRow.feature_id]}
                            containerWidth={activationColumnWidth}
                          />
                        ) : (
                          <span className="table-panel__placeholder">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}

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

      {/* Similarity Tagging Popover */}
      <SimilarityTaggingPopover />
    </div>
  )
}

export default CauseTablePanel
