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
  SplitRule,
  CategoryGroup
} from '../types'
import {
  buildRangeSplit,
  buildFlexibleScoreAgreementSplit,
  buildCategoryGroupPatternSplit,
  createNode,
  createParentPath
} from './split-rule-builders'
import {
  SPLIT_TYPE_RANGE,
  SPLIT_TYPE_PATTERN,
  SPLIT_TYPE_EXPRESSION,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMDIST_MEAN,
  METRIC_SEMDIST_MAX,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_SIMULATION,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  CATEGORY_ROOT,
  CATEGORY_FEATURE_SPLITTING,
  CATEGORY_SEMANTIC_DISTANCE,
  CATEGORY_SCORE_AGREEMENT
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
function extractThresholdsFromExpressionRule(expressionRule: ExpressionSplitRule): Record<string, number> {
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
  METRIC_SEMDIST_MEAN,
  METRIC_SEMDIST_MAX,
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
] as const

// ============================================================================
// CORE TREE UTILITIES
// ============================================================================

/**
 * Update all score thresholds in the tree to match scoringMetricThresholds
 * This is used when thresholds are changed from Linear Set Diagram
 */
export function updateScoreThresholdsInTree(
  tree: ThresholdTree,
  scoringMetricThresholds: Record<string, number>
): ThresholdTree {
  let updatedTree = tree

  for (const node of tree.nodes) {
    if (!node.split_rule) continue

    if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
      const patternRule = node.split_rule as PatternSplitRule
      const conditions = patternRule.conditions
      const hasScoreMetrics = Object.keys(conditions).some(m => m.startsWith('score_'))

      if (hasScoreMetrics) {
        for (const metric of Object.keys(conditions)) {
          if (metric.startsWith('score_') && scoringMetricThresholds[metric] !== undefined) {
            updatedTree = updateNodeThreshold(updatedTree, node.id, [scoringMetricThresholds[metric]], metric)
          }
        }
      }
    }

    if (node.split_rule.type === SPLIT_TYPE_EXPRESSION) {
      const expressionRule = node.split_rule as ExpressionSplitRule
      const availableMetrics = expressionRule.available_metrics || []
      const hasScoreMetrics = availableMetrics.some(m => m.startsWith('score_'))

      if (hasScoreMetrics) {
        for (const metric of availableMetrics) {
          if (metric.startsWith('score_') && scoringMetricThresholds[metric] !== undefined) {
            updatedTree = updateNodeThreshold(updatedTree, node.id, [scoringMetricThresholds[metric]], metric)
          }
        }
      }
    }
  }

  return updatedTree
}

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
 * Traverse the entire tree with a callback function
 * Optimized with iterative approach for better performance
 */
