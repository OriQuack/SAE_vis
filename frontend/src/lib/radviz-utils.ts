// ============================================================================
// RADVIZ UTILITIES - Helper functions for CauseRadViz component
// ============================================================================
// RadViz positions features based on softmax-normalized decision scores
// Each cause category is an anchor at 120° intervals around a CIRCLE
// Reference: https://www.mdpi.com/2227-9709/6/2/16

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { hexbin as d3Hexbin } from 'd3-hexbin'
import type { CauseCategory } from './cause-visualization-utils'

// ============================================================================
// CIRCULAR ANCHOR CONFIGURATION
// ============================================================================

/**
 * RadViz circle parameters.
 * Anchors are placed at 120° intervals on the circumference.
 */
export const RADVIZ_CIRCLE = {
  center: { x: 0.5, y: 0.5 },
  radius: 0.45  // Slightly less than 0.5 to leave room for labels
}

/**
 * RadViz anchor positions at 120° intervals on a circle.
 * - Top (90°): Noisy Activation
 * - Bottom-left (210°): Missed Syntax
 * - Bottom-right (330°): Missed Context
 *
 * Formula: (cx + r*cos(θ), cy + r*sin(θ)) where θ is in radians
 */
export const RADVIZ_ANCHORS: Record<string, { x: number; y: number; angle: number }> = {
  'noisy-activation': {
    x: RADVIZ_CIRCLE.center.x + RADVIZ_CIRCLE.radius * Math.cos(Math.PI / 2),      // 90°
    y: RADVIZ_CIRCLE.center.y + RADVIZ_CIRCLE.radius * Math.sin(Math.PI / 2),
    angle: Math.PI / 2
  },
  'missed-N-gram': {
    x: RADVIZ_CIRCLE.center.x + RADVIZ_CIRCLE.radius * Math.cos(7 * Math.PI / 6),  // 210°
    y: RADVIZ_CIRCLE.center.y + RADVIZ_CIRCLE.radius * Math.sin(7 * Math.PI / 6),
    angle: 7 * Math.PI / 6
  },
  'missed-context': {
    x: RADVIZ_CIRCLE.center.x + RADVIZ_CIRCLE.radius * Math.cos(11 * Math.PI / 6), // 330°
    y: RADVIZ_CIRCLE.center.y + RADVIZ_CIRCLE.radius * Math.sin(11 * Math.PI / 6),
    angle: 11 * Math.PI / 6
  }
}

/**
 * Centroid of the RadViz space (center of the circle).
 * Points near the centroid have equal weights across all categories.
 */
export const RADVIZ_CENTROID = RADVIZ_CIRCLE.center

// ============================================================================
// TYPES
// ============================================================================

export interface RadVizPoint {
  feature_id: number
  x: number       // 0-1 range (RadViz coordinate)
  y: number       // 0-1 range (RadViz coordinate)
  confidence: number  // 0-1 range (distance from centroid, normalized)
  weights: Record<string, number>  // Softmax weights per category
  predictedCategory: string | null  // Category with highest weight
}

