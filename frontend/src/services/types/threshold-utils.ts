import type { Thresholds, SankeyNode } from './api'
import type { MetricType } from './ui'

// ============================================================================
// THRESHOLD TYPES
// ============================================================================


// New hierarchical threshold system
export interface HierarchicalThresholds {
  global_thresholds: Thresholds

  // Feature splitting threshold groups: can be customized by different conditions
  // Key format: "condition" -> feature splitting threshold for that condition
  feature_splitting_groups?: {
    [condition: string]: number
  }

  // Semantic distance thresholds grouped by splitting parent
  // Key format: "split_{true/false}" -> threshold value for all semantic distance nodes under this splitting parent
  semantic_distance_groups?: {
    [splittingParentId: string]: number
  }

  // Score thresholds grouped by semantic distance parent
  // Key format: "split_{true/false}_semdist_{high/low}" -> score threshold values for all score nodes under this semantic distance parent
  score_agreement_groups?: {
    [semanticParentId: string]: {
      score_fuzz?: number
      score_simulation?: number
      score_detection?: number
    }
  }

  // Individual node threshold overrides
  // Key format: "node_{nodeId}" -> threshold values for specific individual nodes
  individual_node_groups?: {
    [nodeGroupId: string]: {
      [metric in MetricType]?: number
    }
  }
}

// Threshold group types for UI management
export type ThresholdGroupType = 'semantic_distance' | 'score_agreement'

export interface ThresholdGroup {
  id: string                      // Group identifier (e.g., "split_true", "split_true_semdist_high")
  type: ThresholdGroupType        // Type of threshold group
  name: string                    // Display name for UI
  nodeIds: string[]              // List of node IDs that share this threshold group
  metrics: MetricType[]          // Which metrics this group controls
  parentGroupId?: string         // Parent group ID for hierarchical display
}

// Utility functions for threshold group management
export interface ThresholdGroupUtils {
  getGroupsForNode(nodeId: string): ThresholdGroup[]
  getSharedNodesForGroup(groupId: string): string[]
  isNodeInGroup(nodeId: string, groupId: string): boolean
  getEffectiveThreshold(nodeId: string, metric: MetricType, hierarchicalThresholds: HierarchicalThresholds): number
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Utility function to extract parent node ID from score agreement node
 */
export function getParentNodeId(scoreAgreementNodeId: string): string | null {
  // Score agreement nodes have format: split_{true/false}_semdist_{high/low}_{agreement}
  // We want to extract: split_{true/false}_semdist_{high/low}
  const match = scoreAgreementNodeId.match(/^(split_\w+_semdist_\w+)_agree_\w+$/)
  return match ? match[1] : null
}

/**
 * Check if a node is a score agreement node
 */
export function isScoreAgreementNode(nodeId: string): boolean {
  return nodeId.includes('_agree_')
}

/**
 * Check if a node is a semantic distance node
 */
export function isSemanticDistanceNode(nodeId: string): boolean {
  return nodeId.includes('_semdist_') && !nodeId.includes('_agree_')
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
 * Extract feature splitting parent ID from node ID
 * Feature splitting is the top-level split, so we return null to use global thresholds
 */
export function getFeatureSplittingParentId(_nodeId: string): string | null {
  // Feature splitting nodes should use global thresholds
  return null
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
export function getThresholdGroupId(nodeId: string, metric: MetricType): string {
  if (metric === 'feature_splitting' && (nodeId === 'split_true' || nodeId === 'split_false')) {
    // Feature splitting nodes share the same global threshold
    return 'feature_splitting_global'
  } else if (isSemanticDistanceNode(nodeId) && metric === 'semdist_mean') {
    // Semantic distance nodes share thresholds by splitting parent
    return getSplittingParentId(nodeId) || `node_${nodeId}`
  } else if (isScoreAgreementNode(nodeId) && (metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection')) {
    // Score agreement nodes share thresholds by semantic distance parent
    return getSemanticDistanceParentId(nodeId) || `node_${nodeId}`
  }
  // Individual node threshold group for nodes that don't belong to natural groups
  return `node_${nodeId}`
}

/**
 * Get all nodes that share the same threshold group
 */
export function getNodesInThresholdGroup(groupId: string, allNodes: SankeyNode[], metric: MetricType): string[] {
  return allNodes
    .filter(node => getThresholdGroupId(node.id, metric) === groupId)
    .map(node => node.id)
}

/**
 * Get effective threshold value for a node and metric using hierarchical thresholds
 */
export function getEffectiveThreshold(
  nodeId: string,
  metric: MetricType,
  hierarchicalThresholds: HierarchicalThresholds
): number {
  // First check if there's an individual node override
  const individualGroupId = `node_${nodeId}`
  if (hierarchicalThresholds.individual_node_groups?.[individualGroupId]?.[metric] !== undefined) {
    return hierarchicalThresholds.individual_node_groups[individualGroupId][metric]!
  }

  // For feature splitting metrics
  if (metric === 'feature_splitting') {
    // Check if there's a feature splitting group override for the parent node
    const splittingParent = getFeatureSplittingParentId(nodeId)
    if (splittingParent && hierarchicalThresholds.feature_splitting_groups?.[splittingParent]) {
      return hierarchicalThresholds.feature_splitting_groups[splittingParent]
    }
    return hierarchicalThresholds.global_thresholds.feature_splitting
  }

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
      const groupThresholds = hierarchicalThresholds.score_agreement_groups[semanticParent]
      const thresholdValue = groupThresholds[metric]
      if (thresholdValue !== undefined) {
        return thresholdValue
      }
    }
    return hierarchicalThresholds.global_thresholds.score_high
  }

  // Default fallback
  return hierarchicalThresholds.global_thresholds.score_high
}

/**
 * Create hierarchical thresholds with global thresholds
 */
export function createHierarchicalThresholds(
  globalThresholds: Thresholds
): HierarchicalThresholds {
  return {
    global_thresholds: globalThresholds
  }
}