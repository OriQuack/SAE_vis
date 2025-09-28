import type {
    SankeyThreshold,
    ThresholdTreeV2,
    RangeSplitRule,
    PatternSplitRule,
    MetricType
} from '../types'
import { buildDefaultThresholdStructure } from './split-rule-builders'

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
  tree: ThresholdTreeV2,
  nodeId: string
): SankeyThreshold | null {
  const node = tree.nodes.find(node => node.id === nodeId)
  return node || null
}

/**
 * Get the path from root to a specific node
 * @param tree The threshold tree
 * @param nodeId ID of the target node
 * @returns Array of node IDs from root to target
 */
export function getNodePath(tree: ThresholdTreeV2, nodeId: string): string[] {
  const target = findNodeById(tree, nodeId)
  if (!target) return []

  const path = [nodeId]
  let current = target

  while (current.parent_path.length > 0) {
    const parentId = current.parent_path[current.parent_path.length - 1].parent_id
    path.unshift(parentId)
    const parent = findNodeById(tree, parentId)
    if (!parent) break
    current = parent
  }

  return path
}

/**
 * Get parent node of a given node
 * @param tree The threshold tree
 * @param nodeId ID of the child node
 * @returns The parent node or null
 */
export function getParentNode(tree: ThresholdTreeV2, nodeId: string): SankeyThreshold | null {
  const child = findNodeById(tree, nodeId)
  if (!child || child.parent_path.length === 0) return null

  const parentId = child.parent_path[child.parent_path.length - 1].parent_id
  return findNodeById(tree, parentId)
}

/**
 * Traverse the entire tree with a callback function
 * @param tree The threshold tree
 * @param callback Function to call for each node with node and depth
 */
