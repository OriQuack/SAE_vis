// ============================================================================
// RADAR CHART UTILITIES
// D3-based radar chart calculations for metric signature visualization
// ============================================================================

import type { MetricSignature, MetricRange } from '../types'
import {
  METRIC_FEATURE_SPLITTING,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_QUALITY_SCORE,
  getMetricBaseColor
} from './constants'

// ============================================================================
// RADAR CHART CONFIGURATION
// ============================================================================

export const RADAR_CONFIG = {
  axes: 6,                // Number of axes (6 metrics)
  levels: 10,              // Number of concentric circles (0.2, 0.4, 0.6, 0.8, 1.0)
  maxValue: 1.0,          // Maximum value on each axis
  labelFactor: 1.25,      // How far outside the circle to place labels (increased from 1.15)
  dotRadius: 4,           // Radius of data point dots
  opacityArea: 0.2,       // Opacity of filled area
  strokeWidth: 2          // Width of radar outline
}

// ============================================================================
// RADAR METRICS - Built from centralized constants
// ============================================================================

/**
 * Get radar metrics configuration using centralized constants
 * Returns array of metrics with keys, labels, and colors
 *
 * Note: Keys match MetricSignature property names (e.g., 'embedding', 'fuzz', 'detection')
 * which differ from backend API metric names (e.g., 'score_embedding', 'score_fuzz', 'score_detection')
 */
export function getRadarMetrics() {
  return [
    {
      key: 'feature_splitting',  // MetricSignature property name
      label: 'FS',  // Abbreviated form (Feature Splitting)
      color: getMetricBaseColor(METRIC_FEATURE_SPLITTING)
    },
    {
      key: 'embedding',  // MetricSignature property name (not 'score_embedding')
      label: 'Embed',  // Abbreviated form (Embedding Score)
      color: getMetricBaseColor(METRIC_SCORE_EMBEDDING)
    },
    {
      key: 'fuzz',  // MetricSignature property name (not 'score_fuzz')
      label: 'Fuzz',  // Abbreviated form (Fuzz Score)
      color: getMetricBaseColor(METRIC_SCORE_FUZZ)
    },
    {
      key: 'detection',  // MetricSignature property name (not 'score_detection')
      label: 'Detection',  // Abbreviated form (Detection Score)
      color: getMetricBaseColor(METRIC_SCORE_DETECTION)
    },
    {
      key: 'semantic_similarity',  // MetricSignature property name
      label: 'SS',  // Abbreviated form (Semantic Similarity)
      color: getMetricBaseColor(METRIC_SEMANTIC_SIMILARITY)
    },
    {
      key: 'quality_score',  // MetricSignature property name
      label: 'QS',  // Abbreviated form (Quality Score)
      color: getMetricBaseColor(METRIC_QUALITY_SCORE)
    }
  ] as const
}

// Cache for radar metrics to avoid recreating the array on every call
// Exported for backward compatibility with existing components
export const RADAR_METRICS = getRadarMetrics()

// ============================================================================
// COORDINATE CALCULATIONS
// ============================================================================

/**
 * Convert polar coordinates to Cartesian
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param radius - Distance from center
 * @param angleInDegrees - Angle in degrees (0 = top, clockwise)
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  // Convert to radians and adjust so 0° is at top
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0

  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  }
}

/**
 * Calculate angle for axis index
 * Distributes axes evenly around circle (60° apart for 6 axes)
 */
export function getAxisAngle(axisIndex: number, totalAxes: number): number {
  return (360 / totalAxes) * axisIndex
}

/**
 * Calculate points for radar polygon
 * @param values - Array of 6 values (0-1 scale) for each axis
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param radius - Maximum radius
 */
export function calculateRadarPoints(
  values: number[],
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number }[] {
  return values.map((value, i) => {
    const angle = getAxisAngle(i, values.length)
    const pointRadius = radius * value
    return polarToCartesian(centerX, centerY, pointRadius, angle)
  })
}

/**
 * Convert array of points to SVG path string
 */
export function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''

  const pathParts = points.map((point, i) => {
    const command = i === 0 ? 'M' : 'L'
    return `${command} ${point.x},${point.y}`
  })

  return pathParts.join(' ') + ' Z'  // Close path
}

// ============================================================================
// RADAR CHART LAYOUT
// ============================================================================

export interface RadarChartLayout {
  width: number
  height: number
  centerX: number
  centerY: number
  radius: number
  axes: Array<{
    index: number
    key: string
    label: string
    angle: number
    labelPosition: { x: number; y: number }
    lineEnd: { x: number; y: number }
    color: string
  }>
  levels: Array<{
    level: number
    value: number
    radius: number
    points: { x: number; y: number }[]
  }>
}

/**
 * Calculate complete radar chart layout
 */
