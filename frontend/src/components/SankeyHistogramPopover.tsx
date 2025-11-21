import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import '../styles/SankeyHistogramPopover.css'
import {
  calculateHistogramLayout,
  validateHistogramData,
  validateDimensions,
  calculateOptimalPopoverPosition,
  calculateResponsivePopoverSize,
  calculateHistogramBars,
  calculateXAxisTicks,
  calculateYAxisTicks,
  calculateGridLines,
  calculateBarSegments
} from '../lib/histogram-utils'
import { scaleLinear } from 'd3-scale'
import { METRIC_DISPLAY_NAMES } from '../lib/constants'
import { getThresholdRegionColors } from '../lib/color-utils'
import type { HistogramData, HistogramChart } from '../types'
import { ThresholdHandles } from './ThresholdHandles'

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

const THRESHOLD_HANDLE_DIMS = {
  width: 20,
  height: 14
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
  metric: string
  onClose: () => void
  onMouseDown: (e: React.MouseEvent) => void
}> = ({ metric, onClose, onMouseDown }) => {
  return (
    <div className="histogram-popover__header" onMouseDown={onMouseDown}>
      <div className="histogram-popover__header-content">
        <h4 className="histogram-popover__node-title">
          {METRIC_DISPLAY_NAMES[metric as keyof typeof METRIC_DISPLAY_NAMES] || metric}
        </h4>
      </div>
      <button onClick={onClose} className="histogram-popover__close-button">
        ×
      </button>
    </div>
  )
}

