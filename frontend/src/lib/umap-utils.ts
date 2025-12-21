// ============================================================================
// UMAP UTILITIES - Helper functions for UMAPScatter component
// ============================================================================

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { extent } from 'd3-array'
import { contourDensity, type ContourMultiPolygon } from 'd3-contour'
import { geoPath } from 'd3-geo'
import type { UmapPoint } from '../types'
import { getSelectionColors } from './color-utils'

// Darker gray for untagged points in UMAP (more visible than UNSURE_GRAY)
const UMAP_UNTAGGED_COLOR = '#6b7280'

// ============================================================================
// BARYCENTRIC TRIANGLE CONSTANTS
// ============================================================================

/**
 * Barycentric triangle vertices for cause visualization.
 * These correspond to the triangle_vertices in preprocessing config.
 */
export const BARYCENTRIC_TRIANGLE = {
  vertices: {
    missedNgram: [0.0, 0.0] as [number, number],
    missedContext: [1.0, 0.0] as [number, number],
    noisyActivation: [0.5, 0.866] as [number, number]
  },
  // Centroid of the triangle (average of vertices)
  centroid: [0.5, 0.866 / 3] as [number, number],  // (0.5, ~0.289)
  // Bounds for the triangle coordinate space
  xMin: 0,
  xMax: 1,
  yMin: 0,
  yMax: 0.866
}

// ============================================================================
// TYPES
// ============================================================================

export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

// ============================================================================
// RADIAL SPREAD TRANSFORMATION
// ============================================================================

/** Spread method for barycentric points */
export type SpreadMethod = 'radial' | 'minmax' | 'stretch'

/**
 * Compute where a ray from origin in given direction intersects the triangle boundary.
 * Returns the parameter t such that origin + t * direction is on the edge.
 *
 * Triangle edges:
 * - Edge 1: (0,0) to (1,0) - bottom edge (y = 0)
 * - Edge 2: (1,0) to (0.5,0.866) - right edge
 * - Edge 3: (0.5,0.866) to (0,0) - left edge
 */
function rayTriangleIntersectionT(
  ox: number, oy: number,  // origin
  dx: number, dy: number   // direction (not normalized)
): number {
  const { vertices } = BARYCENTRIC_TRIANGLE
  const v0 = vertices.missedNgram      // (0, 0)
  const v1 = vertices.missedContext    // (1, 0)
  const v2 = vertices.noisyActivation  // (0.5, 0.866)

  // Check intersection with each edge, find minimum positive t
  let minT = Infinity

  // Helper: intersect ray with line segment (p1, p2)
  // Ray: P = O + t * D
  // Segment: Q = P1 + s * (P2 - P1), s in [0, 1]
  const intersectSegment = (p1: [number, number], p2: [number, number]): number | null => {
    const ex = p2[0] - p1[0]
    const ey = p2[1] - p1[1]

    // Solve: O + t*D = P1 + s*E
    // Cross product method: t = (P1 - O) x E / (D x E)
    const dCrossE = dx * ey - dy * ex
    if (Math.abs(dCrossE) < 1e-10) return null  // Parallel

    const px = p1[0] - ox
    const py = p1[1] - oy

    const t = (px * ey - py * ex) / dCrossE
    const s = (px * dy - py * dx) / dCrossE

    // Check t > 0 (forward direction) and s in [0, 1] (on segment)
    if (t > 1e-10 && s >= 0 && s <= 1) {
      return t
    }
    return null
  }

  // Edge 1: bottom (v0 to v1)
  const t1 = intersectSegment(v0, v1)
  if (t1 !== null && t1 < minT) minT = t1

  // Edge 2: right (v1 to v2)
  const t2 = intersectSegment(v1, v2)
  if (t2 !== null && t2 < minT) minT = t2

  // Edge 3: left (v2 to v0)
  const t3 = intersectSegment(v2, v0)
  if (t3 !== null && t3 < minT) minT = t3

  return minT
}

