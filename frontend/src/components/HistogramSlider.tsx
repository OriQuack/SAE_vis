import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import {
  calculateHistogramLayout,
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
import type { MetricType, TooltipData } from '../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface HistogramSliderProps {
  width?: number
  height?: number
  className?: string
  showMetricSelector?: boolean
  animationDuration?: number
}

interface TooltipProps {
  data: TooltipData | null
  visible: boolean
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

const Tooltip: React.FC<TooltipProps> = ({ data, visible }) => {
  if (!visible || !data) return null

  return (
    <div
      className="histogram-tooltip"
      style={{
        position: 'absolute',
        left: data.x + 10,
        top: data.y - 10,
        transform: 'translateY(-100%)',
        pointerEvents: 'none',
        zIndex: 1000
      }}
    >
      <div className="histogram-tooltip__content">
        <div className="histogram-tooltip__title">{data.title}</div>
        <div className="histogram-tooltip__body">
          {data.content.map((item: { label: string; value: string | number }, index: number) => (
            <div key={index} className="histogram-tooltip__row">
              <span className="histogram-tooltip__label">{item.label}:</span>
              <span className="histogram-tooltip__value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// METRIC SELECTOR COMPONENT
// ============================================================================

const MetricSelector: React.FC<{
  currentMetric: MetricType
  onChange: (metric: MetricType) => void
  disabled?: boolean
}> = ({ currentMetric, onChange, disabled = false }) => {
  const metrics: Array<{ value: MetricType; label: string }> = [
    { value: 'semdist_mean', label: 'Semantic Distance (Mean)' },
    { value: 'semdist_max', label: 'Semantic Distance (Max)' },
    { value: 'score_fuzz', label: 'Fuzz Score' },
    { value: 'score_simulation', label: 'Simulation Score' },
    { value: 'score_detection', label: 'Detection Score' },
    { value: 'score_embedding', label: 'Embedding Score' }
  ]

  return (
    <div className="metric-selector">
      <label className="metric-selector__label">Metric:</label>
      <select
        className="metric-selector__select"
        value={currentMetric}
        onChange={(e) => onChange(e.target.value as MetricType)}
        disabled={disabled}
      >
        {metrics.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ============================================================================
// MAIN HISTOGRAM SLIDER COMPONENT
// ============================================================================

export const HistogramSlider: React.FC<HistogramSliderProps> = ({
  width = 600,
  height = 300,
  className = '',
  showMetricSelector = true,
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  const data = useVisualizationStore(state => state.histogramData)
  const threshold = useVisualizationStore(state => state.thresholds.semdist_mean)
  const metric = useVisualizationStore(state => state.currentMetric)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)
  const { setThresholds, setCurrentMetric, fetchHistogramData, clearError } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDraggingRef = useRef(false)

  // Local state
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [containerSize, setContainerSize] = useState({ width, height })

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (data) {
      errors.push(...validateHistogramData(data))
    }

    errors.push(...validateDimensions(containerSize.width, containerSize.height))

    return errors
  }, [data, containerSize])

  // Calculate layout
  const layout = useMemo(() => {
    if (!data || validationErrors.length > 0) return null
    return calculateHistogramLayout(data, containerSize.width, containerSize.height)
  }, [data, containerSize, validationErrors])

  // Calculate threshold line
  const thresholdLine = useMemo(() => {
    if (!layout) return null
    return calculateThresholdLine(threshold, layout)
  }, [layout, threshold])

  // Handle container resize
  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setContainerSize({
        width: rect.width || width,
        height: rect.height || height
      })
    }
  }, [width, height])

  // Set up resize observer
  useEffect(() => {
    handleResize()

    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [handleResize])

  // Handle threshold change
  const handleThresholdChange = useCallback((newThreshold: number) => {
    if (!data) return

    const clampedThreshold = Math.max(
      data.statistics.min,
      Math.min(data.statistics.max, newThreshold)
    )

    setThresholds({ semdist_mean: clampedThreshold })
    // Sankey data will be fetched by useEffect in parent component
  }, [data, setThresholds])

  // Handle slider mouse events
  const handleSliderMouseDown = useCallback((event: React.MouseEvent) => {
    if (!layout || !data) return

    event.preventDefault()
    isDraggingRef.current = true

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = event.clientX - rect.left - layout.margin.left
    const newValue = positionToValue(
      x,
      data.statistics.min,
      data.statistics.max,
      layout.width
    )

    handleThresholdChange(newValue)
  }, [layout, data, handleThresholdChange])

  const handleSliderMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current || !layout || !data) return

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = event.clientX - rect.left - layout.margin.left
    const newValue = positionToValue(
      x,
      data.statistics.min,
      data.statistics.max,
      layout.width
    )

    handleThresholdChange(newValue)
  }, [layout, data, handleThresholdChange])

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
    if (!layout || !data) return

    const bin = layout.bins[binIndex]
    const rect = event.currentTarget.getBoundingClientRect()

    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      title: `Bin ${binIndex + 1}`,
      content: formatTooltipContent(bin, threshold)
    })
    setShowTooltip(true)
  }, [layout, data, threshold])

  const handleBarLeave = useCallback(() => {
    setShowTooltip(false)
  }, [])

  // Handle threshold line hover
  const handleThresholdHover = useCallback((event: React.MouseEvent) => {
    if (!data) return

    const rect = event.currentTarget.getBoundingClientRect()

    setTooltip({
      x: rect.left,
      y: rect.top,
      title: 'Threshold',
      content: formatThresholdTooltip(threshold, data.statistics)
    })
    setShowTooltip(true)
  }, [data, threshold])

  // Handle metric change
  const handleMetricChange = useCallback((newMetric: MetricType) => {
    setCurrentMetric(newMetric)
    // Histogram data will be fetched by useEffect in parent component
  }, [setCurrentMetric])

  // Handle retry
  const handleRetry = useCallback(() => {
    clearError('histogram')
    fetchHistogramData()
  }, [clearError])

  return (
    <div className={`histogram-slider ${className}`}>
      {/* Header */}
      <div className="histogram-slider__header">
        <h3 className="histogram-slider__title">Distribution & Threshold</h3>
        {showMetricSelector && (
          <MetricSelector
            currentMetric={metric}
            onChange={handleMetricChange}
            disabled={loading}
          />
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="histogram-slider__error">
          <span className="histogram-slider__error-icon">⚠️</span>
          <span className="histogram-slider__error-text">{error}</span>
          <button className="histogram-slider__retry" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="histogram-slider__validation-errors">
          {validationErrors.map((error, index) => (
            <div key={index} className="histogram-slider__validation-error">
              {error}
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="histogram-slider__loading">
          <div className="histogram-slider__loading-spinner" />
          <span>Loading histogram data...</span>
        </div>
      )}

      {/* Main visualization */}
      {layout && data && !loading && !error && validationErrors.length === 0 && (
        <div
          ref={containerRef}
          className="histogram-slider__container"
          style={{ width: '100%', height: containerSize.height }}
        >
          <svg
            ref={svgRef}
            width={containerSize.width}
            height={containerSize.height}
            className="histogram-slider__svg"
          >
            {/* Background */}
            <rect
              width={containerSize.width}
              height={containerSize.height}
              fill={HISTOGRAM_COLORS.background}
            />

            {/* Chart area */}
            <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
              {/* Grid lines */}
              <g className="histogram-slider__grid">
                {layout.yScale.ticks(5).map(tick => (
                  <line
                    key={tick}
                    x1={0}
                    x2={layout.width}
                    y1={layout.yScale(tick) as number}
                    y2={layout.yScale(tick) as number}
                    stroke={HISTOGRAM_COLORS.grid}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                ))}
              </g>

              {/* Histogram bars */}
              <g className="histogram-slider__bars">
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
                      aria-label={`Bin ${index + 1}: ${bin.count} features`}
                    />
                  )
                })}
              </g>

              {/* Threshold line in histogram */}
              {thresholdLine && (
                <g className="histogram-slider__threshold">
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
                <g className="histogram-slider__slider-track" transform={`translate(0, ${layout.height + SLIDER_TRACK.yOffset})`}>
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

              {/* Threshold value display at bottom right */}
              {thresholdLine && (
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
              )}

              {/* X-axis */}
              <g className="histogram-slider__x-axis" transform={`translate(0,${layout.height})`}>
                <line
                  x1={0}
                  x2={layout.width}
                  y1={0}
                  y2={0}
                  stroke={HISTOGRAM_COLORS.axis}
                  strokeWidth={1}
                />
                {layout.xScale.ticks(5).map(tick => (
                  <g key={tick} transform={`translate(${layout.xScale(tick)},0)`}>
                    <line y1={0} y2={6} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                    <text
                      y={20}
                      textAnchor="middle"
                      fontSize={12}
                      fill={HISTOGRAM_COLORS.text}
                    >
                      {tick.toFixed(2)}
                    </text>
                  </g>
                ))}
              </g>

              {/* Y-axis */}
              <g className="histogram-slider__y-axis">
                <line
                  x1={0}
                  x2={0}
                  y1={0}
                  y2={layout.height}
                  stroke={HISTOGRAM_COLORS.axis}
                  strokeWidth={1}
                />
                {layout.yScale.ticks(5).map(tick => (
                  <g key={tick} transform={`translate(0,${layout.yScale(tick)})`}>
                    <line x1={-6} x2={0} stroke={HISTOGRAM_COLORS.axis} strokeWidth={1} />
                    <text
                      x={-10}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={12}
                      fill={HISTOGRAM_COLORS.text}
                    >
                      {tick}
                    </text>
                  </g>
                ))}
              </g>

              {/* Axis labels */}
              <text
                x={layout.width / 2}
                y={layout.height + 35}
                textAnchor="middle"
                fontSize={14}
                fill={HISTOGRAM_COLORS.text}
                fontWeight="500"
              >
                {metric.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </text>
              <text
                x={-layout.height / 2}
                y={-30}
                textAnchor="middle"
                fontSize={14}
                fill={HISTOGRAM_COLORS.text}
                fontWeight="500"
                transform={`rotate(-90, -${layout.height / 2}, -30)`}
              >
                Feature Count
              </text>
            </g>
          </svg>
        </div>
      )}


      {/* Tooltip */}
      <Tooltip data={tooltip} visible={showTooltip} />
    </div>
  )
}

export default HistogramSlider