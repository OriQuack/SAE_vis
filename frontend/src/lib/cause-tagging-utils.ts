// ============================================================================
// CAUSE TAGGING UTILITIES
// Functions for auto-tagging features in Stage 3 based on metric thresholds
// ============================================================================

import type { FeatureTableRow, ExplainerScoreData, ActivationExamples, ScorerScoreSet } from '../types'
import { CAUSE_TAG_THRESHOLD } from './constants'

// ============================================================================
// TYPES
// ============================================================================

export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

export interface CauseMetricScores {
  /** Noisy Activation score: Avg(intraFeatureSim, explainerSemanticSim) */
  noisyActivation: number | null
  /** Missed Context score: Avg(embedding, detection) */
  missedContext: number | null
  /** Missed N-gram score: fuzz */
  missedNgram: number | null
}

export interface CauseTagResult {
  category: CauseCategory
  scores: CauseMetricScores
}

export interface AutoTagResult {
  causeStates: Map<number, CauseCategory>
  causeSources: Map<number, 'auto'>
  causeScores: Map<number, CauseMetricScores>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Average non-null values from a ScorerScoreSet (s1, s2, s3)
 */
function averageScorerScores(scoreSet: ScorerScoreSet | null | undefined): number | null {
  if (!scoreSet) return null

  const values: number[] = []
  if (scoreSet.s1 !== null && scoreSet.s1 !== undefined) values.push(scoreSet.s1)
  if (scoreSet.s2 !== null && scoreSet.s2 !== undefined) values.push(scoreSet.s2)
  if (scoreSet.s3 !== null && scoreSet.s3 !== undefined) values.push(scoreSet.s3)

  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Average an array of numbers, ignoring null values
 */
function averageValues(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter((v): v is number => v !== null && v !== undefined)
  if (validValues.length === 0) return null
  return validValues.reduce((sum, v) => sum + v, 0) / validValues.length
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate intra-feature similarity from ActivationExamples
 * Returns Max(char_ngram_max_jaccard, word_ngram_max_jaccard, semantic_similarity)
 */
export function calculateIntraFeatureSimilarity(activation: ActivationExamples | null | undefined): number | null {
  if (!activation) return null

  const values: number[] = []

  // Add char n-gram jaccard if available
  if (activation.char_ngram_max_jaccard !== null && activation.char_ngram_max_jaccard !== undefined) {
    values.push(activation.char_ngram_max_jaccard)
  }

  // Add word n-gram jaccard if available
  if (activation.word_ngram_max_jaccard !== null && activation.word_ngram_max_jaccard !== undefined) {
    values.push(activation.word_ngram_max_jaccard)
  }

  // Add semantic similarity if available
  if (activation.semantic_similarity !== null && activation.semantic_similarity !== undefined) {
    values.push(activation.semantic_similarity)
  }

  if (values.length === 0) return null
  return Math.max(...values)
}

/**
 * Calculate explanation semantic similarity from ExplainerScoreData
 * Returns average of all pairwise semantic_similarity values across explainers
 */
export function calculateExplainerSemanticSimilarity(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const allPairwiseValues: number[] = []

  for (const explainerData of Object.values(explainers)) {
    if (explainerData.semantic_similarity) {
      // semantic_similarity is Record<string, number> (e.g., {"qwen": 0.93, "openai": 0.87})
      const pairwiseValues = Object.values(explainerData.semantic_similarity)
      allPairwiseValues.push(...pairwiseValues)
    }
  }

  if (allPairwiseValues.length === 0) return null
  return allPairwiseValues.reduce((sum, v) => sum + v, 0) / allPairwiseValues.length
}

/**
 * Calculate Missed Context score: Avg(embedding, detection)
 */
export function calculateMissedContextScore(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const embeddingScores: number[] = []
  const detectionScores: number[] = []

  for (const explainerData of Object.values(explainers)) {
    // Embedding score is a single number
    if (explainerData.embedding !== null && explainerData.embedding !== undefined) {
      embeddingScores.push(explainerData.embedding)
    }

    // Detection score is a ScorerScoreSet - average s1, s2, s3
    const detectionAvg = averageScorerScores(explainerData.detection)
    if (detectionAvg !== null) {
      detectionScores.push(detectionAvg)
    }
  }

  // Average each metric type first, then average the two
  const avgEmbedding = embeddingScores.length > 0
    ? embeddingScores.reduce((sum, v) => sum + v, 0) / embeddingScores.length
    : null
  const avgDetection = detectionScores.length > 0
    ? detectionScores.reduce((sum, v) => sum + v, 0) / detectionScores.length
    : null

  return averageValues([avgEmbedding, avgDetection])
}

/**
 * Calculate Missed N-gram score: fuzz
 */
export function calculateMissedNgramScore(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const fuzzScores: number[] = []

  for (const explainerData of Object.values(explainers)) {
    // Fuzz score is a ScorerScoreSet - average s1, s2, s3
    const fuzzAvg = averageScorerScores(explainerData.fuzz)
    if (fuzzAvg !== null) {
      fuzzScores.push(fuzzAvg)
    }
  }

  if (fuzzScores.length === 0) return null
  return fuzzScores.reduce((sum, v) => sum + v, 0) / fuzzScores.length
}

// ============================================================================
// MAIN CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate all cause metric scores for a single feature
 */
export function calculateCauseMetricScores(
  row: FeatureTableRow | null | undefined,
  activation: ActivationExamples | null | undefined
): CauseMetricScores {
  if (!row) {
    return { noisyActivation: null, missedContext: null, missedNgram: null }
  }

  const explainers = row.explainers

  // Calculate Noisy Activation score components
  const intraFeatureSim = calculateIntraFeatureSimilarity(activation)
  const explainerSemanticSim = calculateExplainerSemanticSimilarity(explainers)
  const noisyActivation = averageValues([intraFeatureSim, explainerSemanticSim])

  // Calculate Missed Context score
  const missedContext = calculateMissedContextScore(explainers)

  // Calculate Missed N-gram score
  const missedNgram = calculateMissedNgramScore(explainers)

  return {
    noisyActivation,
    missedContext,
    missedNgram
  }
}

/**
 * Determine cause tag based on scores and thresholds
 *
 * Logic:
 * 1. If missedContext < 0.5 AND missedNgram < 0.5 → assign tag with MIN score
 * 2. Else if missedContext < 0.5 → Missed Context
 * 3. Else if missedNgram < 0.5 → Missed N-gram
 * 4. Else → Noisy Activation (default)
 */
export function determineCauseTag(scores: CauseMetricScores): CauseCategory {
  const threshold = CAUSE_TAG_THRESHOLD
  const { missedContext, missedNgram } = scores

  // Check if both are below threshold
  const missedContextBelowThreshold = missedContext !== null && missedContext < threshold
  const missedNgramBelowThreshold = missedNgram !== null && missedNgram < threshold

  if (missedContextBelowThreshold && missedNgramBelowThreshold) {
    // Both below threshold - assign tag with MIN score (worst case)
    // Lower score = worse = more likely to be the root cause
    if (missedContext! <= missedNgram!) {
      return 'missed-context'
    } else {
      return 'missed-N-gram'
    }
  } else if (missedContextBelowThreshold) {
    return 'missed-context'
  } else if (missedNgramBelowThreshold) {
    return 'missed-N-gram'
  } else {
    // Default: Noisy Activation
    return 'noisy-activation'
  }
}

/**
 * Auto-tag all features based on their metric scores
 *
 * @param featureIds - Set of feature IDs to tag
 * @param tableData - Table data containing feature rows
 * @param activationExamples - Map of feature ID to activation examples
 * @returns AutoTagResult with cause states, sources, and scores
 */
export function autoTagFeatures(
  featureIds: Set<number>,
  tableData: { features: FeatureTableRow[] } | null,
  activationExamples: Record<number, ActivationExamples> | null
): AutoTagResult {
  const causeStates = new Map<number, CauseCategory>()
  const causeSources = new Map<number, 'auto'>()
  const causeScores = new Map<number, CauseMetricScores>()

  if (!tableData?.features) {
    console.warn('[cause-tagging-utils] No table data available for auto-tagging')
    return { causeStates, causeSources, causeScores }
  }

  // Build feature lookup map
  const featureMap = new Map<number, FeatureTableRow>()
  for (const row of tableData.features) {
    featureMap.set(row.feature_id, row)
  }

  // Process each feature
  for (const featureId of featureIds) {
    const row = featureMap.get(featureId)
    const activation = activationExamples?.[featureId] ?? null

    // Calculate scores
    const scores = calculateCauseMetricScores(row, activation)

    // Determine tag
    const category = determineCauseTag(scores)

    // Store results
    causeStates.set(featureId, category)
    causeSources.set(featureId, 'auto')
    causeScores.set(featureId, scores)
  }

  console.log('[cause-tagging-utils] Auto-tagged', featureIds.size, 'features:', {
    noisyActivation: Array.from(causeStates.values()).filter(c => c === 'noisy-activation').length,
    missedContext: Array.from(causeStates.values()).filter(c => c === 'missed-context').length,
    missedNgram: Array.from(causeStates.values()).filter(c => c === 'missed-N-gram').length
  })

  return { causeStates, causeSources, causeScores }
}
