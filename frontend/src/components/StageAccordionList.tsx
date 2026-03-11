import { useMemo, useCallback, useRef, useState, useEffect, type ReactNode } from 'react'
import { ScrollableItemList, type ScrollableItemListProps, type ListVariant } from './ScrollableItemList'
import GuidancePopover from './GuidancePopover'
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

  // Popover flag: show popover at Uncertainty tab when all reps visited
  showLearnPopover?: boolean

  // Labels for bootstrap options
  diversityLabel?: string    // e.g., "Most Critical 20" (defaults to "Representatives")
  byScoreLabel?: string      // e.g., "Similarity", "Quality Score" (single metric name)

  // Hide tagged items checkbox
  hideTagged?: boolean
  onHideTaggedChange?: (value: boolean) => void
  allItemsLabeled?: boolean  // All items (unfiltered) have been labeled

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
  }
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  currentIndex?: number
  highlightPredicate?: (item: T, currentItem: T | null) => boolean
  isActive?: boolean
  sortConfig?: { getDisplayScore: (item: T) => number | undefined }
  emptyMessage?: ReactNode
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
  showLearnPopover,
  diversityLabel = 'Most Critical 20',
  byScoreLabel = 'Score',
  hideTagged,
  onHideTaggedChange,
  allItemsLabeled: _allItemsLabeled = false,
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
  emptyMessage,
  disableAutoScroll = false,
  scrollTargetIndex,
  className = ''
}: StageAccordionListProps<T>) {
  // Consume unused props for backward compatibility
  void _bootstrapDirection
  void _onBootstrapDirectionChange

  // Refs for popover anchors
  const learnTabRef = useRef<HTMLButtonElement>(null)
  const byScoreRef = useRef<HTMLButtonElement>(null)

  // Popover dismissal state — reset when condition goes away so it can reappear
  const [learnPopoverDismissed, setLearnPopoverDismissed] = useState(false)
  useEffect(() => {
    if (!showLearnPopover) setLearnPopoverDismissed(false)
  }, [showLearnPopover])

  // Separate dismiss state for SVM-ready popover (byScore mode)
  const [svmReadyPopoverDismissed, setSvmReadyPopoverDismissed] = useState(false)
  useEffect(() => {
    if (learnDisabled) setSvmReadyPopoverDismissed(false)
  }, [learnDisabled])

  const showLearnTabPopover = showLearnPopover && activeStage === 'bootstrap' && !learnDisabled && !learnPopoverDismissed
  const showMetricPopover = showLearnPopover && activeStage === 'bootstrap' && learnDisabled && !learnPopoverDismissed
  const showSvmReadyPopover = activeStage === 'bootstrap' && bootstrapMode === 'byScore' && !learnDisabled && !svmReadyPopoverDismissed && !showLearnTabPopover

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

  // Compute stage-aware empty message
  const computedEmptyMessage = useMemo(() => {
    if (emptyMessage) return emptyMessage

    const itemLabel = variant === 'allPairs' ? 'pairs' : 'features'
    const line1 = `No ${itemLabel} to display`

    const hints: string[] = []
    if (showDisagreementOnly) hints.push('uncheck "Disagreement Only"')
    if (activeStage === 'apply' || activeStage === 'learn') hints.push('adjust the threshold range')
    if (hideTagged) hints.push(`uncheck "Hide Labeled" to review labeled ${itemLabel}`)

    if (hints.length === 0) return line1

    const joined = hints[0].charAt(0).toUpperCase() + hints[0].slice(1)
      + (hints.length > 1 ? ', or ' + hints.slice(1).join(', or ') : '')

    return (
      <>
        <span>{line1}</span>
        <span className="scrollable-list__empty-subtext">{joined}</span>
      </>
    )
  }, [emptyMessage, variant, activeStage, hideTagged, showDisagreementOnly])

  // Build list props to pass through
  // Column header is clickable ONLY in Bootstrap + byScore mode (for toggling sort direction)
  // In Learn/Apply stages, column header is NOT clickable (fixed labels)
  const listProps: Omit<ScrollableItemListProps<T>, 'variant'> = useMemo(() => {
    const isHeaderClickable = (activeStage === 'bootstrap' && bootstrapMode === 'byScore') || activeStage === 'apply'
    const columnHeaderForList = columnHeader ? {
      label: columnHeader.label,
      sortDirection: columnHeader.sortDirection,
      ...(isHeaderClickable ? {
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
      emptyMessage: computedEmptyMessage,
      disableAutoScroll,
      scrollTargetIndex
    }
  }, [badges, columnHeader, items, renderItem, currentIndex, highlightPredicate, isActive, isTemplateSort, sortConfig, computedEmptyMessage, disableAutoScroll, scrollTargetIndex, activeStage, bootstrapMode])

  return (
    <div className={`stage-selector ${className}`}>
      {/* Row 1: Horizontal stage tabs */}
      <div className="stage-selector__tabs">
        <button
          className={`stage-selector__tab ${activeStage === 'bootstrap' ? 'stage-selector__tab--active' : ''}`}
          onClick={() => handleStageClick('bootstrap')}
          data-tooltip-title="Prototype-first Phase"
          data-tooltip={`Inspect a representative set of ${variant === 'allPairs' ? 'pairs' : 'features'} to initialize the classifier.`}
        >
          <span className="stage-selector__number">1</span>
          <span className="stage-selector__label">Prototype</span>
        </button>
        <button
          ref={learnTabRef}
          className={`stage-selector__tab ${activeStage === 'learn' ? 'stage-selector__tab--active' : ''} ${learnDisabled ? 'stage-selector__tab--disabled' : ''}`}
          onClick={() => handleStageClick('learn')}
          disabled={learnDisabled}
          title={learnDisabled ? `Label 3+ ${variant === 'allPairs' ? 'pairs' : 'features'} per category to enable` : undefined}
          data-tooltip-title={learnDisabled ? undefined : "Uncertainty-first Phase"}
          data-tooltip={learnDisabled ? undefined : `Review ${variant === 'allPairs' ? 'pairs' : 'features'} where the classifier is least confident.`}
        >
          <span className="stage-selector__number">2</span>
          <span className="stage-selector__label">Uncertainty</span>
        </button>
        <button
          className={`stage-selector__tab ${activeStage === 'apply' ? 'stage-selector__tab--active' : ''} ${applyDisabled ? 'stage-selector__tab--disabled' : ''}`}
          onClick={() => handleStageClick('apply')}
          disabled={applyDisabled}
          title={applyDisabled ? `Label 3+ ${variant === 'allPairs' ? 'pairs' : 'features'} per category to enable` : undefined}
          data-tooltip-title={applyDisabled ? undefined : "Disagreement-first Phase"}
          data-tooltip={applyDisabled ? undefined : `Verify ${variant === 'allPairs' ? 'pairs' : 'features'} where classifiers disagree before automatic labeling.`}
        >
          <span className="stage-selector__number">3</span>
          <span className="stage-selector__label">Disagreement</span>
        </button>
      </div>

      {/* Guidance popover anchored to Uncertainty tab */}
      {showLearnTabPopover && (
        <GuidancePopover
          anchorRef={learnTabRef}
          message="Predictions ready. Switch to Uncertainty phase to review them."
          onDismiss={() => setLearnPopoverDismissed(true)}
        />
      )}

      {/* Guidance popover anchored to metric toggle when Learn is disabled */}
      {showMetricPopover && (
        <GuidancePopover
          anchorRef={byScoreRef}
          message="Sort by metric to find more."
          onDismiss={() => setLearnPopoverDismissed(true)}
        />
      )}

      {/* Guidance popover when SVM trained while in byScore mode */}
      {showSvmReadyPopover && (
        <GuidancePopover
          anchorRef={learnTabRef}
          message="Predictions ready. Switch to Uncertainty phase to review them."
          onDismiss={() => setSvmReadyPopoverDismissed(true)}
        />
      )}

      {/* Row 2: Sort option toggle (phase-dependent) */}
      <div className="stage-selector__options">
        <div className="stage-selector__toggle-group">
          {activeStage === 'bootstrap' && bootstrapOptions.map(opt => (
            <button
              key={opt.mode}
              ref={opt.mode === 'byScore' ? byScoreRef : undefined}
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
              Confident Thresholded Region First
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
              Hide Labeled
            </label>
          )}
          {activeStage === 'apply' && hasDisagreementData && onShowDisagreementOnlyChange !== undefined && (
            <label className="stage-selector__checkbox-label stage-selector__checkbox-label--disagreement">
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

export default StageAccordionList
