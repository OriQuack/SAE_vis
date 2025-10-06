import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store'
import { calculateSimpleHistogramPanel, formatSmartNumber } from '../lib/d3-histogram-utils'
import { calculateExactThresholdRange, getBarsInSelection, getContainerCoordinates } from '../lib/selection-utils'
import type { HistogramData, MetricType } from '../types'
import { COMPONENT_COLORS } from '../lib/constants'
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
      { color: COMPONENT_COLORS.FEATURE_SPLITTING, text: '1' } // Decoder-related (green)
    ]
  },
  {
    key: 'semdist_mean' as MetricType,
    label: ['Semantic', 'Similarity'],
    averageBy: 'llm_explainer',
    badges: [
      { color: COMPONENT_COLORS.EXPLAINER, text: '3' }, // LLM Explainer (orange)
      { color: COMPONENT_COLORS.EMBEDDER, text: '1' }  // Embedder (purple)
    ]
  },
  {
    key: 'score_embedding' as MetricType,
    label: ['Embedding', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: COMPONENT_COLORS.EXPLAINER, text: '3' }, // LLM Explainer (orange)
      { color: COMPONENT_COLORS.EMBEDDER, text: '1' }  // Embedder (purple)
    ]
  },
  {
    key: 'score_fuzz' as MetricType,
    label: ['Fuzz', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: COMPONENT_COLORS.EXPLAINER, text: '3' }, // LLM Explainer (orange)
      { color: COMPONENT_COLORS.SCORER, text: '3' }  // LLM Scorer (blue)
    ]
  },
  {
    key: 'score_detection' as MetricType,
    label: ['Detection', 'Score'],
    averageBy: 'llm_scorer',
    badges: [
      { color: COMPONENT_COLORS.EXPLAINER, text: '3' }, // LLM Explainer (orange)
      { color: COMPONENT_COLORS.SCORER, text: '3' }  // LLM Scorer (blue)
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
  metricKey: MetricType
  selections: Array<{ metricType: string; barIndices: number[]; color: string; thresholdRange: { min: number; max: number } }>
  showXAxisLabels: boolean
}> = ({ data, label, badges, width, height, metricKey, selections, showXAxisLabels }) => {
  const margin = { top: 5, right: 10, bottom: 10, left: 85 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // D3 calculations
  const { bars, gridLines, xAxisTicks } = useMemo(
    () => calculateSimpleHistogramPanel(data, innerWidth, innerHeight, HISTOGRAM_COLORS.bars),
    [data, innerWidth, innerHeight]
  )

  // Get selection for this metric
  const metricSelections = selections.filter(s => s.metricType === metricKey)

  // Calculate x positions for threshold lines
  // Note: Use bin_edges from backend which already reflect the correct domain
  const getThresholdX = (value: number) => {
    const domainMin = data.histogram.bin_edges[0]
    const domainMax = data.histogram.bin_edges[data.histogram.bin_edges.length - 1]
    const range = domainMax - domainMin
    if (range === 0) return innerWidth / 2
    return ((value - domainMin) / range) * innerWidth
  }


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
              opacity={0.5}
            />
          ))}

          {/* Histogram bars */}
          {bars.map((bar, i) => {
            // Check if this bar is selected
            const selection = metricSelections.find(s => s.barIndices.includes(i))

            return (
              <rect
                key={i}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={selection ? selection.color : bar.color}
                fillOpacity={selection ? 1 : 0.6}
                stroke="white"
                strokeWidth={0.5}
              />
            )
          })}

          {/* X-axis */}
          <g transform={`translate(0, ${innerHeight})`}>
            <line x1={0} x2={innerWidth} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
            {xAxisTicks.map(tick => (
              <g key={tick.value} transform={`translate(${tick.position}, 0)`}>
                <line y1={0} y2={2} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
                {showXAxisLabels && (
                  <text y={8} textAnchor="middle" fontSize={7} fill={HISTOGRAM_COLORS.text} opacity={0.6}>
                    {formatSmartNumber(tick.value)}
                  </text>
                )}
              </g>
            ))}
          </g>

          {/* Threshold range lines */}
          {metricSelections.map((selection, idx) => (
            <g key={idx}>
              {/* Min threshold line */}
              <line
                x1={getThresholdX(selection.thresholdRange.min)}
                x2={getThresholdX(selection.thresholdRange.min)}
                y1={0}
                y2={innerHeight}
                stroke={selection.color}
                strokeWidth={2}
                strokeDasharray="4,2"
                opacity={0.8}
              />
              {/* Max threshold line */}
              <line
                x1={getThresholdX(selection.thresholdRange.max)}
                x2={getThresholdX(selection.thresholdRange.max)}
                y1={0}
                y2={innerHeight}
                stroke={selection.color}
                strokeWidth={2}
                strokeDasharray="4,2"
                opacity={0.8}
              />
              {/* Shaded area between thresholds */}
              <rect
                x={getThresholdX(selection.thresholdRange.min)}
                y={0}
                width={getThresholdX(selection.thresholdRange.max) - getThresholdX(selection.thresholdRange.min)}
                height={innerHeight}
                fill={selection.color}
                opacity={0.1}
              />
            </g>
          ))}

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
  const overlayRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 800 })
  const [isDragging, setIsDragging] = useState(false)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  // Store state
  const histogramPanelData = useVisualizationStore(state => state.histogramPanelData)
  const loading = useVisualizationStore(state => state.loading.histogramPanel)
  const error = useVisualizationStore(state => state.errors.histogramPanel)
  const selectionMode = useVisualizationStore(state => state.selectionMode)
  const selections = useVisualizationStore(state => state.selections)
  const activeSelection = useVisualizationStore(state => state.activeSelection)
  const { fetchHistogramPanelData, startSelection, updateSelection, completeSelection } = useVisualizationStore()

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

  // Mouse event handlers for selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode || !containerRef.current) return

    const coords = getContainerCoordinates(e, containerRef.current)
    setIsDragging(true)
    startSelection(coords.x, coords.y)
    setSelectionRect({ x: coords.x, y: coords.y, width: 0, height: 0 })
  }, [selectionMode, startSelection])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current || !activeSelection?.startPoint) return

    const coords = getContainerCoordinates(e, containerRef.current)
    updateSelection(coords.x, coords.y)

    const startX = Math.min(activeSelection.startPoint.x, coords.x)
    const startY = Math.min(activeSelection.startPoint.y, coords.y)
    const width = Math.abs(coords.x - activeSelection.startPoint.x)
    const height = Math.abs(coords.y - activeSelection.startPoint.y)

    setSelectionRect({ x: startX, y: startY, width, height })
  }, [isDragging, activeSelection, updateSelection])

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !selectionRect || !histogramPanelData) return

    // Process selection for each metric
    PANEL_METRICS.forEach((metric, metricIndex) => {
      const data = histogramPanelData[metric.key]
      if (!data) return

      // Calculate chart position
      const chartTop = metricIndex * histogramHeight + metricIndex * 6
      const chartBottom = chartTop + histogramHeight

      // Check if selection intersects with this chart
      if (selectionRect.y < chartBottom && selectionRect.y + selectionRect.height > chartTop) {
        // Get bars in selection for visual highlighting
        const chartElement = containerRef.current?.querySelectorAll('.histogram-panel__chart')[metricIndex]
        if (!chartElement) return

        const chartRect = chartElement.getBoundingClientRect()
        const margin = { top: 5, right: 10, bottom: 10, left: 85 }
        const innerWidth = histogramWidth - margin.left - margin.right

        const { bars } = calculateSimpleHistogramPanel(
          data,
          innerWidth,
          histogramHeight - margin.top - margin.bottom,
          HISTOGRAM_COLORS.bars
        )

        // Get bars that are within selection for visual feedback
        const selectedIndices = getBarsInSelection(selectionRect, chartRect, bars, margin)

        if (selectedIndices.length > 0) {
          // Calculate EXACT threshold range based on mouse selection coordinates
          const exactThresholdRange = calculateExactThresholdRange(
            selectionRect,
            chartRect,
            data,
            innerWidth,
            margin
          )

          // Use exact threshold range instead of bar-based range
          completeSelection(metric.key, selectedIndices, exactThresholdRange)
        }
      }
    })

    setIsDragging(false)
    setSelectionRect(null)
  }, [isDragging, selectionRect, histogramPanelData, histogramHeight, histogramWidth, completeSelection])

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
    <div
      className={`histogram-panel ${className} ${selectionMode ? 'histogram-panel--selection-mode' : ''}`}
      ref={containerRef}
    >
      <div className="histogram-panel__container">
        {PANEL_METRICS.map((metric, index) => {
          const data = histogramPanelData[metric.key]
          const isLast = index === PANEL_METRICS.length - 1
          const isScoreMetric = metric.key === 'score_embedding' || metric.key === 'score_fuzz' || metric.key === 'score_detection'

          if (!data) {
            return (
              <div key={metric.key} className="histogram-panel__chart histogram-panel__chart--empty">
                <div className="histogram-panel__no-data">{metric.label.join(' ')}: No data</div>
              </div>
            )
          }

          // For score metrics, we'll group them together
          if (isScoreMetric && metric.key === 'score_embedding') {
            // Render the grouped score panel
            const scoreMetrics = PANEL_METRICS.filter(m =>
              m.key === 'score_embedding' || m.key === 'score_fuzz' || m.key === 'score_detection'
            )

            return (
              <div key="score-group" className="histogram-panel__chart">
                {scoreMetrics.map((scoreMetric) => {
                  const scoreData = histogramPanelData[scoreMetric.key]
                  if (!scoreData) return null

                  const showXAxisLabels = scoreMetric.key === 'score_detection'

                  return (
                    <div key={scoreMetric.key} className="histogram-panel__score-item">
                      <SingleHistogram
                        data={scoreData}
                        label={scoreMetric.label}
                        badges={scoreMetric.badges}
                        width={histogramWidth}
                        height={histogramHeight}
                        isLast={scoreMetric.key === 'score_detection'}
                        metricKey={scoreMetric.key}
                        selections={selections}
                        showXAxisLabels={showXAxisLabels}
                      />
                    </div>
                  )
                })}
              </div>
            )
          }

          // Skip individual score metrics (already rendered in group)
          if (isScoreMetric) {
            return null
          }

          // Render non-score metrics normally
          return (
            <div key={metric.key} className="histogram-panel__chart">
              <SingleHistogram
                data={data}
                label={metric.label}
                badges={metric.badges}
                width={histogramWidth}
                height={histogramHeight}
                isLast={isLast}
                metricKey={metric.key}
                selections={selections}
                showXAxisLabels={true}
              />
            </div>
          )
        })}
      </div>

      {/* Selection overlay */}
      {selectionMode && (
        <div
          ref={overlayRef}
          className="histogram-panel__selection-overlay"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {selectionRect && (
            <div
              className="histogram-panel__selection-rect"
              style={{
                left: `${selectionRect.x}px`,
                top: `${selectionRect.y}px`,
                width: `${selectionRect.width}px`,
                height: `${selectionRect.height}px`
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default HistogramPanel