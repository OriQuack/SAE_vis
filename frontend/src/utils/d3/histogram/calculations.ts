// Histogram calculation utilities with performance optimizations

import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import { formatMetricTitle } from './formatters'
import { DEFAULT_HISTOGRAM_MARGIN, MULTI_HISTOGRAM_LAYOUT, HISTOGRAM_CACHE_CONFIG } from './constants'
import type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  HistogramLayoutCacheEntry,
  MultiHistogramLayoutCacheEntry,
  HistogramData,
  ThresholdLineData
} from './types'

// Memoization caches
const histogramLayoutCache = new Map<string, HistogramLayoutCacheEntry>()
const multiHistogramLayoutCache = new Map<string, MultiHistogramLayoutCacheEntry>()

/**
 * Create cache key for histogram layout
 */
function createHistogramCacheKey(
  data: HistogramData,
  containerWidth: number,
  containerHeight: number
): string {
  return `${data.metric}_${containerWidth}_${containerHeight}_${data.total_features}_${data.statistics.min}_${data.statistics.max}`
}

/**
 * Create cache key for multi-histogram layout
 */
function createMultiHistogramCacheKey(
  metrics: string[],
  containerWidth: number,
  containerHeight: number,
  dataHashes: string[]
): string {
  return `multi_${metrics.join('_')}_${containerWidth}_${containerHeight}_${dataHashes.join('_')}`
}

/**
 * Clean expired cache entries
 */
function cleanCache<T extends { timestamp: number }>(cache: Map<string, T>): void {
  const now = Date.now()
  const expiredKeys: string[] = []

  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > HISTOGRAM_CACHE_CONFIG.ttlMs) {
      expiredKeys.push(key)
    }
  }

  expiredKeys.forEach(key => cache.delete(key))

  // Also enforce max size
  if (cache.size > HISTOGRAM_CACHE_CONFIG.maxEntries) {
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, cache.size - HISTOGRAM_CACHE_CONFIG.maxEntries)
    toDelete.forEach(([key]) => cache.delete(key))
  }
}

/**
 * Convert API histogram data to D3-compatible bins with optimized processing
 * @param data - Histogram data from API
 * @returns Array of histogram bins
 */
function processBins(data: HistogramData): HistogramBin[] {
  const { histogram, total_features } = data
  const bins: HistogramBin[] = new Array(histogram.bins.length)

  for (let i = 0; i < histogram.bins.length; i++) {
    bins[i] = {
      x0: histogram.bin_edges[i],
      x1: histogram.bin_edges[i + 1],
      count: histogram.counts[i],
      density: histogram.counts[i] / total_features
    }
  }

  return bins
}

/**
 * Calculate histogram layout with memoization
 * @param data - Histogram data from API
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @returns Optimized histogram layout
 */
export function calculateHistogramLayout(
  data: HistogramData,
  containerWidth: number,
  containerHeight: number
): HistogramLayout {
  // Clean cache periodically
  if (histogramLayoutCache.size > HISTOGRAM_CACHE_CONFIG.maxEntries) {
    cleanCache(histogramLayoutCache)
  }

  const cacheKey = createHistogramCacheKey(data, containerWidth, containerHeight)
  const cachedEntry = histogramLayoutCache.get(cacheKey)

  if (cachedEntry && Date.now() - cachedEntry.timestamp < HISTOGRAM_CACHE_CONFIG.ttlMs) {
    return cachedEntry.layout
  }

  // Calculate layout
  const margin = DEFAULT_HISTOGRAM_MARGIN
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Process bins once and cache
  const bins = processBins(data)

  // Create scales with domain caching
  const xScale = scaleLinear()
    .domain([data.statistics.min, data.statistics.max])
    .range([0, width])
    .nice()

  const maxCount = max(data.histogram.counts) ?? 0
  const yScale = scaleLinear()
    .domain([0, maxCount])
    .range([height, 0])
    .nice()

  const layout: HistogramLayout = {
    bins,
    xScale,
    yScale,
    width,
    height,
    margin
  }

  // Cache the result
  histogramLayoutCache.set(cacheKey, {
    layout,
    key: cacheKey,
    timestamp: Date.now()
  })

  return layout
}

