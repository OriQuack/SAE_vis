import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { HistogramData } from '../types'

// ============================================================================
// TYPES
// ============================================================================

export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

export interface HistogramChart {
  bins: HistogramBin[]
  xScale: ReturnType<typeof scaleLinear>
  yScale: ReturnType<typeof scaleLinear>
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  metric: string
  yOffset: number
  chartTitle: string
}

export interface HistogramLayout {
  charts: HistogramChart[]
  totalWidth: number
  totalHeight: number
  spacing: number
}

export interface ThresholdLineData {
  x: number
  y1: number
  y2: number
  value: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_ANIMATION = {
  duration: 300,
  easing: 'ease-out'
}

export const HISTOGRAM_COLORS = {
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
}

export const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,
  cornerRadius: 3
}

const DEFAULT_HISTOGRAM_MARGIN = { top: 20, right: 30, bottom: 70, left: 50 }
const MULTI_HISTOGRAM_LAYOUT = { spacing: 12, chartTitleHeight: 24, chartMarginTop: 12, minChartHeight: 80 }

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
    // Multi-histogram layout
    const availableHeight = containerHeight - (metricsCount - 1) * spacing
    const chartHeight = Math.max(MULTI_HISTOGRAM_LAYOUT.minChartHeight, availableHeight / metricsCount)

    const chartMargin = { top: 15, right: 30, bottom: 40, left: 50 }
    const chartWidth = containerWidth - chartMargin.left - chartMargin.right

    metrics.forEach((metric) => {
      const data = histogramDataMap[metric]

      const xScale = scaleLinear()
        .domain([data.statistics.min, data.statistics.max])
        .range([0, chartWidth])

      const maxCount = max(data.histogram.counts) || 1
      const yScale = scaleLinear()
        .domain([0, maxCount])
        .range([chartHeight - chartMargin.top - chartMargin.bottom, 0])

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
        width: chartWidth,
        height: chartHeight - chartMargin.top - chartMargin.bottom,
        margin: chartMargin,
        metric,
        yOffset: currentYOffset + chartMargin.top + MULTI_HISTOGRAM_LAYOUT.chartTitleHeight,
        chartTitle: METRIC_TITLES[metric] || metric
      })

      // Account for slider space: SLIDER_TRACK.yOffset (30) + handle radius (10) + padding (10) = 50px
      const sliderSpace = 50
      currentYOffset += chartHeight + spacing + sliderSpace
    })
  }

  // For multi-histogram, add slider space to total height
  const finalTotalHeight = metricsCount > 1
    ? currentYOffset + 50  // Add slider space for the last chart
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