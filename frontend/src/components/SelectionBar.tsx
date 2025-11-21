import React, { useMemo } from 'react'
import { SELECTION_CATEGORY_COLORS, type SelectionCategory } from '../lib/constants'
import '../styles/SelectionBar.css'

export interface CategoryCounts {
  confirmed: number
  expanded: number
  rejected: number
  autoRejected: number
  unsure: number
  total: number
}

interface SelectionStateBarProps {
  counts: CategoryCounts
  previewCounts?: CategoryCounts  // Optional: preview state after changes
  onCategoryClick?: (category: SelectionCategory) => void
  orientation?: 'horizontal' | 'vertical'  // Default: 'horizontal'
  height?: number | string  // For horizontal: height in px (default: 24). For vertical: height in % or px (default: '100%')
  width?: number | string  // For horizontal: width in % or px (default: '100%'). For vertical: width in % or px (default: '80%')
  showLabels?: boolean  // Default: true
  showLegend?: boolean  // Default: true
  labelThreshold?: number  // Default: 10% - minimum percentage to show label
  mode?: 'feature' | 'pair' | 'cause'  // Mode determines labels/colors (default: 'feature')
  categoryColors?: Partial<Record<SelectionCategory, string>>  // Optional: override colors dynamically
  className?: string
}

// Category config for feature/pair modes
const CATEGORY_CONFIG: Record<SelectionCategory, { label: string; color: string; description: string }> = {
  confirmed: {
    label: 'True Positive',
    color: SELECTION_CATEGORY_COLORS.CONFIRMED.HEX,
    description: 'Manually selected by user'
  },
  expanded: {
    label: 'Expanded True Positive',
    color: SELECTION_CATEGORY_COLORS.EXPANDED.HEX,
    description: 'Auto-tagged by histogram thresholds'
  },
  rejected: {
    label: 'False Positive',
    color: SELECTION_CATEGORY_COLORS.REJECTED.HEX,
    description: 'Manually rejected by user'
  },
  autoRejected: {
    label: 'Expanded False Positive',
    color: SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX,
    description: 'Auto-tagged by histogram thresholds'
  },
  unsure: {
    label: 'Unsure',
    color: SELECTION_CATEGORY_COLORS.UNSURE.HEX,
    description: 'Not selected or investigated'
  }
}

/**
 * SelectionStateBar - Stacked bar showing distribution of selection categories
 *
 * Features:
 * - Displays 4 categories (confirmed, expanded, rejected, unsure) with proportional widths/heights
 * - Supports both horizontal and vertical orientations
 * - Optional preview state with stripe pattern overlay
 * - Interactive click handling (optional)
 * - Legend display (optional)
 * - Configurable appearance
 */
