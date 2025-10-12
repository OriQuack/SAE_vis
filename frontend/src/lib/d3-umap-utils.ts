import { polygonHull, polygonCentroid } from 'd3-polygon'
import type { ClusterNode, UMAPPoint } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Zoom scale thresholds for cluster level switching
 * As user zooms in, progressively show more detailed cluster levels
 */
export const ZOOM_LEVEL_THRESHOLDS = [
  { level: 0, minScale: 0.5, maxScale: 2.0 },   // Wide view: level 0 clusters
  { level: 1, minScale: 2.0, maxScale: 5.0 },   // Medium zoom: level 1 clusters
  { level: 2, minScale: 5.0, maxScale: 8.0 }    // Close zoom: level 2 clusters
] as const

/**
 * Padding added to convex hulls (in pixels)
 * Provides tolerance since UMAP is 2D projection of high-dimensional clustering
 * Small value for precise borders that closely follow point distribution
 */
export const CLUSTER_HULL_PADDING = 5

/**
 * Color palette for cluster overlays
 * Extended from existing CLUSTER_COLORS to support more clusters
 */
export const CLUSTER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#6366f1', '#22c55e', '#eab308', '#f43f5e', '#a855f7',
  '#d946ef', '#0ea5e9', '#65a30d', '#fb923c', '#facc15'
] as const

// ============================================================================
// TYPES
// ============================================================================

export interface ClusterHull {
  clusterId: string
  points: Array<[number, number]>
  color: string
  pointCount: number
  isNoise: boolean
}

export interface ProcessedPoint {
  x: number
  y: number
  clusterId: string
}

// ============================================================================
// ZOOM LEVEL UTILITIES
// ============================================================================

/**
 * Determine current cluster level based on zoom scale
 *
 * @param zoomScale - Current d3.zoom transform scale
 * @returns Cluster level (0, 1, or 2)
 */
export function getClusterLevelFromZoom(zoomScale: number): number {
  for (const threshold of ZOOM_LEVEL_THRESHOLDS) {
    if (zoomScale >= threshold.minScale && zoomScale < threshold.maxScale) {
      return threshold.level
    }
  }

  // If scale is beyond max, return highest level
  if (zoomScale >= ZOOM_LEVEL_THRESHOLDS[ZOOM_LEVEL_THRESHOLDS.length - 1].maxScale) {
    return ZOOM_LEVEL_THRESHOLDS[ZOOM_LEVEL_THRESHOLDS.length - 1].level
  }

  // Default to level 0
  return 0
}

// ============================================================================
// CLUSTER FILTERING UTILITIES
// ============================================================================

/**
 * Filter cluster hierarchy by specific level
 *
 * @param hierarchy - Complete cluster hierarchy from backend
 * @param level - Target cluster level
 * @returns Filtered cluster nodes at specified level
 */
export function filterClustersByLevel(
  hierarchy: Record<string, ClusterNode>,
  level: number
): ClusterNode[] {
  return Object.values(hierarchy).filter(node => node.level === level)
}

/**
 * Get all points belonging to a specific cluster
 *
 * @param points - All UMAP points
 * @param clusterId - Target cluster ID
 * @returns Points in the specified cluster
 */
export function getPointsInCluster(
  points: UMAPPoint[],
  clusterId: string
): ProcessedPoint[] {
  return points
    .filter(point => point.cluster_id === clusterId)
    .map(point => ({
      x: point.umap_x,
      y: point.umap_y,
      clusterId: point.cluster_id
    }))
}

// ============================================================================
// HULL CALCULATION UTILITIES
// ============================================================================

/**
 * Calculate convex hull for a cluster with padding tolerance
 *
 * Since UMAP is a 2D projection of high-dimensional clustering,
 * points may not be spatially close in 2D. Padding provides visual tolerance.
 *
 * @param points - Points in pixel coordinates
 * @param padding - Padding in pixels (default: CLUSTER_HULL_PADDING)
 * @returns Hull points as [x, y] pairs, or null if hull cannot be calculated
 */
export function calculateClusterHull(
  points: ProcessedPoint[],
  padding: number = CLUSTER_HULL_PADDING
): Array<[number, number]> | null {
  // Need at least 3 points for a convex hull
  if (points.length < 3) {
    return null
  }

  // Convert to [x, y] tuples for d3-polygon
  const coords: Array<[number, number]> = points.map(p => [p.x, p.y])

  // Calculate convex hull
  const hull = polygonHull(coords)
  if (!hull || hull.length < 3) {
    return null
  }

  // Calculate centroid for expanding hull
  const centroid = polygonCentroid(hull)

  // Expand hull outward from centroid by padding amount
  const expandedHull = hull.map(([x, y]: [number, number]) => {
    const dx = x - centroid[0]
    const dy = y - centroid[1]
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Avoid division by zero for points at centroid
    if (distance < 0.001) {
      return [x, y] as [number, number]
    }

    // Scale point away from centroid
    const scale = (distance + padding) / distance
    return [
      centroid[0] + dx * scale,
      centroid[1] + dy * scale
    ] as [number, number]
  })

  return expandedHull
}

/**
 * Calculate hulls for all clusters at a specific level
 *
 * @param points - All UMAP points (already scaled to pixel coordinates)
 * @param clusters - Cluster nodes at target level
 * @param colorMap - Map of cluster IDs to colors
 * @param includeNoise - Whether to include noise clusters (default: false)
 * @returns Array of cluster hulls with metadata
 */
export function calculateClusterHulls(
  points: ProcessedPoint[],
  clusters: ClusterNode[],
  colorMap: Record<string, string>,
  includeNoise: boolean = false
): ClusterHull[] {
  const hulls: ClusterHull[] = []

  for (const cluster of clusters) {
    // Skip noise clusters unless explicitly included
    if (cluster.is_noise && !includeNoise) {
      continue
    }

    // Get points in this cluster
    const clusterPoints = points.filter(p => p.clusterId === cluster.cluster_id)

    // Calculate hull
    const hullPoints = calculateClusterHull(clusterPoints)

    // Skip if hull calculation failed
    if (!hullPoints) {
      continue
    }

    hulls.push({
      clusterId: cluster.cluster_id,
      points: hullPoints,
      color: colorMap[cluster.cluster_id] || '#94a3b8',
      pointCount: clusterPoints.length,
      isNoise: cluster.is_noise
    })
  }

  return hulls
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Generate consistent color map for cluster IDs
 *
 * Uses hash-based color assignment for consistency across renders
 *
 * @param clusterIds - Array of cluster IDs
 * @returns Map of cluster ID to color
 */
export function generateClusterColors(clusterIds: string[]): Record<string, string> {
  const colorMap: Record<string, string> = {}

  clusterIds.forEach((clusterId) => {
    // Use simple hash of cluster ID for consistent color
    const hash = clusterId.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0)
    }, 0)

    const colorIndex = hash % CLUSTER_COLORS.length
    colorMap[clusterId] = CLUSTER_COLORS[colorIndex]
  })

  return colorMap
}

/**
 * Convert SVG path data from hull points
 *
 * @param hullPoints - Array of [x, y] coordinates
 * @returns SVG path data string
 */
export function hullToPath(hullPoints: Array<[number, number]>): string {
  if (hullPoints.length === 0) return ''

  const [firstPoint, ...rest] = hullPoints
  const pathData = [
    `M${firstPoint[0]},${firstPoint[1]}`,
    ...rest.map(([x, y]) => `L${x},${y}`),
    'Z'  // Close path
  ].join(' ')

  return pathData
}
