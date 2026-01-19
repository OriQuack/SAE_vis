import React, { useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getSelectionColors, getStripeGradient, type TableStage } from '../lib/color-utils'
import '../styles/ScrollableItemList.css'

const ESTIMATED_ITEM_HEIGHT = 32

// ============================================================================
// SCROLLABLE ITEM LIST - Reusable scrollable sidebar list component
// ============================================================================
// Extracted from FeatureSplitPairViewer sidebar for reusability
// Simple, focused component without over-engineering

// Size variants for different use cases (styles defined in ScrollableItemList.css)
export type ListVariant =
  | 'allPairs'        // 240px wide, 390px min-height (FeatureSplitView, FeatureSplitPairViewer)
  | 'features'        // 240px wide, 390px height (QualityView top row)
  | 'boundary'        // 260px wide, 370px min-height (ThresholdTaggingPanel left/right)
  | 'cause'           // 240px wide, 300px min-height, 100% height (CauseView top row)
  | 'causeBrushed'    // 240px wide, 100% height (CauseView bottom row)

interface Badge {
  label: string
  count: number | string
}

interface FooterButton {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  className?: string
}

interface ColumnHeader {
  label: string
  sortDirection?: 'asc' | 'desc'
  onClick?: () => void
  isSortable?: boolean    // true = direction toggle (shows ⇅)
  isModeSwitch?: boolean  // true = mode switch (shows ⇄)
  isPulsing?: boolean     // true = apply pulse animation (visual feedback)
}

interface HeaderStripe {
  type: 'expand' | 'autoReject'
  mode?: 'pair' | 'feature'  // Maps to stage1 (pair) or stage2 (feature)
}

// Optional sort config for automatic inline score display
interface SortConfig<T> {
  getDisplayScore: (item: T) => number | undefined
}

export interface ScrollableItemListProps<T = any> {
  // Header badges showing counts
  badges: Badge[]

  // Optional column header (sub-header below badges showing column label)
  columnHeader?: ColumnHeader

  // Optional stripe pattern for header (for auto-tagging indication)
  headerStripe?: HeaderStripe

  // Items to display (generic)
  items: T[]

  // Render function for each item
  renderItem: (item: T, index: number) => React.ReactNode

  // Current/selected item index (for highlighting)
  currentIndex?: number

  // Predicate to determine if item should be highlighted (e.g., same cluster)
  highlightPredicate?: (item: T, currentItem: T | null) => boolean

  // Whether this list is the currently active source (visual indicator in header)
  isActive?: boolean

  // Whether the current sort matches the template (default) sort
  // When false, selection highlight is disabled (currentIndex visual not shown)
  isTemplateSort?: boolean

  // Optional footer button
  footerButton?: FooterButton

  // Optional sort config for automatic inline score display
  // When provided, wraps renderItem output with score display
  sortConfig?: SortConfig<T>

  // Size variant - when set, uses predefined CSS classes (overrides width/height/minHeight)
  variant?: ListVariant

  // Custom message when list is empty (default: "None")
  emptyMessage?: string

  // Disable auto-scrolling to center the current item when currentIndex changes
  disableAutoScroll?: boolean

  // External scroll target index - triggers scroll without changing highlight
  // Use this to scroll to an item from external events (e.g., subview clicks)
  scrollTargetIndex?: number

  // Styling (ignored when variant is set)
  width?: number | string
  height?: number | string
  minHeight?: number | string
  className?: string
}