export interface RadVizScales {
  xScale: ScaleLinear<number, number>
  yScale: ScaleLinear<number, number>
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Compute softmax of decision scores with numeric stability.
 *
 * Formula: softmax(x_i) = exp(x_i - max(x)) / sum(exp(x_j - max(x)))
 *
 * @param scores - Decision scores per category (from SVM decision_function)
 * @returns Normalized weights per category (sum to 1)
 */
export function softmax(scores: Record<string, number>): Record<string, number> {
  const entries = Object.entries(scores)
  if (entries.length === 0) return {}

  // Numeric stability: subtract max before exp
  const maxScore = Math.max(...entries.map(([_, v]) => v))
  const expScores = entries.map(([k, v]) => [k, Math.exp(v - maxScore)] as const)
  const sumExp = expScores.reduce((acc, [_, v]) => acc + v, 0)

  // Avoid division by zero
  if (sumExp === 0) {
    const uniformWeight = 1 / entries.length
    return Object.fromEntries(entries.map(([k]) => [k, uniformWeight]))
  }

  return Object.fromEntries(expScores.map(([k, v]) => [k, v / sumExp]))
}

/**
 * Compute RadViz position from decision scores using softmax weighting.
 *
 * RadViz formula (spring-force analogy):
 *   position = sum(weight_i * anchor_i) for all categories
 *
 * Where weight_i = softmax(decision_score_i)
 *
 * @param featureId - Feature ID for the result
 * @param decisionScores - Decision scores per category (from SVM)
 * @returns RadViz point with position and confidence
 */
export function computeRadVizPosition(
  featureId: number,
  decisionScores: Record<string, number>
): RadVizPoint {
  const weights = softmax(decisionScores)

  let x = 0
  let y = 0

  // Weighted sum of anchor positions (spring-force equilibrium)
  for (const [category, weight] of Object.entries(weights)) {
    const anchor = RADVIZ_ANCHORS[category]
    if (anchor) {
      x += weight * anchor.x
      y += weight * anchor.y
    }
  }

  // Confidence = normalized distance from center (0 at center, 1 at edge)
  const dx = x - RADVIZ_CENTROID.x
  const dy = y - RADVIZ_CENTROID.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const confidence = Math.min(1, dist / RADVIZ_CIRCLE.radius)

  // Find predicted category (highest weight)
  const predictedCategory = Object.entries(weights).reduce(
    (best, [cat, w]) => (w > (best.weight ?? 0) ? { cat, weight: w } : best),
    { cat: null as string | null, weight: 0 }
  ).cat

  return {
    feature_id: featureId,
    x,
    y,
    confidence,
    weights,
    predictedCategory
  }
}

/**
 * Compute D3 scales for RadViz coordinates.
 * Maintains aspect ratio and centers the circle in the available space.
 *
 * @param width - Chart width in pixels
 * @param height - Chart height in pixels
 * @param padding - Padding around bounds (default 0.1 = 10%)
 * @returns Object with xScale and yScale
 */
export function computeRadVizScales(
  width: number,
  height: number,
  padding: number = 0.1
): RadVizScales {
  // Domain bounds (0 to 1 in both dimensions for the circle)
  const domainMin = 0
  const domainMax = 1

  // Add padding
  const paddingAmount = (domainMax - domainMin) * padding
  const paddedMin = domainMin - paddingAmount
  const paddedMax = domainMax + paddingAmount

  // Compute scales maintaining aspect ratio (1:1 for circle)
  const minDim = Math.min(width, height)
  const offsetX = (width - minDim) / 2
  const offsetY = (height - minDim) / 2

  return {
    xScale: scaleLinear()
      .domain([paddedMin, paddedMax])
      .range([offsetX, offsetX + minDim]),
    yScale: scaleLinear()
      .domain([paddedMin, paddedMax])
      .range([offsetY + minDim, offsetY])  // Invert Y for SVG
  }
}

/**
 * Generate SVG path string for the RadViz circle outline.
 *
 * @param scales - RadViz scales for coordinate conversion
 * @returns SVG circle parameters (cx, cy, r in pixel coordinates)
 */
export function getRadVizCircleParams(scales: RadVizScales): { cx: number; cy: number; r: number } {
  const cx = scales.xScale(RADVIZ_CIRCLE.center.x)
  const cy = scales.yScale(RADVIZ_CIRCLE.center.y)
  // Radius in pixels (use x scale since aspect ratio is 1:1)
  const r = Math.abs(scales.xScale(RADVIZ_CIRCLE.center.x + RADVIZ_CIRCLE.radius) - cx)

  return { cx, cy, r }
}

/**
 * Get anchor position in pixel coordinates.
 *
 * @param anchorKey - The anchor category key
 * @param scales - RadViz scales for coordinate conversion
 * @returns Pixel coordinates for the anchor
 */
export function getAnchorPixelPosition(
  anchorKey: string,
  scales: RadVizScales
): { x: number; y: number } | null {
  const anchor = RADVIZ_ANCHORS[anchorKey]
  if (!anchor) return null

  return {
    x: scales.xScale(anchor.x),
    y: scales.yScale(anchor.y)
  }
}

/**
 * Batch compute RadViz positions for multiple features.
 *
 * @param decisionMargins - Map of featureId to decision scores per category
 * @param featureIds - List of feature IDs to compute positions for
 * @returns Array of RadViz points (only for features with decision scores)
 */
export function computeRadVizPositions(
  decisionMargins: Map<number, Record<string, number>>,
  featureIds: number[]
): RadVizPoint[] {
  const points: RadVizPoint[] = []

  for (const featureId of featureIds) {
    const scores = decisionMargins.get(featureId)
    if (scores) {
      points.push(computeRadVizPosition(featureId, scores))
    }
  }

  return points
}

/**
 * Get anchor label display name.
 */
export function getAnchorDisplayName(category: string): string {
  switch (category) {
    case 'noisy-activation': return 'Noisy Activation'
    case 'missed-N-gram': return 'Missed Syntax'
    case 'missed-context': return 'Missed Context'
    default: return category
  }
}

/**
 * Convert CauseCategory to RadViz anchor key.
 */
export function causeCategoryToAnchorKey(category: CauseCategory): string | null {
  if (category === 'noisy-activation' || category === 'missed-N-gram' || category === 'missed-context') {
    return category
  }
  return null
}

// ============================================================================
// HEXBIN AGGREGATION
// ============================================================================

export interface HexbinData {
  cx: number                          // Hex center x (pixels)
  cy: number                          // Hex center y (pixels)
  count: number                       // Features in bin
  dominantCategory: string            // Majority-vote category
  color: string                       // Color for dominant category
  featureIds: number[]                // Feature IDs in bin
  categoryCounts: Record<string, number>  // Breakdown per category
}

/**
 * Aggregate RadViz points into hexbin cells.
 * Each hex is colored by majority-vote category and opacity-scaled by count.
 *
 * @param points - RadViz points to bin
 * @param scales - Pixel coordinate scales
 * @param hexRadius - Hex cell radius in pixels
 * @param getCategory - Function to get category for a feature ID
 * @param getColor - Function to get color for a category
 * @param excludeFeatureIds - Feature IDs to exclude (manually tagged, rendered individually)
 * @returns Array of HexbinData for rendering
 */
export function computeHexbinData(
  points: RadVizPoint[],
  scales: RadVizScales,
  hexRadius: number,
  getCategory: (featureId: number) => string,
  getColor: (category: string) => string,
  excludeFeatureIds?: Set<number>
): HexbinData[] {
  // Convert to pixel coordinates, filtering out excluded IDs
  const pixelPoints: [number, number, number][] = []  // [px, py, featureId]
  for (const point of points) {
    if (excludeFeatureIds?.has(point.feature_id)) continue
    pixelPoints.push([
      scales.xScale(point.x),
      scales.yScale(point.y),
      point.feature_id
    ])
  }

  if (pixelPoints.length === 0) return []

  // Create hexbin layout
  const hexbin = d3Hexbin<[number, number, number]>()
    .radius(hexRadius)
    .x(d => d[0])
    .y(d => d[1])

  const bins = hexbin(pixelPoints)

  return bins.map(bin => {
    // Count categories in this bin
    const categoryCounts: Record<string, number> = {}
    const featureIds: number[] = []

    for (const d of bin) {
      const fid = d[2]
      featureIds.push(fid)
      const cat = getCategory(fid)
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }

    // Majority vote
    let dominantCategory = 'unsure'
    let maxCount = 0
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > maxCount) {
        maxCount = count
        dominantCategory = cat
      }
    }

    return {
      cx: bin.x,
      cy: bin.y,
      count: bin.length,
      dominantCategory,
      color: getColor(dominantCategory),
      featureIds,
      categoryCounts
    }
  })
}
