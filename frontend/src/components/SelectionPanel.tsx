import React, { useState, useMemo, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import { type SelectionCategory } from '../lib/constants'
import { getSelectionColors } from '../lib/color-utils'
import SelectionStateBar, { type CategoryCounts } from './SelectionBar'
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

// ============================================================================
// SIMPLE SELECTION BAR - For Tag Automatic Popover
// ============================================================================

interface SimpleSelectionBarProps {
  selectedCount: number
  rejectedCount: number
  unsureCount: number
  total: number
  mode?: 'feature' | 'pair' | 'cause'
}

/**
 * SimpleSelectionBar - Compact horizontal bar showing selection distribution
 * Used in Tag Automatic Popover to show current selection state
 */
const SimpleSelectionBar: React.FC<SimpleSelectionBarProps> = ({
  selectedCount,
  rejectedCount,
  unsureCount,
  total,
  mode = 'feature'
}) => {
  const modeColors = useMemo(() => getSelectionColors(mode), [mode])

  if (total === 0) {
    return (
      <div className="simple-selection-bar">
        <div className="simple-selection-bar__empty">No selections</div>
      </div>
    )
  }

  const selectedPercent = (selectedCount / total) * 100
  const rejectedPercent = (rejectedCount / total) * 100
  const unsurePercent = (unsureCount / total) * 100

  return (
    <div className="simple-selection-bar">
      <div className="simple-selection-bar__bar">
        {/* Selected (True Positive) */}
        {selectedCount > 0 && (
          <div
            className="simple-selection-bar__segment simple-selection-bar__segment--selected"
            style={{
              width: `${selectedPercent}%`,
              backgroundColor: modeColors.confirmed
            }}
            title={`Selected: ${selectedCount} (${selectedPercent.toFixed(1)}%)`}
          >
            {selectedPercent > 10 && (
              <span className="simple-selection-bar__label">{selectedCount}</span>
            )}
          </div>
        )}

        {/* Rejected (False Positive) */}
        {rejectedCount > 0 && (
          <div
            className="simple-selection-bar__segment simple-selection-bar__segment--rejected"
            style={{
              width: `${rejectedPercent}%`,
              backgroundColor: modeColors.rejected
            }}
            title={`Rejected: ${rejectedCount} (${rejectedPercent.toFixed(1)}%)`}
          >
            {rejectedPercent > 10 && (
              <span className="simple-selection-bar__label">{rejectedCount}</span>
            )}
          </div>
        )}

        {/* Unsure */}
        {unsureCount > 0 && (
          <div
            className="simple-selection-bar__segment simple-selection-bar__segment--unsure"
            style={{
              width: `${unsurePercent}%`,
              backgroundColor: modeColors.unsure
            }}
            title={`Unsure: ${unsureCount} (${unsurePercent.toFixed(1)}%)`}
          >
            {unsurePercent > 10 && (
              <span className="simple-selection-bar__label">{unsureCount}</span>
            )}
          </div>
        )}
      </div>

      {/* Compact legend */}
      <div className="simple-selection-bar__legend">
        <div className="simple-selection-bar__legend-item">
          <div
            className="simple-selection-bar__legend-dot"
            style={{ backgroundColor: modeColors.confirmed }}
          />
          <span>Selected: {selectedCount}</span>
        </div>
        <div className="simple-selection-bar__legend-item">
          <div
            className="simple-selection-bar__legend-dot"
            style={{ backgroundColor: modeColors.rejected }}
          />
          <span>Rejected: {rejectedCount}</span>
        </div>
        <div className="simple-selection-bar__legend-item">
          <div
            className="simple-selection-bar__legend-dot"
            style={{ backgroundColor: modeColors.unsure }}
          />
          <span>Unsure: {unsureCount}</span>
        </div>
      </div>
    </div>
  )
}

// Commit history type (supports both FeatureSplitView and QualityView)
interface TagCommit {
  type: string
  id: number
  // For pair mode (FeatureSplitView)
  pairSelectionStates?: Map<string, 'selected' | 'rejected'>
  pairSelectionSources?: Map<string, 'manual' | 'auto'>
  // For feature mode (QualityView)
  featureSelectionStates?: Map<number, 'selected' | 'rejected'>
  featureSelectionSources?: Map<number, 'manual' | 'auto'>
}

interface SelectionPanelProps {
  mode: 'feature' | 'pair' | 'cause'
  tagLabel: string
  onDone?: () => void
  doneButtonEnabled?: boolean
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void  // Callback for flow overlay
  availablePairs?: Array<{pairKey: string, mainFeatureId: number, similarFeatureId: number}>  // Cluster-based pairs (single source of truth) - used for pair count
  filteredFeatureIds?: Set<number>  // Selected feature IDs from Sankey segment
  // Commit history props (for pair mode)
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
  mode,
  onDone,
  doneButtonEnabled = false,
  onCategoryRefsReady,
  availablePairs: _availablePairs,
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
  const allClusterPairs = useVisualizationStore(state => state.allClusterPairs)
  const sortTableByCategory = useVisualizationStore(state => state.sortTableByCategory)
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

  // Get selection states based on mode
  const selectionStates = mode === 'feature' ? featureSelectionStates
                        : mode === 'pair' ? pairSelectionStates
                        : causeSelectionStates

  // Calculate category counts
  const counts = useMemo((): CategoryCounts => {
    console.log('[SelectionPanel.counts] useMemo triggered - mode:', mode, ', pairSelectionStates.size:', pairSelectionStates.size)

    let confirmed = 0
    let expanded = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    if (mode === 'feature' && tableData?.features) {
      // Filter features to only those in the selected node
      const features = filteredFeatureIds
        ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
        : tableData.features

      console.log('[SelectionPanel] Feature mode - Total features:', tableData.features.length, ', Filtered features:', features.length, ', filteredFeatureIds:', filteredFeatureIds ? `${filteredFeatureIds.size} IDs` : 'null')

      features.forEach((feature: any) => {
        const featureId = feature.feature_id
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
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
    } else if (mode === 'cause' && tableData?.features) {
      // Cause mode: 3 categories (noisy-activation, missed-lexicon, missed-context) + null (untagged = unsure)
      // Map to CategoryCounts: confirmed=noisy-activation, expanded=missed-lexicon, rejected=missed-context, unsure=null/untagged
      const features = filteredFeatureIds
        ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
        : tableData.features

      features.forEach((feature: any) => {
        const featureId = feature.feature_id
        const causeState = causeSelectionStates.get(featureId)

        if (causeState === 'noisy-activation') {
          confirmed++ // Orange
        } else if (causeState === 'missed-lexicon') {
          expanded++ // Purple
        } else if (causeState === 'missed-context') {
          rejected++ // Blue
        } else {
          // null/undefined - treat as unsure
          unsure++ // Gray
        }
      })

      // Note: unsure now represents untagged/null features
      const total = confirmed + expanded + rejected + autoRejected + unsure
      return { confirmed, expanded, rejected, autoRejected, unsure, total }
    } else if (mode === 'pair') {
      // In pair mode, we show FEATURE counts (derived from pair states)
      // Use store getter for single source of truth (shared with TagStagePanel)
      const fsCounts = getFeatureSplittingCounts()
      confirmed = fsCounts.fragmentedManual
      expanded = fsCounts.fragmentedAuto
      rejected = fsCounts.monosematicManual
      autoRejected = fsCounts.monosematicAuto
      unsure = fsCounts.unsure

      console.log('[SelectionPanel] Pair mode counts from store:', fsCounts)
    }

    const total = confirmed + expanded + rejected + autoRejected + unsure
    console.log('[SelectionPanel] Final counts:', { confirmed, expanded, rejected, autoRejected, unsure, total })
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  // Note: allClusterPairs and pairSelectionSources are needed because getFeatureSplittingCounts depends on them internally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, causeSelectionStates, filteredFeatureIds, allClusterPairs, getFeatureSplittingCounts])

  // Calculate preview counts when thresholds are active (real-time preview during threshold drag)
  // This simulates what feature counts would look like after applying the thresholds
  const previewCounts = useMemo((): CategoryCounts | undefined => {
    // Need histogram scores and thresholds
    if (!tagAutomaticState?.histogramData?.scores || !filteredFeatureIds) {
      return undefined
    }

    // Handle feature mode preview
    if (mode === 'feature') {
      const thresholds = {
        select: tagAutomaticState.selectThreshold,
        reject: tagAutomaticState.rejectThreshold
      }

      let confirmed = 0
      let expanded = 0
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
            expanded++
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
              expanded++ // Would become auto-selected
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

      const total = confirmed + expanded + rejected + autoRejected + unsure
      return { confirmed, expanded, rejected, autoRejected, unsure, total }
    }

    // Handle pair mode preview (existing logic)
    if (mode !== 'pair') {
      return undefined
    }

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
    let expanded = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    featureStates.forEach(({ state, source }) => {
      if (state === 'fragmented') {
        if (source === 'auto') {
          expanded++
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

    const total = confirmed + expanded + rejected + autoRejected + unsure
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [mode, tagAutomaticState, pairSelectionStates, pairSelectionSources, featureSelectionStates, featureSelectionSources, filteredFeatureIds, allClusterPairs])

  // Preview is active when TagAutomaticPanel has histogram data (user can drag thresholds)
  const isPreviewActive = (mode === 'pair' || mode === 'feature') && !!tagAutomaticState?.histogramData
  // Show threshold controls only when thresholdVisualization is visible (after "Show on Table")
  const showThresholdControls = thresholdVisualization?.visible ?? false

  // Note: Tooltip width measurement removed for vertical layout (tooltips now positioned to the right)

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
    sortTableByCategory(category, mode)
  }

  const handleGoBackToHistogram = () => {
    setShouldHighlightThresholdButton(false)
    restoreSimilarityTaggingPopover()
  }

  const hasAnySelection = selectionStates.size > 0

  // Calculate pair count for pair mode (to show as secondary info in header)
  const pairCount = useMemo(() => {
    if (mode !== 'pair' || !filteredFeatureIds) return undefined

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
  }, [mode, filteredFeatureIds, allClusterPairs, tagAutomaticState?.histogramData?.scores])

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
            onCategoryClick={handleCategoryClick}
            showLabels={true}
            showLegend={true}
            orientation="vertical"
            width="42px"
            height="100%"
            mode={mode}
            onCategoryRefsReady={onCategoryRefsReady}
            pairCount={pairCount}
          />

          {/* Commit History Circles - shown in pair mode when history exists */}
          {mode === 'pair' && commitHistory && commitHistory.length > 0 && onCommitClick && (
            <div className="commit-history">
              <div className="commit-history__label">History</div>
              <div className="commit-history__circles">
                {commitHistory.map((commit, index) => (
                  <button
                    key={commit.id}
                    className={`commit-history__circle ${
                      index === currentCommitIndex ? 'commit-history__circle--active' : 'commit-history__circle--past'
                    } ${
                      commit.type === 'tagAll' ? 'commit-history__circle--square' : ''
                    }`}
                    onClick={() => onCommitClick(index)}
                    title={`${commit.type === 'tagAll' ? 'Tag All' : commit.type === 'apply' ? 'Apply Tags' : 'Initial'}: ${commit.pairSelectionStates.size} tagged pairs`}
                    aria-label={`Go to commit ${index + 1}`}
                  >
                    <span className="commit-history__circle-number">{index + 1}</span>
                  </button>
                ))}
              </div>
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
export { SimpleSelectionBar }
export type { SimpleSelectionBarProps }