const SelectionStateBar: React.FC<SelectionStateBarProps> = ({
  counts,
  previewCounts,
  onCategoryClick,
  orientation = 'horizontal',
  height,
  width,
  showLabels = true,
  showLegend = true,
  labelThreshold = 10,
  categoryColors,
  className = ''
}) => {
  // Set default dimensions based on orientation
  const isVertical = orientation === 'vertical'
  const containerHeight = height ?? (isVertical ? '100%' : 24)
  const containerWidth = width ?? (isVertical ? '70%' : '100%')
  // Use standard category config for all modes
  const categoryConfig = CATEGORY_CONFIG

  // Get final color for a category (use provided color or fallback to config)
  const getColor = (category: SelectionCategory): string => {
    return categoryColors?.[category] || categoryConfig[category].color
  }
  // Calculate percentages for current state
  const percentages = useMemo(() => {
    if (counts.total === 0) {
      return { confirmed: 0, expanded: 0, rejected: 0, autoRejected: 0, unsure: 100 }
    }
    return {
      confirmed: (counts.confirmed / counts.total) * 100,
      expanded: (counts.expanded / counts.total) * 100,
      rejected: (counts.rejected / counts.total) * 100,
      autoRejected: (counts.autoRejected / counts.total) * 100,
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
      autoRejected: previewCounts.autoRejected - counts.autoRejected,
      unsure: previewCounts.unsure - counts.unsure
    }
  }, [counts, previewCounts])

  // Helper to get count/percentage from objects
  const getCategoryValue = (category: SelectionCategory, obj: any): number => {
    return obj[category] || 0
  }

  const handleCategoryClick = (category: SelectionCategory) => {
    if (onCategoryClick) {
      onCategoryClick(category)
    }
  }

  // Render segments with specific order and adjacent stripe previews
  const renderSegments = () => {
    const segments: React.ReactNode[] = []

    // Define rendering order: confirmed → expanded → rejected → autoRejected → unsure
    const categoryOrder: SelectionCategory[] = ['confirmed', 'expanded', 'rejected', 'autoRejected', 'unsure']

    categoryOrder.forEach((category) => {
      const count = getCategoryValue(category, counts)
      const config = categoryConfig[category]

      // Skip if count is 0 (but still may render preview stripe for expanded/autoRejected)
      if (count === 0 && category !== 'expanded' && category !== 'autoRejected') {
        return
      }

      // Calculate percentage - for unsure, subtract items moving out
      let percentage = getCategoryValue(category, percentages)
      const previewChangeValue = previewChanges ? getCategoryValue(category, previewChanges) : 0

      // For unsure, reduce width by items leaving (moving to expanded/autoRejected)
      if (category === 'unsure' && previewChanges) {
        const unsurePreviewCount = previewCounts ? getCategoryValue('unsure', previewCounts) : count
        percentage = counts.total > 0 ? (unsurePreviewCount / counts.total) * 100 : 0
      }

      // Render main segment if count > 0
      if (count > 0) {
        segments.push(
          <div
            key={category}
            className={`selection-state-bar__segment selection-state-bar__segment--${category} ${
              onCategoryClick ? 'selection-state-bar__segment--interactive' : ''
            }`}
            style={{
              ...(isVertical ? {
                height: `${percentage}%`,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              } : {
                width: `${percentage}%`
              }),
              backgroundColor: getColor(category)
            }}
            onClick={() => handleCategoryClick(category)}
            title={`${config.label}: ${count} (${percentage.toFixed(1)}%) - ${config.description}${
              previewChangeValue !== 0 ? ` | Preview: ${previewChangeValue > 0 ? '+' : ''}${previewChangeValue}` : ''
            }`}
          >
            {/* Show label if segment is wide/tall enough */}
            {showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {config.label} ({count})
              </span>
            )}
          </div>
        )
      }

      // Render adjacent stripe preview for expanded and autoRejected if items are entering
      if ((category === 'expanded' || category === 'autoRejected') && previewChangeValue > 0 && previewChanges) {
        const stripePercentage = (previewChangeValue / counts.total) * 100
        const stripeColor = category === 'expanded'
          ? SELECTION_CATEGORY_COLORS.EXPANDED.HEX
          : SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX

        segments.push(
          <div
            key={`${category}-preview`}
            className="selection-state-bar__segment selection-state-bar__segment--preview"
            style={{
              ...(isVertical ? {
                height: `${stripePercentage}%`,
                width: '100%'
              } : {
                width: `${stripePercentage}%`
              }),
              backgroundColor: stripeColor,
              position: 'relative'
            }}
            title={`Preview: +${previewChangeValue} ${config.label}`}
          >
            {/* Stripe pattern overlay */}
            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern
                  id={`stripe-preview-${category}`}
                  patternUnits="userSpaceOnUse"
                  width="8"
                  height="8"
                  patternTransform="rotate(45)"
                >
                  <rect width="4" height="8" fill="#ffffff" opacity="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#stripe-preview-${category})`} />
            </svg>
          </div>
        )
      }
    })

    return segments
  }

  return (
    <div
      className={`selection-state-bar ${className}`}
      style={{
        width: typeof containerWidth === 'number' ? `${containerWidth}px` : containerWidth,
        height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row'
      }}
    >
      {/* Bar with segments */}
      <div
        className="selection-state-bar__bar"
        style={{
          width: isVertical ? '100%' : undefined,
          height: isVertical ? '100%' : (typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight),
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          position: 'relative'
        }}
      >
        {renderSegments()}
      </div>

      {/* Legend - Only show for horizontal orientation */}
      {showLegend && !isVertical && (
        <div className="selection-state-bar__legend">
          {(Object.keys(categoryConfig) as SelectionCategory[]).map((category) => {
            const count = getCategoryValue(category, counts)
            const config = categoryConfig[category]
            const percentage = getCategoryValue(category, percentages)
            const previewChange = previewChanges ? getCategoryValue(category, previewChanges) : 0

            return (
              <div key={category} className="selection-state-bar__legend-item">
                <div
                  className="selection-state-bar__legend-color"
                  style={{ backgroundColor: getColor(category) }}
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
