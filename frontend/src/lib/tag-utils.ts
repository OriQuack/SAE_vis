// ============================================================================
// TAG SYSTEM UTILITIES
// Inference, matching, and tag management utilities for Stage 1
// ============================================================================

import type {
  TagTemplate,
  MetricSignature,
  MetricWeights,
  FeatureMatch,
  FeatureTableRow
} from '../types'

// ============================================================================
// TAG TEMPLATES (6 patterns from tag.md)
// ============================================================================

export const TAG_TEMPLATES: TagTemplate[] = [
  {
    name: 'Well-Explained Coherent Feature',
    description: 'Coherent (not over-split), well-understood, reliably explained across all metrics',
    signature: {
      feature_splitting: { min: 0.0, max: 0.3 },      // LOW is good
      embedding: { min: 0.7, max: 1.0 },
      fuzz: { min: 0.7, max: 1.0 },
      detection: { min: 0.7, max: 1.0 },
      semantic_similarity: { min: 0.7, max: 1.0 },
      quality_score: { min: 0.8, max: 1.0 }
    },
    color: '#10b981'  // Green
  },
  {
    name: 'Over-Split Feature',
    description: 'Feature fragmented across multiple SAE features (high decoder similarity problem)',
    signature: {
      feature_splitting: { min: 0.7, max: 1.0 },      // HIGH is problem
      embedding: { min: 0.4, max: 0.6 },
      fuzz: { min: 0.0, max: 0.5 },
      detection: { min: 0.0, max: 0.6 },
      semantic_similarity: { min: 0.0, max: 1.0 },    // VARIABLE
      quality_score: { min: 0.3, max: 0.6 }
    },
    color: '#f59e0b'  // Orange
  },
  {
    name: 'Spurious/Fragile Feature',
    description: 'Based on spurious correlations, not robust to perturbations',
    signature: {
      feature_splitting: { min: 0.0, max: 1.0 },      // VARIABLE
      embedding: { min: 0.0, max: 0.5 },
      fuzz: { min: 0.0, max: 0.3 },                   // LOW robustness
      detection: { min: 0.0, max: 0.3 },              // LOW predictive
      semantic_similarity: { min: 0.0, max: 1.0 },
      quality_score: { min: 0.0, max: 0.4 }
    },
    color: '#ef4444'  // Red
  },
  {
    name: 'Multi-Interpretation Feature',
    description: 'Multiple valid interpretations, LLMs disagree on understanding',
    signature: {
      feature_splitting: { min: 0.0, max: 0.5 },
      embedding: { min: 0.4, max: 0.6 },
      fuzz: { min: 0.4, max: 0.6 },
      detection: { min: 0.4, max: 0.6 },
      semantic_similarity: { min: 0.0, max: 0.3 },    // LOW agreement
      quality_score: { min: 0.4, max: 0.7 }
    },
    color: '#a855f7'  // Purple
  },
  {
    name: 'Robust Specialized Feature',
    description: 'Highly robust and predictive with clear boundary, consistently explained',
    signature: {
      feature_splitting: { min: 0.0, max: 0.3 },
      embedding: { min: 0.6, max: 0.8 },
      fuzz: { min: 0.7, max: 1.0 },                   // HIGH robustness
      detection: { min: 0.7, max: 1.0 },              // HIGH predictive
      semantic_similarity: { min: 0.7, max: 1.0 },
      quality_score: { min: 0.0, max: 1.0 }
    },
    color: '#3b82f6'  // Blue
  },
  {
    name: 'Noisy/Dead Feature',
    description: 'Fundamentally noisy, incoherent, or uninterpretable',
    signature: {
      feature_splitting: { min: 0.0, max: 1.0 },      // VARIABLE
      embedding: { min: 0.0, max: 0.3 },
      fuzz: { min: 0.0, max: 0.3 },
      detection: { min: 0.0, max: 0.3 },
      semantic_similarity: { min: 0.0, max: 1.0 },
      quality_score: { min: 0.0, max: 0.3 }
    },
    color: '#6b7280'  // Gray
  }
]

// ============================================================================
// METRIC EXTRACTION (from FeatureTableRow)
// ============================================================================

/**
 * Extract metric values from a feature row
 * Averages across LLM explainers and scorers
 */
