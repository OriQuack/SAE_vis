// ============================================================================
// THRESHOLD TREE UTILITIES
// Helper functions for operating on the unified threshold tree structure
// ============================================================================

import type { ThresholdNode, ThresholdTree, MetricType } from '../types'

// ============================================================================
// TREE TRAVERSAL AND SEARCH
// ============================================================================

/**
 * Find a node by its ID in the threshold tree
 */
export function findNodeById(tree: ThresholdTree, nodeId: string): ThresholdNode | null {
  function search(node: ThresholdNode): ThresholdNode | null {
    if (node.id === nodeId) {
      return node
    }

    if (node.split?.children) {
      for (const child of node.split.children) {
        const result = search(child)
        if (result) return result
      }
    }

    return null
  }

  return search(tree.root)
}

/**
 * Get the path from root to a specific node
 * Returns array of node IDs from root to target
 */
export function getNodePath(tree: ThresholdTree, nodeId: string): string[] {
  function findPath(node: ThresholdNode, path: string[]): string[] | null {
    if (node.id === nodeId) {
      return [...path, node.id]
    }

    if (node.split?.children) {
      for (const child of node.split.children) {
        const result = findPath(child, [...path, node.id])
        if (result) return result
      }
    }

    return null
  }

  return findPath(tree.root, []) || []
}

/**
 * Get parent node of a given node ID
 */
export function getParentNode(tree: ThresholdTree, nodeId: string): ThresholdNode | null {
  function findParent(node: ThresholdNode): ThresholdNode | null {
    if (node.split?.children) {
      for (const child of node.split.children) {
        if (child.id === nodeId) {
          return node
        }

        const result = findParent(child)
        if (result) return result
      }
    }

    return null
  }

  return findParent(tree.root)
}

/**
 * Traverse the entire tree with a callback function
 */
export function traverseTree(tree: ThresholdTree, callback: (node: ThresholdNode, depth: number) => void): void {
  function traverse(node: ThresholdNode, depth: number): void {
    callback(node, depth)

    if (node.split?.children) {
      for (const child of node.split.children) {
        traverse(child, depth + 1)
      }
    }
  }

  traverse(tree.root, 0)
}

// ============================================================================
// THRESHOLD OPERATIONS
// ============================================================================

/**
 * Update thresholds for a specific node
 * Creates a new tree with updated thresholds (immutable operation)
 */
export function updateNodeThreshold(
  tree: ThresholdTree,
  nodeId: string,
  thresholds: number[]
): ThresholdTree {
  function updateNode(node: ThresholdNode): ThresholdNode {
    if (node.id === nodeId) {
      return {
        ...node,
        split: node.split ? {
          ...node.split,
          thresholds: [...thresholds]
        } : undefined
      }
    }

    if (node.split?.children) {
      return {
        ...node,
        split: {
          ...node.split,
          children: node.split.children.map(updateNode)
        }
      }
    }

    return node
  }

  return {
    ...tree,
    root: updateNode(tree.root)
  }
}

/**
 * Get all metrics used in a node (for histogram display)
 */
export function getNodeMetrics(node: ThresholdNode): MetricType[] {
  if (!node.split) {
    // Leaf node - no metrics to display
    return []
  }

  if (!node.metric) {
    // No metric defined for this split
    return []
  }

  // Handle special case for score metrics (multiple thresholds for multiple scores)
  if (node.metric === 'score_combined') {
    return ['score_fuzz', 'score_detection', 'score_simulation'] as MetricType[]
  }

  return [node.metric as MetricType]
}

/**
 * Get effective threshold values for a node and metric
 */
export function getEffectiveThreshold(
  tree: ThresholdTree,
  nodeId: string,
  metric: string
): number | number[] | null {
  const node = findNodeById(tree, nodeId)

  if (!node?.split) {
    return null
  }

  // For score_combined nodes, return array of thresholds
  if (node.metric === 'score_combined') {
    return node.split.thresholds
  }

  // For single metric nodes, return single threshold
  if (node.metric === metric && node.split.thresholds.length === 1) {
    return node.split.thresholds[0]
  }

  return null
}

// ============================================================================
// TREE CONSTRUCTION
// ============================================================================

/**
 * Build the default threshold tree structure matching current 3-stage flow
 */
