import type {
    SankeyThreshold,
    ThresholdTree as ThresholdTree,
    RangeSplitRule,
    PatternSplitRule,
    MetricType
} from '../types'
import {
    NODE_ROOT_ID,
    SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
    METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
    METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING
} from './constants'

// ============================================================================
// CORE THRESHOLD TREE UTILITIES FOR V2 SYSTEM
// ============================================================================

/**
 * Find a node by ID in the threshold tree
 * @param tree The threshold tree
 * @param nodeId ID of the node to find
 * @returns The found node or null
 */
export function findNodeById(
  tree: ThresholdTree,
  nodeId: string
): SankeyThreshold | null {
  const node = tree.nodes.find(node => node.id === nodeId)
  return node || null
}

/**
 * Traverse the entire tree with a callback function
 * @param tree The threshold tree
 * @param callback Function to call for each node with node and depth
 */
export function traverseTree(
  tree: ThresholdTree,
  callback: (node: SankeyThreshold, depth: number) => void
): void {
  const visited = new Set<string>()

  function traverse(nodeId: string, depth: number): void {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = findNodeById(tree, nodeId)
    if (!node) return

    callback(node, depth)

    for (const childId of node.children_ids) {
      traverse(childId, depth + 1)
    }
  }

  // Start from root
  const root = tree.nodes.find(n => n.id === NODE_ROOT_ID)
  if (root) {
    traverse(NODE_ROOT_ID, 0)
  }
}

/**
 * Update thresholds for a specific node
 * Creates a new tree with updated thresholds (immutable operation)
 * @param tree The threshold tree
 * @param nodeId ID of the node to update
 * @param thresholds New threshold values
 * @returns Updated threshold tree
 */
export function updateNodeThreshold(
  tree: ThresholdTree,
  nodeId: string,
  thresholds: number[],
  metric?: string
): ThresholdTree {
  const node = findNodeById(tree, nodeId)
  if (!node) return tree

  let updatedNodes = tree.nodes

  // Handle different split rule types
  if (node.split_rule?.type === SPLIT_TYPE_RANGE) {
    // For range splits, directly update thresholds
    updatedNodes = tree.nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          split_rule: {
            ...n.split_rule as RangeSplitRule,
            thresholds: thresholds
          }
        }
      }
      return n
    })
  } else if (node.split_rule?.type === SPLIT_TYPE_PATTERN) {
    // For pattern splits, update specific metric's threshold
    const rule = node.split_rule as PatternSplitRule

    updatedNodes = tree.nodes.map(n => {
      if (n.id === nodeId) {
        const updatedConditions = { ...rule.conditions }

        if (metric && updatedConditions[metric]) {
          // Update specific metric
          updatedConditions[metric] = {
            ...updatedConditions[metric],
            threshold: thresholds[0]
          }
        } else {
          // Fallback: update all metrics by index when no specific metric provided
          const metrics = Object.keys(rule.conditions)
          metrics.forEach((m, idx) => {
            if (idx < thresholds.length) {
              updatedConditions[m] = {
                ...updatedConditions[m],
                threshold: thresholds[idx]
              }
            }
          })
        }

        return {
          ...n,
          split_rule: {
            ...rule,
            conditions: updatedConditions
          }
        }
      }
      return n
    })
  }

  return {
    ...tree,
    nodes: updatedNodes
  }
}

/**
 * Get all metrics used in a node (for histogram display)
 * @param node The node to get metrics for
 * @returns Array of metrics as MetricType[]
 */
export function getNodeMetrics(node: SankeyThreshold): MetricType[] {
  if (!node.split_rule) {
    // Leaf node - no metrics to display
    return []
  }

  let metrics: string[] = []

  if (node.split_rule.type === SPLIT_TYPE_RANGE) {
    metrics = [node.split_rule.metric]
  } else if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
    metrics = Object.keys(node.split_rule.conditions)
  } else if (node.split_rule.type === SPLIT_TYPE_EXPRESSION && node.split_rule.available_metrics) {
    metrics = node.split_rule.available_metrics
  }

  // Filter to only valid MetricType values
  return metrics.filter(m =>
    [METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
     METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING].includes(m)
  ) as MetricType[]
}

/**
 * Get effective threshold values for a node and metric
 * @param tree The threshold tree
 * @param nodeId ID of the node
 * @param metric Metric name
 * @returns The threshold value(s) or null
 */
export function getEffectiveThreshold(
  tree: ThresholdTree,
  nodeId: string,
  metric: string
): number | number[] | null {
  const node = findNodeById(tree, nodeId)
  if (!node?.split_rule) return null

  if (node.split_rule.type === SPLIT_TYPE_RANGE && node.split_rule.metric === metric) {
    const thresholds = node.split_rule.thresholds
    return thresholds.length === 1 ? thresholds[0] : thresholds
  } else if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
    const condition = node.split_rule.conditions[metric]
    if (condition?.threshold !== undefined) {
      return condition.threshold
    }
  }

  return null
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all metrics used in the threshold structure
 * @param nodes Array of threshold nodes
 * @returns Array of unique metric names
 */
export function getAllMetrics(nodes: SankeyThreshold[]): string[] {
  const metrics = new Set<string>()

  for (const node of nodes) {
    if (!node.split_rule) continue

    if (node.split_rule.type === SPLIT_TYPE_RANGE) {
      metrics.add(node.split_rule.metric)
    } else if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
      Object.keys(node.split_rule.conditions).forEach(metric => metrics.add(metric))
    } else if (node.split_rule.type === SPLIT_TYPE_EXPRESSION && node.split_rule.available_metrics) {
      node.split_rule.available_metrics.forEach(metric => metrics.add(metric))
    }
  }

  return Array.from(metrics)
}