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
// TYPES
// ============================================================================

export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context'

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
  const category = causeStates.get(featureId)

  if (!category) {
    return UMAP_UNTAGGED_COLOR
  }

  switch (category) {
    case 'noisy-activation':
      return colors.confirmed  // Purple: #CC79A7
    case 'missed-N-gram':
      return colors.expanded   // Orange: #E69F00
    case 'missed-context':
      return colors.rejected   // Vermillion: #D55E00
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

  return [
    { category: 'noisy-activation', color: colors.confirmed, label: 'Noisy Activation' },
    { category: 'missed-N-gram', color: colors.expanded, label: 'Missed N-gram' },
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
    { category: 'missed-N-gram', color: colors.expanded },
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
