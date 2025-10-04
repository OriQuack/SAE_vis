import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useVisualizationStore } from '../store'
import '../styles/HistogramPopover.css'
import {
  calculateHistogramLayout,
  calculateThresholdLine,
  validateHistogramData,
  validateDimensions,
  formatSmartNumber,
  calculateOptimalPopoverPosition,
  calculateResponsivePopoverSize,
  calculateThresholdFromMouseEvent,
  calculateHistogramBars,
  calculateXAxisTicks,
  calculateYAxisTicks,
  calculateGridLines,
  calculateSliderPosition
} from '../lib/d3-histogram-utils'
import { CATEGORY_DISPLAY_NAMES } from '../lib/constants'
import { getEffectiveThreshold } from '../lib/threshold-utils'
import type { HistogramData, HistogramChart, NodeCategory } from '../types'

// ============================================================================
// COMPONENT-SPECIFIC CONSTANTS
// ============================================================================
const DEFAULT_ANIMATION = {
  duration: 300,
  easing: 'ease-out'
} as const

const HISTOGRAM_COLORS = {
  bars: '#94a3b8',
  barsHover: '#64748b',
  threshold: '#10b981',
  thresholdHover: '#059669',
  background: '#f8fafc',
  grid: '#e2e8f0',
  text: '#374151',
  axis: '#6b7280',
  sliderHandle: '#3b82f6',
  sliderTrackFilled: '#3b82f6',
  sliderTrackUnfilled: '#cbd5e1'
} as const

const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,
  cornerRadius: 3
} as const

// ============================================================================
// COMPONENT-SPECIFIC TYPES
// ============================================================================
interface HistogramPopoverProps {
  width?: number
  height?: number
  animationDuration?: number
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
const PopoverHeader: React.FC<{
  nodeName: string
  nodeCategory?: NodeCategory
  parentNodeName?: string
  metrics: string[]
  onClose: () => void
  onMouseDown: (e: React.MouseEvent) => void
}> = ({ nodeName, nodeCategory, parentNodeName, metrics, onClose, onMouseDown }) => {
  const formatMetricText = (metrics: string[]) => {
    if (metrics.length === 1) {
      return metrics[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
    return `${metrics.length} Score Metrics`
  }

  return (
    <div className="histogram-popover__header" onMouseDown={onMouseDown}>
      <div className="histogram-popover__header-content">
        <h4 className="histogram-popover__node-title">
          {nodeCategory ? CATEGORY_DISPLAY_NAMES[nodeCategory] : 'Node'}: {nodeName}
        </h4>
        {parentNodeName && (
          <span className="histogram-popover__parent-label">
            Thresholds for: {parentNodeName}
          </span>
        )}
        <span className="histogram-popover__metric-label">
          {formatMetricText(metrics)}
        </span>
      </div>
      <button onClick={onClose} className="histogram-popover__close-button">
        ×
      </button>
    </div>
  )
}

const HistogramChartComponent: React.FC<{
  chart: HistogramChart
  data: HistogramData
  threshold: number
  isMultiChart: boolean
  animationDuration: number
  barColor?: string
  onSliderMouseDown: (e: React.MouseEvent, metric: string, chart: HistogramChart) => void
  onBarHover: (barIndex: number | null, chart: HistogramChart) => void
}> = ({ chart, threshold, isMultiChart, animationDuration, barColor, onSliderMouseDown, onBarHover }) => {
  const bars = useMemo(() =>
    calculateHistogramBars(chart, threshold, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.threshold),
    [chart, threshold]
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

  const thresholdLine = useMemo(() =>
    calculateThresholdLine(threshold, chart),
    [threshold, chart]
  )

  const sliderPosition = useMemo(() =>
    calculateSliderPosition(threshold, chart, SLIDER_TRACK.height, SLIDER_TRACK.yOffset),
    [threshold, chart]
  )

  return (
    <g transform={`translate(${chart.margin.left}, ${chart.yOffset})`}>
      {/* Grid lines */}
      <g>
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
      </g>

      {/* Histogram bars */}
      <g>
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={barColor || HISTOGRAM_COLORS.bars}
            fillOpacity={0.6}
            stroke="white"
            strokeWidth={0.5}
            style={{
              transition: `all ${animationDuration}ms ease-out`,
              cursor: 'pointer'
            }}
            onMouseEnter={() => onBarHover(i, chart)}
            onMouseLeave={() => onBarHover(null, chart)}
          />
        ))}
      </g>

      {/* Threshold line */}
      {thresholdLine && (
        <line
          x1={thresholdLine.x}
          x2={thresholdLine.x}
          y1={0}
          y2={chart.height}
          stroke={HISTOGRAM_COLORS.threshold}
          strokeWidth={3}
          style={{ cursor: 'pointer' }}
        />
      )}

      {/* Slider track */}
      {thresholdLine && (
        <g transform={`translate(0, ${sliderPosition.trackY})`}>
          <rect
            x={sliderPosition.trackUnfilledX}
            y={0}
            width={sliderPosition.trackUnfilledWidth}
            height={SLIDER_TRACK.height}
            fill={HISTOGRAM_COLORS.sliderTrackUnfilled}
            rx={SLIDER_TRACK.cornerRadius}
          />
          <rect
            x={0}
            y={0}
            width={sliderPosition.trackFilledWidth}
            height={SLIDER_TRACK.height}
            fill={HISTOGRAM_COLORS.sliderTrackFilled}
            rx={SLIDER_TRACK.cornerRadius}
          />
          <rect
            x={0}
            y={-10}
            width={chart.width}
            height={SLIDER_TRACK.height + 20}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => onSliderMouseDown(e, chart.metric, chart)}
          />
          <circle
            cx={sliderPosition.handleCx}
            cy={sliderPosition.handleCy}
            r={10}
            fill={HISTOGRAM_COLORS.sliderHandle}
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => onSliderMouseDown(e, chart.metric, chart)}
          />
        </g>
      )}

