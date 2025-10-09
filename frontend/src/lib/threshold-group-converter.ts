/**
 * Threshold Group to Sankey Tree Converter
 *
 * Converts histogram threshold groups into a Sankey threshold tree structure
 * using ExpressionSplitRule for flexible, multi-group filtering.
 *
 * Architecture:
 * - Dynamic stage creation based on available metrics
 * - Each stage uses OR logic across groups
 * - Within a group's scores, uses AND logic
 * - Features not matching any group go to "others" branch
 */

import type { ThresholdTree, SankeyThreshold, ExpressionSplitRule, ParentPathInfo } from '../types'
import { createRootOnlyTree } from './threshold-utils'
import {
  CATEGORY_ROOT,
  CATEGORY_FEATURE_SPLITTING,
  CATEGORY_SEMANTIC_SIMILARITY,
  CATEGORY_SCORE_AGREEMENT
} from './constants'

// ============================================================================
// TYPES
// ============================================================================

interface ThresholdSelection {
  id: string
  metricType: string
  thresholdRange: { min: number; max: number }
  featureIds: number[]
  color: string
  timestamp: number
}

interface ThresholdGroup {
  id: string
  name: string
  selections: ThresholdSelection[]
  visible: boolean
  timestamp: number
}

interface StageDefinition {
  metric: string | string[]  // Single metric or array of metrics
  category: string
  matchedIdSuffix: string
  othersIdSuffix: string
  description: string
}

interface StageExpressionResult {
  condition: string
  hasMetric: boolean
  availableMetrics: string[]
  description: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    metric: 'feature_splitting',
    category: CATEGORY_FEATURE_SPLITTING,
    matchedIdSuffix: 'feature_splitting',
    othersIdSuffix: 'feature_splitting',
    description: 'Feature Splitting: Matched'
  },
  {
    metric: 'semsim_mean',
    category: CATEGORY_SEMANTIC_SIMILARITY,
    matchedIdSuffix: 'semsim_mean',
    othersIdSuffix: 'semsim_mean',
    description: 'Semantic Similarity: Matched'
  },
  {
    metric: ['score_embedding', 'score_fuzz', 'score_detection'],
    category: CATEGORY_SCORE_AGREEMENT,
    matchedIdSuffix: 'scores',
    othersIdSuffix: 'scores',
    description: 'Score Agreement: Matched'
  }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a single metric range condition
 * Example: "(feature_splitting >= 0.5 && feature_splitting <= 0.7)"
 */
function buildMetricRangeCondition(metric: string, min: number, max: number): string {
  return `(${metric} >= ${min} && ${metric} <= ${max})`
}

/**
 * Build score conditions for a single group (AND logic)
 * Example: "(score_fuzz >= 0.6 && score_fuzz <= 0.8) && (score_detection >= 0.5 && score_detection <= 0.7)"
 */
function buildGroupScoreCondition(selections: ThresholdSelection[], scoreMetrics: string[]): string | null {
  const scoreSelections = selections.filter(s => scoreMetrics.includes(s.metricType))

  if (scoreSelections.length === 0) {
    return null
  }

  const conditions = scoreSelections.map(sel =>
    buildMetricRangeCondition(sel.metricType, sel.thresholdRange.min, sel.thresholdRange.max)
  )

  return conditions.join(' && ')
}

/**
 * Build expression for a stage (OR logic across all groups)
 */
function buildStageExpression(groups: ThresholdGroup[], stageDef: StageDefinition): StageExpressionResult {
  const conditions: string[] = []
  const allMetrics = new Set<string>()

  if (typeof stageDef.metric === 'string') {
    // Single metric stage (feature_splitting or semdist_mean)
    for (const group of groups) {
      const selection = group.selections.find(s => s.metricType === stageDef.metric)
      if (selection) {
        conditions.push(buildMetricRangeCondition(
          stageDef.metric,
          selection.thresholdRange.min,
          selection.thresholdRange.max
        ))
        allMetrics.add(stageDef.metric)
      }
    }
  } else {
    // Multi-metric stage (score agreement)
    for (const group of groups) {
      const groupCondition = buildGroupScoreCondition(group.selections, stageDef.metric)
      if (groupCondition) {
        conditions.push(`(${groupCondition})`)
        // Track which score metrics are used
        for (const selection of group.selections) {
          if (stageDef.metric.includes(selection.metricType)) {
            allMetrics.add(selection.metricType)
          }
        }
      }
    }
  }

  // Use fully qualified description from stage definition for backend differentiation
  return {
    condition: conditions.length > 0 ? conditions.join(' || ') : '',
    hasMetric: conditions.length > 0,
    availableMetrics: Array.from(allMetrics),
    description: stageDef.description
  }
}

/**
 * Create a node with proper parent path
 */
