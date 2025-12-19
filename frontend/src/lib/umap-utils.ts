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
// BARYCENTRIC SPREAD TRANSFORMATION
// ============================================================================

/**
 * Convert 2D position to barycentric weights.
 * For triangle with vertices: (0,0), (1,0), (0.5, 0.866)
 */
function positionToBarycentric(x: number, y: number): [number, number, number] {
  const yMax = BARYCENTRIC_TRIANGLE.yMax
  const w3 = y / yMax  // noisy_activation weight
  const w2 = x - 0.5 * w3  // missed_context weight
  const w1 = 1 - w2 - w3  // missed_ngram weight
  return [w1, w2, w3]
}

/**
 * Convert barycentric weights to 2D position.
 * Note: w1 is not used directly since position only depends on w2 and w3
 * (w1 = 1 - w2 - w3 is implicit)
 */
function barycentricToPosition(_w1: number, w2: number, w3: number): { x: number, y: number } {
  const yMax = BARYCENTRIC_TRIANGLE.yMax
  return {
    x: w2 + 0.5 * w3,
    y: yMax * w3
  }
}

/**
 * Spread barycentric points using power transformation on weights.
 * This is mathematically principled:
 * - Works in the natural barycentric coordinate system
 * - Same transformation applied uniformly to all weights
 * - Guaranteed to stay inside the triangle
 * - Preserves ordinal relationships (if w1 > w2 before, still w1 > w2 after)
 *
 * @param points - Array of UMAP points with barycentric coordinates
 * @param power - Power for transformation (> 1 spreads toward vertices, < 1 concentrates toward center)
 * @returns Transformed points with spread coordinates
 */
export function spreadBarycentricPoints(
  points: UmapPoint[],
  power: number = 2.5  // > 1 pushes toward vertices, < 1 pushes toward center
): UmapPoint[] {
  if (points.length === 0) return points

  const transformPoint = (x: number, y: number): { x: number, y: number } => {
    // Convert to barycentric weights
    let [w1, w2, w3] = positionToBarycentric(x, y)

    // Clamp weights to valid range (handle numerical errors)
    w1 = Math.max(0, Math.min(1, w1))
    w2 = Math.max(0, Math.min(1, w2))
    w3 = Math.max(0, Math.min(1, w3))

    // Apply power transformation (spreads toward vertices when power > 1)
    const w1p = Math.pow(w1, power)
    const w2p = Math.pow(w2, power)
    const w3p = Math.pow(w3, power)

    // Re-normalize so weights sum to 1
    const sum = w1p + w2p + w3p
    if (sum === 0) return { x, y }  // Edge case: all weights were 0

    const w1n = w1p / sum
    const w2n = w2p / sum
    const w3n = w3p / sum

    // Convert back to 2D position
    return barycentricToPosition(w1n, w2n, w3n)
  }

  return points.map(p => {
    const newPos = transformPoint(p.x, p.y)
    return {
      ...p,
      x: newPos.x,
      y: newPos.y,
      explainer_positions: p.explainer_positions?.map(ep => {
        const epPos = transformPoint(ep.x, ep.y)
        return {
          ...ep,
          x: epPos.x,
          y: epPos.y
        }
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
    { category: 'missed-N-gram', color: colors.autoSelected, label: 'Missed N-gram' },
    { category: 'missed-context', color: colors.rejected, label: 'Missed Context' },
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