const HistogramChartComponent: React.FC<{
  chart: HistogramChart
  thresholds: number[]
  metricRange: { min: number; max: number }
  animationDuration: number
  barColor?: string
  onThresholdUpdate: (newThresholds: number[]) => void
  onBarHover: (barIndex: number | null, chart: HistogramChart) => void
  onDragStateChange?: (isDragging: boolean) => void
}> = ({ chart, thresholds, metricRange, animationDuration, barColor, onThresholdUpdate, onBarHover, onDragStateChange }) => {
  // Local state for drag preview (updates in real-time during drag)
  const [dragThresholds, setDragThresholds] = useState<number[] | null>(null)

  // Notify parent when drag state changes
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(dragThresholds !== null)
    }
  }, [dragThresholds, onDragStateChange])

  // Use dragThresholds during drag, otherwise use committed thresholds
  const effectiveThresholds = dragThresholds ?? thresholds

  // Use first threshold for bar coloring (visual split point)
  const primaryThreshold = effectiveThresholds[0] || metricRange.min

  const bars = useMemo(() =>
    calculateHistogramBars(chart, primaryThreshold, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.threshold),
    [chart, primaryThreshold]
  )

  const gridLines = useMemo(() =>
    calculateGridLines(chart, 5),
    [chart]
  )

  const xAxisTicks = useMemo(() =>
    calculateXAxisTicks(chart, 10),
    [chart]
  )

  const yAxisTicks = useMemo(() =>
    calculateYAxisTicks(chart, 5),
    [chart]
  )

  // Create x scale for bar segment calculation
  const xScale = useMemo(() =>
    scaleLinear()
      .domain([chart.xScale.domain()[0], chart.xScale.domain()[1]])
      .range([0, chart.width]),
    [chart]
  )

  // Calculate bar segments for split pattern rendering (uses effectiveThresholds for live preview)
  const barSegments = useMemo(() => {
    if (effectiveThresholds.length === 0) {
      // No thresholds - return bars as single segments
      return bars.map((bar) => [{
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        patternIndex: 0
      }])
    }

    // Calculate segments for each bar
    return bars.map((bar) => calculateBarSegments(bar, effectiveThresholds, xScale))
  }, [bars, effectiveThresholds, xScale])

  // Get threshold colors for this metric (red/green for decoder_similarity and quality_score)
  const thresholdColors = getThresholdRegionColors(chart.metric)

  return (
    <>
      {/* Pattern definitions for threshold regions */}
      <defs>
        {/* Metric-specific striped pattern (for metrics without threshold colors) */}
        <pattern
          id={`histogram-pattern-striped-${chart.metric}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="none"/>
          <line x1="0" y1="0" x2="0" y2="6" stroke={barColor || HISTOGRAM_COLORS.bars} strokeWidth="2" opacity="1.0"/>
          <line x1="3" y1="0" x2="3" y2="6" stroke={barColor || HISTOGRAM_COLORS.bars} strokeWidth="2" opacity="1.0"/>
          <line x1="6" y1="0" x2="6" y2="6" stroke={barColor || HISTOGRAM_COLORS.bars} strokeWidth="2" opacity="1.0"/>
        </pattern>

        {/* Red/Green striped pattern (for decoder_similarity and quality_score above threshold) */}
        {thresholdColors && (
          <pattern
            id={`histogram-pattern-threshold-${chart.metric}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="none"/>
            <line x1="0" y1="0" x2="0" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
            <line x1="3" y1="0" x2="3" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
            <line x1="6" y1="0" x2="6" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
          </pattern>
        )}
      </defs>

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

      {/* Histogram bars - rendered as segments for split patterns */}
      <g>
        {barSegments.map((segments, barIndex) => (
          <g key={barIndex}>
            {segments.map((segment, segmentIndex) => {
              // Even regions (0, 2, 4...): Solid fill (below threshold)
              // Odd regions (1, 3, 5...): Striped pattern (above threshold)
              const isAboveThreshold = segment.patternIndex % 2 === 1

              // Determine fill color based on metric type and threshold position
              let fillColor: string
              if (thresholdColors) {
                // Use red/green colors for decoder_similarity and quality_score
                // Above threshold uses red/green striped pattern, below uses solid fill
                if (isAboveThreshold) {
                  fillColor = `url(#histogram-pattern-threshold-${chart.metric})`
                } else {
                  fillColor = thresholdColors.below
                }
              } else {
                // Use default metric color or striped pattern for other metrics
                const useStripes = segment.patternIndex % 2 === 0
                fillColor = useStripes
                  ? `url(#histogram-pattern-striped-${chart.metric})`
                  : barColor || HISTOGRAM_COLORS.bars
              }

              return (
                <rect
                  key={`${barIndex}-${segmentIndex}`}
                  x={segment.x}
                  y={segment.y}
                  width={segment.width}
                  height={segment.height}
                  fill={fillColor}
                  fillOpacity={1.0}
                  stroke="white"
                  strokeWidth={0.5}
                  style={{
                    transition: `all ${animationDuration}ms ease-out`,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={() => onBarHover(barIndex, chart)}
                  onMouseLeave={() => onBarHover(null, chart)}
                />
              )
            })}
          </g>
        ))}
      </g>

      {/* Threshold Handles - positioned on x-axis, centered */}
      <ThresholdHandles
        orientation="horizontal"
        bounds={{ min: 0, max: chart.width }}
        lineBounds={{
          min: -(chart.height - THRESHOLD_HANDLE_DIMS.height / 2),
          max: THRESHOLD_HANDLE_DIMS.height / 2
        }}
        thresholds={effectiveThresholds}
        metricRange={metricRange}
        position={{ x: 0, y: chart.height - THRESHOLD_HANDLE_DIMS.height / 2 }}
        parentOffset={{ x: chart.margin.left, y: chart.yOffset }}
        handleDimensions={THRESHOLD_HANDLE_DIMS}
        onUpdate={(newThresholds) => {
          setDragThresholds(null) // Clear drag state on commit
          onThresholdUpdate(newThresholds)
        }}
        onDragUpdate={setDragThresholds} // Live preview during drag
      />

      {/* X-axis */}
      <g transform={`translate(0,${chart.height})`}>
        <line x1={0} x2={chart.width} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
        {xAxisTicks.map(tick => (
          <g key={tick.value} transform={`translate(${tick.position},0)`}>
            <line y1={0} y2={6} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
            <text y={28} textAnchor="middle" fontSize={12} fill={HISTOGRAM_COLORS.text}>
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
    </>
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
  // V2: sankeyTree removed - using sankeyStructure instead
  const sankeyStructure = useVisualizationStore(state => state[panelKey].sankeyStructure)

  const {
    hideHistogramPopover,
    fetchMultipleHistogramData,
    updateStageThreshold,  // V2: replaces updateNodeThresholds
    clearError
  } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Performance Optimization: RAF and drag state refs
  // Using refs instead of state prevents re-renders during drag operations
  // This ensures smooth 60fps dragging by batching updates with requestAnimationFrame
  const rafIdRef = useRef<number | null>(null) // RAF ID for popover dragging
  const isDraggingPopoverRef = useRef(false) // Tracks if popover is being dragged
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null) // Mouse offset from popover origin
  const currentDragPositionRef = useRef<{ x: number; y: number } | null>(null) // Current drag position (updated via RAF)

  // Local state for dragging
  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null)

  // Local state for tooltip
  const [hoveredBarInfo, setHoveredBarInfo] = useState<{
    barIndex: number;
    chart: HistogramChart;
  } | null>(null)

  // Track if any threshold handle is being dragged (to disable tooltips during drag)
  const [isDraggingThreshold, setIsDraggingThreshold] = useState<boolean>(false)

  // Clear tooltip when drag starts
  useEffect(() => {
    if (isDraggingThreshold) {
      setHoveredBarInfo(null)
    }
  }, [isDraggingThreshold])

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

  // Get node's threshold values (for displaying multiple sliders)
  // V2: Get thresholds from sankeyStructure segment nodes
  const nodeThresholds = useMemo(() => {
    const nodeId = popoverData?.nodeId
    if (!nodeId || !sankeyStructure) return []

    // Find the segment node by ID
    const node = sankeyStructure.nodes.find((n: any) => n.id === nodeId)
    if (node && node.type === 'segment' && node.threshold != null) {
      return [node.threshold]
    }
    return []
  }, [popoverData?.nodeId, sankeyStructure])

  // Get effective threshold values for display (1 handle to match Sankey)
  const getEffectiveThresholds = useCallback((metric: string): number[] => {
    const nodeId = popoverData?.nodeId || ''
    const compositeKey = nodeId ? `${metric}:${nodeId}` : metric
    const data = histogramData?.[compositeKey]

    if (!data) {
      return [0.5] // Fallback
    }

    // If node has threshold, use first one
    if (nodeThresholds.length >= 1) {
      return [nodeThresholds[0]]
    }

    // Default: place handle at 40th percentile (matching Sankey default)
    const min = data.statistics.min
    const max = data.statistics.max
    const defaultThreshold = min + 0.4 * (max - min)
    return [defaultThreshold]
  }, [nodeThresholds, histogramData, popoverData?.nodeId])

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (histogramData && popoverData?.metrics) {
      const nodeId = popoverData?.nodeId || ''
      popoverData.metrics.forEach(metric => {
        const compositeKey = nodeId ? `${metric}:${nodeId}` : metric
        const metricData = histogramData[compositeKey]
        if (metricData) {
          errors.push(...validateHistogramData(metricData))
        } else {
          errors.push(`Missing histogram data for metric: ${metric}`)
        }
      })
    }
    errors.push(...validateDimensions(containerSize.width, containerSize.height))
    return errors
  }, [histogramData, popoverData?.metrics, popoverData?.nodeId, containerSize])

  // Calculate layout - filter histogram data to only show requested metrics
  const layout = useMemo(() => {
    if (!histogramData || validationErrors.length > 0 || !popoverData?.metrics) {
      return null
    }

    // Filter histogram data to only include the metrics that should be displayed
    const filteredHistogramData: Record<string, HistogramData> = {}
    const nodeId = popoverData?.nodeId || ''
    popoverData.metrics.forEach(metric => {
      const compositeKey = nodeId ? `${metric}:${nodeId}` : metric
      if (histogramData[compositeKey]) {
        filteredHistogramData[metric] = histogramData[compositeKey]
      }
    })

    // Header height: min-height 32px + 1px bottom border
    const HEADER_HEIGHT = 33

    const chartWidth = containerSize.width
    const chartHeight = containerSize.height - HEADER_HEIGHT

    return calculateHistogramLayout(filteredHistogramData, chartWidth, chartHeight)
  }, [histogramData, containerSize, validationErrors, popoverData?.metrics, popoverData?.nodeId])

  // Handle bar hover - disabled during threshold dragging
  const handleBarHover = useCallback((barIndex: number | null, chart: HistogramChart) => {
    // Don't show tooltip when dragging threshold handles
    if (isDraggingThreshold) {
      return
    }

    if (barIndex === null) {
      setHoveredBarInfo(null)
    } else {
      setHoveredBarInfo({ barIndex, chart })
    }
  }, [isDraggingThreshold])

  // Handle header drag start (optimized with RAF)
  const handleHeaderMouseDown = useCallback((event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) {
      return
    }

    const currentPosition = draggedPosition || {
      x: calculatedPosition?.x || popoverData?.position?.x || 0,
      y: calculatedPosition?.y || popoverData?.position?.y || 0
    }

    isDraggingPopoverRef.current = true
    dragOffsetRef.current = {
      x: event.clientX - currentPosition.x,
      y: event.clientY - currentPosition.y
    }
    currentDragPositionRef.current = currentPosition

    // Optimize for drag: disable transitions, change cursor, prevent selection
    if (popoverRef.current) {
      popoverRef.current.classList.add('histogram-popover--dragging')
      popoverRef.current.style.cursor = 'grabbing'
    }
    document.body.style.userSelect = 'none'

    // Performance-Optimized Popover Dragging
    // Uses requestAnimationFrame + direct DOM manipulation for smooth 60fps dragging
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPopoverRef.current || !dragOffsetRef.current) return

      // Cancel any pending RAF to ensure only one update per frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }

      // Schedule update on next animation frame (max 60fps)
      rafIdRef.current = requestAnimationFrame(() => {
        const newPosition = {
          x: e.clientX - dragOffsetRef.current!.x,
          y: e.clientY - dragOffsetRef.current!.y
        }

        currentDragPositionRef.current = newPosition

        // Apply transform directly to DOM for immediate visual feedback
        if (popoverRef.current) {
          popoverRef.current.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`
        }
      })
    }

    const handleMouseUp = () => {
      // Cancel any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }

      isDraggingPopoverRef.current = false

      // Update state with final position (triggers single re-render)
      if (currentDragPositionRef.current) {
        setDraggedPosition(currentDragPositionRef.current)
      }

      // Reset drag optimizations: re-enable transitions, reset cursor
      if (popoverRef.current) {
        popoverRef.current.classList.remove('histogram-popover--dragging')
        popoverRef.current.style.cursor = ''
      }
      document.body.style.userSelect = ''

      // Clean up refs
      dragOffsetRef.current = null

      // Remove event listeners
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    // Attach event listeners when drag starts
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [draggedPosition, calculatedPosition, popoverData?.position])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId && popoverData?.metrics) {
      clearError('histogram')
      fetchMultipleHistogramData(popoverData.metrics, popoverData.nodeId, panel)
    }
  }, [popoverData, clearError, fetchMultipleHistogramData, panel])

  // Reset dragged position when popover closes
  useEffect(() => {
    if (!popoverData?.visible) {
      setDraggedPosition(null)
      isDraggingPopoverRef.current = false
      dragOffsetRef.current = null
      currentDragPositionRef.current = null

      // Cancel any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }

      // Clean up drag state
      if (popoverRef.current) {
        popoverRef.current.classList.remove('histogram-popover--dragging')
      }
      document.body.style.userSelect = ''
    }
  }, [popoverData?.visible])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending RAF operations
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      // Reset user-select
      document.body.style.userSelect = ''
    }
  }, [])

  // Handle click outside to close
  useEffect(() => {
    if (!popoverData?.visible) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // If click is inside the popover container, don't close
      if (containerRef.current && containerRef.current.contains(target)) {
        return
      }

      // Click is outside, close the popover
      hideHistogramPopover()
    }

    // Use mousedown for immediate response
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popoverData?.visible, hideHistogramPopover])

  // Calculate initial position for rendering (prevents "fly-in" animation)
  const initialPosition = useMemo(() => {
    if (!popoverData?.visible) return null

    return draggedPosition || {
      x: calculatedPosition?.x || popoverData.position.x,
      y: calculatedPosition?.y || popoverData.position.y
    }
  }, [popoverData?.visible, draggedPosition, calculatedPosition, popoverData?.position])

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

  // Note: Initial position is applied directly in style to prevent "fly-in" animation
  // Transform is updated during drag operations for better performance
  return (
    <div
      ref={popoverRef}
      className="histogram-popover"
      style={{
        transform: initialPosition ? `translate(${initialPosition.x}px, ${initialPosition.y}px)` : undefined
      }}
    >
      <div
        ref={containerRef}
        className="histogram-popover__container"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        {/* Header */}
        <PopoverHeader
          metric={popoverData.metrics[0]}
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
              width={layout.totalWidth}
              height={layout.totalHeight}
            >
              <rect
                width={layout.totalWidth}
                height={layout.totalHeight}
                className="histogram-popover__svg-background"
              />

              {layout.charts.map(chart => {
                const metric = chart.metric
                const nodeId = popoverData?.nodeId || ''
                const compositeKey = nodeId ? `${metric}:${nodeId}` : metric
                const data = histogramData[compositeKey]
                const thresholds = getEffectiveThresholds(metric)

                if (!data) return null

                const metricRange = {
                  min: data.statistics.min - 0.01,
                  max: data.statistics.max + 0.01
                }

                // Use neutral color for histogram bars
                const metricColor = '#94a3b8'

                return (
                  <HistogramChartComponent
                    key={metric}
                    chart={chart}
                    thresholds={thresholds}
                    metricRange={metricRange}
                    animationDuration={animationDuration}
                    barColor={metricColor}
                    onThresholdUpdate={(newThresholds) => {
                      if (popoverData?.nodeId && newThresholds.length > 0) {
                        // V2: Map nodeId to stage number and update
                        const stageNumber = popoverData.nodeId === 'stage1_segment' ? 1 : 2
                        updateStageThreshold(stageNumber as 1 | 2, newThresholds[0], panel)
                      }
                    }}
                    onBarHover={handleBarHover}
                    onDragStateChange={setIsDraggingThreshold}
                  />
                )
              })}

              {/* Global tooltip - rendered last to be on top */}
              {hoveredBarInfo && histogramData && (() => {
                const { barIndex, chart } = hoveredBarInfo
                const metric = chart.metric
                const nodeId = popoverData?.nodeId || ''
                const compositeKey = nodeId ? `${metric}:${nodeId}` : metric
                const data = histogramData[compositeKey]
                const thresholds = getEffectiveThresholds(metric)
                const primaryThreshold = thresholds[0] || data.statistics.min

                if (!data) return null

                const bars = calculateHistogramBars(chart, primaryThreshold, HISTOGRAM_COLORS.bars, HISTOGRAM_COLORS.threshold)
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