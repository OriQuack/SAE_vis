import type { FeatureTableRow, FeatureTableDataResponse, MetricNormalizationStats, ConsistencyType, MinConsistencyResult } from '../types'
import {
  CONSISTENCY_TYPE_NONE,
  METRIC_LLM_SCORER_CONSISTENCY,
  METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
  METRIC_LLM_EXPLAINER_CONSISTENCY,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
} from './constants'
import {
  getConsistencyColor,
  getOverallScoreColor,
  getConsistencyGradientStops,
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

/**
 * Extract LLM scorer consistency (average of fuzz and detection consistency)
 *
 * @param explainerData - Explainer data containing llm_scorer_consistency
 * @returns Average scorer consistency or null
 */
function extractScorerConsistency(explainerData: any): number | null {
  if (!explainerData || !explainerData.llm_scorer_consistency) return null

  const values: number[] = []
  if (explainerData.llm_scorer_consistency.fuzz) {
    values.push(explainerData.llm_scorer_consistency.fuzz.value)
  }
  if (explainerData.llm_scorer_consistency.detection) {
    values.push(explainerData.llm_scorer_consistency.detection.value)
  }

  return averageNonNull(values)
}

/**
 * Extract cross-explainer metric consistency (average of embedding, fuzz, detection)
 *
 * @param explainerData - Explainer data containing cross_explanation_metric_consistency
 * @returns Average cross-explainer consistency or null
 */
function extractCrossExplainerConsistency(explainerData: any): number | null {
  if (!explainerData || !explainerData.cross_explanation_metric_consistency) return null

  const cem = explainerData.cross_explanation_metric_consistency
  const values: number[] = []

  if (cem.embedding) values.push(cem.embedding.value)
  if (cem.fuzz) values.push(cem.fuzz.value)
  if (cem.detection) values.push(cem.detection.value)

  return averageNonNull(values)
}

/**
 * Extract cross-explainer overall score consistency
 *
 * @param explainerData - Explainer data containing cross_explanation_overall_score_consistency
 * @returns Overall score consistency or null
 */
function extractCrossExplainerOverallConsistency(explainerData: any): number | null {
  if (!explainerData || !explainerData.cross_explanation_overall_score_consistency) return null

  return explainerData.cross_explanation_overall_score_consistency.value
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
// CONSISTENCY COLOR BAR
// ============================================================================

export interface ColorBarLayout {
  width: number
  height: number
  barX: number
  barY: number
  barWidth: number
  barHeight: number
  leftLabelX: number
  leftLabelY: number
  rightLabelX: number
  rightLabelY: number
  gradientStops: Array<{
    offset: string
    color: string
  }>
}

/**
 * Calculate color bar layout with inline labels
 *
 * Following project pattern: D3 calculations in utils, React renders the result
 *
 * @param containerWidth - Total width available for the color bar and labels
 * @param barHeight - Height of the gradient bar
 * @param consistencyType - Type of consistency for color selection
 * @returns Layout calculations for rendering
 */
export function calculateColorBarLayout(
  containerWidth: number = 400,
  barHeight: number = 12,
  consistencyType: ConsistencyType = CONSISTENCY_TYPE_NONE
): ColorBarLayout {
  const labelWidth = 35  // Width reserved for each label ("0 Low", "1 High")
  const labelGap = 8     // Gap between label and bar

  // Calculate bar width (total - labels - gaps)
  const barWidth = containerWidth - (labelWidth * 2) - (labelGap * 2)
  const barX = labelWidth + labelGap
  const barY = 0

  // Label positions (vertically centered with bar)
  const labelY = barHeight / 2

  return {
    width: containerWidth,
    height: barHeight,
    barX,
    barY,
    barWidth,
    barHeight,
    leftLabelX: 0,
    leftLabelY: labelY,
    rightLabelX: containerWidth - labelWidth,
    rightLabelY: labelY,
    gradientStops: getConsistencyGradientStops(consistencyType)
  }
}

// Color encoding functions moved to utils.ts and imported above
// Re-exported for backward compatibility
export { getConsistencyColor, getOverallScoreColor, getConsistencyGradientStops }

// ============================================================================
// TABLE SORTING UTILITIES
// ============================================================================

/**
 * Get consistency value for sorting purposes
 *
 * For some consistency types, we need to aggregate multiple values
 * (e.g., LLM Scorer may have both fuzz and detection consistency)
 *
 * @param row - Feature table row
 * @param consistencyType - Type of consistency to extract
 * @param explainerIds - Array of explainer IDs (for averaging across explainers)
 * @returns Average consistency value or null
 */
export function getConsistencyValueForSorting(
  row: FeatureTableRow,
  consistencyType: string,
  explainerIds: string[]
): number | null {
  // No consistency - return null (no sorting by consistency)
  if (consistencyType === CONSISTENCY_TYPE_NONE) {
    return null
  }

  const values: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = row.explainers[explainerId]
    if (!explainerData) continue

    if (consistencyType === METRIC_LLM_SCORER_CONSISTENCY) {
      values.push(extractScorerConsistency(explainerData))
    } else if (consistencyType === METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY) {
      if (explainerData.within_explanation_metric_consistency) {
        values.push(explainerData.within_explanation_metric_consistency.value)
      }
    } else if (consistencyType === METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY) {
      values.push(extractCrossExplainerConsistency(explainerData))
    } else if (consistencyType === METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY) {
      values.push(extractCrossExplainerOverallConsistency(explainerData))
    } else if (consistencyType === METRIC_LLM_EXPLAINER_CONSISTENCY) {
      if (explainerData.llm_explainer_consistency) {
        values.push(explainerData.llm_explainer_consistency.value)
      }
    }
  }

  // Return average of collected values, or null if no values
  return averageNonNull(values)
}

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
// OVERALL SCORE CALCULATION (FOR NEW TABLE LAYOUT)
// ============================================================================

/**
 * Calculate overall score from embedding, fuzz, and detection
 *
 * Process:
 * 1. Calculate z-score for each metric: (value - mean) / std
 * 2. Average the three z-scores
 * 3. Apply min-max normalization to averaged z-score using overall.z_min and overall.z_max
 *
 * @param embedding - Embedding score
 * @param fuzzScores - Fuzz scores from scorers (s1, s2, s3)
 * @param detectionScores - Detection scores from scorers (s1, s2, s3)
 * @param globalStats - Global normalization statistics (includes overall.z_min, overall.z_max)
 * @returns Overall score (0-1) or null if insufficient data
 */
export function calculateOverallScore(
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

  // Normalize the averaged z-score using overall z_min and z_max
  if (!globalStats.overall || !globalStats.overall.z_min || !globalStats.overall.z_max) {
    // Fallback: if no overall stats, return null
    return null
  }

  const { z_min, z_max } = globalStats.overall
  const zRange = z_max - z_min
  if (zRange <= 0) return null

  return (avgZScore - z_min) / zRange
}

/**
 * Calculate min consistency from 5 consistency types (minimum value)
 *
 * Consistency types:
 * 1. LLM Scorer consistency (average of fuzz and detection)
 * 2. Within-explanation metric consistency
 * 3. Cross-explanation score consistency (average of embedding, fuzz, detection)
 * 4. Cross-explanation overall score consistency
 * 5. LLM Explainer consistency
 *
 * @param row - Feature table row
 * @param explainerId - Explainer ID
 * @returns Min consistency result with value and weakest type, or null if no consistency data
 */
export function calculateMinConsistency(
  row: FeatureTableRow,
  explainerId: string
): MinConsistencyResult | null {
  const explainerData = row.explainers[explainerId]
  if (!explainerData) return null

  // Track consistency values with their types
  const consistencyEntries: Array<{ value: number; type: ConsistencyType }> = []

  // 1. LLM Scorer consistency (average of fuzz and detection)
  const scorerConsistency = extractScorerConsistency(explainerData)
  if (scorerConsistency !== null) {
    consistencyEntries.push({ value: scorerConsistency, type: METRIC_LLM_SCORER_CONSISTENCY })
  }

  // 2. Within-explanation metric consistency
  if (explainerData.within_explanation_metric_consistency) {
    consistencyEntries.push({ value: explainerData.within_explanation_metric_consistency.value, type: METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY })
  }

  // 3. Cross-explanation score consistency (average of embedding, fuzz, detection)
  const crossConsistency = extractCrossExplainerConsistency(explainerData)
  if (crossConsistency !== null) {
    consistencyEntries.push({ value: crossConsistency, type: METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY })
  }

  // 4. Cross-explanation overall score consistency
  const crossOverallConsistency = extractCrossExplainerOverallConsistency(explainerData)
  if (crossOverallConsistency !== null) {
    consistencyEntries.push({ value: crossOverallConsistency, type: METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY })
  }

  // 5. LLM Explainer consistency
  if (explainerData.llm_explainer_consistency) {
    consistencyEntries.push({ value: explainerData.llm_explainer_consistency.value, type: METRIC_LLM_EXPLAINER_CONSISTENCY })
  }

  // Find minimum value and its type
  if (consistencyEntries.length === 0) return null

  const weakest = consistencyEntries.reduce((min, current) =>
    current.value < min.value ? current : min
  )

  return {
    value: weakest.value,
    weakestType: weakest.type
  }
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
  // Consistency metrics
  const consistencyMetrics = [
    'minConsistency',
    METRIC_LLM_SCORER_CONSISTENCY,
    METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
    METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
    METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
    METRIC_LLM_EXPLAINER_CONSISTENCY
  ]

  // Score metrics
  const scoreMetrics = [
    'overallScore',
    METRIC_SCORE_EMBEDDING,
    METRIC_SCORE_FUZZ,
    METRIC_SCORE_DETECTION
  ]

  if (consistencyMetrics.includes(sortBy)) {
    // Handle consistency metrics - take minimum across explainers
    if (sortBy === 'minConsistency') {
      // Find the minimum consistency across all explainers
      let minValue: number | null = null
      let weakestType: ConsistencyType = METRIC_LLM_SCORER_CONSISTENCY as ConsistencyType

      for (const explainerId of Object.keys(feature.explainers)) {
        const result = calculateMinConsistency(feature, explainerId)
        if (result && (minValue === null || result.value < minValue)) {
          minValue = result.value
          weakestType = result.weakestType
        }
      }

      return minValue !== null ? getConsistencyColor(minValue, weakestType) : 'transparent'
    } else {
      // Handle specific consistency metrics - take minimum across explainers
      const values: number[] = []

      for (const explainerId of Object.keys(feature.explainers)) {
        const explainerData = feature.explainers[explainerId]
        if (!explainerData) continue

        let metricValue: number | null = null

        switch (sortBy) {
          case METRIC_LLM_SCORER_CONSISTENCY:
            if (explainerData.llm_scorer_consistency) {
              const scorerValues: number[] = []
              if (explainerData.llm_scorer_consistency.fuzz) {
                scorerValues.push(explainerData.llm_scorer_consistency.fuzz.value)
              }
              if (explainerData.llm_scorer_consistency.detection) {
                scorerValues.push(explainerData.llm_scorer_consistency.detection.value)
              }
              if (scorerValues.length > 0) {
                metricValue = scorerValues.reduce((sum, v) => sum + v, 0) / scorerValues.length
              }
            }
            break
          case METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY:
            metricValue = explainerData.within_explanation_metric_consistency?.value ?? null
            break
          case METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY:
            if (explainerData.cross_explanation_metric_consistency) {
              const crossValues: number[] = []
              if (explainerData.cross_explanation_metric_consistency.embedding) {
                crossValues.push(explainerData.cross_explanation_metric_consistency.embedding.value)
              }
              if (explainerData.cross_explanation_metric_consistency.fuzz) {
                crossValues.push(explainerData.cross_explanation_metric_consistency.fuzz.value)
              }
              if (explainerData.cross_explanation_metric_consistency.detection) {
                crossValues.push(explainerData.cross_explanation_metric_consistency.detection.value)
              }
              if (crossValues.length > 0) {
                metricValue = crossValues.reduce((sum, v) => sum + v, 0) / crossValues.length
              }
            }
            break
          case METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY:
            metricValue = explainerData.cross_explanation_overall_score_consistency?.value ?? null
            break
          case METRIC_LLM_EXPLAINER_CONSISTENCY:
            metricValue = explainerData.llm_explainer_consistency?.value ?? null
            break
        }

        if (metricValue !== null) {
          values.push(metricValue)
        }
      }

      // Use minimum value for consistency
      if (values.length > 0) {
        const minValue = Math.min(...values)
        return getConsistencyColor(minValue, sortBy as ConsistencyType)
      }
    }
  } else if (scoreMetrics.includes(sortBy)) {
    // Handle score metrics - average across explainers
    if (sortBy === 'overallScore') {
      // Calculate overall score averaged across explainers
      const scores: number[] = []

      for (const explainerId of Object.keys(feature.explainers)) {
        const explainerData = feature.explainers[explainerId]
        if (!explainerData) continue

        const score = calculateOverallScore(
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
        return getOverallScoreColor(avgScore)
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
 * Calculate average overall score across all explainers for a feature
 *
 * @param feature - Feature row
 * @param globalStats - Global normalization statistics
 * @returns Average overall score or null
 */
function calculateAvgOverallScore(
  feature: FeatureTableRow,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): number | null {
  if (!globalStats) return null

  const explainerIds = Object.keys(feature.explainers)
  const scores: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateOverallScore(
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
 * Calculate minimum min consistency across all explainers for a feature
 *
 * @param feature - Feature row
 * @returns Minimum min consistency or null
 */
function calculateFeatureMinConsistency(
  feature: FeatureTableRow
): number | null {
  const explainerIds = Object.keys(feature.explainers)
  const consistencies: number[] = []

  for (const explainerId of explainerIds) {
    const result = calculateMinConsistency(feature, explainerId)
    if (result !== null) {
      consistencies.push(result.value)
    }
  }

  if (consistencies.length === 0) return null
  return Math.min(...consistencies)
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
 * - overallScore: Sort by overall score across all explainers
 * - minConsistency: Sort by min consistency across all explainers
 * - embedding: Sort by average embedding score across all explainers
 * - fuzz: Sort by average fuzz score across all explainers
 * - detection: Sort by average detection score across all explainers
 * - METRIC_LLM_SCORER_CONSISTENCY: Sort by LLM Scorer consistency
 * - METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY: Sort by Within-explanation metric consistency
 * - METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY: Sort by Cross-explanation metric consistency
 * - METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY: Sort by Cross-explanation overall score consistency
 * - METRIC_LLM_EXPLAINER_CONSISTENCY: Sort by LLM Explainer consistency
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort key
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (global stats, explainer IDs)
 * @returns Sorted copy of features array
 */
export function sortFeatures(
  features: FeatureTableRow[],
  sortBy: 'featureId' | 'overallScore' | 'minConsistency' | string | null,
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

    if (sortBy === 'overallScore') {
      // Calculate overall score across all explainers
      const overallScoreA = calculateAvgOverallScore(a, tableData?.global_stats)
      const overallScoreB = calculateAvgOverallScore(b, tableData?.global_stats)
      return compareValues(overallScoreA, overallScoreB, sortDirection)
    }

    if (sortBy === 'minConsistency') {
      // Calculate min consistency across all explainers
      const minConsistencyA = calculateFeatureMinConsistency(a)
      const minConsistencyB = calculateFeatureMinConsistency(b)
      return compareValues(minConsistencyA, minConsistencyB, sortDirection)
    }

    // Individual score metric sorting (embedding, fuzz, detection)
    if (sortBy === METRIC_SCORE_DETECTION || sortBy === METRIC_SCORE_EMBEDDING || sortBy === METRIC_SCORE_FUZZ) {
      const explainerIds = tableData?.explainer_ids || []
      const scoreA = calculateAvgScoreAcrossExplainers(a, sortBy, explainerIds)
      const scoreB = calculateAvgScoreAcrossExplainers(b, sortBy, explainerIds)
      return compareValues(scoreA, scoreB, sortDirection)
    }

    // Individual consistency metric sorting
    if (sortBy === METRIC_LLM_SCORER_CONSISTENCY) {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, METRIC_LLM_SCORER_CONSISTENCY, explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, METRIC_LLM_SCORER_CONSISTENCY, explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY) {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY, explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY, explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY) {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY, explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY, explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY) {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY, explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY, explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === METRIC_LLM_EXPLAINER_CONSISTENCY) {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, METRIC_LLM_EXPLAINER_CONSISTENCY, explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, METRIC_LLM_EXPLAINER_CONSISTENCY, explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    return 0
  })

  return sortedFeatures
}
