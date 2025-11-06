import { scaleSqrt, scaleLinear } from 'd3-scale'

// ============================================================================
// CIRCLE ENCODING UTILITIES
// ============================================================================
// Size-based encoding for scores, opacity-based encoding for consistency
// Used in table visualizations (TablePanel, DecoderSimilarityTable)

/**
 * Circle size parameters
 */
const MIN_RADIUS = 1 // Minimum circle radius (px) for score = 0
const MAX_RADIUS = 10  // Maximum circle radius (px) for score = 1.0

/**
 * Opacity range for consistency encoding
 */
const MIN_OPACITY = 0.1  // Minimum opacity for high variance (low consistency)
const MAX_OPACITY = 1.0  // Maximum opacity for low variance (high consistency)

/**
 * Get circle radius based on score using square-root scale
 * for perceptually linear area growth
 *
 * @param score - Normalized score value (0-1)
 * @returns Circle radius in pixels (2-15px)
 *
 * @example
 * getCircleRadius(0)    // 2px  (area = 13px²)
 * getCircleRadius(0.5)  // 11px (area = 380px²) - ~50% of max area
 * getCircleRadius(1.0)  // 15px  (area = 707px²)
 */
export function getCircleRadius(score: number): number {
  // Clamp to valid range
  const clampedScore = Math.max(0, Math.min(1, score))

  // Square-root scale for perceptually linear area growth
  // Area is proportional to score: score 0.5 → area is ~50% of max
  const radiusScale = scaleSqrt<number>()
    .domain([0, 1])
    .range([MIN_RADIUS, MAX_RADIUS])

  return radiusScale(clampedScore)
}

/**
 * Statistics for calculating opacity from score range
 */
export interface ScoreStats {
  avg: number    // Average score (0-1)
  min: number    // Minimum score (0-1)
  max: number    // Maximum score (0-1)
}

/**
 * Get circle opacity based on score consistency (range)
 *
 * Consistency is encoded as:
 * - Single value (no range): opacity = 1.0 (fully opaque)
 * - Small range (high consistency): opacity → 1.0 (nearly opaque)
 * - Large range (low consistency): opacity → 0.3 (more transparent)
 *
 * @param scoreStats - Score statistics (avg, min, max)
 * @returns Opacity value (0.3-1.0)
 *
 * @example
 * getCircleOpacity({avg: 0.8, min: 0.8, max: 0.8})  // 1.0 (no variance)
 * getCircleOpacity({avg: 0.8, min: 0.75, max: 0.85}) // 0.9 (small range)
 * getCircleOpacity({avg: 0.5, min: 0.2, max: 0.8})  // 0.4 (large range)
 */
export function getCircleOpacity(scoreStats: ScoreStats | null): number {
  // Handle null/undefined
  if (!scoreStats) {
    return MAX_OPACITY  // Default to full opacity
  }

  const { min, max } = scoreStats

  // Calculate range (0 = perfect consistency, 1 = maximum variance)
  const range = max - min

  // If no variance (single value or identical values), full opacity
  if (range === 0) {
    return MAX_OPACITY
  }

  // Map range to opacity: larger range → lower opacity
  // Invert the scale: range 0 → opacity 1.0, range 1 → opacity 0.3
  const opacityScale = scaleLinear()
    .domain([0, 1])  // Range from 0 (consistent) to 1 (full variance)
    .range([MAX_OPACITY, MIN_OPACITY])  // Invert: consistent → opaque, variance → transparent

  const opacity = opacityScale(range)

  // Clamp to valid range
  return Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, opacity))
}

/**
 * Get base metric color (solid, without opacity suffix)
 *
 * Returns the solid base color for a metric, removing any opacity encoding.
 * This is used when size/opacity are encoding data dimensions instead of color.
 *
 * @param metricColor - Full color string (may include opacity like '#0072B280')
 * @returns Solid color without opacity (e.g., '#0072B2')
 *
 * @example
 * getMetricBaseColor('#0072B280')  // '#0072B2' (removes opacity)
 * getMetricBaseColor('#EE6677')    // '#EE6677' (no change)
 */
export function getMetricBaseColor(metricColor: string): string {
  // Remove opacity suffix if present (last 2 hex digits)
  // Pattern: #RRGGBBAA → #RRGGBB
  if (metricColor.length === 9 && metricColor.startsWith('#')) {
    return metricColor.slice(0, 7)  // Remove last 2 characters (opacity)
  }

  return metricColor
}

/**
 * Format tooltip text for circle encoding
 *
 * @param metricName - Display name of the metric
 * @param scoreStats - Score statistics
 * @param singleValue - If true, show single value instead of range
 * @returns Formatted tooltip string
 *
 * @example
 * formatCircleTooltip('Decoder Similarity', {avg: 0.85, min: 0.85, max: 0.85}, true)
 * // "Decoder Similarity: 0.850 (size = score, opacity = consistency)"
 *
 * formatCircleTooltip('Semantic Similarity', {avg: 0.75, min: 0.65, max: 0.85}, false)
 * // "Semantic Similarity: 0.750 (0.650 - 0.850)
 * //  Size = average score | Opacity = consistency (range: 0.200)"
 */
export function formatCircleTooltip(
  metricName: string,
  scoreStats: ScoreStats,
  singleValue: boolean = false
): string {
  const { avg, min, max } = scoreStats

  if (singleValue) {
    return `${metricName}: ${avg.toFixed(3)}\nSize = score | Opacity = consistency (full)`
  }

  const range = max - min
  return `${metricName}: ${avg.toFixed(3)} (${min.toFixed(3)} - ${max.toFixed(3)})\nSize = average score | Opacity = consistency (range: ${range.toFixed(3)})`
}
