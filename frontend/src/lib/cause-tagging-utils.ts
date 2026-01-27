// ============================================================================
// CAUSE TAGGING UTILITIES
// Functions for auto-tagging features in Stage 3 based on metric thresholds
// ============================================================================

import type { FeatureTableRow, ExplainerScoreData, ScorerScoreSet } from '../types'
import { isUserConfirmed, type SelectionSource } from './tagging-hooks/useCommitHistory'

// ============================================================================
// TYPES
// ============================================================================

export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

export interface CauseMetricScores {
  // Aggregated scores
  /** Noisy Activation score: Avg(intraFeatureSim, explainerSemanticSim) */
  noisyActivation: number | null
  /** Missed Context score: Avg(embedding, detection) */
  missedContext: number | null
  /** Missed N-gram score: fuzz */
  missedNgram: number | null

  // Component scores for detailed visualization
  /** Intra-feature similarity (component of noisyActivation) */
  intraFeatureSim: number | null
  /** Explainer semantic similarity (component of noisyActivation) */
  explainerSemanticSim: number | null
  /** Embedding score (component of missedContext) */
  embedding: number | null
  /** Detection score (component of missedContext) */
  detection: number | null
  /** Fuzz score (same as missedNgram) */
  fuzz: number | null
}

export interface CauseTagResult {
  category: CauseCategory
  scores: CauseMetricScores
}

