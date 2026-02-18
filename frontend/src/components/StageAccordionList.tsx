import { useMemo, useCallback, type ReactNode } from 'react'
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

interface StageAccordionListProps<T> {
  // Stage configuration
  activeStage: ActiveStage
  onStageChange: (stage: ActiveStage) => void

  // Bootstrap sub-options (when bootstrap is active)
  bootstrapMode: BootstrapMode
  bootstrapDirection?: 'asc' | 'desc'  // Kept for backward compatibility (direction controlled by column header)
  onBootstrapModeChange: (mode: BootstrapMode) => void
  onBootstrapDirectionChange?: (direction: 'asc' | 'desc') => void  // Kept for backward compatibility
  // Combined handler for cycling - receives mode only (direction controlled by column header)
  onBootstrapOptionChange?: (mode: BootstrapMode) => void

  // Availability flags
  hasDiversityIds?: boolean  // Show Representatives option when medoids available
  learnDisabled?: boolean    // Disable Learn stage (before SVM trained)
  applyDisabled?: boolean    // Disable Apply stage (before SVM trained)

  // Smart pulsing flags (optional - overrides default pulsing behavior)
  shouldPulseLearn?: boolean   // Pulse Train tab when user has viewed most representatives
  shouldPulseApply?: boolean   // Pulse Apply tab when flip rate is stable (<3% for 5 iterations)

  // Labels for bootstrap options
  diversityLabel?: string    // e.g., "Most Critical 20" (defaults to "Representatives")
  byScoreLabel?: string      // e.g., "Similarity", "Quality Score" (single metric name)

  // Hide tagged items checkbox
  hideTagged?: boolean
  onHideTaggedChange?: (value: boolean) => void

  // QBC disagreement filter
  showDisagreementOnly?: boolean
  onShowDisagreementOnlyChange?: (value: boolean) => void
  hasDisagreementData?: boolean  // Only show when committee votes available

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
  emptyMessage?: string
  disableAutoScroll?: boolean

  // External scroll target index - triggers scroll from subview clicks
  scrollTargetIndex?: number

  className?: string
}