export function ScrollableItemList<T = any>({
  badges,
  columnHeader,
  headerStripe,
  items,
  renderItem,
  currentIndex = -1,
  highlightPredicate,
  isActive = false,
  isTemplateSort: _isTemplateSort = true,
  footerButton,
  sortConfig,
  variant,
  emptyMessage = 'None',
  disableAutoScroll = false,
  scrollTargetIndex,
  width = 200,
  height,
  minHeight,
  className = ''
}: ScrollableItemListProps<T>) {
  const currentItem = currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null
  const containerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5 // Render 5 extra items above/below viewport
  })

  // Scroll to currentIndex when it changes
  useEffect(() => {
    if (!disableAutoScroll && currentIndex >= 0 && currentIndex < items.length) {
      virtualizer.scrollToIndex(currentIndex, { align: 'center', behavior: 'auto' })
    }
  }, [currentIndex, items.length, virtualizer, disableAutoScroll])

  // Scroll to external target index (from subview clicks)
  // This scrolls without changing the highlight - just moves viewport
  useEffect(() => {
    if (scrollTargetIndex !== undefined && scrollTargetIndex >= 0 && scrollTargetIndex < items.length) {
      virtualizer.scrollToIndex(scrollTargetIndex, { align: 'center', behavior: 'smooth' })
    }
  }, [scrollTargetIndex, items.length, virtualizer])

  // Get stripe style for header based on mode (CSS gradient approach)
  const headerStripeStyle = useMemo(() => {
    if (!headerStripe) return undefined
    // Map mode to stage: 'pair' -> 'stage1', 'feature' -> 'stage2'
    const mode = headerStripe.mode || 'pair'
    const stage: TableStage = mode === 'pair' ? 'stage1' : 'stage2'
    const colors = getSelectionColors(stage)
    const tagColor = headerStripe.type === 'expand' ? colors.autoSelected : colors.autoRejected
    const gapColor = colors.unsure
    return {
      backgroundColor: gapColor,
      backgroundImage: getStripeGradient(tagColor, gapColor)
    }
  }, [headerStripe])

  // Build class names including variant class when set
  const variantClass = variant ? `scrollable-list--variant-${variant}` : ''

  return (
    <div
      className={`scrollable-list ${variantClass} ${isActive ? 'scrollable-list--active' : ''} ${className}`}
      style={variant ? undefined : {
        width: typeof width === 'number' ? `${width}px` : width,
        height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        minHeight: minHeight ? (typeof minHeight === 'number' ? `${minHeight}px` : minHeight) : undefined
      }}
    >
      {/* Header with count inline: "Name (Count)" */}
      <div
        className={`scrollable-list__header ${headerStripe ? 'scrollable-list__header--striped' : ''}`}
        style={headerStripeStyle}
      >
        {badges.map((badge, i) => (
          <div key={i} className="scrollable-list__badge">
            <span className="scrollable-list__badge-label instruction-subheader">
              {badge.label} <span className="scrollable-list__badge-count">({typeof badge.count === 'number' ? badge.count.toLocaleString() : badge.count})</span>
            </span>
          </div>
        ))}
      </div>

      {/* Optional column header (sub-header with sort indicator) */}
      {columnHeader && (
        <div
          className={`scrollable-list__column-header ${columnHeader.onClick ? 'scrollable-list__column-header--clickable' : ''} ${columnHeader.isPulsing ? 'scrollable-list__column-header--pulsing' : ''}`}
          onClick={columnHeader.onClick}
          title={columnHeader.onClick ? (columnHeader.isSortable ? 'Click to toggle sort direction' : 'Click to switch sort mode') : undefined}
        >
          <span className="column-header__label">
            {columnHeader.sortDirection ? (columnHeader.sortDirection === 'asc' ? '▲' : '▼') : ''} {columnHeader.label}
          </span>
          {columnHeader.isSortable && (
            <span className="column-header__switch-badge">⇅</span>
          )}
          {columnHeader.isModeSwitch && (
            <span className="column-header__switch-badge">↔</span>
          )}
        </div>
      )}

      {/* Scrollable list container */}
      <div className="scrollable-list__container" ref={containerRef}>
        {items.length === 0 ? (
          <div className="scrollable-list__empty">{emptyMessage}</div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const index = virtualRow.index
              const item = items[index]
              const isCurrent = index === currentIndex
              const isHighlighted = highlightPredicate && currentItem ? highlightPredicate(item, currentItem) : false

              const itemClasses = [
                'scrollable-list-item',
                isCurrent && 'scrollable-list-item--current',
                isHighlighted && 'scrollable-list-item--highlighted'
              ].filter(Boolean).join(' ')

              const itemContent = renderItem(item, index)

              return (
                <div
                  key={virtualRow.key}
                  className={itemClasses}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  {sortConfig ? (
                    <div className="pair-item-with-score">
                      {itemContent}
                      <span className="pair-similarity-score">
                        {sortConfig.getDisplayScore(item)?.toFixed(2) ?? '—'}
                      </span>
                    </div>
                  ) : (
                    itemContent
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Optional footer button */}
      {footerButton && (
        <button
          className={`scrollable-list__footer-button ${footerButton.className || ''}`}
          onClick={footerButton.onClick}
          disabled={footerButton.disabled}
          title={footerButton.title}
        >
          {footerButton.label}
        </button>
      )}
    </div>
  )
}

export default ScrollableItemList
