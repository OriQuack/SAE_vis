import type {
  SankeyThreshold,
  ThresholdTree,
  RangeSplitRule,
  PatternSplitRule,
  ExpressionSplitRule,
  MetricType,
  StageTypeConfig,
  AddStageConfig,
  ParentPathInfo,
  SplitRule
} from '../types'
import {
  buildRangeSplit,
  buildPercentileSplit,
  createNode,
  createParentPath
} from './split-rule-builders'
import {
  SPLIT_TYPE_RANGE,
  SPLIT_TYPE_PATTERN,
  SPLIT_TYPE_EXPRESSION,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMSIM_MEAN,
  METRIC_SEMSIM_MAX,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_SIMULATION,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  CATEGORY_ROOT,
  CATEGORY_FEATURE_SPLITTING,
  CATEGORY_SEMANTIC_SIMILARITY,
  CATEGORY_CONSISTENCY
} from './constants'

// ============================================================================
// CONSTANTS
// ============================================================================
const NODE_ROOT_ID = "root"

// ============================================================================
// EXPRESSION SPLIT RULE HELPERS
// ============================================================================

/**
 * Parse threshold value for a specific metric from an ExpressionSplitRule condition string
 * @param condition Condition string like "(score_fuzz >= 0.5 && score_detection >= 0.5)"
 * @param metric Metric name to extract threshold for
 * @returns Threshold value if found, null otherwise
 */
function parseThresholdFromCondition(condition: string, metric: string): number | null {
  // Match patterns like "score_fuzz >= 0.5" or "score_fuzz < 0.5"
  const regex = new RegExp(`${metric}\\s*(?:>=|<)\\s*([0-9.]+)`, 'g')
  const match = regex.exec(condition)

  if (match && match[1]) {
    return parseFloat(match[1])
  }

  return null
}

/**
 * Update threshold value for a specific metric in a condition string
 * @param condition Condition string to update
 * @param metric Metric name to update threshold for
 * @param newThreshold New threshold value
 * @returns Updated condition string
 */
function updateThresholdInCondition(condition: string, metric: string, newThreshold: number): string {
  const regex = new RegExp(`(${metric}\\s*(?:>=|<))\\s*[0-9.]+`, 'g')
  return condition.replace(regex, `$1 ${newThreshold}`)
}

/**
 * Extract all score metric thresholds from ExpressionSplitRule condition strings
 * @param expressionRule ExpressionSplitRule to extract from
 * @returns Record of metric name to threshold value
 */
export function extractThresholdsFromExpressionRule(expressionRule: ExpressionSplitRule): Record<string, number> {
  const thresholds: Record<string, number> = {}

  // Parse first branch condition to extract thresholds
  // (all branches should have same thresholds for each metric, just different operators)
  if (expressionRule.branches.length > 0) {
    const firstCondition = expressionRule.branches[0].condition
    const metrics = expressionRule.available_metrics || []

    for (const metric of metrics) {
      if (metric.startsWith('score_')) {
        const threshold = parseThresholdFromCondition(firstCondition, metric)
        if (threshold !== null) {
          thresholds[metric] = threshold
        }
      }
    }
  }

  return thresholds
}

// Valid metric types for filtering
const VALID_METRICS = [
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMSIM_MEAN,
  METRIC_SEMSIM_MAX,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_SIMULATION,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING
] as const

// Available stage configurations for dynamic tree building
export const AVAILABLE_STAGE_TYPES: StageTypeConfig[] = [
  {
    id: 'feature_splitting',
    name: 'Feature Splitting',
    description: 'Split features based on feature_splitting metric',
    category: CATEGORY_FEATURE_SPLITTING,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_FEATURE_SPLITTING,
    defaultThresholds: [0.3]
  },
  {
    id: 'semantic_similarity',
    name: 'Semantic Similarity',
    description: 'Split features based on semantic similarity',
    category: CATEGORY_SEMANTIC_SIMILARITY,
    defaultSplitRule: 'range',
    defaultMetric: METRIC_SEMSIM_MEAN,
    defaultThresholds: [0.88]  // Updated from 0.1 (distance) to 0.88 (similarity median)
  },
  {
    id: 'llm_scorer_consistency',
    name: 'LLM Scorer Consistency',
    description: 'Split features into 10 percentiles by scorer consistency',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: 'llm_scorer_consistency'
  },
  {
    id: 'within_explanation_score',
    name: 'Within-Explanation Consistency',
    description: 'Split features into 10 percentiles by within-explanation consistency',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: 'within_explanation_score'
  },
  {
    id: 'cross_explanation_score',
    name: 'Cross-Explanation Consistency',
    description: 'Split features into 10 percentiles by cross-explanation consistency',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: 'cross_explanation_score'
  },
  {
    id: 'cross_explanation_overall_score',
    name: 'Cross-Explanation Overall',
    description: 'Split features into 10 percentiles by cross-explanation overall consistency',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: 'cross_explanation_overall_score'
  },
  {
    id: 'llm_explainer_consistency',
    name: 'LLM Explainer Consistency',
    description: 'Split features into 10 percentiles by explainer consistency',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: 'llm_explainer_consistency'
  }
] as const

