import React from 'react'
import { getCircleRadius, getCircleOpacity } from '../lib/circle-encoding-utils'
import type { ScoreStats } from '../lib/circle-encoding-utils'

// ============================================================================
// SCORE CIRCLE COMPONENT
// ============================================================================
// Reusable circle renderer with size/opacity encoding
// - Size: Encodes score value (min 1px → max 10px)
// - Opacity: Encodes consistency/spread (1.0 = consistent, 0.1 = high variance)

interface ScoreCircleProps {
  score: number | null           // Score value (0-1 normalized)
  scoreStats?: ScoreStats | null  // Statistics for opacity calculation
  label?: string                 // Optional label below circle (e.g., score value)
  tooltipText?: string           // Optional tooltip text
  color?: string                 // Circle fill color (default: #1f2937)
  showLabel?: boolean            // Whether to show label below circle (default: true)
  className?: string             // Additional CSS classes
}

const ScoreCircle: React.FC<ScoreCircleProps> = ({
  score,
  scoreStats,
  label,
  tooltipText,
  color = '#1f2937',
  showLabel = true,
  className = ''
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
          fill={color}
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

export default ScoreCircle
