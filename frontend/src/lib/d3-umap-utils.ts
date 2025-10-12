import { polygonHull, polygonCentroid } from 'd3-polygon'
import type { ClusterNode, UMAPPoint } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Zoom scale thresholds for cluster level switching
 * As user zooms in, progressively show more detailed cluster levels
 * Note: Level 0 (root cluster) is excluded as it contains all features
 */
export const ZOOM_LEVEL_THRESHOLDS = [
  { level: 1, minScale: 0, maxScale: 2.0 },     // Default zoom: level 1 clusters
  { level: 2, minScale: 2.0, maxScale: 3 },   // Medium zoom: level 2 clusters
  { level: 3, minScale: 3, maxScale: 8.0 }    // Close zoom: level 3 clusters (leaf)
] as const

/**
 * Padding added to convex hulls (in pixels)
 * Provides tolerance since UMAP is 2D projection of high-dimensional clustering
 * Small value for precise borders that closely follow point distribution
 */
export const CLUSTER_HULL_PADDING = 5

/**
 * Outlier threshold multiplier for hull calculation
 * Points beyond (mean + k*std) distance from centroid are excluded
 * Higher value = more tolerant of outliers
 */
export const OUTLIER_THRESHOLD_MULTIPLIER = 2.5

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
  label: string | null
}

