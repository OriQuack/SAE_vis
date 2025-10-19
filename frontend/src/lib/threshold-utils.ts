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
  buildAbsoluteValueSplit,
  buildCustomValueSplit,
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
  CATEGORY_CONSISTENCY,
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER,
  CONSISTENCY_THRESHOLDS
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
    id: CONSISTENCY_TYPE_LLM_SCORER,
    name: 'LLM Scorer Consistency',
    description: 'Consistency of scores across different LLM scorers for the same explainer and metric',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: CONSISTENCY_TYPE_LLM_SCORER,
    defaultThresholds: [...CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_SCORER]]
  },
  {
    id: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    name: 'Within-Explanation Metric Consistency',
    description: 'Consistency across different scoring metrics within the same explainer',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    defaultThresholds: [...CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC]]
  },
  {
    id: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    name: 'Cross-Explanation Metric Consistency',
    description: 'Consistency of individual metrics across different explainers',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    defaultThresholds: [...CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC]]
  },
  {
    id: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    name: 'Cross-Explanation Overall Score Consistency',
    description: 'Consistency of overall scores across different explainers',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    defaultThresholds: [...CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE]]
  },
  {
    id: CONSISTENCY_TYPE_LLM_EXPLAINER,
    name: 'LLM Explainer Consistency',
    description: 'Semantic similarity between explanations from different LLM explainers',
    category: CATEGORY_CONSISTENCY,
    defaultSplitRule: 'expression',
    defaultMetric: CONSISTENCY_TYPE_LLM_EXPLAINER,
    defaultThresholds: [...CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_EXPLAINER]]
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
    // Handle consistency metrics with configurable split method
    const metric = config.metric || stageConfig.defaultMetric

    // Priority for determining thresholds:
    // 1. Explicit customThresholds in config (user override)
    // 2. Pre-configured CONSISTENCY_THRESHOLDS (default for consistency metrics)
    // 3. Fallback to numBins with splitMethod (backward compatibility)
    const customThresholds = config.customConfig?.customThresholds
    const defaultThresholds = CONSISTENCY_THRESHOLDS[metric as keyof typeof CONSISTENCY_THRESHOLDS]
    const splitMethod = config.customConfig?.splitMethod || 'absolute'  // Default to 'absolute'
    const numBins = config.customConfig?.numBins || 4  // Default 4 bins (quartiles)

    // Choose split method based on configuration priority
    if (customThresholds && customThresholds.length > 0) {
      // 1. Use explicit custom threshold values (highest priority)
      splitRule = buildCustomValueSplit(metric, customThresholds)
    } else if (defaultThresholds) {
      // 2. Use pre-configured default thresholds from CONSISTENCY_THRESHOLDS (new default)
      splitRule = buildCustomValueSplit(metric, [...defaultThresholds])
    } else if (splitMethod === 'percentile') {
      // 3. Fallback: Use percentile-based equal bins
      splitRule = buildPercentileSplit(metric, numBins)
    } else {
      // 4. Fallback: Use absolute value equal-width bins
      splitRule = buildAbsoluteValueSplit(metric, numBins)
    }
    const expressionRule = splitRule as ExpressionSplitRule

    // Create child nodes for each branch (percentile or absolute value)
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

/**
 * Add a consistency stage with pre-configured custom thresholds
 * This is a convenience wrapper around addStageToNode that automatically applies
 * the custom threshold values defined in CONSISTENCY_THRESHOLDS
 *
 * @param tree Current threshold tree
 * @param nodeId ID of the node to add the stage to
 * @param consistencyType Type of consistency metric (e.g., CONSISTENCY_TYPE_LLM_SCORER)
 * @returns Updated threshold tree with the consistency stage added
 *
 * @example
 * ```typescript
 * // Add LLM Scorer Consistency stage with custom thresholds [0.15, 0.45, 0.75]
 * const tree = addConsistencyStageWithCustomThresholds(
 *   currentTree,
 *   'root',
 *   CONSISTENCY_TYPE_LLM_SCORER
 * )
 * ```
 */
export function addConsistencyStageWithCustomThresholds(
  tree: ThresholdTree,
  nodeId: string,
  consistencyType: string
): ThresholdTree {
  // Get custom thresholds for this consistency type
  const customThresholds = CONSISTENCY_THRESHOLDS[consistencyType as keyof typeof CONSISTENCY_THRESHOLDS]

  if (!customThresholds) {
    throw new Error(`No custom thresholds defined for consistency type: ${consistencyType}`)
  }

  // Add stage with custom thresholds
  return addStageToNode(tree, nodeId, {
    stageType: consistencyType,
    splitRuleType: 'expression',
    customConfig: {
      customThresholds: [...customThresholds] // Create a copy to avoid mutations
    }
  })
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
      if (metric === CONSISTENCY_TYPE_LLM_SCORER) return CONSISTENCY_TYPE_LLM_SCORER
      if (metric === CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC) return CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC
      if (metric === CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC) return CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC
      if (metric === CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE) return CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE
      if (metric === CONSISTENCY_TYPE_LLM_EXPLAINER) return CONSISTENCY_TYPE_LLM_EXPLAINER
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
    if (condition.includes(CONSISTENCY_TYPE_LLM_SCORER)) return CONSISTENCY_TYPE_LLM_SCORER
    if (condition.includes(CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC)) return CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC
    if (condition.includes(CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC) && !condition.includes('overall')) return CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC
    if (condition.includes(CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE)) return CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE
    if (condition.includes(CONSISTENCY_TYPE_LLM_EXPLAINER)) return CONSISTENCY_TYPE_LLM_EXPLAINER
  }

  return null
}