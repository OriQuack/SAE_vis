import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../stores/visualizationStore'
import {
  calculateHistogramLayout,
  calculateMultiHistogramLayout,
  calculateThresholdLine,
  positionToValue,
  formatTooltipContent,
  formatThresholdTooltip,
  validateHistogramData,
  validateDimensions,
  HISTOGRAM_COLORS,
  SLIDER_TRACK,
  DEFAULT_ANIMATION
} from '../utils/d3-helpers'
import type {
  TooltipData,
  MetricType,
  HistogramData,
  IndividualHistogramLayout,
  MultiHistogramLayout
} from '../services/types'
import {
  getThresholdGroupId
} from '../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface HistogramPopoverProps {
  width?: number
  height?: number
  animationDuration?: number
}

interface TooltipProps {
  data: TooltipData | null
  visible: boolean
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

const PopoverTooltip: React.FC<TooltipProps> = ({ data, visible }) => {
  if (!visible || !data) return null

  return (
    <div
      className="histogram-popover-tooltip"
      style={{
        position: 'absolute',
        left: data.x + 10,
        top: data.y - 10,
        transform: 'translateY(-100%)',
        pointerEvents: 'none',
        zIndex: 1002
      }}
    >
      <div className="histogram-popover-tooltip__content">
        <div className="histogram-popover-tooltip__title">{data.title}</div>
        <div className="histogram-popover-tooltip__body">
          {data.content.map((item: { label: string; value: string | number }, index: number) => (
            <div key={index} className="histogram-popover-tooltip__row">
              <span className="histogram-popover-tooltip__label">{item.label}:</span>
              <span className="histogram-popover-tooltip__value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// INDIVIDUAL HISTOGRAM COMPONENT (for multi-histogram mode)
// ============================================================================

interface IndividualHistogramProps {
  layout: IndividualHistogramLayout
  histogramData: HistogramData
  threshold: number
  animationDuration: number
  onThresholdChange: (metric: string, threshold: number) => void
  onTooltipChange: (tooltip: TooltipData | null, visible: boolean) => void
  parentSvgRef: React.RefObject<SVGSVGElement>
}

const IndividualHistogram: React.FC<IndividualHistogramProps> = ({
  layout,
  histogramData,
  threshold,
  animationDuration,
  onThresholdChange,
  onTooltipChange,
  parentSvgRef
}) => {
  const isDraggingRef = useRef(false)

  // Calculate threshold line for this specific histogram
  const thresholdLine = useMemo(() => {
    return calculateThresholdLine(threshold, layout)
  }, [threshold, layout])

  // Handle threshold change for this specific metric
  const handleThresholdChange = useCallback((newThreshold: number) => {
    const clampedThreshold = Math.max(
      histogramData.statistics.min,
      Math.min(histogramData.statistics.max, newThreshold)
    )
    onThresholdChange(layout.metric, clampedThreshold)
  }, [histogramData, layout.metric, onThresholdChange])

  // Handle slider mouse events
  const handleSliderMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    isDraggingRef.current = true

    const rect = parentSvgRef.current?.getBoundingClientRect()
    if (!rect) return

    // Account for the chart's position within the SVG and its transform
    const x = event.clientX - rect.left - layout.margin.left
    const newValue = positionToValue(
      x,
      histogramData.statistics.min,
      histogramData.statistics.max,
      layout.width
    )

    handleThresholdChange(newValue)
  }, [layout, histogramData, handleThresholdChange, parentSvgRef])

  const handleSliderMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return

    const rect = parentSvgRef.current?.getBoundingClientRect()
    if (!rect) return

    // Account for the chart's position within the SVG and its transform
    const x = event.clientX - rect.left - layout.margin.left
    const newValue = positionToValue(
      x,
      histogramData.statistics.min,
      histogramData.statistics.max,
      layout.width
    )

    handleThresholdChange(newValue)
  }, [layout, histogramData, handleThresholdChange, parentSvgRef])

  const handleSliderMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  // Set up global mouse events for dragging
  useEffect(() => {
    document.addEventListener('mousemove', handleSliderMouseMove)
    document.addEventListener('mouseup', handleSliderMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleSliderMouseMove)
      document.removeEventListener('mouseup', handleSliderMouseUp)
    }
  }, [handleSliderMouseMove, handleSliderMouseUp])

  // Handle bar hover
  const handleBarHover = useCallback((event: React.MouseEvent, binIndex: number) => {
    const bin = layout.bins[binIndex]
    const rect = event.currentTarget.getBoundingClientRect()

    const tooltip = {
      x: rect.left + rect.width / 2,
      y: rect.top,
      title: `${layout.chartTitle} - Bin ${binIndex + 1}`,
      content: formatTooltipContent(bin, threshold)
    }

    onTooltipChange(tooltip, true)
  }, [layout, threshold, onTooltipChange])

  const handleBarLeave = useCallback(() => {
    onTooltipChange(null, false)
  }, [onTooltipChange])

  // Handle threshold line hover
  const handleThresholdHover = useCallback((event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()

    const tooltip = {
      x: rect.left,
      y: rect.top,
      title: `${layout.chartTitle} Threshold`,
      content: formatThresholdTooltip(threshold, histogramData.statistics)
    }

    onTooltipChange(tooltip, true)
  }, [layout, threshold, histogramData, onTooltipChange])

  return (
    <g transform={`translate(0,${layout.yOffset})`}>
      {/* Chart title */}
      <text
        x={(layout.width + layout.margin.left + layout.margin.right) / 2}
        y={12}
        textAnchor="middle"
        fontSize={14}
        fontWeight="600"
        fill="#1f2937"
      >
        {layout.chartTitle}
      </text>

      {/* Chart area */}
      <g transform={`translate(${layout.margin.left},${layout.margin.top + 28})`}>
        {/* Grid lines */}
        <g className="individual-histogram__grid">
          {layout.yScale.ticks(3).map(tick => (
            <line
              key={tick}
              x1={0}
              x2={layout.width}
              y1={layout.yScale(tick) as number}
              y2={layout.yScale(tick) as number}
              stroke={HISTOGRAM_COLORS.grid}
              strokeWidth={1}
              opacity={0.3}
            />
          ))}
        </g>

        {/* Histogram bars */}
        <g className="individual-histogram__bars">
          {layout.bins.map((bin, index) => {
            const barHeight = layout.height - (layout.yScale(bin.count) as number)
            const barColor = bin.x0 >= threshold
              ? HISTOGRAM_COLORS.threshold
              : HISTOGRAM_COLORS.bars

            return (
              <rect
                key={index}
                x={layout.xScale(bin.x0) as number}
                y={layout.yScale(bin.count) as number}
                width={Math.max(1, (layout.xScale(bin.x1) as number) - (layout.xScale(bin.x0) as number) - 1)}
                height={barHeight}
                fill={barColor}
                stroke="white"
                strokeWidth={1}
                style={{
                  transition: `fill ${animationDuration}ms ease-out`,
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => handleBarHover(e, index)}
                onMouseLeave={handleBarLeave}
                aria-label={`${layout.chartTitle} bin ${index + 1}: ${bin.count} features`}
              />
            )
          })}
        </g>

        {/* Threshold line in histogram */}
        {thresholdLine && (
          <g className="individual-histogram__threshold">
            <line
              x1={thresholdLine.x}
              x2={thresholdLine.x}
              y1={0}
              y2={layout.height}
              stroke={HISTOGRAM_COLORS.threshold}
              strokeWidth={3}
              style={{ cursor: 'pointer' }}
              onMouseEnter={handleThresholdHover}
              onMouseLeave={handleBarLeave}
            />
          </g>
        )}

        {/* Slider track below histogram */}
        {thresholdLine && (
          <g className="individual-histogram__slider-track" transform={`translate(0, ${layout.height + SLIDER_TRACK.yOffset})`}>
            {/* Unfilled track portion (right side) */}
            <rect
              x={thresholdLine.x}
              y={0}
              width={layout.width - thresholdLine.x}
              height={SLIDER_TRACK.height}
              fill={HISTOGRAM_COLORS.sliderTrackUnfilled}
              rx={SLIDER_TRACK.cornerRadius}
            />
            {/* Filled track portion (left side) */}
            <rect
              x={0}
              y={0}
              width={thresholdLine.x}
              height={SLIDER_TRACK.height}
              fill={HISTOGRAM_COLORS.sliderTrackFilled}
              rx={SLIDER_TRACK.cornerRadius}
            />
            {/* Invisible wider hit area for easier dragging */}
            <rect
              x={0}
              y={-10}
              width={layout.width}
              height={SLIDER_TRACK.height + 20}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseDown={handleSliderMouseDown}
            />
            {/* Circle handle */}
            <circle
              cx={thresholdLine.x}
              cy={SLIDER_TRACK.height / 2}
              r={10}
              fill={HISTOGRAM_COLORS.sliderHandle}
              stroke="white"
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
              onMouseDown={handleSliderMouseDown}
              onMouseEnter={handleThresholdHover}
              onMouseLeave={handleBarLeave}
            />
            {/* Connecting line from histogram to slider */}
            <line
              x1={thresholdLine.x}
              x2={thresholdLine.x}
              y1={-SLIDER_TRACK.yOffset}
              y2={0}
              stroke={HISTOGRAM_COLORS.threshold}
              strokeWidth={2}
              opacity={0.5}
            />
          </g>
        )}

        {/* X-axis */}
        <g className="individual-histogram__x-axis" transform={`translate(0,${layout.height})`}>
          <line
            x1={0}
            x2={layout.width}
            y1={0}
            y2={0}
            stroke={HISTOGRAM_COLORS.axis}
            strokeWidth={1}
          />
          {layout.xScale.ticks(4).map(tick => (
            <g key={tick} transform={`translate(${layout.xScale(tick)},0)`}>
              <line y1={0} y2={4} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
              <text
                y={16}
                textAnchor="middle"
                fontSize={9}
                fill={HISTOGRAM_COLORS.text}
              >
                {tick.toFixed(2)}
              </text>
            </g>
          ))}
        </g>

        {/* Y-axis */}
        <g className="individual-histogram__y-axis">
          <line
            x1={0}
            x2={0}
            y1={0}
            y2={layout.height}
            stroke={HISTOGRAM_COLORS.axis}
            strokeWidth={1}
          />
          {layout.yScale.ticks(3).map(tick => (
            <g key={tick} transform={`translate(0,${layout.yScale(tick)})`}>
              <line x1={-4} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
              <text
                x={-8}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize={9}
                fill={HISTOGRAM_COLORS.text}
              >
                {tick}
              </text>
            </g>
          ))}
        </g>

        {/* Threshold value display */}
        <text
          x={layout.width}
          y={layout.height + 28}
          textAnchor="end"
          fontSize={10}
          fill="#6b7280"
          fontFamily="monospace"
        >
          Threshold: {threshold.toFixed(3)}
        </text>
      </g>
    </g>
  )
}

// ============================================================================
// MAIN HISTOGRAM POPOVER COMPONENT
// ============================================================================

// ============================================================================
// POSITIONING UTILITIES
// ============================================================================

interface PopoverPosition {
  x: number
  y: number
  transform: string
  placement: 'top' | 'bottom' | 'left' | 'right'
}

function calculateOptimalPosition(
  clickPosition: { x: number, y: number },
  popoverSize: { width: number, height: number },
  margin: number = 20
): PopoverPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Calculate available space in each direction
  const spaceTop = clickPosition.y
  const spaceBottom = viewport.height - clickPosition.y
  const spaceLeft = clickPosition.x
  const spaceRight = viewport.width - clickPosition.x

  // Determine optimal placement
  let placement: PopoverPosition['placement'] = 'bottom'
  let x = clickPosition.x
  let y = clickPosition.y
  let transform = ''

  // Primary preference: try to place above (top)
  if (spaceTop >= popoverSize.height + margin) {
    placement = 'top'
    y = clickPosition.y - margin
    transform = 'translate(-50%, -100%)'
  }
  // Secondary: place below (bottom)
  else if (spaceBottom >= popoverSize.height + margin) {
    placement = 'bottom'
    y = clickPosition.y + margin
    transform = 'translate(-50%, 0%)'
  }
  // Tertiary: place to the left
  else if (spaceLeft >= popoverSize.width + margin) {
    placement = 'left'
    x = clickPosition.x - margin
    y = clickPosition.y
    transform = 'translate(-100%, -50%)'
  }
  // Final fallback: place to the right
  else {
    placement = 'right'
    x = clickPosition.x + margin
    y = clickPosition.y
    transform = 'translate(0%, -50%)'
  }

  // Adjust X position to keep popover within viewport bounds
  if (placement === 'top' || placement === 'bottom') {
    const halfWidth = popoverSize.width / 2
    if (x - halfWidth < margin) {
      x = halfWidth + margin
    } else if (x + halfWidth > viewport.width - margin) {
      x = viewport.width - halfWidth - margin
    }
  }

  // Adjust Y position for left/right placements
  if (placement === 'left' || placement === 'right') {
    const halfHeight = popoverSize.height / 2
    if (y - halfHeight < margin) {
      y = halfHeight + margin
    } else if (y + halfHeight > viewport.height - margin) {
      y = viewport.height - halfHeight - margin
    }
  }

  return { x, y, transform, placement }
}

// Calculate responsive container size based on viewport and number of metrics
function calculateResponsiveSize(defaultWidth: number, defaultHeight: number, metricsCount: number = 1) {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Adjust height for multiple metrics (stack them vertically)
  // Each additional histogram needs: chart height (180px) + header (40px) + footer (40px) = 260px
  const adjustedHeight = metricsCount > 1 ? defaultHeight + ((metricsCount - 1) * 260) : defaultHeight

  // Maximum size should not exceed 90% of viewport
  const maxWidth = Math.min(defaultWidth, viewport.width * 0.9)
  const maxHeight = Math.min(adjustedHeight, viewport.height * 0.85)

  // Minimum size to ensure usability
  const minWidth = Math.max(420, maxWidth) // Increased min width for multiple charts
  const minHeight = Math.max(280, maxHeight)

  return {
    width: minWidth,
    height: minHeight
  }
}

export const HistogramPopover: React.FC<HistogramPopoverProps> = ({
  width = 520,  // Increased default size
  height = 380, // Increased default size
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  const popoverData = useVisualizationStore(state => state.popoverState.histogram)
  const histogramData = useVisualizationStore(state => state.histogramData)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)
  const {
    setNodeThreshold,
    setThresholdGroup,
    getNodesInSameThresholdGroup,
    hideHistogramPopover,
    fetchHistogramData,
    fetchMultipleHistogramData,
    clearError
  } = useVisualizationStore()

  // Get current thresholds for this specific node and metrics
  // Note: We need to call hooks unconditionally, so we get thresholds for all possible metrics
  // For score agreement nodes, use parent node ID; for other nodes, use node ID directly
  const thresholdNodeId = popoverData?.parentNodeId || popoverData?.nodeId || ''

  // Get all threshold systems - both legacy and hierarchical
  const allNodeThresholds = useVisualizationStore((state) => state.nodeThresholds)
  const hierarchicalThresholds = useVisualizationStore((state) => state.hierarchicalThresholds)
  const getEffectiveThresholdForNode = useVisualizationStore((state) => state.getEffectiveThresholdForNode)

  // We'll use these to extract the current values (not used directly anymore)
  const nodeThresholds = allNodeThresholds[thresholdNodeId] || {}
  const scoreDetectionThreshold = nodeThresholds.score_detection
  const scoreFuzzThreshold = nodeThresholds.score_fuzz
  const scoreSimulationThreshold = nodeThresholds.score_simulation
  const semdistMeanThreshold = nodeThresholds.semdist_mean
  const semdistMaxThreshold = nodeThresholds.semdist_max

  // Calculate threshold group information for current node and metrics
  const thresholdGroupInfo = useMemo(() => {
    if (!popoverData?.nodeId || !popoverData?.metrics) {
      return { groups: {}, hasAnyGroups: false }
    }

    const groups: Record<MetricType, {
      groupId: string | null
      affectedNodes: string[]
      isGrouped: boolean
    }> = {} as Record<MetricType, {
      groupId: string | null
      affectedNodes: string[]
      isGrouped: boolean
    }>

    let hasAnyGroups = false

    for (const metric of popoverData.metrics) {
      const groupId = getThresholdGroupId(popoverData.nodeId, metric)
      const affectedNodes = getNodesInSameThresholdGroup(popoverData.nodeId, metric)
      const isGrouped = groupId !== null && affectedNodes.length > 1

      groups[metric] = {
        groupId,
        affectedNodes,
        isGrouped
      }

      if (isGrouped) {
        hasAnyGroups = true
      }
    }

    return { groups, hasAnyGroups }
  }, [popoverData?.nodeId, popoverData?.metrics, getNodesInSameThresholdGroup])

  // Build threshold map for current metrics - check both hierarchical and legacy systems
  const currentThresholds = useMemo(() => {
    const thresholds: Record<string, number | undefined> = {} as Record<string, number | undefined>

    if (popoverData?.metrics && popoverData?.nodeId) {
      popoverData.metrics.forEach(metric => {
        // Use getEffectiveThresholdForNode which handles both hierarchical and legacy
        const effectiveValue = getEffectiveThresholdForNode(popoverData.nodeId, metric as MetricType)

        // If we get a valid threshold from the function, use it
        if (effectiveValue !== undefined && effectiveValue !== null) {
          thresholds[metric] = effectiveValue
        } else {
          // Fallback to legacy node thresholds if available
          thresholds[metric] = allNodeThresholds[thresholdNodeId]?.[metric]
        }
      })
    }

    return thresholds
  }, [popoverData?.metrics, popoverData?.nodeId, allNodeThresholds, thresholdNodeId, getEffectiveThresholdForNode, hierarchicalThresholds])

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDraggingRef = useRef(false)

  // Local state
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [containerSize, setContainerSize] = useState(() => calculateResponsiveSize(width, height, popoverData?.metrics?.length))
  const [calculatedPosition, setCalculatedPosition] = useState<PopoverPosition | null>(null)

  // Close popover when clicking outside
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      hideHistogramPopover()
    }
  }, [])

  // Set up click outside listener
  useEffect(() => {
    if (popoverData?.visible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popoverData?.visible, handleClickOutside])

  // Fetch histogram data when popover opens
  useEffect(() => {
    if (popoverData?.visible && popoverData.nodeId && popoverData.metrics?.length > 0) {
      if (popoverData.metrics.length === 1) {
        // Single metric: use the existing single histogram fetch
        fetchHistogramData(false, popoverData.nodeId)
      } else {
        // Multiple metrics: use the new parallel fetch
        fetchMultipleHistogramData(popoverData.metrics, false, popoverData.nodeId)
      }
    }
  }, [popoverData?.visible, popoverData?.nodeId, popoverData?.metrics])

  // Calculate optimal position when popover opens or position changes
  useEffect(() => {
    if (popoverData?.visible && popoverData.position) {
      const position = calculateOptimalPosition(
        popoverData.position,
        { width: containerSize.width, height: containerSize.height }
      )
      setCalculatedPosition(position)
    } else {
      setCalculatedPosition(null)
    }
  }, [popoverData?.visible, popoverData?.position, containerSize])

  // Handle window resize to recalculate container size and position
  useEffect(() => {
    const handleResize = () => {
      const newSize = calculateResponsiveSize(width, height, popoverData?.metrics?.length)
      setContainerSize(newSize)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [width, height, popoverData?.metrics?.length])

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (histogramData && popoverData?.metrics) {
      // Validate histogram data for each metric
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

  // Calculate layout with adjusted dimensions for chart area
  const layout = useMemo(() => {
    if (!histogramData || validationErrors.length > 0 || !popoverData?.metrics) {
      return null
    }

    // Account for header (48px) + chart padding (16px) + margins
    const chartWidth = containerSize.width - 16  // Account for chart padding

    // Detect single vs. multiple histogram mode
    const isMultiHistogram = popoverData.metrics.length > 1

    if (isMultiHistogram) {
      // Multiple histograms mode: use multi-histogram layout
      const chartHeight = containerSize.height - 64  // Header + padding, footer handled by individual charts
      const multiLayout = calculateMultiHistogramLayout(histogramData as Record<string, HistogramData>, chartWidth, chartHeight)
      return multiLayout
    } else {
      // Single histogram mode: use original single histogram layout
      const chartHeight = containerSize.height - 100  // 48 + 36 + 16 = 100px total overhead
      const singleMetric = popoverData.metrics[0]
      const singleHistogramData = histogramData[singleMetric]

      if (!singleHistogramData) {
        return null
      }

      const singleLayout = calculateHistogramLayout(singleHistogramData, chartWidth, chartHeight)
      return singleLayout
    }
  }, [histogramData, containerSize, validationErrors, popoverData?.metrics])

  // Get effective threshold (node-specific or fallback to default) - for single histogram mode
  const effectiveThreshold = useMemo(() => {
    const firstMetric = popoverData?.metrics?.[0]
    if (firstMetric && currentThresholds[firstMetric] !== undefined) {
      return currentThresholds[firstMetric]!
    }
    // Fallback to data mean if no threshold set
    if (histogramData && firstMetric) {
      const metricData = histogramData[firstMetric]
      if (metricData) {
        return metricData.statistics.mean
      }
    }
    return 0.5
  }, [popoverData?.metrics, currentThresholds, histogramData, popoverData?.nodeId])

  // Calculate threshold line for single histogram mode
  const thresholdLine = useMemo(() => {
    if (!layout || !popoverData?.metrics || popoverData.metrics.length > 1) {
      return null
    }

    const thresholdLineResult = calculateThresholdLine(effectiveThreshold, layout as any)
    return thresholdLineResult
  }, [layout, effectiveThreshold, popoverData?.metrics, popoverData?.nodeId])

  // Handle threshold change for multiple metrics with hierarchical support
  const handleMultiThresholdChange = useCallback((metric: string, newThreshold: number) => {
    if (!histogramData || !popoverData) return

    // Get the specific histogram data for this metric
    const metricData = histogramData[metric as MetricType]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    // Check if this metric belongs to a threshold group
    const groupInfo = thresholdGroupInfo.groups[metric as MetricType] || null
    if (groupInfo?.isGrouped && groupInfo.groupId) {
      // Use hierarchical threshold management for grouped thresholds
      console.log(`🎯 Setting threshold group: ${groupInfo.groupId}.${metric} = ${clampedThreshold} (affects ${groupInfo.affectedNodes.length} nodes)`)
      setThresholdGroup(groupInfo.groupId, metric as MetricType, clampedThreshold)
    } else {
      // Use legacy node threshold for non-grouped thresholds
      console.log(`🎯 Setting individual node threshold: ${thresholdNodeId}.${metric} = ${clampedThreshold}`)
      setNodeThreshold(thresholdNodeId, metric as MetricType, clampedThreshold)
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setNodeThreshold, setThresholdGroup, thresholdNodeId])

  // Handle threshold change for single metric (backward compatibility) with hierarchical support
  const handleSingleThresholdChange = useCallback((newThreshold: number) => {
    if (!histogramData || !popoverData || !popoverData.metrics?.[0]) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    // Check if this metric belongs to a threshold group
    const groupInfo = thresholdGroupInfo.groups[singleMetric] || null
    if (groupInfo?.isGrouped && groupInfo.groupId) {
      // Use hierarchical threshold management for grouped thresholds
      console.log(`🎯 Setting threshold group: ${groupInfo.groupId}.${singleMetric} = ${clampedThreshold} (affects ${groupInfo.affectedNodes.length} nodes)`)
      setThresholdGroup(groupInfo.groupId, singleMetric, clampedThreshold)
    } else {
      // Use legacy node threshold for non-grouped thresholds
      console.log(`🎯 Setting individual node threshold: ${thresholdNodeId}.${singleMetric} = ${clampedThreshold}`)
      setNodeThreshold(thresholdNodeId, singleMetric, clampedThreshold)
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setNodeThreshold, setThresholdGroup, thresholdNodeId])

  // Handle slider mouse events for single histogram (backward compatibility)
  const handleSliderMouseDown = useCallback((event: React.MouseEvent) => {

    if (!layout || !histogramData || !popoverData?.metrics?.[0]) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    isDraggingRef.current = true

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const x = event.clientX - rect.left - (layout as any).margin.left
    const newValue = positionToValue(
      x,
      metricData.statistics.min,
      metricData.statistics.max,
      (layout as any).width
    )

    handleSingleThresholdChange(newValue)
  }, [layout, histogramData, handleSingleThresholdChange, popoverData])

  const handleSliderMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current || !layout || !histogramData || !popoverData?.metrics?.[0]) return

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const x = event.clientX - rect.left - (layout as any).margin.left
    const newValue = positionToValue(
      x,
      metricData.statistics.min,
      metricData.statistics.max,
      (layout as any).width
    )

    handleSingleThresholdChange(newValue)
  }, [layout, histogramData, handleSingleThresholdChange, popoverData])

  const handleSliderMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  // Set up global mouse events for dragging
  useEffect(() => {
    document.addEventListener('mousemove', handleSliderMouseMove)
    document.addEventListener('mouseup', handleSliderMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleSliderMouseMove)
      document.removeEventListener('mouseup', handleSliderMouseUp)
    }
  }, [handleSliderMouseMove, handleSliderMouseUp])

  // Handle bar hover for single histogram mode
  const handleBarHover = useCallback((event: React.MouseEvent, binIndex: number) => {
    if (!layout || !histogramData || !popoverData?.metrics?.[0]) return

    const singleLayout = layout as any
    const bin = singleLayout.bins[binIndex]
    const rect = event.currentTarget.getBoundingClientRect()

    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      title: `Bin ${binIndex + 1}`,
      content: formatTooltipContent(bin, effectiveThreshold)
    })
    setShowTooltip(true)
  }, [layout, histogramData, effectiveThreshold, popoverData])

  const handleBarLeave = useCallback(() => {
    setShowTooltip(false)
  }, [])

  // Handle threshold line hover for single histogram mode
  const handleThresholdHover = useCallback((event: React.MouseEvent) => {
    if (!histogramData || !popoverData?.metrics?.[0]) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const rect = event.currentTarget.getBoundingClientRect()

    setTooltip({
      x: rect.left,
      y: rect.top,
      title: 'Node Threshold',
      content: formatThresholdTooltip(effectiveThreshold, metricData.statistics)
    })
    setShowTooltip(true)
  }, [histogramData, effectiveThreshold, popoverData])

  // Handle close button
  const handleClose = useCallback(() => {
    hideHistogramPopover()
  }, [])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId) {
      clearError('histogram')
      fetchHistogramData(false, popoverData.nodeId)
    }
  }, [popoverData?.nodeId])

  // Don't render if popover is not visible
  if (!popoverData?.visible) {
    return null
  }

  const popoverContent = (
    <div
      className="histogram-popover"
      style={{
        position: 'fixed',
        left: calculatedPosition?.x || popoverData.position.x,
        top: calculatedPosition?.y || popoverData.position.y,
        zIndex: 1001,
        transform: calculatedPosition?.transform || 'translate(-50%, -100%)',
        transition: `all ${animationDuration}ms ease-out`,
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }}
    >
      <div
        ref={containerRef}
        className="histogram-popover__container"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        {/* Header */}
        <div
          className="histogram-popover__header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            borderRadius: '8px 8px 0 0',
            height: '48px',
            flexShrink: 0
          }}
        >
          <div
            className="histogram-popover__title-section"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              minWidth: 0
            }}
          >
            <h4
              className="histogram-popover__title"
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '600',
                color: '#1f2937',
                lineHeight: '1.3',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {popoverData.nodeName}
            </h4>
            {popoverData.parentNodeName && (
              <span
                className="histogram-popover__parent"
                style={{
                  fontSize: '10px',
                  color: '#7c3aed',
                  fontWeight: '500',
                  lineHeight: '1.2',
                  marginTop: '1px'
                }}
              >
                Thresholds for: {popoverData.parentNodeName}
              </span>
            )}
            <span
              className="histogram-popover__metric"
              style={{
                fontSize: '11px',
                color: '#6b7280',
                fontWeight: '500',
                lineHeight: '1.2',
                marginTop: '2px'
              }}
            >
              {popoverData.metrics.length === 1
                ? popoverData.metrics[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                : `${popoverData.metrics.length} Score Metrics`}
            </span>
          </div>
          <button
            className="histogram-popover__close"
            onClick={handleClose}
            aria-label="Close histogram popover"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '16px',
              fontWeight: 'normal',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '2px',
              lineHeight: '1',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '3px',
              transition: 'all 150ms ease',
              flexShrink: 0,
              marginLeft: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
              e.currentTarget.style.color = '#374151'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="histogram-popover__error">
            <span className="histogram-popover__error-icon">⚠️</span>
            <span className="histogram-popover__error-text">{error}</span>
            <button className="histogram-popover__retry" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="histogram-popover__validation-errors">
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
            <div className="histogram-popover__loading-spinner" />
            <span>Loading histogram...</span>
          </div>
        )}

        {/* Main visualization */}
        {layout && histogramData && !loading && !error && validationErrors.length === 0 && popoverData?.metrics && (
          <div
            className="histogram-popover__chart"
            style={{
              padding: '8px',
              overflow: 'hidden'
            }}
          >
            {popoverData.metrics.length > 1 ? (
              /* Multiple histograms mode */
              <svg
                ref={svgRef}
                width={containerSize.width - 16}
                height={(layout as MultiHistogramLayout).totalHeight}
                className="histogram-popover__svg"
                style={{
                  display: 'block',
                  margin: '0 auto'
                }}
              >
                {/* Background */}
                <rect
                  width={containerSize.width - 16}
                  height={(layout as MultiHistogramLayout).totalHeight}
                  fill={HISTOGRAM_COLORS.background}
                />

                {/* Render individual histograms */}
                {(layout as MultiHistogramLayout).charts.map((chartLayout) => {
                  const metric = chartLayout.metric
                  const metricData = histogramData[metric as MetricType]
                  const threshold = currentThresholds[metric] || metricData?.statistics.mean || 0.5

                  // Debug logging
                  console.log(`Rendering ${metric}: threshold=${threshold}, from currentThresholds=${currentThresholds[metric]}, nodeThresholds=`, allNodeThresholds[thresholdNodeId])

                  if (!metricData) return null

                  return (
                    <IndividualHistogram
                      key={metric}
                      layout={chartLayout}
                      histogramData={metricData}
                      threshold={threshold}
                      animationDuration={animationDuration}
                      onThresholdChange={handleMultiThresholdChange}
                      onTooltipChange={(tooltip, visible) => {
                        setTooltip(tooltip)
                        setShowTooltip(visible)
                      }}
                      parentSvgRef={svgRef}
                    />
                  )
                })}
              </svg>
            ) : (
              /* Single histogram mode (backward compatibility) */
              <svg
                ref={svgRef}
                width={containerSize.width - 16}
                height={containerSize.height - 100}
                className="histogram-popover__svg"
                style={{
                  display: 'block',
                  margin: '0 auto'
                }}
              >
                {/* Background */}
                <rect
                  width={containerSize.width - 16}
                  height={containerSize.height - 100}
                  fill={HISTOGRAM_COLORS.background}
                />

                {/* Chart area */}
                <g transform={`translate(${(layout as any).margin.left},${(layout as any).margin.top})`}>
                  {/* Grid lines */}
                  <g className="histogram-popover__grid">
                    {(layout as any).yScale.ticks(4).map((tick: any) => (
                      <line
                        key={tick}
                        x1={0}
                        x2={(layout as any).width}
                        y1={(layout as any).yScale(tick) as number}
                        y2={(layout as any).yScale(tick) as number}
                        stroke={HISTOGRAM_COLORS.grid}
                        strokeWidth={1}
                        opacity={0.3}
                      />
                    ))}
                  </g>

                  {/* Histogram bars */}
                  <g className="histogram-popover__bars">
                    {(layout as any).bins.map((bin: any, index: number) => {
                      const barHeight = (layout as any).height - ((layout as any).yScale(bin.count) as number)
                      const barColor = bin.x0 >= effectiveThreshold
                        ? HISTOGRAM_COLORS.threshold
                        : HISTOGRAM_COLORS.bars


                      return (
                        <rect
                          key={index}
                          x={(layout as any).xScale(bin.x0) as number}
                          y={(layout as any).yScale(bin.count) as number}
                          width={Math.max(1, ((layout as any).xScale(bin.x1) as number) - ((layout as any).xScale(bin.x0) as number) - 1)}
                          height={barHeight}
                          fill={barColor}
                          stroke="white"
                          strokeWidth={1}
                          style={{
                            transition: `fill ${animationDuration}ms ease-out`,
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => handleBarHover(e, index)}
                          onMouseLeave={handleBarLeave}
                          aria-label={`Bin ${index + 1}: ${bin.count} features`}
                        />
                      )
                    })}
                  </g>

                  {/* Threshold line in histogram */}
                  {thresholdLine && (
                    <g className="histogram-popover__threshold">
                      <line
                        x1={thresholdLine.x}
                        x2={thresholdLine.x}
                        y1={0}
                        y2={(layout as any).height}
                        stroke={HISTOGRAM_COLORS.threshold}
                        strokeWidth={3}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={handleThresholdHover}
                        onMouseLeave={handleBarLeave}
                      />
                    </g>
                  )}

                  {/* Slider track below histogram */}
                  {thresholdLine && (
                    <g className="histogram-popover__slider-track" transform={`translate(0, ${(layout as any).height + SLIDER_TRACK.yOffset})`}>
                      {/* Unfilled track portion (right side) */}
                      <rect
                        x={thresholdLine.x}
                        y={0}
                        width={(layout as any).width - thresholdLine.x}
                        height={SLIDER_TRACK.height}
                        fill={HISTOGRAM_COLORS.sliderTrackUnfilled}
                        rx={SLIDER_TRACK.cornerRadius}
                      />
                      {/* Filled track portion (left side) */}
                      <rect
                        x={0}
                        y={0}
                        width={thresholdLine.x}
                        height={SLIDER_TRACK.height}
                        fill={HISTOGRAM_COLORS.sliderTrackFilled}
                        rx={SLIDER_TRACK.cornerRadius}
                      />
                      {/* Invisible wider hit area for easier dragging */}
                      <rect
                        x={0}
                        y={-10}
                        width={(layout as any).width}
                        height={SLIDER_TRACK.height + 20}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => {
                          handleSliderMouseDown(e)
                        }}
                      />
                      {/* Circle handle */}
                      <circle
                        cx={thresholdLine.x}
                        cy={SLIDER_TRACK.height / 2}
                        r={10}
                        fill={HISTOGRAM_COLORS.sliderHandle}
                        stroke="white"
                        strokeWidth={2}
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => {
                          handleSliderMouseDown(e)
                        }}
                        onMouseEnter={handleThresholdHover}
                        onMouseLeave={handleBarLeave}
                      />
                      {/* Connecting line from histogram to slider */}
                      <line
                        x1={thresholdLine.x}
                        x2={thresholdLine.x}
                        y1={-SLIDER_TRACK.yOffset}
                        y2={0}
                        stroke={HISTOGRAM_COLORS.threshold}
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    </g>
                  )}

                  {/* X-axis */}
                  <g className="histogram-popover__x-axis" transform={`translate(0,${(layout as any).height})`}>
                    <line
                      x1={0}
                      x2={(layout as any).width}
                      y1={0}
                      y2={0}
                      stroke={HISTOGRAM_COLORS.axis}
                      strokeWidth={1}
                    />
                    {(layout as any).xScale.ticks(4).map((tick: any) => (
                      <g key={tick} transform={`translate(${(layout as any).xScale(tick)},0)`}>
                        <line y1={0} y2={4} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                        <text
                          y={16}
                          textAnchor="middle"
                          fontSize={10}
                          fill={HISTOGRAM_COLORS.text}
                        >
                          {tick.toFixed(2)}
                        </text>
                      </g>
                    ))}
                  </g>

                  {/* Y-axis */}
                  <g className="histogram-popover__y-axis">
                    <line
                      x1={0}
                      x2={0}
                      y1={0}
                      y2={(layout as any).height}
                      stroke={HISTOGRAM_COLORS.axis}
                      strokeWidth={1}
                    />
                    {(layout as any).yScale.ticks(4).map((tick: any) => (
                      <g key={tick} transform={`translate(0,${(layout as any).yScale(tick)})`}>
                        <line x1={-4} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                        <text
                          x={-8}
                          textAnchor="end"
                          alignmentBaseline="middle"
                          fontSize={10}
                          fill={HISTOGRAM_COLORS.text}
                        >
                          {tick}
                        </text>
                      </g>
                    ))}
                  </g>

                  {/* Threshold value display at bottom right */}
                  <text
                    x={(layout as any).width}
                    y={(layout as any).height + 28}
                    textAnchor="end"
                    fontSize={10}
                    fill="#6b7280"
                    fontFamily="monospace"
                  >
                    Threshold: {effectiveThreshold.toFixed(3)}
                  </text>
                </g>
              </svg>
            )}
          </div>
        )}

        {/* Footer with threshold value - removed for single histograms as value is now shown in chart */}
        {false && histogramData && popoverData?.metrics && popoverData.metrics.length === 1 && (
          <div
            className="histogram-popover__footer"
            style={{
              padding: '8px 16px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f9fafb',
              borderRadius: '0 0 8px 8px',
              height: '36px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <div
              className="histogram-popover__threshold-display"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px'
              }}
            >
              <span
                className="histogram-popover__threshold-label"
                style={{
                  color: '#6b7280',
                  fontWeight: '500'
                }}
              >
                Threshold:
              </span>
              <span
                className="histogram-popover__threshold-value"
                style={{
                  color: '#1f2937',
                  fontWeight: '600',
                  fontFamily: 'monospace'
                }}
              >
                {effectiveThreshold.toFixed(3)}
              </span>
              {popoverData?.metrics?.[0] && currentThresholds[popoverData.metrics[0]] === undefined && (
                <span
                  className="histogram-popover__threshold-note"
                  style={{
                    color: '#9ca3af',
                    fontStyle: 'italic'
                  }}
                >
                  (default)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer summary for multiple histograms */}
        {histogramData && popoverData?.metrics && popoverData.metrics.length > 1 && (
          <div
            className="histogram-popover__footer"
            style={{
              padding: '8px 16px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f9fafb',
              borderRadius: '0 0 8px 8px',
              minHeight: '36px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div
              className="histogram-popover__multi-summary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '11px',
                flexWrap: 'wrap'
              }}
            >
              {popoverData.metrics.map((metric) => {
                const threshold = currentThresholds[metric]
                const metricData = histogramData[metric as MetricType]
                const defaultThreshold = metricData?.statistics.mean || 0.5
                const effectiveValue = threshold !== undefined ? threshold : defaultThreshold
                const isDefault = threshold === undefined

                return (
                  <div key={metric} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#6b7280', fontWeight: '500' }}>
                      {metric.replace('score_', '').replace('_', ' ')}:
                    </span>
                    <span style={{ color: '#1f2937', fontWeight: '600', fontFamily: 'monospace' }}>
                      {effectiveValue.toFixed(3)}
                    </span>
                    {isDefault && (
                      <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '9px' }}>
                        (default)
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}


        {/* Tooltip */}
        <PopoverTooltip data={tooltip} visible={showTooltip} />
      </div>
    </div>
  )

  // Render as portal to ensure proper z-index layering
  return createPortal(popoverContent, document.body)
}

export default HistogramPopover