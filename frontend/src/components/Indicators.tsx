import React from 'react'
import { getCircleRadius, getCircleOpacity } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'
import { getTagColor } from '../lib/tag-system'
import { STRIPE_PATTERN } from '../lib/color-utils'
import { UNSURE_GRAY, TAG_CATEGORY_CAUSE } from '../lib/constants'
import type { ScoreStats } from '../lib/circle-encoding-utils'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'

// ============================================================================
// SCORE CIRCLE COMPONENT
// ============================================================================
// Reusable circle renderer with size/opacity encoding
// - Size: Encodes score value (min 1px → max 10px)
// - Opacity: Encodes consistency/spread (1.0 = consistent, 0.1 = high variance)
// - Color: Can be fixed or dynamically calculated from metric type + value

interface ScoreCircleProps {
  score: number | null           // Score value (0-1 normalized)
  scoreStats?: ScoreStats | null  // Statistics for opacity calculation
  label?: string                 // Optional label below circle (e.g., score value)
  tooltipText?: string           // Optional tooltip text
  color?: string                 // Circle fill color (default: #1f2937) - ignored if metric is provided
  showLabel?: boolean            // Whether to show label below circle (default: true)
  className?: string             // Additional CSS classes
  metric?: 'embedding' | 'fuzz' | 'detection' | 'decoder_similarity' | 'semantic_similarity'  // Optional: use metric-based color
  useSolidColor?: boolean        // If true and metric provided, use solid color without gradient (default: true)
}

const ScoreCircle: React.FC<ScoreCircleProps> = ({
  score,
  scoreStats,
  label,
  tooltipText,
  color = '#1f2937',
  showLabel = true,
  className = '',
  metric,
  useSolidColor = true
}) => {
  // Handle null score
  if (score === null) {
    return (
      <div className={`score-circle score-circle--null ${className}`}>
        <span className="score-circle__placeholder">—</span>
      </div>
    )
  }

  // Calculate circle properties
  const radius = getCircleRadius(score)
  const opacity = getCircleOpacity(scoreStats ?? null)

  // Determine color: use metric-based color if metric is provided, otherwise use color prop
  const circleColor = metric
    ? getMetricColor(metric, score, useSolidColor)
    : color

  return (
    <div
      className={`score-circle ${className}`}
      title={tooltipText}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        background: 'transparent'
      }}
    >
      {/* Circle SVG */}
      <svg
        width={radius * 2 + 4}
        height={radius * 2 + 4}
        style={{
          display: 'block',
          marginBottom: showLabel ? '4px' : '0',
          background: 'transparent'
        }}
      >
        <circle
          cx={radius + 2}
          cy={radius + 2}
          r={radius}
          fill={circleColor}
          opacity={opacity}
          stroke="none"
        />
      </svg>

      {/* Label below circle */}
      {showLabel && (
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#6b7280',
            fontWeight: 400
          }}
        >
          {label ?? score.toFixed(3)}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TAG BADGE COMPONENT
// ============================================================================
// Unified tag badge showing Feature ID | Tag Name
// - Left section: Feature ID with light gray background
// - Right section: Tag name with tag-specific color

interface TagBadgeProps {
  featureId: number          // Feature ID to display on left
  tagName: string            // Tag name to display on right
  tagCategoryId: string      // Category ID for color lookup
  className?: string         // Additional CSS classes

  // Selection state props
  selectionState?: 'selected' | 'rejected' | 'confirmed' | null  // Visual selection state
  onClick?: (e: React.MouseEvent) => void  // Click handler for selection

  // Layout props
  fullWidth?: boolean        // If true, use flex: 1 to fill container width (default: false)

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
  isAuto = false
}) => {
  // Get tag color from pre-computed colors (or gray for unselected)
  const baseTagColor = getTagColor(tagCategoryId, tagName) || '#9ca3af'

  // Use consistent styling regardless of selection state
  const selectionStyle = {
    border: '1px solid rgba(0, 0, 0, 0.1)',
    opacity: 1.0,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
  }

  const isClickable = !!onClick

  // Tag background color (gray for unselected, actual color otherwise)
  const tagBgColor = tagName === 'Unsure' ? '#e5e7eb' : baseTagColor
  const tagTextColor = tagName === 'Unsure' ? '#6b7280' : '#000'

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
      // Apply stripe pattern for auto-tagged items with lower opacity
      const gapColor = UNSURE_GRAY
      // Convert hex to rgba with 50% opacity for softer stripes
      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }
      const stripeColor = hexToRgba(tagBgColor, 0.75)
      return {
        ...baseStyle,
        backgroundColor: gapColor,
        backgroundImage: `repeating-linear-gradient(
          ${STRIPE_PATTERN.rotation}deg,
          ${gapColor},
          ${gapColor} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
          ${stripeColor} ${STRIPE_PATTERN.width - STRIPE_PATTERN.stripeWidth}px,
          ${stripeColor} ${STRIPE_PATTERN.width}px
        )`
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
          e.currentTarget.style.transform = 'scale(1)'
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
          width: '45px',
          flexShrink: 0,
          textAlign: 'center'
        }}
      >
        {featureId}
      </div>

      {/* Tag name section (right) */}
      <div style={getTagSectionStyle()}>
        <span style={textWrapperStyle}>{tagName}</span>
      </div>
    </div>
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
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed N-gram') || '#9ca3af'

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

export default ScoreCircle