export function calculateRadarLayout(
  width: number,
  height: number,
  margin: number = 40
): RadarChartLayout {
  const centerX = width / 2
  const centerY = height / 2
  // Use width to determine radius for full width usage
  const radius = (width / 2) - margin

  // Calculate axes
  const axes = RADAR_METRICS.map((metric, index) => {
    const angle = getAxisAngle(index, RADAR_CONFIG.axes)
    const lineEnd = polarToCartesian(centerX, centerY, radius, angle)
    const labelPosition = polarToCartesian(
      centerX,
      centerY,
      radius * RADAR_CONFIG.labelFactor,
      angle
    )

    return {
      index,
      key: metric.key,
      label: metric.label,
      angle,
      lineEnd,
      labelPosition,
      color: metric.color
    }
  })

  // Calculate concentric levels
  const levels = Array.from({ length: RADAR_CONFIG.levels }, (_, i) => {
    const level = i + 1
    const value = (level / RADAR_CONFIG.levels) * RADAR_CONFIG.maxValue
    const levelRadius = (level / RADAR_CONFIG.levels) * radius

    // Calculate points for this level's polygon
    const points = axes.map(axis =>
      polarToCartesian(centerX, centerY, levelRadius, axis.angle)
    )

    return {
      level,
      value,
      radius: levelRadius,
      points
    }
  })

  return {
    width,
    height,
    centerX,
    centerY,
    radius,
    axes,
    levels
  }
}

// ============================================================================
// METRIC SIGNATURE VISUALIZATION
// ============================================================================

/**
 * Extract metric values from signature for radar visualization
 * Returns array of 6 values in correct order
 */
export function signatureToRadarValues(signature: MetricSignature): {
  min: number[]
  max: number[]
  center: number[]
} {
  const min: number[] = []
  const max: number[] = []
  const center: number[] = []

  RADAR_METRICS.forEach(metric => {
    const range = signature[metric.key as keyof MetricSignature]
    min.push(range.min)
    max.push(range.max)
    center.push((range.min + range.max) / 2)
  })

  return { min, max, center }
}

/**
 * Create radar values from object (for user interaction)
 */
export function createRadarValuesFromRanges(ranges: Record<string, MetricRange>): {
  min: number[]
  max: number[]
  center: number[]
} {
  const min: number[] = []
  const max: number[] = []
  const center: number[] = []

  RADAR_METRICS.forEach(metric => {
    const range = ranges[metric.key] || { min: 0, max: 1 }
    min.push(range.min)
    max.push(range.max)
    center.push((range.min + range.max) / 2)
  })

  return { min, max, center }
}

/**
 * Calculate radar area path for min-max range visualization
 * Creates a filled area between min and max polygons
 */
export function calculateRangeAreaPath(
  minValues: number[],
  maxValues: number[],
  centerX: number,
  centerY: number,
  radius: number
): string {
  const minPoints = calculateRadarPoints(minValues, centerX, centerY, radius)
  const maxPoints = calculateRadarPoints(maxValues, centerX, centerY, radius)

  // Create path that goes around min polygon, then max polygon in reverse
  const path: string[] = []

  // Start at first min point
  path.push(`M ${minPoints[0].x},${minPoints[0].y}`)

  // Draw min polygon
  for (let i = 1; i < minPoints.length; i++) {
    path.push(`L ${minPoints[i].x},${minPoints[i].y}`)
  }

  // Connect to max polygon at last point
  path.push(`L ${maxPoints[maxPoints.length - 1].x},${maxPoints[maxPoints.length - 1].y}`)

  // Draw max polygon in reverse
  for (let i = maxPoints.length - 2; i >= 0; i--) {
    path.push(`L ${maxPoints[i].x},${maxPoints[i].y}`)
  }

  // Explicitly connect back to first min point
  path.push(`L ${minPoints[0].x},${minPoints[0].y}`)

  // Close path
  path.push('Z')

  return path.join(' ')
}

// ============================================================================
// INTERACTION UTILITIES
// ============================================================================

/**
 * Calculate which axis a point is closest to
 * Used for interactive editing
 */
export function getClosestAxis(
  x: number,
  y: number,
  layout: RadarChartLayout
): { index: number; distance: number } | null {
  const dx = x - layout.centerX
  const dy = y - layout.centerY

  // Calculate angle from center (0° = top, clockwise)
  let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90
  if (angle < 0) angle += 360

  // Find closest axis
  let closestIndex = -1
  let minAngleDiff = Infinity

  layout.axes.forEach((axis, index) => {
    let angleDiff = Math.abs(angle - axis.angle)
    if (angleDiff > 180) angleDiff = 360 - angleDiff  // Wrap around

    if (angleDiff < minAngleDiff) {
      minAngleDiff = angleDiff
      closestIndex = index
    }
  })

  // Calculate distance from center
  const distance = Math.sqrt(dx * dx + dy * dy)

  return closestIndex >= 0
    ? { index: closestIndex, distance }
    : null
}

/**
 * Convert distance from center to metric value (0-1)
 */
export function distanceToValue(distance: number, radius: number): number {
  const value = distance / radius
  return Math.max(0, Math.min(1, value))  // Clamp to [0, 1]
}

/**
 * Snap value to nearest grid level (0.2, 0.4, 0.6, 0.8, 1.0)
 */
export function snapToGrid(value: number, gridSize: number = 0.2): number {
  return Math.round(value / gridSize) * gridSize
}
