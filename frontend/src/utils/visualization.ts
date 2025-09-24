// Consolidated visualization utilities
// All D3 and visualization functions organized by domain

import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import * as d3Sankey from 'd3-sankey'

// Import consolidated types and constants
import type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  HistogramLayoutCacheEntry,
  MultiHistogramLayoutCacheEntry,
  HistogramData,
  ThresholdLineData,
  TooltipData,
  SankeyData,
  SankeyNode,
  D3SankeyNode,
  D3SankeyLink,
  SankeyLayout,
  SankeyLayoutCacheEntry,
  NodeSortingCacheEntry,
  NodeSortConfig
} from './visualization-types'

import {
  DEFAULT_HISTOGRAM_MARGIN,
  MULTI_HISTOGRAM_LAYOUT,
  HISTOGRAM_CACHE_CONFIG,
  HISTOGRAM_COLORS,
  METRIC_TITLES,
  DEFAULT_SANKEY_MARGIN,
  SANKEY_LAYOUT_CONFIG,
  SCORE_AGREEMENT_SORT_ORDER,
  SANKEY_CACHE_CONFIG,
  DEFAULT_NODE_COLOR,
  SLIDER_TRACK,
  SLIDER_SNAP_CONFIG,
  SANKEY_COLORS,
  DEFAULT_ANIMATION
} from './visualization-constants'

// =============================================================================
// HISTOGRAM UTILITIES NAMESPACE
// =============================================================================

