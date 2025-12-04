// ============================================================================
// UMAP UTILITIES - Helper functions for UMAPScatter component
// ============================================================================

import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { extent } from 'd3-array'
import type { UmapPoint } from '../types'
import { getSelectionColors } from './color-utils'
import { UNSURE_GRAY } from './constants'

// ============================================================================
// TYPES
// ============================================================================

export type CauseCategory = 'noisy-activation' | 'missed-lexicon' | 'missed-context'

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
  const colors = getSelectionColors('cause')
  const category = causeStates.get(featureId)

  if (!category) {
    return UNSURE_GRAY
  }

  switch (category) {
    case 'noisy-activation':
      return colors.confirmed  // Purple: #CC79A7
    case 'missed-lexicon':
      return colors.expanded   // Orange: #E69F00
    case 'missed-context':
      return colors.rejected   // Vermillion: #D55E00
    default:
      return UNSURE_GRAY
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
  const colors = getSelectionColors('cause')

  return [
    { category: 'noisy-activation', color: colors.confirmed, label: 'Noisy Activation' },
    { category: 'missed-lexicon', color: colors.expanded, label: 'Missed Lexicon' },
    { category: 'missed-context', color: colors.rejected, label: 'Missed Context' },
    { category: 'unsure', color: UNSURE_GRAY, label: 'Untagged' }
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
