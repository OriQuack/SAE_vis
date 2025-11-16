import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  type SelectionCategory,
  METRIC_DISPLAY_NAMES
} from '../lib/constants'
import SelectionStateBar, { type CategoryCounts } from './TableSelectionBar'
import '../styles/TableSelectionPanel.css'

interface TableSelectionPanelProps {
  mode: 'feature' | 'pair' | 'cause'
  tagLabel: string
  instruction?: string
  onDone?: () => void
  doneButtonEnabled?: boolean
}

/**
 * TableSelectionPanel - Unified header showing table info, action buttons, and selection state bar
 *
 * Combines:
 * - Table header (tag name, count, Sankey threshold)
 * - Action buttons (Sort, Tag, Done, Clear)
 * - Selection state bar (4-category visualization)
 */
const TableSelectionPanel: React.FC<TableSelectionPanelProps> = ({
  mode,
  tagLabel,
  instruction,
  onDone,
  doneButtonEnabled = false
}) => {
  // State from store
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const sortTableByCategory = useVisualizationStore(state => state.sortTableByCategory)
  const sortBySimilarity = useVisualizationStore(state => state.sortBySimilarity)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const sortCauseBySimilarity = useVisualizationStore(state => state.sortCauseBySimilarity)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)
  const clearFeatureSelection = useVisualizationStore(state => state.clearFeatureSelection)
  const clearPairSelection = useVisualizationStore(state => state.clearPairSelection)
  const clearCauseSelection = useVisualizationStore(state => state.clearCauseSelection)
  const isSimilaritySortLoading = useVisualizationStore(state => state.isSimilaritySortLoading)
  const isPairSimilaritySortLoading = useVisualizationStore(state => state.isPairSimilaritySortLoading)
  const isCauseSimilaritySortLoading = useVisualizationStore(state => state.isCauseSimilaritySortLoading)
  const tableSortBy = useVisualizationStore(state => state.tableSortBy)

  // Sankey threshold info - use different node ID based on mode
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree)

  // For feature/cause mode, use tableSelectedNodeIds; for pair mode, use activeStageNodeId
  const selectedNode = useMemo(() => {
    if (!sankeyTree) return null

    if (mode === 'pair') {
      // Pair mode (feature split) uses activeStageNodeId
      return activeStageNodeId ? sankeyTree.get(activeStageNodeId) : null
    } else {
      // Feature and cause modes use tableSelectedNodeIds
      return tableSelectedNodeIds.length > 0 ? sankeyTree.get(tableSelectedNodeIds[0]) : null
    }
  }, [mode, tableSelectedNodeIds, activeStageNodeId, sankeyTree])

  // Tooltip state
  const [hoveredButton, setHoveredButton] = useState<'sort' | 'tag' | null>(null)

  // Category dropdown state for cause mode
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)

  // Button refs for measuring width
  const sortButtonRef = useRef<HTMLButtonElement>(null)
  const tagButtonRef = useRef<HTMLButtonElement>(null)

  // Button widths for tooltip sizing (button width + 4px)
  const [sortTooltipWidth, setSortTooltipWidth] = useState<number | null>(null)
  const [tagTooltipWidth, setTagTooltipWidth] = useState<number | null>(null)

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

    // Get filtered feature IDs from selected node
    // For decoder similarity stages, collect from all children if they exist
    let filteredFeatureIds: Set<number> | null = null
    if (selectedNode) {
      filteredFeatureIds = new Set<number>()

      if (selectedNode.children && selectedNode.children.length > 0) {
        // Collect from all child nodes (for split stages)
        selectedNode.children.forEach(childId => {
          const childNode = sankeyTree.get(childId)
          if (childNode?.featureIds) {
            childNode.featureIds.forEach(fid => filteredFeatureIds!.add(fid))
          }
        })
      } else {
        // Use node's own featureIds
        selectedNode.featureIds.forEach(fid => filteredFeatureIds!.add(fid))
      }
    }

    if (mode === 'feature' && tableData?.features) {
      // Filter features to only those in the selected node
      const features = filteredFeatureIds
        ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
        : tableData.features

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
    } else if (mode === 'pair' && tableData?.features) {
      // Filter features to only those in the selected node
      const features = filteredFeatureIds
        ? tableData.features.filter((f: any) => filteredFeatureIds!.has(f.feature_id))
        : tableData.features

      // Generate pairs dynamically from decoder_similarity (same logic as FeatureSplitTable)
      const seenPairs = new Set<string>()

      features.forEach((feature: any) => {
        const decoderData = Array.isArray(feature.decoder_similarity) ? feature.decoder_similarity : []
        const top4Similar = decoderData.slice(0, 4)

        top4Similar.forEach((similarItem: any) => {
          const id1 = feature.feature_id
          const id2 = similarItem.feature_id
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

    const total = confirmed + expanded + rejected + autoRejected + unsure
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [mode, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, causeSelectionStates, selectedNode, sankeyTree])

  // Count selected and rejected for button requirements
  const selectionCounts = useMemo(() => {
    if (mode === 'cause') {
      // For cause mode, count each category (3 explicit + unsure for untagged)
      let noisyActivationCount = 0
      let missedLexiconCount = 0
      let missedContextCount = 0

      causeSelectionStates.forEach(state => {
        if (state === 'noisy-activation') noisyActivationCount++
        else if (state === 'missed-lexicon') missedLexiconCount++
        else if (state === 'missed-context') missedContextCount++
      })

      // Calculate unsure count: features not in causeSelectionStates map
      // Get total feature count from tableData or selectedNode
      const totalFeatures = tableData?.features?.length || 0
      const taggedFeatures = causeSelectionStates.size
      const unsureCount = totalFeatures - taggedFeatures

      // Count how many categories have at least 1 feature (only count explicit 3 categories)
      const categoriesWithFeatures = [
        noisyActivationCount > 0 ? 1 : 0,
        missedLexiconCount > 0 ? 1 : 0,
        missedContextCount > 0 ? 1 : 0
      ].reduce((sum, val) => sum + val, 0)

      // Return counts for cause categories
      return {
        selectedCount: categoriesWithFeatures, // Number of explicit categories with ≥1 feature
        rejectedCount: categoriesWithFeatures, // Same value (for button logic)
        causeCategories: {
          noisyActivation: noisyActivationCount,
          missedLexicon: missedLexiconCount,
          missedContext: missedContextCount,
          unsure: unsureCount
        },
        // Individual category flags for tooltip
        hasNoisyActivation: noisyActivationCount >= 1,
        hasMissedLexicon: missedLexiconCount >= 1,
        hasMissedContext: missedContextCount >= 1
      }
    } else {
      // For feature/pair mode, count selected/rejected
      let selectedCount = 0
      let rejectedCount = 0
      selectionStates.forEach(state => {
        if (state === 'selected') selectedCount++
        else if (state === 'rejected') rejectedCount++
      })
      return { selectedCount, rejectedCount }
    }
  }, [mode, selectionStates, causeSelectionStates, tableData?.features?.length])

  // Sort requirements (different for cause mode)
  const sortRequirements = mode === 'cause'
    ? { minSelected: 3, minRejected: 3 } // For cause: need ALL 3 categories with at least 1 feature each
    : { minSelected: 1, minRejected: 1 } // For feature/pair: need ≥1 selected and ≥1 rejected
  const hasSelected = selectionCounts.selectedCount >= sortRequirements.minSelected
  const hasRejected = selectionCounts.rejectedCount >= sortRequirements.minRejected
  const canSortBySimilarity = hasSelected && hasRejected

  // Tag requirements (different for cause mode)
  const tagRequirements = mode === 'cause'
    ? { minSelected: 2, minRejected: 2 } // For cause: need ≥2 categories with ≥3 features each
    : { minSelected: 5, minRejected: 5 } // For feature/pair: need ≥5 selected and ≥5 rejected

  let canTagAutomatically = false
  if (mode === 'cause' && selectionCounts.causeCategories) {
    // For cause mode: require at least 2 explicit categories with ≥3 features each
    // (unsure/untagged not counted toward this requirement)
    const categoriesWith3Plus = [
      selectionCounts.causeCategories.noisyActivation >= 3 ? 1 : 0,
      selectionCounts.causeCategories.missedLexicon >= 3 ? 1 : 0,
      selectionCounts.causeCategories.missedContext >= 3 ? 1 : 0
    ].reduce((sum, val) => sum + val, 0)
    canTagAutomatically = categoriesWith3Plus >= 2
  } else {
    const hasEnoughSelected = selectionCounts.selectedCount >= tagRequirements.minSelected
    const hasEnoughRejected = selectionCounts.rejectedCount >= tagRequirements.minRejected
    canTagAutomatically = hasEnoughSelected && hasEnoughRejected
  }

  // Check if currently sorted
  const expectedSortValue = mode === 'feature' ? 'similarity'
                          : mode === 'pair' ? 'pair_similarity'
                          : 'cause_similarity'
  const isSortedBySimilarity = tableSortBy === expectedSortValue

  // Loading state
  const isSortLoading = mode === 'feature' ? isSimilaritySortLoading
                      : mode === 'pair' ? isPairSimilaritySortLoading
                      : isCauseSimilaritySortLoading

  // Measure button widths on mount and when text changes
  useEffect(() => {
    if (sortButtonRef.current) {
      setSortTooltipWidth(sortButtonRef.current.offsetWidth + 20)
    }
    if (tagButtonRef.current) {
      setTagTooltipWidth(tagButtonRef.current.offsetWidth + 20)
    }
  }, [isSortLoading, canSortBySimilarity, canTagAutomatically])

  // Handlers
  const handleSortBySimilarity = () => {
    if (mode === 'feature') {
      sortBySimilarity()
    } else if (mode === 'pair') {
      // For pairs, need to get all pair keys
      const allPairKeys = tableData?.pairs?.map((p: any) => p.pairKey) || []
      sortPairsBySimilarity(allPairKeys)
    } else {
      // For cause mode, show dropdown to select category
      setShowCategoryDropdown(!showCategoryDropdown)
    }
  }

  const handleCategorySelect = (_category: string | null) => {
    // Close dropdown
    setShowCategoryDropdown(false)
    // Run similarity sort
    sortCauseBySimilarity()
  }

  const handleTagAutomatically = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    showSimilarityTaggingPopover(mode, {
      x: rect.left,
      y: rect.bottom + 10
    }, tagLabel)
  }

  const handleClearSelection = () => {
    if (mode === 'feature') {
      clearFeatureSelection()
    } else if (mode === 'pair') {
      clearPairSelection()
    } else {
      clearCauseSelection()
    }
  }

  const handleCategoryClick = (category: SelectionCategory) => {
    console.log(`[TableSelectionPanel] Clicked category: ${category}`)
    sortTableByCategory(category, mode)
  }

  const hasAnySelection = selectionStates.size > 0

  // Don't render if no table data loaded yet
  if (!tableData) {
    return null
  }

  return (
    <div className="table-selection-panel">
      {/* Simplified Header */}
      <div className="table-selection-panel__header">
        <div className="table-selection-panel__header-row">
          <h3 className="table-selection-panel__title">
            {tagLabel}
          </h3>
          {instruction && (
            <p className="table-selection-panel__instruction">
              {instruction}
            </p>
          )}
        </div>
        {selectedNode && selectedNode.metric && selectedNode.rangeLabel && (
          <span className="table-selection-panel__threshold">
            Filter: {METRIC_DISPLAY_NAMES[selectedNode.metric as keyof typeof METRIC_DISPLAY_NAMES] || selectedNode.metric} = {selectedNode.rangeLabel}
          </span>
        )}
      </div>

      {/* Actions Row: Buttons + Bar + Buttons */}
      <div className="table-selection-panel__actions">
        {/* Left Actions: Sort & Tag */}
        <div className="table-selection-panel__left-actions">
          {/* Sort by Similarity Button */}
          <div
            className="table-selection-panel__button-wrapper"
            onMouseEnter={() => setHoveredButton('sort')}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <button
              ref={sortButtonRef}
              className={`table-selection-panel__button ${canSortBySimilarity && !isSortLoading ? 'table-selection-panel__button--available' : ''}`}
              onClick={handleSortBySimilarity}
              disabled={isSortLoading || !canSortBySimilarity}
            >
              {isSortLoading ? (
                <>
                  <span className="spinner-mini" /> Sorting...
                </>
              ) : (
                'Sort by Similarity'
              )}
            </button>
            {hoveredButton === 'sort' && !showCategoryDropdown && (
              <div
                className="table-selection-panel__tooltip"
                style={{ width: sortTooltipWidth ? `${sortTooltipWidth}px` : undefined }}
              >
                {isSortedBySimilarity ? (
                  <div>Click to sort with updated selections</div>
                ) : mode === 'cause' ? (
                  <>
                    <div className={(selectionCounts as any).hasNoisyActivation ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts as any).hasNoisyActivation ? '✓' : '✗'}</span>
                      ≥1 Noisy Activation
                    </div>
                    <div className={(selectionCounts as any).hasMissedLexicon ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts as any).hasMissedLexicon ? '✓' : '✗'}</span>
                      ≥1 Missed Lexicon
                    </div>
                    <div className={(selectionCounts as any).hasMissedContext ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts as any).hasMissedContext ? '✓' : '✗'}</span>
                      ≥1 Missed Context
                    </div>
                  </>
                ) : (
                  <>
                    <div className={hasSelected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{hasSelected ? '✓' : '✗'}</span>
                      ≥{sortRequirements.minSelected} Selected
                    </div>
                    <div className={hasRejected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{hasRejected ? '✓' : '✗'}</span>
                      ≥{sortRequirements.minRejected} Rejected
                    </div>
                  </>
                )}
              </div>
            )}
            {showCategoryDropdown && mode === 'cause' && (
              <div
                className="table-selection-panel__tooltip table-selection-panel__category-dropdown"
                style={{ width: sortTooltipWidth ? `${sortTooltipWidth}px` : undefined }}
              >
                <div className="table-selection-panel__tooltip-header">Select category to sort by:</div>
                <button
                  className="table-selection-panel__category-option"
                  onClick={() => handleCategorySelect('noisy-activation')}
                >
                  Noisy Activation
                </button>
                <button
                  className="table-selection-panel__category-option"
                  onClick={() => handleCategorySelect('missed-lexicon')}
                >
                  Missed Lexicon
                </button>
                <button
                  className="table-selection-panel__category-option"
                  onClick={() => handleCategorySelect('missed-context')}
                >
                  Missed Context
                </button>
                <button
                  className="table-selection-panel__category-option"
                  onClick={() => handleCategorySelect(null)}
                >
                  Max Confidence
                </button>
              </div>
            )}
          </div>

          {/* Tag Automatically Button */}
          <div
            className="table-selection-panel__button-wrapper"
            onMouseEnter={() => setHoveredButton('tag')}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <button
              ref={tagButtonRef}
              className={`table-selection-panel__button ${canTagAutomatically ? 'table-selection-panel__button--available' : ''}`}
              onClick={handleTagAutomatically}
              disabled={!canTagAutomatically}
            >
              Tag Automatically
            </button>
            {hoveredButton === 'tag' && (
              <div
                className="table-selection-panel__tooltip"
                style={{ width: tagTooltipWidth ? `${tagTooltipWidth}px` : undefined }}
              >
                {mode === 'cause' ? (
                  <>
                    <div className={(selectionCounts.causeCategories?.noisyActivation ?? 0) >= 3 ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts.causeCategories?.noisyActivation ?? 0) >= 3 ? '✓' : '✗'}</span>
                      ≥3 Noisy Activation
                    </div>
                    <div className={(selectionCounts.causeCategories?.missedLexicon ?? 0) >= 3 ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts.causeCategories?.missedLexicon ?? 0) >= 3 ? '✓' : '✗'}</span>
                      ≥3 Missed Lexicon
                    </div>
                    <div className={(selectionCounts.causeCategories?.missedContext ?? 0) >= 3 ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{(selectionCounts.causeCategories?.missedContext ?? 0) >= 3 ? '✓' : '✗'}</span>
                      ≥3 Missed Context
                    </div>
                  </>
                ) : (
                  <>
                    <div className={selectionCounts.selectedCount >= tagRequirements.minSelected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{selectionCounts.selectedCount >= tagRequirements.minSelected ? '✓' : '✗'}</span>
                      ≥{tagRequirements.minSelected} Selected
                    </div>
                    <div className={selectionCounts.rejectedCount >= tagRequirements.minRejected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{selectionCounts.rejectedCount >= tagRequirements.minRejected ? '✓' : '✗'}</span>
                      ≥{tagRequirements.minRejected} Rejected
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Selection State Bar */}
        <div className="table-selection-panel__bar-container">
          <SelectionStateBar
            counts={counts}
            onCategoryClick={handleCategoryClick}
            showLabels={true}
            showLegend={true}
            height={24}
            mode={mode}
          />
        </div>

        {/* Right Actions: Done & Clear */}
        <div className="table-selection-panel__right-actions">
          {/* Done Button */}
          {onDone && (
            <button
              className="table-selection-panel__button table-selection-panel__button--done"
              onClick={onDone}
              disabled={!hasAnySelection || !doneButtonEnabled}
              title={!doneButtonEnabled ? "Next step not available for this stage" : !hasAnySelection ? "Make at least one selection to proceed" : "Proceed to next stage"}
            >
              Done
            </button>
          )}

          {/* Clear Button */}
          <button
            className="table-selection-panel__button table-selection-panel__button--clear"
            onClick={handleClearSelection}
            disabled={!hasAnySelection}
            title={!hasAnySelection ? "No selections to clear" : "Clear all selections and reset sort"}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

export default TableSelectionPanel
