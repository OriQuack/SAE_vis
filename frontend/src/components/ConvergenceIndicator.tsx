import React, { useMemo } from 'react'
import '../styles/ConvergenceIndicator.css'
import type { FlipTrackingInfo } from '../types'
import { OKABE_ITO_PALETTE } from '../lib/constants'

interface ConvergenceIndicatorProps {
  flipTracking: FlipTrackingInfo | null
}

// Threshold bands (discrete zones with semantic meaning)
// Using Okabe-Ito colorblind-safe palette with 15% opacity for background tints
const THRESHOLD_BANDS = [
  { min: 0, max: 0.05, color: OKABE_ITO_PALETTE.BLUISH_GREEN + '32', label: 'Good' },    // #009E73 at 15% opacity
  { min: 0.05, max: 0.15, color: OKABE_ITO_PALETTE.YELLOW + '32', label: 'Warning' },    // #F0E442 at 19% opacity
  { min: 0.15, max: 1.0, color: OKABE_ITO_PALETTE.VERMILLION + '32', label: 'Bad' },     // #D55E00 at 15% opacity
] as const

const THRESHOLD_LINES = [0.05, 0.15] // 5% and 10% reference lines

/**
 * ConvergenceIndicator - Displays Decision Flip Rate (DFR) trend
 * Shows a sparkline of flip rates with discrete threshold bands
 * IEEE VIS-style: reference lines + categorical zones + trend indicator
 */
export const ConvergenceIndicator: React.FC<ConvergenceIndicatorProps> = ({ flipTracking }) => {
  // Calculate current flip rate
  const flipRateLabel = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return '--'
    }
    const lastEntry = flipTracking.flipHistory[flipTracking.flipHistory.length - 1]
    return (lastEntry.flipRate * 100).toFixed(1) + '%'
  }, [flipTracking])

  // Calculate sparkline points and threshold bands
  const sparklineData = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return null
    }

    const history = flipTracking.flipHistory
    // viewBox dimensions (matches container width: 180px)
    const width = 180
    const height = 80
    const padding = { top: 10, bottom: 5, left: 24, right: 24 }

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

    // Y-axis ticks (show 0%, threshold lines, and max)
    const yTicks = [
      { y: yScale(0), label: '0%' },
      { y: yScale(maxRate), label: `${Math.round(maxRate * 100)}%` }
    ]

    // X-axis line position
    const xAxisY = padding.top + chartHeight

    // Calculate threshold bands (discrete zones)
    const bands = THRESHOLD_BANDS.map(band => {
      const clampedMin = Math.min(band.min, maxRate)
      const clampedMax = Math.min(band.max, maxRate)

      // Skip bands entirely above maxRate
      if (clampedMin >= maxRate) return null

      const y1 = yScale(clampedMax)
      const y2 = yScale(clampedMin)

      return {
        y: y1,
        height: y2 - y1,
        color: band.color,
        label: band.label
      }
    }).filter((b): b is NonNullable<typeof b> => b !== null && b.height > 0)

    // Calculate threshold reference lines
    const thresholdLines = THRESHOLD_LINES
      .filter(t => t < maxRate) // Only show lines within visible range
      .map(threshold => ({
        y: yScale(threshold),
        label: `${Math.round(threshold * 100)}%`
      }))

    return { points, pathD, width, height, padding, yTicks, xAxisY, bands, thresholdLines, chartWidth }
  }, [flipTracking])

  // Placeholder state when no data
  if (!flipTracking || flipTracking.flipHistory.length === 0) {
    return (
      <div className="convergence-indicator">
        <div className="convergence-indicator__header">
          <span className="convergence-indicator__label">Prediction Flip Rate</span>
          <span className="convergence-indicator__value" style={{ color: '#9ca3af' }}>
            --
          </span>
        </div>
        <div className="convergence-indicator__placeholder">
          <span className="convergence-indicator__placeholder-text">
            Tag features with histogram to see trend
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="convergence-indicator">
      {/* Header row */}
      <div className="convergence-indicator__header">
        <span className="convergence-indicator__label">Prediction Flip Rate</span>
        <span className="convergence-indicator__value">
          {flipRateLabel}
        </span>
      </div>

      {/* Sparkline with threshold bands */}
      {sparklineData && (
        <svg
          className="convergence-indicator__sparkline"
          viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
          preserveAspectRatio="none"
        >
          {/* Discrete threshold bands (background zones) */}
          {sparklineData.bands.map((band, i) => (
            <rect
              key={i}
              x={sparklineData.padding.left}
              y={band.y}
              width={sparklineData.chartWidth}
              height={band.height}
              fill={band.color}
            />
          ))}

          {/* Threshold reference lines (dashed) */}
          {sparklineData.thresholdLines.map((line, i) => (
            <g key={i}>
              <line
                x1={sparklineData.padding.left}
                y1={line.y}
                x2={sparklineData.width - sparklineData.padding.right}
                y2={line.y}
                stroke="#4b5563"
                strokeWidth={1}
                strokeDasharray="3,2"
              />
              {/* Threshold label on right side */}
              <text
                x={sparklineData.width - sparklineData.padding.right + 2}
                y={line.y}
                className="convergence-indicator__axis-label"
                fontSize={9}
                fill="#4b5563"
                textAnchor="start"
                dominantBaseline="middle"
              >
                {line.label}
              </text>
            </g>
          ))}

          {/* Y-axis labels (0% and max) */}
          {sparklineData.yTicks.map((tick, i) => (
            <text
              key={i}
              x={sparklineData.padding.left - 3}
              y={tick.y}
              className="convergence-indicator__axis-label"
              fontSize={9}
              fill="#4b5563"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick.label}
            </text>
          ))}

          {/* X-axis line */}
          <line
            x1={sparklineData.padding.left}
            y1={sparklineData.xAxisY}
            x2={sparklineData.width - sparklineData.padding.right}
            y2={sparklineData.xAxisY}
            stroke="#4b5563"
            strokeWidth={1}
          />

          {/* Sparkline path (monochrome for contrast) */}
          {sparklineData.pathD && (
            <path
              d={sparklineData.pathD}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />
          )}

          {/* Data points: circles for manual, diamonds for batch */}
          {sparklineData.points.map((point, i) => (
            point.isBatch ? (
              // Diamond shape for batch updates (rotated square)
              <rect
                key={i}
                x={point.x - 3}
                y={point.y - 3}
                width={6}
                height={6}
                fill="#1f2937"
                transform={`rotate(45 ${point.x} ${point.y})`}
              />
            ) : (
              // Circle for manual tagging
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={2.5}
                fill="#1f2937"
              />
            )
          ))}
        </svg>
      )}
    </div>
  )
}

export default ConvergenceIndicator
