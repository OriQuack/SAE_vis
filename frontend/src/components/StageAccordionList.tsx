import React, { useMemo, useCallback, type ReactNode } from 'react'
import { ScrollableItemList, type ScrollableItemListProps, type ListVariant } from './ScrollableItemList'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
import '../styles/StageAccordionList.css'

// ============================================================================
// STAGE SELECTOR LIST - Unified sorting controls + scrollable list
// ============================================================================
// Horizontal stage selector with consistent options row.
// Implements Bootstrap → Learn → Apply workflow stages.
//
// HCI/VIS Principles Applied:
// 1. Consistent Visual Treatment: All stages have same height and structure
// 2. Visual Hierarchy: Numbered stages show progression (1→2→3)
// 3. Proximity (Gestalt): Controls visually connected to list they control
// 4. Clear Affordance: Radio-style indicators show selection state
// 5. Context-Sensitive Options: Options row content varies by stage

export type ActiveStage = 'bootstrap' | 'learn' | 'apply'
export type BootstrapMode = 'diversity' | 'byScore'

// Filter option type for cause categories (optional)
interface FilterOption {
  value: string
  label: string
  color: string
}

interface StageAccordionListProps<T> {
  // Stage configuration
  activeStage: ActiveStage
  onStageChange: (stage: ActiveStage) => void

  // Bootstrap sub-options (when bootstrap is active)
  bootstrapMode: BootstrapMode
  bootstrapDirection: 'asc' | 'desc'
  onBootstrapModeChange: (mode: BootstrapMode) => void
  onBootstrapDirectionChange: (direction: 'asc' | 'desc') => void

  // Availability flags
  hasDiversityIds?: boolean  // Show Representatives option when medoids available
  learnDisabled?: boolean    // Disable Learn stage (before SVM trained)
  applyDisabled?: boolean    // Disable Apply stage (before SVM trained)

  // Labels for bootstrap "By Score" buttons
  byScoreAscLabel?: string   // e.g., "Least Similar First"
  byScoreDescLabel?: string  // e.g., "Most Similar First"

  // Hide tagged items checkbox
  hideTagged?: boolean
  onHideTaggedChange?: (value: boolean) => void

  // Optional filter section (for CauseView)
  filterOptions?: FilterOption[]
  filterValue?: string | null
  onFilterChange?: (value: string | null) => void
  filterDisabled?: boolean

  // List props (passed through to ScrollableItemList)
  variant?: ListVariant
  badges: { label: string; count: number | string }[]
  columnHeader?: {
    label: string
    sortDirection?: 'asc' | 'desc'
    onClick?: () => void
    isSortable?: boolean
    isPulsing?: boolean
  }
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  currentIndex?: number
  highlightPredicate?: (item: T, currentItem: T | null) => boolean
  isActive?: boolean
  sortConfig?: { getDisplayScore: (item: T) => number | undefined }
  pageNavigation?: {
    currentPage: number
    totalPages: number
    onPreviousPage: () => void
    onNextPage: () => void
  }
  emptyMessage?: string
  disableAutoScroll?: boolean

  className?: string
}

