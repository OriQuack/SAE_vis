/**
 * D3 Sankey Node Histogram Utilities
 *
 * Calculates layout for histograms displayed at Sankey nodes.
 * These histograms show the distribution of features flowing out of a source node,
 * positioned at the right edge of the node with horizontal bars.
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 */

import { scaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { D3SankeyNode, D3SankeyLink, HistogramData } from '../types'
import {
  METRIC_COLORS,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_QUALITY_SCORE
} from './constants'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface NodeHistogramBar {
  x: number         // X position (from node's right edge)
  y: number         // Y position (within node's vertical bounds)
  width: number     // Bar width (horizontal extent)
  height: number    // Bar height (vertical size of bin)
  color: string     // Bar color
  binData: {
    x0: number      // Bin start value
    x1: number      // Bin end value
    count: number   // Feature count in bin
  }
}

export interface NodeHistogramLayout {
  bars: NodeHistogramBar[]
  x: number                // X position (node's right edge)
  y: number                // Y position (node's top)
  width: number            // Maximum histogram width
  height: number           // Node height (y1 - y0)
  metric: string           // Metric being displayed
  nodeId: string           // Source node ID
  totalFeatures: number    // Total features in node
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HISTOGRAM_MARGIN = 0             // Space between node and histogram

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the color for a histogram based on its metric
 * Returns metric-specific color with higher opacity for better visibility
 */
function getHistogramColorForMetric(metric: string): string {
  switch (metric) {
    case METRIC_FEATURE_SPLITTING:
      return METRIC_COLORS.FEATURE_SPLITTING
    case METRIC_SEMANTIC_SIMILARITY:
      return METRIC_COLORS.SEMANTIC_SIMILARITY
    case METRIC_SCORE_EMBEDDING:
      return METRIC_COLORS.SCORE_EMBEDDING.HIGH
    case METRIC_SCORE_FUZZ:
      return METRIC_COLORS.SCORE_FUZZ.HIGH
    case METRIC_SCORE_DETECTION:
      return METRIC_COLORS.SCORE_DETECTION.HIGH
    case METRIC_QUALITY_SCORE:
      return METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH
    default:
      // Fallback to gray-blue for unknown metrics
      return '#94a3b8'
  }
}

/**
 * Check if a node has outgoing links (is a source node)
 */
export function hasOutgoingLinks(
  node: D3SankeyNode,
  links: D3SankeyLink[]
): boolean {
  return links.some(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    return sourceId === node.id
  })
}

/**
 * Get the metric for a node's histogram
 * Shows what metric this node uses to split into children
 * With new architecture, metric is on the parent (source) node
 */
export function getNodeHistogramMetric(
  node: D3SankeyNode,
  _links: D3SankeyLink[]  // Unused after architecture change
): string | null {
  // Histogram shows the metric THIS node uses to split into children
  // With new architecture, metric is on the parent (source) node
  return node.metric || null
}

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate histogram bars for a source node
 * Bars are horizontal, positioned at the right edge of the node
 *
 * Visual representation:
 * [Node]▐▌▌▌▌▌  (horizontal bars extending right)
 *       ↑
 *    min value (top)
 *       ↓
 *    max value (bottom)
 */
function calculateNodeHistogramBars(
  data: HistogramData,
  node: D3SankeyNode,
  maxBarWidth: number,
  metric: string
): NodeHistogramBar[] {
  if (!data.histogram?.counts || data.histogram.counts.length === 0) {
    return []
  }

  // Get node bounds
  const nodeY0 = node.y0 || 0
  const nodeY1 = node.y1 || 0

  // Calculate scales
  const maxCount = max(data.histogram.counts) || 1

  // X scale: Maps feature count to bar width (horizontal extent)
  const xScale = scaleLinear()
    .domain([0, maxCount])
    .range([0, maxBarWidth])

  // Y scale: Maps metric values to vertical position within node
  // min value at top (nodeY0), max value at bottom (nodeY1)
  const yScale = scaleLinear()
    .domain([data.statistics.min, data.statistics.max])
    .range([nodeY0, nodeY1])  // min at top, max at bottom

  // Get metric-specific color
  const barColor = getHistogramColorForMetric(metric)

  // Calculate bars
  const bars: NodeHistogramBar[] = data.histogram.counts.map((count, i) => {
    const binStart = data.histogram.bin_edges[i]
    const binEnd = data.histogram.bin_edges[i + 1]

    // Calculate Y positions for this bin
    const y1 = yScale(binStart)
    const y2 = yScale(binEnd)

    // Ensure correct ordering (y is always the top)
    const y = Math.min(y1, y2)
    const barHeight = Math.abs(y2 - y1)

    // Bar width based on count
    const barWidth = xScale(count)

    return {
      x: 0,  // Bars start at node's right edge
      y: y,
      width: barWidth,
      height: Math.max(1, barHeight - 0.5), // Small gap between bars
      color: barColor,
      binData: {
        x0: binStart,
        x1: binEnd,
        count
      }
    }
  })

  return bars
}

/**
 * Calculate complete layout for a node histogram
 *
 * This function calculates all data needed to render a histogram at a Sankey node.
 * The histogram displays the distribution of features flowing out of the source node.
 *
 * @param node - The source Sankey node
 * @param histogramData - Histogram data for the node's metric
 * @param links - All Sankey links (to check if node has outgoing links)
 * @returns Layout data for rendering, or null if calculation fails
 */
export function calculateNodeHistogramLayout(
  node: D3SankeyNode,
  histogramData: HistogramData | null,
  links: D3SankeyLink[]
): NodeHistogramLayout | null {
  // Validate inputs
  if (!histogramData || node.x0 == null || node.x1 == null || node.y0 == null || node.y1 == null) {
    return null
  }

  // Check if node has outgoing links
  if (!hasOutgoingLinks(node, links)) {
    return null
  }

  // Get metric for this node
  const metric = getNodeHistogramMetric(node, links)
  if (!metric) {
    return null
  }

  // Calculate node dimensions
  const nodeHeight = node.y1 - node.y0

  // Calculate dynamic histogram width based on horizontal distance to child nodes
  // Find the first outgoing link to determine the horizontal spacing
  const outgoingLink = links.find(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    return sourceId === node.id
  })

  // Use horizontal distance to child nodes as histogram width
  let histogramMaxWidth = nodeHeight * 0.5 // Fallback to original calculation
  if (outgoingLink) {
    const targetNode = typeof outgoingLink.target === 'object' ? outgoingLink.target : null
    if (targetNode && targetNode.x0 != null) {
      histogramMaxWidth = targetNode.x0 - node.x1
    }
  }

  // Calculate bars with metric-specific colors
  const bars = calculateNodeHistogramBars(
    histogramData,
    node,
    histogramMaxWidth * 0.8,
    metric
  )

  return {
    bars,
    x: node.x1 + HISTOGRAM_MARGIN,  // Position at node's right edge + margin
    y: node.y0,                      // Top of node
    width: histogramMaxWidth,
    height: nodeHeight,
    metric,
    nodeId: node.id || '',
    totalFeatures: histogramData.total_features || 0
  }
}

/**
 * Check if a node should display a histogram
 *
 * Criteria:
 * - Node has outgoing links (is a source)
 * - Node or its targets have a metric
 * - Histogram data exists for that metric using composite key (metric:nodeId)
 */
export function shouldDisplayNodeHistogram(
  node: D3SankeyNode,
  links: D3SankeyLink[],
  histogramData: Record<string, HistogramData> | null
): boolean {
  // Check if node has outgoing links
  if (!hasOutgoingLinks(node, links)) {
    return false
  }

  // Get metric for this node
  const metric = getNodeHistogramMetric(node, links)
  if (!metric) {
    return false
  }

  // Check if histogram data exists using composite key (metric:nodeId)
  if (!histogramData) {
    return false
  }

  const compositeKey = `${metric}:${node.id}`
  if (!histogramData[compositeKey]) {
    return false
  }

  return true
}