import React, { useMemo } from 'react'
import { SELECTION_CATEGORY_COLORS, type SelectionCategory } from '../lib/constants'
import '../styles/SelectionStateBar.css'

export interface CategoryCounts {
  confirmed: number
  expanded: number
  rejected: number
  unsure: number
  total: number
}

interface SelectionStateBarProps {
  counts: CategoryCounts
  previewCounts?: CategoryCounts  // Optional: preview state after changes
  onCategoryClick?: (category: SelectionCategory) => void
  height?: number  // Default: 24px
  showLabels?: boolean  // Default: true
  showLegend?: boolean  // Default: true
  labelThreshold?: number  // Default: 10% - minimum width to show label
  className?: string
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
 * SelectionStateBar - Horizontal stacked bar showing distribution of selection categories
 *
 * Features:
 * - Displays 4 categories (confirmed, expanded, rejected, unsure) with proportional widths
 * - Optional preview state with stripe pattern overlay
 * - Interactive click handling (optional)
 * - Legend display (optional)
 * - Configurable appearance
 */
const SelectionStateBar: React.FC<SelectionStateBarProps> = ({
  counts,
  previewCounts,
  onCategoryClick,
  height = 24,
  showLabels = true,
  showLegend = true,
  labelThreshold = 10,
  className = ''
}) => {
  // Calculate percentages for current state
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

  // Calculate preview changes for stripe overlay
  const previewChanges = useMemo(() => {
    if (!previewCounts) return null

    return {
      confirmed: previewCounts.confirmed - counts.confirmed,
      expanded: previewCounts.expanded - counts.expanded,
      rejected: previewCounts.rejected - counts.rejected,
      unsure: previewCounts.unsure - counts.unsure
    }
  }, [counts, previewCounts])

  const handleCategoryClick = (category: SelectionCategory) => {
    if (onCategoryClick) {
      onCategoryClick(category)
    }
  }

  return (
    <div className={`selection-state-bar ${className}`}>
      {/* Bar with segments */}
      <div className="selection-state-bar__bar" style={{ height: `${height}px` }}>
        {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
          const percentage = percentages[category]
          const count = counts[category]
          const config = CATEGORY_CONFIG[category]

          // Don't render segment if count is 0
          if (count === 0) {
            return null
          }

          // Check if this category has preview changes
          const hasPreviewChange = previewChanges && previewChanges[category] !== 0
          const previewChange = previewChanges ? previewChanges[category] : 0

          return (
            <div
              key={category}
              className={`selection-state-bar__segment selection-state-bar__segment--${category} ${
                onCategoryClick ? 'selection-state-bar__segment--interactive' : ''
              }`}
              style={{
                width: `${percentage}%`,
                backgroundColor: config.color
              }}
              onClick={() => handleCategoryClick(category)}
              title={`${config.label}: ${count} (${percentage.toFixed(1)}%) - ${config.description}${
                hasPreviewChange ? ` | Preview: ${previewChange > 0 ? '+' : ''}${previewChange}` : ''
              }`}
            >
              {/* Show label if segment is wide enough */}
              {showLabels && percentage > labelThreshold && (
                <span className="selection-state-bar__segment-label">
                  {config.label} ({count})
                </span>
              )}

              {/* Preview overlay with stripe pattern - shows items entering (positive) or leaving (negative) */}
              {hasPreviewChange && (
                <div
                  className={`selection-state-bar__preview-overlay ${
                    previewChange < 0 ? 'selection-state-bar__preview-overlay--leaving' : 'selection-state-bar__preview-overlay--entering'
                  }`}
                  style={{
                    width: `${(Math.abs(previewChange) / counts.total) * 100 / (percentage / 100)}%`,
                    right: 0
                  }}
                >
                  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern
                        id={`stripe-${category}`}
                        patternUnits="userSpaceOnUse"
                        width="8"
                        height="8"
                        patternTransform="rotate(45)"
                      >
                        <rect width="4" height="8" fill={SELECTION_CATEGORY_COLORS.EXPANDED.HEX} fillOpacity="0.3" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#stripe-${category})`} />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="selection-state-bar__legend">
          {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
            const count = counts[category]
            const config = CATEGORY_CONFIG[category]
            const percentage = percentages[category]
            const previewChange = previewChanges ? previewChanges[category] : 0

            return (
              <div key={category} className="selection-state-bar__legend-item">
                <div
                  className="selection-state-bar__legend-color"
                  style={{ backgroundColor: config.color }}
                />
                <span className="selection-state-bar__legend-label">
                  {config.label}
                </span>
                <span className="selection-state-bar__legend-count">
                  {count} ({percentage.toFixed(1)}%)
                  {previewChange !== 0 && (
                    <span className="selection-state-bar__legend-preview">
                      {' '}→ {count + previewChange}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SelectionStateBar
