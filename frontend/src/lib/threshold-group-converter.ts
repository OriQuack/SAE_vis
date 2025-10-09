/**
 * Threshold Group to Sankey Tree Converter
 *
 * Converts histogram threshold groups into a Sankey threshold tree structure
 * using ExpressionSplitRule for flexible, multi-group filtering.
 *
 * Architecture:
 * - Dynamic stage creation based on available metrics
 * - Single-metric stages: Use OR logic (all groups merged into "matched")
 * - Multi-metric stages: Generate all 2^N combinations for N groups
 *   - Example for 2 groups: Group1-only, Group2-only, Both, Neither
 *   - Uses set-theoretic logic: Match X AND NOT Y for exclusive combinations
 * - Within a group's scores, uses AND logic
 * - Features not matching any group go to "others" branch
 */

import type { ThresholdTree, SankeyThreshold, ExpressionSplitRule, ParentPathInfo } from '../types'
import { createRootOnlyTree } from './threshold-utils'
import { createNode, createParentPath } from './split-rule-builders'
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
 * Build a reusable expression split for threshold groups
 *
 * For single-metric stages: Uses OR logic (all groups → "matched")
 * For multi-metric stages: Generates all 2^N combinations to handle overlaps
 *   - For N groups, creates 2^N nodes representing all possible combinations
 *   - Example with 2 groups: Group1-only, Group2-only, Both, Neither
 *   - Uses compound conditions: "Match A AND NOT B" for exclusive combinations
 *   - Empty set (match none) becomes the "others" default child
 *
 * @param groups Threshold groups to process
 * @param stageMetric Single metric or array of metrics for this stage
 * @param matchedIdSuffix Suffix for matched child node ID (single-metric only)
 * @param othersIdSuffix Suffix for others child node ID
 * @param description Description for matched branch (single-metric only)
 * @returns Split rule configuration with child IDs and metrics
 */
