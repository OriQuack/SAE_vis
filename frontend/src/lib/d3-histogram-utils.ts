import { scaleLinear } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { HistogramData, HistogramChart, HistogramLayout, ThresholdLineData, PopoverPosition, PopoverSize, HistogramBin } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_HISTOGRAM_MARGIN = { top: 15, right: 25, bottom: 50, left: 45 }
const MULTI_HISTOGRAM_LAYOUT = { spacing: 10, chartTitleHeight: 20, chartMarginTop: 10, minChartHeight: 70 }

const METRIC_TITLES: Record<string, string> = {
  score_detection: 'Detection Score',
  score_fuzz: 'Fuzz Score',
  score_simulation: 'Simulation Score',
  semdist_mean: 'Semantic Distance (Mean)',
  semdist_max: 'Semantic Distance (Max)',
  score_embedding: 'Embedding Score',
  feature_splitting: 'Feature Splitting'
}

// ============================================================================
// TYPES
// ============================================================================

export interface HistogramBarData {
  x: number
  y: number
  width: number
  height: number
  color: string
  binData: {
    x0: number
    x1: number
    count: number
  }
}

export interface AxisTickData {
  value: number
  position: number
  label: string
}

export interface GridLineData {
  x1: number
  y1: number
  x2: number
  y2: number
  opacity: number
}

interface ChartDimensions {
  width: number
  height: number
  margin: typeof DEFAULT_HISTOGRAM_MARGIN
}

// ============================================================================
// HISTOGRAM LAYOUT CALCULATIONS
// ============================================================================

/**
 * Creates scales and bins for a single histogram chart
 */
function createHistogramChart(
  data: HistogramData,
  dimensions: ChartDimensions,
  metric: string,
  yOffset: number
): HistogramChart {
  const { width, height, margin } = dimensions

  // Create scales
  const xScale = scaleLinear()
    .domain([data.statistics.min, data.statistics.max])
    .range([0, width])

  const maxCount = max(data.histogram.counts) || 1
  const yScale = scaleLinear()
    .domain([0, maxCount])
    .range([height, 0])

  // Transform bins - single transformation logic
  const transformedBins: HistogramBin[] = data.histogram.counts.map((count, i) => ({
    x0: data.histogram.bin_edges[i],
    x1: data.histogram.bin_edges[i + 1],
    count,
    density: count / (data.total_features || 1)
  }))

  return {
    bins: transformedBins,
    xScale,
    yScale,
    width,
    height,
    margin,
    metric,
    yOffset,
    chartTitle: METRIC_TITLES[metric] || metric
  }
}

/**
 * Calculate layout for histogram charts (single or multiple)
 */