export interface AutoTagResult {
  causeStates: Map<number, CauseCategory>
  causeSources: Map<number, 'predicted'>
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
 * Calculate intra-feature similarity from FeatureTableRow
 * Returns intra_feature_sim = max(intra_ngram_jaccard, intra_semantic_sim)
 * This value is pre-computed in the backend from svm_feature_metrics.parquet.
 */
export function calculateIntraFeatureSimilarity(row: FeatureTableRow | null | undefined): number | null {
  return row?.intra_feature_sim ?? null
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
 * Calculate embedding score component for Missed Context
 */
function calculateEmbeddingScore(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const embeddingScores: number[] = []
  for (const explainerData of Object.values(explainers)) {
    if (explainerData.embedding !== null && explainerData.embedding !== undefined) {
      embeddingScores.push(explainerData.embedding)
    }
  }

  if (embeddingScores.length === 0) return null
  return embeddingScores.reduce((sum, v) => sum + v, 0) / embeddingScores.length
}

/**
 * Calculate detection score component for Missed Context
 */
function calculateDetectionScore(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const detectionScores: number[] = []
  for (const explainerData of Object.values(explainers)) {
    const detectionAvg = averageScorerScores(explainerData.detection)
    if (detectionAvg !== null) {
      detectionScores.push(detectionAvg)
    }
  }

  if (detectionScores.length === 0) return null
  return detectionScores.reduce((sum, v) => sum + v, 0) / detectionScores.length
}

/**
 * Calculate fuzz score component for Missed N-gram
 */
function calculateFuzzScore(
  explainers: Record<string, ExplainerScoreData> | null | undefined
): number | null {
  if (!explainers) return null

  const fuzzScores: number[] = []
  for (const explainerData of Object.values(explainers)) {
    const fuzzAvg = averageScorerScores(explainerData.fuzz)
    if (fuzzAvg !== null) {
      fuzzScores.push(fuzzAvg)
    }
  }

  if (fuzzScores.length === 0) return null
  return fuzzScores.reduce((sum, v) => sum + v, 0) / fuzzScores.length
}

/**
 * Calculate all cause metric scores for a single feature
 * Note: intra_feature_sim is now read directly from FeatureTableRow (backend-computed)
 */
export function calculateCauseMetricScores(
  row: FeatureTableRow | null | undefined
): CauseMetricScores {
  if (!row) {
    return {
      noisyActivation: null,
      missedContext: null,
      missedNgram: null,
      intraFeatureSim: null,
      explainerSemanticSim: null,
      embedding: null,
      detection: null,
      fuzz: null
    }
  }

  const explainers = row.explainers

  // Calculate Noisy Activation score components
  const intraFeatureSim = calculateIntraFeatureSimilarity(row)
  const explainerSemanticSim = calculateExplainerSemanticSimilarity(explainers)
  const noisyActivation = averageValues([intraFeatureSim, explainerSemanticSim])

  // Calculate Missed Context score components
  const embedding = calculateEmbeddingScore(explainers)
  const detection = calculateDetectionScore(explainers)
  const missedContext = detection

  // Calculate Missed N-gram score component
  const fuzz = calculateFuzzScore(explainers)
  const missedNgram = fuzz

  return {
    // Aggregated scores
    noisyActivation,
    missedContext,
    missedNgram,
    // Component scores
    intraFeatureSim,
    explainerSemanticSim,
    embedding,
    detection,
    fuzz
  }
}

/**
 * Determine cause tag based on scores
 *
 * Logic: Choose the tag with the minimum score (lowest = worst = root cause)
 */
export function determineCauseTag(scores: CauseMetricScores): CauseCategory {
  const { noisyActivation, missedContext, missedNgram } = scores

  // Build list of valid scores with their categories
  const candidates: Array<{ score: number; category: CauseCategory }> = []

  if (noisyActivation !== null) {
    candidates.push({ score: noisyActivation, category: 'noisy-activation' })
  }
  if (missedContext !== null) {
    candidates.push({ score: missedContext, category: 'missed-context' })
  }
  if (missedNgram !== null) {
    candidates.push({ score: missedNgram, category: 'missed-N-gram' })
  }

  // If no valid scores, default to noisy-activation
  if (candidates.length === 0) {
    return 'noisy-activation'
  }

  // Find minimum score and return its category
  const min = candidates.reduce((a, b) => a.score < b.score ? a : b)
  return min.category
}

/**
 * Calculate metric scores for all features WITHOUT assigning tags.
 * Features remain untagged (unsure) until manually tagged or SVM-assigned.
 *
 * @param featureIds - Set of feature IDs to calculate scores for
 * @param tableData - Table data containing feature rows (includes intra_feature_sim from backend)
 * @returns Map of feature_id to CauseMetricScores
 */
export function calculateMetricScoresOnly(
  featureIds: Set<number>,
  tableData: { features: FeatureTableRow[] } | null
): Map<number, CauseMetricScores> {
  const causeScores = new Map<number, CauseMetricScores>()

  if (!tableData?.features) {
    console.warn('[cause-tagging-utils] No table data available for metric score calculation')
    return causeScores
  }

  // Build feature lookup map
  const featureMap = new Map<number, FeatureTableRow>()
  for (const row of tableData.features) {
    featureMap.set(row.feature_id, row)
  }

  // Calculate scores for each feature (NO tag assignment)
  for (const featureId of featureIds) {
    const row = featureMap.get(featureId)
    const scores = calculateCauseMetricScores(row)
    causeScores.set(featureId, scores)
  }

  console.log('[cause-tagging-utils] Calculated metric scores for', featureIds.size, 'features (no tags assigned)')

  return causeScores
}

/**
 * Auto-tag all features based on their metric scores
 *
 * @param featureIds - Set of feature IDs to tag
 * @param tableData - Table data containing feature rows (includes intra_feature_sim from backend)
 * @returns AutoTagResult with cause states, sources, and scores
 */
export function autoTagFeatures(
  featureIds: Set<number>,
  tableData: { features: FeatureTableRow[] } | null
): AutoTagResult {
  const causeStates = new Map<number, CauseCategory>()
  const causeSources = new Map<number, 'predicted'>()
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

    // Calculate scores
    const scores = calculateCauseMetricScores(row)

    // Determine tag
    const category = determineCauseTag(scores)

    // Store results
    causeStates.set(featureId, category)
    causeSources.set(featureId, 'predicted')
    causeScores.set(featureId, scores)
  }

  console.log('[cause-tagging-utils] Auto-tagged', featureIds.size, 'features:', {
    noisyActivation: Array.from(causeStates.values()).filter(c => c === 'noisy-activation').length,
    missedContext: Array.from(causeStates.values()).filter(c => c === 'missed-context').length,
    missedNgram: Array.from(causeStates.values()).filter(c => c === 'missed-N-gram').length
  })

  return { causeStates, causeSources, causeScores }
}

// ============================================================================
// EFFECTIVE CATEGORY & VISIBILITY UTILITIES
// Used by CauseView and UMAPScatter for consistent category/visibility logic
// ============================================================================

/**
 * Get effective category for a feature based on user-confirmed tags, SVM predictions, and threshold.
 * - User-confirmed tags (click/threshold) take priority
 * - Predicted features below threshold = 'unsure'
 * - Predicted features above threshold = predicted category
 *
 * @param featureId - Feature to check
 * @param causeSelectionStates - Map of feature ID to cause category
 * @param causeSelectionSources - Map of feature ID to source ('click' | 'threshold' | 'predicted')
 * @param causeCategoryDecisionMargins - Map of feature ID to category margins (SVM scores)
 * @param causeMarginThreshold - Threshold for classifying as 'unsure'
 * @returns Effective category ('unsure' if below threshold or untagged)
 */
export function getEffectiveCategory(
  featureId: number,
  causeSelectionStates: Map<number, CauseCategory>,
  causeSelectionSources: Map<number, SelectionSource>,
  causeCategoryDecisionMargins: Map<number, Record<string, number>> | null,
  causeMarginThreshold: number
): CauseCategory | 'unsure' {
  const category = causeSelectionStates.get(featureId)
  const source = causeSelectionSources.get(featureId)

  // Priority 1: User-confirmed tags respected (user intent takes precedence)
  if (isUserConfirmed(source) && category) return category

  // Priority 2: Auto-tagged with margin check (semantic: below threshold = unsure)
  if (category && causeCategoryDecisionMargins) {
    const categoryScores = causeCategoryDecisionMargins.get(featureId)
    if (categoryScores) {
      const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
      if (margin < causeMarginThreshold) return 'unsure'
    }
  }

  return category || 'unsure'
}

/**
 * Check if feature is visible based on mode and threshold.
 * - User-confirmed tags (click/threshold) are always visible
 * - Low mode: show below-threshold (unsure features)
 * - Top mode: show above-threshold (confident candidates)
 *
 * @param featureId - Feature to check
 * @param causeSelectionSources - Map of feature ID to source ('click' | 'threshold' | 'predicted')
 * @param causeCategoryDecisionMargins - Map of feature ID to category margins (SVM scores)
 * @param causeMarginThreshold - Threshold for visibility boundary
 * @param isTopMode - True for "Top" mode (most confident), false for "Low" mode (least confident)
 * @returns True if feature should be visible in current mode
 */
export function isFeatureVisibleInMode(
  featureId: number,
  causeSelectionSources: Map<number, SelectionSource>,
  causeCategoryDecisionMargins: Map<number, Record<string, number>> | null,
  causeMarginThreshold: number,
  isTopMode: boolean
): boolean {
  const source = causeSelectionSources.get(featureId)
  // User-confirmed tags (click/threshold) are always visible
  if (isUserConfirmed(source)) return true

  // Get margin for this feature
  const categoryScores = causeCategoryDecisionMargins?.get(featureId)
  if (!categoryScores) return true  // No scores = show it

  const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))

  // Visibility depends on mode
  return isTopMode ? margin >= causeMarginThreshold : margin < causeMarginThreshold
}