/**
 * Compute normalized radial coordinate for a point.
 * r = 0 at centroid, r = 1 at triangle edge.
 *
 * Math: r = d / D where d = distance to centroid, D = distance to edge
 * Since D = tEdge * d, we have r = 1 / tEdge
 */
function computeNormalizedRadius(
  x: number, y: number,
  cx: number, cy: number
): { r: number; dx: number; dy: number; tEdge: number } {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 1e-10) {
    return { r: 0, dx: 0, dy: 0, tEdge: 1 }
  }

  const tEdge = rayTriangleIntersectionT(cx, cy, dx, dy)
  const r = 1 / tEdge  // normalized radial distance

  return { r, dx, dy, tEdge }
}

/**
 * Spread barycentric points using various scaling methods.
 *
 * Three methods available:
 *
 * 'radial' (uniform scaling):
 *   - Computes a single scale factor so the outermost point just reaches the edge
 *   - All points scaled by the same factor
 *   - Preserves relative distances from centroid
 *
 * 'minmax' (radial min-max normalization):
 *   - Normalizes radial distances so points span from near-centroid to edge
 *   - Each point's normalized radius r ∈ [rMin, rMax] is mapped to [0.02, 1]
 *   - Points spread to fill the full radial range
 *   - Preserves angular relationships (direction from centroid)
 *
 * 'stretch' (independent axis scaling):
 *   - Scales X and Y independently to fill the triangle bounding box
 *   - Maximizes spread but distorts aspect ratios
 *   - Some points may end up outside triangle edges (in bounding box corners)
 *
 * @param points - Array of UMAP points with barycentric coordinates
 * @param method - 'radial', 'minmax', or 'stretch'
 * @returns Transformed points with spread coordinates
 */
export function spreadBarycentricPoints(
  points: UmapPoint[],
  method: SpreadMethod = 'radial'
): UmapPoint[] {
  if (points.length === 0) return points

  const [cx, cy] = BARYCENTRIC_TRIANGLE.centroid

  if (method === 'minmax') {
    return spreadMinMax(points, cx, cy)
  } else if (method === 'stretch') {
    return spreadStretch(points)
  } else {
    return spreadRadial(points, cx, cy)
  }
}

/**
 * Uniform radial scaling - all points scaled by same factor.
 */
function spreadRadial(points: UmapPoint[], cx: number, cy: number): UmapPoint[] {
  // First pass: find the maximum uniform scale factor
  let globalMaxScale = Infinity

  for (const point of points) {
    const dx = point.x - cx
    const dy = point.y - cy
    const currentDist = Math.sqrt(dx * dx + dy * dy)

    // Skip points at or very near the centroid
    if (currentDist < 1e-10) continue

    // Find where ray from centroid through this point hits the triangle edge
    const tToEdge = rayTriangleIntersectionT(cx, cy, dx, dy)
    if (tToEdge === Infinity) continue

    // Max scale for this point = tToEdge (distance to edge / current distance)
    if (tToEdge < globalMaxScale) {
      globalMaxScale = tToEdge
    }
  }

  // If all points are at centroid or no valid scale found, return unchanged
  if (globalMaxScale === Infinity || globalMaxScale <= 1) {
    return points
  }

  // Second pass: apply the uniform scale to all points
  const transformPoint = (x: number, y: number): { x: number, y: number } => {
    const dx = x - cx
    const dy = y - cy
    return {
      x: cx + globalMaxScale * dx,
      y: cy + globalMaxScale * dy
    }
  }

  return points.map(p => {
    const newPos = transformPoint(p.x, p.y)
    return {
      ...p,
      x: newPos.x,
      y: newPos.y,
      explainer_positions: p.explainer_positions?.map(ep => {
        const epPos = transformPoint(ep.x, ep.y)
        return { ...ep, x: epPos.x, y: epPos.y }
      })
    }
  })
}

