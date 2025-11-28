import React from 'react'
import { scaleLinear } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { HistogramData, HistogramChart, HistogramLayout, ThresholdLineData, PopoverPosition, PopoverSize, HistogramBin } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_HISTOGRAM_MARGIN = { top: 10, right: 15, bottom: 40, left: 50 }

const METRIC_TITLES: Record<string, string> = {
  score_detection: 'Detection Score',
  score_fuzz: 'Fuzz Score',
  score_simulation: 'Simulation Score',
  semantic_simialrity: 'Semantic Similarity',
  score_embedding: 'Embedding Score',
  decoder_similarity: 'Decoder Similarity'
}

// ============================================================================
// UTILS-SPECIFIC TYPES
// ============================================================================

interface HistogramBarData {
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

// Exported for use in components (TagAutomaticPanel, etc.)
export interface CategoryCounts {
  confirmed: number
  expanded: number
  rejected: number
  autoRejected: number
  unsure: number
}

interface CategoryBarSegment {
  x: number
  y: number
  width: number
  height: number
  color: string
  category: 'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure'
  count: number
  binIndex: number
}

interface AxisTickData {
  value: number
  position: number
  label: string
}

interface GridLineData {
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
 * Calculate layout for single histogram chart
 * @param customMargin - Optional custom margin to use instead of default
 */
export function calculateHistogramLayout(
  histogramDataMap: Record<string, HistogramData>,
  containerWidth: number,
  containerHeight: number,
  customMargin?: { top: number; right: number; bottom: number; left: number }
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
  const margin = customMargin || DEFAULT_HISTOGRAM_MARGIN

  // Single histogram layout only (multi-chart deprecated)
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
 * Calculate diverging histogram bars (red/green based on center value)
 * Used for similarity score histograms where values above center are "green" (positive)
 * and values below center are "red" (negative)
 */
export function calculateDivergingBars(
  chart: HistogramChart,
  centerValue: number = 0
): HistogramBarData[] {
  return chart.bins.map(bin => {
    const x = chart.xScale(bin.x0) as number
    const x1 = chart.xScale(bin.x1) as number
    const y = chart.yScale(bin.count) as number
    const binCenter = (bin.x0 + bin.x1) / 2

    return {
      x,
      y,
      width: Math.max(1, x1 - x - 1),
      height: chart.height - y,
      color: binCenter >= centerValue ? 'green' : 'red',
      binData: {
        x0: bin.x0,
        x1: bin.x1,
        count: bin.count
      }
    }
  })
}

/**
 * Calculate stacked category bars for histogram
 * Used to show distribution of selection categories (confirmed, expanded, rejected, autoRejected, unsure)
 * within each histogram bin with exact-height fills
 *
 * @param chart - The histogram chart with bins and scales
 * @param categoryData - Map of bin index to category counts
 * @param categoryColors - Colors for each category
 * @returns Array of bar segments, each representing a category within a bin
 */
export function calculateCategoryStackedBars(
  chart: HistogramChart,
  categoryData: Map<number, CategoryCounts>,
  categoryColors: {
    confirmed: string
    expanded: string
    rejected: string
    autoRejected: string
    unsure: string
  }
): CategoryBarSegment[] {
  const segments: CategoryBarSegment[] = []

  // Category stack order (bottom to top): confirmed → expanded → rejected → autoRejected → unsure
  const categoryOrder: Array<'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure'> = [
    'confirmed',
    'expanded',
    'rejected',
    'autoRejected',
    'unsure'
  ]

  chart.bins.forEach((bin, binIndex) => {
    const categories = categoryData.get(binIndex)
    if (!categories) return

    // Calculate total count for this bin
    const totalCount = categories.confirmed + categories.expanded + categories.rejected + categories.autoRejected + categories.unsure
    if (totalCount === 0) return

    // Calculate bar dimensions
    const x = chart.xScale(bin.x0) as number
    const x1 = chart.xScale(bin.x1) as number
    const barWidth = Math.max(1, x1 - x - 1)
    const maxBarHeight = chart.height - chart.yScale(bin.count)

    // Stack segments from bottom to top
    let yOffset = chart.yScale(bin.count)

    categoryOrder.forEach(category => {
      const count = categories[category]
      if (count > 0) {
        // Calculate exact height proportional to count
        const segmentHeight = (count / totalCount) * maxBarHeight

        segments.push({
          x,
          y: yOffset,
          width: barWidth,
          height: segmentHeight,
          color: categoryColors[category],
          category,
          count,
          binIndex
        })

        yOffset += segmentHeight
      }
    })
  })

  return segments
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
 * Calculate responsive popover size (single histogram only)
 */
export function calculateResponsivePopoverSize(
  defaultWidth: number,
  defaultHeight: number,
  _metricsCount: number = 1 // Deprecated parameter, kept for compatibility
): PopoverSize {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Apply viewport constraints (single histogram only)
  const width = Math.min(
    Math.max(420, defaultWidth),
    viewport.width * 0.9
  )

  const height = Math.min(
    Math.max(280, defaultHeight),
    viewport.height * 0.95
  )

  return { width, height }
}

// ============================================================================
// SIMPLE HISTOGRAM PANEL CALCULATIONS
// ============================================================================

/**
 * Calculate simple histogram panel elements (bars, grid, ticks)
 * Used by HistogramPanel component for basic visualization
 *
 * Note: Domain is now handled by backend via fixedDomain parameter.
 * The bin_edges from backend already reflect the correct domain.
 */
export function calculateSimpleHistogramPanel(
  data: HistogramData,
  innerWidth: number,
  innerHeight: number,
  barColor: string
) {
  const maxCount = Math.max(...data.histogram.counts, 1)

  // Use the bin edges from backend directly (already in correct domain)
  const domainMin = data.histogram.bin_edges[0]
  const domainMax = data.histogram.bin_edges[data.histogram.bin_edges.length - 1]
  const range = domainMax - domainMin

  // Bar calculations
  const bars = data.histogram.counts.map((count, i) => {
    const x0 = data.histogram.bin_edges[i]
    const x1 = data.histogram.bin_edges[i + 1]
    const x = range === 0 ? innerWidth / 2 : ((x0 - domainMin) / range) * innerWidth
    const x1Pos = range === 0 ? innerWidth / 2 : ((x1 - domainMin) / range) * innerWidth
    const y = innerHeight - (count / maxCount) * innerHeight
    return {
      x,
      y,
      width: Math.max(1, x1Pos - x - 1),
      height: innerHeight - y,
      color: barColor
    }
  })

  // Horizontal grid line calculations
  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const tick = (maxCount / 3) * i
    const y = innerHeight - (tick / maxCount) * innerHeight
    return { x1: 0, x2: innerWidth, y1: y, y2: y }
  })

  // X-axis tick calculations
  const xAxisTicks = Array.from({ length: 6 }, (_, i) => {
    const tick = domainMin + (range / 5) * i
    const pos = range === 0 ? innerWidth / 2 : ((tick - domainMin) / range) * innerWidth
    return { value: tick, position: pos }
  })

  // Vertical grid line calculations (aligned with x-axis ticks)
  const verticalGridLines = xAxisTicks.map(tick => ({
    x1: tick.position,
    x2: tick.position,
    y1: 0,
    y2: innerHeight
  }))

  return { bars, gridLines, verticalGridLines, xAxisTicks }
}

/**
 * Calculate simple histogram panel elements with fixed domain override
 * Used for score histograms that need a common 0-1.0 x-axis regardless of data range
 */
export function calculateSimpleHistogramPanelWithFixedDomain(
  data: HistogramData,
  innerWidth: number,
  innerHeight: number,
  barColor: string,
  fixedDomainMin: number = 0,
  fixedDomainMax: number = 1
) {
  const maxCount = Math.max(...data.histogram.counts, 1)

  // Use fixed domain for x-axis instead of data-derived domain
  const domainMin = fixedDomainMin
  const domainMax = fixedDomainMax
  const range = domainMax - domainMin

  // Bar calculations with fixed domain
  const bars = data.histogram.counts.map((count, i) => {
    const x0 = data.histogram.bin_edges[i]
    const x1 = data.histogram.bin_edges[i + 1]
    const x = range === 0 ? innerWidth / 2 : ((x0 - domainMin) / range) * innerWidth
    const x1Pos = range === 0 ? innerWidth / 2 : ((x1 - domainMin) / range) * innerWidth
    const y = innerHeight - (count / maxCount) * innerHeight
    return {
      x,
      y,
      width: Math.max(1, x1Pos - x - 1),
      height: innerHeight - y,
      color: barColor
    }
  })

  // Horizontal grid line calculations
  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const tick = (maxCount / 3) * i
    const y = innerHeight - (tick / maxCount) * innerHeight
    return { x1: 0, x2: innerWidth, y1: y, y2: y }
  })