// ============================================================================
// CORE TREE UTILITIES
// ============================================================================

/**
 * Find a node by ID in the threshold tree
 * Optimized with early return
 */
export function findNodeById(
  tree: ThresholdTree,
  nodeId: string
): SankeyThreshold | null {
  return tree.nodes.find(node => node.id === nodeId) || null
}


/**
 * Update thresholds for a specific node
 * Optimized with single pass and early returns
 */
export function updateNodeThreshold(
  tree: ThresholdTree,
  nodeId: string,
  thresholds: number[],
  metric?: string
): ThresholdTree {
  const node = findNodeById(tree, nodeId)
  if (!node || !node.split_rule) return tree

  const updatedNodes = tree.nodes.map(n => {
    if (n.id !== nodeId) return n

    const { split_rule } = n
    if (!split_rule) return n  // TypeScript guard

    if (split_rule.type === SPLIT_TYPE_RANGE) {
      return {
        ...n,
        split_rule: {
          ...split_rule as RangeSplitRule,
          thresholds
        }
      }
    }

    if (split_rule.type === SPLIT_TYPE_PATTERN) {
      const rule = split_rule as PatternSplitRule
      const updatedConditions = { ...rule.conditions }

      if (metric && updatedConditions[metric]) {
        updatedConditions[metric] = {
          ...updatedConditions[metric],
          threshold: thresholds[0]
        }
      } else {
        const metrics = Object.keys(rule.conditions)
        const len = Math.min(metrics.length, thresholds.length)
        for (let i = 0; i < len; i++) {
          updatedConditions[metrics[i]] = {
            ...updatedConditions[metrics[i]],
            threshold: thresholds[i]
          }
        }
      }

      return {
        ...n,
        split_rule: {
          ...rule,
          conditions: updatedConditions
        }
      }
    }

    if (split_rule.type === SPLIT_TYPE_EXPRESSION) {
      const rule = split_rule as ExpressionSplitRule

      if (!metric) {
        return n
      }

      const updatedBranches = rule.branches.map(branch => ({
        ...branch,
        condition: updateThresholdInCondition(branch.condition, metric, thresholds[0])
      }))

      return {
        ...n,
        split_rule: {
          ...rule,
          branches: updatedBranches
        }
      }
    }

    return n
  })

  return { ...tree, nodes: updatedNodes }
}

/**
 * Get all metrics used in a node
 * Optimized with direct return and type safety
 */
export function getNodeMetrics(node: SankeyThreshold): MetricType[] {
  if (!node.split_rule) return []

  const { type } = node.split_rule
  let metrics: string[] = []

  if (type === SPLIT_TYPE_RANGE) {
    metrics = [(node.split_rule as RangeSplitRule).metric]
  } else if (type === SPLIT_TYPE_PATTERN) {
    metrics = Object.keys((node.split_rule as PatternSplitRule).conditions)
  } else if (type === SPLIT_TYPE_EXPRESSION) {
    const rule = node.split_rule as ExpressionSplitRule
    metrics = rule.available_metrics || []
  }

  // Filter to only valid metric types
  return metrics.filter(m => VALID_METRICS.includes(m as any)) as MetricType[]
}

/**
 * Get effective threshold values for a node and metric
 * Optimized with early returns and reduced conditionals
 */
export function getEffectiveThreshold(
  tree: ThresholdTree,
  nodeId: string,
  metric: string
): number | number[] | null {
  const node = findNodeById(tree, nodeId)
  if (!node?.split_rule) return null

  const { split_rule } = node

  if (split_rule.type === SPLIT_TYPE_RANGE) {
    const rangeRule = split_rule as RangeSplitRule
    if (rangeRule.metric === metric) {
      const { thresholds } = rangeRule
      return thresholds.length === 1 ? thresholds[0] : thresholds
    }
  } else if (split_rule.type === SPLIT_TYPE_PATTERN) {
    const patternRule = split_rule as PatternSplitRule
    const condition = patternRule.conditions[metric]
    if (condition?.threshold !== undefined) {
      return condition.threshold
    }
  } else if (split_rule.type === SPLIT_TYPE_EXPRESSION) {
    const expressionRule = split_rule as ExpressionSplitRule
    // Parse threshold from first branch condition
    if (expressionRule.branches.length > 0) {
      const threshold = parseThresholdFromCondition(expressionRule.branches[0].condition, metric)
      if (threshold !== null) {
        return threshold
      }
    }
  }

  return null
}

