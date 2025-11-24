import React from 'react'
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

export interface ScrollableItemListProps<T = any> {
  // Header badges showing counts
  badges: Badge[]

  // Items to display (generic)
  items: T[]

  // Render function for each item
  renderItem: (item: T, index: number) => React.ReactNode

  // Current/selected item index (for highlighting)
  currentIndex?: number

  // Predicate to determine if item should be highlighted (e.g., same cluster)
  highlightPredicate?: (item: T, currentItem: T | null) => boolean

  // Optional footer button
  footerButton?: FooterButton

  // Styling
  width?: number | string
  className?: string
}

export function ScrollableItemList<T = any>({
  badges,
  items,
  renderItem,
  currentIndex = -1,
  highlightPredicate,
  footerButton,
  width = 200,
  className = ''
}: ScrollableItemListProps<T>) {
  const currentItem = currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null

  return (
    <div
      className={`scrollable-list ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      {/* Header with count badges */}
      <div className="scrollable-list__header">
        {badges.map((badge, i) => (
          <div key={i} className="scrollable-list__badge">
            <span className="scrollable-list__badge-label">{badge.label}</span>
            <span className="scrollable-list__badge-count">{badge.count}</span>
          </div>
        ))}
      </div>

      {/* Scrollable list container */}
      <div className="scrollable-list__container">
        {items.map((item, index) => {
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
        })}
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