  // X-axis tick calculations with fixed domain
  const xAxisTicks = Array.from({ length: 6 }, (_, i) => {
    const tick = domainMin + (range / 5) * i
    const pos = range === 0 ? innerWidth / 2 : ((tick - domainMin) / range) * innerWidth
    return { value: tick, position: pos }
  })

  // Vertical grid line calculations (aligned with x-axis ticks)
  const verticalGridLines = xAxisTicks.map(tick => ({
    x1: tick.position,
    x2: tick.position,
    y1: 0,
    y2: innerHeight
  }))

  return { bars, gridLines, verticalGridLines, xAxisTicks }
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

// ============================================================================
// HISTOGRAM SHADING (For Percentile-Based Thresholds)
// ============================================================================

/**
 * Shading region for a histogram bin
 */
export interface HistogramBinShading {
  binIndex: number
  regionIndex: number  // 0, 1, 2 for regions separated by 2 thresholds
  regionLabel: string  // "Below", "Between", "Above"
  opacity: number      // Opacity for shading (0.2, 0.5, 0.8)
}

/**
 * Generate shading data for histogram bins based on threshold positions.
 *
 * This creates visual regions in histograms that show which bins fall below,
 * between, or above threshold values when using percentile-based splitting.
 *
 * @param binEdges - Array of bin edge values [min, edge1, edge2, ..., max]
 * @param thresholds - Array of threshold values (typically 2 thresholds creating 3 regions)
 * @returns Array of shading metadata for each bin
 *
 * @example
 * // Bins: [0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0]
 * // Thresholds: [0.3, 0.7]
 * const shading = generateHistogramShading(
 *   [0, 0.2, 0.4, 0.6, 0.8, 1.0],
 *   [0.3, 0.7]
 * )
 * // Returns:
 * // [
 * //   {binIndex: 0, regionIndex: 0, regionLabel: "Below", opacity: 0.25},  // [0-0.2] below 0.3
 * //   {binIndex: 1, regionIndex: 1, regionLabel: "Between", opacity: 0.5}, // [0.2-0.4] spans threshold
 * //   {binIndex: 2, regionIndex: 1, regionLabel: "Between", opacity: 0.5}, // [0.4-0.6] between thresholds
 * //   {binIndex: 3, regionIndex: 2, regionLabel: "Above", opacity: 0.75},  // [0.6-0.8] spans threshold
 * //   {binIndex: 4, regionIndex: 2, regionLabel: "Above", opacity: 0.75}   // [0.8-1.0] above 0.7
 * // ]
 */
export function generateHistogramShading(
  binEdges: number[],
  thresholds: number[]
): HistogramBinShading[] {
  if (binEdges.length < 2 || thresholds.length === 0) {
    // No shading if no bins or no thresholds
    return []
  }

  const shadingData: HistogramBinShading[] = []
  const sortedThresholds = [...thresholds].sort((a, b) => a - b)

  // For each bin (binEdges.length - 1 bins)
  for (let i = 0; i < binEdges.length - 1; i++) {
    const binStart = binEdges[i]
    const binEnd = binEdges[i + 1]
    const binMidpoint = (binStart + binEnd) / 2

    // Determine which region this bin falls into
    let regionIndex = 0
    let regionLabel = "Below"
    let opacity = 0.25

    if (sortedThresholds.length >= 2) {
      // 2+ thresholds: 3+ regions
      if (binMidpoint < sortedThresholds[0]) {
        regionIndex = 0
        regionLabel = "Below"
        opacity = 0.25
      } else if (binMidpoint >= sortedThresholds[sortedThresholds.length - 1]) {
        regionIndex = sortedThresholds.length
        regionLabel = "Above"
        opacity = 0.75
      } else {
        // Between first and last threshold
        for (let t = 0; t < sortedThresholds.length - 1; t++) {
          if (binMidpoint >= sortedThresholds[t] && binMidpoint < sortedThresholds[t + 1]) {
            regionIndex = t + 1
            regionLabel = "Between"
            opacity = 0.5
            break
          }
        }
      }
    } else if (sortedThresholds.length === 1) {
      // 1 threshold: 2 regions
      if (binMidpoint < sortedThresholds[0]) {
        regionIndex = 0
        regionLabel = "Below"
        opacity = 0.25
      } else {
        regionIndex = 1
        regionLabel = "Above"
        opacity = 0.75
      }
    }

    shadingData.push({
      binIndex: i,
      regionIndex,
      regionLabel,
      opacity
    })
  }

  return shadingData
}

// ============================================================================
// BAR SEGMENT CALCULATION FOR SPLIT PATTERN RENDERING
// ============================================================================

export interface HistogramBarSegment {
  x: number          // X position of segment
  y: number          // Y position of segment
  width: number      // Width of segment
  height: number     // Height of segment
  patternIndex: number  // Which pattern to use (0, 1, or 2)
}

/**
 * Calculate bar segments for split pattern rendering.
 * When a threshold falls within a bar's range, split that bar into segments
 * with different patterns on either side of the threshold.
 *
 * @param bar - The histogram bar data
 * @param thresholds - Array of threshold values
 * @param xScale - D3 scale for converting metric values to pixel positions
 * @returns Array of bar segments, each with its own pattern
 */
export function calculateBarSegments(
  bar: HistogramBarData,
  thresholds: number[],
  xScale: ScaleLinear<number, number>
): HistogramBarSegment[] {
  const segments: HistogramBarSegment[] = []
  const sortedThresholds = [...thresholds].sort((a, b) => a - b)

  // Find thresholds that fall within this bar's range
  const binStart = bar.binData.x0
  const binEnd = bar.binData.x1
  const thresholdsInBin = sortedThresholds.filter(t => t > binStart && t < binEnd)

  if (thresholdsInBin.length === 0) {
    // No thresholds in this bar - return single segment
    // Determine which region this bar is in
    let patternIndex = 0
    if (sortedThresholds.length > 0) {
      patternIndex = sortedThresholds.findIndex(t => binStart < t)
      if (patternIndex === -1) patternIndex = sortedThresholds.length
    }

    return [{
      x: bar.x,
      y: bar.y,
      width: bar.width,
      height: bar.height,
      patternIndex: Math.min(patternIndex, 2)
    }]
  }

  // Split bar at each threshold within range
  const splitPoints = [binStart, ...thresholdsInBin, binEnd]

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const segmentStart = splitPoints[i]
    const segmentEnd = splitPoints[i + 1]
    const segmentMid = (segmentStart + segmentEnd) / 2

    // Calculate segment position and width
    const segmentX = xScale(segmentStart)
    const segmentWidth = xScale(segmentEnd) - segmentX

    // Determine pattern index for this segment
    let patternIndex = 0
    if (sortedThresholds.length > 0) {
      patternIndex = sortedThresholds.findIndex(t => segmentMid < t)
      if (patternIndex === -1) patternIndex = sortedThresholds.length
    }

    segments.push({
      x: bar.x + (segmentX - xScale(binStart)),
      y: bar.y,
      width: segmentWidth,
      height: bar.height,
      patternIndex: Math.min(patternIndex, 2)
    })
  }