export const histogram = {
  // Memoization caches
  layoutCache: new Map<string, HistogramLayoutCacheEntry>(),
  multiLayoutCache: new Map<string, MultiHistogramLayoutCacheEntry>(),

  /**
   * Create cache key for histogram layout
   */
  createCacheKey(
    data: HistogramData,
    containerWidth: number,
    containerHeight: number
  ): string {
    return `${data.metric}_${containerWidth}_${containerHeight}_${data.total_features}_${data.statistics.min}_${data.statistics.max}`
  },

  /**
   * Create cache key for multi-histogram layout
   */
  createMultiCacheKey(
    metrics: string[],
    containerWidth: number,
    containerHeight: number,
    dataHashes: string[]
  ): string {
    return `multi_${metrics.join('_')}_${containerWidth}_${containerHeight}_${dataHashes.join('_')}`
  },

  /**
   * Clean expired cache entries
   */
  cleanCache<T extends { timestamp: number }>(cache: Map<string, T>): void {
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
  },

  /**
   * Convert API histogram data to D3-compatible bins with optimized processing
   */
  processBins(data: HistogramData): HistogramBin[] {
    const { histogram: histData, total_features } = data
    const bins: HistogramBin[] = new Array(histData.bins.length)

    for (let i = 0; i < histData.bins.length; i++) {
      bins[i] = {
        x0: histData.bin_edges[i],
        x1: histData.bin_edges[i + 1],
        count: histData.counts[i],
        density: histData.counts[i] / total_features
      }
    }

    return bins
  },

  /**
   * Calculate histogram layout with memoization
   */
  calculateLayout(
    data: HistogramData,
    containerWidth: number,
    containerHeight: number
  ): HistogramLayout {
    // Clean cache periodically
    if (this.layoutCache.size > HISTOGRAM_CACHE_CONFIG.maxEntries) {
      this.cleanCache(this.layoutCache)
    }

    const cacheKey = this.createCacheKey(data, containerWidth, containerHeight)
    const cachedEntry = this.layoutCache.get(cacheKey)

    if (cachedEntry && Date.now() - cachedEntry.timestamp < HISTOGRAM_CACHE_CONFIG.ttlMs) {
      return cachedEntry.layout
    }

    // Calculate layout
    const margin = DEFAULT_HISTOGRAM_MARGIN
    const width = containerWidth - margin.left - margin.right
    const height = containerHeight - margin.top - margin.bottom

    // Process bins once and cache
    const bins = this.processBins(data)

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
    this.layoutCache.set(cacheKey, {
      layout,
      key: cacheKey,
      timestamp: Date.now()
    })

    return layout
  },

  /**
   * Calculate multi-histogram layout with optimized spacing and performance
   */
  calculateMultiLayout(
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
    const cacheKey = this.createMultiCacheKey(metrics, containerWidth, containerHeight, dataHashes)

    // Clean cache periodically
    if (this.multiLayoutCache.size > HISTOGRAM_CACHE_CONFIG.maxEntries) {
      this.cleanCache(this.multiLayoutCache)
    }

    const cachedEntry = this.multiLayoutCache.get(cacheKey)
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
    const chartTitles = new Map(metrics.map(metric => [metric, this.formatMetricTitle(metric)]))

    for (let i = 0; i < chartCount; i++) {
      const metric = metrics[i]
      const data = histogramDataMap[metric]

      // Calculate individual chart layout with caching
      const baseLayout = this.calculateLayout(data, containerWidth, availableChartHeight)

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
    this.multiLayoutCache.set(cacheKey, {
      layout,
      key: cacheKey,
      timestamp: Date.now()
    })

    return layout
  },

  /**
   * Calculate threshold line position with optimized scale access
   */
  calculateThresholdLine(
    threshold: number,
    layout: HistogramLayout
  ): ThresholdLineData {
    return {
      x: layout.xScale(threshold) as number,
      y1: 0,
      y2: layout.height,
      value: threshold
    }
  },

  /**
   * Clear all histogram caches (useful for testing or memory management)
   */
  clearCache(): void {
    this.layoutCache.clear()
    this.multiLayoutCache.clear()
  },

  // Formatting utilities
  /**
   * Get color for histogram bar based on threshold
   */
  getBarColor(binValue: number, threshold: number): string {
    return binValue >= threshold ? HISTOGRAM_COLORS.threshold : HISTOGRAM_COLORS.bars
  },

  /**
   * Format metric name for display in charts
   */
  formatMetricTitle(metric: string): string {
    return METRIC_TITLES[metric] || metric.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  },

  /**
   * Format tooltip content for histogram bins
   */
  formatTooltipContent(bin: HistogramBin, threshold: number): TooltipData['content'] {
    return [
      { label: 'Range', value: `${bin.x0.toFixed(3)} - ${bin.x1.toFixed(3)}` },
      { label: 'Count', value: bin.count.toLocaleString() },
      { label: 'Density', value: `${(bin.density * 100).toFixed(1)}%` },
      { label: 'Status', value: bin.x0 >= threshold ? 'Above threshold' : 'Below threshold' }
    ]
  },

  /**
   * Format threshold tooltip content
   */
  formatThresholdTooltip(threshold: number, statistics: HistogramData['statistics']): TooltipData['content'] {
    const percentile = ((threshold - statistics.min) / (statistics.max - statistics.min)) * 100

    return [
      { label: 'Threshold', value: threshold.toFixed(3) },
      { label: 'Percentile', value: `${percentile.toFixed(1)}%` },
      { label: 'Range', value: `${statistics.min.toFixed(3)} - ${statistics.max.toFixed(3)}` }
    ]
  },

  /**
   * Validate histogram data structure (returns array of errors for backward compatibility)
   */
  validateData(data: unknown): string[] {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('Data must be an object')
      return errors
    }

    const histData = data as HistogramData

    if (!histData.metric) errors.push('Missing metric field')
    if (!histData.histogram) errors.push('Missing histogram field')
    if (!histData.statistics) errors.push('Missing statistics field')
    if (typeof histData.total_features !== 'number') errors.push('Missing or invalid total_features field')

    if (histData.histogram) {
      if (!histData.histogram.bins) errors.push('Missing histogram.bins')
      if (!histData.histogram.counts) errors.push('Missing histogram.counts')
      if (!histData.histogram.bin_edges) errors.push('Missing histogram.bin_edges')
    }

    return errors
  }
}

// =============================================================================
// SANKEY UTILITIES NAMESPACE
// =============================================================================

