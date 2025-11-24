import React, { useState, useMemo, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import { type SelectionCategory } from '../lib/constants'
import { getSelectionColors } from '../lib/color-utils'
import SelectionStateBar, { type CategoryCounts } from './SelectionBar'
import '../styles/SelectionPanel.css'

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

interface SelectionPanelProps {
  mode: 'feature' | 'pair' | 'cause'
  tagLabel: string
  onDone?: () => void
  doneButtonEnabled?: boolean
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void  // Callback for flow overlay
  availablePairs?: Array<{pairKey: string, mainFeatureId: number, similarFeatureId: number}>  // Cluster-based pairs (single source of truth)
  filteredFeatureIds?: Set<number>  // Selected feature IDs from Sankey segment
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
  availablePairs,
  filteredFeatureIds: propFilteredFeatureIds
}) => {
  // State from store
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const sortTableByCategory = useVisualizationStore(state => state.sortTableByCategory)
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const restoreSimilarityTaggingPopover = useVisualizationStore(state => state.restoreSimilarityTaggingPopover)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)

  // Dependencies that change when thresholds update
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get filtered feature IDs - prefer prop if provided, otherwise use store's method
  const filteredFeatureIds = useMemo(() => {
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
      // Use cluster-based pairs if provided (single source of truth from FeatureSplitView)
      console.log('[SelectionPanel] Pair mode - availablePairs:', availablePairs?.length || 0, ', filteredFeatureIds:', filteredFeatureIds?.size || 0)
      if (availablePairs) {
        // Count from cluster pairs (matches what's displayed)
        availablePairs.forEach(pair => {
          const selectionState = pairSelectionStates.get(pair.pairKey)
          const source = pairSelectionSources.get(pair.pairKey)

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
      } else if (tableData?.features) {
        // FALLBACK: Generate pairs from decoder_similarity (for backward compatibility)
        // This path is only used when availablePairs is not provided
        const features = filteredFeatureIds
          ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
          : tableData.features

        const seenPairs = new Set<string>()

        features.forEach((feature: any) => {
          const decoderData = Array.isArray(feature.decoder_similarity) ? feature.decoder_similarity : []
          const top4Similar = decoderData.slice(0, 4)

          top4Similar.forEach((similarItem: any) => {
            const id1 = feature.feature_id
            const id2 = similarItem.feature_id

            // Skip if similarItem is not in the filtered set
            if (filteredFeatureIds && !filteredFeatureIds.has(id2)) return

            const canonicalPairKey = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`

            // Skip if we've already counted this pair
            if (seenPairs.has(canonicalPairKey)) return
            seenPairs.add(canonicalPairKey)

            // Count this pair
            const selectionState = pairSelectionStates.get(canonicalPairKey)
            const source = pairSelectionSources.get(canonicalPairKey)

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
        })
      }
    }

    const total = confirmed + expanded + rejected + autoRejected + unsure
    console.log('[SelectionPanel] Final counts:', { confirmed, expanded, rejected, autoRejected, unsure, total })
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [mode, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, causeSelectionStates, filteredFeatureIds, availablePairs])

  // Calculate preview counts when thresholds are active (real-time preview during threshold drag)
  const previewCounts = useMemo((): CategoryCounts | undefined => {
    // Only show preview for pair mode when histogram data is available
    if (mode !== 'pair' || !tagAutomaticState?.histogramData?.scores) {
      return undefined
    }

    const thresholds = {
      select: tagAutomaticState.selectThreshold,
      reject: tagAutomaticState.rejectThreshold
    }

    // Start with current counts
    let confirmed = counts.confirmed
    let expanded = counts.expanded
    let rejected = counts.rejected
    let autoRejected = counts.autoRejected
    let unsure = counts.unsure

    // Calculate how many unsure items will become expanded or auto-rejected
    let newlyExpanded = 0
    let newlyAutoRejected = 0
    let totalHistogramPairs = 0
    let filteredHistogramPairs = 0

    Object.entries(tagAutomaticState.histogramData.scores).forEach(([pairKey, score]) => {
      if (typeof score !== 'number') return
      totalHistogramPairs++

      // Filter: Only count pairs where BOTH features are in the selected segment
      if (filteredFeatureIds) {
        const [id1Str, id2Str] = pairKey.split('-')
        const id1 = parseInt(id1Str, 10)
        const id2 = parseInt(id2Str, 10)

        // Skip if either feature is not in the filtered set
        if (!filteredFeatureIds.has(id1) || !filteredFeatureIds.has(id2)) {
          return
        }
        filteredHistogramPairs++
      }

      // Check if pair is already tagged
      const isAlreadyTagged = pairSelectionStates.has(pairKey)

      // If not already tagged, apply auto-tagging based on thresholds
      if (!isAlreadyTagged) {
        if (score >= thresholds.select) {
          newlyExpanded++
        } else if (score <= thresholds.reject) {
          newlyAutoRejected++
        }
      }
    })

    // Update counts: unsure items become expanded or auto-rejected
    expanded += newlyExpanded
    autoRejected += newlyAutoRejected
    unsure -= (newlyExpanded + newlyAutoRejected)

    console.log('[SelectionPanel.previewCounts] Histogram filtering:', {
      totalHistogramPairs,
      filteredHistogramPairs,
      filteredFeatureCount: filteredFeatureIds?.size || 'all',
      newlyExpanded,
      newlyAutoRejected
    })

    const total = confirmed + expanded + rejected + autoRejected + unsure
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [counts, mode, tagAutomaticState, pairSelectionStates, filteredFeatureIds])

  // Check if threshold preview is active
  const isPreviewActive = thresholdVisualization?.visible ?? false
  const showThresholdControls = isPreviewActive && tagAutomaticState?.minimized

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

        {/* Center: Selection State Bar */}
        <div className="table-selection-panel__bar-container">
          <SelectionStateBar
            counts={counts}
            previewCounts={previewCounts}
            onCategoryClick={handleCategoryClick}
            showLabels={true}
            showLegend={true}
            orientation="vertical"
            width="42px"
            height="100%"
            mode={mode}
            onCategoryRefsReady={onCategoryRefsReady}
            featureCount={filteredFeatureIds?.size}
          />
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