export function calculateHistogramLayout(
  histogramDataMap: Record<string, HistogramData>,
  containerWidth: number,
  containerHeight: number
): HistogramLayout {
  const metrics = Object.keys(histogramDataMap).sort()
  const metricsCount = metrics.length

  if (metricsCount === 0) {
    return {
      charts: [],
      totalWidth: containerWidth,
      totalHeight: containerHeight,
      spacing: 0
    }
  }

  const charts: HistogramChart[] = []
  const margin = DEFAULT_HISTOGRAM_MARGIN

  if (metricsCount === 1) {
    // Single histogram layout
    const dimensions: ChartDimensions = {
      width: containerWidth - margin.left - margin.right,
      height: containerHeight - margin.top - margin.bottom,
      margin
    }

    charts.push(
      createHistogramChart(
        histogramDataMap[metrics[0]],
        dimensions,
        metrics[0],
        margin.top
      )
    )

    return {
      charts,
      totalWidth: containerWidth,
      totalHeight: containerHeight,
      spacing: 0
    }
  }

  // Multi-histogram layout
  const spacing = MULTI_HISTOGRAM_LAYOUT.spacing
  const chartTitleHeight = MULTI_HISTOGRAM_LAYOUT.chartTitleHeight
  const sliderSpace = 35

  // Calculate dimensions for each chart
  const chartWidth = containerWidth - margin.left - margin.right
  const heightPerChart = chartTitleHeight + margin.top + MULTI_HISTOGRAM_LAYOUT.minChartHeight + margin.bottom + sliderSpace
  const totalSpacing = (metricsCount - 1) * spacing
  const requiredHeight = (metricsCount * heightPerChart) + totalSpacing

  const chartHeight = requiredHeight > containerHeight
    ? Math.max(
        MULTI_HISTOGRAM_LAYOUT.minChartHeight,
        (containerHeight - totalSpacing - metricsCount * (chartTitleHeight + margin.top + margin.bottom + sliderSpace)) / metricsCount
      )
    : MULTI_HISTOGRAM_LAYOUT.minChartHeight

  const dimensions: ChartDimensions = {
    width: chartWidth,
    height: chartHeight,
    margin
  }

  // Create charts with calculated offsets
  let currentYOffset = 0
  metrics.forEach(metric => {
    const yOffset = currentYOffset + chartTitleHeight + margin.top

    charts.push(
      createHistogramChart(
        histogramDataMap[metric],
        dimensions,
        metric,
        yOffset
      )
    )

    currentYOffset += chartTitleHeight + margin.top + chartHeight + margin.bottom + sliderSpace + spacing
  })

  return {
    charts,
    totalWidth: containerWidth,
    totalHeight: currentYOffset - spacing, // Remove extra spacing after last chart
    spacing
  }
}

// ============================================================================
// THRESHOLD CALCULATIONS
// ============================================================================

/**
 * Calculate threshold line position for a histogram chart
 */
export function calculateThresholdLine(
  threshold: number,
  chart: HistogramChart
): ThresholdLineData | null {
  if (!chart?.xScale) return null

  const x = chart.xScale(threshold) as number
  if (!Number.isFinite(x)) return null

  return {
    x,
    y1: 0,
    y2: chart.height,
    value: threshold
  }
}

/**
 * Convert mouse position to threshold value
 */
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

  // Clamp position and convert to value
  const ratio = Math.max(0, Math.min(1, x / chart.width))
  return minValue + ratio * (maxValue - minValue)
}

// ============================================================================
// RENDERING CALCULATIONS
// ============================================================================

/**
 * Calculate histogram bars data for rendering
 */
export function calculateHistogramBars(
  chart: HistogramChart,
  threshold: number,
  barColor: string,
  thresholdColor: string
): HistogramBarData[] {
  return chart.bins.map(bin => {
    const x = chart.xScale(bin.x0) as number
    const x1 = chart.xScale(bin.x1) as number
    const y = chart.yScale(bin.count) as number

    return {
      x,
      y,
      width: Math.max(1, x1 - x - 1),
      height: chart.height - y,
      color: bin.x0 >= threshold ? thresholdColor : barColor,
      binData: {
        x0: bin.x0,
        x1: bin.x1,
        count: bin.count
      }
    }
  })
}

/**
 * Calculate axis ticks for rendering
 */
export function calculateXAxisTicks(
  chart: HistogramChart,
  tickCount: number = 5
): AxisTickData[] {
  const scale = chart.xScale as ScaleLinear<number, number>
  return scale.ticks(tickCount).map(tick => ({
    value: tick,
    position: scale(tick),
    label: tick.toFixed(2)
  }))
}

export function calculateYAxisTicks(
  chart: HistogramChart,
  tickCount: number = 5
): AxisTickData[] {
  const scale = chart.yScale as ScaleLinear<number, number>
  return scale.ticks(tickCount).map(tick => ({
    value: tick,
    position: scale(tick),
    label: tick.toString()
  }))
}

/**
 * Calculate grid lines for histogram
 */
export function calculateGridLines(
  chart: HistogramChart,
  tickCount: number = 5
): GridLineData[] {
  const scale = chart.yScale as ScaleLinear<number, number>
  return scale.ticks(tickCount).map(tick => ({
    x1: 0,
    x2: chart.width,
    y1: scale(tick),
    y2: scale(tick),
    opacity: 0.5
  }))
}