function createNode(
  id: string,
  stage: number,
  category: string,
  parentPath: ParentPathInfo[],
  splitRule: ExpressionSplitRule | null,
  childrenIds: string[]
): SankeyThreshold {
  return {
    id,
    stage,
    category: category as any,
    parent_path: parentPath,
    split_rule: splitRule,
    children_ids: childrenIds
  }
}

/**
 * Create parent path info for expression rule
 */
function createParentPathInfo(
  parentId: string,
  branchIndex: number,
  condition: string,
  description: string
): ParentPathInfo {
  return {
    parent_id: parentId,
    parent_split_rule: {
      type: 'expression',
      expression_info: {
        branch_index: branchIndex,
        condition,
        description
      }
    },
    branch_index: branchIndex
  }
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

/**
 * Convert threshold groups to a Sankey threshold tree
 *
 * Creates a dynamic tree based on which metrics have thresholds:
 * - Only builds stages for metrics that are selected
 * - Assigns sequential stage numbers (1, 2, 3...) dynamically
 * - Uses OR logic across groups, AND logic within groups
 *
 * @param groups Array of threshold groups
 * @returns ThresholdTree with expression-based splits
 */
export function convertThresholdGroupsToTree(groups: ThresholdGroup[]): ThresholdTree {
  // Filter to visible groups only
  const visibleGroups = groups.filter(g => g.visible)

  // If no visible groups, return root-only tree
  if (visibleGroups.length === 0) {
    console.log('[ThresholdGroupConverter] No visible groups, returning root-only tree')
    return createRootOnlyTree()
  }

  console.log(`[ThresholdGroupConverter] Converting ${visibleGroups.length} visible groups to tree`)

  const nodes: SankeyThreshold[] = []
  const allMetrics = new Set<string>()

  // =========================================================================
  // Build Root Node
  // =========================================================================
  const rootNode = createNode('root', 0, CATEGORY_ROOT, [], null, [])
  nodes.push(rootNode)

  // =========================================================================
  // Determine which stages to build
  // =========================================================================
  const stagesToBuild: Array<{ def: StageDefinition; expr: StageExpressionResult }> = []

  for (const stageDef of STAGE_DEFINITIONS) {
    const stageExpr = buildStageExpression(visibleGroups, stageDef)
    if (stageExpr.hasMetric) {
      stagesToBuild.push({ def: stageDef, expr: stageExpr })
      stageExpr.availableMetrics.forEach(m => allMetrics.add(m))
      console.log(`[ThresholdGroupConverter] Stage ${stagesToBuild.length} (${stageDef.category}): ${stageExpr.availableMetrics.join(', ')}`)
    }
  }

  // If no stages to build, return root-only tree
  if (stagesToBuild.length === 0) {
    console.log('[ThresholdGroupConverter] No metrics selected in any group, returning root-only tree')
    return {
      nodes,
      metrics: Array.from(allMetrics)
    }
  }

  // =========================================================================
  // Build stages dynamically with sequential numbering
  // =========================================================================
  let previousMatchedNode = rootNode

  for (let i = 0; i < stagesToBuild.length; i++) {
    const { def: stageDef, expr: stageExpr } = stagesToBuild[i]
    const currentStage = i + 1  // Sequential stage numbers: 1, 2, 3...
    const isLastStage = i === stagesToBuild.length - 1

    console.log(`[ThresholdGroupConverter] Building stage ${currentStage}: ${stageDef.category}`)

    // Create split rule for the parent node
    const matchedChildId = `matched_${stageDef.matchedIdSuffix}`
    const othersChildId = `others_${stageDef.othersIdSuffix}`

    const splitRule: ExpressionSplitRule = {
      type: 'expression',
      available_metrics: stageExpr.availableMetrics,
      branches: [{
        condition: stageExpr.condition,
        child_id: matchedChildId,
        description: stageExpr.description
      }],
      default_child_id: othersChildId
    }

    // Update parent node with split rule
    previousMatchedNode.split_rule = splitRule
    previousMatchedNode.children_ids = [matchedChildId, othersChildId]

    // Create matched node
    const matchedNode = createNode(
      matchedChildId,
      currentStage,
      stageDef.category,
      [
        ...previousMatchedNode.parent_path,
        createParentPathInfo(previousMatchedNode.id, 0, stageExpr.condition, stageExpr.description)
      ],
      null,  // Will be set if there's a next stage
      []
    )
    nodes.push(matchedNode)

    // Create others node (always terminal)
    const othersNode = createNode(
      othersChildId,
      currentStage,
      stageDef.category,
      [
        ...previousMatchedNode.parent_path,
        createParentPathInfo(previousMatchedNode.id, -1, 'default', 'Others')
      ],
      null,  // Terminal node
      []
    )
    nodes.push(othersNode)

    // Update previous matched node for next iteration
    previousMatchedNode = matchedNode
  }

  console.log(`[ThresholdGroupConverter] Created ${nodes.length} nodes with ${allMetrics.size} metrics across ${stagesToBuild.length} stages`)

  return {
    nodes,
    metrics: Array.from(allMetrics)
  }
}
