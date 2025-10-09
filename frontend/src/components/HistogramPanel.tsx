import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store'
import { calculateSimpleHistogramPanel, calculateSimpleHistogramPanelWithFixedDomain, formatSmartNumber } from '../lib/d3-histogram-utils'
import { calculateThresholdRangeFromMouse, getBarsInSelection, getContainerCoordinates } from '../lib/selection-utils'
import type { HistogramData, MetricType } from '../types'
import { COMPONENT_COLORS } from '../lib/constants'
import '../styles/HistogramPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface HistogramPanelProps {
  className?: string
}


// Metric configuration for the panel - individual metrics (not merged)
const INDIVIDUAL_METRICS = [
  {
    key: 'feature_splitting' as MetricType,
    label: ['Feature', 'Splitting'],
    averageBy: null,
    badges: [
      { color: COMPONENT_COLORS.FEATURE_SPLITTING, text: '1' } // Decoder-related (green)
    ]
  },
  {
    key: 'semsim_mean' as MetricType,
    label: ['Semantic', 'Similarity'],
    averageBy: 'llm_explainer',
    badges: [
      { color: COMPONENT_COLORS.EXPLAINER, text: '3' }, // LLM Explainer (orange)
      { color: COMPONENT_COLORS.EMBEDDER, text: '1' }  // Embedder (purple)
    ]
  }
]

