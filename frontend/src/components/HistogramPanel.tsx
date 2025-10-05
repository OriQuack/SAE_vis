import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateHistogramBars,
  calculateXAxisTicks,
  calculateYAxisTicks,
  calculateGridLines,
  formatSmartNumber
} from '../lib/d3-histogram-utils'
import type { HistogramData, HistogramChart, MetricType } from '../types'
import '../styles/HistogramPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface HistogramPanelProps {
  className?: string
}


// Metric configuration for the panel
const PANEL_METRICS = [
  {
    key: 'feature_splitting' as MetricType,
    title: 'Feature Splitting',
    averageBy: null
  },
  {
    key: 'semdist_mean' as MetricType,
    title: 'Semantic Similarity',
    averageBy: 'llm_explainer'
  },
  {
    key: 'score_embedding' as MetricType,
    title: 'Embedding Score',
    averageBy: 'llm_scorer'
  },
  {
    key: 'score_fuzz' as MetricType,
    title: 'Fuzz Score',
    averageBy: 'llm_scorer'
  },
  {
    key: 'score_detection' as MetricType,
    title: 'Detection Score',
    averageBy: 'llm_scorer'
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
  title: string
  width: number
  height: number
}> = ({ data, title, width, height }) => {
  const margin = { top: 10, right: 15, bottom: 25, left: 45 }
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
    chartTitle: title
  }), [data, xScale, yScale, innerWidth, innerHeight, margin, title])

  const bars = useMemo(() =>
    calculateHistogramBars(chart, 0, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.bars),
    [chart]
  )

  const gridLines = useMemo(() =>
    calculateGridLines(chart, 5),
    [chart]
  )

  const xAxisTicks = useMemo(() =>
    calculateXAxisTicks(chart, 5),
    [chart]
  )

  const yAxisTicks = useMemo(() =>
    calculateYAxisTicks(chart, 5),
    [chart]
  )

  return (
    <div className="histogram-panel__chart">
      <h4 className="histogram-panel__chart-title">{title}</h4>
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
              stroke={HISTOGRAM_COLORS.grid}
              strokeWidth={1}
              opacity={line.opacity}
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
            <line x1={0} x2={innerWidth} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
            {xAxisTicks.map(tick => (
              <g key={tick.value} transform={`translate(${tick.position}, 0)`}>
                <line y1={0} y2={4} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                <text y={14} textAnchor="middle" fontSize={9} fill={HISTOGRAM_COLORS.text}>
                  {formatSmartNumber(tick.value)}
                </text>
              </g>
            ))}
          </g>

          {/* Y-axis */}
          <g>
            <line x1={0} x2={0} y1={0} y2={innerHeight} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
            {yAxisTicks.map(tick => (
              <g key={tick.value} transform={`translate(0, ${tick.position})`}>
                <line x1={-4} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                <text x={-8} textAnchor="end" alignmentBaseline="middle" fontSize={9} fill={HISTOGRAM_COLORS.text}>
                  {Math.round(tick.value)}
                </text>
              </g>
            ))}
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
    const padding = 12
    const totalPadding = padding * (PANEL_METRICS.length + 1)
    return (containerSize.height - totalPadding) / PANEL_METRICS.length
  }, [containerSize.height])

  const histogramWidth = useMemo(() => {
    return containerSize.width - 20 // Leave some padding on sides
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
        {PANEL_METRICS.map((metric) => {
          const data = histogramPanelData[metric.key]

          if (!data) {
            return (
              <div key={metric.key} className="histogram-panel__chart histogram-panel__chart--empty">
                <h4 className="histogram-panel__chart-title">{metric.title}</h4>
                <div className="histogram-panel__no-data">No data</div>
              </div>
            )
          }

          return (
            <SingleHistogram
              key={metric.key}
              data={data}
              title={metric.title}
              width={histogramWidth}
              height={histogramHeight}
            />
          )
        })}
      </div>
    </div>
  )
}

export default HistogramPanel