export function traverseTree(
  tree: ThresholdTreeV2,
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
  const root = tree.nodes.find(n => n.id === 'root')
  if (root) {
    traverse('root', 0)
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
  tree: ThresholdTreeV2,
  nodeId: string,
  thresholds: number[],
  metric?: string
): ThresholdTreeV2 {
  const node = findNodeById(tree, nodeId)
  if (!node) return tree

  let updatedNodes = tree.nodes

  // Handle different split rule types
  if (node.split_rule?.type === 'range') {
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
  } else if (node.split_rule?.type === 'pattern') {
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

  if (node.split_rule.type === 'range') {
    metrics = [node.split_rule.metric]
  } else if (node.split_rule.type === 'pattern') {
    metrics = Object.keys(node.split_rule.conditions)
  } else if (node.split_rule.type === 'expression' && node.split_rule.available_metrics) {
    metrics = node.split_rule.available_metrics
  }

  // Filter to only valid MetricType values
  return metrics.filter(m =>
    ['feature_splitting', 'semdist_mean', 'semdist_max',
     'score_fuzz', 'score_simulation', 'score_detection', 'score_embedding'].includes(m)
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
  tree: ThresholdTreeV2,
  nodeId: string,
  metric: string
): number | number[] | null {
  const node = findNodeById(tree, nodeId)
  if (!node?.split_rule) return null

  if (node.split_rule.type === 'range' && node.split_rule.metric === metric) {
    const thresholds = node.split_rule.thresholds
    return thresholds.length === 1 ? thresholds[0] : thresholds
  } else if (node.split_rule.type === 'pattern') {
    const condition = node.split_rule.conditions[metric]
    if (condition?.threshold !== undefined) {
      return condition.threshold
    }
  }

  return null
}

/**
 * Build the default threshold tree structure
 * @returns ThresholdTreeV2 with default 3-stage flow
 */
export function buildDefaultTree(): ThresholdTreeV2 {
  const nodes = buildDefaultThresholdStructure()
  const metrics = getAllMetrics(nodes)

  return {
    nodes,
    metrics,
    version: 2
  }
}

/**
 * Validate that a threshold tree is properly structured
 * @param tree The threshold tree to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateThresholdTree(tree: ThresholdTreeV2): string[] {
  const errors: string[] = []

  traverseTree(tree, (node, depth) => {
    // Check node ID is not empty
    if (!node.id || node.id.trim() === '') {
      errors.push(`Node at depth ${depth} has empty ID`)
    }

    // Check split rule structure if it exists
    if (node.split_rule) {
      if (node.split_rule.type === 'range') {
        const rule = node.split_rule as RangeSplitRule
        if (!Array.isArray(rule.thresholds)) {
          errors.push(`Node ${node.id} has invalid thresholds (not an array)`)
        }
        // Check thresholds are in ascending order
        for (let i = 1; i < rule.thresholds.length; i++) {
          if (rule.thresholds[i] <= rule.thresholds[i - 1]) {
            errors.push(`Node ${node.id} has thresholds not in ascending order`)
          }
        }
        // Check children count matches thresholds + 1
        if (node.children_ids.length !== rule.thresholds.length + 1) {
          errors.push(
            `Node ${node.id} has ${node.children_ids.length} children but ${rule.thresholds.length} thresholds ` +
            `(should be ${rule.thresholds.length + 1} children)`
          )
        }
      } else if (node.split_rule.type === 'pattern') {
        const rule = node.split_rule as PatternSplitRule
        // Check that all patterns have valid child_ids
        for (const pattern of rule.patterns) {
          if (!node.children_ids.includes(pattern.child_id)) {
            errors.push(`Node ${node.id} pattern references child ${pattern.child_id} not in children_ids`)
          }
        }
      }
    } else {
      // Leaf node should have no children
      if (node.children_ids.length > 0) {
        errors.push(`Leaf node ${node.id} has children but no split_rule`)
      }
    }
  })

  // Check for orphaned nodes
  const nodeIds = new Set(tree.nodes.map(n => n.id))
  for (const node of tree.nodes) {
    for (const childId of node.children_ids) {
      if (!nodeIds.has(childId)) {
        errors.push(`Node ${node.id} references non-existent child ${childId}`)
      }
    }
  }

  return errors
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all nodes at a specific stage
 * @param tree The threshold tree
 * @param stage Stage number
 * @returns Array of nodes at the specified stage
 */
export function getNodesByStage(
  tree: ThresholdTreeV2,
  stage: number
): SankeyThreshold[] {
  return tree.nodes.filter(node => node.stage === stage)
}

/**
 * Get child nodes of a parent
 * @param tree The threshold tree
 * @param parentId ID of the parent node
 * @returns Array of child nodes
 */
export function getChildNodes(
  tree: ThresholdTreeV2,
  parentId: string
): SankeyThreshold[] {
  const parent = findNodeById(tree, parentId)
  if (!parent) return []

  return parent.children_ids
    .map(childId => findNodeById(tree, childId))
    .filter((node): node is SankeyThreshold => node !== null)
}

/**
 * Check if a node is a leaf (has no children)
 * @param node The node to check
 * @returns True if the node is a leaf
 */
export function isLeafNode(node: SankeyThreshold): boolean {
  return node.split_rule === null || node.children_ids.length === 0
}

/**
 * Get all metrics used in the threshold structure
 * @param nodes Array of threshold nodes
 * @returns Array of unique metric names
 */
export function getAllMetrics(nodes: SankeyThreshold[]): string[] {
  const metrics = new Set<string>()

  for (const node of nodes) {
    if (!node.split_rule) continue

    if (node.split_rule.type === 'range') {
      metrics.add(node.split_rule.metric)
    } else if (node.split_rule.type === 'pattern') {
      Object.keys(node.split_rule.conditions).forEach(metric => metrics.add(metric))
    } else if (node.split_rule.type === 'expression' && node.split_rule.available_metrics) {
      node.split_rule.available_metrics.forEach(metric => metrics.add(metric))
    }
  }

  return Array.from(metrics)
}

/**
 * Get nodes in the same threshold group (for batch threshold updates)
 * @param tree The threshold tree
 * @param nodeId ID of the reference node
 * @param metric The metric to check
 * @returns Array of nodes that share the same threshold group
 */
export function getNodesInSameThresholdGroup(
  tree: ThresholdTreeV2,
  nodeId: string,
  _metric: MetricType
): SankeyThreshold[] {
  const referenceNode = findNodeById(tree, nodeId)
  if (!referenceNode) return []

  // For now, return just the single node
  // This can be expanded to find nodes with shared threshold configurations
  return [referenceNode]
}

/**
 * Reset threshold tree to default values
 * @returns New default threshold tree
 */
export function resetThresholdTree(): ThresholdTreeV2 {
  return buildDefaultTree()
}

/**
 * Create an empty threshold tree v2
 * @returns Empty ThresholdTreeV2
 */
export function createEmptyThresholdTree(): ThresholdTreeV2 {
  return {
    nodes: [],
    metrics: [],
    version: 2
  }
}

/**
 * Serialize threshold tree for API requests
 * @param tree The threshold tree
 * @returns Serializable tree structure
 */
export function serializeThresholdTree(tree: ThresholdTreeV2): any {
  return {
    nodes: tree.nodes,
    metrics: tree.metrics,
    version: tree.version
  }
}