import React from 'react'
import { getCircleRadius, getCircleOpacity } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'
import { getTagColor } from '../lib/tag-constants'
import type { ScoreStats } from '../lib/circle-encoding-utils'

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
  tagName: string            // Tag name to display on right (or "Unsure" if unselected)
  tagCategoryId: string      // Category ID for color lookup
  className?: string         // Additional CSS classes

  // Selection state props
  selectionState?: 'selected' | 'rejected' | 'confirmed' | null  // Visual selection state
  onClick?: (e: React.MouseEvent) => void  // Click handler for selection

  // Layout props
  fullWidth?: boolean        // If true, use flex: 1 to fill container width (default: false)
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  featureId,
  tagName,
  tagCategoryId,
  className = '',
  onClick,
  fullWidth = false
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
          flex: fullWidth ? 1 : 'none',
          textAlign: fullWidth ? 'center' : 'left'
        }}
      >
        {featureId}
      </div>

      {/* Tag name section (right) */}
      <div
        style={{
          padding: '2px 4px',
          backgroundColor: tagBgColor,
          color: tagTextColor,
          whiteSpace: 'nowrap',
          flex: fullWidth ? 1 : 'none',
          textAlign: fullWidth ? 'center' : 'left'
        }}
      >
        {tagName}
      </div>
    </div>
  )
}

export default ScoreCircle
