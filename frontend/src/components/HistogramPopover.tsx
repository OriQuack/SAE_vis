import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateHistogramLayout,
  calculateThresholdLine,
  positionToValue,
  validateHistogramData,
  validateDimensions,
  DEFAULT_ANIMATION,
  HISTOGRAM_COLORS,
  SLIDER_TRACK
} from '../lib/d3-utils'
import { formatSmartNumber } from '../lib/utils'
import type { HistogramData, MetricType, HistogramLayout, HistogramChart } from '../types'

// ============================================================================
// INLINE STYLE CONSTANTS (from utils/styles.ts)
// ============================================================================
const POPOVER_STYLES = {
  container: {
    position: 'fixed' as const,
    zIndex: 1001,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff'
  }
}

const HEADER_STYLES = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: '8px 8px 0 0',
    height: '48px',
    flexShrink: 0
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    flex: 1,
    minWidth: 0
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
    lineHeight: '1.3',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  parent: {
    fontSize: '10px',
    color: '#7c3aed',
    fontWeight: '500',
    lineHeight: '1.2',
    marginTop: '1px'
  },
  metric: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: '500',
    lineHeight: '1.2',
    marginTop: '2px'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'normal' as const,
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
  }
}

const CHART_STYLES = {
  container: {
    padding: '8px',
    overflow: 'hidden'
  }
}

// ============================================================================
// INLINE POSITIONING UTILITIES (from utils/positioning.ts)
// ============================================================================
function calculateOptimalPosition(
  clickPosition: { x: number, y: number },
  popoverSize: { width: number, height: number },
  margin: number = 20
) {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Use fixed right positioning for histogram popovers
  let x = clickPosition.x
  let y = clickPosition.y
  let transform = 'translate(0%, -50%)'

  // Ensure the popover fits vertically on screen
  const halfHeight = popoverSize.height / 2
  if (y - halfHeight < margin) {
    y = halfHeight + margin
  } else if (y + halfHeight > viewport.height - margin) {
    y = viewport.height - halfHeight - margin
  }

  // Ensure the popover fits horizontally on screen
  if (x + popoverSize.width > viewport.width - margin) {
    x = viewport.width - popoverSize.width - margin
  }

  return { x, y, transform }
}

function calculateResponsiveSize(
  defaultWidth: number,
  defaultHeight: number,
  metricsCount: number = 1
) {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  let adjustedHeight = defaultHeight

  if (metricsCount > 1) {
    // Calculate required height based on actual layout needs
    // From MULTI_HISTOGRAM_LAYOUT constants: spacing=16, chartTitleHeight=28, chartMarginTop=12, minChartHeight=120
    // From DEFAULT_HISTOGRAM_MARGIN: top=20, bottom=70
    const spacing = 16
    const chartTitleHeight = 28
    const chartMarginTop = 12
    const minChartHeight = 120
    const chartMarginTopBottom = 20 + 70  // margin.top + margin.bottom

    // Calculate total spacing needed
    const totalSpacing = (metricsCount - 1) * spacing + metricsCount * (chartTitleHeight + chartMarginTop)
    // Each chart needs at least minChartHeight + margins
    const totalChartHeight = metricsCount * (minChartHeight + chartMarginTopBottom)
    // Add header height (48px) and padding (16px)
    adjustedHeight = totalSpacing + totalChartHeight + 48 + 16
  }

  const maxWidth = Math.min(defaultWidth, viewport.width * 0.9)
  const maxHeight = Math.min(adjustedHeight, viewport.height * 0.9)  // Increased to 90% of viewport
  const minWidth = Math.max(420, maxWidth)
  const minHeight = Math.max(280, maxHeight)

  return { width: minWidth, height: minHeight }
}

// ============================================================================
// MAIN COMPONENT PROPS
// ============================================================================
interface HistogramPopoverProps {
  width?: number
  height?: number
  animationDuration?: number
}