export const sankey = {
  // Memoization caches
  layoutCache: new Map<string, SankeyLayoutCacheEntry>(),
  sortingCache: new Map<string, NodeSortingCacheEntry>(),

  /**
   * Create cache key for sankey layout
   */
  createLayoutCacheKey(
    data: SankeyData,
    containerWidth: number,
    containerHeight: number
  ): string {
    const nodeIds = data.nodes.map(n => n.id).sort().join('_')
    const linkValues = data.links.map(l => `${l.source}_${l.target}_${l.value}`).sort().join('_')
    return `sankey_${containerWidth}_${containerHeight}_${nodeIds}_${linkValues}`
  },

  /**
   * Create cache key for node sorting
   */
  createSortingCacheKey(nodes: SankeyNode[], config: NodeSortConfig): string {
    const nodeStr = nodes.map(n => `${n.id}_${n.stage}_${n.name}`).join('_')
    return `sort_${config.stage4Enabled}_${config.preserveOriginalOrder}_${nodeStr}`
  },

  /**
   * Clean expired cache entries
   */
  cleanCache<T extends { timestamp: number }>(
    cache: Map<string, T>,
    ttlMs: number,
    maxEntries: number
  ): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > ttlMs) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => cache.delete(key))

    // Enforce max size
    if (cache.size > maxEntries) {
      const entries = Array.from(cache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      const toDelete = entries.slice(0, cache.size - maxEntries)
      toDelete.forEach(([key]) => cache.delete(key))
    }
  },

  /**
   * Sort nodes with optional stage 4 special handling
   */
  sortNodes(nodes: SankeyNode[], config: NodeSortConfig): SankeyNode[] {
    const cacheKey = this.createSortingCacheKey(nodes, config)

    // Check cache first
    if (this.sortingCache.size > SANKEY_CACHE_CONFIG.sortingMaxEntries) {
      this.cleanCache(this.sortingCache, SANKEY_CACHE_CONFIG.sortingTtlMs, SANKEY_CACHE_CONFIG.sortingMaxEntries)
    }

    const cachedEntry = this.sortingCache.get(cacheKey)
    if (cachedEntry && Date.now() - cachedEntry.timestamp < SANKEY_CACHE_CONFIG.sortingTtlMs) {
      return cachedEntry.sortedNodes as SankeyNode[]
    }

    // Group nodes by stage
    const nodesByStage = new Map<number, SankeyNode[]>()
    for (const node of nodes) {
      if (!nodesByStage.has(node.stage)) {
        nodesByStage.set(node.stage, [])
      }
      nodesByStage.get(node.stage)!.push(node)
    }

    const sortedNodes: SankeyNode[] = []

    // Sort each stage
    for (const [stage, stageNodes] of nodesByStage.entries()) {
      if (config.stage4Enabled && stage === 4) {
        // Special sorting for stage 4 (score agreement)
        const sortedStageNodes = [...stageNodes].sort((a, b) => {
          const orderA = SCORE_AGREEMENT_SORT_ORDER[a.name] ?? 999
          const orderB = SCORE_AGREEMENT_SORT_ORDER[b.name] ?? 999
          return orderA - orderB
        })
        sortedNodes.push(...sortedStageNodes)
      } else if (config.preserveOriginalOrder) {
        // Preserve original order for other stages
        sortedNodes.push(...stageNodes)
      } else {
        // Default alphabetical sort
        const sortedStageNodes = [...stageNodes].sort((a, b) => a.name.localeCompare(b.name))
        sortedNodes.push(...sortedStageNodes)
      }
    }

    // Cache result
    this.sortingCache.set(cacheKey, {
      sortedNodes,
      key: cacheKey,
      timestamp: Date.now()
    })

    return sortedNodes
  },

  /**
   * Calculate complete sankey layout with caching
   */
  calculateLayout(
    data: SankeyData,
    containerWidth: number,
    containerHeight: number,
    sortConfig: NodeSortConfig = { stage4Enabled: true, preserveOriginalOrder: false }
  ): SankeyLayout {
    // Clean layout cache periodically
    if (this.layoutCache.size > SANKEY_CACHE_CONFIG.maxEntries) {
      this.cleanCache(this.layoutCache, SANKEY_CACHE_CONFIG.ttlMs, SANKEY_CACHE_CONFIG.maxEntries)
    }

    const cacheKey = this.createLayoutCacheKey(data, containerWidth, containerHeight)
    const cachedEntry = this.layoutCache.get(cacheKey)

    if (cachedEntry && Date.now() - cachedEntry.timestamp < SANKEY_CACHE_CONFIG.ttlMs) {
      return cachedEntry.layout
    }

    // Calculate layout
    const margin = DEFAULT_SANKEY_MARGIN
    const width = containerWidth - margin.left - margin.right
    const height = containerHeight - margin.top - margin.bottom

    // Sort nodes
    const sortedNodes = this.sortNodes(data.nodes, sortConfig)

    // Create d3-sankey generator
    const sankeyGenerator = d3Sankey.sankey<D3SankeyNode, D3SankeyLink>()
      .nodeWidth(SANKEY_LAYOUT_CONFIG.nodeWidth)
      .nodePadding(SANKEY_LAYOUT_CONFIG.nodePadding)
      .extent([[0, 0], [width, height]])

    // Create node ID to index mapping using sorted nodes
    const nodeIdToIndex = new Map<string, number>()
    sortedNodes.forEach((node, index) => {
      nodeIdToIndex.set(node.id, index)
    })

    // Validate all links have valid node references
    const invalidLinks = data.links.filter(link =>
      !nodeIdToIndex.has(link.source) || !nodeIdToIndex.has(link.target)
    )

    if (invalidLinks.length > 0) {
      console.error('Invalid links found:', invalidLinks)
      return {
        nodes: [],
        links: [],
        width,
        height,
        margin
      }
    }

    // Prepare data for d3-sankey - CRITICAL: convert string IDs to numeric indices
    const sankeyData = {
      nodes: sortedNodes.map(node => ({ ...node })) as D3SankeyNode[],
      links: data.links.map(link => ({
        source: nodeIdToIndex.get(link.source)!,  // Convert string ID to index
        target: nodeIdToIndex.get(link.target)!,  // Convert string ID to index
        value: link.value
      })) as D3SankeyLink[]
    }

    // Generate layout
    const result = sankeyGenerator(sankeyData)
    const { nodes, links } = result

    const layout: SankeyLayout = {
      nodes: nodes || [],
      links: links || [],
      width,
      height,
      margin
    }

    // Cache result
    this.layoutCache.set(cacheKey, {
      layout,
      key: cacheKey,
      timestamp: Date.now()
    })

    return layout
  },

  /**
   * Generate SVG path for sankey links
   */
  generatePath(link: D3SankeyLink): string {
    if (!link.y0 || !link.y1 || !link.width) return ''

    const sourceX = (link.source as D3SankeyNode).x1 || 0
    const targetX = (link.target as D3SankeyNode).x0 || 0
    const sourceY = link.y0
    const targetY = link.y1
    const curvature = 0.5

    const xi = sourceX + (targetX - sourceX) * curvature
    const x0 = sourceX
    const x1 = targetX
    const y0 = sourceY
    const y1 = targetY

    return `M${x0},${y0}C${xi},${y0} ${xi},${y1} ${x1},${y1}`
  },

  /**
   * Get color for a node based on category
   */
  getNodeColor(category: string): string {
    return SANKEY_COLORS[category as keyof typeof SANKEY_COLORS] || DEFAULT_NODE_COLOR
  },

  /**
   * Get color for a link (typically uses opacity for visual hierarchy)
   */
  getLinkColor(sourceCategory?: string, targetCategory?: string): string {
    // For links, we typically use a neutral color with opacity
    // The actual visual distinction comes from the opacity setting in CSS
    return SANKEY_COLORS.score_agreement || DEFAULT_NODE_COLOR
  },

  /**
   * Clear all sankey caches
   */
  clearCache(): void {
    this.layoutCache.clear()
    this.sortingCache.clear()
  },

  /**
   * Validate sankey data structure (returns array of errors for backward compatibility)
   */
  validateData(data: unknown): string[] {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('Data must be an object')
      return errors
    }

    const sankeyData = data as SankeyData

    if (!Array.isArray(sankeyData.nodes)) {
      errors.push('Data must have a nodes array')
    } else {
      sankeyData.nodes.forEach((node, index) => {
        if (!node.id) errors.push(`Node ${index} missing id`)
        if (!node.name) errors.push(`Node ${index} missing name`)
        if (typeof node.stage !== 'number') errors.push(`Node ${index} missing or invalid stage`)
      })
    }

    if (!Array.isArray(sankeyData.links)) {
      errors.push('Data must have a links array')
    } else {
      sankeyData.links.forEach((link, index) => {
        if (!link.source) errors.push(`Link ${index} missing source`)
        if (!link.target) errors.push(`Link ${index} missing target`)
        if (typeof link.value !== 'number') errors.push(`Link ${index} missing or invalid value`)
      })
    }

    return errors
  }
}