export interface ClusterLabel {
  clusterId: string
  text: string
  x: number
  y: number
  color: string
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
 * @returns Cluster level (1, 2, or 3) - level 0 excluded
 */
export function getClusterLevelFromZoom(zoomScale: number): number {
  for (const threshold of ZOOM_LEVEL_THRESHOLDS) {
    if (zoomScale >= threshold.minScale && zoomScale < threshold.maxScale) {
      return threshold.level
    }
  }

  // If scale is beyond max, return highest level (3)
  if (zoomScale >= ZOOM_LEVEL_THRESHOLDS[ZOOM_LEVEL_THRESHOLDS.length - 1].maxScale) {
    return ZOOM_LEVEL_THRESHOLDS[ZOOM_LEVEL_THRESHOLDS.length - 1].level
  }

  // Default to level 1 (first meaningful level)
  return 1
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
 * Filter points by cluster level
 *
 * Since the new parquet structure has multiple rows per feature (one per hierarchy level),
 * we need to filter to only show points at the target level.
 *
 * @param points - All UMAP points
 * @param level - Target cluster level
 * @returns Points at the specified level
 */
export function filterPointsByLevel(
  points: UMAPPoint[],
  level: number
): UMAPPoint[] {
  return points.filter(point => point.cluster_level === level)
}

/**
 * Get effective clusters for display - includes target level clusters
 * and parent clusters that have no children at any intermediate level
 *
 * @param hierarchy - Complete cluster hierarchy
 * @param targetLevel - Target cluster level for zoom
 * @returns Clusters that should be displayed (mix of levels)
 */
export function getEffectiveClusters(
  hierarchy: Record<string, ClusterNode>,
  targetLevel: number
): ClusterNode[] {
  const targetLevelClusters = filterClustersByLevel(hierarchy, targetLevel)

  // Find parent clusters (level < targetLevel) with no children at any level <= targetLevel
  const parentClusters = Object.values(hierarchy).filter(node => {
    if (node.level >= targetLevel) return false

    // Check if any direct children exist at or below target level
    // A parent should only be shown if ALL its children are beyond the target level
    const hasChildrenAtOrBelowTarget = node.children_ids.some(childId => {
      const child = hierarchy[childId]
      return child && child.level <= targetLevel
    })

    return !hasChildrenAtOrBelowTarget
  })

  return [...targetLevelClusters, ...parentClusters]
}

/**
 * Get points for effective clusters (handles mixed-level clusters)
 *
 * @param points - All UMAP points
 * @param effectiveClusters - Clusters to display (from getEffectiveClusters)
 * @returns Points belonging to effective clusters at appropriate levels
 */
export function getEffectivePoints(
  points: UMAPPoint[],
  effectiveClusters: ClusterNode[]
): UMAPPoint[] {
  const clusterLevelMap = new Map<string, number>()
  effectiveClusters.forEach(cluster => {
    clusterLevelMap.set(cluster.cluster_id, cluster.level)
  })

  return points.filter(point => {
    const expectedLevel = clusterLevelMap.get(point.cluster_id)
    return expectedLevel !== undefined && point.cluster_level === expectedLevel
  })
}

/**
 * Get most specific level for each unique UMAP point
 * Each point (identified by umap_id) appears at multiple levels - keep only the highest level
 *
 * @param points - All UMAP points
 * @returns Points at their most specific (highest) cluster level
 */
export function filterToMostSpecificLevel(points: UMAPPoint[]): UMAPPoint[] {
  const byUmapId = new Map<number, UMAPPoint>()

  points.forEach(point => {
    const existing = byUmapId.get(point.umap_id)
    if (!existing || point.cluster_level > existing.cluster_level) {
      byUmapId.set(point.umap_id, point)
    }
  })

  return Array.from(byUmapId.values())
}

/**
 * Get all points belonging to a specific cluster at a specific level
 *
 * @param points - All UMAP points
 * @param clusterId - Target cluster ID
 * @param level - Target cluster level
 * @returns Points in the specified cluster at the specified level
 */
export function getPointsInCluster(
  points: UMAPPoint[],
  clusterId: string,
  level?: number
): ProcessedPoint[] {
  let filteredPoints = points.filter(point => point.cluster_id === clusterId)

  // If level is specified, filter by level as well
  if (level !== undefined) {
    filteredPoints = filteredPoints.filter(point => point.cluster_level === level)
  }

  return filteredPoints.map(point => ({
    x: point.umap_x,
    y: point.umap_y,
    clusterId: point.cluster_id
  }))
}

// ============================================================================
// HULL CALCULATION UTILITIES
// ============================================================================

/**
 * Filter outlier points based on distance from centroid
 * Removes points that are too far from cluster center
 *
 * @param points - Points in pixel coordinates
 * @param thresholdMultiplier - Multiplier for std threshold (default: OUTLIER_THRESHOLD_MULTIPLIER)
 * @returns Filtered points without extreme outliers
 */
function filterOutlierPoints(
  points: ProcessedPoint[],
  thresholdMultiplier: number = OUTLIER_THRESHOLD_MULTIPLIER
): ProcessedPoint[] {
  // Need enough points for meaningful statistics
  if (points.length < 5) return points

  // Calculate centroid
  const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const centroidY = points.reduce((sum, p) => sum + p.y, 0) / points.length

  // Calculate distances from centroid
  const distances = points.map(p => {
    const dx = p.x - centroidX
    const dy = p.y - centroidY
    return Math.sqrt(dx * dx + dy * dy)
  })

  // Calculate mean and std of distances
  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length
  const variance = distances.reduce((sum, d) => sum + (d - mean) ** 2, 0) / distances.length
  const std = Math.sqrt(variance)

  // Filter points within threshold
  const threshold = mean + thresholdMultiplier * std
  return points.filter((_, i) => distances[i] <= threshold)
}

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

  // Filter outliers for more expressive hull
  const filteredPoints = filterOutlierPoints(points)
  if (filteredPoints.length < 3) {
    return null
  }

  // Convert to [x, y] tuples for d3-polygon
  const coords: Array<[number, number]> = filteredPoints.map(p => [p.x, p.y])

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
 * @param dataPoints - Original data points to extract cluster labels
 * @returns Array of cluster hulls with metadata
 */
export function calculateClusterHulls(
  points: ProcessedPoint[],
  clusters: ClusterNode[],
  colorMap: Record<string, string>,
  includeNoise: boolean = false,
  dataPoints?: UMAPPoint[]
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

    // Get label from data points
    let label: string | null = null
    if (dataPoints) {
      const pointWithLabel = dataPoints.find(p =>
        p.cluster_id === cluster.cluster_id &&
        p.cluster_label &&
        p.cluster_label !== 'noise'
      )
      label = pointWithLabel?.cluster_label || null
    }

    hulls.push({
      clusterId: cluster.cluster_id,
      points: hullPoints,
      color: colorMap[cluster.cluster_id] || '#94a3b8',
      pointCount: clusterPoints.length,
      isNoise: cluster.is_noise,
      label
    })
  }

  return hulls
}

/**
 * Calculate non-overlapping cluster labels
 * Uses greedy algorithm prioritizing larger clusters
 * Adjusts overlap detection based on zoom scale
 *
 * @param hulls - Cluster hulls with labels
 * @param zoomScale - Current zoom scale (default: 1)
 * @returns Array of positioned labels without overlaps
 */
export function calculateClusterLabels(hulls: ClusterHull[], zoomScale: number = 1): ClusterLabel[] {
  const labels: ClusterLabel[] = []
  const used: { x: number; y: number; w: number; h: number }[] = []

  // Filter and sort by size (larger clusters first)
  const sorted = [...hulls]
    .filter(h => h.label && !h.isNoise)
    .sort((a, b) => b.pointCount - a.pointCount)

  for (const hull of sorted) {
    const centroid = polygonCentroid(hull.points)
    const text = hull.label!

    // Adjust bounds based on zoom scale
    // When zoomed in (scale > 1), labels take less space in data coordinates
    // This allows more labels to fit without overlap
    const effectiveCharWidth = 8 / zoomScale
    const effectiveHeight = 20 / zoomScale

    // Estimate bounds with zoom-adjusted dimensions
    const w = Math.max(text.length * effectiveCharWidth, 40 / zoomScale)
    const h = effectiveHeight
    const bounds = { x: centroid[0] - w / 2, y: centroid[1] - h / 2, w, h }

    // Check overlap
    const overlaps = used.some(u =>
      !(bounds.x + bounds.w < u.x || u.x + u.w < bounds.x ||
        bounds.y + bounds.h < u.y || u.y + u.h < bounds.y)
    )

    if (!overlaps) {
      labels.push({
        clusterId: hull.clusterId,
        text,
        x: centroid[0],
        y: centroid[1],
        color: hull.color
      })
      used.push(bounds)
    }
  }

  return labels
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
