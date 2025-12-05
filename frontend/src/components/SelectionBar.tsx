import React, { useMemo, useRef, useEffect, useState } from 'react'
import { type SelectionCategory, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getSelectionColors, STRIPE_PATTERN, type TableStage } from '../lib/color-utils'
import { getTagColor } from '../lib/tag-system'
import '../styles/SelectionBar.css'

export interface CategoryCounts {
  confirmed: number
  autoSelected: number
  rejected: number
  autoRejected: number
  unsure: number
  total: number
}

// Stage 3 (Cause) has 4 distinct categories + unsure
export interface CauseCategoryCounts {
  noisyActivation: number
  noisyActivationAuto: number
  missedNgram: number
  missedNgramAuto: number
  missedContext: number
  missedContextAuto: number
  wellExplained: number
  wellExplainedAuto: number
  unsure: number
  total: number
}

interface SelectionStateBarProps {
  counts: CategoryCounts
  previewCounts?: CategoryCounts  // Optional: preview state after changes
  causeCounts?: CauseCategoryCounts  // Optional: Stage 3 cause-specific counts
  onCategoryClick?: (category: SelectionCategory) => void
  orientation?: 'horizontal' | 'vertical'  // Default: 'horizontal'
  height?: number | string  // For horizontal: height in px (default: 24). For vertical: height in px (default: 200)
  width?: number | string  // For horizontal: width in % or px (default: '100%'). For vertical: width in % or px (default: '70%')
  showLabels?: boolean  // Default: true
  showLegend?: boolean  // Default: true
  labelThreshold?: number  // Default: 10% - minimum percentage to show label
  stage?: TableStage  // Stage determines labels/colors (default: 'stage2')
  categoryColors?: Partial<Record<SelectionCategory, string>>  // Optional: override colors dynamically
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void  // Callback for exposing refs
  pairCount?: number  // Optional: number of pairs (for stage1, shown as secondary info)
}

/**
 * SelectionStateBar - Stacked bar showing distribution of selection categories
 *
 * Features:
 * - Displays 5 categories (confirmed, autoSelected, rejected, autoRejected, unsure) with proportional widths/heights
 * - Supports both horizontal and vertical orientations
 * - Optional preview state with stripe pattern overlay
 * - Interactive click handling (optional)
 * - Legend display (optional)
 * - Configurable appearance
 */
