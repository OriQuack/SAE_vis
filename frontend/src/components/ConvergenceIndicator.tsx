import React, { useMemo } from 'react'
import { useResizeObserver } from '../lib/utils'
import '../styles/ConvergenceIndicator.css'
import type { FlipTrackingInfo } from '../types'
import { OKABE_ITO_PALETTE } from '../lib/constants'

interface ConvergenceIndicatorProps {
  flipTracking: FlipTrackingInfo | null
}

// Threshold bands (discrete zones with semantic meaning)
// Using Okabe-Ito colorblind-safe palette with 15% opacity for background tints
const THRESHOLD_BANDS = [
  { min: 0, max: 0.03, color: OKABE_ITO_PALETTE.BLUISH_GREEN + '16', label: 'Good' },    // #009E73 at 15% opacity
  { min: 0.03, max: 0.15, color: OKABE_ITO_PALETTE.YELLOW + '16', label: 'Warning' },    // #F0E442 at 19% opacity
  { min: 0.15, max: 1.0, color: OKABE_ITO_PALETTE.VERMILLION + '16', label: 'Bad' },     // #D55E00 at 15% opacity
] as const

const THRESHOLD_LINES = [0.03, 0.15] // 5% and 10% reference lines

/**
 * ConvergenceIndicator - Displays Decision Flip Rate (DFR) trend
 * Shows a sparkline of flip rates with discrete threshold bands
 * IEEE VIS-style: reference lines + categorical zones + trend indicator
 */
export const ConvergenceIndicator: React.FC<ConvergenceIndicatorProps> = ({ flipTracking }) => {
  // Use resize observer for responsive sizing
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 200,
    defaultHeight: 100,
    debounceMs: 16,
    debugId: 'convergence-indicator'
  })

  // Calculate sparkline points and threshold bands
  const sparklineData = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return null
    }

    const history = flipTracking.flipHistory
    // Use measured container size for viewBox
    const width = containerSize.width
    const height = containerSize.height
    const padding = { top: 10, bottom: 20, left: 30, right: 30 }

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

    // X-axis ticks (show every iteration with actual iteration numbers)
    const xTicks = history.map((entry, i) => ({
      x: xScale(i),
      label: String(entry.iteration)
    }))

    return { points, pathD, width, height, padding, yTicks, xTicks, xAxisY, bands, thresholdLines, chartWidth }
  }, [flipTracking, containerSize.width, containerSize.height])

  // Placeholder state when no data
  if (!flipTracking || flipTracking.flipHistory.length === 0) {
    return (
      <div ref={containerRef} className="convergence-indicator">
        <div className="convergence-indicator__placeholder">
          <span className="convergence-indicator__placeholder-text">
            <span className="convergence-indicator__stage-number">2</span> Tag with histogram to see trend
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="convergence-indicator">
      {/* Sparkline with threshold bands */}
      {sparklineData && (
        <svg
          className="convergence-indicator__sparkline"
          viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
          preserveAspectRatio="xMidYMid meet"
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
                fontSize={12}
                fill="#666"
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
              fontSize={12}
              fill="#666"
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

          {/* X-axis tick labels (iteration numbers) */}
          {sparklineData.xTicks.map((tick, i) => (
            <text
              key={i}
              x={tick.x}
              y={sparklineData.xAxisY + 12}
              fontSize={12}
              fill="#666"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}

          {/* Sparkline path (monochrome for contrast) */}
          {sparklineData.pathD && (
            <path
              d={sparklineData.pathD}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />
          )}

          {/* Data points */}
          {sparklineData.points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={2.5}
              fill="#1f2937"
            />
          ))}
        </svg>
      )}
    </div>
  )
}

export default ConvergenceIndicator