function buildThresholdGroupExpressionSplit(
  groups: ThresholdGroup[],
  stageMetric: string | string[],
  matchedIdSuffix: string,
  othersIdSuffix: string,
  description: string
): {
  splitRule: ExpressionSplitRule
  childIds: string[]
  availableMetrics: string[]
} {
  const allMetrics = new Set<string>()

  if (typeof stageMetric === 'string') {
    // Single metric stage (feature_splitting or semsim_mean)
    // Use OR logic: merge all groups into single "matched" child
    const conditions: string[] = []

    for (const group of groups) {
      const selection = group.selections.find(s => s.metricType === stageMetric)
      if (selection) {
        conditions.push(buildMetricRangeCondition(
          stageMetric,
          selection.thresholdRange.min,
          selection.thresholdRange.max
        ))
        allMetrics.add(stageMetric)
      }
    }

    const matchedChildId = `matched_${matchedIdSuffix}`
    const othersChildId = `others_${othersIdSuffix}`

    const splitRule: ExpressionSplitRule = {
      type: 'expression',
      available_metrics: Array.from(allMetrics),
      branches: [{
        condition: conditions.length > 0 ? conditions.join(' || ') : '',
        child_id: matchedChildId,
        description: description
      }],
      default_child_id: othersChildId
    }

    return {
      splitRule,
      childIds: [matchedChildId, othersChildId],
      availableMetrics: Array.from(allMetrics)
    }
  } else {
    // Multi-metric stage (score agreement)
    // Generate all combinations to handle overlapping groups
    const groupsWithConditions: Array<{
      group: ThresholdGroup
      condition: string
    }> = []

    for (const group of groups) {
      const groupCondition = buildGroupScoreCondition(group.selections, stageMetric)
      if (groupCondition) {
        groupsWithConditions.push({ group, condition: groupCondition })
        // Track which score metrics are used
        for (const selection of group.selections) {
          if (stageMetric.includes(selection.metricType)) {
            allMetrics.add(selection.metricType)
          }
        }
      }
    }

    // Generate all non-empty combinations (2^N - 1, excluding empty set)
    const branches: ExpressionSplitRule['branches'] = []
    const n = groupsWithConditions.length
    const totalCombinations = Math.pow(2, n)

    for (let i = 1; i < totalCombinations; i++) {  // Start from 1 to skip empty set
      const matchingGroups: string[] = []
      const matchingGroupIds: string[] = []
      const matchingConditions: string[] = []
      const nonMatchingConditions: string[] = []

      for (let j = 0; j < n; j++) {
        const { group, condition } = groupsWithConditions[j]

        if (i & (1 << j)) {  // Check if jth bit is set
          matchingGroups.push(group.name)
          matchingGroupIds.push(group.id)
          matchingConditions.push(`(${condition})`)
        } else {
          nonMatchingConditions.push(`!(${condition})`)
        }
      }

      // Build compound condition: Match these AND NOT others
      const allConditions = [...matchingConditions, ...nonMatchingConditions]
      const condition = allConditions.join(' && ')

      // Create child ID and description
      const childId = matchingGroupIds.length === 1
        ? matchingGroupIds[0]  // Single group: use group ID directly
        : `combined_${matchingGroupIds.join('_')}`  // Multiple groups: combine IDs

      const description = matchingGroups.join(' + ')

      branches.push({
        condition,
        child_id: childId,
        description
      })
    }

    const othersChildId = `others_${othersIdSuffix}`
    const childIds = [...branches.map(b => b.child_id), othersChildId]

    const splitRule: ExpressionSplitRule = {
      type: 'expression',
      available_metrics: Array.from(allMetrics),
      branches,
      default_child_id: othersChildId
    }

    return {
      splitRule,
      childIds,
      availableMetrics: Array.from(allMetrics)
    }
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
    const isMultiMetric = Array.isArray(stageDef.metric)

    console.log(`[ThresholdGroupConverter] Building stage ${currentStage}: ${stageDef.category} (${isMultiMetric ? 'multi-group' : 'binary'})`)

    // Build split rule using reusable helper
    const { splitRule, childIds } = buildThresholdGroupExpressionSplit(
      visibleGroups,
      stageDef.metric,
      stageDef.matchedIdSuffix,
      stageDef.othersIdSuffix,
      stageDef.description
    )

    // Update parent node with split rule
    previousMatchedNode.split_rule = splitRule
    previousMatchedNode.children_ids = childIds

    if (isMultiMetric) {
      // Multi-metric stage (score agreement): Create one node per group + others
      // All children are terminal (no chain continuation)
      splitRule.branches.forEach((branch, idx) => {
        const childNode = createNode(
          branch.child_id,
          currentStage,
          stageDef.category,
          [
            ...previousMatchedNode.parent_path,
            createParentPath(previousMatchedNode.id, 'expression', idx, {
              condition: branch.condition,
              description: branch.description
            })
          ],
          null,  // Terminal node
          []
        )
        nodes.push(childNode)
        console.log(`[ThresholdGroupConverter] Created group node: ${branch.child_id} (${branch.description})`)
      })

      // Create others node
      const othersNode = createNode(
        splitRule.default_child_id,
        currentStage,
        stageDef.category,
        [
          ...previousMatchedNode.parent_path,
          createParentPath(previousMatchedNode.id, 'expression', -1, {
            condition: 'default',
            description: 'Others'
          })
        ],
        null,  // Terminal node
        []
      )
      nodes.push(othersNode)

      // Chain terminates here (multi-group stage is always terminal)
      previousMatchedNode = null as any
    } else {
      // Single-metric stage (feature_splitting or semsim_mean): Binary split
      // matched continues chain, others is terminal
      const [matchedChildId, othersChildId] = childIds

      const matchedNode = createNode(
        matchedChildId,
        currentStage,
        stageDef.category,
        [
          ...previousMatchedNode.parent_path,
          createParentPath(previousMatchedNode.id, 'expression', 0, {
            condition: stageExpr.condition,
            description: stageExpr.description
          })
        ],
        null,
        []
      )
      nodes.push(matchedNode)

      const othersNode = createNode(
        othersChildId,
        currentStage,
        stageDef.category,
        [
          ...previousMatchedNode.parent_path,
          createParentPath(previousMatchedNode.id, 'expression', -1, {
            condition: 'default',
            description: 'Others'
          })
        ],
        null,  // Terminal node
        []
      )
      nodes.push(othersNode)

      // Continue chain with matched node
      previousMatchedNode = matchedNode
    }
  }

  console.log(`[ThresholdGroupConverter] Created ${nodes.length} nodes with ${allMetrics.size} metrics across ${stagesToBuild.length} stages`)

  return {
    nodes,
    metrics: Array.from(allMetrics)
  }
}
