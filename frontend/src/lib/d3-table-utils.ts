import type { FeatureTableRow, FeatureTableDataResponse, MetricNormalizationStats } from '../types'
import {
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_QUALITY_SCORE,
} from './constants'
import {
  getQualityScoreColor,
  getMetricColor
} from './utils'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HeaderCell {
  label: string
  title?: string  // Full name for hover tooltip
  colSpan: number
  rowSpan: number
  type: 'explainer' | 'metric' | 'scorer'
  explainerId?: string
  metricType?: 'explanation' | 'embedding' | 'fuzz' | 'detection'
  scorerId?: 's1' | 's2' | 's3'
}

export interface HeaderStructure {
  row1: HeaderCell[]  // Explainer names
  row2: HeaderCell[]  // Metric names
  row3: HeaderCell[]  // Scorer labels
}

export interface TableLayout {
  columnWidth: number
  totalColumns: number
  headerStructure: HeaderStructure
}

// ============================================================================
// MODEL NAME MAPPING
// ============================================================================

const MODEL_NAME_MAP: Record<string, string> = {
  'llama': 'Llama',
  'qwen': 'Qwen',
  'openai': 'OpenAI'
}

export function getExplainerDisplayName(explainerId: string): string {
  return MODEL_NAME_MAP[explainerId] || explainerId
}

// ============================================================================
// HELPER FUNCTIONS (INTERNAL UTILITIES)
// ============================================================================

/**
 * Calculate average of non-null values
 *
 * This helper consolidates the repeated averaging pattern used throughout the file.
 *
 * @param values - Array of values (may contain nulls)
 * @returns Average of non-null values, or null if no valid values
 */
function averageNonNull(values: (number | null)[]): number | null {
  const valid = values.filter(v => v !== null) as number[]
  if (valid.length === 0) return null
  return valid.reduce((sum, v) => sum + v, 0) / valid.length
}

/**
 * Normalize a score value using z-score + min-max normalization
 *
 * Flow: value -> z-score -> min-max normalization
 *
 * @param value - Raw score value
 * @param stats - Statistics containing mean, std, z_min, z_max
 * @returns Normalized value (0-1) or null if range is invalid
 */
export function normalizeScore(value: number, stats: MetricNormalizationStats): number | null {
  const { mean, std, z_min, z_max } = stats

  // Step 1: Calculate z-score
  const zScore = std > 0 ? (value - mean) / std : 0

  // Step 2: Min-max normalization of z-score
  const zRange = z_max - z_min
  if (zRange <= 0) return null
  return (zScore - z_min) / zRange
}



// ============================================================================
// DATA EXTRACTION HELPERS
// ============================================================================

/**
 * Extract score value from feature row for specific explainer, metric, and scorer
 *
 * @param row - Feature table row
 * @param explainerId - Explainer ID (llama, qwen, openai)
 * @param metricType - Metric type (embedding, fuzz, detection)
 * @param scorerId - Scorer ID (s1, s2, s3) - optional. If not provided for fuzz/detection, returns average
 * @returns Score value or null
 */
export function getScoreValue(
  row: FeatureTableRow,
  explainerId: string,
  metricType: typeof METRIC_SCORE_DETECTION | typeof METRIC_SCORE_EMBEDDING| typeof METRIC_SCORE_FUZZ,
  scorerId?: 's1' | 's2' | 's3'
): number | null {
  const explainerData = row.explainers[explainerId]
  if (!explainerData) return null

  if (metricType === METRIC_SCORE_EMBEDDING) {
    return explainerData.embedding
  }

  const scores = metricType === METRIC_SCORE_FUZZ ? explainerData.fuzz : explainerData.detection

  if (scorerId) {
    return scores[scorerId]
  }

  // No scorerId specified - return average of all available scorers
  return averageNonNull([scores.s1, scores.s2, scores.s3])
}

// ============================================================================
// TABLE SORTING UTILITIES
// ============================================================================

/**
 * Compare two values for sorting with proper null handling
 *
 * Null values are always placed at the end regardless of sort direction
 *
 * @param a - First value
 * @param b - Second value
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Comparison result (-1, 0, or 1)
 */
export function compareValues(
  a: number | null,
  b: number | null,
  direction: 'asc' | 'desc'
): number {
  // Handle null cases - always push to end
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1

  // Both values are numbers
  if (direction === 'asc') {
    return a - b
  } else {
    return b - a
  }
}

// ============================================================================
// QUALITY SCORE CALCULATION (FOR NEW TABLE LAYOUT)
// ============================================================================