/**
 * Calculate multi-histogram layout with optimized spacing and performance
 * @param histogramDataMap - Map of metric names to histogram data
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @returns Optimized multi-histogram layout
 */
export function calculateMultiHistogramLayout(
  histogramDataMap: Record<string, HistogramData>,
  containerWidth: number,
  containerHeight: number
): MultiHistogramLayout {
  const metrics = Object.keys(histogramDataMap)
  const chartCount = metrics.length

  // Create cache key with data hashes
  const dataHashes = metrics.map(metric =>
    `${metric}_${histogramDataMap[metric]?.total_features}_${histogramDataMap[metric]?.statistics.min}`
  )
  const cacheKey = createMultiHistogramCacheKey(metrics, containerWidth, containerHeight, dataHashes)

  // Clean cache periodically
  if (multiHistogramLayoutCache.size > HISTOGRAM_CACHE_CONFIG.maxEntries) {
    cleanCache(multiHistogramLayoutCache)
  }

  const cachedEntry = multiHistogramLayoutCache.get(cacheKey)
  if (cachedEntry && Date.now() - cachedEntry.timestamp < HISTOGRAM_CACHE_CONFIG.ttlMs) {
    return cachedEntry.layout
  }

  // Calculate layout dimensions
  const { spacing, chartTitleHeight, chartMarginTop, minChartHeight } = MULTI_HISTOGRAM_LAYOUT
  const totalSpacing = (chartCount - 1) * spacing + chartCount * (chartTitleHeight + chartMarginTop)
  const availableChartHeight = Math.max(minChartHeight, (containerHeight - totalSpacing) / chartCount)

  const charts: IndividualHistogramLayout[] = new Array(chartCount)
  let currentYOffset = 0

  // Pre-calculate chart titles to avoid repeated formatting
  const chartTitles = new Map(metrics.map(metric => [metric, formatMetricTitle(metric)]))

  for (let i = 0; i < chartCount; i++) {
    const metric = metrics[i]
    const data = histogramDataMap[metric]

    // Calculate individual chart layout with caching
    const baseLayout = calculateHistogramLayout(data, containerWidth, availableChartHeight)

    // Create individual chart layout with positioning
    charts[i] = {
      ...baseLayout,
      metric,
      yOffset: currentYOffset + chartTitleHeight + chartMarginTop,
      chartTitle: chartTitles.get(metric)!
    }

    // Update Y offset for next chart
    currentYOffset += chartTitleHeight + chartMarginTop + baseLayout.height + baseLayout.margin.top + baseLayout.margin.bottom
    if (i < chartCount - 1) {
      currentYOffset += spacing
    }
  }

  const layout: MultiHistogramLayout = {
    charts,
    totalWidth: containerWidth,
    totalHeight: Math.max(containerHeight, currentYOffset),
    spacing
  }

  // Cache the result
  multiHistogramLayoutCache.set(cacheKey, {
    layout,
    key: cacheKey,
    timestamp: Date.now()
  })

  return layout
}

/**
 * Calculate threshold line position with optimized scale access
 * @param threshold - Threshold value
 * @param layout - Histogram layout
 * @returns Threshold line data
 */
export function calculateThresholdLine(
  threshold: number,
  layout: HistogramLayout
): ThresholdLineData {
  return {
    x: layout.xScale(threshold) as number,
    y1: 0,
    y2: layout.height,
    value: threshold
  }
}

/**
 * Clear all histogram caches (useful for testing or memory management)
 */
export function clearHistogramCache(): void {
  histogramLayoutCache.clear()
  multiHistogramLayoutCache.clear()
}