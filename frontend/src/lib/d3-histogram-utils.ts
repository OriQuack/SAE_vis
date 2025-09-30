import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { HistogramData, HistogramChart, HistogramLayout, ThresholdLineData, PopoverPosition, PopoverSize } from '../types'
import { DEFAULT_HISTOGRAM_MARGIN, MULTI_HISTOGRAM_LAYOUT, METRIC_TITLES } from './constants'

// ============================================================================
// HISTOGRAM UTILITIES
// ============================================================================

export function calculateHistogramLayout(
  histogramDataMap: Record<string, HistogramData>,
  containerWidth: number,
  containerHeight: number
): HistogramLayout {
  const metrics = Object.keys(histogramDataMap).sort()
  const metricsCount = metrics.length

  if (metricsCount === 0) {
    return { charts: [], totalWidth: containerWidth, totalHeight: containerHeight, spacing: 0 }
  }

  const charts: HistogramChart[] = []
  const spacing = MULTI_HISTOGRAM_LAYOUT.spacing
  let currentYOffset = 0

  if (metricsCount === 1) {
    // Single histogram - use full container
    const metric = metrics[0]
    const data = histogramDataMap[metric]
    const margin = DEFAULT_HISTOGRAM_MARGIN

    const width = containerWidth - margin.left - margin.right
    const height = containerHeight - margin.top - margin.bottom

    const xScale = scaleLinear()
      .domain([data.statistics.min, data.statistics.max])
      .range([0, width])

    const maxCount = max(data.histogram.counts) || 1
    const yScale = scaleLinear()
      .domain([0, maxCount])
      .range([height, 0])

    // Transform API histogram format to expected HistogramBin format
    const transformedBins = data.histogram.counts.map((count, i) => ({
      x0: data.histogram.bin_edges[i],
      x1: data.histogram.bin_edges[i + 1],
      count: count,
      density: count / (data.total_features || 1)
    }))

    charts.push({
      bins: transformedBins,
      xScale,
      yScale,
      width,
      height,
      margin,
      metric,
      yOffset: margin.top,
      chartTitle: METRIC_TITLES[metric] || metric
    })

  } else {
    // Multi-histogram layout - use consistent margins
    const chartMargin = { ...DEFAULT_HISTOGRAM_MARGIN }
    const chartWidth = containerWidth - chartMargin.left - chartMargin.right

    // Calculate chart height based on available space
    const chartTitleHeight = MULTI_HISTOGRAM_LAYOUT.chartTitleHeight
    const sliderSpace = 35  // Space for slider below chart

    // Each chart needs: title + top margin + chart + bottom margin + slider
    const heightPerChart = chartTitleHeight + chartMargin.top + MULTI_HISTOGRAM_LAYOUT.minChartHeight + chartMargin.bottom + sliderSpace
    const totalSpacing = (metricsCount - 1) * spacing

    // Calculate if we need to adjust based on container
    const requiredHeight = (metricsCount * heightPerChart) + totalSpacing
    const chartHeight = requiredHeight > containerHeight
      ? Math.max(MULTI_HISTOGRAM_LAYOUT.minChartHeight, (containerHeight - totalSpacing - metricsCount * (chartTitleHeight + chartMargin.top + chartMargin.bottom + sliderSpace)) / metricsCount)
      : MULTI_HISTOGRAM_LAYOUT.minChartHeight

    metrics.forEach((metric) => {
      const data = histogramDataMap[metric]

      const xScale = scaleLinear()
        .domain([data.statistics.min, data.statistics.max])
        .range([0, chartWidth])

      const maxCount = max(data.histogram.counts) || 1
      const yScale = scaleLinear()
        .domain([0, maxCount])
        .range([chartHeight, 0])

      // Transform API histogram format to expected HistogramBin format
      const transformedBins = data.histogram.counts.map((count, i) => ({
        x0: data.histogram.bin_edges[i],
        x1: data.histogram.bin_edges[i + 1],
        count: count,
        density: count / (data.total_features || 1)
      }))

      // Calculate yOffset: currentYOffset + title height + top margin
      const yOffset = currentYOffset + chartTitleHeight + chartMargin.top

      charts.push({
        bins: transformedBins,
        xScale,
        yScale,
        width: chartWidth,
        height: chartHeight,
        margin: chartMargin,
        metric,
        yOffset,
        chartTitle: METRIC_TITLES[metric] || metric
      })

      // Move to next chart position
      currentYOffset += chartTitleHeight + chartMargin.top + chartHeight + chartMargin.bottom + sliderSpace + spacing
    })
  }

  // Calculate final total height
  const finalTotalHeight = metricsCount > 1
    ? currentYOffset - spacing  // Remove extra spacing after last chart
    : containerHeight

  return {
    charts,
    totalWidth: containerWidth,
    totalHeight: finalTotalHeight,
    spacing
  }
}

export function calculateThresholdLine(threshold: number, chart: HistogramChart): ThresholdLineData | null {
  if (!chart || !chart.xScale) return null

  const x = chart.xScale(threshold) as number
  if (typeof x !== 'number' || isNaN(x)) return null

  return {
    x,
    y1: 0,
    y2: chart.height,
    value: threshold
  }
}

// ============================================================================
// SLIDER UTILITIES
// ============================================================================