export function extractMetricValues(feature: FeatureTableRow): {
  feature_splitting: number
  embedding: number
  fuzz: number
  detection: number
  semantic_similarity: number
  quality_score: number
} {
  const explainers = Object.keys(feature.explainers)

  if (explainers.length === 0) {
    // Return zeros if no explainers
    return {
      feature_splitting: 0,
      embedding: 0,
      fuzz: 0,
      detection: 0,
      semantic_similarity: 0,
      quality_score: 0
    }
  }

  // Feature splitting is same across all explainers
  const feature_splitting = feature.feature_splitting || 0

  // Average embedding scores across explainers
  let embeddingSum = 0
  let embeddingCount = 0

  // Average fuzz scores (average scorers first, then explainers)
  let fuzzSum = 0
  let fuzzCount = 0

  // Average detection scores (average scorers first, then explainers)
  let detectionSum = 0
  let detectionCount = 0

  // Compute pairwise semantic similarity average
  const semanticSims: number[] = []

  explainers.forEach((explainerId) => {
    const explainerData = feature.explainers[explainerId]

    // Embedding score (1 per explainer)
    if (explainerData.embedding !== null) {
      embeddingSum += explainerData.embedding
      embeddingCount++
    }

    // Fuzz scores (3 scorers per explainer)
    if (explainerData.fuzz) {
      const fuzzScores = [explainerData.fuzz.s1, explainerData.fuzz.s2, explainerData.fuzz.s3]
        .filter(s => s !== null) as number[]
      if (fuzzScores.length > 0) {
        const avgFuzz = fuzzScores.reduce((sum, s) => sum + s, 0) / fuzzScores.length
        fuzzSum += avgFuzz
        fuzzCount++
      }
    }

    // Detection scores (3 scorers per explainer)
    if (explainerData.detection) {
      const detectionScores = [explainerData.detection.s1, explainerData.detection.s2, explainerData.detection.s3]
        .filter(s => s !== null) as number[]
      if (detectionScores.length > 0) {
        const avgDetection = detectionScores.reduce((sum, s) => sum + s, 0) / detectionScores.length
        detectionSum += avgDetection
        detectionCount++
      }
    }

    // Semantic similarity (pairwise with other explainers)
    if (explainerData.semantic_similarity) {
      Object.values(explainerData.semantic_similarity).forEach(sim => {
        if (typeof sim === 'number') {
          semanticSims.push(sim)
        }
      })
    }
  })

  const embedding = embeddingCount > 0 ? embeddingSum / embeddingCount : 0
  const fuzz = fuzzCount > 0 ? fuzzSum / fuzzCount : 0
  const detection = detectionCount > 0 ? detectionSum / detectionCount : 0
  const semantic_similarity = semanticSims.length > 0
    ? semanticSims.reduce((sum, s) => sum + s, 0) / semanticSims.length
    : 0

  // Quality score: average of z-scores (simplified: average of metrics)
  const quality_score = (embedding + fuzz + detection) / 3

  return {
    feature_splitting,
    embedding,
    fuzz,
    detection,
    semantic_similarity,
    quality_score
  }
}

// ============================================================================
// INFERENCE ALGORITHM (Mean ± 1.5 * Std)
// ============================================================================

/**
 * Infer metric signature from selected features
 * Uses mean ± stdMultiplier * std for each metric
 */
export function inferMetricSignature(
  features: FeatureTableRow[],
  stdMultiplier: number = 1.5
): MetricSignature {
  if (features.length === 0) {
    // Return default signature if no features
    return {
      feature_splitting: { min: 0, max: 1 },
      embedding: { min: 0, max: 1 },
      fuzz: { min: 0, max: 1 },
      detection: { min: 0, max: 1 },
      semantic_similarity: { min: 0, max: 1 },
      quality_score: { min: 0, max: 1 }
    }
  }

  // Extract metric values for all features
  const metricArrays: {
    feature_splitting: number[]
    embedding: number[]
    fuzz: number[]
    detection: number[]
    semantic_similarity: number[]
    quality_score: number[]
  } = {
    feature_splitting: [],
    embedding: [],
    fuzz: [],
    detection: [],
    semantic_similarity: [],
    quality_score: []
  }

  features.forEach(feature => {
    const metrics = extractMetricValues(feature)
    metricArrays.feature_splitting.push(metrics.feature_splitting)
    metricArrays.embedding.push(metrics.embedding)
    metricArrays.fuzz.push(metrics.fuzz)
    metricArrays.detection.push(metrics.detection)
    metricArrays.semantic_similarity.push(metrics.semantic_similarity)
    metricArrays.quality_score.push(metrics.quality_score)
  })

  // Compute mean ± stdMultiplier*std for each metric
  const signature: MetricSignature = {} as MetricSignature

  Object.entries(metricArrays).forEach(([metricName, values]) => {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const std = Math.sqrt(variance)

    // Range: mean ± stdMultiplier*std, clamped to [0, 1]
    const min = Math.max(0, mean - stdMultiplier * std)
    const max = Math.min(1, mean + stdMultiplier * std)

    signature[metricName as keyof MetricSignature] = { min, max }
  })

  return signature
}

