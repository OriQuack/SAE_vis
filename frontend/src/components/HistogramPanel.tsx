import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateHistogramBars,
  calculateXAxisTicks,
  calculateGridLines,
  formatSmartNumber
} from '../lib/d3-histogram-utils'
import type { HistogramData, HistogramChart, MetricType } from '../types'
import { OKABE_ITO_PALETTE } from '../lib/constants'
import '../styles/HistogramPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface HistogramPanelProps {
  className?: string
}


// Metric configuration for the panel
const PANEL_METRICS = [
  {
    key: 'feature_splitting' as MetricType,
    label: ['Feature', 'Splitting'],
    averageBy: null,
    badges: [
      { color: OKABE_ITO_PALETTE.BLUISH_GREEN, text: '1' } // Colorblind-safe green
    ]
  },
  {
    key: 'semdist_mean' as MetricType,
    label: ['Semantic', 'Similarity'],
    averageBy: 'llm_explainer',
    badges: [
      { color: OKABE_ITO_PALETTE.ORANGE, text: '3' }, // Colorblind-safe yellow
      { color: OKABE_ITO_PALETTE.REDDISH_PURPLE, text: '1' }  // Orange (for LLM explainer)
    ]
  },
  {
    key: 'score_embedding' as MetricType,
    label: ['Embedding', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: OKABE_ITO_PALETTE.ORANGE, text: '3' }, // Colorblind-safe yellow
      { color: OKABE_ITO_PALETTE.REDDISH_PURPLE, text: '3' }  // Reddish purple
    ]
  },
  {
    key: 'score_fuzz' as MetricType,
    label: ['Fuzz', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: OKABE_ITO_PALETTE.ORANGE, text: '3' }, // Colorblind-safe yellow
      { color: OKABE_ITO_PALETTE.BLUE, text: '3' }  // Colorblind-safe blue (for LLM scorer)
    ]
  },
  {
    key: 'score_detection' as MetricType,
    label: ['Detection', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: OKABE_ITO_PALETTE.ORANGE, text: '3' }, // Colorblind-safe yellow
      { color: OKABE_ITO_PALETTE.BLUE, text: '3' }  // Colorblind-safe blue (for LLM scorer)
    ]
  }
]

// Colors for histograms
const HISTOGRAM_COLORS = {
  bars: '#94a3b8',
  grid: '#e2e8f0',
  text: '#374151',
  axis: '#6b7280'
}