/**
 * Radial min-max normalization - spread radii to fill [rMin_target, 1].
 *
 * For each point:
 *   r = normalized radial distance (0 at centroid, 1 at edge)
 *   r' = (r - rMin) / (rMax - rMin)  -- normalized to [0, 1]
 *   r'' = rMin_target + r' * (1 - rMin_target)  -- mapped to [rMin_target, 1]
 *   newPos = centroid + r'' * tEdge * direction
 *
 * This ensures:
 *   - Innermost point moves to rMin_target (not collapsed to centroid)
 *   - Outermost point moves to edge (r'' = 1)
 *   - Angular relationships preserved
 */
function spreadMinMax(points: UmapPoint[], cx: number, cy: number): UmapPoint[] {
  // Small margin to prevent innermost point from collapsing to centroid
  const rMinTarget = 0.02

  // First pass: find min and max normalized radii across all points
  let rMin = Infinity
  let rMax = -Infinity

  for (const point of points) {
    const { r } = computeNormalizedRadius(point.x, point.y, cx, cy)
    if (r > 1e-10) {  // Skip points exactly at centroid
      if (r < rMin) rMin = r
      if (r > rMax) rMax = r
    }
  }

  // Edge cases: all points at centroid, or all at same radius
  if (rMin === Infinity || rMax === -Infinity || rMax - rMin < 1e-10) {
    return points
  }

  // Transform function: normalize radius to [rMinTarget, 1]
  const transformPoint = (x: number, y: number): { x: number, y: number } => {
    const { r, dx, dy, tEdge } = computeNormalizedRadius(x, y, cx, cy)

    // Points at centroid stay at centroid
    if (r < 1e-10) {
      return { x: cx, y: cy }
    }

    // Normalize r from [rMin, rMax] to [0, 1], then map to [rMinTarget, 1]
    const rNorm = (r - rMin) / (rMax - rMin)
    const rNew = rMinTarget + rNorm * (1 - rMinTarget)

    // New position: move to rNew fraction of the way to the edge
    // Current position is at r = 1/tEdge fraction of the way to edge
    // New distance = rNew * distToEdge = rNew * tEdge * currentDist
    // Scale = rNew * tEdge / 1 = rNew * tEdge (relative to direction vector)
    const scale = rNew * tEdge

    return {
      x: cx + scale * dx,
      y: cy + scale * dy
    }
  }

  return points.map(p => {
    const newPos = transformPoint(p.x, p.y)
    return {
      ...p,
      x: newPos.x,
      y: newPos.y,
      explainer_positions: p.explainer_positions?.map(ep => {
        const epPos = transformPoint(ep.x, ep.y)
        return { ...ep, x: epPos.x, y: epPos.y }
      })
    }
  })
}

/**
 * Independent axis scaling - stretch X and Y to fill triangle bounding box.
 *
 * Simple min-max normalization on each axis independently:
 *   x' = (x - xMin) / (xMax - xMin) * targetWidth + targetXMin
 *   y' = (y - yMin) / (yMax - yMin) * targetHeight + targetYMin
 *
 * This maximizes spread but:
 *   - Distorts aspect ratios (circles become ellipses)
 *   - Points in corners of bounding box may fall outside triangle edges
 */
