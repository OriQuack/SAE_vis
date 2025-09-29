import type {
  ThresholdTree,
  SankeyThreshold,
  RangeSplitRule,
  PatternSplitRule,
  ExpressionSplitRule,
  CategoryType
} from '../types'
import {
  buildRangeSplit,
  buildScoreAgreementSplit,
  createNode,
  createParentPath
} from './split-rule-builders'
import {
  findNodeById,
  getAllMetrics,
  traverseTree
} from './threshold-utils'
import {
  NODE_ROOT_ID,
  SPLIT_TYPE_RANGE,
  SPLIT_TYPE_PATTERN,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMDIST_MEAN
} from './constants'
import { CategoryType as CategoryTypeEnum } from '../types'

// ============================================================================
// DYNAMIC TREE BUILDER UTILITIES
// ============================================================================

/**
 * Available stage types that can be added to the tree
 */
export interface StageTypeConfig {
  id: string
  name: string
  description: string
  category: CategoryType
  defaultSplitRule: 'range' | 'pattern' | 'expression'
  defaultMetric?: string
  defaultThresholds?: number[]
}

/**
 * Configuration for adding a new stage to a node
 */
export interface AddStageConfig {
  stageType: string
  splitRuleType: 'range' | 'pattern' | 'expression'
  metric?: string
  thresholds?: number[]
  customConfig?: any
}

/**
 * Available stage types that can be added dynamically
 */
export const AVAILABLE_STAGE_TYPES: StageTypeConfig[] = [
  {
    id: 'feature_splitting',
    name: 'Feature Splitting',
    description: 'Split features based on feature_splitting metric',
    category: CategoryTypeEnum.FEATURE_SPLITTING,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_FEATURE_SPLITTING,
    defaultThresholds: [0.1]
  },
  {
    id: 'semantic_distance',
    name: 'Semantic Distance',
    description: 'Split features based on semantic distance',
    category: CategoryTypeEnum.SEMANTIC_DISTANCE,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_SEMDIST_MEAN,
    defaultThresholds: [0.1]
  },
  {
    id: 'score_agreement',
    name: 'Score Agreement',
    description: 'Classify features based on scoring method agreement',
    category: CategoryTypeEnum.SCORE_AGREEMENT,
    defaultSplitRule: 'pattern',
    defaultThresholds: [0.5, 0.5, 0.2]
  }
]

/**
 * Create a minimal threshold tree with only the root node
 * @returns ThresholdTree with just the root node
 */
export function createRootOnlyTree(): ThresholdTree {
  const rootNode = createNode(
    NODE_ROOT_ID,
    0,
    CategoryTypeEnum.ROOT,
    [],
    null, // No split rule initially
    []    // No children initially
  )

  return {
    nodes: [rootNode],
    metrics: [],
    version: 2
  }
}

/**
 * Check if a node can have stages added to it (is a leaf node)
 * @param tree The threshold tree
 * @param nodeId ID of the node to check
 * @returns True if the node can have stages added
 */
export function canAddStageToNode(tree: ThresholdTree, nodeId: string): boolean {
  const node = findNodeById(tree, nodeId)
  if (!node) {
    return false
  }

  const canAdd = node.split_rule === null && node.children_ids.length === 0

  // Can add stage if node has no split rule (is a leaf)
  return canAdd
}

// /**
//  * Get the next available stage number for a new stage
//  * @param tree The threshold tree
//  * @returns Next stage number
//  */
// function getNextStageNumber(tree: ThresholdTree): number {
//   let maxStage = 0
//   traverseTree(tree, (node) => {
//     if (node.stage > maxStage) {
//       maxStage = node.stage
//     }
//   })
//   return maxStage + 1
// }

/**
 * Add a new stage to a specific node in the threshold tree
 * @param tree The current threshold tree
 * @param nodeId ID of the node to add stage to
 * @param config Configuration for the new stage
 * @returns Updated threshold tree
 */
