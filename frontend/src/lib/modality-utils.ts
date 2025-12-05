import type { BimodalityInfo, MultiModalityInfo } from '../types'

/**
 * Calculate unified bimodality score (0-1) from raw data
 * Uses geometric mean of: dip p-value, BIC difference, mean separation
 * Geometric mean ensures ALL components must be high for a high score
 */
export function calculateBimodalityScore(bimodality: BimodalityInfo): {
  score: number
  dipScore: number
  bicScore: number
  meanScore: number
  meanSeparation: number
  bicDiff: number
} {
  // Handle insufficient data
  if (bimodality.sample_size < 10) {
    return { score: 0, dipScore: 0, bicScore: 0, meanScore: 0, meanSeparation: 0, bicDiff: 0 }
  }

  // Component 1: Dip Test Score
  // Lower p-value = more bimodal (p < 0.05 is standard statistical significance)
  const dipScore = 1 - Math.min(bimodality.dip_pvalue / 0.05, 1)

  // Component 2: BIC Score
  // Lower BIC for k=2 = more bimodal
  const bicDiff = bimodality.bic_k1 - bimodality.bic_k2
  const relativeBicDiff = bimodality.bic_k1 !== 0
    ? bicDiff / Math.abs(bimodality.bic_k1)
    : 0
  const bicScore = Math.max(0, Math.min(1, relativeBicDiff * 10))

  // Component 3: Mean Separation Score (1/3 weight)
  // Larger separation between GMM means = more bimodal
  const meanDiff = Math.abs(
    bimodality.gmm_components[1].mean - bimodality.gmm_components[0].mean
  )
  const avgVariance = (
    bimodality.gmm_components[0].variance +
    bimodality.gmm_components[1].variance
  ) / 2
  const avgStd = Math.sqrt(Math.max(avgVariance, 0.0001))  // Prevent division by zero
  const meanSeparation = meanDiff / avgStd  // Cohen's d-like measure
  const meanScore = Math.min(meanSeparation / 2, 1)  // separation ≥ 3 stddev → 1.0 (stricter)

  // Final score: geometric mean (all components must contribute)
  const score = Math.pow(dipScore * bicScore * meanScore, 1/3)

  return { score, dipScore, bicScore, meanScore, meanSeparation, bicDiff }
}

/**
 * Get the level (1-6) based on score
 */
export function getScoreLevel(score: number): number {
  if (score >= 0.80) return 6
  if (score >= 0.65) return 5
  if (score >= 0.5) return 4
  if (score >= 0.30) return 3
  if (score >= 0.15) return 2
  return 1
}

/**
 * Check if bimodality score indicates strongly bimodal distribution
 * Used by FeatureSplitView to enable/disable Tag All button
 */
export function isBimodalScore(bimodality: BimodalityInfo | null | undefined): boolean {
  if (!bimodality) return false
  const { score } = calculateBimodalityScore(bimodality)
  return score >= 0.83  // Level 6 (Strongly Bimodal) only
}

// ============================================================================
// MULTI-MODALITY UTILITIES
// ============================================================================

/**
 * Result of multi-modality score calculation
 */
export interface MultiModalityScoreResult {
  aggregateScore: number  // Combined score (0-1 normalized)
  categoryScores: Record<string, number>  // Per-category bimodality scores
  categoryDetails: Record<string, {
    score: number
    bicDiff: number
    meanSeparation: number
    dipPvalue: number
  }>
}

/**
 * Calculate multi-modality score from per-category bimodality results
 * Returns aggregate score and per-category breakdown
 */
export function calculateMultiModalityScore(
  multimodality: MultiModalityInfo
): MultiModalityScoreResult {
  const categoryScores: Record<string, number> = {}
  const categoryDetails: Record<string, {
    score: number
    bicDiff: number
    meanSeparation: number
    dipPvalue: number
  }> = {}

  for (const categoryResult of multimodality.category_results) {
    const result = calculateBimodalityScore(categoryResult.bimodality)
    categoryScores[categoryResult.category] = result.score
    categoryDetails[categoryResult.category] = {
      score: result.score,
      bicDiff: result.bicDiff,
      meanSeparation: result.meanSeparation,
      dipPvalue: categoryResult.bimodality.dip_pvalue
    }
  }

  // Calculate aggregate score from per-category scores (average)
  const scores = Object.values(categoryScores)
  const aggregateScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s, 0) / scores.length
    : 0

  return {
    aggregateScore,
    categoryScores,
    categoryDetails
  }
}

/**
 * Check if multi-modality score indicates strong separation
 * Used to enable/disable auto-tagging features
 */
export function isMultiModal(multimodality: MultiModalityInfo | null | undefined): boolean {
  if (!multimodality) return false
  return multimodality.aggregate_score >= 0.83  // Same threshold as bimodality
}