// ============================================================================
// WEIGHTED DISTANCE SYSTEM (Stage 2)
// ============================================================================

/**
 * Infer metric weights from signature ranges
 * Tighter ranges get higher weights (more important for matching)
 * Weights are normalized to sum to 6.0 (maintains distance scale)
 */
export function inferMetricWeights(signature: MetricSignature): MetricWeights {
  const metrics: (keyof MetricSignature)[] = [
    'feature_splitting',
    'embedding',
    'fuzz',
    'detection',
    'semantic_similarity',
    'quality_score'
  ]

  // Compute raw weights (inverse of range width)
  const rawWeights: Record<string, number> = {}
  metrics.forEach(metric => {
    const range = signature[metric]
    const width = range.max - range.min
    // Add small epsilon to avoid division by zero
    rawWeights[metric] = 1.0 / (width + 0.01)
  })

  // Normalize weights to sum to 6.0 (one per metric)
  const sum = Object.values(rawWeights).reduce((a, b) => a + b, 0)
  const normalizedWeights: MetricWeights = {} as MetricWeights
  metrics.forEach(metric => {
    normalizedWeights[metric] = (rawWeights[metric] / sum) * 6.0
  })

  return normalizedWeights
}

/**
 * Compute weighted Euclidean distance between feature and signature center
 * Uses MetricWeights to emphasize important metrics
 */
export function computeWeightedDistance(
  metricValues: ReturnType<typeof extractMetricValues>,
  signature: MetricSignature,
  weights: MetricWeights
): number {
  // Signature center: midpoint of each range
  const signatureCenter = {
    feature_splitting: (signature.feature_splitting.min + signature.feature_splitting.max) / 2,
    embedding: (signature.embedding.min + signature.embedding.max) / 2,
    fuzz: (signature.fuzz.min + signature.fuzz.max) / 2,
    detection: (signature.detection.min + signature.detection.max) / 2,
    semantic_similarity: (signature.semantic_similarity.min + signature.semantic_similarity.max) / 2,
    quality_score: (signature.quality_score.min + signature.quality_score.max) / 2
  }

  // Weighted Euclidean distance in 6D space
  const distance = Math.sqrt(
    weights.feature_splitting * Math.pow(metricValues.feature_splitting - signatureCenter.feature_splitting, 2) +
    weights.embedding * Math.pow(metricValues.embedding - signatureCenter.embedding, 2) +
    weights.fuzz * Math.pow(metricValues.fuzz - signatureCenter.fuzz, 2) +
    weights.detection * Math.pow(metricValues.detection - signatureCenter.detection, 2) +
    weights.semantic_similarity * Math.pow(metricValues.semantic_similarity - signatureCenter.semantic_similarity, 2) +
    weights.quality_score * Math.pow(metricValues.quality_score - signatureCenter.quality_score, 2)
  )

  return distance
}

// ============================================================================
// FEATURE MATCHING (Euclidean Distance)
// ============================================================================

/**
 * Check if feature matches metric signature
 * Returns true if ALL metrics are within range
 */