function spreadStretch(points: UmapPoint[]): UmapPoint[] {
  // Find data extent
  let xMin = Infinity, xMax = -Infinity
  let yMin = Infinity, yMax = -Infinity

  for (const point of points) {
    if (point.x < xMin) xMin = point.x
    if (point.x > xMax) xMax = point.x
    if (point.y < yMin) yMin = point.y
    if (point.y > yMax) yMax = point.y
  }

  // Handle edge cases
  const xRange = xMax - xMin
  const yRange = yMax - yMin
  if (xRange < 1e-10 && yRange < 1e-10) {
    return points  // All points at same location
  }

  // Target bounds (triangle bounding box with small margin)
  const margin = 0.02
  const targetXMin = BARYCENTRIC_TRIANGLE.xMin + margin
  const targetXMax = BARYCENTRIC_TRIANGLE.xMax - margin
  const targetYMin = BARYCENTRIC_TRIANGLE.yMin + margin
  const targetYMax = BARYCENTRIC_TRIANGLE.yMax - margin

  const targetXRange = targetXMax - targetXMin
  const targetYRange = targetYMax - targetYMin

  // Compute scales (handle zero range by centering)
  const xScale = xRange > 1e-10 ? targetXRange / xRange : 0
  const yScale = yRange > 1e-10 ? targetYRange / yRange : 0
  const xOffset = xRange > 1e-10 ? targetXMin - xMin * xScale : (targetXMin + targetXMax) / 2
  const yOffset = yRange > 1e-10 ? targetYMin - yMin * yScale : (targetYMin + targetYMax) / 2

  // Transform function
  const transformPoint = (x: number, y: number): { x: number, y: number } => ({
    x: xScale > 0 ? x * xScale + xOffset : xOffset,
    y: yScale > 0 ? y * yScale + yOffset : yOffset
  })

  return points.map(p => {
    const newPos = transformPoint(p.x, p.y)
    return {
      ...p,
      x: newPos.x,
      y: newPos.y,
      explainer_positions: p.explainer_positions?.map(ep => {
        const epPos = transformPoint(ep.x, ep.y)
        return { ...ep, x: epPos.x, y: epPos.y }
      })
    }
  })
}

export interface UmapScales {
  xScale: ScaleLinear<number, number>
  yScale: ScaleLinear<number, number>
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Get color for a feature based on its cause category.
 * Uses centralized colors from getSelectionColors('cause').
 *
 * @param featureId - The feature ID
 * @param causeStates - Map of feature IDs to cause categories
 * @returns Hex color string
 */
export function getCauseColor(
  featureId: number,
  causeStates: Map<number, CauseCategory>
): string {
  const colors = getSelectionColors('stage3')
  const stage2Colors = getSelectionColors('stage2')
  const category = causeStates.get(featureId)

  if (!category) {
    return UMAP_UNTAGGED_COLOR
  }

  switch (category) {
    case 'noisy-activation':
      return colors.confirmed  // Purple: #CC79A7
    case 'missed-N-gram':
      return colors.autoSelected   // Orange: #E69F00
    case 'missed-context':
      return colors.rejected   // Vermillion: #D55E00
    case 'well-explained':
      return stage2Colors.confirmed  // Green: #009E73
    default:
      return UMAP_UNTAGGED_COLOR
  }
}

/**
 * Get all cause category colors for legend.
 *
 * @returns Array of {category, color, label} objects
 */
export function getCauseCategoryLegend(): Array<{
  category: CauseCategory | 'unsure'
  color: string
  label: string
}> {
  const colors = getSelectionColors('stage3')
  const stage2Colors = getSelectionColors('stage2')

  return [
    { category: 'well-explained', color: stage2Colors.confirmed, label: 'Well-Explained' },
    { category: 'noisy-activation', color: colors.confirmed, label: 'Noisy Activation' },
    { category: 'missed-N-gram', color: colors.autoSelected, label: 'Pattern Miss' },
    { category: 'missed-context', color: colors.rejected, label: 'Context Miss' },
    { category: 'unsure', color: UMAP_UNTAGGED_COLOR, label: 'Untagged' }
  ]
}

// ============================================================================
// SCALE UTILITIES
// ============================================================================

/**
 * Compute D3 scales for UMAP coordinates.
 * Adds padding around the data extent for better visualization.
 *
 * @param points - Array of UMAP points
 * @param width - Chart width in pixels
 * @param height - Chart height in pixels
 * @param padding - Padding around data extent (default 0.1 = 10%)
 * @returns Object with xScale and yScale
 */
export function computeUmapScales(
  points: UmapPoint[],
  width: number,
  height: number,
  padding: number = 0.1
): UmapScales {
  if (points.length === 0) {
    return {
      xScale: scaleLinear().domain([0, 1]).range([0, width]),
      yScale: scaleLinear().domain([0, 1]).range([height, 0])
    }
  }

  const xExtent = extent(points, d => d.x) as [number, number]
  const yExtent = extent(points, d => d.y) as [number, number]

  const xRange = xExtent[1] - xExtent[0]
  const yRange = yExtent[1] - yExtent[0]

  const xPadding = xRange * padding
  const yPadding = yRange * padding

  return {
    xScale: scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, width]),
    yScale: scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([height, 0])  // Invert Y for SVG coordinate system
  }
}