export function buildDefaultTree(): ThresholdTree {
  // Score agreement children for each semantic distance node
  const buildScoreChildren = (prefix: string) => [
    { id: `${prefix}_agree_all3low` },
    { id: `${prefix}_agree_1of3high` },
    { id: `${prefix}_agree_2of3high` },
    { id: `${prefix}_agree_all3high` }
  ]

  // Semantic distance children for each feature splitting node
  const buildSemanticChildren = (prefix: string) => [
    {
      id: `${prefix}_semdist_low`,
      metric: 'score_combined',
      split: {
        thresholds: [0.5, 0.5, 0.2], // fuzz, detection, simulation
        children: buildScoreChildren(`${prefix}_semdist_low`)
      }
    },
    {
      id: `${prefix}_semdist_high`,
      metric: 'score_combined',
      split: {
        thresholds: [0.5, 0.5, 0.2], // fuzz, detection, simulation
        children: buildScoreChildren(`${prefix}_semdist_high`)
      }
    }
  ]

  const root: ThresholdNode = {
    id: 'root',
    metric: 'feature_splitting',
    split: {
      thresholds: [0.1],
      children: [
        {
          id: 'split_false',
          metric: 'semdist_mean',
          split: {
            thresholds: [0.1],
            children: buildSemanticChildren('split_false')
          }
        },
        {
          id: 'split_true',
          metric: 'semdist_mean',
          split: {
            thresholds: [0.1],
            children: buildSemanticChildren('split_true')
          }
        }
      ]
    }
  }

  // Collect all metrics used in the tree
  const metrics = new Set<string>()
  traverseTree({ root, metrics }, (node) => {
    if (node.metric) {
      if (node.metric === 'score_combined') {
        metrics.add('score_fuzz')
        metrics.add('score_detection')
        metrics.add('score_simulation')
      } else {
        metrics.add(node.metric)
      }
    }
  })

  return { root, metrics }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate that a threshold tree is properly structured
 */
export function validateThresholdTree(tree: ThresholdTree): string[] {
  const errors: string[] = []

  traverseTree(tree, (node, depth) => {
    // Check node ID is not empty
    if (!node.id || node.id.trim() === '') {
      errors.push(`Node at depth ${depth} has empty ID`)
    }

    // Check split structure if it exists
    if (node.split) {
      if (!Array.isArray(node.split.thresholds)) {
        errors.push(`Node ${node.id} has invalid thresholds (not an array)`)
      }

      if (!Array.isArray(node.split.children)) {
        errors.push(`Node ${node.id} has invalid children (not an array)`)
      }

      if (node.split.children.length !== node.split.thresholds.length + 1) {
        errors.push(
          `Node ${node.id} has ${node.split.children.length} children but ${node.split.thresholds.length} thresholds ` +
          `(should be ${node.split.thresholds.length + 1} children)`
        )
      }

      // Check thresholds are in ascending order
      for (let i = 1; i < node.split.thresholds.length; i++) {
        if (node.split.thresholds[i] <= node.split.thresholds[i - 1]) {
          errors.push(`Node ${node.id} has thresholds not in ascending order`)
        }
      }
    }
  })

  return errors
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Convert old HierarchicalThresholds to new ThresholdTree format
 * This is a migration helper function
 */
export function legacyToTree(_hierarchicalThresholds: any): ThresholdTree {
  // For now, just return the default tree
  // TODO: Implement proper conversion logic based on legacy structure
  console.warn('Legacy threshold conversion not yet implemented, using default tree')
  return buildDefaultTree()
}

/**
 * Convert ThresholdTree to legacy HierarchicalThresholds format
 * This is a migration helper function for backward compatibility
 */
export function treeToLegacy(tree: ThresholdTree): any {
  // Extract thresholds from tree nodes and convert to legacy format
  const globalThresholds: any = {}

  traverseTree(tree, (node) => {
    if (node.split && node.metric) {
      if (node.metric === 'score_combined') {
        globalThresholds.score_fuzz = node.split.thresholds[0] || 0.5
        globalThresholds.score_detection = node.split.thresholds[1] || 0.5
        globalThresholds.score_simulation = node.split.thresholds[2] || 0.2
      } else {
        globalThresholds[node.metric] = node.split.thresholds[0] || 0.1
      }
    }
  })

  return {
    global_thresholds: {
      feature_splitting: globalThresholds.feature_splitting || 0.1,
      semdist_mean: globalThresholds.semdist_mean || 0.1,
      score_fuzz: globalThresholds.score_fuzz || 0.5,
      score_detection: globalThresholds.score_detection || 0.5,
      score_simulation: globalThresholds.score_simulation || 0.2
    }
  }
}