      {/* Chart title (multi-chart mode) */}
      {isMultiChart && (
        <text
          x={chart.width / 2}
          y={-16}
          textAnchor="middle"
          fontSize={12}
          fontWeight="600"
          fill={HISTOGRAM_COLORS.text}
        >
          {chart.chartTitle}
        </text>
      )}

      {/* Threshold value */}
      <text
        x={chart.width}
        y={chart.height + 50}
        textAnchor="end"
        fontSize={10}
        fill="#6b7280"
        fontFamily="monospace"
      >
        {formatSmartNumber(threshold)}
      </text>

      {/* X-axis */}
      <g transform={`translate(0,${chart.height})`}>
        <line x1={0} x2={chart.width} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
        {xAxisTicks.map(tick => (
          <g key={tick.value} transform={`translate(${tick.position},0)`}>
            <line y1={0} y2={6} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
            <text y={20} textAnchor="middle" fontSize={12} fill={HISTOGRAM_COLORS.text}>
              {tick.label}
            </text>
          </g>
        ))}
      </g>

      {/* Y-axis */}
      <g>
        <line x1={0} x2={0} y1={0} y2={chart.height} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
        {yAxisTicks.map(tick => (
          <g key={tick.value} transform={`translate(0,${tick.position})`}>
            <line x1={-6} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
            <text x={-10} textAnchor="end" alignmentBaseline="middle" fontSize={12} fill={HISTOGRAM_COLORS.text}>
              {tick.label}
            </text>
          </g>
        ))}
      </g>
    </g>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const HistogramPopover: React.FC<HistogramPopoverProps> = ({
  width = 420,
  height = 280,
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  // Store state
  const popoverData = useVisualizationStore(state => state.popoverState.histogram)
  const panel = popoverData?.panel || 'left'
  const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
  const histogramData = useVisualizationStore(state => state[panelKey].histogramData)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)
  const thresholdTree = useVisualizationStore(state => state[panelKey].thresholdTree)

  const {
    hideHistogramPopover,
    fetchMultipleHistogramData,
    updateThreshold,
    clearError
  } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Local state for dragging
  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const draggingMetricRef = useRef<string | null>(null)
  const draggingChartRef = useRef<HistogramChart | null>(null)

  // Local state for tooltip
  const [hoveredBarInfo, setHoveredBarInfo] = useState<{
    barIndex: number;
    chart: HistogramChart;
  } | null>(null)

  // Calculate container size
  const containerSize = useMemo(() =>
    calculateResponsivePopoverSize(width, height, popoverData?.metrics?.length || 1),
    [width, height, popoverData?.metrics?.length]
  )

  // Calculate position
  const calculatedPosition = useMemo(() => {
    if (!popoverData?.visible || !popoverData?.position) return null
    return calculateOptimalPopoverPosition(popoverData.position, containerSize)
  }, [popoverData?.visible, popoverData?.position, containerSize])

  // Get effective threshold value for a metric
  const getEffectiveThresholdValue = useCallback((metric: string): number => {
    const nodeId = popoverData?.nodeId

    if (!nodeId || !thresholdTree) {
      // No nodeId: fallback to mean from histogram data
      return histogramData?.[metric]?.statistics?.mean || 0.5
    }

    const thresholdValue = getEffectiveThreshold(thresholdTree, nodeId, metric)

    if (typeof thresholdValue === 'number') {
      return thresholdValue
    }

    if (Array.isArray(thresholdValue)) {
      return thresholdValue[0] || 0.5
    }

    return histogramData?.[metric]?.statistics?.mean || 0.5
  }, [histogramData, popoverData?.nodeId, thresholdTree])

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (histogramData && popoverData?.metrics) {
      popoverData.metrics.forEach(metric => {
        const metricData = histogramData[metric]
        if (metricData) {
          errors.push(...validateHistogramData(metricData))
        } else {
          errors.push(`Missing histogram data for metric: ${metric}`)
        }
      })
    }
    errors.push(...validateDimensions(containerSize.width, containerSize.height))
    return errors
  }, [histogramData, popoverData?.metrics, containerSize])

  // Calculate layout
  const layout = useMemo(() => {
    if (!histogramData || validationErrors.length > 0 || !popoverData?.metrics) {
      return null
    }

    const chartWidth = containerSize.width - 16
    const chartHeight = containerSize.height - 64

    return calculateHistogramLayout(histogramData, chartWidth, chartHeight)
  }, [histogramData, containerSize, validationErrors, popoverData?.metrics])

  // Handle bar hover
  const handleBarHover = useCallback((barIndex: number | null, chart: HistogramChart) => {
    if (barIndex === null) {
      setHoveredBarInfo(null)
    } else {
      setHoveredBarInfo({ barIndex, chart })
    }
  }, [])

  // Handle slider drag
  const handleSliderMouseDown = useCallback((
    event: React.MouseEvent,
    metric: string,
    chart: HistogramChart
  ) => {
    setIsDraggingSlider(true)
    draggingMetricRef.current = metric
    draggingChartRef.current = chart

    // Calculate initial threshold
    const data = histogramData?.[metric]
    if (!data) return

    const newValue = calculateThresholdFromMouseEvent(event, svgRef.current, chart, data.statistics.min, data.statistics.max)
    if (newValue !== null) {
      if (popoverData?.nodeId) {
        // Has nodeId: update tree node threshold
        const scoreMetrics = ['score_fuzz', 'score_detection', 'score_simulation']
        if (scoreMetrics.includes(metric)) {
          updateThreshold(popoverData.nodeId, [newValue], panel, metric)
        } else {
          updateThreshold(popoverData.nodeId, [newValue], panel)
        }
      }
    }

    event.preventDefault()
  }, [histogramData, updateThreshold, popoverData?.nodeId, panel])

  // Handle header drag start
  const handleHeaderMouseDown = useCallback((event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) {
      return
    }

    const currentPosition = draggedPosition || {
      x: calculatedPosition?.x || popoverData?.position?.x || 0,
      y: calculatedPosition?.y || popoverData?.position?.y || 0
    }

    setDragStartOffset({
      x: event.clientX - currentPosition.x,
      y: event.clientY - currentPosition.y
    })
  }, [draggedPosition, calculatedPosition, popoverData?.position])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId && popoverData?.metrics) {
      clearError('histogram')
      fetchMultipleHistogramData(popoverData.metrics, popoverData.nodeId, panel)
    }
  }, [popoverData, clearError, fetchMultipleHistogramData, panel])

  // Handle global mouse events for slider dragging
  useEffect(() => {
    if (!isDraggingSlider) return

    const handleMouseMove = (event: MouseEvent) => {
      const metric = draggingMetricRef.current
      const chart = draggingChartRef.current
      if (!metric || !chart || !histogramData?.[metric]) return

      const data = histogramData[metric]
      const newValue = calculateThresholdFromMouseEvent(event, svgRef.current, chart, data.statistics.min, data.statistics.max)

      if (newValue !== null) {
        if (popoverData?.nodeId) {
          // Has nodeId: update tree node threshold
          const scoreMetrics = ['score_fuzz', 'score_detection', 'score_simulation']
          if (scoreMetrics.includes(metric)) {
            updateThreshold(popoverData.nodeId, [newValue], panel, metric)
          } else {
            updateThreshold(popoverData.nodeId, [newValue], panel)
          }
        }
      }
    }

    const handleMouseUp = () => {
      setIsDraggingSlider(false)
      draggingMetricRef.current = null
      draggingChartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSlider, histogramData, updateThreshold, popoverData?.nodeId, panel])

  // Handle popover dragging
  useEffect(() => {
    if (!dragStartOffset) return

    const handleMouseMove = (e: MouseEvent) => {
      setDraggedPosition({
        x: e.clientX - dragStartOffset.x,
        y: e.clientY - dragStartOffset.y
      })
    }

    const handleMouseUp = () => {
      setDragStartOffset(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragStartOffset])

  // Reset dragged position when popover closes
  useEffect(() => {
    if (!popoverData?.visible) {
      setDraggedPosition(null)
      setDragStartOffset(null)
    }
  }, [popoverData?.visible])

  // Handle click outside to close
  useEffect(() => {
    if (!popoverData?.visible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (isDraggingSlider) return

      const target = event.target as HTMLElement
      if (target.closest('circle') || target.closest('rect[style*="cursor: pointer"]')) {
        return
      }

      if (containerRef.current && !containerRef.current.contains(target)) {
        hideHistogramPopover()
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mouseup', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mouseup', handleClickOutside)
    }
  }, [popoverData?.visible, isDraggingSlider, hideHistogramPopover])

  // Fetch data when popover opens
  useEffect(() => {
    if (popoverData?.visible && popoverData.metrics?.length > 0) {
      console.log('[HistogramPopover] Popover opened, fetching data:', {
        metrics: popoverData.metrics,
        nodeId: popoverData.nodeId,
        panel
      })
      fetchMultipleHistogramData(popoverData.metrics, popoverData.nodeId, panel)
    }
  }, [popoverData?.visible, popoverData?.nodeId, popoverData?.metrics, fetchMultipleHistogramData, panel])

  // Log histogram data changes
  useEffect(() => {
    if (histogramData) {
      console.log('[HistogramPopover] Histogram data received:', {
        metrics: Object.keys(histogramData)
      })
    }
  }, [histogramData])

  // Don't render if not visible
  if (!popoverData?.visible) {
    return null
  }

  const finalPosition = draggedPosition || {
    x: calculatedPosition?.x || popoverData.position.x,
    y: calculatedPosition?.y || popoverData.position.y
  }

  return (
    <div
      className="histogram-popover"
      style={{
        left: finalPosition.x,
        top: finalPosition.y,
        transform: calculatedPosition?.transform || 'translate(0%, 0%)'
      }}
    >
      <div
        ref={containerRef}
        className="histogram-popover__container"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        {/* Header */}
        <PopoverHeader
          nodeName={popoverData.nodeName}
          nodeCategory={popoverData.nodeCategory}
          parentNodeName={popoverData.parentNodeName}
          metrics={popoverData.metrics}
          onClose={hideHistogramPopover}
          onMouseDown={handleHeaderMouseDown}
        />

        {/* Error display */}
        {error && (
          <div className="histogram-popover__error">
            <div className="histogram-popover__error-text">{error}</div>
            <button onClick={handleRetry} className="histogram-popover__error-retry">
              Retry
            </button>
          </div>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="histogram-popover__validation">
            {validationErrors.map((error, index) => (
              <div key={index} className="histogram-popover__validation-error">
                {error}
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="histogram-popover__loading">
            <div className="histogram-popover__spinner" />
            <span>Loading histogram...</span>
          </div>
        )}

        {/* Main visualization */}
        {layout && histogramData && !loading && !error && validationErrors.length === 0 && (
          <div className="histogram-popover__content">
            <svg
              ref={svgRef}
              width={containerSize.width - 16}
              height={layout.totalHeight}
            >
              <rect
                width={containerSize.width - 16}
                height={layout.totalHeight}
                className="histogram-popover__svg-background"
              />

              {layout.charts.map(chart => {
                const metric = chart.metric
                const data = histogramData[metric]
                const threshold = getEffectiveThresholdValue(metric)

                if (!data) return null

                return (
                  <HistogramChartComponent
                    key={metric}
                    chart={chart}
                    data={data}
                    threshold={threshold}
                    isMultiChart={layout.charts.length > 1}
                    animationDuration={animationDuration}
                    onSliderMouseDown={handleSliderMouseDown}
                    onBarHover={handleBarHover}
                  />
                )
              })}

              {/* Global tooltip - rendered last to be on top */}
              {hoveredBarInfo && histogramData && (() => {
                const { barIndex, chart } = hoveredBarInfo
                const metric = chart.metric
                const data = histogramData[metric]
                const threshold = getEffectiveThresholdValue(metric)

                if (!data) return null

                const bars = calculateHistogramBars(chart, threshold, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.threshold)
                const bar = bars[barIndex]

                if (!bar) return null

                const tooltipX = bar.x + bar.width / 2 + chart.margin.left
                const tooltipY = bar.y + chart.yOffset - 40

                return (
                  <g pointerEvents="none">
                    <rect
                      x={tooltipX - 60}
                      y={tooltipY}
                      width={120}
                      height={32}
                      className="histogram-popover__tooltip-rect"
                    />
                    <text
                      x={tooltipX}
                      y={tooltipY + 14}
                      className="histogram-popover__tooltip-feature-count"
                    >
                      {bar.binData.count} features
                    </text>
                    <text
                      x={tooltipX}
                      y={tooltipY + 26}
                      className="histogram-popover__tooltip-range"
                    >
                      {bar.binData.x0.toFixed(3)} - {bar.binData.x1.toFixed(3)}
                    </text>
                  </g>
                )
              })()}
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

export default HistogramPopover