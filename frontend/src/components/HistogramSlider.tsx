import React, { useRef, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { ErrorMessage } from './shared/ErrorMessage'
import { useDragHandler, useResizeObserver } from '../lib/utils'
import {
  calculateHistogramLayout,
  calculateThresholdLine,
  positionToValue,
  validateHistogramData,
  validateDimensions,
  HISTOGRAM_COLORS,
  SLIDER_TRACK,
  DEFAULT_ANIMATION
} from '../lib/d3-utils'
import type { MetricType } from '../types'

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

// ============================================================================
// MAIN HISTOGRAM SLIDER COMPONENT
// ============================================================================

export const HistogramSlider: React.FC<HistogramSliderProps> = React.memo(({
  width = 600,
  height = 300,
  className = '',
  showMetricSelector = true,
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  const data = useVisualizationStore(state => state.histogramData)
  const threshold = useVisualizationStore(state => state.hierarchicalThresholds.global_thresholds.semdist_mean)  // why semdist_mean?
  const metric = useVisualizationStore(state => state.currentMetric)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)
  const { setGlobalThresholds, setCurrentMetric, fetchHistogramData, clearError } = useVisualizationStore()

  // Custom hooks
  const { ref: containerRef, size: containerSize } = useResizeObserver({
    defaultWidth: width,
    defaultHeight: height
  })

  // Refs
  const svgRef = useRef<SVGSVGElement>(null)

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

  // Handle threshold change
  const handleThresholdChange = useCallback((newThreshold: number) => {
    if (!data) return

    const clampedThreshold = Math.max(
      data.statistics.min,
      Math.min(data.statistics.max, newThreshold)
    )

    setGlobalThresholds({ semdist_mean: clampedThreshold })
  }, [data, setGlobalThresholds])

  // Calculate new threshold value from mouse position
  const calculateThresholdFromEvent = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (!layout || !data) return null

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null

    const x = event.clientX - rect.left - layout.margin.left
    return positionToValue(
      x,
      data.statistics.min,
      data.statistics.max,
      layout.width
    )
  }, [layout, data])

  // Drag handler hook
  const { handleMouseDown: handleSliderMouseDown } = useDragHandler({
    onDragStart: (event) => {
      const newValue = calculateThresholdFromEvent(event as React.MouseEvent)
      if (newValue !== null) {
        handleThresholdChange(newValue)
      }
    },
    onDragMove: (event) => {
      const newValue = calculateThresholdFromEvent(event as MouseEvent)
      if (newValue !== null) {
        handleThresholdChange(newValue)
      }
    }
  })


  // Handle metric change
  const handleMetricChange = useCallback((newMetric: MetricType) => {
    setCurrentMetric(newMetric)
    // Histogram data will be fetched by useEffect in parent component
  }, [setCurrentMetric])

  // Handle retry
  const handleRetry = useCallback(() => {
    clearError('histogram')
    fetchHistogramData()
  }, [clearError, fetchHistogramData])

  return (
    <div className={`histogram-slider ${className}`}>
      {/* Header */}
      <div className="histogram-slider__header">
        <h3 className="histogram-slider__title">Distribution & Threshold</h3>
        {showMetricSelector && (
          <select
            value={metric}
            onChange={(e) => handleMetricChange(e.target.value as any)}
            disabled={loading}
            className="metric-selector"
          >
            <option value="semdist_mean">Semantic Distance</option>
            <option value="score_fuzz">Score Fuzz</option>
            <option value="feature_splitting">Feature Splitting</option>
          </select>
        )}
      </div>

      {/* Error display */}
      {error && (
        <ErrorMessage message={error} onRetry={handleRetry} />
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="histogram-slider__validation-errors">
          {validationErrors.map((error, index) => (
            <ErrorMessage key={index} message={error} showIcon={false} />
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="histogram-slider__loading">
          <div className="loading-spinner">⏳</div>
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
                        transition: `fill ${animationDuration}ms ease-out`
                      }}
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
                    tabIndex={-1}
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
                    tabIndex={-1}
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
    </div>
  )
})

HistogramSlider.displayName = 'HistogramSlider'

export default HistogramSlider