/**
 * Calculate quality score from embedding, fuzz, and detection
 *
 * Process:
 * 1. Calculate z-score for each metric: (value - mean) / std
 * 2. Average the three z-scores
 * 3. Apply min-max normalization to averaged z-score using quality.z_min and quality.z_max
 *
 * @param embedding - Embedding score
 * @param fuzzScores - Fuzz scores from scorers (s1, s2, s3)
 * @param detectionScores - Detection scores from scorers (s1, s2, s3)
 * @param globalStats - Global normalization statistics (includes quality.z_min, quality.z_max)
 * @returns Quality score (0-1) or null if insufficient data
 */
export function calculateQualityScore(
  embedding: number | null,
  fuzzScores: { s1: number | null; s2: number | null; s3: number | null },
  detectionScores: { s1: number | null; s2: number | null; s3: number | null },
  globalStats: Record<string, MetricNormalizationStats>
): number | null {
  const zScores: number[] = []

  // Calculate z-score for embedding (not normalized yet)
  if (embedding !== null && globalStats.embedding) {
    const { mean, std } = globalStats.embedding
    const zScore = std > 0 ? (embedding - mean) / std : 0
    zScores.push(zScore)
  }

  // Calculate z-score for fuzz (average across scorers first)
  const fuzzAvg = averageNonNull([fuzzScores.s1, fuzzScores.s2, fuzzScores.s3])
  if (fuzzAvg !== null && globalStats.fuzz) {
    const { mean, std } = globalStats.fuzz
    const zScore = std > 0 ? (fuzzAvg - mean) / std : 0
    zScores.push(zScore)
  }

  // Calculate z-score for detection (average across scorers first)
  const detectionAvg = averageNonNull([detectionScores.s1, detectionScores.s2, detectionScores.s3])
  if (detectionAvg !== null && globalStats.detection) {
    const { mean, std } = globalStats.detection
    const zScore = std > 0 ? (detectionAvg - mean) / std : 0
    zScores.push(zScore)
  }

  // No valid z-scores
  if (zScores.length === 0) return null

  // Average the z-scores
  const avgZScore = zScores.reduce((sum, z) => sum + z, 0) / zScores.length

  // Normalize the averaged z-score using quality z_min and z_max
  if (!globalStats.overall || !globalStats.overall.z_min || !globalStats.overall.z_max) {
    // Fallback: if no overall stats, return null
    return null
  }

  const { z_min, z_max } = globalStats.overall
  const zRange = z_max - z_min
  if (zRange <= 0) return null

  return (avgZScore - z_min) / zRange
}


// ============================================================================
// FEATURE COLOR CALCULATION (For Gradient and Table Consistency)
// ============================================================================

/**
 * Calculate the aggregated color for a feature based on the selected metric.
 * This ensures consistency between table display and gradient visualization.
 *
 * @param feature - The feature row with all explainer data
 * @param sortBy - The metric to calculate color for
 * @param tableData - Full table data with global stats
 * @returns Color string for the feature, or transparent if no data
 */
export function calculateFeatureColor(
  feature: FeatureTableRow,
  sortBy: string,
  tableData: FeatureTableDataResponse
): string {
  // Score metrics
  const scoreMetrics = [
    METRIC_QUALITY_SCORE,
    METRIC_SCORE_EMBEDDING,
    METRIC_SCORE_FUZZ,
    METRIC_SCORE_DETECTION
  ]

  if (scoreMetrics.includes(sortBy)) {
    // Handle score metrics - average across explainers
    if (sortBy === METRIC_QUALITY_SCORE) {
      // Calculate quality score averaged across explainers
      const scores: number[] = []

      for (const explainerId of Object.keys(feature.explainers)) {
        const explainerData = feature.explainers[explainerId]
        if (!explainerData) continue

        const score = calculateQualityScore(
          explainerData.embedding,
          explainerData.fuzz,
          explainerData.detection,
          tableData.global_stats
        )

        if (score !== null) {
          scores.push(score)
        }
      }

      if (scores.length > 0) {
        const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length
        return getQualityScoreColor(avgScore)
      }
    } else {
      // Handle individual score metrics
      const scores: number[] = []
      const metricType = sortBy === METRIC_SCORE_EMBEDDING ? 'embedding' :
                        sortBy === METRIC_SCORE_FUZZ ? 'fuzz' : 'detection'

      for (const explainerId of Object.keys(feature.explainers)) {
        const scoreValue = getScoreValue(feature, explainerId, sortBy as any)
        if (scoreValue !== null && tableData.global_stats[metricType]) {
          const normalized = normalizeScore(scoreValue, tableData.global_stats[metricType])
          if (normalized !== null) {
            scores.push(normalized)
          }
        }
      }

      if (scores.length > 0) {
        const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length
        return getMetricColor(metricType as any, avgScore)
      }
    }
  }

  return 'transparent'
}

