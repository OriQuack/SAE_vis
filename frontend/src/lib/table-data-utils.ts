import type { FeatureTableRow, MetricNormalizationStats } from '../types'

// ============================================================================
// MODEL NAME MAPPING
// ============================================================================

const MODEL_NAME_MAP: Record<string, string> = {
  'llama': 'Llama',
  'qwen': 'Qwen',
  'openai': 'OpenAI',
  'gemini': 'Gemini'
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

// ============================================================================
// QUALITY SCORE CALCULATION
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
// BEST EXPLANATION UTILITIES
// ============================================================================

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
 * Get the best explanation text for a feature (from the explainer with max quality score)
 *
 * @param feature - Feature row (can be null)
 * @param globalStats - Global normalization statistics
 * @returns Explanation text or null
 */
export function getBestExplanation(
  feature: FeatureTableRow | null,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): string | null {
  if (!feature) return null

  const maxQualityInfo = findMaxQualityScoreExplainer(feature, globalStats)
  if (!maxQualityInfo) return null

  const explainerData = feature.explainers[maxQualityInfo.explainerId]
  return explainerData?.explanation_text || null
}