/**
 * Get all metrics used in the threshold structure
 * Optimized with single pass and Set for deduplication
 */
function getAllMetrics(nodes: SankeyThreshold[]): string[] {
  const metrics = new Set<string>()

  for (const node of nodes) {
    if (!node.split_rule) continue

    const { type } = node.split_rule

    if (type === SPLIT_TYPE_RANGE) {
      metrics.add((node.split_rule as RangeSplitRule).metric)
    } else if (type === SPLIT_TYPE_PATTERN) {
      const conditions = (node.split_rule as PatternSplitRule).conditions
      for (const metric of Object.keys(conditions)) {
        metrics.add(metric)
      }
    } else if (type === SPLIT_TYPE_EXPRESSION) {
      const rule = node.split_rule as ExpressionSplitRule
      if (rule.available_metrics) {
        for (const metric of rule.available_metrics) {
          metrics.add(metric)
        }
      }
    }
  }

  return Array.from(metrics)
}

// ============================================================================
// DYNAMIC TREE BUILDER
// ============================================================================

/**
 * Create a minimal threshold tree with only the root node
 */
export function createRootOnlyTree(): ThresholdTree {
  return {
    nodes: [
      createNode(NODE_ROOT_ID, 0, CATEGORY_ROOT, [], null, [])
    ],
    metrics: []
  }
}

/**
 * Check if a node can have stages added to it
 * Optimized with inline conditionals
 */
export function canAddStageToNode(tree: ThresholdTree, nodeId: string): boolean {
  const node = findNodeById(tree, nodeId)
  return node !== null && node.split_rule === null && node.children_ids.length === 0
}

/**
 * Add a new stage to a specific node
 * Optimized with reduced object spreads and better error handling
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
  let splitRule: SplitRule | null = null
  const childrenIds: string[] = []

  if (config.splitRuleType === 'range') {
    const metric = config.metric || stageConfig.defaultMetric
    if (!metric) {
      throw new Error('Metric required for range split rule')
    }

    const thresholds = config.thresholds || stageConfig.defaultThresholds || [0.5]
    splitRule = buildRangeSplit(metric, thresholds)

    // Create child nodes for range split
    for (let i = 0; i <= thresholds.length; i++) {
      // Skip "root" prefix for simplicity
      const childId = nodeId === NODE_ROOT_ID ? `${metric}_${i}` : `${nodeId}_${metric}_${i}`
      childrenIds.push(childId)

      const parentPath = [
        ...parentNode.parent_path,
        createParentPath(nodeId, 'range', i, { metric, thresholds })
      ]

      newNodes.push(
        createNode(childId, nextStage, stageConfig.category, parentPath, null, [])
      )
    }
  } else if (config.splitRuleType === 'expression' && stageConfig.defaultMetric) {
    // Handle consistency metrics with percentile split (10 equal bins)
    const metric = config.metric || stageConfig.defaultMetric
    const numBins = config.customConfig?.numBins || 4  // Default 10, configurable in future

    splitRule = buildPercentileSplit(metric, numBins)
    const expressionRule = splitRule as ExpressionSplitRule

    // Create child nodes for each percentile branch
    expressionRule.branches.forEach((branch, idx) => {
      // Skip "root" prefix for simplicity
      const childId = nodeId === NODE_ROOT_ID ? branch.child_id : `${nodeId}_${branch.child_id}`
      childrenIds.push(childId)

      const parentPath = [
        ...parentNode.parent_path,
        createParentPath(nodeId, 'expression', idx, {
          condition: branch.condition,
          description: branch.description
        })
      ]

      newNodes.push(
        createNode(childId, nextStage, stageConfig.category, parentPath, null, [])
      )
    })
  } else {
    throw new Error(
      `Split rule type ${config.splitRuleType} not yet implemented for stage type ${config.stageType}`
    )
  }

  // Update parent node and add new nodes
  const updatedNodes = tree.nodes.map(node =>
    node.id === nodeId
      ? { ...node, split_rule: splitRule, children_ids: childrenIds }
      : node
  ).concat(newNodes)

  return {
    nodes: updatedNodes,
    metrics: getAllMetrics(updatedNodes)
  }
}

/**
 * Remove a stage from a node
 * Optimized with iterative descendant collection
 */