export function featureMatchesSignature(
  metricValues: ReturnType<typeof extractMetricValues>,
  signature: MetricSignature
): boolean {
  return (
    metricValues.feature_splitting >= signature.feature_splitting.min &&
    metricValues.feature_splitting <= signature.feature_splitting.max &&
    metricValues.embedding >= signature.embedding.min &&
    metricValues.embedding <= signature.embedding.max &&
    metricValues.fuzz >= signature.fuzz.min &&
    metricValues.fuzz <= signature.fuzz.max &&
    metricValues.detection >= signature.detection.min &&
    metricValues.detection <= signature.detection.max &&
    metricValues.semantic_similarity >= signature.semantic_similarity.min &&
    metricValues.semantic_similarity <= signature.semantic_similarity.max &&
    metricValues.quality_score >= signature.quality_score.min &&
    metricValues.quality_score <= signature.quality_score.max
  )
}

/**
 * Find candidate features matching signature using weighted distance
 * Returns top N candidates sorted by similarity score
 *
 * @param allFeatures - All available features to search
 * @param signature - Metric signature to match against
 * @param excludeFeatureIds - Features to exclude (e.g., already tagged)
 * @param rejectedFeatureIds - Features rejected for this tag
 * @param weights - Metric weights (optional, defaults to equal weights)
 * @param limit - Maximum number of candidates to return
 * @param method - Candidate discovery method configuration
 */
export function findCandidateFeatures(
  allFeatures: FeatureTableRow[],
  signature: MetricSignature,
  excludeFeatureIds: Set<number>,
  rejectedFeatureIds: Set<number> = new Set(),
  weights?: MetricWeights,
  limit: number = 20,
  method: { useRangeFilter: boolean; useWeightedDistance: boolean } = { useRangeFilter: true, useWeightedDistance: true }
): FeatureMatch[] {
  // Use provided weights or default to equal weights (1.0 each)
  const effectiveWeights = weights || {
    feature_splitting: 1.0,
    embedding: 1.0,
    fuzz: 1.0,
    detection: 1.0,
    semantic_similarity: 1.0,
    quality_score: 1.0
  }

  const candidates: FeatureMatch[] = []

  allFeatures.forEach(feature => {
    // Skip excluded features (already selected)
    if (excludeFeatureIds.has(feature.feature_id)) {
      return
    }

    // Skip rejected features for this tag
    if (rejectedFeatureIds.has(feature.feature_id)) {
      return
    }

    const metricValues = extractMetricValues(feature)

    // Mode 1: Range-Based Only - Filter then rank by unweighted distance
    if (method.useRangeFilter && !method.useWeightedDistance) {
      if (featureMatchesSignature(metricValues, signature)) {
        // Unweighted Euclidean distance
        const distance = Math.sqrt(
          Math.pow(metricValues.feature_splitting - (signature.feature_splitting.min + signature.feature_splitting.max) / 2, 2) +
          Math.pow(metricValues.embedding - (signature.embedding.min + signature.embedding.max) / 2, 2) +
          Math.pow(metricValues.fuzz - (signature.fuzz.min + signature.fuzz.max) / 2, 2) +
          Math.pow(metricValues.detection - (signature.detection.min + signature.detection.max) / 2, 2) +
          Math.pow(metricValues.semantic_similarity - (signature.semantic_similarity.min + signature.semantic_similarity.max) / 2, 2) +
          Math.pow(metricValues.quality_score - (signature.quality_score.min + signature.quality_score.max) / 2, 2)
        )
        const score = 1 / (1 + distance)

        candidates.push({
          featureId: feature.feature_id,
          distance,
          score,
          metricValues
        })
      }
    }
    // Mode 2: Weighted Distance Only - Rank all by weighted distance (no filtering)
    else if (!method.useRangeFilter && method.useWeightedDistance) {
      const distance = computeWeightedDistance(metricValues, signature, effectiveWeights)
      const score = 1 / (1 + distance)

      candidates.push({
        featureId: feature.feature_id,
        distance,
        score,
        metricValues
      })
    }
    // Mode 3: Both - Filter then rank by weighted distance (current behavior)
    else if (method.useRangeFilter && method.useWeightedDistance) {
      if (featureMatchesSignature(metricValues, signature)) {
        const distance = computeWeightedDistance(metricValues, signature, effectiveWeights)
        const score = 1 / (1 + distance)

        candidates.push({
          featureId: feature.feature_id,
          distance,
          score,
          metricValues
        })
      }
    }
    // Mode 4: Neither - No candidates (edge case)
    // Don't add anything to candidates
  })

  // Sort by score descending, return top N
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique tag ID
 */
export function generateTagId(): string {
  return `tag_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