export function addStageToNode(
  tree: ThresholdTree,
  nodeId: string,
  config: AddStageConfig
): ThresholdTree {
  const parentNode = findNodeById(tree, nodeId)
  if (!parentNode) {
    throw new Error(`Node ${nodeId} not found in tree`)
  }

  if (!canAddStageToNode(tree, nodeId)) {
    throw new Error(`Cannot add stage to node ${nodeId} - it already has children`)
  }

  const stageConfig = AVAILABLE_STAGE_TYPES.find(s => s.id === config.stageType)
  if (!stageConfig) {
    throw new Error(`Unknown stage type: ${config.stageType}`)
  }

  // Children should be at parent's stage + 1, not max stage + 1
  // This ensures siblings at the same level have the same stage number
  const nextStage = parentNode.stage + 1
  const newNodes: SankeyThreshold[] = []

  // Create split rule based on configuration
  let splitRule: RangeSplitRule | PatternSplitRule | ExpressionSplitRule | null = null
  let childrenIds: string[] = []

  if (config.splitRuleType === 'range') {
    const metric = config.metric || stageConfig.defaultMetric
    const thresholds = config.thresholds || stageConfig.defaultThresholds || [0.5]

    if (!metric) {
      throw new Error(`Metric required for range split rule`)
    }

    splitRule = buildRangeSplit(metric, thresholds)

    // Create child nodes for range split (N thresholds = N+1 children)
    for (let i = 0; i <= thresholds.length; i++) {
      const childId = `${nodeId}_${metric}_${i}`
      childrenIds.push(childId)

      const parentPath = [...parentNode.parent_path, createParentPath(
        nodeId,
        'range',
        i,
        { metric, thresholds }
      )]

      const childNode = createNode(
        childId,
        nextStage,
        stageConfig.category,
        parentPath,
        null, // Leaf node initially
        []
      )

      newNodes.push(childNode)
    }
  } else if (config.splitRuleType === 'pattern' && config.stageType === 'score_agreement') {
    // Use the existing score agreement pattern split
    splitRule = buildScoreAgreementSplit(
      config.thresholds?.[0] || 0.5, // fuzz threshold
      config.thresholds?.[1] || 0.5, // simulation threshold
      config.thresholds?.[2] || 0.2  // detection threshold
    )

    // Create child nodes for score agreement patterns
    const scoreCategories = [
      'all_3_high', '2_of_3_high_fuzz_sim', '2_of_3_high_fuzz_det',
      '2_of_3_high_sim_det', '1_of_3_high_fuzz', '1_of_3_high_sim',
      '1_of_3_high_det', 'all_3_low'
    ]

    scoreCategories.forEach((category, idx) => {
      const childId = `${nodeId}_${category}`
      childrenIds.push(childId)

      const parentPath = [...parentNode.parent_path, createParentPath(
        nodeId,
        'pattern',
        idx,
        {
          patternIndex: idx,
          patternDescription: category.replace(/_/g, ' ')
        }
      )]

      const childNode = createNode(
        childId,
        nextStage,
        stageConfig.category,
        parentPath,
        null, // Leaf node initially
        []
      )


      newNodes.push(childNode)
    })
  } else {
    throw new Error(`Split rule type ${config.splitRuleType} not yet implemented for stage type ${config.stageType}`)
  }

  // Update the parent node with the split rule and children
  const updatedNodes = tree.nodes.map(node => {
    if (node.id === nodeId) {
      return {
        ...node,
        split_rule: splitRule,
        children_ids: childrenIds
      }
    }
    return node
  }).concat(newNodes)

  // Update metrics list
  const updatedMetrics = getAllMetrics(updatedNodes)

  return {
    ...tree,
    nodes: updatedNodes,
    metrics: updatedMetrics
  }
}

/**
 * Remove a stage from a node (convert back to leaf)
 * @param tree The current threshold tree
 * @param nodeId ID of the node to remove stage from
 * @returns Updated threshold tree
 */
export function removeStageFromNode(tree: ThresholdTree, nodeId: string): ThresholdTree {
  const node = findNodeById(tree, nodeId)
  if (!node) {
    throw new Error(`Node ${nodeId} not found in tree`)
  }

  if (!node.split_rule) {
    // Already a leaf node, nothing to remove
    return tree
  }

  // Get all descendant node IDs to remove
  const descendantIds = new Set<string>()

  function collectDescendants(currentNodeId: string) {
    const currentNode = findNodeById(tree, currentNodeId)
    if (!currentNode) return

    for (const childId of currentNode.children_ids) {
      descendantIds.add(childId)
      collectDescendants(childId) // Recursively collect all descendants
    }
  }

  collectDescendants(nodeId)

  // Remove all descendant nodes and update the target node
  const updatedNodes = tree.nodes
    .filter(n => !descendantIds.has(n.id))
    .map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          split_rule: null,
          children_ids: []
        }
      }
      return n
    })

  // Update metrics list
  const updatedMetrics = getAllMetrics(updatedNodes)

  return {
    ...tree,
    nodes: updatedNodes,
    metrics: updatedMetrics
  }
}

/**
 * Get available stage types that can be added to a specific node
 * @param tree The threshold tree
 * @param nodeId ID of the node
 * @returns Array of available stage type configurations
 */