function traverseTree(
  tree: ThresholdTree,
  callback: (node: SankeyThreshold, depth: number) => void
): void {
  const root = tree.nodes.find(n => n.id === NODE_ROOT_ID)
  if (!root) return

  const visited = new Set<string>()
  const stack: Array<{ nodeId: string; depth: number }> = [{ nodeId: NODE_ROOT_ID, depth: 0 }]

  while (stack.length > 0) {
    const { nodeId, depth } = stack.pop()!

    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = findNodeById(tree, nodeId)
    if (!node) continue

    callback(node, depth)

    // Add children in reverse order so they're processed in correct order
    for (let i = node.children_ids.length - 1; i >= 0; i--) {
      stack.push({ nodeId: node.children_ids[i], depth: depth + 1 })
    }
  }
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
 * Extract score metric thresholds from threshold tree
 * Searches for pattern rules with score metric conditions and extracts thresholds
 * @param tree The threshold tree to search
 * @returns Record of metric name to threshold value
 */
export function extractScoreThresholdsFromTree(tree: ThresholdTree): Record<string, number> {
  const thresholds: Record<string, number> = {}

  // Search all nodes for pattern or expression rules with score metrics
  for (const node of tree.nodes) {
    if (!node.split_rule) continue

    if (node.split_rule.type === SPLIT_TYPE_PATTERN) {
      const patternRule = node.split_rule as PatternSplitRule
      const conditions = patternRule.conditions

      // Extract thresholds from conditions
      for (const [metric, condition] of Object.entries(conditions)) {
        if (metric.startsWith('score_') && condition.threshold !== undefined) {
          thresholds[metric] = condition.threshold
        }
      }
    } else if (node.split_rule.type === SPLIT_TYPE_EXPRESSION) {
      const expressionRule = node.split_rule as ExpressionSplitRule
      // Extract thresholds from expression rule
      const extractedThresholds = extractThresholdsFromExpressionRule(expressionRule)
      Object.assign(thresholds, extractedThresholds)
    }
  }

  return thresholds
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
      const childId = `${nodeId}_${metric}_${i}`
      childrenIds.push(childId)

      const parentPath = [
        ...parentNode.parent_path,
        createParentPath(nodeId, 'range', i, { metric, thresholds })
      ]

      newNodes.push(
        createNode(childId, nextStage, stageConfig.category, parentPath, null, [])
      )
    }
  } else if (config.splitRuleType === 'pattern' && config.stageType === 'score_agreement') {
    const selectedMetrics = config.selectedScoreMetrics || [
      'score_fuzz',
      'score_simulation',
      'score_detection'
    ]
    const thresholds = config.thresholds || []
    const selectedThresholds = selectedMetrics.map((metric, i) =>
      thresholds[i] !== undefined ? thresholds[i] : (metric === 'score_simulation' ? 0.1 : 0.5)
    )

    // Check if we should use CategoryGroups (passed through config)
    const categoryGroups = config.customConfig?.categoryGroups || []
    console.log('[addStageToNode] score_agreement - categoryGroups from config:', categoryGroups.length)

    if (categoryGroups.length > 0) {
      console.log('[addStageToNode] CategoryGroups found:', categoryGroups.map((g: CategoryGroup) => ({ id: g.id, name: g.name, columnCount: g.columnIds.length })))
    }

    // Use CategoryGroup-based split if groups exist, otherwise standard flexible split
    if (categoryGroups.length > 0) {
      console.log('[addStageToNode] Using CategoryGroup-based split with', categoryGroups.length, 'groups')
      const expressionRule = buildCategoryGroupPatternSplit(categoryGroups, selectedMetrics, selectedThresholds)
      console.log('[addStageToNode] CategoryGroup expression rule branches:', expressionRule.branches.map(b => ({ child_id: b.child_id, description: b.description })))

      // Update split rule to use prefixed child_ids for uniqueness
      const prefixedBranches = expressionRule.branches.map(branch => ({
        ...branch,
        child_id: `${nodeId}_${branch.child_id}`
      }))
      const prefixedDefaultChildId = expressionRule.default_child_id === 'others'
        ? `${nodeId}_others`
        : `${nodeId}_${expressionRule.default_child_id}`

      splitRule = {
        ...expressionRule,
        branches: prefixedBranches,
        default_child_id: prefixedDefaultChildId
      }

      // Create child nodes for expression split (from branches)
      // Use prefixed IDs to ensure uniqueness across the tree
      prefixedBranches.forEach((branch, idx) => {
        const childId = branch.child_id  // Already prefixed above
        childrenIds.push(childId)

        const parentPath = [
          ...parentNode.parent_path,
          createParentPath(nodeId, 'expression', idx, {
            condition: branch.condition,
            description: branch.description
          })
        ]

        const childNode = createNode(
          childId,
          nextStage,
          CATEGORY_SCORE_AGREEMENT,
          parentPath,
          null,
          []
        )
        newNodes.push(childNode)
      })

      // Add "others" default child only if not all combinations are covered
      if (expressionRule.default_child_id === 'others') {
        const othersChildId = prefixedDefaultChildId  // Already prefixed above
        childrenIds.push(othersChildId)
        const othersParentPath = [
          ...parentNode.parent_path,
          createParentPath(nodeId, 'expression', -1, {
            condition: 'default',
            description: 'Others (no match)'
          })
        ]
        const othersNode = createNode(
          othersChildId,
          nextStage,
          CATEGORY_SCORE_AGREEMENT,
          othersParentPath,
          null,
          []
        )
        newNodes.push(othersNode)
      }
    } else {
      console.log('[addStageToNode] Using legacy flexible split (no CategoryGroups available)')
      splitRule = buildFlexibleScoreAgreementSplit(selectedMetrics, selectedThresholds)
      console.log('[addStageToNode] Legacy split rule patterns:', (splitRule as any).patterns.length, 'patterns')
      const patternRule = splitRule as PatternSplitRule

      // Create child nodes for pattern split
      patternRule.patterns.forEach((pattern, idx) => {
        const childId = `${nodeId}_${pattern.child_id}`
        childrenIds.push(childId)

        const parentPath = [
          ...parentNode.parent_path,
          createParentPath(nodeId, 'pattern', idx, {
            patternIndex: idx,
            patternDescription: pattern.description || pattern.child_id.replace(/_/g, ' ')
          })
        ]

        newNodes.push(
          createNode(childId, nextStage, stageConfig.category, parentPath, null, [])
        )
      })
    }
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
      case METRIC_SEMDIST_MEAN:
        return 'semantic_distance'
      default:
        return null
    }
  }

  if (splitRule.type === SPLIT_TYPE_PATTERN || splitRule.type === SPLIT_TYPE_EXPRESSION) {
    return 'score_agreement'
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
      case METRIC_SEMDIST_MEAN:
        return 'semantic_distance'
      default:
        return null
    }
  }

  if (splitRule.type === 'pattern' || splitRule.type === 'expression') {
    return 'score_agreement'
  }

  return null
}

// ============================================================================
// VALIDATION AND DEBUG UTILITIES (Keep for development, tree-shakeable)
// ============================================================================

/**
 * Validate tree structure
 * Keep for development/debugging but will be tree-shaken in production if unused
 */
export function validateDynamicTree(tree: ThresholdTree): string[] {
  const errors: string[] = []

  if (!findNodeById(tree, NODE_ROOT_ID)) {
    errors.push('Tree must have a root node')
    return errors
  }

  traverseTree(tree, (node) => {
    for (const childId of node.children_ids) {
      const childNode = findNodeById(tree, childId)
      if (!childNode) {
        errors.push(`Node ${node.id} references non-existent child ${childId}`)
      } else {
        const hasParent = childNode.parent_path.some(p => p.parent_id === node.id)
        if (!hasParent) {
          errors.push(`Child node ${childId} does not reference parent ${node.id} in parent_path`)
        }
      }
    }
  })

  return errors
}

/**
 * Get tree description for debugging
 * Keep for development but will be tree-shaken in production if unused
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
        desc += ' -> Pattern matching split'
      }
    } else if (depth > 0) {
      desc += ' (leaf)'
    }

    descriptions.push(desc)
  })

  return descriptions.join('\n')
}