/**
 * Compute D3 scales for barycentric triangle coordinates.
 * Uses fixed triangle bounds to ensure the visualization uses the full space
 * and maintains proper aspect ratio for an equilateral triangle.
 *
 * @param width - Chart width in pixels
 * @param height - Chart height in pixels
 * @param padding - Padding around triangle bounds (default 0.05 = 5%)
 * @returns Object with xScale and yScale
 */
export function computeBarycentricScales(
  width: number,
  height: number,
  padding: number = 0.05
): UmapScales {
  const { xMin, xMax, yMin, yMax } = BARYCENTRIC_TRIANGLE

  // Add padding
  const xPadding = (xMax - xMin) * padding
  const yPadding = (yMax - yMin) * padding

  const domainWidth = xMax - xMin + 2 * xPadding
  const domainHeight = yMax - yMin + 2 * yPadding

  // Compute scales maintaining aspect ratio
  const aspectRatio = domainWidth / domainHeight
  const chartAspectRatio = width / height

  let effectiveWidth = width
  let effectiveHeight = height
  let offsetX = 0
  let offsetY = 0

  if (chartAspectRatio > aspectRatio) {
    // Chart is wider than needed - center horizontally
    effectiveWidth = height * aspectRatio
    offsetX = (width - effectiveWidth) / 2
  } else {
    // Chart is taller than needed - center vertically
    effectiveHeight = width / aspectRatio
    offsetY = (height - effectiveHeight) / 2
  }

  return {
    xScale: scaleLinear()
      .domain([xMin - xPadding, xMax + xPadding])
      .range([offsetX, offsetX + effectiveWidth]),
    yScale: scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([offsetY + effectiveHeight, offsetY])  // Invert Y for SVG
  }
}

/**
 * Generate SVG path string for the barycentric triangle outline.
 *
 * @param scales - UMAP scales for coordinate conversion
 * @returns SVG path string for the triangle
 */
export function getTrianglePathString(scales: UmapScales): string {
  const { vertices } = BARYCENTRIC_TRIANGLE

  const p1 = [scales.xScale(vertices.missedNgram[0]), scales.yScale(vertices.missedNgram[1])]
  const p2 = [scales.xScale(vertices.missedContext[0]), scales.yScale(vertices.missedContext[1])]
  const p3 = [scales.xScale(vertices.noisyActivation[0]), scales.yScale(vertices.noisyActivation[1])]

  return `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} Z`
}

// ============================================================================
// BRUSH UTILITIES
// ============================================================================

/**
 * Find feature IDs within a brush selection.
 *
 * @param points - Array of UMAP points
 * @param selection - D3 brush selection [[x0, y0], [x1, y1]] in pixel coordinates
 * @param scales - UMAP scales for coordinate conversion
 * @returns Set of feature IDs within the selection
 */
export function getFeatureIdsInBrushSelection(
  points: UmapPoint[],
  selection: [[number, number], [number, number]] | null,
  scales: UmapScales
): Set<number> {
  if (!selection) {
    return new Set()
  }

  const [[x0, y0], [x1, y1]] = selection

  const selectedIds = new Set<number>()

  for (const point of points) {
    const px = scales.xScale(point.x)
    const py = scales.yScale(point.y)

    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
      selectedIds.add(point.feature_id)
    }
  }

  return selectedIds
}

