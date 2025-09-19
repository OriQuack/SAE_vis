/**
 * Threshold calculation and management utilities
 */

import { MetricType, HierarchicalThresholds } from '../types'

/**
 * Check if a node is a semantic distance node
 */
export function isSemanticDistanceNode(nodeId: string): boolean {
  return nodeId.includes('_semdist_') && !nodeId.includes('_agree_')
}

/**
 * Check if a node is a score agreement node
 */
export function isScoreAgreementNode(nodeId: string): boolean {
  return nodeId.includes('_agree_')
}

/**
 * Check if a node is a splitting node
 */
export function isSplittingNode(nodeId: string): boolean {
  return nodeId.startsWith('split_') && !nodeId.includes('_semdist_')
}

/**
 * Extract splitting parent ID from node ID
 * e.g., "split_true_semdist_high" -> "split_true"
 */
export function getSplittingParentId(nodeId: string): string | null {
  const match = nodeId.match(/^(split_(?:true|false))/)
  return match ? match[1] : null
}

/**
 * Extract semantic distance parent ID from score agreement node ID
 * e.g., "split_true_semdist_high_agree_all" -> "split_true_semdist_high"
 */
export function getSemanticDistanceParentId(nodeId: string): string | null {
  if (nodeId.includes('_agree_')) {
    const parts = nodeId.split('_')
    const parentParts = parts.slice(0, -2) // Remove "_agree_{type}" suffix
    return parentParts.join('_')
  }
  return null
}

/**
 * Get threshold group ID for a node based on its type
 */
export function getThresholdGroupId(nodeId: string, metric: MetricType): string | null {
  if (isSemanticDistanceNode(nodeId) && metric === 'semdist_mean') {
    // Semantic distance nodes share thresholds by splitting parent
    return getSplittingParentId(nodeId)
  } else if (isScoreAgreementNode(nodeId) &&
             (metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection')) {
    // Score agreement nodes share thresholds by semantic distance parent
    return getSemanticDistanceParentId(nodeId)
  }
  return null
}

/**
 * Get effective threshold value for a node and metric using hierarchical thresholds
 */
export function getEffectiveThreshold(
  nodeId: string,
  metric: MetricType,
  hierarchicalThresholds: HierarchicalThresholds
): number {
  // For semantic distance metrics
  if (metric === 'semdist_mean') {
    const splittingParent = getSplittingParentId(nodeId)
    if (splittingParent && hierarchicalThresholds.semantic_distance_groups?.[splittingParent]) {
      return hierarchicalThresholds.semantic_distance_groups[splittingParent]
    }
    return hierarchicalThresholds.global_thresholds.semdist_mean
  }

  // For score metrics
  if (metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') {
    const semanticParent = getSemanticDistanceParentId(nodeId)
    if (semanticParent && hierarchicalThresholds.score_agreement_groups?.[semanticParent]) {
      const scoreThresholds = hierarchicalThresholds.score_agreement_groups[semanticParent]
      return scoreThresholds[metric] ?? hierarchicalThresholds.global_thresholds.score_high
    }
    return hierarchicalThresholds.global_thresholds.score_high
  }

  // Default fallback
  return metric === 'semdist_mean'
    ? hierarchicalThresholds.global_thresholds.semdist_mean
    : hierarchicalThresholds.global_thresholds.score_high
}

/**
 * Clamp a threshold value between min and max
 */
export function clampThreshold(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Format threshold value for display
 */
export function formatThreshold(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}

/**
 * Calculate relative position of threshold within a range
 */
export function getThresholdPosition(
  threshold: number,
  min: number,
  max: number,
  width: number
): number {
  if (max === min) return width / 2
  return ((threshold - min) / (max - min)) * width
}

/**
 * Calculate threshold value from position
 */
export function getThresholdFromPosition(
  position: number,
  min: number,
  max: number,
  width: number
): number {
  if (width === 0) return min
  return min + (position / width) * (max - min)
}