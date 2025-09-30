import type {
    SankeyThreshold,
    ThresholdTree as ThresholdTree,
    RangeSplitRule,
    PatternSplitRule,
    ExpressionSplitRule,
    MetricType,
    StageTypeConfig,
    AddStageConfig
} from '../types'
import {
    buildRangeSplit,
    buildFlexibleScoreAgreementSplit,
    createNode,
    createParentPath
} from './split-rule-builders'
import {
    NODE_ROOT_ID,
    SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
    METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
    METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
    CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT
} from './constants'

// ============================================================================
// CORE THRESHOLD TREE UTILITIES
// ============================================================================

/**
 * Find a node by ID in the threshold tree
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

  const root = tree.nodes.find(n => n.id === NODE_ROOT_ID)
  if (root) {
    traverse(NODE_ROOT_ID, 0)
  }
}

/**
 * Update thresholds for a specific node
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

  if (node.split_rule?.type === SPLIT_TYPE_RANGE) {
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
    const rule = node.split_rule as PatternSplitRule

    updatedNodes = tree.nodes.map(n => {
      if (n.id === nodeId) {
        const updatedConditions = { ...rule.conditions }

        if (metric && updatedConditions[metric]) {
          updatedConditions[metric] = {
            ...updatedConditions[metric],
            threshold: thresholds[0]
          }
        } else {
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
 * Get all metrics used in a node
 */