export function getAvailableStageTypes(tree: ThresholdTree, nodeId: string): StageTypeConfig[] {
  if (!canAddStageToNode(tree, nodeId)) {
    return []
  }

  const node = findNodeById(tree, nodeId)
  if (!node) {
    return []
  }

  // Get stage types already used in the parent path
  const usedStageTypes = new Set<string>()

  // Check each parent in the path to see what stage types were used
  for (const parent of node.parent_path) {
    const stageType = getStageTypeFromParentPath(parent)
    if (stageType) {
      usedStageTypes.add(stageType)
    }
  }

  // Also check the current node's split rule if it has one
  if (node.split_rule) {
    const stageType = getStageTypeFromSplitRule(node.split_rule)
    if (stageType) {
      usedStageTypes.add(stageType)
    }
  }

  // Return only stage types that haven't been used in the parent path
  return AVAILABLE_STAGE_TYPES.filter(stageType => !usedStageTypes.has(stageType.id))
}

/**
 * Map a split rule back to its corresponding stage type
 * @param splitRule The split rule to analyze
 * @returns The stage type ID that created this split rule, or null if unknown
 */
function getStageTypeFromSplitRule(splitRule: any): string | null {
  if (splitRule.type === 'range' && splitRule.metric) {
    const metric = splitRule.metric

    // Map metrics back to stage types
    if (metric === METRIC_FEATURE_SPLITTING) {
      return 'feature_splitting'
    } else if (metric === METRIC_SEMDIST_MEAN) {
      return 'semantic_distance'
    }
  } else if (splitRule.type === 'pattern') {
    // Pattern rules are typically used for score agreement
    return 'score_agreement'
  }

  return null
}

/**
 * Map a parent path info back to its corresponding stage type
 * @param parentPath The parent path info to analyze
 * @returns The stage type ID that created this parent path, or null if unknown
 */
function getStageTypeFromParentPath(parentPath: any): string | null {
  if (parentPath.parent_split_rule?.type === 'range' && parentPath.parent_split_rule?.range_info?.metric) {
    const metric = parentPath.parent_split_rule.range_info.metric

    // Map metrics back to stage types
    if (metric === METRIC_FEATURE_SPLITTING) {
      return 'feature_splitting'
    } else if (metric === METRIC_SEMDIST_MEAN) {
      return 'semantic_distance'
    }
  } else if (parentPath.parent_split_rule?.type === 'pattern') {
    // Pattern rules are typically used for score agreement
    return 'score_agreement'
  }

  return null
}

/**
 * Reset tree to root-only state
 * @returns New root-only threshold tree
 */
export function resetToRootOnly(): ThresholdTree {
  return createRootOnlyTree()
}

/**
 * Validate that a tree structure is valid for dynamic building
 * @param tree The threshold tree
 * @returns Array of validation errors
 */
export function validateDynamicTree(tree: ThresholdTree): string[] {
  const errors: string[] = []

  // Check that root node exists
  const rootNode = findNodeById(tree, NODE_ROOT_ID)
  if (!rootNode) {
    errors.push('Tree must have a root node')
    return errors
  }

  // Check that all parent-child relationships are valid
  traverseTree(tree, (node) => {
    for (const childId of node.children_ids) {
      const childNode = findNodeById(tree, childId)
      if (!childNode) {
        errors.push(`Node ${node.id} references non-existent child ${childId}`)
      } else {
        // Check that child's parent path includes this node
        const hasParentInPath = childNode.parent_path.some(p => p.parent_id === node.id)
        if (!hasParentInPath) {
          errors.push(`Child node ${childId} does not reference parent ${node.id} in parent_path`)
        }
      }
    }
  })

  return errors
}

/**
 * Get a human-readable description of the current tree structure
 * @param tree The threshold tree
 * @returns String description of the tree
 */
export function getTreeDescription(tree: ThresholdTree): string {
  const descriptions: string[] = []

  traverseTree(tree, (node, depth) => {
    const indent = '  '.repeat(depth)
    let desc = `${indent}${node.id}`

    if (node.split_rule) {
      if (node.split_rule.type === SPLIT_TYPE_RANGE) {
        const rule = node.split_rule as RangeSplitRule
        desc += ` -> Split on ${rule.metric} (thresholds: ${rule.thresholds.join(', ')})`
      } else if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
        desc += ` -> Pattern matching split`
      }
    } else if (depth > 0) {
      desc += ` (leaf)`
    }

    descriptions.push(desc)
  })

  return descriptions.join('\n')
}