import React, { useMemo, useRef, useEffect, useState } from 'react'
import { type SelectionCategory, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getSelectionColors, getStripeGradient, type TableStage } from '../lib/color-utils'
import { getTagColor, getTagDisplayLabel } from '../lib/tag-system'
import { Tooltip } from './Tooltip'
import { formatCount, useResizeObserver } from '../lib/utils'
import '../styles/SelectionBar.css'

// Constants for cause label collision avoidance
const CAUSE_LABEL_HEIGHT = 32  // ~14px name + 12px count + line-height
const CAUSE_LABEL_GAP = 4      // minimum gap between labels

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
  pairCategoryCounts?: CategoryCounts  // Optional: per-category pair counts (for stage1, shown inline in segment labels)
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
  pairCount: _pairCount,
  pairCategoryCounts
}) => {
  // Set default dimensions based on orientation
  const isVertical = orientation === 'vertical'
  const containerHeight = height ?? (isVertical ? '100%' : 24)
  const containerWidth = width ?? (isVertical ? 42 : '100%')

  // Compute labeled vs total counts for status header
  const labelingStatus = useMemo(() => {
    let featureLabeled: number
    let featureTotal: number

    if (stage === 'stage3' && causeCounts) {
      // Only count user-confirmed (click + threshold) as "labeled"
      // SVM predictions (auto) are not yet labeled until batch-confirmed
      featureLabeled = causeCounts.noisyActivation + causeCounts.missedNgram +
        causeCounts.missedContext + causeCounts.wellExplained
      featureTotal = causeCounts.total
    } else {
      featureLabeled = counts.total - counts.unsure
      featureTotal = counts.total
    }

    let pairLabeled: number | undefined
    let pairTotal: number | undefined
    if (pairCategoryCounts) {
      pairLabeled = pairCategoryCounts.total - pairCategoryCounts.unsure
      pairTotal = pairCategoryCounts.total
    }

    return { featureLabeled, featureTotal, pairLabeled, pairTotal }
  }, [stage, counts, causeCounts, pairCategoryCounts])

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
    const tagNames: Record<TableStage, { confirmed: string; rejected: string }> = {
      stage1: {
        confirmed: 'Incoherent Splitting',
        rejected: getTagDisplayLabel('Monosemantic')
      },
      stage2: {
        confirmed: 'Well-Explained',
        rejected: 'Need Revision'
      },
      stage3: {
        confirmed: 'Well-Explained',
        rejected: 'Need Revision'
      },
      stage4: {
        confirmed: 'Summary',
        rejected: 'Summary'
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
        label: currentTags.confirmed,
        color: stageColors.autoSelected,
        description: 'Auto-labeled by histogram thresholds'
      },
      rejected: {
        label: currentTags.rejected,
        color: stageColors.rejected,
        description: 'Manually selected by user'
      },
      autoRejected: {
        label: currentTags.rejected,
        color: stageColors.autoRejected,
        description: 'Auto-labeled by histogram thresholds'
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

  // Resize observer for bar height (cause label collision avoidance)
  const { ref: barRef, size: barSize } = useResizeObserver<HTMLDivElement>({
    defaultHeight: 0,
    debounceMs: 100
  })

  // Compute cause label positions with collision avoidance (Stage 3 only)
  const causeLabels = useMemo(() => {
    if (stage !== 'stage3' || !causeCounts || !isVertical || !showLabels) return null

    const barHeight = barSize.height
    if (barHeight <= 0) return null

    const total = causeCounts.total
    if (total === 0) return null

    const causeColors = {
      missedNgram: getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#E69F00',
      missedContext: getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#D55E00',
      noisyActivation: getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#CC79A7',
      wellExplained: getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#009E73',
      unsure: stageColors.unsure
    }

    const categories = [
      { key: 'missedNgram', label: 'Missed Syntax', manual: causeCounts.missedNgram, auto: causeCounts.missedNgramAuto },
      { key: 'missedContext', label: 'Missed Context', manual: causeCounts.missedContext, auto: causeCounts.missedContextAuto },
      { key: 'noisyActivation', label: 'Noisy Activation', manual: causeCounts.noisyActivation, auto: causeCounts.noisyActivationAuto },
      { key: 'wellExplained', label: 'Well-Explained', manual: causeCounts.wellExplained, auto: causeCounts.wellExplainedAuto },
    ]

    // Build label entries with ideal Y positions based on segment midpoints
    const labels: { key: string; label: string; count: number; color: string; idealY: number; adjustedY: number }[] = []
    let cumulativePercent = 0

    for (const cat of categories) {
      const manualPercent = total > 0 ? (cat.manual / total) * 100 : 0
      const autoPercent = total > 0 ? (cat.auto / total) * 100 : 0

      if (cat.manual > 0) {
        const midPercent = cumulativePercent + manualPercent / 2
        const idealY = (midPercent / 100) * barHeight
        labels.push({
          key: cat.key,
          label: cat.label,
          count: cat.manual,
          color: causeColors[cat.key as keyof typeof causeColors],
          idealY,
          adjustedY: idealY - CAUSE_LABEL_HEIGHT / 2
        })
        cumulativePercent += manualPercent
      }

      if (cat.auto > 0) {
        cumulativePercent += autoPercent
      }
    }

    // Unsure segment
    if (causeCounts.unsure > 0) {
      const unsurePercent = total > 0 ? (causeCounts.unsure / total) * 100 : 0
      const midPercent = cumulativePercent + unsurePercent / 2
      const idealY = (midPercent / 100) * barHeight
      labels.push({
        key: 'unsure',
        label: 'Unsure',
        count: causeCounts.unsure,
        color: causeColors.unsure,
        idealY,
        adjustedY: idealY - CAUSE_LABEL_HEIGHT / 2
      })
    }

    if (labels.length === 0) return null

    // Collision avoidance: greedy top-to-bottom
    for (let i = 0; i < labels.length; i++) {
      if (i > 0) {
        const prevBottom = labels[i - 1].adjustedY + CAUSE_LABEL_HEIGHT
        if (labels[i].adjustedY < prevBottom + CAUSE_LABEL_GAP) {
          labels[i].adjustedY = prevBottom + CAUSE_LABEL_GAP
        }
      }
      labels[i].adjustedY = Math.max(0, labels[i].adjustedY)
    }

    // If last label extends beyond bar, push everything up
    if (labels.length > 0) {
      const lastLabel = labels[labels.length - 1]
      if (lastLabel.adjustedY + CAUSE_LABEL_HEIGHT > barHeight) {
        lastLabel.adjustedY = Math.max(0, barHeight - CAUSE_LABEL_HEIGHT)
        for (let i = labels.length - 2; i >= 0; i--) {
          const nextTop = labels[i + 1].adjustedY
          if (labels[i].adjustedY + CAUSE_LABEL_HEIGHT + CAUSE_LABEL_GAP > nextTop) {
            labels[i].adjustedY = Math.max(0, nextTop - CAUSE_LABEL_HEIGHT - CAUSE_LABEL_GAP)
          }
        }
      }
    }

    return labels
  }, [stage, causeCounts, isVertical, showLabels, barSize.height, stageColors.unsure])

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
              // For auto-tagged segments: colored stripes on unsure gray background
              // For manual segments: solid category color
              backgroundColor: (category === 'autoSelected' || category === 'autoRejected')
                ? stageColors.unsure
                : getColor(category),
              ...((category === 'autoSelected' || category === 'autoRejected') ? {
                backgroundImage: getStripeGradient(getColor(category), stageColors.unsure)
              } : {})
            }}
            onClick={() => handleCategoryClick(category)}
            onMouseEnter={(e) => handleMouseEnter(category, e)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Left-side label for vertical orientation */}
            {isVertical && showLabels && (
              <div className="selection-state-bar__left-label">
                <span className="selection-state-bar__label-name">{config.label}</span>
                {pairCategoryCounts ? (
                  <>
                    <span className="selection-state-bar__label-count">
                      {displayCount.toLocaleString()} features
                    </span>
                    <span className="selection-state-bar__label-count">
                      {getCategoryValue(category, pairCategoryCounts).toLocaleString()} pairs
                    </span>
                  </>
                ) : (
                  <span className="selection-state-bar__label-count">({displayCount.toLocaleString()})</span>
                )}
              </div>
            )}
            {/* Inline label for horizontal orientation */}
            {!isVertical && showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {`${config.label} (${displayCount.toLocaleString()})`}
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
              backgroundImage: getStripeGradient(stripeColor, stageColors.unsure),
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
      missedNgram: getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#E69F00',
      missedContext: getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#D55E00',
      wellExplained: getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#009E73',
      unsure: stageColors.unsure
    }

    // Define cause categories in render order
    const causeCategories = [
      { key: 'missedNgram', label: 'Missed Syntax', manual: causeCounts.missedNgram, auto: causeCounts.missedNgramAuto },
      { key: 'missedContext', label: 'Missed Context', manual: causeCounts.missedContext, auto: causeCounts.missedContextAuto },
      { key: 'noisyActivation', label: 'Noisy Activation', manual: causeCounts.noisyActivation, auto: causeCounts.noisyActivationAuto },
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
            {/* Inline label for horizontal orientation */}
            {!isVertical && showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {`${label} (${manual.toLocaleString()})`}
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
              backgroundImage: getStripeGradient(color, stageColors.unsure)
            }}
            onMouseEnter={(e) => handleCauseMouseEnter({ key, label, count: auto, percentage, isAuto: true, color }, e)}
            onMouseMove={handleCauseMouseMove}
            onMouseLeave={handleCauseMouseLeave}
          >
            {/* Inline +n label for vertical orientation - consistent with Stage 1/2 preview pattern */}
            {isVertical && showLabels && (
              <span className="selection-state-bar__segment-label">
                +{auto.toLocaleString()}
              </span>
            )}
            {/* Inline label for horizontal orientation */}
            {!isVertical && showLabels && percentage > labelThreshold && (
              <span className="selection-state-bar__segment-label">
                {`${label} (${auto.toLocaleString()})`}
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
          {/* Inline label for horizontal orientation */}
          {!isVertical && showLabels && percentage > labelThreshold && (
            <span className="selection-state-bar__segment-label">
              {`Unsure (${causeCounts.unsure.toLocaleString()})`}
            </span>
          )}
        </div>
      )
    }

    return segments
  }

  // Render collision-avoided labels for Stage 3 cause segments
  const renderCauseLabels = () => {
    if (!causeLabels || !isVertical) return null

    const DISPLACEMENT_THRESHOLD = 3

    return (
      <>
        {/* Label overlay positioned to the left of the bar */}
        <div className="selection-state-bar__cause-labels">
          {causeLabels.map(l => (
            <div
              key={`label-${l.key}`}
              className="selection-state-bar__cause-label"
              style={{ top: l.adjustedY }}
            >
              <span className="selection-state-bar__label-name">{l.label}</span>
              <span className="selection-state-bar__label-count">({l.count.toLocaleString()})</span>
            </div>
          ))}
        </div>
        {/* Connector lines for displaced labels */}
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 0,
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none'
          }}
        >
          {causeLabels
            .filter(l => Math.abs((l.adjustedY + CAUSE_LABEL_HEIGHT / 2) - l.idealY) > DISPLACEMENT_THRESHOLD)
            .map(l => (
              <line
                key={`connector-${l.key}`}
                x1={-3}
                y1={l.idealY}
                x2={-3}
                y2={l.adjustedY + CAUSE_LABEL_HEIGHT / 2}
                stroke="#9ca3af"
                strokeWidth={1}
              />
            ))}
        </svg>
      </>
    )
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
      {/* Labeling status header (vertical mode only) */}
      {isVertical && labelingStatus.featureTotal > 0 && (
        <div className="selection-state-bar__header">
          <div className="selection-state-bar__total">
            <span className="selection-state-bar__total-primary">
              {formatCount(labelingStatus.featureLabeled)}{' / '}{formatCount(labelingStatus.featureTotal)}
            </span>
            <span className="selection-state-bar__total-secondary">features labeled</span>
            {labelingStatus.pairLabeled !== undefined && labelingStatus.pairTotal !== undefined && (
              <>
                <span className="selection-state-bar__total-primary">
                  {formatCount(labelingStatus.pairLabeled)}{' / '}{formatCount(labelingStatus.pairTotal)}
                </span>
                <span className="selection-state-bar__total-secondary">pairs labeled</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bar with segments */}
      <div
        ref={barRef}
        className="selection-state-bar__bar"
        style={{
          width: isVertical ? 42 : undefined,
          height: isVertical ? undefined : (typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight),
          flex: isVertical ? '1 1 0' : undefined,
          minHeight: isVertical ? 0 : undefined,
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          position: 'relative'
        }}
      >
        {stage === 'stage3' && causeCounts ? renderCauseSegments() : renderSegments()}
        {stage === 'stage3' && renderCauseLabels()}
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
      {hoveredCategory && (() => {
        const count = getCategoryValue(hoveredCategory, counts)
        const percentage = getCategoryValue(hoveredCategory, percentages)
        const previewChange = previewChanges ? getCategoryValue(hoveredCategory, previewChanges) : 0
        const isAuto = hoveredCategory === 'autoSelected' || hoveredCategory === 'autoRejected'

        return (
          <Tooltip position={tooltipPosition} offsetX={12} offsetY={-12}>
            <Tooltip.Row color={getColor(hoveredCategory)} striped={isAuto}>
              {categoryConfig[hoveredCategory].label}
            </Tooltip.Row>
            <Tooltip.Summary showSeparator={false}>
              {formatCount(count)} features ({percentage.toFixed(1)}%)
              {pairCategoryCounts && (
                <> · {formatCount(getCategoryValue(hoveredCategory, pairCategoryCounts))} pairs</>
              )}
              {previewChange !== 0 && (
                <span className="selection-state-bar__tooltip-preview">
                  {' '}→ {formatCount(count + previewChange)}
                </span>
              )}
            </Tooltip.Summary>
          </Tooltip>
        )
      })()}

      {/* Cause Segment Tooltip (Stage 3) */}
      {hoveredCauseSegment && (
        <Tooltip position={causeTooltipPosition} offsetX={12} offsetY={-12}>
          <Tooltip.Row color={hoveredCauseSegment.color} striped={hoveredCauseSegment.isAuto}>
            {hoveredCauseSegment.label}
          </Tooltip.Row>
          <Tooltip.Summary showSeparator={false}>
            {formatCount(hoveredCauseSegment.count)} features ({hoveredCauseSegment.percentage.toFixed(1)}%)
          </Tooltip.Summary>
        </Tooltip>
      )}
    </div>
  )
}

export default SelectionStateBar