export function positionToValue(
  position: number,
  minValue: number,
  maxValue: number,
  width: number
): number {
  const ratio = Math.max(0, Math.min(1, position / width))
  return minValue + ratio * (maxValue - minValue)
}

export function valueToPosition(
  value: number,
  minValue: number,
  maxValue: number,
  width: number
): number {
  const ratio = (value - minValue) / (maxValue - minValue)
  return Math.max(0, Math.min(width, ratio * width))
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatSmartNumber(value: number): string {
  if (Math.abs(value) < 0.001 && value !== 0) {
    return value.toExponential(2)
  }

  if (Math.abs(value) < 1) {
    return value.toFixed(3)
  }

  return value.toFixed(2)
}

// ============================================================================
// POPOVER POSITIONING UTILITIES
// ============================================================================

export function calculateOptimalPopoverPosition(
  clickPosition: { x: number, y: number },
  popoverSize: { width: number, height: number },
  margin: number = 20
): PopoverPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // For tall popovers, position at top instead of center
  let x = clickPosition.x
  let y = clickPosition.y
  let transform = 'translate(0%, 0%)'  // Start at top-left by default

  // If popover would go off bottom, adjust y position
  if (y + popoverSize.height > viewport.height - margin) {
    // Position so bottom edge is at viewport bottom - margin
    y = viewport.height - popoverSize.height - margin
  }

  // If still would go off top, position at top margin
  if (y < margin) {
    y = margin
  }

  // Ensure the popover fits horizontally on screen
  if (x + popoverSize.width > viewport.width - margin) {
    x = viewport.width - popoverSize.width - margin
  }

  // Ensure doesn't go off left edge
  if (x < margin) {
    x = margin
  }

  return { x, y, transform }
}

export function calculateResponsivePopoverSize(
  defaultWidth: number,
  defaultHeight: number,
  metricsCount: number = 1
): PopoverSize {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  let adjustedHeight = defaultHeight

  if (metricsCount > 1) {
    // Match the exact logic from calculateHistogramLayout
    // Constants from multi-histogram layout (smaller, more compact):
    const spacing = 10  // MULTI_HISTOGRAM_LAYOUT.spacing
    const chartTitleHeight = 20  // MULTI_HISTOGRAM_LAYOUT.chartTitleHeight
    const minChartHeight = 70  // MULTI_HISTOGRAM_LAYOUT.minChartHeight
    const chartMargin = { top: 15, right: 25, bottom: 50, left: 45 }  // compact margins

    // Each chart needs:
    // - chartTitleHeight + chartMargin.top at the top
    // - minChartHeight for the actual chart
    // - chartMargin.bottom at the bottom
    // - sliderArea below that
    const sliderArea = 35  // Space for slider track and handle below chart

    // Calculate the height each chart needs in total
    const totalHeightPerChart = chartTitleHeight + chartMargin.top + minChartHeight + chartMargin.bottom + sliderArea

    // Total spacing between charts
    const totalSpacing = (metricsCount - 1) * spacing

    // Header and container padding
    const headerHeight = 42
    const containerPadding = 12

    // Calculate required container height
    // The calculateHistogramLayout logic expects containerHeight to accommodate:
    // For each chart: yOffset (includes title + top margin) + chartHeight + bottom margin + slider
    adjustedHeight = headerHeight + containerPadding + (metricsCount * totalHeightPerChart) + totalSpacing
  }

  const maxWidth = Math.min(defaultWidth, viewport.width * 0.9)
  // Use calculated height without artificial constraints to eliminate scrolling
  const maxHeight = Math.min(adjustedHeight, viewport.height * 0.95)  // Only prevent going off screen

  const minWidth = Math.max(420, maxWidth)
  // For multi-histogram, use the exact calculated height to fit all content
  const minHeight = metricsCount > 1 ? adjustedHeight : Math.max(280, maxHeight)

  return { width: minWidth, height: Math.min(minHeight, viewport.height * 0.95) }
}

// ============================================================================
// MOUSE EVENT UTILITIES
// ============================================================================

export function calculateThresholdFromMouseEvent(
  event: MouseEvent | React.MouseEvent,
  svgElement: SVGSVGElement | null,
  chart: HistogramChart,
  minValue: number,
  maxValue: number
): number | null {
  if (!svgElement) return null

  const rect = svgElement.getBoundingClientRect()
  const x = event.clientX - rect.left - chart.margin.left

  return positionToValue(x, minValue, maxValue, chart.width)
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function validateDimensions(width: number, height: number): string[] {
  const errors: string[] = []

  if (width < 200) {
    errors.push('Container width must be at least 200px')
  }
  if (height < 150) {
    errors.push('Container height must be at least 150px')
  }

  return errors
}

export function validateHistogramData(data: HistogramData): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('Histogram data is required')
    return errors
  }

  if (!data.histogram || !data.histogram.bins || data.histogram.bins.length === 0) {
    errors.push('Histogram data must contain bins')
  }

  if (!data.statistics) {
    errors.push('Histogram data must contain statistics')
  } else {
    if (typeof data.statistics.min !== 'number') {
      errors.push('Histogram statistics must include min value')
    }
    if (typeof data.statistics.max !== 'number') {
      errors.push('Histogram statistics must include max value')
    }
  }

  return errors
}