// ==================== SUB-COMPONENTS ====================
const SingleHistogram: React.FC<{
  data: HistogramData
  label: string[]
  badges: Array<{ color: string; text: string }>
  width: number
  height: number
  isLast: boolean
}> = ({ data, label, badges, width, height }) => {
  const margin = { top: 5, right: 10, bottom: 10, left: 85 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // Create D3 scales
  const xScale = useMemo(() => {
    const scale = (value: number) => {
      const range = data.statistics.max - data.statistics.min
      if (range === 0) return innerWidth / 2
      return ((value - data.statistics.min) / range) * innerWidth
    }
    scale.domain = () => [data.statistics.min, data.statistics.max]
    scale.range = () => [0, innerWidth]
    scale.ticks = (count = 5) => {
      const step = (data.statistics.max - data.statistics.min) / count
      return Array.from({ length: count + 1 }, (_, i) => data.statistics.min + i * step)
    }
    return scale
  }, [data.statistics, innerWidth])

  const yScale = useMemo(() => {
    const maxCount = Math.max(...data.histogram.counts, 1)
    const scale = (value: number) => {
      return innerHeight - (value / maxCount) * innerHeight
    }
    scale.domain = () => [0, maxCount]
    scale.range = () => [innerHeight, 0]
    scale.ticks = (count = 5) => {
      const step = maxCount / count
      return Array.from({ length: count + 1 }, (_, i) => i * step)
    }
    return scale
  }, [data.histogram.counts, innerHeight])

  // Create chart object for utility functions
  const chart: HistogramChart = useMemo(() => ({
    bins: data.histogram.bins.map((_bin, i) => ({
      x0: data.histogram.bin_edges[i],
      x1: data.histogram.bin_edges[i + 1],
      count: data.histogram.counts[i],
      density: data.histogram.counts[i] / data.total_features
    })),
    xScale: xScale as any,
    yScale: yScale as any,
    width: innerWidth,
    height: innerHeight,
    margin,
    metric: data.metric,
    yOffset: 0,
    chartTitle: label.join(' ')
  }), [data, xScale, yScale, innerWidth, innerHeight, margin, label])

  const bars = useMemo(() =>
    calculateHistogramBars(chart, 0, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.bars),
    [chart]
  )

  const gridLines = useMemo(() =>
    calculateGridLines(chart, 3),
    [chart]
  )

  const xAxisTicks = useMemo(() =>
    calculateXAxisTicks(chart, 5),
    [chart]
  )

  return (
    <div className="histogram-panel__chart">
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines - subtle */}
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
              stroke={HISTOGRAM_COLORS.grid}
              strokeWidth={1}
              opacity={0.3}
            />
          ))}

          {/* Histogram bars */}
          {bars.map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={bar.color}
              fillOpacity={0.6}
              stroke="white"
              strokeWidth={0.5}
            />
          ))}

          {/* X-axis */}
          <g transform={`translate(0, ${innerHeight})`}>
            <line x1={0} x2={innerWidth} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
            {xAxisTicks.map(tick => (
              <g key={tick.value} transform={`translate(${tick.position}, 0)`}>
                <line y1={0} y2={2} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
                <text y={8} textAnchor="middle" fontSize={7} fill={HISTOGRAM_COLORS.text} opacity={0.6}>
                  {formatSmartNumber(tick.value)}
                </text>
              </g>
            ))}
          </g>

          {/* Left-side label with badges below */}
          <g transform={`translate(${-margin.left + 10}, ${innerHeight / 2})`}>
            {/* Label text */}
            {label.map((line, i) => (
              <text
                key={i}
                x={0}
                y={(i - (label.length - 1) / 2) * 14 - 8}
                textAnchor="start"
                alignmentBaseline="middle"
                fontSize={14}
                fontWeight={600}
                fill={HISTOGRAM_COLORS.text}
              >
                {line}
              </text>
            ))}
            {/* Badges below the label */}
            <g transform={`translate(8, ${label.length * 7 + 3})`}>
              {badges.map((badge, i) => (
                <g key={i} transform={`translate(${i * 20}, 0)`}>
                  {/* Colored dot */}
                  <circle
                    cx={0}
                    cy={0}
                    r={8}
                    fill={badge.color}
                  />
                  {/* Badge number */}
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="white"
                  >
                    {badge.text}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}

// ==================== MAIN COMPONENT ====================
export const HistogramPanel: React.FC<HistogramPanelProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 800 })

  // Store state
  const histogramPanelData = useVisualizationStore(state => state.histogramPanelData)
  const loading = useVisualizationStore(state => state.loading.histogramPanel)
  const error = useVisualizationStore(state => state.errors.histogramPanel)
  const { fetchHistogramPanelData } = useVisualizationStore()

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Fetch data on mount
  useEffect(() => {
    fetchHistogramPanelData()
  }, [fetchHistogramPanelData])

  // Calculate individual histogram dimensions
  const histogramHeight = useMemo(() => {
    const padding = 6
    const totalPadding = padding * (PANEL_METRICS.length + 1)
    return (containerSize.height - totalPadding) / PANEL_METRICS.length
  }, [containerSize.height])

  const histogramWidth = useMemo(() => {
    return containerSize.width - 12 // Leave some padding on sides
  }, [containerSize.width])

  // Render loading state
  if (loading) {
    return (
      <div className={`histogram-panel ${className}`} ref={containerRef}>
        <div className="histogram-panel__loading">
          <div className="histogram-panel__spinner" />
          <span>Loading histograms...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className={`histogram-panel ${className}`} ref={containerRef}>
        <div className="histogram-panel__error">
          <div className="histogram-panel__error-icon">⚠️</div>
          <div className="histogram-panel__error-message">{error}</div>
        </div>
      </div>
    )
  }

  // Render empty state
  if (!histogramPanelData) {
    return (
      <div className={`histogram-panel ${className}`} ref={containerRef}>
        <div className="histogram-panel__empty">
          <div className="histogram-panel__empty-icon">📊</div>
          <div className="histogram-panel__empty-message">No histogram data available</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`histogram-panel ${className}`} ref={containerRef}>
      <div className="histogram-panel__container">
        {PANEL_METRICS.map((metric, index) => {
          const data = histogramPanelData[metric.key]
          const isLast = index === PANEL_METRICS.length - 1

          if (!data) {
            return (
              <div key={metric.key} className="histogram-panel__chart histogram-panel__chart--empty">
                <div className="histogram-panel__no-data">{metric.label.join(' ')}: No data</div>
              </div>
            )
          }

          return (
            <SingleHistogram
              key={metric.key}
              data={data}
              label={metric.label}
              badges={metric.badges}
              width={histogramWidth}
              height={histogramHeight}
              isLast={isLast}
            />
          )
        })}
      </div>
    </div>
  )
}

export default HistogramPanel