  return segments
}

/**
 * Calculate bar segments for HORIZONTAL bars (Sankey node histograms).
 * For horizontal bars, the Y axis represents metric values and needs to be split.
 *
 * @param bar - The histogram bar data (horizontal orientation)
 * @param thresholds - Array of threshold values
 * @param yScale - D3 scale for converting metric values to vertical pixel positions
 * @returns Array of bar segments, each with its own pattern
 */
export function calculateHorizontalBarSegments(
  bar: any, // NodeHistogramBar type
  thresholds: number[],
  yScale: ScaleLinear<number, number>
): HistogramBarSegment[] {
  const segments: HistogramBarSegment[] = []
  const sortedThresholds = [...thresholds].sort((a, b) => a - b)

  // Find thresholds that fall within this bar's metric range
  const binStart = bar.binData.x0
  const binEnd = bar.binData.x1
  const thresholdsInBin = sortedThresholds.filter(t => t > binStart && t < binEnd)

  if (thresholdsInBin.length === 0) {
    // No thresholds in this bar - return single segment
    let patternIndex = 0
    if (sortedThresholds.length > 0) {
      patternIndex = sortedThresholds.findIndex(t => binStart < t)
      if (patternIndex === -1) patternIndex = sortedThresholds.length
    }

    return [{
      x: bar.x,
      y: bar.y,
      width: bar.width,
      height: bar.height,
      patternIndex: Math.min(patternIndex, 2)
    }]
  }

  // Split bar at each threshold within range (along Y axis for horizontal bars)
  const splitPoints = [binStart, ...thresholdsInBin, binEnd]

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const segmentStart = splitPoints[i]
    const segmentEnd = splitPoints[i + 1]
    const segmentMid = (segmentStart + segmentEnd) / 2

    // Calculate segment Y position and height (metric axis is vertical for horizontal bars)
    const segmentY = yScale(segmentStart)
    const segmentHeight = yScale(segmentEnd) - segmentY

    // Determine pattern index for this segment
    let patternIndex = 0
    if (sortedThresholds.length > 0) {
      patternIndex = sortedThresholds.findIndex(t => segmentMid < t)
      if (patternIndex === -1) patternIndex = sortedThresholds.length
    }

    segments.push({
      x: bar.x,  // Keep same X position (bar extends from node edge)
      y: bar.y + (segmentY - yScale(binStart)),  // Offset from bar's top
      width: bar.width,  // Keep full width (count doesn't change)
      height: segmentHeight,  // Split along height
      patternIndex: Math.min(patternIndex, 2)
    })
  }

  return segments
}