// ============================================================================
// POINT STYLING
// ============================================================================

/**
 * Point radius configuration
 */
export const UMAP_POINT_CONFIG = {
  radius: 4,
  radiusHovered: 6,
  radiusBrushed: 5,
  strokeWidth: 1,
  strokeWidthBrushed: 2,
  opacity: 0.8,
  opacityDimmed: 0.3,
  transitionDuration: 150
}

/**
 * Determine if a point should be dimmed based on brush selection.
 *
 * @param featureId - The feature ID
 * @param brushedIds - Set of brushed feature IDs (empty = no dimming)
 * @returns true if the point should be dimmed
 */
export function isPointDimmed(
  featureId: number,
  brushedIds: Set<number>
): boolean {
  // If no brush selection, nothing is dimmed
  if (brushedIds.size === 0) {
    return false
  }

  // Point is dimmed if it's NOT in the brush selection
  return !brushedIds.has(featureId)
}

// ============================================================================
// DENSITY CONTOUR UTILITIES
// ============================================================================

export interface CategoryContour {
  category: CauseCategory | 'unsure'
  color: string
  contours: ContourMultiPolygon[]
  paths: string[]
}

/**
 * Compute density contours for each cause category.
 * Uses KDE (Kernel Density Estimation) via d3-contour.
 *
 * @param points - Array of UMAP points
 * @param causeStates - Map of feature IDs to cause categories
 * @param width - Chart width in pixels
 * @param height - Chart height in pixels
 * @param scales - UMAP scales for coordinate conversion
 * @param bandwidth - KDE bandwidth (default 20)
 * @param thresholds - Number of contour levels (default 4)
 * @returns Array of CategoryContour objects
 */
export function computeCategoryContours(
  points: UmapPoint[],
  causeStates: Map<number, CauseCategory>,
  width: number,
  height: number,
  scales: UmapScales,
  bandwidth: number = 20,
  thresholds: number = 4
): CategoryContour[] {
  const colors = getSelectionColors('stage3')
  const pathGenerator = geoPath()

  // Group points by category
  const categories: Array<{ category: CauseCategory | 'unsure', color: string }> = [
    { category: 'noisy-activation', color: colors.confirmed },
    { category: 'missed-N-gram', color: colors.autoSelected },
    { category: 'missed-context', color: colors.rejected },
    { category: 'unsure', color: UMAP_UNTAGGED_COLOR }
  ]

  const result: CategoryContour[] = []

  for (const { category, color } of categories) {
    // Filter points for this category
    const categoryPoints = points.filter(p => {
      const state = causeStates.get(p.feature_id)
      if (category === 'unsure') {
        return !state
      }
      return state === category
    })

    // Need at least 3 points for meaningful contours
    if (categoryPoints.length < 3) {
      result.push({ category, color, contours: [], paths: [] })
      continue
    }

    // Convert to pixel coordinates
    const pixelPoints = categoryPoints.map(p => [
      scales.xScale(p.x),
      scales.yScale(p.y)
    ] as [number, number])

    // Compute density contours
    const density = contourDensity<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .size([width, height])
      .bandwidth(bandwidth)
      .thresholds(thresholds)

    const contours = density(pixelPoints)

    // Convert contours to SVG paths
    const paths = contours.map(c => pathGenerator(c) || '')

    result.push({ category, color, contours, paths })
  }

  return result
}

/**
 * Contour rendering configuration
 */
export const CONTOUR_CONFIG = {
  fillOpacity: 0.12,
  strokeOpacity: 0.5,
  strokeWidth: 1,
  // Opacity multipliers for each contour level (outer to inner)
  // More levels for detailed contours
  levelOpacities: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 1.0]
}