const SelectionStateBar: React.FC<SelectionStateBarProps> = ({
  counts,
  previewCounts,
  causeCounts,
  onCategoryClick,
  orientation = 'horizontal',
  height,
  width,
  showLabels = true,
  showLegend = true,
  labelThreshold = 2,
  stage = 'stage2',
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

  // Cause tooltip state (for stage 3)
  const [hoveredCauseSegment, setHoveredCauseSegment] = useState<{
    key: string
    label: string
    count: number
    percentage: number
    isAuto: boolean
    color: string
  } | null>(null)
  const [causeTooltipPosition, setCauseTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Notify parent when refs are ready
  useEffect(() => {
    if (onCategoryRefsReady && categoryRefs.current.size > 0) {
      onCategoryRefsReady(new Map(categoryRefs.current))
    }
  }, [onCategoryRefsReady, counts])

  // Get stage-specific colors from tag system
  const stageColors = useMemo(() => getSelectionColors(stage), [stage])

  // Generate category config dynamically based on stage
  const categoryConfig = useMemo((): Record<SelectionCategory, { label: string; color: string; description: string }> => {
    // Stage-specific tag names
    const tagNames = {
      stage1: {
        confirmed: 'Fragmented',
        rejected: 'Monosemantic'
      },
      stage2: {
        confirmed: 'Well-Explained',
        rejected: 'Need Revision'
      },
      stage3: {
        // TODO: Implement stage 3 tag mapping
        // Available tags: "Missed Context", "Missed N-gram", "Noisy Activation"
        confirmed: 'TBD',
        rejected: 'TBD'
      }
    }

    const currentTags = tagNames[stage]

    return {
      confirmed: {
        label: currentTags.confirmed,
        color: stageColors.confirmed,
        description: 'Manually selected by user'
      },
      autoSelected: {
        label: `${currentTags.confirmed} (auto)`,
        color: stageColors.autoSelected,
        description: 'Auto-tagged by histogram thresholds'
      },
      rejected: {
        label: currentTags.rejected,
        color: stageColors.rejected,
        description: 'Manually selected by user'
      },
      autoRejected: {
        label: `${currentTags.rejected} (auto)`,
        color: stageColors.autoRejected,
        description: 'Auto-tagged by histogram thresholds'
      },
      unsure: {
        label: 'Unsure',
        color: stageColors.unsure,
        description: 'Not selected or investigated'
      }
    }
  }, [stage, stageColors])

  // Get final color for a category (use provided override or stage-specific color)
  const getColor = (category: SelectionCategory): string => {
    return categoryColors?.[category] || categoryConfig[category].color
  }
  // Calculate percentages for current state
  const percentages = useMemo(() => {
    if (counts.total === 0) {
      return { confirmed: 0, autoSelected: 0, rejected: 0, autoRejected: 0, unsure: 100 }
    }
    return {
      confirmed: (counts.confirmed / counts.total) * 100,
      autoSelected: (counts.autoSelected / counts.total) * 100,
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
      autoSelected: previewCounts.autoSelected - counts.autoSelected,
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

  // Cause segment hover handlers
  const handleCauseMouseEnter = (
    segmentInfo: { key: string; label: string; count: number; percentage: number; isAuto: boolean; color: string },
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    setHoveredCauseSegment(segmentInfo)
    setCauseTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  const handleCauseMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (hoveredCauseSegment) {
      setCauseTooltipPosition({ x: event.clientX, y: event.clientY })
    }
  }

  const handleCauseMouseLeave = () => {
    setHoveredCauseSegment(null)
    setCauseTooltipPosition(null)
  }

  // Render segments with specific order (uses preview counts when available)
  const renderSegments = () => {
    const segments: React.ReactNode[] = []

    // Define rendering order: rejected → autoRejected → unsure → autoSelected → confirmed
    // This creates visual grouping: False Positive (left/top) | Neutral (center) | True Positive (right/bottom)
    // For pair mode: Monosemantic → Monosemantic(auto) → Unsure → Fragmented(auto) → Fragmented
    const categoryOrder: SelectionCategory[] = ['rejected', 'autoRejected', 'unsure', 'autoSelected', 'confirmed']

    categoryOrder.forEach((category) => {
      const count = getCategoryValue(category, counts)
      const config = categoryConfig[category]

      // Skip if count is 0 (but still may render preview stripe for autoSelected/autoRejected)
      if (count === 0 && category !== 'autoSelected' && category !== 'autoRejected') {
        return
      }

      // Calculate percentage - for unsure, subtract items moving out
      let percentage = getCategoryValue(category, percentages)
      const previewChangeValue = previewChanges ? getCategoryValue(category, previewChanges) : 0

      // For unsure, reduce width by items leaving (moving to autoSelected/autoRejected)
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
              backgroundColor: (category === 'autoSelected' || category === 'autoRejected')
                ? stageColors.unsure
                : getColor(category),
              ...((category === 'autoSelected' || category === 'autoRejected') ? {
                backgroundImage: `repeating-linear-gradient(
                  ${STRIPE_PATTERN.rotation}deg,
                  ${stageColors.unsure},
                  ${stageColors.unsure} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
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

      // Render adjacent stripe preview for autoSelected and autoRejected if items are entering
      if ((category === 'autoSelected' || category === 'autoRejected') && previewChangeValue > 0 && previewChanges) {
        const stripePercentage = (previewChangeValue / counts.total) * 100
        const stripeColor = category === 'autoSelected'
          ? stageColors.autoSelected
          : stageColors.autoRejected

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
              backgroundColor: stageColors.unsure,
              backgroundImage: `repeating-linear-gradient(
                ${STRIPE_PATTERN.rotation}deg,
                ${stageColors.unsure},
                ${stageColors.unsure} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
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

  // Render segments for Stage 3 (Cause) - 4 distinct categories + unsure
  const renderCauseSegments = () => {
    if (!causeCounts) return null

    const segments: React.ReactNode[] = []
    const total = causeCounts.total

    // Get colors for each cause category from tag-system
    const causeColors = {
      noisyActivation: getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#CC79A7',
      missedNgram: getTagColor(TAG_CATEGORY_CAUSE, 'Missed N-gram') || '#E69F00',
      missedContext: getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#D55E00',
      wellExplained: getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#009E73',
      unsure: stageColors.unsure
    }

    // Define cause categories in render order
    const causeCategories = [
      { key: 'noisyActivation', label: 'Noisy Activation', manual: causeCounts.noisyActivation, auto: causeCounts.noisyActivationAuto },
      { key: 'missedNgram', label: 'Missed N-gram', manual: causeCounts.missedNgram, auto: causeCounts.missedNgramAuto },
      { key: 'missedContext', label: 'Missed Context', manual: causeCounts.missedContext, auto: causeCounts.missedContextAuto },
      { key: 'wellExplained', label: 'Well-Explained', manual: causeCounts.wellExplained, auto: causeCounts.wellExplainedAuto },
    ]

    // Render each cause category (manual segment then auto segment)
    causeCategories.forEach(({ key, label, manual, auto }) => {
      const color = causeColors[key as keyof typeof causeColors]

      // Render manual segment (solid)
      if (manual > 0) {
        const percentage = total > 0 ? (manual / total) * 100 : 0
        segments.push(
          <div
            key={`${key}-manual`}
            className="selection-state-bar__segment selection-state-bar__segment--interactive"
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
              backgroundColor: color
            }}
            onMouseEnter={(e) => handleCauseMouseEnter({ key, label, count: manual, percentage, isAuto: false, color }, e)}
            onMouseMove={handleCauseMouseMove}
            onMouseLeave={handleCauseMouseLeave}
          >
            {showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {isVertical ? manual.toLocaleString() : `${label} (${manual.toLocaleString()})`}
              </span>
            )}
          </div>
        )
      }

      // Render auto segment (stripe)
      if (auto > 0) {
        const percentage = total > 0 ? (auto / total) * 100 : 0
        segments.push(
          <div
            key={`${key}-auto`}
            className="selection-state-bar__segment selection-state-bar__segment--interactive"
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
              backgroundColor: stageColors.unsure,
              backgroundImage: `repeating-linear-gradient(
                ${STRIPE_PATTERN.rotation}deg,
                ${stageColors.unsure},
                ${stageColors.unsure} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                ${color} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
                ${color} ${STRIPE_PATTERN.width}px
              )`
            }}
            onMouseEnter={(e) => handleCauseMouseEnter({ key, label, count: auto, percentage, isAuto: true, color }, e)}
            onMouseMove={handleCauseMouseMove}
            onMouseLeave={handleCauseMouseLeave}
          >
            {showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {isVertical ? auto.toLocaleString() : `${label} (+${auto.toLocaleString()})`}
              </span>
            )}
          </div>
        )
      }
    })

    // Render unsure segment
    if (causeCounts.unsure > 0) {
      const percentage = total > 0 ? (causeCounts.unsure / total) * 100 : 0
      segments.push(
        <div
          key="unsure"
          className="selection-state-bar__segment selection-state-bar__segment--interactive"
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
            backgroundColor: causeColors.unsure
          }}
          onMouseEnter={(e) => handleCauseMouseEnter({ key: 'unsure', label: 'Unsure', count: causeCounts.unsure, percentage, isAuto: false, color: causeColors.unsure }, e)}
          onMouseMove={handleCauseMouseMove}
          onMouseLeave={handleCauseMouseLeave}
        >
          {showLabels && percentage > labelThreshold && (
            <span className="selection-state-bar__segment-label">
              {isVertical ? causeCounts.unsure.toLocaleString() : `Unsure (${causeCounts.unsure.toLocaleString()})`}
            </span>
          )}
        </div>
      )
    }

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
              {counts.total.toLocaleString()} Features
            </div>
            {stage === 'stage1' && pairCount !== undefined && (
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
        {stage === 'stage3' && causeCounts ? renderCauseSegments() : renderSegments()}
      </div>

      {/* Legend - Only show for horizontal orientation */}
      {showLegend && !isVertical && (
        <div className="selection-state-bar__legend">
          {/* Use same order as bar segments: rejected → autoRejected → unsure → autoSelected → confirmed */}
          {(['rejected', 'autoRejected', 'unsure', 'autoSelected', 'confirmed'] as SelectionCategory[]).map((category) => {
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

      {/* Cause Segment Tooltip (Stage 3) */}
      {hoveredCauseSegment && causeTooltipPosition && (
        <div
          className="selection-state-bar__tooltip"
          style={{
            position: 'fixed',
            left: `${causeTooltipPosition.x + 12}px`,
            top: `${causeTooltipPosition.y - 8}px`,
            pointerEvents: 'none',
            zIndex: 10000
          }}
        >
          <div className="selection-state-bar__tooltip-content">
            <div className="selection-state-bar__tooltip-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                className="selection-state-bar__tooltip-color"
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: hoveredCauseSegment.color,
                  flexShrink: 0
                }}
              />
              {hoveredCauseSegment.label}
              {hoveredCauseSegment.isAuto && <span style={{ opacity: 0.7 }}>(auto)</span>}
            </div>
            <div className="selection-state-bar__tooltip-count">
              {hoveredCauseSegment.count.toLocaleString()} features
            </div>
            <div className="selection-state-bar__tooltip-percentage">
              {hoveredCauseSegment.percentage.toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SelectionStateBar