// ============================================================================
// SCORE CIRCLE VISUALIZATION (Z-SCORE COLORING)
// ============================================================================

export interface ScoreCircleData {
  value: number | null
  normalizedScore: number  // z-score
  color: string
  scorerId?: 's1' | 's2' | 's3'
}

// ============================================================================
// TABLE SORTING (CONSOLIDATED FROM table-sort-utils.ts)
// ============================================================================

/**
 * Calculate average quality score across all explainers for a feature
 *
 * @param feature - Feature row
 * @param globalStats - Global normalization statistics
 * @returns Average quality score or null
 */
function calculateAvgQualityScore(
  feature: FeatureTableRow,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): number | null {
  if (!globalStats) return null

  const explainerIds = Object.keys(feature.explainers)
  const scores: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateQualityScore(
      explainerData.embedding,
      explainerData.fuzz,
      explainerData.detection,
      globalStats
    )

    scores.push(score)
  }

  return averageNonNull(scores)
}

/**
 * Calculate quality score statistics across all explainers for a feature
 * Used for error bar visualization showing min, max, and average
 *
 * @param feature - Feature row
 * @param globalStats - Global normalization statistics
 * @returns Object with min, max, avg, count or null if no valid scores
 */
export function calculateQualityScoreStats(
  feature: FeatureTableRow,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): { min: number; max: number; avg: number; count: number } | null {
  if (!globalStats) return null

  const explainerIds = Object.keys(feature.explainers)
  const scores: number[] = []

  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateQualityScore(
      explainerData.embedding,
      explainerData.fuzz,
      explainerData.detection,
      globalStats
    )

    if (score !== null) {
      scores.push(score)
    }
  }

  if (scores.length === 0) return null

  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    count: scores.length
  }
}


/**
 * Calculate average score across all explainers for a specific metric
 *
 * @param row - Feature row
 * @param metricType - Metric type constant (score_embedding, score_fuzz, score_detection)
 * @param explainerIds - List of explainer IDs
 * @returns Average score or null if no valid scores
 */
function calculateAvgScoreAcrossExplainers(
  row: FeatureTableRow,
  metricType: typeof METRIC_SCORE_DETECTION | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ,
  explainerIds: string[]
): number | null {
  const scores: number[] = []

  explainerIds.forEach(explainerId => {
    const score = getScoreValue(row, explainerId, metricType)
    if (score !== null) {
      scores.push(score)
    }
  })

  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
}

/**
 * Sort features based on simplified sort configuration
 *
 * Supports sorting by:
 * - featureId: Sort by feature ID number
 * - quality_score: Sort by quality score across all explainers
 * - embedding: Sort by average embedding score across all explainers
 * - fuzz: Sort by average fuzz score across all explainers
 * - detection: Sort by average detection score across all explainers
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort key
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (global stats, explainer IDs)
 * @returns Sorted copy of features array
 */
export function sortFeatures(
  features: FeatureTableRow[],
  sortBy: 'featureId' | typeof METRIC_QUALITY_SCORE | string | null,
  sortDirection: 'asc' | 'desc' | null,
  tableData: { explainer_ids?: string[]; global_stats?: Record<string, MetricNormalizationStats> } | null
): FeatureTableRow[] {
  // If no sort config or no features, return as-is
  if (!sortBy || !sortDirection || !features || features.length === 0) {
    return features
  }

  // Create a copy to avoid mutating original
  const sortedFeatures = [...features]

  sortedFeatures.sort((a, b) => {
    if (sortBy === 'featureId') {
      // Sort by feature ID (numeric)
      return sortDirection === 'asc'
        ? a.feature_id - b.feature_id
        : b.feature_id - a.feature_id
    }

    if (sortBy === METRIC_QUALITY_SCORE) {
      // Calculate quality score across all explainers
      const qualityScoreA = calculateAvgQualityScore(a, tableData?.global_stats)
      const qualityScoreB = calculateAvgQualityScore(b, tableData?.global_stats)
      return compareValues(qualityScoreA, qualityScoreB, sortDirection)
    }

    // Individual score metric sorting (embedding, fuzz, detection)
    if (sortBy === METRIC_SCORE_DETECTION || sortBy === METRIC_SCORE_EMBEDDING || sortBy === METRIC_SCORE_FUZZ) {
      const explainerIds = tableData?.explainer_ids || []
      const scoreA = calculateAvgScoreAcrossExplainers(a, sortBy, explainerIds)
      const scoreB = calculateAvgScoreAcrossExplainers(b, sortBy, explainerIds)
      return compareValues(scoreA, scoreB, sortDirection)
    }

    return 0
  })

  return sortedFeatures
}
