/**
 * Histogram chart component - renders the histogram visualization
 */

import React, { useMemo } from 'react'
import { HistogramData, MetricType } from '../../types'

interface HistogramChartProps {
  data: HistogramData
  metric: MetricType
  width: number
  height: number
  threshold: number
  color?: string
  showAxis?: boolean
  showStats?: boolean
}

export const HistogramChart: React.FC<HistogramChartProps> = React.memo(({
  data,
  metric,
  width,
  height,
  threshold,
  color = '#3b82f6',
  showAxis = true,
  showStats = false
}) => {
  const { histogram, statistics } = data

  // Calculate bar dimensions
  const bars = useMemo(() => {
    const maxCount = Math.max(...histogram.bins.map(b => b.count))
    const barWidth = width / histogram.bins.length
    const padding = 1

    return histogram.bins.map((bin, i) => {
      const barHeight = maxCount > 0 ? (bin.count / maxCount) * height : 0
      const x = i * barWidth
      const y = height - barHeight

      return {
        x: x + padding,
        y,
        width: barWidth - padding * 2,
        height: barHeight,
        count: bin.count,
        start: bin.start,
        end: bin.end,
        isActive: threshold >= bin.start && threshold < bin.end
      }
    })
  }, [histogram, width, height, threshold])

  // Calculate threshold position
  const thresholdX = useMemo(() => {
    const range = statistics.max - statistics.min
    if (range === 0) return width / 2
    return ((threshold - statistics.min) / range) * width
  }, [threshold, statistics, width])

  return (
    <svg width={width} height={height} className="histogram-chart">
      {/* Histogram bars */}
      <g className="histogram-bars">
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={bar.isActive ? color : '#e5e7eb'}
            opacity={bar.isActive ? 1 : 0.6}
            className="histogram-bar"
          />
        ))}
      </g>

      {/* Threshold line */}
      <line
        x1={thresholdX}
        y1={0}
        x2={thresholdX}
        y2={height}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="4 2"
        className="threshold-line"
      />

      {/* X-axis */}
      {showAxis && (
        <g className="histogram-axis">
          <line
            x1={0}
            y1={height}
            x2={width}
            y2={height}
            stroke="#9ca3af"
            strokeWidth={1}
          />
          <text
            x={0}
            y={height + 15}
            fontSize={10}
            fill="#6b7280"
            textAnchor="start"
          >
            {statistics.min.toFixed(2)}
          </text>
          <text
            x={width}
            y={height + 15}
            fontSize={10}
            fill="#6b7280"
            textAnchor="end"
          >
            {statistics.max.toFixed(2)}
          </text>
        </g>
      )}

      {/* Statistics overlay */}
      {showStats && (
        <g className="histogram-stats">
          <text x={5} y={15} fontSize={11} fill="#4b5563">
            μ={statistics.mean.toFixed(3)} σ={statistics.std.toFixed(3)}
          </text>
        </g>
      )}
    </svg>
  )
})

HistogramChart.displayName = 'HistogramChart'