export function removeStageFromNode(tree: ThresholdTree, nodeId: string): ThresholdTree {
  const node = findNodeById(tree, nodeId)
  if (!node || !node.split_rule) return tree

  // Collect all descendant IDs iteratively
  const descendantIds = new Set<string>()
  const toProcess = [...node.children_ids]

  while (toProcess.length > 0) {
    const childId = toProcess.pop()!
    if (descendantIds.has(childId)) continue

    descendantIds.add(childId)
    const child = findNodeById(tree, childId)
    if (child) {
      toProcess.push(...child.children_ids)
    }
  }

  // Filter out descendants and update the target node
  const updatedNodes = tree.nodes
    .filter(n => !descendantIds.has(n.id))
    .map(n => n.id === nodeId
      ? { ...n, split_rule: null, children_ids: [] }
      : n
    )

  return {
    nodes: updatedNodes,
    metrics: getAllMetrics(updatedNodes)
  }
}

/**
 * Get available stage types that can be added to a node
 * Optimized with helper functions and early returns
 */
export function getAvailableStageTypes(tree: ThresholdTree, nodeId: string): StageTypeConfig[] {
  if (!canAddStageToNode(tree, nodeId)) return []

  const node = findNodeById(tree, nodeId)
  if (!node) return []

  const usedStageTypes = new Set<string>()

  // Collect used stage types from parent path
  for (const parent of node.parent_path) {
    const stageType = getStageTypeFromParentInfo(parent)
    if (stageType) usedStageTypes.add(stageType)
  }

  // Check current node's split rule
  if (node.split_rule) {
    const stageType = getStageTypeFromSplitRule(node.split_rule)
    if (stageType) usedStageTypes.add(stageType)
  }

  return AVAILABLE_STAGE_TYPES.filter(stageType => !usedStageTypes.has(stageType.id))
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract stage type from split rule
 * Optimized with switch statement
 */
function getStageTypeFromSplitRule(splitRule: SplitRule): string | null {
  if (splitRule.type === SPLIT_TYPE_RANGE) {
    const metric = (splitRule as RangeSplitRule).metric
    switch (metric) {
      case METRIC_FEATURE_SPLITTING:
        return 'feature_splitting'
      case METRIC_SEMSIM_MEAN:
        return 'semantic_similarity'
      default:
        return null
    }
  }

  if (splitRule.type === SPLIT_TYPE_EXPRESSION) {
    const expressionRule = splitRule as ExpressionSplitRule
    const metrics = expressionRule.available_metrics || []

    // Check if this is a consistency metric
    if (metrics.length === 1) {
      const metric = metrics[0]
      if (metric === 'llm_scorer_consistency') return 'llm_scorer_consistency'
      if (metric === 'within_explanation_score') return 'within_explanation_score'
      if (metric === 'cross_explanation_score') return 'cross_explanation_score'
      if (metric === 'cross_explanation_overall_score') return 'cross_explanation_overall_score'
      if (metric === 'llm_explainer_consistency') return 'llm_explainer_consistency'
    }
  }

  return null
}

/**
 * Extract stage type from parent path info
 * Optimized with direct property access
 */
function getStageTypeFromParentInfo(parentPath: ParentPathInfo): string | null {
  const splitRule = parentPath.parent_split_rule
  if (!splitRule) return null

  if (splitRule.type === 'range' && splitRule.range_info?.metric) {
    const metric = splitRule.range_info.metric
    switch (metric) {
      case METRIC_FEATURE_SPLITTING:
        return 'feature_splitting'
      case METRIC_SEMSIM_MEAN:
        return 'semantic_similarity'
      default:
        return null
    }
  }

  if (splitRule.type === 'expression' && splitRule.expression_info) {
    const condition = splitRule.expression_info.condition

    // Check if this is a consistency metric by examining the condition
    if (condition.includes('llm_scorer_consistency')) return 'llm_scorer_consistency'
    if (condition.includes('within_explanation_score')) return 'within_explanation_score'
    if (condition.includes('cross_explanation_score') && !condition.includes('overall')) return 'cross_explanation_score'
    if (condition.includes('cross_explanation_overall_score')) return 'cross_explanation_overall_score'
    if (condition.includes('llm_explainer_consistency')) return 'llm_explainer_consistency'
  }

  return null
}