// Score metrics to be merged with common x-axis (0-1.0)
const MERGED_SCORE_METRICS = [
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

// All metrics combined (for backwards compatibility)
const PANEL_METRICS = [...INDIVIDUAL_METRICS, ...MERGED_SCORE_METRICS]

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
  selections: Array<{
    id: string
    metricType: string
    barIndices: number[]
    thresholdRange: { min: number; max: number }
    color: string
  }>
  useFixedDomain?: boolean
  isMerged?: boolean
  showXAxis?: boolean
  onRemoveThreshold?: (metricType: string) => void
  selectionMode?: boolean
}> = ({ data, label, badges, width, height, metricKey, selections, useFixedDomain = false, isMerged = false, showXAxis = true, onRemoveThreshold, selectionMode = false }) => {
  const margin = { top: 5, right: 28, bottom: 10, left: 80 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const [hoveredBar, setHoveredBar] = useState<{ index: number; x: number; y: number } | null>(null)

  // D3 calculations - use fixed domain for score metrics
  const { bars, gridLines, verticalGridLines, xAxisTicks } = useMemo(
    () => useFixedDomain
      ? calculateSimpleHistogramPanelWithFixedDomain(data, innerWidth, innerHeight, HISTOGRAM_COLORS.bars, 0, 1.0)
      : calculateSimpleHistogramPanel(data, innerWidth, innerHeight, HISTOGRAM_COLORS.bars),
    [data, innerWidth, innerHeight, useFixedDomain]
  )

  // Helper to convert threshold value to X position
  const thresholdToX = useCallback((threshold: number) => {
    const domain = useFixedDomain
      ? { min: 0, max: 1.0 }
      : { min: data.histogram.bin_edges[0], max: data.histogram.bin_edges[data.histogram.bin_edges.length - 1] }

    const ratio = (threshold - domain.min) / (domain.max - domain.min)
    return ratio * innerWidth
  }, [useFixedDomain, data.histogram.bin_edges, innerWidth])

  // Get selection for this metric
  const metricSelections = selections.filter(s => s.metricType === metricKey)

  return (
    <div className={isMerged ? "histogram-panel__merged-chart" : "histogram-panel__chart"} style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Horizontal grid lines */}
          {gridLines.map((line, i) => (
            <line
              key={`h-${i}`}
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
              stroke={HISTOGRAM_COLORS.grid}
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {/* Vertical grid lines */}
          {verticalGridLines.map((line, i) => (
            <line
              key={`v-${i}`}
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
          {bars.map((bar, i) => {
            // Check if this bar is selected
            const selection = metricSelections.find(s => s.barIndices.includes(i))

            return (
              <rect
                key={i}
                className={selection ? 'histogram-bar--selected' : ''}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={selection ? selection.color : bar.color}
                fillOpacity={selection ? 1 : 0.6}
                stroke="white"
                strokeWidth={0.5}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHoveredBar({
                    index: i,
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  })
                }}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ cursor: 'default' }}
              />
            )
          })}

          {/* Threshold indicators (colored area and dotted lines) - rendered on top */}
          {metricSelections.map(selection => {
            const minX = thresholdToX(selection.thresholdRange.min)
            const maxX = thresholdToX(selection.thresholdRange.max)

            return (
              <g key={selection.id}>
                {/* Colored area between thresholds */}
                <rect
                  x={minX}
                  y={0}
                  width={maxX - minX}
                  height={innerHeight}
                  fill={selection.color}
                  opacity={0.15}
                />
                {/* Min threshold line (dotted) */}
                <line
                  x1={minX}
                  x2={minX}
                  y1={0}
                  y2={innerHeight}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.8}
                />
                {/* Min threshold value */}
                <text
                  x={minX}
                  y={8}
                  textAnchor="start"
                  fontSize={8}
                  fontWeight={600}
                  fill="#000000"
                  transform={`rotate(45, ${minX + 5}, 10)`}
                >
                  {formatSmartNumber(selection.thresholdRange.min)}
                </text>
                {/* Max threshold line (dotted) */}
                <line
                  x1={maxX}
                  x2={maxX}
                  y1={0}
                  y2={innerHeight}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.8}
                />
                {/* Max threshold value */}
                <text
                  x={maxX}
                  y={8}
                  textAnchor="start"
                  fontSize={8}
                  fontWeight={600}
                  fill="#000000"
                  transform={`rotate(45, ${maxX + 5}, 10)`}
                >
                  {formatSmartNumber(selection.thresholdRange.max)}
                </text>
              </g>
            )
          })}


          {/* X-axis - conditionally rendered */}
          {showXAxis && (
            <g transform={`translate(0, ${innerHeight})`}>
              <line x1={0} x2={innerWidth} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
              {xAxisTicks.map(tick => (
                <g key={tick.value} transform={`translate(${tick.position}, 0)`}>
                  <line y1={0} y2={2} stroke={HISTOGRAM_COLORS.axis} strokeWidth={0.5} opacity={0.4} />
                  <text y={8} textAnchor="middle" fontSize={8} fill="#000000">
                    {formatSmartNumber(tick.value)}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Left-side label with badges below */}
          <g transform={`translate(${-margin.left + 2}, ${innerHeight / 2})`}>
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
      {/* Tooltip */}
      {hoveredBar && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredBar.x}px`,
            top: `${hoveredBar.y - 60}px`,
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            zIndex: 1000,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)'
          }}
        >
          <div style={{ marginBottom: '0px' }}>
            {data.histogram.counts[hoveredBar.index] === 1
              ? '1 feature'
              : `${data.histogram.counts[hoveredBar.index]} features`}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
            {formatSmartNumber(data.histogram.bin_edges[hoveredBar.index])} - {formatSmartNumber(data.histogram.bin_edges[hoveredBar.index + 1])}
          </div>
        </div>
      )}
      {/* Remove threshold button - HTML element positioned absolutely */}
      {selectionMode && metricSelections.length > 0 && onRemoveThreshold && (() => {
        const maxX = thresholdToX(metricSelections[0].thresholdRange.max)
        const buttonX = margin.left + maxX + 12
        const buttonY = margin.top + innerHeight / 2
        return (
          <div
            style={{
              position: 'absolute',
              left: `${buttonX}px`,
              top: `${buttonY}px`,
              transform: 'translate(-50%, -50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              opacity: 0.8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            onMouseUp={(e) => {
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
              onRemoveThreshold(metricKey)
            }}
          >
            <svg width="6" height="6" viewBox="0 0 8 8" style={{ pointerEvents: 'none' }}>
              <path
                d="M 1,1 L 7,7 M 7,1 L 1,7"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )
      })()}
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
  const thresholdGroups = useVisualizationStore(state => state.thresholdGroups)
  const isCreatingGroup = useVisualizationStore(state => state.isCreatingGroup)
  const pendingGroup = useVisualizationStore(state => state.pendingGroup)
  const activeSelection = useVisualizationStore(state => state.activeSelection)
  const { fetchHistogramPanelData, startSelection, updateSelection, completeSelection, removeThresholdForMetric } = useVisualizationStore()

  // Get all visible selections from groups
  const visibleSelections = useMemo(() => {
    // If creating a group, show pending selections
    if (isCreatingGroup) {
      return pendingGroup
    }

    // Otherwise show selections from visible groups
    const groupSelections = thresholdGroups
      .filter(group => group.visible)
      .flatMap(group => group.selections)

    // Include legacy selections if no groups exist
    if (thresholdGroups.length === 0) {
      return selections
    }

    return groupSelections
  }, [thresholdGroups, selections, isCreatingGroup, pendingGroup])

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
    // Account for all padding and margins in the layout
    const containerPadding = 12  // .histogram-panel__container: 6px top + 6px bottom
    const individualChartOverhead = 9  // .histogram-panel__chart: 3px padding-top + 3px padding-bottom + 3px margin-bottom
    const mergedContainerOverhead = 9  // .histogram-panel__merged-container: 3px padding-top + 3px padding-bottom + 3px margin-bottom
    const mergedChartOverhead = 6  // .histogram-panel__merged-chart: 3px padding-top + 3px padding-bottom

    const totalOverhead = containerPadding
      + (INDIVIDUAL_METRICS.length * individualChartOverhead)
      + mergedContainerOverhead
      + (MERGED_SCORE_METRICS.length * mergedChartOverhead)

    return (containerSize.height - totalOverhead) / PANEL_METRICS.length
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

  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!isDragging || !containerRef.current || !activeSelection?.startPoint) return

    const coords = getContainerCoordinates(e as React.MouseEvent, containerRef.current)
    updateSelection(coords.x, coords.y)

    const startX = Math.min(activeSelection.startPoint.x, coords.x)
    const startY = Math.min(activeSelection.startPoint.y, coords.y)
    const width = Math.abs(coords.x - activeSelection.startPoint.x)
    const height = Math.abs(coords.y - activeSelection.startPoint.y)

    setSelectionRect({ x: startX, y: startY, width, height })
  }, [isDragging, activeSelection, updateSelection])

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !selectionRect || !histogramPanelData) return

    const margin = { top: 5, right: 10, bottom: 10, left: 85 }

    // Get all chart elements (both individual and merged)
    const individualCharts = containerRef.current?.querySelectorAll('.histogram-panel__chart:not(.histogram-panel__chart--empty)')
    const mergedCharts = containerRef.current?.querySelectorAll('.histogram-panel__merged-chart:not(.histogram-panel__chart--empty)')

    // Process individual metrics
    INDIVIDUAL_METRICS.forEach((metric, index) => {
      const data = histogramPanelData[metric.key]
      if (!data || !individualCharts) return

      const chartElement = individualCharts[index] as HTMLElement
      if (!chartElement) return

      const chartRect = chartElement.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      // Calculate relative chart position
      const chartTop = chartRect.top - containerRect.top
      const chartBottom = chartRect.bottom - containerRect.top

      // Check if selection intersects with this chart
      if (selectionRect.y < chartBottom && selectionRect.y + selectionRect.height > chartTop) {
        const innerWidth = histogramWidth - margin.left - margin.right
        const innerHeight = histogramHeight - margin.top - margin.bottom

        const { bars } = calculateSimpleHistogramPanel(
          data,
          innerWidth,
          innerHeight,
          HISTOGRAM_COLORS.bars
        )

        const selectedIndices = getBarsInSelection(selectionRect, chartRect, bars, margin)

        if (selectedIndices.length > 0) {
          // Calculate exact threshold from mouse position using actual bin edges
          const domain = {
            min: data.histogram.bin_edges[0],
            max: data.histogram.bin_edges[data.histogram.bin_edges.length - 1]
          }
          const thresholdRange = calculateThresholdRangeFromMouse(
            selectionRect,
            chartRect,
            margin,
            innerWidth,
            domain
          )
          completeSelection(metric.key, selectedIndices, thresholdRange)
        }
      }
    })

    // Process merged score metrics (with fixed domain 0-1)
    MERGED_SCORE_METRICS.forEach((metric, index) => {
      const data = histogramPanelData[metric.key]
      if (!data || !mergedCharts) return

      const chartElement = mergedCharts[index] as HTMLElement
      if (!chartElement) return

      const chartRect = chartElement.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      // Calculate relative chart position
      const chartTop = chartRect.top - containerRect.top
      const chartBottom = chartRect.bottom - containerRect.top

      // Check if selection intersects with this chart
      if (selectionRect.y < chartBottom && selectionRect.y + selectionRect.height > chartTop) {
        const innerWidth = histogramWidth - margin.left - margin.right
        const innerHeight = histogramHeight - margin.top - margin.bottom

        const { bars } = calculateSimpleHistogramPanelWithFixedDomain(
          data,
          innerWidth,
          innerHeight,
          HISTOGRAM_COLORS.bars,
          0,
          1.0
        )

        const selectedIndices = getBarsInSelection(selectionRect, chartRect, bars, margin)

        if (selectedIndices.length > 0) {
          // Calculate exact threshold from mouse position with fixed domain [0, 1]
          const domain = { min: 0, max: 1.0 }
          const thresholdRange = calculateThresholdRangeFromMouse(
            selectionRect,
            chartRect,
            margin,
            innerWidth,
            domain
          )
          completeSelection(metric.key, selectedIndices, thresholdRange)
        }
      }
    })

    setIsDragging(false)
    setSelectionRect(null)
  }, [isDragging, selectionRect, histogramPanelData, histogramHeight, histogramWidth, completeSelection])

  // Attach window-level mouse event listeners when dragging
  useEffect(() => {
    if (!isDragging) return

    const handleWindowMouseMove = (e: MouseEvent) => {
      handleMouseMove(e)
    }

    const handleWindowMouseUp = () => {
      handleMouseUp()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

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
      <div
        className="histogram-panel__container"
        onMouseDown={selectionMode ? handleMouseDown : undefined}
      >
        {/* Render individual metrics */}
        {INDIVIDUAL_METRICS.map((metric) => {
          const data = histogramPanelData[metric.key]

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
              isLast={false}
              metricKey={metric.key}
              selections={visibleSelections}
              useFixedDomain={false}
              isMerged={false}
              onRemoveThreshold={removeThresholdForMetric}
              selectionMode={selectionMode}
            />
          )
        })}

        {/* Render merged score container with common x-axis (0-1.0) */}
        <div className="histogram-panel__merged-container">
          {MERGED_SCORE_METRICS.map((metric, index) => {
            const data = histogramPanelData[metric.key]
            const isLast = index === MERGED_SCORE_METRICS.length - 1

            if (!data) {
              return (
                <div key={metric.key} className="histogram-panel__merged-chart histogram-panel__chart--empty">
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
                metricKey={metric.key}
                selections={visibleSelections}
                useFixedDomain={true}
                isMerged={true}
                showXAxis={isLast}
                onRemoveThreshold={removeThresholdForMetric}
                selectionMode={selectionMode}
              />
            )
          })}
        </div>
      </div>

      {/* Selection overlay */}
      {selectionMode && (
        <div
          ref={overlayRef}
          className="histogram-panel__selection-overlay"
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