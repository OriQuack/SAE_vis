import React, { useMemo, useCallback, useRef } from 'react'
import { useDragHandler } from '../../hooks'
import {
  calculateThresholdLine,
  positionToValue,
  HISTOGRAM_COLORS,
  SLIDER_TRACK
} from '../../utils/d3-helpers'
import { formatSmartNumber } from '../../utils/formatters'
import type { HistogramData, IndividualHistogramLayout } from '../../services/types'

interface IndividualHistogramProps {
  layout: IndividualHistogramLayout
  histogramData: HistogramData
  threshold: number
  animationDuration: number
  onThresholdChange: (metric: string, threshold: number) => void
  parentSvgRef: React.RefObject<SVGSVGElement>
}

export const IndividualHistogram: React.FC<IndividualHistogramProps> = React.memo(({
  layout,
  histogramData,
  threshold,
  animationDuration,
  onThresholdChange,
  parentSvgRef
}) => {
  // Create a ref for this specific histogram group
  const histogramGroupRef = useRef<SVGGElement>(null)
  const thresholdLine = useMemo(() => {
    return calculateThresholdLine(threshold, layout)
  }, [threshold, layout])

  const handleThresholdChange = useCallback((newThreshold: number) => {
    const clampedThreshold = Math.max(
      histogramData.statistics.min,
      Math.min(histogramData.statistics.max, newThreshold)
    )
    onThresholdChange(layout.metric, clampedThreshold)
  }, [histogramData, layout.metric, onThresholdChange])

  const calculateThresholdFromEvent = useCallback((event: React.MouseEvent | MouseEvent) => {
    const histogramRect = histogramGroupRef.current?.getBoundingClientRect()
    if (!histogramRect) return null

    // Calculate x position relative to this specific histogram's chart area
    const x = event.clientX - histogramRect.left - layout.margin.left
    return positionToValue(
      x,
      histogramData.statistics.min,
      histogramData.statistics.max,
      layout.width
    )
  }, [layout, histogramData])

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


  return (
    <g ref={histogramGroupRef} transform={`translate(0,${layout.yOffset})`} className="individual-histogram">
      {/* Chart title */}
      <text
        x={(layout.width + layout.margin.left + layout.margin.right) / 2}
        y={12}
        textAnchor="middle"
        fontSize={14}
        fontWeight="600"
        fill="#1f2937"
        className="individual-histogram__title"
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
                {formatSmartNumber(tick)}
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
          className="individual-histogram__threshold-value"
        >
          Threshold: {formatSmartNumber(threshold)}
        </text>
      </g>
    </g>
  )
})

IndividualHistogram.displayName = 'IndividualHistogram'

export default IndividualHistogram