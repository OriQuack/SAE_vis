/**
 * D3 Sankey Link Histogram Utilities
 *
 * Calculates layout for rotated histograms displayed on Sankey links.
 * These histograms are rotated 90 degrees and span the full Sankey height,
 * showing the distribution of the source node's metric.
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 */

import { scaleLinear } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { D3SankeyLink, HistogramData } from '../types'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LinkHistogramBar {
  x: number         // X position (in rotated space)
  y: number         // Y position (in rotated space)
  width: number     // Bar width (in rotated space)
  height: number    // Bar height (in rotated space)
  color: string     // Bar color
  binData: {
    x0: number      // Bin start value
    x1: number      // Bin end value
    count: number   // Feature count in bin
  }
}

export interface LinkHistogramLayout {
  bars: LinkHistogramBar[]
  centerX: number          // Center X position of link
  centerY: number          // Center Y position of link
  width: number            // Histogram width (before rotation)
  height: number           // Histogram height (before rotation, spans Sankey height)
  metric: string           // Metric being displayed
  xScale: ScaleLinear<number, number>  // Scale for metric values
  yScale: ScaleLinear<number, number>  // Scale for counts
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HISTOGRAM_BAR_COLOR = '#94a3b8'  // Gray-blue, same as HistogramPopover
const LINK_HISTOGRAM_WIDTH_RATIO = 0.6  // Histogram width as % of link width

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate center position of a Sankey link for histogram placement
 */
export function calculateLinkCenterPosition(link: D3SankeyLink): { x: number; y: number } | null {
  const source = typeof link.source === 'object' ? link.source : null
  const target = typeof link.target === 'object' ? link.target : null

  if (!source || !target) return null

  // Get source and target positions
  const sourceX = (source.x1 || source.x0 || 0)
  const sourceY = ((source.y0 || 0) + (source.y1 || 0)) / 2
  const targetX = (target.x0 || target.x1 || 0)
  const targetY = ((target.y0 || 0) + (target.y1 || 0)) / 2

  // Calculate midpoint
  return {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2
  }
}

/**
 * Calculate histogram bars for vertical orientation (rotated 90 degrees)
 *
 * Note: The bars are calculated in "pre-rotation" space where:
 * - X axis = feature count (will become vertical after rotation)
 * - Y axis = metric value (will become horizontal after rotation)
 *
 * After 90° rotation: X→Y, Y→X
 */
function calculateVerticalHistogramBars(
  data: HistogramData,
  histogramWidth: number,  // Available width for histogram (before rotation)
  histogramHeight: number, // Available height for histogram (before rotation)
  barColor: string
): LinkHistogramBar[] {
  if (!data.histogram?.counts || data.histogram.counts.length === 0) {
    return []
  }

  // Calculate scales
  const maxCount = max(data.histogram.counts) || 1

  // X scale: Maps feature count to width (horizontal in pre-rotation space)
  const xScale = scaleLinear()
    .domain([0, maxCount])
    .range([0, histogramWidth])

  // Y scale: Maps metric values to height (vertical in pre-rotation space)
  const yScale = scaleLinear()
    .domain([data.statistics.min, data.statistics.max])
    .range([0, histogramHeight])

  // Calculate bars in pre-rotation space
  const bars: LinkHistogramBar[] = data.histogram.counts.map((count, i) => {
    const binStart = data.histogram.bin_edges[i]
    const binEnd = data.histogram.bin_edges[i + 1]

    // In pre-rotation space:
    // - y = metric value position (will become x after rotation)
    // - x = 0 (bars start from left, will become bottom after rotation)
    // - width = count (bar length, will become height after rotation)
    // - height = bin width (will become bar width after rotation)

    const y = yScale(binStart)
    const y1 = yScale(binEnd)
    const barWidth = xScale(count)
    const barHeight = Math.abs(y1 - y)

    return {
      x: 0,
      y: Math.min(y, y1),
      width: barWidth,
      height: Math.max(1, barHeight - 0.5), // Subtract 0.5 for small gap between bars
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
 * Calculate complete layout for a link histogram
 *
 * This function calculates all data needed to render a rotated histogram on a Sankey link.
 * The histogram displays the source node's metric distribution.
 *
 * @param link - The Sankey link to render histogram on
 * @param histogramData - Histogram data for the source node's metric
 * @param sankeyHeight - Full height of the Sankey diagram
 * @returns Layout data for rendering, or null if calculation fails
 */
export function calculateLinkHistogramLayout(
  link: D3SankeyLink,
  histogramData: HistogramData | null,
  sankeyHeight: number
): LinkHistogramLayout | null {
  // Validate inputs
  if (!histogramData || !link.width || link.width < 5) {
    return null
  }

  // Get link center position
  const center = calculateLinkCenterPosition(link)
  if (!center) return null

  // Calculate histogram dimensions (before rotation)
  // Width: Based on link width (in pre-rotation space, this becomes height after rotation)
  // Height: Full Sankey height (in pre-rotation space, this becomes width after rotation)
  const histogramWidth = Math.max(10, link.width * LINK_HISTOGRAM_WIDTH_RATIO)
  const histogramHeight = sankeyHeight

  // Calculate bars
  const bars = calculateVerticalHistogramBars(
    histogramData,
    histogramWidth,
    histogramHeight,
    HISTOGRAM_BAR_COLOR
  )

  // Create scales for reference
  const maxCount = max(histogramData.histogram.counts) || 1
  const xScale = scaleLinear()
    .domain([0, maxCount])
    .range([0, histogramWidth])

  const yScale = scaleLinear()
    .domain([histogramData.statistics.min, histogramData.statistics.max])
    .range([0, histogramHeight])

  return {
    bars,
    centerX: center.x,
    centerY: center.y,
    width: histogramWidth,
    height: histogramHeight,
    metric: '', // Will be set by caller
    xScale,
    yScale
  }
}

/**
 * Check if a link should display a histogram
 *
 * Criteria:
 * - Link has non-zero width
 * - Either source or target node has a metric
 * - Histogram data exists for that metric
 */
export function shouldDisplayLinkHistogram(
  link: D3SankeyLink,
  histogramData: Record<string, HistogramData> | null
): boolean {
  if (!link.width || link.width < 5) return false

  const source = typeof link.source === 'object' ? link.source : null
  const target = typeof link.target === 'object' ? link.target : null

  // Use source metric if available, otherwise use target metric (for root node links)
  const metric = source?.metric || target?.metric
  if (!metric) return false

  if (!histogramData || !histogramData[metric]) return false

  return true
}

/**
 * Get the metric to use for a link's histogram
 * Uses source metric if available, otherwise target metric (for root node links)
 */
export function getLinkMetric(link: D3SankeyLink): string | null {
  const source = typeof link.source === 'object' ? link.source : null
  const target = typeof link.target === 'object' ? link.target : null

  return source?.metric || target?.metric || null
}
