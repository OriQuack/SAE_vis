import React, { useMemo } from 'react'
import { useResizeObserver } from '../lib/utils'
import '../styles/ConvergenceIndicator.css'
import type { FlipTrackingInfo } from '../types'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'

interface ConvergenceIndicatorProps {
  flipTracking: FlipTrackingInfo | null
  stage?: 'stage1' | 'stage2' | 'stage3'
}

const THRESHOLD_LINES = [0.10, 0.25, 0.50] // 10%, 25%, and 50% reference lines

// Default container dimensions (used until resize observer measures actual size)
const DEFAULT_WIDTH = 200
const DEFAULT_HEIGHT = 100

// Number of data points to show in the sparkline (sliding window)
export const FLIP_HISTORY_WINDOW_SIZE = 10

/**
 * ConvergenceIndicator - Displays Decision Flip Rate (DFR) trend
 * Shows a sparkline of flip rates with discrete threshold bands
 * IEEE VIS-style: reference lines + categorical zones + trend indicator
 */
export const ConvergenceIndicator: React.FC<ConvergenceIndicatorProps> = ({ flipTracking, stage }) => {
  // Use resize observer for responsive sizing
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
    debounceMs: 16,
    debugId: 'convergence-indicator'
  })

  // Color configuration for stacked bars based on stage
  const categoryConfig = useMemo((): { order: string[]; colors: Record<string, string> } => {
    if (stage === 'stage3') {
      return {
        order: ['missed-N-gram', 'missed-context', 'noisy-activation', 'well-explained'],
        colors: {
          'well-explained': getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#4CAF50',
          'noisy-activation': getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#FF5722',
          'missed-N-gram': getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9C27B0',
          'missed-context': getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#2196F3'
        }
      }
    }
    const categoryId = stage === 'stage1' ? TAG_CATEGORY_FEATURE_SPLITTING : TAG_CATEGORY_QUALITY
    const selectedTag = stage === 'stage1' ? 'Fragmented' : 'Well-Explained'
    const rejectedTag = stage === 'stage1' ? 'Monosemantic' : 'Need Revision'
    return {
      order: ['rejected', 'selected'],
      colors: {
        selected: getTagColor(categoryId, selectedTag) || '#4CAF50',
        rejected: getTagColor(categoryId, rejectedTag) || '#F44336'
      }
    }
  }, [stage])

  // Calculate sparkline points and threshold bands
  const sparklineData = useMemo(() => {
    if (!flipTracking || flipTracking.flipHistory.length === 0) {
      return null
    }

    const history = flipTracking.flipHistory
    // Use measured container size for viewBox
    const width = containerSize.width
    const height = containerSize.height
    const padding = { top: 10, bottom: 35, left: 40, right: 40 }

    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Scale: X by index, Y by flip rate (fixed 0-100%)
    const maxRate = 1.0  // Fixed at 100%
    const xScale = (i: number) => padding.left + (i / Math.max(1, history.length - 1)) * chartWidth
    const yScale = (rate: number) => padding.top + chartHeight - (rate / maxRate) * chartHeight

    // Build all points for positioning (including iteration 0)
    const allPoints = history.map((entry, i) => ({
      x: xScale(i),
      y: yScale(entry.flipRate),
      isBatch: entry.isBatch,
      flipRate: entry.flipRate,
      iteration: entry.iteration
    }))

    // Line chart points: only show for iterations > 0 (after first tag)
    // Iteration 0 only shows stacked bar, no line point
    const linePoints = allPoints.filter(p => p.iteration > 0)

    // Path string for line (only connecting iterations > 0)
    const pathD = linePoints.length > 1
      ? 'M ' + linePoints.map(p => `${p.x},${p.y}`).join(' L ')
      : null

    // Y-axis ticks (fixed 0% and 100%)
    const yTicks = [
      { y: yScale(0), label: '0%' },
      { y: yScale(1.0), label: '100%' }
    ]

    // X-axis line position
    const xAxisY = padding.top + chartHeight

    // Calculate threshold reference lines (all visible with fixed scale)
    const thresholdLines = THRESHOLD_LINES.map(threshold => ({
      y: yScale(threshold),
      label: `${Math.round(threshold * 100)}%`
    }))

    // X-axis ticks (show every iteration with actual iteration numbers)
    const xTicks = history.map((entry, i) => ({
      x: xScale(i),
      label: String(entry.iteration)
    }))

    // Calculate stacked bars for prediction counts
    const barWidth = 8  // Small fixed width

    // Build stacked bar data for each iteration (full height bars)
    const bars = history.map((entry, i) => {
      if (!entry.predictionCounts) return null

      const totalCount = Object.values(entry.predictionCounts).reduce((sum, count) => sum + count, 0)
      if (totalCount === 0) return null

      // Build stacked segments from bottom up (full chart height)
      const segments: Array<{ x: number; y: number; width: number; height: number; color: string; category: string }> = []
      let currentY = xAxisY  // Start from x-axis (bottom)

      for (const category of categoryConfig.order) {
        const count = entry.predictionCounts[category] || 0
        if (count === 0) continue

        const segmentHeight = (count / totalCount) * chartHeight
        currentY -= segmentHeight  // Move up for next segment

        segments.push({
          x: xScale(i) - barWidth / 2,
          y: currentY,
          width: barWidth,
          height: segmentHeight,
          color: categoryConfig.colors[category] || '#999',
          category
        })
      }

      return { segments, x: xScale(i) }
    }).filter((bar): bar is NonNullable<typeof bar> => bar !== null)

    // Calculate links between consecutive bars for flip transitions
    const links: Array<{
      sourceX: number
      sourceY: number
      targetX: number
      targetY: number
      height: number
      sourceColor: string
      targetColor: string
      transition: string
    }> = []

    for (let i = 1; i < history.length; i++) {
      const prevEntry = history[i - 1]
      const currEntry = history[i]

      if (!prevEntry.predictionCounts || !currEntry.predictionCounts || !currEntry.flipTransitions) continue

      const prevBar = bars[i - 1]
      const currBar = bars[i]
      if (!prevBar || !currBar) continue

      // For each transition (e.g., 'selected→rejected')
      for (const [transitionKey, count] of Object.entries(currEntry.flipTransitions)) {
        if (count === 0) continue

        const [fromCategory, toCategory] = transitionKey.split('→')

        // Find source segment (fromCategory in previous bar)
        const sourceSegment = prevBar.segments.find(s => s.category === fromCategory)
        // Find target segment (toCategory in current bar)
        const targetSegment = currBar.segments.find(s => s.category === toCategory)

        if (!sourceSegment || !targetSegment) continue

        // Calculate link height proportional to transition count
        const prevTotal = Object.values(prevEntry.predictionCounts).reduce((a, b) => a + b, 0)
        const linkHeight = Math.max(1, (count / prevTotal) * chartHeight)

        links.push({
          sourceX: sourceSegment.x + barWidth,  // Right edge of previous bar
          sourceY: sourceSegment.y,  // Top of source segment
          targetX: targetSegment.x,  // Left edge of current bar
          targetY: targetSegment.y,  // Top of target segment
          height: linkHeight,
          sourceColor: categoryConfig.colors[fromCategory] || '#999',
          targetColor: categoryConfig.colors[toCategory] || '#999',
          transition: transitionKey
        })
      }
    }

    return { linePoints, pathD, width, height, padding, yTicks, xTicks, xAxisY, thresholdLines, chartWidth, chartHeight, bars, links }
  }, [flipTracking, containerSize.width, containerSize.height, categoryConfig])

  // Placeholder state when no data (shown before histogram is visible)
  if (!flipTracking || flipTracking.flipHistory.length === 0) {
    return (
      <div ref={containerRef} className="convergence-indicator">
        <div className="convergence-indicator__placeholder">
          <span className="convergence-indicator__placeholder-text">
            <span className="convergence-indicator__stage-number">2</span> Wait for histogram to see trend
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
          {/* Gradient definitions for flip transition links */}
          <defs>
            {sparklineData.links?.map((link, i) => (
              <linearGradient
                key={`gradient-${i}`}
                id={`link-gradient-${i}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={link.sourceColor} />
                <stop offset="100%" stopColor={link.targetColor} />
              </linearGradient>
            ))}
          </defs>

          {/* Threshold reference lines (dashed) */}
          {sparklineData.thresholdLines.map((line, i) => (
            <g key={i}>
              <line
                x1={sparklineData.padding.left}
                y1={line.y}
                x2={sparklineData.width - sparklineData.padding.right}
                y2={line.y}
                stroke="#9ca3af"
                strokeWidth={1}
                strokeDasharray="3,2"
              />
              {/* Threshold label on right side */}
              <text
                x={sparklineData.width - sparklineData.padding.right + 5}
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
              x={sparklineData.padding.left - 5}
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
              y={sparklineData.xAxisY + 18}
              fontSize={12}
              fill="#666"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}

          {/* X-axis label */}
          <text
            x={sparklineData.padding.left + sparklineData.chartWidth / 2}
            y={sparklineData.xAxisY + 34}
            textAnchor="middle"
            fontSize={14}
            fill="#666"
          >
            Iteration
          </text>

          {/* Stacked bars (behind line) - SVM prediction category distribution */}
          {sparklineData.bars?.map((bar, i) => (
            <g key={`bar-${i}`}>
              {bar.segments.map((seg, j) => (
                <rect
                  key={j}
                  x={seg.x}
                  y={seg.y}
                  width={seg.width}
                  height={seg.height}
                  fill={seg.color}
                />
              ))}
            </g>
          ))}

          {/* Flip transition links between consecutive bars */}
          {sparklineData.links?.map((link, i) => (
            <path
              key={`link-${i}`}
              d={`M ${link.sourceX},${link.sourceY}
                  C ${(link.sourceX + link.targetX) / 2},${link.sourceY}
                    ${(link.sourceX + link.targetX) / 2},${link.targetY}
                    ${link.targetX},${link.targetY}
                  L ${link.targetX},${link.targetY + link.height}
                  C ${(link.sourceX + link.targetX) / 2},${link.targetY + link.height}
                    ${(link.sourceX + link.targetX) / 2},${link.sourceY + link.height}
                    ${link.sourceX},${link.sourceY + link.height}
                  Z`}
              fill={`url(#link-gradient-${i})`}
              opacity={0.7}
            />
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

          {/* Line chart points (only for iterations > 0) */}
          {sparklineData.linePoints.map((point, i) => (
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
