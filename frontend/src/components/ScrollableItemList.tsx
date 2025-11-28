import React, { useMemo } from 'react'
import { getSelectionColors, STRIPE_PATTERN, type TableMode } from '../lib/color-utils'
import '../styles/ScrollableItemList.css'

// ============================================================================
// SCROLLABLE ITEM LIST - Reusable scrollable sidebar list component
// ============================================================================
// Extracted from FeatureSplitPairViewer sidebar for reusability
// Simple, focused component without over-engineering

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

interface PageNavigation {
  currentPage: number
  totalPages: number
  onPreviousPage: () => void
  onNextPage: () => void
}

interface ColumnHeader {
  label: string
  sortDirection?: 'asc' | 'desc'
}

interface HeaderStripe {
  type: 'expand' | 'autoReject'
  mode?: TableMode
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

  // Optional footer button
  footerButton?: FooterButton

  // Optional page navigation (replaces footerButton if provided)
  pageNavigation?: PageNavigation

  // Styling
  width?: number | string
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
  footerButton,
  pageNavigation,
  width = 200,
  className = ''
}: ScrollableItemListProps<T>) {
  const currentItem = currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null

  // Get stripe style for header based on mode (CSS gradient approach)
  const headerStripeStyle = useMemo(() => {
    if (!headerStripe) return undefined
    const mode = headerStripe.mode || 'pair'
    const colors = getSelectionColors(mode)
    const tagColor = headerStripe.type === 'expand' ? colors.expanded : colors.autoRejected
    const gapColor = colors.unsure
    return {
      backgroundColor: gapColor,
      backgroundImage: `repeating-linear-gradient(
        ${STRIPE_PATTERN.rotation}deg,
        ${gapColor},
        ${gapColor} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
        ${tagColor} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
        ${tagColor} ${STRIPE_PATTERN.width}px
      )`
    }
  }, [headerStripe])

  return (
    <div
      className={`scrollable-list ${isActive ? 'scrollable-list--active' : ''} ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      {/* Header with count inline: "Name (Count)" */}
      <div
        className={`scrollable-list__header ${headerStripe ? 'scrollable-list__header--striped' : ''}`}
        style={headerStripeStyle}
      >
        {badges.map((badge, i) => (
          <div key={i} className="scrollable-list__badge">
            <span className="scrollable-list__badge-label">
              {badge.label} <span className="scrollable-list__badge-count">({badge.count})</span>
            </span>
          </div>
        ))}
      </div>

      {/* Optional column header (sub-header with sort indicator) */}
      {columnHeader && (
        <div className="scrollable-list__column-header">
          <span className="column-header__label">
            {columnHeader.sortDirection === 'asc' ? '▲' : '▼'} {columnHeader.label}
          </span>
        </div>
      )}

      {/* Scrollable list container */}
      <div className="scrollable-list__container">
        {items.length === 0 ? (
          <div className="scrollable-list__empty">None</div>
        ) : (
          items.map((item, index) => {
            const isCurrent = index === currentIndex
            const isHighlighted = highlightPredicate && currentItem ? highlightPredicate(item, currentItem) : false

            // Detect highlight group boundaries (for continuous background like clusters)
            let isHighlightFirst = false
            let isHighlightLast = false

            if (isHighlighted && highlightPredicate && currentItem) {
              const prevItem = index > 0 ? items[index - 1] : null
              const nextItem = index < items.length - 1 ? items[index + 1] : null
              const prevHighlighted = prevItem && highlightPredicate(prevItem, currentItem)
              const nextHighlighted = nextItem && highlightPredicate(nextItem, currentItem)

              isHighlightFirst = !prevHighlighted
              isHighlightLast = !nextHighlighted
            }

            const itemClasses = [
              'scrollable-list-item',
              isCurrent && 'scrollable-list-item--current',
              isHighlighted && 'scrollable-list-item--highlighted',
              isHighlightFirst && 'scrollable-list-item--highlight-first',
              isHighlightLast && 'scrollable-list-item--highlight-last'
            ].filter(Boolean).join(' ')

            return (
              <div key={index} className={itemClasses}>
                {renderItem(item, index)}
              </div>
            )
          })
        )}
      </div>

      {/* Page navigation (takes priority over footerButton) */}
      {pageNavigation && (
        <div className="scrollable-list__page-nav">
          <button
            className="scrollable-list__page-nav-button"
            onClick={pageNavigation.onPreviousPage}
            disabled={pageNavigation.currentPage <= 0}
            title="Previous page"
          >
            ←
          </button>
          <span className="scrollable-list__page-nav-info">
            {pageNavigation.currentPage + 1} / {pageNavigation.totalPages}
          </span>
          <button
            className="scrollable-list__page-nav-button"
            onClick={pageNavigation.onNextPage}
            disabled={pageNavigation.currentPage >= pageNavigation.totalPages - 1}
            title="Next page"
          >
            →
          </button>
        </div>
      )}

      {/* Optional footer button (only if no pageNavigation) */}
      {!pageNavigation && footerButton && (
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