// =============================================================================
// ANIMATION UTILITIES
// =============================================================================

export const animation = {
  /**
   * Create transition with standard easing
   */
  createTransition(duration: number = 300, easing: string = 'ease-out') {
    return { duration, easing }
  },

  /**
   * Apply transition to D3 selection
   */
  applyTransition(selection: any, config: { duration: number; easing: string }) {
    return selection
      .transition()
      .duration(config.duration)
      .ease(config.easing)
  }
}

// =============================================================================
// SLIDER UTILITIES
// =============================================================================

export const slider = {
  /**
   * Convert value to position along slider track
   */
  valueToPosition(value: number, min: number, max: number, width: number): number {
    if (max === min) return 0
    return ((value - min) / (max - min)) * width
  },

  /**
   * Convert position to value along slider track
   */
  positionToValue(position: number, min: number, max: number, width: number): number {
    if (width === 0) return min
    const ratio = Math.max(0, Math.min(1, position / width))
    return min + ratio * (max - min)
  },

  /**
   * Snap value to nearest tick mark
   */
  snapToNearestTick(
    value: number,
    min: number,
    max: number,
    tickCount: number = SLIDER_SNAP_CONFIG.defaultTickCount
  ): number {
    if (max === min || tickCount <= 0) return value

    const tickSize = (max - min) / tickCount
    const tickIndex = Math.round((value - min) / tickSize)
    return Math.max(min, Math.min(max, min + tickIndex * tickSize))
  },

  /**
   * Check if value should snap to tick
   */
  shouldSnapToTick(
    value: number,
    min: number,
    max: number,
    tickCount: number = SLIDER_SNAP_CONFIG.defaultTickCount,
    threshold: number = SLIDER_SNAP_CONFIG.snapThreshold
  ): boolean {
    if (max === min || tickCount <= 0) return false

    const range = max - min
    const snapDistance = range * threshold
    const snappedValue = this.snapToNearestTick(value, min, max, tickCount)

    return Math.abs(value - snappedValue) <= snapDistance
  },

  /**
   * Calculate slider position from value (alias for backward compatibility)
   */
  calculatePosition(value: number, min: number, max: number, width: number): number {
    return this.valueToPosition(value, min, max, width)
  },

  /**
   * Calculate value from slider position (alias for backward compatibility)
   */
  calculateValue(position: number, min: number, max: number, width: number): number {
    return this.positionToValue(position, min, max, width)
  },

  /**
   * Clamp value to bounds
   */
  clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }
}

