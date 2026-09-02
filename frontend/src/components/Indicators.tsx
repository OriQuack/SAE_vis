import React from 'react'
import { getTagColor, getTagDisplayLabel } from '../lib/tag-system'
import { getStripeGradient, addOpacityToHex, STRIPE_PATTERN } from '../lib/color-utils'
import { UNSURE_GRAY, TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY, type TagTooltipInfo } from '../lib/constants'
import { getVerdictLabel } from '../lib/i18n'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'

// ============================================================================
// TAG BADGE COMPONENT
// ============================================================================
// Unified tag badge showing Feature ID | Tag Name
// - Left section: Feature ID with light gray background
// - Right section: Tag name with tag-specific color

interface TagBadgeProps {
  featureId: number | string // Feature ID to display on left (string for pair IDs like "123-456")
  tagName: string            // Tag name to display on right
  tagCategoryId: string      // Category ID for color lookup
  className?: string         // Additional CSS classes

  // Selection state props
  selectionState?: 'selected' | 'rejected' | 'confirmed' | null  // Visual selection state
  onClick?: (e: React.MouseEvent) => void  // Click handler for selection

  // Layout props
  fullWidth?: boolean        // If true, use flex: 1 to fill container width (default: false)
  isPair?: boolean           // If true, use 2.2x width for pair IDs (default: false)

  // Auto-tag indicator - shows stripe pattern when true
  isAuto?: boolean           // If true, show stripe pattern to indicate auto-tagged
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  featureId,
  tagName,
  tagCategoryId,
  className = '',
  onClick,
  fullWidth = false,
  isPair = false,
  isAuto = false
}) => {
  // Get tag color from pre-computed colors (or gray for unselected)
  // Special handling: Well-Explained uses TAG_CATEGORY_QUALITY
  const baseTagColor = tagName === 'Unsure'
    ? UNSURE_GRAY  // Use standard unsure color
    : tagName === 'Well-Explained'
      ? getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'  // Green from quality category
      : getTagColor(tagCategoryId, tagName) || '#9ca3af'

  // Use consistent styling regardless of selection state
  const selectionStyle = {
    border: '1px solid rgba(0, 0, 0, 0.1)',
    opacity: 1.0,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
  }

  const isClickable = !!onClick

  // Tag background color and text color - consistent black text for all tags
  const tagBgColor = baseTagColor
  const tagTextColor = '#000'

  // Check if stripe pattern should be applied
  const showStripe = isAuto && tagName !== 'Unsure'

  // Generate stripe pattern style for auto-tagged items
  const getTagSectionStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      padding: '2px 4px',
      color: tagTextColor,
      whiteSpace: 'nowrap',
      flex: fullWidth ? 1 : 'none',
      textAlign: fullWidth ? 'center' : 'left',
      position: 'relative'
    }

    if (showStripe) {
      // Apply stripe pattern for auto-tagged items
      const gapColor = UNSURE_GRAY
      return {
        ...baseStyle,
        backgroundColor: gapColor,
        backgroundImage: getStripeGradient(tagBgColor, gapColor)
      }
    }

    return {
      ...baseStyle,
      backgroundColor: tagBgColor
    }
  }

  // Style for the text wrapper (white background for readability with stripes)
  const textWrapperStyle: React.CSSProperties = showStripe ? {
    position: 'relative',
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: '0 4px',
    borderRadius: '2px'
  } : {}

  return (
    <div
      className={`tag-badge ${className}`}
      onClick={onClick}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        flex: fullWidth ? 1 : 'none',
        alignItems: 'center',
        borderRadius: '4px',
        overflow: 'hidden',
        fontSize: '12px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 500,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        position: 'relative',
        zIndex: 1,
        ...selectionStyle
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = 'scale(1.02)'
          e.currentTarget.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.15)'
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)'
        }
      }}
    >
      {/* Feature ID section (left) */}
      <div
        style={{
          padding: '2px 6px',
          backgroundColor: '#f3f4f6',
          color: '#4b5563',
          fontFamily: 'monospace',
          fontSize: '11px',
          fontWeight: 600,
          borderRight: '1px solid rgba(0, 0, 0, 0.1)',
          width: isPair ? '90px' : '45px',  // 2.2x width for pair IDs
          flexShrink: 0,
          textAlign: 'center'
        }}
      >
        {featureId}
      </div>

      {/* Tag name section (right) */}
      <div style={getTagSectionStyle()}>
        <span style={textWrapperStyle}>{getTagDisplayLabel(tagName)}</span>
      </div>
    </div>
  )
}

// ============================================================================
// TAG BUTTON COMPONENT
// ============================================================================
// Reusable button for tagging features/pairs with category colors
// - Used in floating control panels below activating examples
// - Supports selected state with visual feedback (scale, shadow)
// - Color controlled via --tag-color CSS variable

interface TagButtonProps {
  label: string              // Button text (e.g., "Incoherent Splitting", "Well-Explained")
  variant: string            // CSS variant suffix (e.g., "fragmented", "well-explained")
  color: string              // Tag color for --tag-color CSS variable
  isSelected: boolean        // Whether button shows selected state
  onClick: () => void        // Click handler
  className?: string         // Additional CSS classes (optional)
  isAuto?: boolean           // Whether this tag was auto-assigned (shows stripe pattern)
  tooltip?: TagTooltipInfo    // Structured hover tooltip (rendered via DataTooltipLayer)
}

