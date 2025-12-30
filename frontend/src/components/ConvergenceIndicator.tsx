import React, { useMemo } from 'react'
import '../styles/ConvergenceIndicator.css'
import type { FlipTrackingInfo } from '../types'

interface ConvergenceIndicatorProps {
  flipTracking: FlipTrackingInfo | null
}

/**
 * ConvergenceIndicator - Displays Decision Flip Rate (DFR) trend
 * Shows a sparkline of flip rates over tagging iterations
 * Replaces ModalityIndicator in ThresholdTaggingPanel
 */
export const ConvergenceIndicator: React.FC<ConvergenceIndicatorProps> = ({ flipTracking }) => {
  // Calculate current flip rate and color
  const { flipRateColor, flipRateLabel } = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return { flipRateColor: '#9ca3af', flipRateLabel: '--' }
    }

    const lastEntry = flipTracking.flipHistory[flipTracking.flipHistory.length - 1]
    const rate = lastEntry.flipRate * 100

    // Color based on flip rate: red (>10%) -> yellow (5%) -> green (<1%)
    let color: string
    if (rate > 10) {
      color = '#ef4444' // red
    } else if (rate > 5) {
      color = '#f59e0b' // amber
    } else if (rate > 1) {
      color = '#eab308' // yellow
    } else {
      color = '#22c55e' // green
    }

    return {
      flipRateColor: color,
      flipRateLabel: rate.toFixed(1) + '%'
    }
  }, [flipTracking])

  // Calculate sparkline points
  const sparklineData = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return null
    }

    const history = flipTracking.flipHistory
    const width = 140
    const height = 32
    const padding = { top: 4, bottom: 4, left: 4, right: 4 }

    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Scale: X by index, Y by flip rate (0-max, with minimum of 15%)
    const maxRate = Math.max(0.15, ...history.map(h => h.flipRate))
    const xScale = (i: number) => padding.left + (i / Math.max(1, history.length - 1)) * chartWidth
    const yScale = (rate: number) => padding.top + chartHeight - (rate / maxRate) * chartHeight

    // Build path and points
    const points = history.map((entry, i) => ({
      x: xScale(i),
      y: yScale(entry.flipRate),
      isBatch: entry.isBatch,
      flipRate: entry.flipRate
    }))

    // Path string for line
    const pathD = points.length > 1
      ? 'M ' + points.map(p => `${p.x},${p.y}`).join(' L ')
      : null

    // Reference lines at 5% and 1%
    const refLines = [
      { rate: 0.05, y: yScale(0.05), label: '5%' },
      { rate: 0.01, y: yScale(0.01), label: '1%' }
    ].filter(r => r.rate <= maxRate)

    return { points, pathD, refLines, width, height }
  }, [flipTracking])

  // Placeholder state when no data
  if (!flipTracking || flipTracking.flipHistory.length === 0) {
    return (
      <div className="convergence-indicator convergence-indicator--placeholder">
        <div className="convergence-indicator__placeholder">
          <span className="convergence-indicator__placeholder-text">
            Tag items to track stability
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="convergence-indicator">
      {/* Header row */}
      <div className="convergence-indicator__header">
        <span className="convergence-indicator__label">Decision Stability</span>
        <span
          className="convergence-indicator__value"
          style={{ color: flipRateColor }}
        >
          {flipRateLabel}
        </span>
      </div>

      {/* Sparkline */}
      {sparklineData && (
        <svg
          className="convergence-indicator__sparkline"
          width={sparklineData.width}
          height={sparklineData.height}
          viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
        >
          {/* Reference lines */}
          {sparklineData.refLines.map((ref, i) => (
            <g key={i}>
              <line
                x1={4}
                y1={ref.y}
                x2={sparklineData.width - 4}
                y2={ref.y}
                stroke="#d1d5db"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <text
                x={sparklineData.width - 2}
                y={ref.y - 2}
                fontSize={8}
                fill="#9ca3af"
                textAnchor="end"
              >
                {ref.label}
              </text>
            </g>
          ))}

          {/* Line path */}
          {sparklineData.pathD && (
            <path
              d={sparklineData.pathD}
              fill="none"
              stroke="#6b7280"
              strokeWidth={1.5}
            />
          )}

          {/* Data points */}
          {sparklineData.points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={point.isBatch ? 4 : 2.5}
              fill={i === sparklineData.points.length - 1 ? flipRateColor : '#6b7280'}
              stroke={point.isBatch ? '#fff' : 'none'}
              strokeWidth={point.isBatch ? 1 : 0}
            />
          ))}
        </svg>
      )}
    </div>
  )
}

export default ConvergenceIndicator
