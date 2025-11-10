import React, { useState, useMemo } from 'react'
import '../styles/FeatureSplitTable.css'

interface TableSelectionHeaderProps {
  // Mode: determines which selection states to use
  mode: 'feature' | 'pair'

  // Display text
  tagLabel: string  // e.g., "Well-Explained" or "Feature Splitting"

  // Counts
  currentCount: number
  totalCount: number

  // Selection states
  selectionStates: Map<number | string, 'selected' | 'rejected'>

  // Actions
  onSortBySimilarity: () => void
  onClearSelection: () => void
  onShowTaggingPopover: (mode: 'feature' | 'pair', position: {x: number, y: number}) => void

  // Loading states
  isSortLoading: boolean

  // Sort requirements (for tooltip display)
  sortRequirements: {
    minSelected: number    // 1 for both
    minRejected: number    // 1 for both
  }

  // Tag requirements (for tooltip display)
  tagRequirements: {
    minSelected: number    // 5 for both
    minRejected: number    // 5 for both
  }

  // Current sort state (for showing "Sorted ✓")
  currentSortBy?: string | null
  expectedSortValue?: string  // 'pair_similarity' or 'similarity'
}

const TableSelectionHeader: React.FC<TableSelectionHeaderProps> = ({
  mode,
  tagLabel,
  currentCount,
  totalCount,
  selectionStates,
  onSortBySimilarity,
  onClearSelection,
  onShowTaggingPopover,
  isSortLoading,
  sortRequirements,
  tagRequirements,
  currentSortBy = null,
  expectedSortValue
}) => {
  // Tooltip state for sort/tag buttons
  const [hoveredButton, setHoveredButton] = useState<'sort' | 'tag' | null>(null)

  // Count selected and rejected items
  const selectionCounts = useMemo(() => {
    let selectedCount = 0
    let rejectedCount = 0
    selectionStates.forEach(state => {
      if (state === 'selected') selectedCount++
      else if (state === 'rejected') rejectedCount++
    })
    return { selectedCount, rejectedCount }
  }, [selectionStates])

  // Sort by Similarity requirements
  const hasSelected = selectionCounts.selectedCount >= sortRequirements.minSelected
  const hasRejected = selectionCounts.rejectedCount >= sortRequirements.minRejected
  // Allow sorting whenever requirements are met (even if already sorted - user may have changed selections)
  const canSortBySimilarity = hasSelected && hasRejected

  // Tag Automatically requirements
  const hasEnoughSelected = selectionCounts.selectedCount >= tagRequirements.minSelected
  const hasEnoughRejected = selectionCounts.rejectedCount >= tagRequirements.minRejected
  const canTagAutomatically = hasEnoughSelected && hasEnoughRejected

  // Check if currently sorted by similarity
  const isSortedBySimilarity = currentSortBy === expectedSortValue

  return (
    <div className="decoder-stage-table__selection-header">
      <span className="decoder-stage-table__selection-count">
        Tag: {tagLabel} • {currentCount.toLocaleString()} / {totalCount.toLocaleString()} {mode === 'feature' ? 'features' : 'pairs'}
        {selectionStates.size > 0 && (
          <span style={{ marginLeft: '12px', opacity: 0.8 }}>
            Selected: {selectionCounts.selectedCount} |
            Rejected: {selectionCounts.rejectedCount}
          </span>
        )}
      </span>
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Sort by Similarity button with custom tooltip */}
        <div
          style={{ position: 'relative', display: 'inline-block' }}
          onMouseEnter={() => setHoveredButton('sort')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <button
            className="decoder-stage-table__sort-button"
            onClick={onSortBySimilarity}
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
            <div className="decoder-stage-table__tooltip">
              {isSortedBySimilarity ? (
                <div>Click to re-sort with updated selections</div>
              ) : (
                <>
                  <div className={hasSelected ? 'decoder-stage-table__tooltip-line--met' : 'decoder-stage-table__tooltip-line--unmet'}>
                    <span className="decoder-stage-table__tooltip-icon">{hasSelected ? '✓' : '✗'}</span>
                    Require {sortRequirements.minSelected} selected
                  </div>
                  <div className={hasRejected ? 'decoder-stage-table__tooltip-line--met' : 'decoder-stage-table__tooltip-line--unmet'}>
                    <span className="decoder-stage-table__tooltip-icon">{hasRejected ? '✓' : '✗'}</span>
                    Require {sortRequirements.minRejected} rejected
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Tag Automatically button with custom tooltip */}
        <div
          style={{ position: 'relative', display: 'inline-block' }}
          onMouseEnter={() => setHoveredButton('tag')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <button
            className="decoder-stage-table__sort-button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              onShowTaggingPopover(mode, {
                x: rect.left,
                y: rect.bottom + 10
              })
            }}
            disabled={!canTagAutomatically}
          >
            Tag Automatically
          </button>
          {hoveredButton === 'tag' && (
            <div className="decoder-stage-table__tooltip">
              <div className={hasEnoughSelected ? 'decoder-stage-table__tooltip-line--met' : 'decoder-stage-table__tooltip-line--unmet'}>
                <span className="decoder-stage-table__tooltip-icon">{hasEnoughSelected ? '✓' : '✗'}</span>
                Require {tagRequirements.minSelected} selected
              </div>
              <div className={hasEnoughRejected ? 'decoder-stage-table__tooltip-line--met' : 'decoder-stage-table__tooltip-line--unmet'}>
                <span className="decoder-stage-table__tooltip-icon">{hasEnoughRejected ? '✓' : '✗'}</span>
                Require {tagRequirements.minRejected} rejected
              </div>
            </div>
          )}
        </div>

        {/* Clear selection button */}
        {selectionStates.size > 0 && (
          <button
            className="decoder-stage-table__clear-selection"
            onClick={onClearSelection}
            title="Clear all selections and reset sort"
          >
            Clear ×
          </button>
        )}
      </div>
    </div>
  )
}

export default TableSelectionHeader
