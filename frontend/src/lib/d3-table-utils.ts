import type { FeatureTableRow, FeatureTableDataResponse, MetricNormalizationStats } from '../types'
import {
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_QUALITY_SCORE,
  METRIC_DECODER_SIMILARITY,
  METRIC_SEMANTIC_SIMILARITY
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
// CAUSE CATEGORY UTILITIES
// ============================================================================

export type CauseCategoryState = 'noisy-activation' | 'missed-lexicon' | 'missed-context'

/**
 * Get display name for cause category
 * Returns 'Unsure' for null/undefined (untagged features)
 */
export function getCauseDisplayName(category: CauseCategoryState | null): string {
  if (!category) return 'Unsure'

  const CAUSE_NAME_MAP: Record<CauseCategoryState, string> = {
    'noisy-activation': 'Noisy Activation Example',
    'missed-lexicon': 'Missed Lexicon',
    'missed-context': 'Missed Context'
  }
  return CAUSE_NAME_MAP[category]
}

/**
 * Get color for cause category
 * Returns gray for null/undefined (untagged features)
 */
export function getCauseCategoryColor(category: CauseCategoryState | null): string {
  if (!category) return '#9ca3af'  // Gray for unsure/untagged

  const CAUSE_COLOR_MAP: Record<CauseCategoryState, string> = {
    'noisy-activation': '#f97316',  // Orange
    'missed-lexicon': '#a855f7',    // Purple
    'missed-context': '#3b82f6'     // Blue
  }
  return CAUSE_COLOR_MAP[category]
}

/**
 * Get icon for cause category
 * Returns '?' for null/undefined (untagged features)
 */
export function getCauseCategoryIcon(category: CauseCategoryState | null): string {
  if (!category) return '?'  // Question mark for unsure/untagged

  const CAUSE_ICON_MAP: Record<CauseCategoryState, string> = {
    'noisy-activation': '⚠',
    'missed-lexicon': '📖',
    'missed-context': '🔍'
  }
  return CAUSE_ICON_MAP[category]
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
 * Normalize a score value using simple min-max normalization
 *
 * Flow: value -> min-max normalization -> [0, 1]
 *
 * @param value - Raw score value
 * @param stats - Statistics containing min, max
 * @returns Normalized value (0-1) or null if range is invalid
 */
export function normalizeScore(value: number, stats: MetricNormalizationStats): number | null {
  const { min, max } = stats

  // Min-max normalization
  const range = max - min
  if (range <= 0) return null
  return (value - min) / range
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
 * Calculate quality score from embedding, fuzz, and detection using simple averaging
 *
 * Process:
 * 1. Average scorers (for fuzz and detection)
 * 2. Normalize each metric to [0,1] using min-max: (value - min) / (max - min)
 * 3. Average the three normalized scores
 *
 * @param embedding - Embedding score
 * @param fuzzScores - Fuzz scores from scorers (s1, s2, s3)
 * @param detectionScores - Detection scores from scorers (s1, s2, s3)
 * @param globalStats - Global normalization statistics (min, max for each metric)
 * @returns Quality score (0-1) or null if insufficient data
 */
export function calculateQualityScore(
  embedding: number | null,
  fuzzScores: { s1: number | null; s2: number | null; s3: number | null },
  detectionScores: { s1: number | null; s2: number | null; s3: number | null },
  globalStats: Record<string, MetricNormalizationStats>
): number | null {
  const normalizedScores: number[] = []

  // Normalize embedding
  if (embedding !== null && globalStats.embedding) {
    const { min, max } = globalStats.embedding
    const range = max - min
    if (range > 0) {
      const normalized = (embedding - min) / range
      normalizedScores.push(normalized)
    }
  }

  // Normalize fuzz (average across scorers first)
  const fuzzAvg = averageNonNull([fuzzScores.s1, fuzzScores.s2, fuzzScores.s3])
  if (fuzzAvg !== null && globalStats.fuzz) {
    const { min, max } = globalStats.fuzz
    const range = max - min
    if (range > 0) {
      const normalized = (fuzzAvg - min) / range
      normalizedScores.push(normalized)
    }
  }

  // Normalize detection (average across scorers first)
  const detectionAvg = averageNonNull([detectionScores.s1, detectionScores.s2, detectionScores.s3])
  if (detectionAvg !== null && globalStats.detection) {
    const { min, max } = globalStats.detection
    const range = max - min
    if (range > 0) {
      const normalized = (detectionAvg - min) / range
      normalizedScores.push(normalized)
    }
  }

  // No valid normalized scores
  if (normalizedScores.length === 0) return null

  // Average the normalized scores
  return normalizedScores.reduce((sum, s) => sum + s, 0) / normalizedScores.length
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
 * Find the explainer with the maximum quality score for a feature
 * Also calculates the range of normalized component scores for that explainer
 *
 * @param feature - Feature row
 * @param globalStats - Global normalization statistics
 * @returns Object with explainer ID, quality score, and component range, or null
 */
export function findMaxQualityScoreExplainer(
  feature: FeatureTableRow,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): {
  explainerId: string
  qualityScore: number
  componentRange: { min: number; max: number }
} | null {
  if (!globalStats) return null

  const explainerIds = Object.keys(feature.explainers)
  let maxScore = -Infinity
  let maxExplainerId: string | null = null
  let maxExplainerData: any = null

  // Find explainer with maximum quality score
  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateQualityScore(
      explainerData.embedding,
      explainerData.fuzz,
      explainerData.detection,
      globalStats
    )

    if (score !== null && score > maxScore) {
      maxScore = score
      maxExplainerId = explainerId
      maxExplainerData = explainerData
    }
  }

  if (maxExplainerId === null || maxExplainerData === null) return null

  // Calculate normalized component scores for the max explainer
  const normalizedComponents: number[] = []

  // Normalize embedding
  if (maxExplainerData.embedding !== null && globalStats.embedding) {
    const { min, max } = globalStats.embedding
    const range = max - min
    if (range > 0) {
      const normalized = (maxExplainerData.embedding - min) / range
      normalizedComponents.push(normalized)
    }
  }

  // Normalize fuzz (average across scorers first)
  const fuzzAvg = averageNonNull([
    maxExplainerData.fuzz.s1,
    maxExplainerData.fuzz.s2,
    maxExplainerData.fuzz.s3
  ])
  if (fuzzAvg !== null && globalStats.fuzz) {
    const { min, max } = globalStats.fuzz
    const range = max - min
    if (range > 0) {
      const normalized = (fuzzAvg - min) / range
      normalizedComponents.push(normalized)
    }
  }

  // Normalize detection (average across scorers first)
  const detectionAvg = averageNonNull([
    maxExplainerData.detection.s1,
    maxExplainerData.detection.s2,
    maxExplainerData.detection.s3
  ])
  if (detectionAvg !== null && globalStats.detection) {
    const { min, max } = globalStats.detection
    const range = max - min
    if (range > 0) {
      const normalized = (detectionAvg - min) / range
      normalizedComponents.push(normalized)
    }
  }

  // Calculate component range
  const componentRange = normalizedComponents.length > 0
    ? {
        min: Math.min(...normalizedComponents),
        max: Math.max(...normalizedComponents)
      }
    : { min: 0, max: 0 }

  return {
    explainerId: maxExplainerId,
    qualityScore: maxScore,
    componentRange
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
 * Calculate average semantic similarity across all explainers for a feature
 *
 * Aggregates all pairwise semantic similarities from all explainers for this feature
 * and returns the average value for sorting.
 *
 * @param row - Feature row
 * @param explainerIds - List of explainer IDs
 * @returns Average semantic similarity or null if no valid scores
 */
function calculateAvgSemanticSimilarityForSort(
  row: FeatureTableRow,
  explainerIds: string[]
): number | null {
  const similarities: number[] = []

  explainerIds.forEach(explainerId => {
    const explainerData = row.explainers[explainerId]
    if (!explainerData?.semantic_similarity) return

    // Collect all pairwise similarities for this explainer
    Object.values(explainerData.semantic_similarity).forEach(sim => {
      similarities.push(sim)
    })
  })

  return similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : null
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
 * - decoder_similarity: Sort by decoder similarity score (same across all explainers)
 * - semantic_similarity: Sort by average semantic similarity across all explainers
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort key
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (global stats, explainer IDs)
 * @returns Sorted copy of features array
 */
/**
 * Calculate average of embedding + detection scores for a feature (for Emb & Det column sorting)
 * Averages across all explainers and all detection scorers
 */
function calculateEmbDetAverage(feature: FeatureTableRow): number | null {
  const scores: number[] = []

  // Iterate through all explainers
  Object.values(feature.explainers).forEach(explData => {
    if (!explData) return

    // Add embedding score if available
    if (explData.embedding !== null) {
      scores.push(explData.embedding)
    }

    // Add detection scores (average of s1, s2, s3)
    const detScores = [explData.detection.s1, explData.detection.s2, explData.detection.s3]
      .filter(s => s !== null) as number[]
    if (detScores.length > 0) {
      const detAvg = detScores.reduce((sum, s) => sum + s, 0) / detScores.length
      scores.push(detAvg)
    }
  })

  // Return average of all collected scores
  if (scores.length === 0) return null
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

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

    // Decoder Similarity sorting (extract max value from array)
    if (sortBy === METRIC_DECODER_SIMILARITY) {
      // decoder_similarity is an array of {feature_id, cosine_similarity}
      // Extract max cosine_similarity for comparison
      const fsA = a.decoder_similarity && Array.isArray(a.decoder_similarity) && a.decoder_similarity.length > 0
        ? Math.max(...a.decoder_similarity.map(item => item.cosine_similarity))
        : null
      const fsB = b.decoder_similarity && Array.isArray(b.decoder_similarity) && b.decoder_similarity.length > 0
        ? Math.max(...b.decoder_similarity.map(item => item.cosine_similarity))
        : null
      return compareValues(fsA, fsB, sortDirection)
    }

    // Semantic Similarity sorting (average across all explainers)
    if (sortBy === METRIC_SEMANTIC_SIMILARITY) {
      const explainerIds = tableData?.explainer_ids || []
      const ssA = calculateAvgSemanticSimilarityForSort(a, explainerIds)
      const ssB = calculateAvgSemanticSimilarityForSort(b, explainerIds)
      return compareValues(ssA, ssB, sortDirection)
    }

    // Embedding + Detection Average sorting (for Cause Table dual column)
    if (sortBy === 'emb_det_average') {
      const avgA = calculateEmbDetAverage(a)
      const avgB = calculateEmbDetAverage(b)
      return compareValues(avgA, avgB, sortDirection)
    }

    return 0
  })

  return sortedFeatures
}
