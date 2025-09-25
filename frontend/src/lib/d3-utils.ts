// Simplified D3 utilities for research prototype
// Consolidated from utils/d3/* directories

import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type { HistogramData, MetricType, NodeCategory } from '../types'

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

export interface D3SankeyNode {
  id: string
  name: string
  category: NodeCategory
  value?: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
}

export interface D3SankeyLink {
  source: D3SankeyNode | number
  target: D3SankeyNode | number
  value: number
  y0?: number
  y1?: number
  width?: number
}

export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
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

export const SANKEY_COLORS: Record<NodeCategory, string> = {
  root: '#8b5cf6',
  feature_splitting: '#06b6d4',
  semantic_distance: '#3b82f6',
  score_agreement: '#10b981'
}

export const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,
  cornerRadius: 3
}

const DEFAULT_HISTOGRAM_MARGIN = { top: 20, right: 30, bottom: 70, left: 50 }
const MULTI_HISTOGRAM_LAYOUT = { spacing: 16, chartTitleHeight: 28, chartMarginTop: 12, minChartHeight: 120 }
const DEFAULT_SANKEY_MARGIN = { top: 80, right: 20, bottom: 20, left: 80 }

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

    const maxCount = max(data.bins, d => d.count) || 1
    const yScale = scaleLinear()
      .domain([0, maxCount])
      .range([height, 0])

    charts.push({
      bins: data.bins,
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

    const chartMargin = { top: 20, right: 30, bottom: 50, left: 50 }
    const chartWidth = containerWidth - chartMargin.left - chartMargin.right

    let currentYOffset = 0

    metrics.forEach((metric) => {
      const data = histogramDataMap[metric]

      const xScale = scaleLinear()
        .domain([data.statistics.min, data.statistics.max])
        .range([0, chartWidth])

      const maxCount = max(data.bins, d => d.count) || 1
      const yScale = scaleLinear()
        .domain([0, maxCount])
        .range([chartHeight - chartMargin.top - chartMargin.bottom, 0])

      charts.push({
        bins: data.bins,
        xScale,
        yScale,
        width: chartWidth,
        height: chartHeight - chartMargin.top - chartMargin.bottom,
        margin: chartMargin,
        metric,
        yOffset: currentYOffset + chartMargin.top + MULTI_HISTOGRAM_LAYOUT.chartTitleHeight,
        chartTitle: METRIC_TITLES[metric] || metric
      })

      currentYOffset += chartHeight + spacing
    })
  }

  return {
    charts,
    totalWidth: containerWidth,
    totalHeight: containerHeight,
    spacing
  }
}

export function calculateThresholdLine(threshold: number, chart: HistogramChart): ThresholdLineData | null {
  if (!chart || !chart.xScale) return null

  const x = chart.xScale(threshold)
  return {
    x,
    y1: 0,
    y2: chart.height,
    value: threshold
  }
}

// ============================================================================
// SANKEY UTILITIES
// ============================================================================

export function calculateSankeyLayout(sankeyData: any): SankeyLayout {
  if (!sankeyData?.nodes || !sankeyData?.links) {
    throw new Error('Invalid sankey data: missing nodes or links')
  }

  const width = 800 - DEFAULT_SANKEY_MARGIN.left - DEFAULT_SANKEY_MARGIN.right
  const height = 600 - DEFAULT_SANKEY_MARGIN.top - DEFAULT_SANKEY_MARGIN.bottom

  // Create D3 sankey generator
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 1]])

  // Process the data
  const sankeyLayout = sankeyGenerator({
    nodes: sankeyData.nodes.map((d: any) => ({ ...d })),
    links: sankeyData.links.map((d: any) => ({ ...d }))
  })

  return {
    nodes: sankeyLayout.nodes,
    links: sankeyLayout.links,
    width,
    height,
    margin: DEFAULT_SANKEY_MARGIN
  }
}

export function getSankeyPath(link: D3SankeyLink): string {
  return sankeyLinkHorizontal()(link) || ''
}

export function getNodeColor(node: D3SankeyNode): string {
  return SANKEY_COLORS[node.category] || '#6b7280'
}

export function getLinkColor(link: D3SankeyLink): string {
  const sourceNode = link.source as D3SankeyNode
  const baseColor = SANKEY_COLORS[sourceNode.category] || '#6b7280'
  return `${baseColor}80` // Add transparency
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

  if (!data.bins || data.bins.length === 0) {
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

export function validateSankeyData(data: any): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('Sankey data is required')
    return errors
  }

  if (!data.nodes || !Array.isArray(data.nodes)) {
    errors.push('Sankey data must contain nodes array')
    return errors
  }

  if (!data.links || !Array.isArray(data.links)) {
    errors.push('Sankey data must contain links array')
    return errors
  }

  // Check that all link source/target IDs exist in nodes
  if (data.nodes.length > 0 && data.links.length > 0) {
    const nodeIds = new Set(data.nodes.map((node: any) => node.id))

    for (let i = 0; i < data.links.length; i++) {
      const link = data.links[i]

      // Handle both string IDs and object references
      const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
      const targetId = typeof link.target === 'object' ? link.target?.id : link.target

      if (sourceId !== undefined && !nodeIds.has(sourceId)) {
        errors.push(`Link ${i} references missing source node: "${sourceId}"`)
      }

      if (targetId !== undefined && !nodeIds.has(targetId)) {
        errors.push(`Link ${i} references missing target node: "${targetId}"`)
      }
    }
  }

  return errors
}

// ============================================================================
// COMPATIBILITY EXPORTS (for backward compatibility)
// ============================================================================

export const calculateMultiHistogramLayout = calculateHistogramLayout