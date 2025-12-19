import React, { useState, useMemo, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import { type SelectionCategory } from '../lib/constants'
import { getSelectionColors, type TableStage } from '../lib/color-utils'
import SelectionStateBar, { type CategoryCounts, type CauseCategoryCounts } from './SelectionBar'
import '../styles/SelectionPanel.css'

// ============================================================================
// HELPER: Derive feature states from pair states
// ============================================================================

interface ClusterPair {
  main_id: number
  similar_id: number
  pair_key: string
}

type SelectionState = 'selected' | 'rejected'
type SelectionSource = 'manual' | 'auto'

/**
 * Derives feature states from pair tagging states.
 * Priority rules:
 * 1. Fragmented: feature belongs to at least one fragmented (selected) pair
 * 2. Monosemantic: feature belongs to at least one monosemantic (rejected) pair, but NOT fragmented
 * 3. Unsure: feature does not belong to any tagged pair
 *
 * For source: 'manual' takes priority over 'auto'
 */
function deriveFeatureStatesFromPairs(
  allPairs: ClusterPair[],
  pairSelectionStates: Map<string, SelectionState>,
  pairSelectionSources: Map<string, SelectionSource>,
  filteredFeatureIds: Set<number>
): Map<number, { state: 'fragmented' | 'monosemantic' | 'unsure'; source: SelectionSource }> {
  // Track features with their derived states
  const fragmentedFeatures = new Map<number, SelectionSource>() // featureId -> source
  const monosematicFeatures = new Map<number, SelectionSource>() // featureId -> source

  // Helper: prioritize 'manual' over 'auto' for source tracking
  const updateFeatureSource = (map: Map<number, SelectionSource>, featureId: number, source: SelectionSource) => {
    const existing = map.get(featureId)
    if (!existing || (existing === 'auto' && source === 'manual')) {
      map.set(featureId, source)
    }
  }

  // Iterate through all pairs
  for (const pair of allPairs) {
    // Filter: only consider pairs where both features are in selection
    if (!filteredFeatureIds.has(pair.main_id) || !filteredFeatureIds.has(pair.similar_id)) {
      continue
    }

    const pairState = pairSelectionStates.get(pair.pair_key)
    const pairSource = pairSelectionSources.get(pair.pair_key) || 'manual'

    if (pairState === 'selected') {
      // Fragmented pair -> both features are fragmented
      updateFeatureSource(fragmentedFeatures, pair.main_id, pairSource)
      updateFeatureSource(fragmentedFeatures, pair.similar_id, pairSource)
    } else if (pairState === 'rejected') {
      // Monosemantic pair -> both features are potentially monosemantic
      updateFeatureSource(monosematicFeatures, pair.main_id, pairSource)
      updateFeatureSource(monosematicFeatures, pair.similar_id, pairSource)
    }
  }

  // Build final feature states with priority: fragmented > monosemantic > unsure
  const featureStates = new Map<number, { state: 'fragmented' | 'monosemantic' | 'unsure'; source: SelectionSource }>()

  for (const featureId of filteredFeatureIds) {
    if (fragmentedFeatures.has(featureId)) {
      featureStates.set(featureId, {
        state: 'fragmented',
        source: fragmentedFeatures.get(featureId)!
      })
    } else if (monosematicFeatures.has(featureId)) {
      featureStates.set(featureId, {
        state: 'monosemantic',
        source: monosematicFeatures.get(featureId)!
      })
    } else {
      featureStates.set(featureId, { state: 'unsure', source: 'manual' })
    }
  }

  return featureStates
}

// Counts stored at commit time for hover preview
// Supports stage1 (fragmented/monosemantic), stage2 (wellExplained/needRevision), and stage3 (cause categories)
interface CommitCounts {
  // Stage 1: Feature Splitting terminology
  fragmented?: number
  monosemantic?: number
  // Stage 2: Quality Assessment terminology
  wellExplained?: number
  needRevision?: number
  // Stage 3: Cause Analysis terminology
  noisyActivation?: number
  missedNgram?: number
  missedContext?: number
  // Common
  unsure: number
  total: number
}

// Commit history type - minimal interface for SelectionPanel
// (states/sources are managed by views, SelectionPanel only needs counts for preview)
interface TagCommit {
  type: string
  id: number
  // Counts at commit time for hover preview
  counts?: CommitCounts
}

interface SelectionPanelProps {
  stage: TableStage
  onDone?: () => void
  doneButtonEnabled?: boolean
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void  // Callback for flow overlay
  filteredFeatureIds?: Set<number>  // Selected feature IDs from Sankey segment
  // Commit history props
  commitHistory?: TagCommit[]
  currentCommitIndex?: number
  onCommitClick?: (commitIndex: number) => void
}

/**
 * TableSelectionPanel - Unified header showing table info, action buttons, and selection state bar
 *
 * Combines:
 * - Table header (tag name, count, Sankey threshold)
 * - Action buttons (Sort, Tag, Done, Clear)
 * - Selection state bar (4-category visualization)
 */
const TableSelectionPanel: React.FC<SelectionPanelProps> = ({
  stage,
  onDone,
  doneButtonEnabled = false,
  onCategoryRefsReady,
  filteredFeatureIds: propFilteredFeatureIds,
  commitHistory,
  currentCommitIndex,
  onCommitClick
}) => {
  // State from store
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const allClusterPairs = useVisualizationStore(state => state.allClusterPairs)
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const restoreSimilarityTaggingPopover = useVisualizationStore(state => state.restoreSimilarityTaggingPopover)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const getFeatureSplittingCounts = useVisualizationStore(state => state.getFeatureSplittingCounts)

  // Dependencies that change when thresholds update
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get filtered feature IDs - prefer prop if provided, otherwise use store's method
  const filteredFeatureIds = useMemo(() => {
    // These dependencies are necessary to trigger recalculation when Sankey selection changes
    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps  // Consume the variable to avoid unused-vars warning

    // If prop is provided, use it (from FeatureSplitView)
    if (propFilteredFeatureIds) {
      console.log('[SelectionPanel] Using prop filteredFeatureIds:', propFilteredFeatureIds.size, 'features')
      return propFilteredFeatureIds
    }

    // Otherwise, use store's method which handles both regular nodes and segments
    // Returns Set<number> of feature IDs or null
    const featureIds = getSelectedNodeFeatures()

    if (!featureIds || featureIds.size === 0) {
      console.log('[SelectionPanel] No selection or empty - showing all features')
      return null
    }

    console.log('[SelectionPanel] filteredFeatureIds:', featureIds.size, 'features from getSelectedNodeFeatures()')
    return featureIds
  }, [propFilteredFeatureIds, getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds])

  // Track if threshold button should highlight (first time showing preview)
  const [shouldHighlightThresholdButton, setShouldHighlightThresholdButton] = useState(false)

  // Hover state for commit history tooltip
  const [hoveredCommitIndex, setHoveredCommitIndex] = useState<number | null>(null)
  const [commitTooltipPosition, setCommitTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Get selection states based on stage
  // Stage 1 uses pair selection states, Stage 2/3 use feature selection states
  const selectionStates = stage === 'stage1' ? pairSelectionStates : featureSelectionStates

  // Calculate category counts
  const counts = useMemo((): CategoryCounts => {
    console.log('[SelectionPanel.counts] useMemo triggered - stage:', stage, ', pairSelectionStates.size:', pairSelectionStates.size)

    let confirmed = 0
    let autoSelected = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    if (stage === 'stage1') {
      // Stage 1: Feature Splitting - show FEATURE counts (derived from pair states)
      // Use store getter for single source of truth (shared with TagStagePanel)
      const fsCounts = getFeatureSplittingCounts()
      confirmed = fsCounts.fragmentedManual
      autoSelected = fsCounts.fragmentedAuto
      rejected = fsCounts.monosematicManual
      autoRejected = fsCounts.monosematicAuto
      unsure = fsCounts.unsure

      console.log('[SelectionPanel] Stage 1 counts from store:', fsCounts)
    } else if (stage === 'stage2' && tableData?.features) {
      // Stage 2: Quality Assessment - show feature counts directly
      const features = filteredFeatureIds
        ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
        : tableData.features

      console.log('[SelectionPanel] Stage 2 - Total features:', tableData.features.length, ', Filtered features:', features.length, ', filteredFeatureIds:', filteredFeatureIds ? `${filteredFeatureIds.size} IDs` : 'null')

      features.forEach((feature: any) => {
        const featureId = feature.feature_id
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            autoSelected++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'auto') {
            autoRejected++
          } else {
            rejected++
          }
        } else {
          unsure++
        }
      })
    } else if (stage === 'stage3') {
      // TODO: Stage 3 - Cause Analysis counts
      // For now, just count all features as unsure
      if (tableData?.features) {
        const features = filteredFeatureIds
          ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
          : tableData.features
        unsure = features.length
      }
    }

    const total = confirmed + autoSelected + rejected + autoRejected + unsure
    console.log('[SelectionPanel] Final counts:', { confirmed, autoSelected, rejected, autoRejected, unsure, total })
    return { confirmed, autoSelected, rejected, autoRejected, unsure, total }
  // Note: allClusterPairs and pairSelectionSources are needed because getFeatureSplittingCounts depends on them internally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, filteredFeatureIds, allClusterPairs, getFeatureSplittingCounts])

  // Calculate cause-specific counts for Stage 3
  const causeCounts = useMemo((): CauseCategoryCounts | undefined => {
    if (stage !== 'stage3') return undefined

    // Get feature set to count
    const featureSet = filteredFeatureIds || (tableData?.features
      ? new Set(tableData.features.map((f: any) => f.feature_id as number))
      : new Set<number>())

    let noisyActivation = 0, noisyActivationAuto = 0
    let missedNgram = 0, missedNgramAuto = 0
    let missedContext = 0, missedContextAuto = 0
    let wellExplained = 0, wellExplainedAuto = 0
    let unsure = 0

    for (const featureId of featureSet) {
      const category = causeSelectionStates.get(featureId)
      const source = causeSelectionSources.get(featureId)

      if (!category) {
        unsure++
        continue
      }

      const isAuto = source === 'auto'
      switch (category) {
        case 'noisy-activation':
          isAuto ? noisyActivationAuto++ : noisyActivation++
          break
        case 'missed-N-gram':
          isAuto ? missedNgramAuto++ : missedNgram++
          break
        case 'missed-context':
          isAuto ? missedContextAuto++ : missedContext++
          break
        case 'well-explained':
          isAuto ? wellExplainedAuto++ : wellExplained++
          break
      }
    }

    return {
      noisyActivation, noisyActivationAuto,
      missedNgram, missedNgramAuto,
      missedContext, missedContextAuto,
      wellExplained, wellExplainedAuto,
      unsure,
      total: featureSet.size
    }
  }, [stage, filteredFeatureIds, tableData, causeSelectionStates, causeSelectionSources])

  // Calculate preview counts when thresholds are active (real-time preview during threshold drag)
  // This simulates what feature counts would look like after applying the thresholds
  const previewCounts = useMemo((): CategoryCounts | undefined => {
    // Need histogram scores and thresholds
    if (!tagAutomaticState?.histogramData?.scores || !filteredFeatureIds) {
      return undefined
    }

    // Stage 3: TODO - no preview counts yet
    if (stage === 'stage3') {
      return undefined
    }

    // Handle Stage 2 (feature) preview
    if (stage === 'stage2') {
      const thresholds = {
        select: tagAutomaticState.selectThreshold,
        reject: tagAutomaticState.rejectThreshold
      }

      let confirmed = 0
      let autoSelected = 0
      let rejected = 0
      let autoRejected = 0
      let unsure = 0

      // Count current states and simulate what would be auto-tagged
      filteredFeatureIds.forEach(featureId => {
        const currentState = featureSelectionStates.get(featureId)
        const currentSource = featureSelectionSources.get(featureId)
        const score = tagAutomaticState.histogramData?.scores?.[featureId.toString()]

        if (currentState === 'selected') {
          // Already selected
          if (currentSource === 'auto') {
            autoSelected++
          } else {
            confirmed++
          }
        } else if (currentState === 'rejected') {
          // Already rejected
          if (currentSource === 'auto') {
            autoRejected++
          } else {
            rejected++
          }
        } else {
          // Currently unsure - check if would be auto-tagged
          if (typeof score === 'number') {
            if (score >= thresholds.select) {
              autoSelected++ // Would become auto-selected
            } else if (score < thresholds.reject) {
              autoRejected++ // Would become auto-rejected
            } else {
              unsure++ // Stays unsure
            }
          } else {
            unsure++ // No score, stays unsure
          }
        }
      })

      const total = confirmed + autoSelected + rejected + autoRejected + unsure
      return { confirmed, autoSelected, rejected, autoRejected, unsure, total }
    }

    // Handle Stage 1 (pair) preview
    const thresholds = {
      select: tagAutomaticState.selectThreshold,
      reject: tagAutomaticState.rejectThreshold
    }

    // Build simulated pair states (current + what would be auto-tagged)
    const simulatedPairStates = new Map<string, SelectionState>(pairSelectionStates)
    const simulatedPairSources = new Map<string, SelectionSource>(pairSelectionSources)

    // Build pairs from histogram scores
    const pairsFromHistogram: ClusterPair[] = []

    Object.entries(tagAutomaticState.histogramData.scores).forEach(([pairKey, score]) => {
      if (typeof score !== 'number') return

      // Filter: Only consider pairs where BOTH features are in the selected segment
      const [id1Str, id2Str] = pairKey.split('-')
      const id1 = parseInt(id1Str, 10)
      const id2 = parseInt(id2Str, 10)

      if (!filteredFeatureIds.has(id1) || !filteredFeatureIds.has(id2)) {
        return
      }

      pairsFromHistogram.push({ main_id: id1, similar_id: id2, pair_key: pairKey })

      // If not already tagged, simulate auto-tagging based on thresholds
      if (!pairSelectionStates.has(pairKey)) {
        if (score >= thresholds.select) {
          simulatedPairStates.set(pairKey, 'selected')
          simulatedPairSources.set(pairKey, 'auto')
        } else if (score <= thresholds.reject) {
          simulatedPairStates.set(pairKey, 'rejected')
          simulatedPairSources.set(pairKey, 'auto')
        }
      }
    })

    // Use cluster pairs if available, otherwise use histogram pairs
    const pairsToProcess = (allClusterPairs && allClusterPairs.length > 0) ? allClusterPairs : pairsFromHistogram

    // Derive feature states from simulated pair states
    const featureStates = deriveFeatureStatesFromPairs(
      pairsToProcess,
      simulatedPairStates,
      simulatedPairSources,
      filteredFeatureIds
    )

    // Count by derived feature state
    let confirmed = 0
    let autoSelected = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    featureStates.forEach(({ state, source }) => {
      if (state === 'fragmented') {
        if (source === 'auto') {
          autoSelected++
        } else {
          confirmed++
        }
      } else if (state === 'monosemantic') {
        if (source === 'auto') {
          autoRejected++
        } else {
          rejected++
        }
      } else {
        unsure++
      }
    })

    const total = confirmed + autoSelected + rejected + autoRejected + unsure
    return { confirmed, autoSelected, rejected, autoRejected, unsure, total }
  }, [stage, tagAutomaticState, pairSelectionStates, pairSelectionSources, featureSelectionStates, featureSelectionSources, filteredFeatureIds, allClusterPairs])

  // Preview is active when DecisionMarginHistogram has histogram data (user can drag thresholds)
  const isPreviewActive = !!tagAutomaticState?.histogramData
  // Show threshold controls only when thresholdVisualization is visible (after "Show on Table")
  const showThresholdControls = thresholdVisualization?.visible ?? false

  // Highlight threshold button when preview first becomes active
  useEffect(() => {
    if (showThresholdControls) {
      setShouldHighlightThresholdButton(true)
    } else {
      setShouldHighlightThresholdButton(false)
    }
  }, [showThresholdControls])

  // Handlers
  const handleCategoryClick = (category: SelectionCategory) => {
    console.log(`[TableSelectionPanel] Clicked category: ${category}`)
  }

  const handleGoBackToHistogram = () => {
    setShouldHighlightThresholdButton(false)
    restoreSimilarityTaggingPopover()
  }

  const hasAnySelection = selectionStates.size > 0

  // Calculate pair count for Stage 1 (to show as secondary info in header)
  const pairCount = useMemo(() => {
    if (stage !== 'stage1' || !filteredFeatureIds) return undefined

    let count = 0

    if (allClusterPairs && allClusterPairs.length > 0) {
      // Count pairs where both features are in the filtered set
      allClusterPairs.forEach(pair => {
        if (filteredFeatureIds.has(pair.main_id) && filteredFeatureIds.has(pair.similar_id)) {
          count++
        }
      })
    } else if (tagAutomaticState?.histogramData?.scores) {
      // Count from histogram data
      Object.keys(tagAutomaticState.histogramData.scores).forEach(pairKey => {
        const [id1Str, id2Str] = pairKey.split('-')
        const id1 = parseInt(id1Str, 10)
        const id2 = parseInt(id2Str, 10)
        if (filteredFeatureIds.has(id1) && filteredFeatureIds.has(id2)) {
          count++
        }
      })
    }

    return count
  }, [stage, filteredFeatureIds, allClusterPairs, tagAutomaticState?.histogramData?.scores])

  // Don't render if no table data loaded yet
  if (!tableData) {
    return null
  }

  return (
    <div className="table-selection-panel">
      {/* Actions Row: Bar + Buttons */}
      <div className="table-selection-panel__actions">
        {/* Threshold Controls (if active) */}
        {showThresholdControls && (
          <div className="table-selection-panel__left-actions">
            {/* Go Back to Histogram Button */}
            <button
              className={`table-selection-panel__button table-selection-panel__button--histogram ${shouldHighlightThresholdButton ? 'table-selection-panel__button--highlighted' : ''}`}
              onClick={handleGoBackToHistogram}
              title="Return to histogram to adjust thresholds"
            >
              Go Back to Histogram
            </button>
          </div>
        )}

        {/* Center: Selection State Bar + Commit History */}
        <div className="table-selection-panel__bar-container">
          <SelectionStateBar
            counts={counts}
            previewCounts={isPreviewActive ? previewCounts : undefined}
            causeCounts={causeCounts}
            onCategoryClick={handleCategoryClick}
            showLabels={true}
            showLegend={true}
            orientation="vertical"
            height="100%"
            stage={stage}
            onCategoryRefsReady={onCategoryRefsReady}
            pairCount={pairCount}
          />

          {/* Commit History Circles */}
          {commitHistory && commitHistory.length > 0 && onCommitClick && (
            <div className={`commit-history commit-history--${stage}`}>
              <div className="commit-history__label">History</div>
              <div className="commit-history__circles">
                {commitHistory.map((commit, index) => (
                  <button
                    key={commit.id}
                    className={`commit-history__circle ${
                      index === currentCommitIndex ? 'commit-history__circle--active' : 'commit-history__circle--past'
                    }`}
                    onClick={() => onCommitClick(index)}
                    onMouseEnter={(e) => {
                      setHoveredCommitIndex(index)
                      setCommitTooltipPosition({ x: e.clientX, y: e.clientY })
                    }}
                    onMouseLeave={() => {
                      setHoveredCommitIndex(null)
                      setCommitTooltipPosition(null)
                    }}
                    aria-label={`Go to commit ${index + 1}`}
                  >
                    <span className="commit-history__circle-number">{index + 1}</span>
                  </button>
                ))}
              </div>

              {/* Commit Hover Tooltip - shows mini vertical bar and counts */}
              {hoveredCommitIndex !== null && commitTooltipPosition && commitHistory[hoveredCommitIndex]?.counts && (
                <div
                  className="commit-hover-tooltip"
                  style={{
                    position: 'fixed',
                    left: commitTooltipPosition.x + 16,
                    top: commitTooltipPosition.y - 60,
                    zIndex: 10000
                  }}
                >
                  {(() => {
                    const counts = commitHistory[hoveredCommitIndex].counts!
                    const total = counts.total || 1
                    const stageColors = getSelectionColors(stage)

                    // Stage-specific counts and labels
                    if (stage === 'stage1') {
                      // Stage 1: Feature Splitting - fragmented/monosemantic terminology
                      const monosematicCount = counts.monosemantic ?? 0
                      const fragmentedCount = counts.fragmented ?? 0
                      const monosematicPct = (monosematicCount / total) * 100
                      const unsurePct = (counts.unsure / total) * 100
                      const fragmentedPct = (fragmentedCount / total) * 100

                      return (
                        <div className="commit-hover-tooltip__content">
                          {/* Mini vertical bar - order: rejected (top) → unsure (middle) → confirmed (bottom) */}
                          <div className="commit-hover-tooltip__bar">
                            {monosematicCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${monosematicPct}%`, backgroundColor: stageColors.rejected }}
                              />
                            )}
                            {counts.unsure > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${unsurePct}%`, backgroundColor: stageColors.unsure }}
                              />
                            )}
                            {fragmentedCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${fragmentedPct}%`, backgroundColor: stageColors.confirmed }}
                              />
                            )}
                          </div>
                          {/* Text counts - order matches bar */}
                          <div className="commit-hover-tooltip__counts">
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.rejected }} />
                              Monosemantic: {monosematicCount}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.unsure }} />
                              Unsure: {counts.unsure}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.confirmed }} />
                              Fragmented: {fragmentedCount}
                            </span>
                          </div>
                        </div>
                      )
                    } else if (stage === 'stage2') {
                      // Stage 2: Quality Assessment - wellExplained/needRevision terminology
                      const needRevisionCount = counts.needRevision ?? 0
                      const wellExplainedCount = counts.wellExplained ?? 0
                      const needRevisionPct = (needRevisionCount / total) * 100
                      const unsurePct = (counts.unsure / total) * 100
                      const wellExplainedPct = (wellExplainedCount / total) * 100

                      return (
                        <div className="commit-hover-tooltip__content">
                          {/* Mini vertical bar - order: rejected (top) → unsure (middle) → confirmed (bottom) */}
                          <div className="commit-hover-tooltip__bar">
                            {needRevisionCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${needRevisionPct}%`, backgroundColor: stageColors.rejected }}
                              />
                            )}
                            {counts.unsure > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${unsurePct}%`, backgroundColor: stageColors.unsure }}
                              />
                            )}
                            {wellExplainedCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${wellExplainedPct}%`, backgroundColor: stageColors.confirmed }}
                              />
                            )}
                          </div>
                          {/* Text counts - order matches bar */}
                          <div className="commit-hover-tooltip__counts">
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.rejected }} />
                              Need Revision: {needRevisionCount}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.unsure }} />
                              Unsure: {counts.unsure}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.confirmed }} />
                              Well-Explained: {wellExplainedCount}
                            </span>
                          </div>
                        </div>
                      )
                    } else {
                      // Stage 3: Cause Analysis - 4 cause categories + unsure
                      const noisyActivationCount = counts.noisyActivation ?? 0
                      const missedNgramCount = counts.missedNgram ?? 0
                      const missedContextCount = counts.missedContext ?? 0
                      const wellExplainedCount = counts.wellExplained ?? 0

                      const noisyActivationPct = (noisyActivationCount / total) * 100
                      const missedNgramPct = (missedNgramCount / total) * 100
                      const missedContextPct = (missedContextCount / total) * 100
                      const wellExplainedPct = (wellExplainedCount / total) * 100

                      // Get stage2 colors for well-explained (green)
                      const stage2Colors = getSelectionColors('stage2')

                      return (
                        <div className="commit-hover-tooltip__content">
                          {/* Mini vertical bar for cause categories */}
                          <div className="commit-hover-tooltip__bar">
                            {noisyActivationCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${noisyActivationPct}%`, backgroundColor: stageColors.confirmed }}
                              />
                            )}
                            {missedNgramCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${missedNgramPct}%`, backgroundColor: stageColors.autoSelected }}
                              />
                            )}
                            {missedContextCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${missedContextPct}%`, backgroundColor: stageColors.rejected }}
                              />
                            )}
                            {wellExplainedCount > 0 && (
                              <div
                                className="commit-hover-tooltip__bar-segment"
                                style={{ height: `${wellExplainedPct}%`, backgroundColor: stage2Colors.confirmed }}
                              />
                            )}
                          </div>
                          {/* Text counts - order matches bar */}
                          <div className="commit-hover-tooltip__counts">
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.confirmed }} />
                              Noisy Activation: {noisyActivationCount}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.autoSelected }} />
                              Missed N-gram: {missedNgramCount}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stageColors.rejected }} />
                              Missed Context: {missedContextCount}
                            </span>
                            <span className="commit-hover-tooltip__count">
                              <span className="commit-hover-tooltip__dot" style={{ backgroundColor: stage2Colors.confirmed }} />
                              Well-Explained: {wellExplainedCount}
                            </span>
                          </div>
                        </div>
                      )
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Actions: Done */}
        <div className="table-selection-panel__right-actions">
          {/* Done Button */}
          {onDone && (
            <button
              className="table-selection-panel__button table-selection-panel__button--done"
              onClick={onDone}
              disabled={!hasAnySelection || !doneButtonEnabled || isPreviewActive}
              title={isPreviewActive ? "Close threshold preview to proceed" : !doneButtonEnabled ? "Next step not available for this stage" : !hasAnySelection ? "Make at least one selection to proceed" : "Proceed to next stage"}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TableSelectionPanel