export function StageAccordionList<T>({
  // Stage props
  activeStage,
  onStageChange,
  bootstrapMode,
  bootstrapDirection,
  onBootstrapModeChange,
  onBootstrapDirectionChange,
  hasDiversityIds = false,
  learnDisabled = false,
  applyDisabled = false,
  byScoreAscLabel = 'Low → High',
  byScoreDescLabel = 'High → Low',
  hideTagged,
  onHideTaggedChange,
  filterOptions,
  filterValue,
  onFilterChange,
  filterDisabled = false,
  // List props
  variant,
  badges,
  columnHeader,
  items,
  renderItem,
  currentIndex = -1,
  highlightPredicate,
  isActive = false,
  sortConfig,
  pageNavigation,
  emptyMessage = 'None',
  disableAutoScroll = false,
  className = ''
}: StageAccordionListProps<T>) {
  // Handle stage tab click
  const handleStageClick = useCallback((stage: ActiveStage) => {
    if (stage === 'learn' && learnDisabled) return
    if (stage === 'apply' && applyDisabled) return
    onStageChange(stage)
  }, [onStageChange, learnDisabled, applyDisabled])

  // isTemplateSort - true when in decisionMargin asc mode (standard template)
  const isTemplateSort = useMemo(() => {
    return activeStage === 'learn'
  }, [activeStage])

  // Build list props to pass through
  const listProps: Omit<ScrollableItemListProps<T>, 'variant'> = useMemo(() => ({
    badges,
    columnHeader,
    items,
    renderItem,
    currentIndex,
    highlightPredicate,
    isActive,
    isTemplateSort,
    sortConfig,
    pageNavigation,
    emptyMessage,
    disableAutoScroll
  }), [badges, columnHeader, items, renderItem, currentIndex, highlightPredicate, isActive, isTemplateSort, sortConfig, pageNavigation, emptyMessage, disableAutoScroll])

  return (
    <div className={`stage-selector ${className}`}>
      {/* Row 1: Horizontal stage tabs */}
      <div className="stage-selector__tabs">
        <button
          className={`stage-selector__tab ${activeStage === 'bootstrap' ? 'stage-selector__tab--active' : ''}`}
          onClick={() => handleStageClick('bootstrap')}
        >
          <span className="stage-selector__indicator" />
          <span className="stage-selector__number">1.</span>
          <span className="stage-selector__label">Bootstrap</span>
        </button>
        <button
          className={`stage-selector__tab ${activeStage === 'learn' ? 'stage-selector__tab--active' : ''} ${learnDisabled ? 'stage-selector__tab--disabled' : ''}`}
          onClick={() => handleStageClick('learn')}
          disabled={learnDisabled}
          title={learnDisabled ? 'Tag 3+ items per category to enable' : undefined}
        >
          <span className="stage-selector__indicator" />
          <span className="stage-selector__number">2.</span>
          <span className="stage-selector__label">Learn</span>
        </button>
        <button
          className={`stage-selector__tab ${activeStage === 'apply' ? 'stage-selector__tab--active' : ''} ${applyDisabled ? 'stage-selector__tab--disabled' : ''}`}
          onClick={() => handleStageClick('apply')}
          disabled={applyDisabled}
          title={applyDisabled ? 'Tag 3+ items per category to enable' : undefined}
        >
          <span className="stage-selector__indicator" />
          <span className="stage-selector__number">3.</span>
          <span className="stage-selector__label">Apply</span>
        </button>
      </div>

      {/* Row 2: Options (context-sensitive) */}
      <div className="stage-selector__options">
        {activeStage === 'bootstrap' && (
          <>
            {hasDiversityIds && (
              <button
                className={`stage-selector__option-btn ${bootstrapMode === 'diversity' ? 'stage-selector__option-btn--active' : ''}`}
                onClick={() => onBootstrapModeChange('diversity')}
                title="Show diverse representative samples (cluster medoids)"
              >
                Representatives
              </button>
            )}
            <button
              className={`stage-selector__option-btn ${bootstrapMode === 'byScore' && bootstrapDirection === 'asc' ? 'stage-selector__option-btn--active' : ''}`}
              onClick={() => {
                onBootstrapModeChange('byScore')
                onBootstrapDirectionChange('asc')
              }}
            >
              {byScoreAscLabel}
            </button>
            <button
              className={`stage-selector__option-btn ${bootstrapMode === 'byScore' && bootstrapDirection === 'desc' ? 'stage-selector__option-btn--active' : ''}`}
              onClick={() => {
                onBootstrapModeChange('byScore')
                onBootstrapDirectionChange('desc')
              }}
            >
              {byScoreDescLabel}
            </button>
          </>
        )}
        {activeStage === 'learn' && (
          <button className="stage-selector__option-btn stage-selector__option-btn--active">
            Most Uncertain First
          </button>
        )}
        {activeStage === 'apply' && (
          <button className="stage-selector__option-btn stage-selector__option-btn--active">
            Most Confident First
          </button>
        )}

        {/* Spacer + Hide Tagged (always on right) */}
        <div className="stage-selector__spacer" />
        {onHideTaggedChange !== undefined && (
          <label className="stage-selector__checkbox-label">
            <input
              type="checkbox"
              checked={hideTagged ?? false}
              onChange={(e) => onHideTaggedChange(e.target.checked)}
            />
            Hide Tagged
          </label>
        )}
      </div>

      {/* Optional Filter Section (for CauseView) */}
      {filterOptions && onFilterChange && (
        <div className={`stage-selector__filter ${filterDisabled ? 'stage-selector__filter--disabled' : ''}`}>
          <span className="stage-selector__filter-label">Filter:</span>
          <button
            className={`stage-selector__filter-btn ${filterValue === null && !filterDisabled ? 'stage-selector__filter-btn--active' : ''}`}
            onClick={() => !filterDisabled && onFilterChange(null)}
            disabled={filterDisabled}
          >
            All
          </button>
          {filterOptions.map(option => (
            <button
              key={option.value}
              className={`stage-selector__filter-btn ${filterValue === option.value && !filterDisabled ? 'stage-selector__filter-btn--active' : ''}`}
              style={{ '--tag-color': option.color } as React.CSSProperties}
              onClick={() => !filterDisabled && onFilterChange(option.value)}
              disabled={filterDisabled}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable Item List */}
      <div className="stage-selector__list">
        <ScrollableItemList
          variant={variant}
          {...listProps}
        />
      </div>
    </div>
  )
}

// ============================================================================
// HELPER: Convert stage + bootstrap mode to sortMode + sortDirection
// ============================================================================
export function stageToSortConfig(
  activeStage: ActiveStage,
  bootstrapMode: BootstrapMode,
  bootstrapDirection: 'asc' | 'desc'
): { sortMode: SortMode; sortDirection: 'asc' | 'desc' } {
  switch (activeStage) {
    case 'bootstrap':
      if (bootstrapMode === 'diversity') {
        return { sortMode: 'diversity', sortDirection: 'asc' }
      }
      return { sortMode: 'default', sortDirection: bootstrapDirection }
    case 'learn':
      return { sortMode: 'decisionMargin', sortDirection: 'asc' }
    case 'apply':
      return { sortMode: 'decisionMargin', sortDirection: 'desc' }
  }
}

// ============================================================================
// HELPER: Convert sortMode + sortDirection to stage + bootstrap config
// ============================================================================
export function sortConfigToStage(
  sortMode: SortMode,
  sortDirection: 'asc' | 'desc'
): { activeStage: ActiveStage; bootstrapMode: BootstrapMode; bootstrapDirection: 'asc' | 'desc' } {
  if (sortMode === 'diversity') {
    return { activeStage: 'bootstrap', bootstrapMode: 'diversity', bootstrapDirection: 'asc' }
  }
  if (sortMode === 'default') {
    return { activeStage: 'bootstrap', bootstrapMode: 'byScore', bootstrapDirection: sortDirection }
  }
  if (sortMode === 'decisionMargin') {
    if (sortDirection === 'asc') {
      return { activeStage: 'learn', bootstrapMode: 'diversity', bootstrapDirection: 'asc' }
    }
    return { activeStage: 'apply', bootstrapMode: 'diversity', bootstrapDirection: 'asc' }
  }
  // Default fallback
  return { activeStage: 'bootstrap', bootstrapMode: 'diversity', bootstrapDirection: 'asc' }
}

export default StageAccordionList