export function getNodeMetrics(node: SankeyThreshold): MetricType[] {
  if (!node.split_rule) {
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

  return metrics.filter(m =>
    [METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
     METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING].includes(m)
  ) as MetricType[]
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

/**
 * Get all metrics used in the threshold structure
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

// ============================================================================
// DYNAMIC TREE BUILDER
// ============================================================================

export const AVAILABLE_STAGE_TYPES: StageTypeConfig[] = [
  {
    id: 'feature_splitting',
    name: 'Feature Splitting',
    description: 'Split features based on feature_splitting metric',
    category: CATEGORY_FEATURE_SPLITTING,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_FEATURE_SPLITTING,
    defaultThresholds: [0.1]
  },
  {
    id: 'semantic_distance',
    name: 'Semantic Distance',
    description: 'Split features based on semantic distance',
    category: CATEGORY_SEMANTIC_DISTANCE,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_SEMDIST_MEAN,
    defaultThresholds: [0.1]
  },
  {
    id: 'score_agreement',
    name: 'Score Agreement',
    description: 'Classify features based on scoring method agreement',
    category: CATEGORY_SCORE_AGREEMENT,
    defaultSplitRule: 'pattern'
  }
]

/**
 * Create a minimal threshold tree with only the root node
 */
export function createRootOnlyTree(): ThresholdTree {
  const rootNode = createNode(
    NODE_ROOT_ID,
    0,
    CATEGORY_ROOT,
    [],
    null,
    []
  )

  return {
    nodes: [rootNode],
    metrics: [],
  }
}

/**
 * Check if a node can have stages added to it
 */
export function canAddStageToNode(tree: ThresholdTree, nodeId: string): boolean {
  const node = findNodeById(tree, nodeId)
  if (!node) {
    return false
  }

  return node.split_rule === null && node.children_ids.length === 0
}

/**
 * Add a new stage to a specific node
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

  const nextStage = parentNode.stage + 1
  const newNodes: SankeyThreshold[] = []

  let splitRule: RangeSplitRule | PatternSplitRule | ExpressionSplitRule | null = null
  let childrenIds: string[] = []

  if (config.splitRuleType === 'range') {
    const metric = config.metric || stageConfig.defaultMetric
    const thresholds = config.thresholds || stageConfig.defaultThresholds || [0.5]

    if (!metric) {
      throw new Error(`Metric required for range split rule`)
    }

    splitRule = buildRangeSplit(metric, thresholds)

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
        null,
        []
      )

      newNodes.push(childNode)
    }
  } else if (config.splitRuleType === 'pattern' && config.stageType === 'score_agreement') {
    const selectedMetrics = config.selectedScoreMetrics || ['score_fuzz', 'score_simulation', 'score_detection']
    const selectedThresholds = config.thresholds?.slice(0, selectedMetrics.length) || selectedMetrics.map(() => 0.5)

    while (selectedThresholds.length < selectedMetrics.length) {
      selectedThresholds.push(0.5)
    }

    splitRule = buildFlexibleScoreAgreementSplit(selectedMetrics, selectedThresholds)

    const patternRule = splitRule as PatternSplitRule
    const scoreCategories = patternRule.patterns.map(p => p.child_id)

    scoreCategories.forEach((category, idx) => {
      const childId = `${nodeId}_${category}`
      childrenIds.push(childId)

      const pattern = patternRule.patterns[idx]
      const parentPath = [...parentNode.parent_path, createParentPath(
        nodeId,
        'pattern',
        idx,
        {
          patternIndex: idx,
          patternDescription: pattern.description || category.replace(/_/g, ' ')
        }
      )]

      const childNode = createNode(
        childId,
        nextStage,
        stageConfig.category,
        parentPath,
        null,
        []
      )

      newNodes.push(childNode)
    })
  } else {
    throw new Error(`Split rule type ${config.splitRuleType} not yet implemented for stage type ${config.stageType}`)
  }

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

  const updatedMetrics = getAllMetrics(updatedNodes)

  return {
    ...tree,
    nodes: updatedNodes,
    metrics: updatedMetrics
  }
}

/**
 * Remove a stage from a node
 */
export function removeStageFromNode(tree: ThresholdTree, nodeId: string): ThresholdTree {
  const node = findNodeById(tree, nodeId)
  if (!node) {
    throw new Error(`Node ${nodeId} not found in tree`)
  }

  if (!node.split_rule) {
    return tree
  }

  const descendantIds = new Set<string>()

  function collectDescendants(currentNodeId: string) {
    const currentNode = findNodeById(tree, currentNodeId)
    if (!currentNode) return

    for (const childId of currentNode.children_ids) {
      descendantIds.add(childId)
      collectDescendants(childId)
    }
  }

  collectDescendants(nodeId)

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

  const updatedMetrics = getAllMetrics(updatedNodes)

  return {
    ...tree,
    nodes: updatedNodes,
    metrics: updatedMetrics
  }
}

/**
 * Get available stage types that can be added to a node
 */
export function getAvailableStageTypes(tree: ThresholdTree, nodeId: string): StageTypeConfig[] {
  if (!canAddStageToNode(tree, nodeId)) {
    return []
  }

  const node = findNodeById(tree, nodeId)
  if (!node) {
    return []
  }

  const usedStageTypes = new Set<string>()

  for (const parent of node.parent_path) {
    const stageType = getStageTypeFromParentPath(parent)
    if (stageType) {
      usedStageTypes.add(stageType)
    }
  }

  if (node.split_rule) {
    const stageType = getStageTypeFromSplitRule(node.split_rule)
    if (stageType) {
      usedStageTypes.add(stageType)
    }
  }

  return AVAILABLE_STAGE_TYPES.filter(stageType => !usedStageTypes.has(stageType.id))
}

function getStageTypeFromSplitRule(splitRule: any): string | null {
  if (splitRule.type === 'range' && splitRule.metric) {
    const metric = splitRule.metric

    if (metric === METRIC_FEATURE_SPLITTING) {
      return 'feature_splitting'
    } else if (metric === METRIC_SEMDIST_MEAN) {
      return 'semantic_distance'
    }
  } else if (splitRule.type === 'pattern') {
    return 'score_agreement'
  }

  return null
}

function getStageTypeFromParentPath(parentPath: any): string | null {
  if (parentPath.parent_split_rule?.type === 'range' && parentPath.parent_split_rule?.range_info?.metric) {
    const metric = parentPath.parent_split_rule.range_info.metric

    if (metric === METRIC_FEATURE_SPLITTING) {
      return 'feature_splitting'
    } else if (metric === METRIC_SEMDIST_MEAN) {
      return 'semantic_distance'
    }
  } else if (parentPath.parent_split_rule?.type === 'pattern') {
    return 'score_agreement'
  }

  return null
}

/**
 * Validate tree structure
 */
export function validateDynamicTree(tree: ThresholdTree): string[] {
  const errors: string[] = []

  const rootNode = findNodeById(tree, NODE_ROOT_ID)
  if (!rootNode) {
    errors.push('Tree must have a root node')
    return errors
  }

  traverseTree(tree, (node) => {
    for (const childId of node.children_ids) {
      const childNode = findNodeById(tree, childId)
      if (!childNode) {
        errors.push(`Node ${node.id} references non-existent child ${childId}`)
      } else {
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
 * Get tree description
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