/**
 * Calculate slider position from threshold value
 */
export function calculateSliderPosition(
  threshold: number,
  chart: HistogramChart,
  sliderTrackHeight: number,
  sliderTrackYOffset: number
): {
  trackFilledWidth: number
  trackUnfilledX: number
  trackUnfilledWidth: number
  handleCx: number
  handleCy: number
  trackY: number
} {
  const x = chart.xScale(threshold) as number

  return {
    trackFilledWidth: x,
    trackUnfilledX: x,
    trackUnfilledWidth: chart.width - x,
    handleCx: x,
    handleCy: sliderTrackHeight / 2,
    trackY: chart.height + sliderTrackYOffset
  }
}

// ============================================================================
// POPOVER UTILITIES
// ============================================================================

/**
 * Calculate optimal popover position within viewport
 */
export function calculateOptimalPopoverPosition(
  clickPosition: { x: number; y: number },
  popoverSize: { width: number; height: number },
  margin: number = 20
): PopoverPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Calculate bounded position
  const x = Math.max(
    margin,
    Math.min(clickPosition.x, viewport.width - popoverSize.width - margin)
  )

  const y = Math.max(
    margin,
    Math.min(clickPosition.y, viewport.height - popoverSize.height - margin)
  )

  return { x, y, transform: 'translate(0%, 0%)' }
}

/**
 * Calculate responsive popover size based on metrics count
 */
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
    // Calculate height for multi-histogram layout
    const chartComponents = {
      spacing: MULTI_HISTOGRAM_LAYOUT.spacing,
      chartTitleHeight: MULTI_HISTOGRAM_LAYOUT.chartTitleHeight,
      minChartHeight: MULTI_HISTOGRAM_LAYOUT.minChartHeight,
      margin: DEFAULT_HISTOGRAM_MARGIN,
      sliderArea: 35,
      headerHeight: 42,
      containerPadding: 12
    }

    const totalHeightPerChart =
      chartComponents.chartTitleHeight +
      chartComponents.margin.top +
      chartComponents.minChartHeight +
      chartComponents.margin.bottom +
      chartComponents.sliderArea

    const totalSpacing = (metricsCount - 1) * chartComponents.spacing

    adjustedHeight =
      chartComponents.headerHeight +
      chartComponents.containerPadding +
      (metricsCount * totalHeightPerChart) +
      totalSpacing
  }

  // Apply viewport constraints
  const width = Math.min(
    Math.max(420, defaultWidth),
    viewport.width * 0.9
  )

  const height = Math.min(
    metricsCount > 1 ? adjustedHeight : Math.max(280, defaultHeight),
    viewport.height * 0.95
  )

  return { width, height }
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format number for display with appropriate precision
 */
export function formatSmartNumber(value: number): string {
  const absValue = Math.abs(value)

  if (absValue < 0.001 && value !== 0) {
    return value.toExponential(2)
  }

  if (absValue < 1) {
    return value.toFixed(3)
  }

  return value.toFixed(2)
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate container dimensions
 */
export function validateDimensions(
  width: number,
  height: number
): string[] {
  const errors: string[] = []

  if (width < 200) {
    errors.push('Container width must be at least 200px')
  }
  if (height < 150) {
    errors.push('Container height must be at least 150px')
  }

  return errors
}

/**
 * Validate histogram data structure
 */
export function validateHistogramData(data: HistogramData): string[] {
  if (!data) {
    return ['Histogram data is required']
  }

  const errors: string[] = []

  if (!data.histogram?.bins || data.histogram.bins.length === 0) {
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

// ============================================================================
// DEPRECATED - Remove in next major version
// ============================================================================

/**
 * @deprecated Use calculateThresholdFromMouseEvent instead
 */
export function positionToValue(
  position: number,
  minValue: number,
  maxValue: number,
  width: number
): number {
  const ratio = Math.max(0, Math.min(1, position / width))
  return minValue + ratio * (maxValue - minValue)
}