export function StageAccordionList<T>({
  // Stage props
  activeStage,
  onStageChange,
  bootstrapMode,
  bootstrapDirection: _bootstrapDirection,
  onBootstrapModeChange,
  onBootstrapDirectionChange: _onBootstrapDirectionChange,
  onBootstrapOptionChange,
  hasDiversityIds = false,
  learnDisabled = false,
  applyDisabled = false,
  shouldPulseLearn,
  shouldPulseApply,
  diversityLabel = 'Most Critical 20',
  byScoreLabel = 'Score',
  hideTagged,
  onHideTaggedChange,
  showDisagreementOnly,
  onShowDisagreementOnlyChange,
  hasDisagreementData = false,
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
  emptyMessage = 'None',
  disableAutoScroll = false,
  scrollTargetIndex,
  className = ''
}: StageAccordionListProps<T>) {
  // Consume unused props for backward compatibility
  void _bootstrapDirection
  void _onBootstrapDirectionChange

  // Handle stage tab click
  const handleStageClick = useCallback((stage: ActiveStage) => {
    if (stage === 'learn' && learnDisabled) return
    if (stage === 'apply' && applyDisabled) return
    onStageChange(stage)
  }, [onStageChange, learnDisabled, applyDisabled])

  // Build bootstrap option buttons
  const bootstrapOptions = useMemo(() => {
    const options: Array<{ mode: BootstrapMode; label: string }> = []
    if (hasDiversityIds) {
      options.push({ mode: 'diversity', label: diversityLabel })
    }
    options.push({ mode: 'byScore', label: byScoreLabel })
    return options
  }, [hasDiversityIds, diversityLabel, byScoreLabel])

  // isTemplateSort - true when in decisionMargin asc mode (standard template)
  const isTemplateSort = useMemo(() => {
    return activeStage === 'learn'
  }, [activeStage])

  // Build list props to pass through
  // Column header is clickable ONLY in Bootstrap + byScore mode (for toggling sort direction)
  // In Learn/Apply stages, column header is NOT clickable (fixed labels)
  const listProps: Omit<ScrollableItemListProps<T>, 'variant'> = useMemo(() => {
    const isBootstrapByScore = activeStage === 'bootstrap' && bootstrapMode === 'byScore'
    const columnHeaderForList = columnHeader ? {
      label: columnHeader.label,
      sortDirection: columnHeader.sortDirection,
      // Only include onClick and isSortable in Bootstrap + byScore mode
      ...(isBootstrapByScore ? {
        onClick: columnHeader.onClick,
        isSortable: columnHeader.isSortable
      } : {})
    } : undefined

    return {
      badges,
      columnHeader: columnHeaderForList,
      items,
      renderItem,
      currentIndex,
      highlightPredicate,
      isActive,
      isTemplateSort,
      sortConfig,
      emptyMessage,
      disableAutoScroll,
      scrollTargetIndex
    }
  }, [badges, columnHeader, items, renderItem, currentIndex, highlightPredicate, isActive, isTemplateSort, sortConfig, emptyMessage, disableAutoScroll, scrollTargetIndex, activeStage, bootstrapMode])

  return (
    <div className={`stage-selector ${className}`}>
      {/* Row 1: Horizontal stage tabs */}
      <div className="stage-selector__tabs">
        <button
          className={`stage-selector__tab ${activeStage === 'bootstrap' ? 'stage-selector__tab--active' : ''}`}
          onClick={() => handleStageClick('bootstrap')}
        >
          <span className="stage-selector__number">1</span>
          <span className="stage-selector__label">Prototype</span>
        </button>
        <button
          className={`stage-selector__tab ${activeStage === 'learn' ? 'stage-selector__tab--active' : ''} ${learnDisabled ? 'stage-selector__tab--disabled' : ''} ${shouldPulseLearn && activeStage === 'bootstrap' && !learnDisabled ? 'stage-selector__tab--pulsing' : ''}`}
          onClick={() => handleStageClick('learn')}
          disabled={learnDisabled}
          title={learnDisabled ? 'Tag 3+ items per category to enable' : undefined}
        >
          <span className="stage-selector__number">2</span>
          <span className="stage-selector__label">Uncertainty</span>
        </button>
        <button
          className={`stage-selector__tab ${activeStage === 'apply' ? 'stage-selector__tab--active' : ''} ${applyDisabled ? 'stage-selector__tab--disabled' : ''} ${shouldPulseApply && activeStage === 'learn' ? 'stage-selector__tab--pulsing' : ''}`}
          onClick={() => handleStageClick('apply')}
          disabled={applyDisabled}
          title={applyDisabled ? 'Tag 3+ items per category to enable' : undefined}
        >
          <span className="stage-selector__number">3</span>
          <span className="stage-selector__label">Disagreement</span>
        </button>
      </div>

      {/* Row 2: Sort option toggle (phase-dependent) */}
      <div className="stage-selector__options">
        <div className="stage-selector__toggle-group">
          {activeStage === 'bootstrap' && bootstrapOptions.map(opt => (
            <button
              key={opt.mode}
              className={`stage-selector__option-btn ${opt.mode === bootstrapMode ? 'stage-selector__option-btn--active' : ''}`}
              onClick={() => {
                if (onBootstrapOptionChange) {
                  onBootstrapOptionChange(opt.mode)
                } else {
                  onBootstrapModeChange(opt.mode)
                }
              }}
            >
              {opt.label}
            </button>
          ))}
          {activeStage === 'learn' && (
            <button className="stage-selector__option-btn stage-selector__option-btn--active" disabled>
              Most Uncertain First
            </button>
          )}
          {activeStage === 'apply' && (
            <button className="stage-selector__option-btn stage-selector__option-btn--active" disabled>
              Most Confident First
            </button>
          )}
        </div>
      </div>

      {/* Row 3: Checkboxes (below cycle, above list) */}
      {(onHideTaggedChange !== undefined || (hasDisagreementData && onShowDisagreementOnlyChange !== undefined)) && (
        <div className="stage-selector__checkboxes">
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
          {activeStage === 'apply' && hasDisagreementData && onShowDisagreementOnlyChange !== undefined && (
            <label className="stage-selector__checkbox-label">
              <input
                type="checkbox"
                checked={showDisagreementOnly ?? false}
                onChange={(e) => onShowDisagreementOnlyChange(e.target.checked)}
              />
              Disagreement Only
            </label>
          )}
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