// =============================================================================
// FORMATTERS AND UTILITIES
// =============================================================================

export const formatters = {
  /**
   * Format number with appropriate precision
   */
  number(value: number, precision: number = 2): string {
    return value.toFixed(precision)
  },

  /**
   * Format percentage
   */
  percentage(value: number, precision: number = 1): string {
    return `${(value * 100).toFixed(precision)}%`
  },

  /**
   * Format with locale-specific thousands separators
   */
  localeNumber(value: number): string {
    return value.toLocaleString()
  }
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

export const validation = {
  /**
   * Check if dimensions are valid
   */
  isValidDimensions(width: number, height: number): boolean {
    return width > 0 && height > 0 && isFinite(width) && isFinite(height)
  },

  /**
   * Check if threshold is in valid range
   */
  isValidThreshold(threshold: number, min: number, max: number): boolean {
    return threshold >= min && threshold <= max && isFinite(threshold)
  },

  /**
   * Validates container dimensions for visualizations (backward compatibility)
   */
  validateDimensions(width: number, height: number): string[] {
    const errors: string[] = []

    if (width <= 0) {
      errors.push('Width must be positive')
    }

    if (height <= 0) {
      errors.push('Height must be positive')
    }

    if (width < 200) {
      errors.push('Width should be at least 200px for proper visualization')
    }

    if (height < 150) {
      errors.push('Height should be at least 150px for proper visualization')
    }

    return errors
  },

  /**
   * Validates that a value is a valid number within bounds
   */
  validateNumericRange(
    value: number,
    min: number,
    max: number,
    fieldName: string
  ): string[] {
    const errors: string[] = []

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${fieldName} must be a valid number`)
      return errors
    }

    if (value < min || value > max) {
      errors.push(`${fieldName} must be between ${min} and ${max}`)
    }

    return errors
  }
}

// =============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// =============================================================================

// Export individual functions for backward compatibility with existing imports
export const calculateHistogramLayout = histogram.calculateLayout.bind(histogram)
export const calculateMultiHistogramLayout = histogram.calculateMultiLayout.bind(histogram)
export const calculateThresholdLine = histogram.calculateThresholdLine.bind(histogram)
export const getBarColor = histogram.getBarColor.bind(histogram)
export const formatMetricTitle = histogram.formatMetricTitle.bind(histogram)
export const formatTooltipContent = histogram.formatTooltipContent.bind(histogram)
export const formatThresholdTooltip = histogram.formatThresholdTooltip.bind(histogram)
export const validateHistogramData = histogram.validateData.bind(histogram)
export const clearHistogramCache = histogram.clearCache.bind(histogram)

export const calculateSankeyLayout = sankey.calculateLayout.bind(sankey)
export const getSankeyPath = sankey.generatePath.bind(sankey)
export const getNodeColor = sankey.getNodeColor.bind(sankey)
export const getLinkColor = sankey.getLinkColor.bind(sankey)
export const validateSankeyData = sankey.validateData.bind(sankey)
export const clearSankeyCache = sankey.clearCache.bind(sankey)

export const valueToPosition = slider.valueToPosition.bind(slider)
export const positionToValue = slider.positionToValue.bind(slider)
export const snapToNearestTick = slider.snapToNearestTick.bind(slider)

export const createTransition = animation.createTransition.bind(animation)
export const validateDimensions = validation.validateDimensions.bind(validation)

// Export constants for backward compatibility
export {
  HISTOGRAM_COLORS,
  METRIC_TITLES,
  DEFAULT_HISTOGRAM_MARGIN,
  MULTI_HISTOGRAM_LAYOUT,
  SANKEY_COLORS,
  DEFAULT_SANKEY_MARGIN,
  SANKEY_LAYOUT_CONFIG,
  SCORE_AGREEMENT_SORT_ORDER,
  SLIDER_TRACK,
  DEFAULT_ANIMATION
} from './visualization-constants'

// Export types for backward compatibility
export type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  HistogramData,
  ThresholdLineData,
  SankeyNode,
  D3SankeyNode,
  SankeyLink,
  D3SankeyLink,
  SankeyLayout,
  SankeyData,
  NodeCategory,
  NodeSortConfig,
  TooltipData,
  LayoutMargin,
  AnimationConfig
} from './visualization-types'