export const TagButton: React.FC<TagButtonProps> = ({
  label,
  variant,
  color,
  isSelected,
  onClick,
  className = '',
  isAuto = false,
  tooltip
}) => {
  const showStripe = isAuto && isSelected

  const stripeStyle: React.CSSProperties | undefined = showStripe
    ? {
        backgroundColor: '#ffffff',
        backgroundImage: `repeating-linear-gradient(${STRIPE_PATTERN.rotation}deg, #ffffff, #ffffff ${STRIPE_PATTERN.gapWidth}px, ${addOpacityToHex(color, 0.35)} ${STRIPE_PATTERN.gapWidth}px, ${addOpacityToHex(color, 0.35)} ${STRIPE_PATTERN.width}px)`
      }
    : undefined

  const verdictLabel = tooltip ? getVerdictLabel(tooltip.verdict) : 'Neutral'
  const tooltipHtml = tooltip
    ? `<div class="tag-tooltip"><div class="tag-tooltip__verdict tag-tooltip__verdict--${tooltip.verdict}">${verdictLabel}${tooltip.flow ? `<span class="tag-tooltip__flow"> · ${tooltip.flow}</span>` : ''}</div><div class="tag-tooltip__desc">${tooltip.description}</div>${tooltip.example ? `<div class="tag-tooltip__example">${tooltip.example}</div>` : ''}</div>`
    : undefined

  return (
    <button
      className={`selection__button selection__button--${variant} ${isSelected ? 'selected' : ''} ${showStripe ? 'striped' : ''} ${className}`.trim()}
      onClick={onClick}
      data-tooltip-html={tooltipHtml}
      data-tooltip-below={tooltipHtml ? '' : undefined}
      style={{
        '--tag-color': color,
        ...stripeStyle
      } as React.CSSProperties}
    >
      {label}
    </button>
  )
}

// ============================================================================
// CAUSE METRIC BARS COMPONENT
// ============================================================================
// Displays three horizontal bars representing cause metric scores
// - Bar width encodes score value (0-1 → 0-width pixels)
// - Three stacked bars: noisy-activation, missed-context, missed-N-gram
// - Colors from tag system

type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

interface CauseMetricBarsProps {
  scores: CauseMetricScores | null  // Cause metric scores for a feature
  selectedCategory?: CauseCategory | null  // Currently selected cause category
  width?: number                     // Fixed total width (default: 40)
}

export const CauseMetricBars: React.FC<CauseMetricBarsProps> = ({
  scores,
  selectedCategory = null,
  width = 40
}) => {
  // Get colors from tag system
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#9ca3af'

  // Handle null scores - render placeholder
  if (!scores) {
    return (
      <div
        style={{
          width,
          height: 18,
          backgroundColor: '#f3f4f6',
          borderRadius: '2px'
        }}
      />
    )
  }

  const barHeight = 6  // ~18px total for 3 bars
  const totalHeight = barHeight * 3

  // Configure bars: order, score, color, and category key
  const bars: Array<{ score: number | null; color: string; category: CauseCategory }> = [
    { score: scores.noisyActivation, color: noisyActivationColor, category: 'noisy-activation' },
    { score: scores.missedContext, color: missedContextColor, category: 'missed-context' },
    { score: scores.missedNgram, color: missedNgramColor, category: 'missed-N-gram' }
  ]

  return (
    <div
      style={{
        width,
        height: totalHeight,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f3f4f6',
        borderRadius: '2px',
        overflow: 'hidden'
      }}
    >
      {bars.map((bar, i) => {
        // Dim non-selected bars when a category is selected
        const isSelected = selectedCategory === bar.category
        const opacity = selectedCategory ? (isSelected ? 1 : 0.3) : 1

        return (
          <div
            key={i}
            style={{
              height: barHeight,
              width: bar.score !== null ? bar.score * width : 0,
              backgroundColor: bar.color,
              opacity,
              flexShrink: 0
            }}
          />
        )
      })}
    </div>
  )
}

// ============================================================================
// DISAGREEMENT INDICATOR COMPONENT
// ============================================================================
// Displays a warning icon when RF/MLP disagree with the SVM-based list prediction
// Used in boundary lists to highlight potential outliers (QBC approach)

interface DisagreementIndicatorProps {
  isDisagreement: boolean
  tooltipText?: string    // Parent computes tooltip (works for binary & multi-class)
  className?: string
}

export const DisagreementIndicator: React.FC<DisagreementIndicatorProps> = ({
  isDisagreement,
  tooltipText,
  className = ''
}) => {
  if (!isDisagreement) {
    return null
  }

  // Render two layers: background (behind TagBadge) and left border (in front)
  return (
    <>
      {/* Background overlay - behind TagBadge */}
      <div
        className={`disagreement-indicator ${className}`.trim()}
        style={{
          position: 'absolute',
          inset: '-1px 0',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
      {/* Left border - in front of TagBadge */}
      <div
        title={tooltipText}
        style={{
          position: 'absolute',
          left: 0,
          top: '-1px',
          bottom: '-1px',
          width: '3px',
          backgroundColor: '#f59e0b',
          borderRadius: '4px 0 0 4px',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
    </>
  )
}
