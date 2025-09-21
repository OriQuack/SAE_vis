import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import * as d3Sankey from 'd3-sankey'
import type { HistogramData, HistogramBin, SankeyData, D3SankeyNode, D3SankeyLink, NodeCategory } from '../services/types'

// ============================================================================
// HISTOGRAM CALCULATION UTILITIES
// ============================================================================

export interface HistogramLayout {
  bins: HistogramBin[]
  xScale: ReturnType<typeof scaleLinear>
  yScale: ReturnType<typeof scaleLinear>
  width: number
  height: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

export interface IndividualHistogramLayout extends HistogramLayout {
  metric: string
  yOffset: number  // Y offset for positioning in multi-histogram mode
  chartTitle: string
}

export interface MultiHistogramLayout {
  charts: IndividualHistogramLayout[]
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

export function calculateHistogramLayout(
  data: HistogramData,
  containerWidth: number,
  containerHeight: number
): HistogramLayout {
  const margin = {
    top: 20,
    right: 30,
    bottom: 70,  // Increased to accommodate separate slider track
    left: 50
  }

  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Convert API histogram data to D3-compatible format
  const bins: HistogramBin[] = data.histogram.bins.map((_, index) => ({
    x0: data.histogram.bin_edges[index],
    x1: data.histogram.bin_edges[index + 1],
    count: data.histogram.counts[index],
    density: data.histogram.counts[index] / data.total_features
  }))

  // Create scales
  const xScale = scaleLinear()
    .domain([data.statistics.min, data.statistics.max])
    .range([0, width])
    .nice()

  const maxCount = max(data.histogram.counts) ?? 0
  const yScale = scaleLinear()
    .domain([0, maxCount])
    .range([height, 0])
    .nice()

  return {
    bins,
    xScale,
    yScale,
    width,
    height,
    margin
  }
}

export function calculateMultiHistogramLayout(
  histogramDataMap: Record<string, HistogramData>,
  containerWidth: number,
  containerHeight: number
): MultiHistogramLayout {
  const metrics = Object.keys(histogramDataMap)
  const chartCount = metrics.length

  // Define spacing and dimensions
  const spacing = 16  // Space between charts
  const chartTitleHeight = 28  // Height for chart title
  const chartMarginTop = 12  // Additional top margin for each chart

  // Calculate height for each individual chart
  const totalSpacing = (chartCount - 1) * spacing + chartCount * (chartTitleHeight + chartMarginTop)
  const availableChartHeight = Math.max(120, (containerHeight - totalSpacing) / chartCount)

  const charts: IndividualHistogramLayout[] = []
  let currentYOffset = 0

  metrics.forEach((metric, index) => {
    const data = histogramDataMap[metric]

    // Calculate individual chart layout
    const baseLayout = calculateHistogramLayout(data, containerWidth, availableChartHeight)

    // Create chart title from metric name
    const chartTitle = formatMetricTitle(metric)

    // Create individual chart layout with positioning
    const chartLayout: IndividualHistogramLayout = {
      ...baseLayout,
      metric,
      yOffset: currentYOffset + chartTitleHeight + chartMarginTop,
      chartTitle
    }

    charts.push(chartLayout)

    // Update Y offset for next chart
    currentYOffset += chartTitleHeight + chartMarginTop + baseLayout.height + baseLayout.margin.top + baseLayout.margin.bottom
    if (index < chartCount - 1) {
      currentYOffset += spacing
    }
  })

  return {
    charts,
    totalWidth: containerWidth,
    totalHeight: Math.max(containerHeight, currentYOffset),
    spacing
  }
}

// Helper function to format metric names for display
function formatMetricTitle(metric: string): string {
  const metricTitles: Record<string, string> = {
    score_detection: 'Detection Score',
    score_fuzz: 'Fuzz Score',
    score_simulation: 'Simulation Score',
    semdist_mean: 'Semantic Distance (Mean)',
    semdist_max: 'Semantic Distance (Max)',
    score_embedding: 'Embedding Score'
  }

  return metricTitles[metric] || metric.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
}

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

// ============================================================================
// SLIDER UTILITIES
// ============================================================================

export function valueToPosition(value: number, min: number, max: number, width: number): number {
  return ((value - min) / (max - min)) * width
}

export function positionToValue(position: number, min: number, max: number, width: number): number {
  const ratio = Math.max(0, Math.min(1, position / width))
  return min + ratio * (max - min)
}

export function snapToNearestTick(
  value: number,
  min: number,
  max: number,
  tickCount: number = 10
): number {
  const tickSize = (max - min) / tickCount
  return Math.round((value - min) / tickSize) * tickSize + min
}

// ============================================================================
// SLIDER TRACK CONSTANTS
// ============================================================================

export const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,  // Distance below x-axis labels
  cornerRadius: 3
} as const

// ============================================================================
// COLOR UTILITIES
// ============================================================================

export const HISTOGRAM_COLORS = {
  bars: '#94a3b8',          // Neutral slate-400 for below threshold
  barsHover: '#64748b',     // Darker slate-500
  threshold: '#10b981',     // Green (emerald-500) for above threshold
  thresholdHover: '#059669', // Darker green (emerald-600)
  background: '#f8fafc',    // Light gray
  grid: '#e2e8f0',         // Gray
  text: '#374151',         // Dark gray
  axis: '#6b7280',         // Medium gray
  sliderHandle: '#3b82f6', // Primary blue for circle handle
  sliderTrackFilled: '#3b82f6',    // Primary blue for filled portion
  sliderTrackUnfilled: '#cbd5e1'   // Light gray for unfilled portion
} as const

export function getBarColor(binValue: number, threshold: number): string {
  return binValue >= threshold ? HISTOGRAM_COLORS.threshold : HISTOGRAM_COLORS.bars
}

// ============================================================================
// ANIMATION UTILITIES
// ============================================================================

export interface AnimationConfig {
  duration: number
  easing: string
}

export const DEFAULT_ANIMATION: AnimationConfig = {
  duration: 300,
  easing: 'ease-out'
}

export function createTransition(element: SVGElement, config: AnimationConfig = DEFAULT_ANIMATION): void {
  element.style.transition = `all ${config.duration}ms ${config.easing}`
}

// ============================================================================
// TOOLTIP UTILITIES
// ============================================================================

export interface TooltipData {
  x: number
  y: number
  title: string
  content: Array<{ label: string; value: string | number }>
}

export function formatTooltipContent(bin: HistogramBin, threshold: number): TooltipData['content'] {
  return [
    { label: 'Range', value: `${bin.x0.toFixed(3)} - ${bin.x1.toFixed(3)}` },
    { label: 'Count', value: bin.count.toLocaleString() },
    { label: 'Density', value: `${(bin.density * 100).toFixed(1)}%` },
    { label: 'Status', value: bin.x0 >= threshold ? 'Above threshold' : 'Below threshold' }
  ]
}

export function formatThresholdTooltip(threshold: number, statistics: HistogramData['statistics']): TooltipData['content'] {
  const percentile = ((threshold - statistics.min) / (statistics.max - statistics.min)) * 100

  return [
    { label: 'Threshold', value: threshold.toFixed(3) },
    { label: 'Percentile', value: `${percentile.toFixed(1)}%` },
    { label: 'Range', value: `${statistics.min.toFixed(3)} - ${statistics.max.toFixed(3)}` }
  ]
}

// ============================================================================
// ACCESSIBILITY UTILITIES
// ============================================================================

export function generateAriaLabel(
  bin: HistogramBin,
  index: number,
  totalBins: number,
  threshold: number
): string {
  const status = bin.x0 >= threshold ? 'above' : 'below'
  return `Bin ${index + 1} of ${totalBins}: ${bin.count} features in range ${bin.x0.toFixed(3)} to ${bin.x1.toFixed(3)}, ${status} threshold`
}

export function generateSliderAriaLabel(
  value: number,
  min: number,
  max: number,
  metric: string
): string {
  const percentage = ((value - min) / (max - min)) * 100
  return `${metric} threshold: ${value.toFixed(3)} (${percentage.toFixed(1)}% of range)`
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function validateHistogramData(data: HistogramData): string[] {
  const errors: string[] = []

  if (!data.histogram.bins || data.histogram.bins.length === 0) {
    errors.push('No histogram bins provided')
  }

  if (!data.histogram.counts || data.histogram.counts.length === 0) {
    errors.push('No histogram counts provided')
  }

  if (data.histogram.bins.length !== data.histogram.counts.length) {
    errors.push('Bins and counts arrays have different lengths')
  }

  if (!data.histogram.bin_edges || data.histogram.bin_edges.length !== data.histogram.bins.length + 1) {
    errors.push('Invalid bin edges array')
  }

  if (data.statistics.min >= data.statistics.max) {
    errors.push('Invalid statistics: min should be less than max')
  }

  return errors
}

export function validateDimensions(width: number, height: number): string[] {
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
}

// ============================================================================
// SANKEY UTILITIES
// ============================================================================

export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

export function calculateSankeyLayout(
  data: SankeyData,
  containerWidth: number,
  containerHeight: number
): SankeyLayout {
  const margin = {
    top: 20,
    right: 20,
    bottom: 20,
    left: 140
  }

  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  try {
    // Create d3-sankey generator
    const sankey = d3Sankey.sankey()
      .nodeAlign(d3Sankey.sankeyLeft)
      .nodeWidth(15)
      .nodePadding(10)
      .extent([[0, 0], [width, height]])

    // Create node ID to index mapping
    const nodeIdToIndex = new Map<string, number>()
    data.nodes.forEach((node, index) => {
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

    // Convert data to d3-sankey format - CRITICAL: nodes must be plain objects
    const sankeyNodes = data.nodes.map(node => ({
      // Only include basic properties d3-sankey needs
      id: node.id,
      name: node.name,
      category: node.category,
      feature_count: node.feature_count,
      stage: node.stage
    }))

    const sankeyLinks = data.links.map(link => ({
      source: nodeIdToIndex.get(link.source)!,
      target: nodeIdToIndex.get(link.target)!,
      value: link.value
    }))

    const sankeyData = {
      nodes: sankeyNodes,
      links: sankeyLinks
    }

    // Generate layout
    const result = sankey(sankeyData as any)

    // Ensure result is valid
    if (!result || !result.nodes || !result.links) {
      console.warn('D3 sankey returned invalid result')
      return {
        nodes: [],
        links: [],
        width,
        height,
        margin
      }
    }

    // Convert back to our D3SankeyNode/D3SankeyLink format
    const processedNodes = result.nodes.map((node: any, index: number) => ({
      ...node,
      // Restore our custom properties from original data
      id: sankeyNodes[index]?.id || '',
      name: sankeyNodes[index]?.name || '',
      category: sankeyNodes[index]?.category || 'root',
      feature_count: sankeyNodes[index]?.feature_count || 0,
      stage: sankeyNodes[index]?.stage || 0
    })) as D3SankeyNode[]

    const processedLinks = result.links as D3SankeyLink[]

    return {
      nodes: processedNodes,
      links: processedLinks,
      width,
      height,
      margin
    }

  } catch (error) {
    console.error('Error in d3-sankey layout calculation:', error)
    console.error('Input data:', data)

    // Return empty layout instead of crashing
    return {
      nodes: [],
      links: [],
      width,
      height,
      margin
    }
  }
}

export const SANKEY_COLORS: Record<NodeCategory, string> = {
  root: '#8b5cf6',              // Purple
  feature_splitting: '#06b6d4', // Cyan
  semantic_distance: '#3b82f6', // Blue
  score_agreement: '#10b981'    // Green
}

export function getNodeColor(category: NodeCategory): string {
  return SANKEY_COLORS[category] || '#6b7280'
}

export function getLinkColor(sourceCategory: NodeCategory): string {
  const baseColor = SANKEY_COLORS[sourceCategory] || '#6b7280'
  return baseColor + '80' // Add transparency
}

export function getSankeyPath(link: D3SankeyLink): string {
  return d3Sankey.sankeyLinkHorizontal()(link) || ''
}


export function validateSankeyData(data: SankeyData): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('No data provided')
    return errors
  }

  if (!data.nodes || data.nodes.length === 0) {
    errors.push('No nodes provided')
  }

  if (!data.links || data.links.length === 0) {
    errors.push('No links provided')
  }

  // Validate nodes are not null/undefined and have required properties
  data.nodes.forEach((node, index) => {
    if (!node) {
      errors.push(`Node ${index}: is null or undefined`)
      return
    }
    if (!node.id) {
      errors.push(`Node ${index}: missing required 'id' property`)
    }
    if (!node.name) {
      errors.push(`Node ${index}: missing required 'name' property`)
    }
    if (typeof node.feature_count !== 'number') {
      errors.push(`Node ${index}: 'feature_count' must be a number`)
    }
    if (typeof node.stage !== 'number') {
      errors.push(`Node ${index}: 'stage' must be a number`)
    }
  })

  // Validate links are not null/undefined and have required properties
  data.links.forEach((link, index) => {
    if (!link) {
      errors.push(`Link ${index}: is null or undefined`)
      return
    }
    if (!link.source) {
      errors.push(`Link ${index}: missing required 'source' property`)
    }
    if (!link.target) {
      errors.push(`Link ${index}: missing required 'target' property`)
    }
    if (typeof link.value !== 'number') {
      errors.push(`Link ${index}: 'value' must be a number`)
    }
  })

  // Validate node IDs are unique
  const nodeIds = data.nodes.map(node => node?.id).filter(id => id != null)
  const uniqueNodeIds = new Set(nodeIds)
  if (nodeIds.length !== uniqueNodeIds.size) {
    errors.push('Duplicate node IDs found')
  }

  // Validate link references
  const nodeIdSet = new Set(nodeIds)
  data.links.forEach((link, index) => {
    if (link && link.source && !nodeIdSet.has(link.source)) {
      errors.push(`Link ${index}: source node '${link.source}' not found`)
    }
    if (link && link.target && !nodeIdSet.has(link.target)) {
      errors.push(`Link ${index}: target node '${link.target}' not found`)
    }
    if (link && typeof link.value === 'number' && link.value <= 0) {
      errors.push(`Link ${index}: value must be positive`)
    }
  })

  return errors
}