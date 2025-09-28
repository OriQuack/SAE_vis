import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateHistogramLayout,
  calculateThresholdLine,
  validateHistogramData,
  validateDimensions,
  DEFAULT_ANIMATION,
  HISTOGRAM_COLORS,
  SLIDER_TRACK,
  formatSmartNumber,
  calculateOptimalPopoverPosition,
  calculateResponsivePopoverSize,
  calculateThresholdFromMouseEvent
} from '../lib/d3-histogram-utils'
import { getEffectiveThreshold } from '../lib/threshold-utils'
import type { HistogramData, HistogramLayout, HistogramChart } from '../types'

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
    flexShrink: 0,
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    msUserSelect: 'none' as const,
    MozUserSelect: 'none' as const
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
export const HistogramPopover = ({
  width = 520,
  height = 380,
  animationDuration = DEFAULT_ANIMATION.duration
}: HistogramPopoverProps) => {
  const popoverData = useVisualizationStore(state => state.popoverState.histogram)
  const panel = popoverData?.panel || 'left'
  const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'

  const histogramData = useVisualizationStore(state => state[panelKey].histogramData)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)

  const {
    hideHistogramPopover,
    fetchMultipleHistogramData,
    updateThreshold,  // New threshold tree action
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
    return calculateResponsivePopoverSize(width, height, popoverData?.metrics?.length || 1)
  }, [width, height, popoverData?.metrics?.length])

  // Calculate position
  const calculatedPosition = useMemo(() => {
    if (!popoverData?.visible || !popoverData?.position) return null
    return calculateOptimalPopoverPosition(popoverData.position, containerSize)
  }, [popoverData?.visible, popoverData?.position, containerSize])

  // ============================================================================
  // INLINE HEADER COMPONENT
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
  // THRESHOLD UTILITIES
  // ============================================================================
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
      const data = histogramData[metric]

      // Use the specific chart's width for position calculation
      const newValue = calculateThresholdFromMouseEvent(event, svgRef.current, chart, data.statistics.min, data.statistics.max)
      if (newValue === null) return

      const clampedValue = Math.max(data.statistics.min, Math.min(data.statistics.max, newValue))

      const panel = popoverData?.panel || 'left'
      const nodeId = popoverData?.nodeId

      if (!nodeId) {
        console.warn('No nodeId available for slider drag update')
        return
      }

      // For score nodes, update the individual threshold
      if (metric === 'score_fuzz' || metric === 'score_detection' || metric === 'score_simulation') {
        // Update the individual threshold for this specific metric
        updateThreshold(nodeId, [clampedValue], panel, metric)
      } else {
        // Single threshold update
        updateThreshold(nodeId, [clampedValue], panel)
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
  }, [isDraggingSlider, histogramData, updateThreshold, popoverData?.nodeId])

  const getEffectiveThresholdValue = useCallback((metric: string): number => {
    const panel = popoverData?.panel || 'left'
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    const thresholdTree = useVisualizationStore.getState()[panelKey].thresholdTree
    const nodeId = popoverData?.nodeId

    if (!nodeId || !thresholdTree) {
      // Fallback to histogram mean if no tree/node available
      if (histogramData?.[metric]) {
        return histogramData[metric].statistics.mean
      }
      return 0.5
    }

    const thresholdValue = getEffectiveThreshold(thresholdTree, nodeId, metric)

    if (typeof thresholdValue === 'number') {
      return thresholdValue
    }

    if (Array.isArray(thresholdValue)) {
      // If we get an array, use the first value
      return thresholdValue[0] || 0.5
    }

    // Final fallback to histogram mean
    if (histogramData?.[metric]) {
      return histogramData[metric].statistics.mean
    }
    return 0.5
  }, [histogramData, popoverData?.nodeId])

  // ============================================================================
  // UNIFIED HISTOGRAM RENDERING (SINGLE & MULTI-HISTOGRAM)
  // ============================================================================
  const renderHistograms = useCallback((layout: HistogramLayout, histogramData: Record<string, HistogramData>) => {
    if (!layout || !histogramData) return null

    return (
      <svg
        ref={svgRef}
        width={containerSize.width - 16}
        height={layout.totalHeight}
        style={{ display: 'block' }}
      >
        {/* Background */}
        <rect
          width={containerSize.width - 16}
          height={layout.totalHeight}
          fill={HISTOGRAM_COLORS.background}
        />

        {/* Render each histogram chart */}
        {layout.charts.map((chart: HistogramChart, _: number) => {
          const metric = chart.metric
          const data = histogramData[metric]
          const threshold = getEffectiveThresholdValue(metric)

          if (!data || !metric) return null

          const thresholdLine = calculateThresholdLine(threshold, chart)

          const handleThresholdChange = (newThreshold: number) => {
            const clampedThreshold = Math.max(data.statistics.min, Math.min(data.statistics.max, newThreshold))
            const panel = popoverData?.panel || 'left'
            const nodeId = popoverData?.nodeId

            if (!nodeId) {
              console.warn('No nodeId available for threshold update')
              return
            }

            // For score nodes, update the individual threshold
            if (metric === 'score_fuzz' || metric === 'score_detection' || metric === 'score_simulation') {
              // Update the individual threshold for this specific metric
              updateThreshold(nodeId, [clampedThreshold], panel, metric)
            } else {
              // Single threshold update
              updateThreshold(nodeId, [clampedThreshold], panel)
            }
          }

          const calculateThresholdFromEvent = (event: React.MouseEvent | MouseEvent) => {
            return calculateThresholdFromMouseEvent(event, svgRef.current, chart, data.statistics.min, data.statistics.max)
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
              {/* Grid lines for all histograms */}
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
                      strokeWidth={1}
                      style={{ transition: `fill ${animationDuration}ms ease-out` }}
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
                  strokeWidth={3}
                  style={{ cursor: 'pointer' }}
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

              {/* Chart title (for multi-histogram mode) */}
              {layout.charts.length > 1 && (
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

              {/* Threshold value (for multi-histogram mode) */}
              {(
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
              )}

              {/* Axes (for all histograms) */}
              {(
                <>
                  <g transform={`translate(0,${chart.height})`}>
                    <line x1={0} x2={chart.width} y1={0} y2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                    {chart.xScale.ticks(5).map((tick: number) => (
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
                    {chart.yScale.ticks(5).map((tick: number) => (
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
  }, [containerSize, animationDuration, getEffectiveThresholdValue, updateThreshold, setIsDraggingSlider, draggingMetricRef, popoverData?.nodeId])

  // ============================================================================
  // THRESHOLD MANAGEMENT
  // ============================================================================
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
    // For multi-histogram, give more generous height to prevent cutting off
    const metricsCount = popoverData.metrics.length
    let chartHeight = containerSize.height - 64

    if (metricsCount > 1) {
      // Calculate the exact height needed for multi-histogram with updated constants
      const spacing = 12
      const chartTitleHeight = 24
      const minChartHeight = 80
      const chartMargin = { top: 15, bottom: 40 }
      const sliderSpace = 40

      const requiredHeightPerChart = chartTitleHeight + chartMargin.top + minChartHeight + chartMargin.bottom + sliderSpace
      const totalSpacing = (metricsCount - 1) * spacing
      const minimumChartHeight = (metricsCount * requiredHeightPerChart) + totalSpacing

      // Use the larger of calculated minimum or available space
      chartHeight = Math.max(chartHeight, minimumChartHeight)
    }

    return calculateHistogramLayout(histogramData, chartWidth, chartHeight)
  }, [histogramData, containerSize, validationErrors, popoverData?.metrics])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId && popoverData?.metrics) {
      clearError('histogram')
      const panel = popoverData.panel || 'left'
      fetchMultipleHistogramData(popoverData.metrics, popoverData.nodeId, panel)
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

  // Handle click outside to close popover
  useEffect(() => {
    if (!popoverData?.visible) return

    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if currently dragging a slider
      if (isDraggingSlider) return

      // Don't close if clicking on interactive elements
      const target = event.target as HTMLElement
      if (target.closest('circle') || target.closest('rect[style*="cursor: pointer"]')) {
        return
      }

      if (containerRef.current && !containerRef.current.contains(target)) {
        hideHistogramPopover()
      }
    }

    // Add event listener with a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mouseup', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mouseup', handleClickOutside)
    }
  }, [popoverData?.visible, isDraggingSlider]) // Removed hideHistogramPopover dependency

  // Fetch histogram data when popover opens
  useEffect(() => {
    if (popoverData?.visible && popoverData.nodeId && popoverData.metrics?.length > 0) {
      const panel = popoverData.panel || 'left'
      fetchMultipleHistogramData(popoverData.metrics, popoverData.nodeId, panel)
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