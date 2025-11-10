import React, { useState, useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  SELECTION_CATEGORY_COLORS,
  type SelectionCategory,
  METRIC_DISPLAY_NAMES
} from '../lib/constants'
import '../styles/TableSelectionPanel.css'

interface TableSelectionPanelProps {
  mode: 'feature' | 'pair'
  tagLabel: string
  onDone?: () => void
  doneButtonEnabled?: boolean
}

interface CategoryCounts {
  confirmed: number
  expanded: number
  rejected: number
  unsure: number
  total: number
}

const CATEGORY_CONFIG: Record<SelectionCategory, { label: string; color: string; description: string }> = {
  confirmed: {
    label: 'Confirmed',
    color: SELECTION_CATEGORY_COLORS.CONFIRMED.HEX,
    description: 'Manually selected by user'
  },
  expanded: {
    label: 'Expanded',
    color: SELECTION_CATEGORY_COLORS.EXPANDED.HEX,
    description: 'Auto-tagged by histogram thresholds'
  },
  rejected: {
    label: 'Rejected',
    color: SELECTION_CATEGORY_COLORS.REJECTED.HEX,
    description: 'Manually rejected by user'
  },
  unsure: {
    label: 'Unsure',
    color: SELECTION_CATEGORY_COLORS.UNSURE.HEX,
    description: 'Not selected or investigated'
  }
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
  onDone,
  doneButtonEnabled = false
}) => {
  // State from store
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const sortTableByCategory = useVisualizationStore(state => state.sortTableByCategory)
  const sortBySimilarity = useVisualizationStore(state => state.sortBySimilarity)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)
  const clearFeatureSelection = useVisualizationStore(state => state.clearFeatureSelection)
  const clearPairSelection = useVisualizationStore(state => state.clearPairSelection)
  const isSimilaritySortLoading = useVisualizationStore(state => state.isSimilaritySortLoading)
  const isPairSimilaritySortLoading = useVisualizationStore(state => state.isPairSimilaritySortLoading)
  const tableSortBy = useVisualizationStore(state => state.tableSortBy)

  // Sankey threshold info
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree)
  const selectedNode = tableSelectedNodeIds.length > 0 && sankeyTree
    ? sankeyTree.get(tableSelectedNodeIds[0])
    : null

  // Tooltip state
  const [hoveredButton, setHoveredButton] = useState<'sort' | 'tag' | null>(null)

  // Get selection states based on mode
  const selectionStates = mode === 'feature' ? featureSelectionStates : pairSelectionStates
  const selectionSources = mode === 'feature' ? featureSelectionSources : pairSelectionSources

  // Calculate category counts
  const counts = useMemo((): CategoryCounts => {
    let confirmed = 0
    let expanded = 0
    let rejected = 0
    let unsure = 0

    if (mode === 'feature' && tableData?.features) {
      tableData.features.forEach((feature: any) => {
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
          rejected++
        } else {
          unsure++
        }
      })
    } else if (mode === 'pair' && tableData?.pairs) {
      tableData.pairs.forEach((pair: any) => {
        const pairKey = pair.pairKey
        const selectionState = pairSelectionStates.get(pairKey)
        const source = pairSelectionSources.get(pairKey)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          rejected++
        } else {
          unsure++
        }
      })
    }

    const total = confirmed + expanded + rejected + unsure
    return { confirmed, expanded, rejected, unsure, total }
  }, [mode, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources])

  // Calculate percentages for bar chart
  const percentages = useMemo(() => {
    if (counts.total === 0) {
      return { confirmed: 0, expanded: 0, rejected: 0, unsure: 100 }
    }
    return {
      confirmed: (counts.confirmed / counts.total) * 100,
      expanded: (counts.expanded / counts.total) * 100,
      rejected: (counts.rejected / counts.total) * 100,
      unsure: (counts.unsure / counts.total) * 100
    }
  }, [counts])

  // Count selected and rejected for button requirements
  const selectionCounts = useMemo(() => {
    let selectedCount = 0
    let rejectedCount = 0
    selectionStates.forEach(state => {
      if (state === 'selected') selectedCount++
      else if (state === 'rejected') rejectedCount++
    })
    return { selectedCount, rejectedCount }
  }, [selectionStates])

  // Sort requirements
  const sortRequirements = { minSelected: 1, minRejected: 1 }
  const hasSelected = selectionCounts.selectedCount >= sortRequirements.minSelected
  const hasRejected = selectionCounts.rejectedCount >= sortRequirements.minRejected
  const canSortBySimilarity = hasSelected && hasRejected

  // Tag requirements
  const tagRequirements = { minSelected: 5, minRejected: 5 }
  const hasEnoughSelected = selectionCounts.selectedCount >= tagRequirements.minSelected
  const hasEnoughRejected = selectionCounts.rejectedCount >= tagRequirements.minRejected
  const canTagAutomatically = hasEnoughSelected && hasEnoughRejected

  // Check if currently sorted
  const expectedSortValue = mode === 'feature' ? 'similarity' : 'pair_similarity'
  const isSortedBySimilarity = tableSortBy === expectedSortValue

  // Loading state
  const isSortLoading = mode === 'feature' ? isSimilaritySortLoading : isPairSimilaritySortLoading

  // Handlers
  const handleSortBySimilarity = () => {
    if (mode === 'feature') {
      sortBySimilarity()
    } else {
      // For pairs, need to get all pair keys
      const allPairKeys = tableData?.pairs?.map((p: any) => p.pairKey) || []
      sortPairsBySimilarity(allPairKeys)
    }
  }

  const handleTagAutomatically = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    showSimilarityTaggingPopover(mode, {
      x: rect.left,
      y: rect.bottom + 10
    })
  }

  const handleClearSelection = () => {
    if (mode === 'feature') {
      clearFeatureSelection()
    } else {
      clearPairSelection()
    }
  }

  const handleCategoryClick = (category: SelectionCategory) => {
    console.log(`[TableSelectionPanel] Clicked category: ${category}`)
    sortTableByCategory(category, mode)
  }

  // Calculate display counts
  const currentCount = counts.total
  const totalCount = mode === 'feature'
    ? (tableData?.features?.length || 0)
    : (tableData?.pairs?.length || 0)
  const hasAnySelection = selectionStates.size > 0

  // Don't render if no table data loaded yet
  if (!tableData) {
    return null
  }

  return (
    <div className="table-selection-panel">
      {/* Simplified Header */}
      <div className="table-selection-panel__header">
        <span className="table-selection-panel__title">
          Tag: {tagLabel} • {currentCount.toLocaleString()} / {totalCount.toLocaleString()} {mode === 'feature' ? 'features' : 'pairs'}
        </span>
        {selectedNode && selectedNode.metric && selectedNode.rangeLabel && (
          <span className="table-selection-panel__threshold">
            Filter: {METRIC_DISPLAY_NAMES[selectedNode.metric] || selectedNode.metric} = {selectedNode.rangeLabel}
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
              className="table-selection-panel__button"
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
            {hoveredButton === 'sort' && (
              <div className="table-selection-panel__tooltip">
                {isSortedBySimilarity ? (
                  <div>Click to re-sort with updated selections</div>
                ) : (
                  <>
                    <div className={hasSelected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{hasSelected ? '✓' : '✗'}</span>
                      Require {sortRequirements.minSelected} selected
                    </div>
                    <div className={hasRejected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                      <span className="table-selection-panel__tooltip-icon">{hasRejected ? '✓' : '✗'}</span>
                      Require {sortRequirements.minRejected} rejected
                    </div>
                  </>
                )}
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
              className="table-selection-panel__button"
              onClick={handleTagAutomatically}
              disabled={!canTagAutomatically}
            >
              Tag Automatically
            </button>
            {hoveredButton === 'tag' && (
              <div className="table-selection-panel__tooltip">
                <div className={hasEnoughSelected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                  <span className="table-selection-panel__tooltip-icon">{hasEnoughSelected ? '✓' : '✗'}</span>
                  Require {tagRequirements.minSelected} selected
                </div>
                <div className={hasEnoughRejected ? 'table-selection-panel__tooltip-line--met' : 'table-selection-panel__tooltip-line--unmet'}>
                  <span className="table-selection-panel__tooltip-icon">{hasEnoughRejected ? '✓' : '✗'}</span>
                  Require {tagRequirements.minRejected} rejected
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Selection State Bar */}
        <div className="table-selection-panel__bar-container">
          <div className="table-selection-panel__bar">
            {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
              const percentage = percentages[category]
              const count = counts[category]
              const config = CATEGORY_CONFIG[category]

              // Don't render segment if count is 0
              if (count === 0) {
                return null
              }

              return (
                <div
                  key={category}
                  className={`table-selection-panel__segment table-selection-panel__segment--${category}`}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: config.color
                  }}
                  onClick={() => handleCategoryClick(category)}
                  title={`${config.label}: ${count} (${percentage.toFixed(1)}%) - ${config.description}`}
                >
                  {/* Show label if segment is wide enough (>10%) */}
                  {percentage > 10 && (
                    <span className="table-selection-panel__segment-label">
                      {config.label} ({count})
                    </span>
                  )}
                </div>
              )
            })}
          </div>
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
          {hasAnySelection && (
            <button
              className="table-selection-panel__button table-selection-panel__button--clear"
              onClick={handleClearSelection}
              title="Clear all selections and reset sort"
            >
              Clear ×
            </button>
          )}
        </div>
      </div>

      {/* Legend Below Bar */}
      <div className="table-selection-panel__legend">
        {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
          const count = counts[category]
          const config = CATEGORY_CONFIG[category]
          const percentage = percentages[category]

          return (
            <div key={category} className="table-selection-panel__legend-item">
              <div
                className="table-selection-panel__legend-color"
                style={{ backgroundColor: config.color }}
              />
              <span className="table-selection-panel__legend-label">
                {config.label}
              </span>
              <span className="table-selection-panel__legend-count">
                {count} ({percentage.toFixed(1)}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TableSelectionPanel
