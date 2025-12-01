import React, { useMemo, useRef, useEffect, useState } from 'react'
import { type SelectionCategory } from '../lib/constants'
import { getSelectionColors, STRIPE_PATTERN, type TableMode } from '../lib/color-utils'
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
  height?: number | string  // For horizontal: height in px (default: 24). For vertical: height in px (default: 200)
  width?: number | string  // For horizontal: width in % or px (default: '100%'). For vertical: width in % or px (default: '70%')
  showLabels?: boolean  // Default: true
  showLegend?: boolean  // Default: true
  labelThreshold?: number  // Default: 10% - minimum percentage to show label
  mode?: TableMode  // Mode determines labels/colors (default: 'feature')
  categoryColors?: Partial<Record<SelectionCategory, string>>  // Optional: override colors dynamically
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void  // Callback for exposing refs
  pairCount?: number  // Optional: number of pairs (for pair mode, shown as secondary info)
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
  labelThreshold = 2,
  mode = 'feature',
  categoryColors,
  className = '',
  onCategoryRefsReady,
  pairCount
}) => {
  // Set default dimensions based on orientation
  const isVertical = orientation === 'vertical'
  const containerHeight = height ?? (isVertical ? '100%' : 24)
  const containerWidth = width ?? (isVertical ? 24 : '100%')

  // Store refs to category segments for external access (e.g., flow overlays)
  const categoryRefs = useRef<Map<SelectionCategory, HTMLDivElement>>(new Map())

  // Tooltip state
  const [hoveredCategory, setHoveredCategory] = useState<SelectionCategory | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Notify parent when refs are ready
  useEffect(() => {
    if (onCategoryRefsReady && categoryRefs.current.size > 0) {
      onCategoryRefsReady(new Map(categoryRefs.current))
    }
  }, [onCategoryRefsReady, counts])

  // Get mode-specific colors from tag system
  const modeColors = useMemo(() => getSelectionColors(mode), [mode])

  // Generate category config dynamically based on mode
  const categoryConfig = useMemo((): Record<SelectionCategory, { label: string; color: string; description: string }> => {
    // Mode-specific tag names
    const tagNames = {
      feature: {
        confirmed: 'Well-Explained',
        rejected: 'Need Revision'
      },
      pair: {
        confirmed: 'Fragmented',
        rejected: 'Monosemantic'
      },
      cause: {
        // TODO: Implement cause mode tag mapping
        // Available tags: "Missed Context", "Missed Lexicon", "Noisy Activation", "Unsure"
        confirmed: 'TBD',
        rejected: 'TBD'
      }
    }

    const currentTags = tagNames[mode]

    return {
      confirmed: {
        label: currentTags.confirmed,
        color: modeColors.confirmed,
        description: 'Manually selected by user'
      },
      expanded: {
        label: `${currentTags.confirmed} (auto)`,
        color: modeColors.expanded,
        description: 'Auto-tagged by histogram thresholds'
      },
      rejected: {
        label: currentTags.rejected,
        color: modeColors.rejected,
        description: 'Manually selected by user'
      },
      autoRejected: {
        label: `${currentTags.rejected} (auto)`,
        color: modeColors.autoRejected,
        description: 'Auto-tagged by histogram thresholds'
      },
      unsure: {
        label: 'Unsure',
        color: modeColors.unsure,
        description: 'Not selected or investigated'
      }
    }
  }, [mode, modeColors])

  // Get final color for a category (use provided override or mode-specific color)
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

  const handleMouseEnter = (category: SelectionCategory, event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredCategory(category)
    setTooltipPosition({
      x: event.clientX,
      y: event.clientY
    })
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (hoveredCategory) {
      setTooltipPosition({
        x: event.clientX,
        y: event.clientY
      })
    }
  }

  const handleMouseLeave = () => {
    setHoveredCategory(null)
    setTooltipPosition(null)
  }

  // Render segments with specific order (uses preview counts when available)
  const renderSegments = () => {
    const segments: React.ReactNode[] = []

    // Define rendering order: rejected → autoRejected → unsure → expanded → confirmed
    // This creates visual grouping: False Positive (left/top) | Neutral (center) | True Positive (right/bottom)
    // For pair mode: Monosemantic → Monosemantic(auto) → Unsure → Fragmented(auto) → Fragmented
    const categoryOrder: SelectionCategory[] = ['rejected', 'autoRejected', 'unsure', 'expanded', 'confirmed']

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

      // For unsure, use preview count for label when preview is active
      const displayCount = (category === 'unsure' && previewCounts)
        ? getCategoryValue('unsure', previewCounts)
        : count

      // Render main segment if count > 0
      if (count > 0) {
        segments.push(
          <div
            key={category}
            ref={(el) => {
              if (el) {
                categoryRefs.current.set(category, el)
              } else {
                categoryRefs.current.delete(category)
              }
            }}
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
              // For auto-tagged segments: stripes of category color with unsure-colored gaps
              // For manual segments: solid category color
              backgroundColor: (category === 'expanded' || category === 'autoRejected')
                ? modeColors.unsure
                : getColor(category),
              ...((category === 'expanded' || category === 'autoRejected') ? {
                backgroundImage: `repeating-linear-gradient(
                  ${STRIPE_PATTERN.rotation}deg,
                  ${modeColors.unsure},
                  ${modeColors.unsure} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                  ${getColor(category)} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                  ${getColor(category)} ${STRIPE_PATTERN.width}px
                )`
              } : {})
            }}
            onClick={() => handleCategoryClick(category)}
            onMouseEnter={(e) => handleMouseEnter(category, e)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Show label if segment is large enough */}
            {showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {isVertical ? displayCount.toLocaleString() : `${config.label} (${displayCount.toLocaleString()})`}
              </span>
            )}
          </div>
        )
      }

      // Render adjacent stripe preview for expanded and autoRejected if items are entering
      if ((category === 'expanded' || category === 'autoRejected') && previewChangeValue > 0 && previewChanges) {
        const stripePercentage = (previewChangeValue / counts.total) * 100
        const stripeColor = category === 'expanded'
          ? modeColors.expanded
          : modeColors.autoRejected

        segments.push(
          <div
            key={`${category}-preview`}
            className={`selection-state-bar__segment selection-state-bar__segment--preview ${
              onCategoryClick ? 'selection-state-bar__segment--interactive' : ''
            }`}
            style={{
              ...(isVertical ? {
                height: `${stripePercentage}%`,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              } : {
                width: `${stripePercentage}%`
              }),
              backgroundColor: modeColors.unsure,
              backgroundImage: `repeating-linear-gradient(
                ${STRIPE_PATTERN.rotation}deg,
                ${modeColors.unsure},
                ${modeColors.unsure} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                ${stripeColor} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                ${stripeColor} ${STRIPE_PATTERN.width}px
              )`,
              position: 'relative'
            }}
            onClick={() => handleCategoryClick(category)}
            onMouseEnter={(e) => handleMouseEnter(category, e)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Show label if segment is large enough */}
            {showLabels && stripePercentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {isVertical ? `+${previewChangeValue.toLocaleString()}` : `${config.label} (+${previewChangeValue.toLocaleString()})`}
              </span>
            )}
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
      {/* Total Count Header (vertical orientation only) */}
      {isVertical && (
        <div className="selection-state-bar__header">
          <div className="selection-state-bar__total">
            <div className="selection-state-bar__total-primary">
              {counts.total.toLocaleString()} {mode === 'cause' ? 'items' : 'Features'}
            </div>
            {mode === 'pair' && pairCount !== undefined && (
              <div className="selection-state-bar__total-secondary">
                ({pairCount.toLocaleString()} Pairs)
              </div>
            )}
          </div>
        </div>
      )}

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
          {/* Use same order as bar segments: rejected → autoRejected → unsure → expanded → confirmed */}
          {(['rejected', 'autoRejected', 'unsure', 'expanded', 'confirmed'] as SelectionCategory[]).map((category) => {
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
                  {count.toLocaleString()} ({percentage.toFixed(1)}%)
                  {previewChange !== 0 && (
                    <span className="selection-state-bar__legend-preview">
                      {' '}→ {(count + previewChange).toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Custom Tooltip */}
      {hoveredCategory && tooltipPosition && (() => {
        const count = getCategoryValue(hoveredCategory, counts)
        const percentage = getCategoryValue(hoveredCategory, percentages)
        const previewChange = previewChanges ? getCategoryValue(hoveredCategory, previewChanges) : 0

        return (
          <div
            className="selection-state-bar__tooltip"
            style={{
              position: 'fixed',
              left: `${tooltipPosition.x + 12}px`,
              top: `${tooltipPosition.y - 8}px`,
              pointerEvents: 'none',
              zIndex: 10000
            }}
          >
            <div className="selection-state-bar__tooltip-content">
              <div className="selection-state-bar__tooltip-label">
                {categoryConfig[hoveredCategory].label}
              </div>
              <div className="selection-state-bar__tooltip-count">
                {count.toLocaleString()} features
                {previewChange !== 0 && (
                  <span className="selection-state-bar__tooltip-preview">
                    {' '}→ {(count + previewChange).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="selection-state-bar__tooltip-percentage">
                {percentage.toFixed(1)}%
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default SelectionStateBar