// ============================================================================
// MAIN CONSOLIDATED HISTOGRAM POPOVER COMPONENT
// ============================================================================
export const HistogramPopover: React.FC<HistogramPopoverProps> = ({
  width = 520,
  height = 380,
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  const popoverData = useVisualizationStore(state => state.popoverState.histogram)
  const histogramData = useVisualizationStore(state => state.histogramData)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)

  const {
    hideHistogramPopover,
    fetchMultipleHistogramData,
    setHierarchicalThresholds,
    clearError
  } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Local state for dragging
  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null)
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false)
  const draggingMetricRef = useRef<string | null>(null)
  const draggingChartRef = useRef<HistogramChart | null>(null)

  // Calculate container size
  const containerSize = useMemo(() => {
    return calculateResponsiveSize(width, height, popoverData?.metrics?.length || 1)
  }, [width, height, popoverData?.metrics?.length])

  // Calculate position
  const calculatedPosition = useMemo(() => {
    if (!popoverData?.visible || !popoverData?.position) return null
    return calculateOptimalPosition(popoverData.position, containerSize)
  }, [popoverData?.visible, popoverData?.position, containerSize])

  // ============================================================================
  // INLINE HEADER COMPONENT (from PopoverHeader.tsx)
  // ============================================================================
  const renderHeader = useCallback(() => {
    if (!popoverData) return null

    const formatMetricText = (metrics: string[]) => {
      if (metrics.length === 1) {
        return metrics[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
      }
      return `${metrics.length} Score Metrics`
    }

    const handleMouseDown = (event: React.MouseEvent) => {
      // Don't start dragging if clicking on the close button
      if ((event.target as HTMLElement).closest('.histogram-popover__close')) {
        return
      }

      const currentPosition = draggedPosition || {
        x: calculatedPosition?.x || popoverData.position.x,
        y: calculatedPosition?.y || popoverData.position.y
      }

      setDragStartOffset({
        x: event.clientX - currentPosition.x,
        y: event.clientY - currentPosition.y
      })
    }

    const handleCloseHover = (e: React.MouseEvent<HTMLButtonElement>, isEnter: boolean) => {
      if (isEnter) {
        e.currentTarget.style.backgroundColor = '#f3f4f6'
        e.currentTarget.style.color = '#374151'
      } else {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.color = '#6b7280'
      }
    }

    return (
      <div
        className="histogram-popover__header"
        style={{ ...HEADER_STYLES.container, cursor: 'move' }}
        onMouseDown={handleMouseDown}
      >
        <div style={HEADER_STYLES.titleSection}>
          <h4 style={HEADER_STYLES.title}>{popoverData.nodeName}</h4>
          {popoverData.parentNodeName && (
            <span style={HEADER_STYLES.parent}>
              Thresholds for: {popoverData.parentNodeName}
            </span>
          )}
          <span style={HEADER_STYLES.metric}>
            {formatMetricText(popoverData.metrics)}
          </span>
        </div>
        <button
          className="histogram-popover__close"
          onClick={hideHistogramPopover}
          style={HEADER_STYLES.closeButton}
          onMouseEnter={(e) => handleCloseHover(e, true)}
          onMouseLeave={(e) => handleCloseHover(e, false)}
        >
          ×
        </button>
      </div>
    )
  }, [popoverData, draggedPosition, calculatedPosition, hideHistogramPopover])

  // ============================================================================
  // THRESHOLD UTILITIES - Moved before useEffect that uses them
  // ============================================================================
  // Map metric names to threshold keys in the store
  const mapMetricToThresholdKey = useCallback((metric: string): string => {
    if (metric.startsWith('score_')) {
      return 'score_high'
    }
    if (metric === 'semdist_mean' || metric === 'feature_splitting') {
      return metric
    }
    // Default fallback
    return 'score_high'
  }, [])

  // Handle global mouse events for slider dragging
  useEffect(() => {
    if (!isDraggingSlider) return

    const handleMouseMove = (event: MouseEvent) => {
      const metric = draggingMetricRef.current
      const chart = draggingChartRef.current
      if (!metric || !chart || !histogramData?.[metric]) return

      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return

      // Calculate position relative to the specific chart
      const x = event.clientX - rect.left - chart.margin.left
      const data = histogramData[metric]
      const thresholdKey = mapMetricToThresholdKey(metric)

      // Use the specific chart's width for position calculation
      const newValue = positionToValue(x, data.statistics.min, data.statistics.max, chart.width)
      const clampedValue = Math.max(data.statistics.min, Math.min(data.statistics.max, newValue))

      setHierarchicalThresholds({ [thresholdKey]: clampedValue }, popoverData?.parentNodeId)
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
  }, [isDraggingSlider, histogramData, setHierarchicalThresholds, mapMetricToThresholdKey, popoverData?.parentNodeId])

  const getEffectiveThreshold = useCallback((metric: string): number => {
    const hierarchicalThresholds = useVisualizationStore.getState().hierarchicalThresholds
    const parentNodeId = popoverData?.parentNodeId || 'global'
    const thresholdKey = mapMetricToThresholdKey(metric)

    // Access nested threshold structure: hierarchicalThresholds[parentNodeId][thresholdKey]
    const parentThresholds = hierarchicalThresholds[parentNodeId]
    if (parentThresholds && parentThresholds[thresholdKey] !== undefined) {
      return parentThresholds[thresholdKey]
    }
    // Fallback to histogram mean
    if (histogramData && histogramData[metric]) {
      return histogramData[metric].statistics.mean
    }
    return 0.5
  }, [histogramData, mapMetricToThresholdKey, popoverData?.parentNodeId])

  // ============================================================================
  // INLINE SINGLE HISTOGRAM VIEW (from SingleHistogramView.tsx)
  // ============================================================================
  const renderHistograms = useCallback((layout: HistogramLayout, histogramData: Record<string, HistogramData>) => {
    if (!layout || !histogramData) return null

    const isSingleHistogram = layout.charts.length === 1

    return (
      <svg
        ref={svgRef}
        width={containerSize.width - 16}
        height={containerSize.height - 64}
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect
          width={containerSize.width - 16}
          height={containerSize.height - 64}
          fill={HISTOGRAM_COLORS.background}
        />

        {/* Render each histogram chart */}
        {layout.charts.map((chart: HistogramChart, index: number) => {
          const metric = chart.metric
          const data = histogramData[metric]
          const threshold = getEffectiveThreshold(metric)

          if (!data || !metric) return null

          const thresholdLine = calculateThresholdLine(threshold, chart)

          const handleThresholdChange = (newThreshold: number) => {
            const clampedThreshold = Math.max(data.statistics.min, Math.min(data.statistics.max, newThreshold))
            const thresholdKey = mapMetricToThresholdKey(metric)
            setHierarchicalThresholds({ [thresholdKey]: clampedThreshold }, popoverData?.parentNodeId)
          }

          const calculateThresholdFromEvent = (event: React.MouseEvent | MouseEvent) => {
            const rect = svgRef.current?.getBoundingClientRect()
            if (!rect) return null
            const x = event.clientX - rect.left - chart.margin.left
            return positionToValue(x, data.statistics.min, data.statistics.max, chart.width)
          }

          const handleSliderMouseDown = (event: React.MouseEvent) => {
            // Start dragging
            setIsDraggingSlider(true)
            draggingMetricRef.current = metric
            draggingChartRef.current = chart

            // Also set initial threshold value
            const newValue = calculateThresholdFromEvent(event)
            if (newValue !== null) handleThresholdChange(newValue)

            // Prevent default to avoid text selection
            event.preventDefault()
          }

          return (
            <g key={metric} transform={`translate(${chart.margin.left}, ${chart.yOffset})`}>
              {/* Grid lines for single histogram only */}
              {isSingleHistogram && (
                <g>
                  {chart.yScale.ticks(5).map((tick: number) => (
                    <line
                      key={tick}
                      x1={0}
                      x2={chart.width}
                      y1={chart.yScale(tick) as number}
                      y2={chart.yScale(tick) as number}
                      stroke={HISTOGRAM_COLORS.grid}
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  ))}
                </g>
              )}

              {/* Histogram bars */}
              <g>
                {chart.bins.map((bin: any, binIndex: number) => {
                  const barHeight = chart.height - (chart.yScale(bin.count) as number)
                  const barColor = bin.x0 >= threshold ? HISTOGRAM_COLORS.threshold : HISTOGRAM_COLORS.bars

                  return (
                    <rect
                      key={binIndex}
                      x={chart.xScale(bin.x0) as number}
                      y={chart.yScale(bin.count) as number}
                      width={Math.max(1, (chart.xScale(bin.x1) as number) - (chart.xScale(bin.x0) as number) - 1)}
                      height={barHeight}
                      fill={barColor}
                      stroke="white"
                      strokeWidth={isSingleHistogram ? 1 : 0.5}
                      style={isSingleHistogram ? { transition: `fill ${animationDuration}ms ease-out` } : {}}
                    />
                  )
                })}
              </g>

              {/* Threshold line */}
              {thresholdLine && (
                <line
                  x1={thresholdLine.x}
                  x2={thresholdLine.x}
                  y1={0}
                  y2={chart.height}
                  stroke={HISTOGRAM_COLORS.threshold}
                  strokeWidth={isSingleHistogram ? 3 : 2}
                  style={isSingleHistogram ? { cursor: 'pointer' } : {}}
                />
              )}

              {/* Interactive slider track (for all histograms) */}
              {thresholdLine && (
                <g transform={`translate(0, ${chart.height + SLIDER_TRACK.yOffset})`}>
                  <rect
                    x={thresholdLine.x}
                    y={0}
                    width={chart.width - thresholdLine.x}
                    height={SLIDER_TRACK.height}
                    fill={HISTOGRAM_COLORS.sliderTrackUnfilled}
                    rx={SLIDER_TRACK.cornerRadius}
                  />
                  <rect
                    x={0}
                    y={0}
                    width={thresholdLine.x}
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
                    onMouseDown={handleSliderMouseDown}
                  />
                  <circle
                    cx={thresholdLine.x}
                    cy={SLIDER_TRACK.height / 2}
                    r={10}
                    fill={HISTOGRAM_COLORS.sliderHandle}
                    stroke="white"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onMouseDown={handleSliderMouseDown}
                  />
                </g>
              )}

              {/* Chart title (multi-histogram only) */}
              {!isSingleHistogram && (
                <text
                  x={chart.width / 2}
                  y={-8}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight="600"
                  fill={HISTOGRAM_COLORS.text}
                >
                  {chart.chartTitle}
                </text>
              )}

              {/* Threshold value (multi-histogram only) */}
              {!isSingleHistogram && (
                <text
                  x={chart.width}
                  y={chart.height + 15}
                  textAnchor="end"
                  fontSize={9}
                  fill="#6b7280"
                  fontFamily="monospace"
                >
                  {formatSmartNumber(threshold)}
                </text>
              )}

              {/* Axes (for all histograms) */}
              {(
                <>
                  <g transform={`translate(0,${chart.height})`}>
                    <line x1={0} x2={chart.width} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                    {chart.xScale.ticks(isSingleHistogram ? 5 : 3).map((tick: number) => (
                      <g key={tick} transform={`translate(${chart.xScale(tick)},0)`}>
                        <line y1={0} y2={6} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                        <text y={20} textAnchor="middle" fontSize={12} fill={HISTOGRAM_COLORS.text}>
                          {tick.toFixed(2)}
                        </text>
                      </g>
                    ))}
                  </g>

                  <g>
                    <line x1={0} x2={0} y1={0} y2={chart.height} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                    {chart.yScale.ticks(isSingleHistogram ? 5 : 3).map((tick: number) => (
                      <g key={tick} transform={`translate(0,${chart.yScale(tick)})`}>
                        <line x1={-6} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                        <text x={-10} textAnchor="end" alignmentBaseline="middle" fontSize={12} fill={HISTOGRAM_COLORS.text}>
                          {tick}
                        </text>
                      </g>
                    ))}
                  </g>
                </>
              )}
            </g>
          )
        })}
      </svg>
    )
  }, [containerSize, animationDuration, getEffectiveThreshold, formatSmartNumber, setHierarchicalThresholds, mapMetricToThresholdKey, setIsDraggingSlider, draggingMetricRef])

  // ============================================================================
  // MULTI-HISTOGRAM RENDERING
  // ============================================================================

  // ============================================================================
  // THRESHOLD MANAGEMENT (simplified from hooks/useThresholdManagement.ts)
  // ============================================================================
  const handleSingleThresholdChange = useCallback((newThreshold: number) => {
    if (!histogramData || !popoverData?.metrics?.[0]) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    const thresholdKey = mapMetricToThresholdKey(singleMetric)
    setHierarchicalThresholds({ [thresholdKey]: clampedThreshold }, popoverData?.parentNodeId)
  }, [histogramData, popoverData?.metrics, popoverData?.parentNodeId, setHierarchicalThresholds, mapMetricToThresholdKey])

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

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId && popoverData?.metrics) {
      clearError('histogram')
      fetchMultipleHistogramData(popoverData.metrics, false, popoverData.nodeId)
    }
  }, [popoverData?.nodeId, popoverData?.metrics, clearError, fetchMultipleHistogramData])

  // Drag handling
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

  // Reset dragged position when popover opens/closes
  useEffect(() => {
    if (!popoverData?.visible) {
      setDraggedPosition(null)
      setDragStartOffset(null)
    }
  }, [popoverData?.visible])

  // Fetch histogram data when popover opens
  useEffect(() => {
    if (popoverData?.visible && popoverData.nodeId && popoverData.metrics?.length > 0) {
      fetchMultipleHistogramData(popoverData.metrics, false, popoverData.nodeId)
    }
  }, [popoverData?.visible, popoverData?.nodeId, popoverData?.metrics, fetchMultipleHistogramData])

  // Don't render if popover is not visible
  if (!popoverData?.visible) {
    return null
  }

  const finalPosition = draggedPosition || {
    x: calculatedPosition?.x || popoverData.position.x,
    y: calculatedPosition?.y || popoverData.position.y
  }

  const containerStyle = {
    ...POPOVER_STYLES.container,
    left: finalPosition.x,
    top: finalPosition.y,
    transform: calculatedPosition?.transform || 'translate(0%, -50%)',
    transition: `all ${animationDuration}ms ease-out`
  }

  return (
    <div className="histogram-popover" style={containerStyle}>
      <div
        ref={containerRef}
        className="histogram-popover__container"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        {/* Header */}
        {renderHeader()}

        {/* Error display */}
        {error && (
          <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', margin: '8px 16px', borderRadius: '4px' }}>
            <div style={{ color: '#7f1d1d', fontSize: '14px' }}>{error}</div>
            <button
              onClick={handleRetry}
              style={{ padding: '4px 8px', fontSize: '12px', color: '#ef4444', background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', marginTop: '8px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div style={{ padding: '8px 16px', backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b', margin: '8px 16px', borderRadius: '4px' }}>
            {validationErrors.map((error, index) => (
              <div key={index} style={{ color: '#92400e', fontSize: '12px', marginBottom: '4px' }}>
                {error}
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 16px', color: '#6b7280' }}>
            <div style={{ width: '16px', height: '16px', border: '2px solid #e5e7eb', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}>
            </div>
            <span>Loading histogram...</span>
          </div>
        )}

        {/* Main visualization */}
        {layout && histogramData && !loading && !error && validationErrors.length === 0 && popoverData?.metrics && (
          <div style={CHART_STYLES.container}>
            {renderHistograms(layout, histogramData)}
          </div>
        )}
      </div>
    </div>
  )
}

export default HistogramPopover