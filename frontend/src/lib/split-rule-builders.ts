import type {
  RangeSplitRule,
  PatternSplitRule,
  ExpressionSplitRule,
  SankeyThreshold,
  ParentPathInfo,
  CategoryType
} from '../types'

/**
 * Build a range-based split rule for binary or multi-way splits
 * @param metric The metric to split on (e.g., 'feature_splitting', 'semdist_mean')
 * @param thresholds Array of threshold values for splitting
 * @returns RangeSplitRule
 */
export function buildRangeSplit(
  metric: string,
  thresholds: number[]
): RangeSplitRule {
  return {
    type: 'range',
    metric,
    thresholds
  }
}

/**
 * Build a pattern-based split rule for multi-metric conditions
 * Internal helper for buildFlexibleScoreAgreementSplit
 */
function buildPatternSplit(
  conditions: PatternSplitRule['conditions'],
  patterns: PatternSplitRule['patterns'],
  defaultChildId?: string
): PatternSplitRule {
  return {
    type: 'pattern',
    conditions,
    patterns,
    default_child_id: defaultChildId
  }
}

/**
 * Build an expression-based split rule
 * Internal helper for buildCategoryGroupPatternSplit
 */
function buildExpressionSplit(
  branches: ExpressionSplitRule['branches'],
  defaultChildId: string,
  availableMetrics?: string[]
): ExpressionSplitRule {
  return {
    type: 'expression',
    available_metrics: availableMetrics,
    branches,
    default_child_id: defaultChildId
  }
}

/**
 * Build a flexible score agreement pattern split with user-selected metrics
 * Generates all possible high/low combinations for N metrics (2^N patterns)
 * @param metrics Array of metric names to use (e.g., ['score_fuzz', 'score_simulation'])
 * @param thresholds Array of threshold values (same length as metrics)
 * @returns PatternSplitRule configured for score agreement patterns
 */
export function buildFlexibleScoreAgreementSplit(
  metrics: string[],
  thresholds: number[]
): PatternSplitRule {
  if (metrics.length === 0) {
    throw new Error('At least one metric must be provided for score agreement')
  }

  if (metrics.length !== thresholds.length) {
    throw new Error('Number of metrics must match number of thresholds')
  }

  // Build conditions object
  const conditions: PatternSplitRule['conditions'] = {}
  metrics.forEach((metric, index) => {
    conditions[metric] = { threshold: thresholds[index] }
  })

  // Generate all possible high/low combinations (2^N patterns)
  const numPatterns = Math.pow(2, metrics.length)
  const patterns: PatternSplitRule['patterns'] = []

  for (let i = 0; i < numPatterns; i++) {
    const match: { [metric: string]: 'high' | 'low' } = {}
    const highMetrics: string[] = []

    // Convert index to binary to determine high/low for each metric
    for (let j = 0; j < metrics.length; j++) {
      const isHigh = (i & (1 << (metrics.length - 1 - j))) !== 0
      match[metrics[j]] = isHigh ? 'high' : 'low'
      if (isHigh) {
        highMetrics.push(getMetricShortName(metrics[j]))
      }
    }

    // Generate child_id and description
    const numHigh = highMetrics.length
    let childId: string
    let description: string

    if (numHigh === metrics.length) {
      childId = `all_${metrics.length}_high`
      description = `All ${metrics.length} scores high`
    } else if (numHigh === 0) {
      childId = `all_${metrics.length}_low`
      description = `All ${metrics.length} scores low`
    } else {
      const metricsList = highMetrics.join('_')
      childId = `${numHigh}_of_${metrics.length}_high_${metricsList}`
      description = `${numHigh} of ${metrics.length} high (${highMetrics.join(', ')})`
    }

    patterns.push({
      match,
      child_id: childId,
      description
    })
  }

  // Sort patterns by number of high scores (descending) for consistent ordering
  // This ensures nodes appear from "all high" → "all low" in visualizations
  patterns.sort((a, b) => {
    const numHighA = Object.values(a.match).filter(v => v === 'high').length
    const numHighB = Object.values(b.match).filter(v => v === 'high').length
    return numHighB - numHighA  // Descending: more high scores first
  })

  return buildPatternSplit(conditions, patterns)
}

/**
 * Build a CategoryGroup-based expression split for score agreement
 * Creates N+1 children (N groups + "others") instead of 2^M metric combinations
 * Uses ExpressionSplitRule to support multiple columnIds per group via OR logic
 *
 * @param categoryGroups Array of CategoryGroup objects from Linear Set Diagram
 * @param metrics Array of metric names (e.g., ['score_fuzz', 'score_detection', 'score_simulation'])
 * @param thresholds Array of threshold values (same length as metrics)
 * @returns ExpressionSplitRule with OR conditions for groups with multiple columnIds
 *
 * @example
 * // If group_2 has columnIds: ["1_of_3_high_fuzz", "2_of_3_high_fuzz_sim"]
 * // Creates condition: "(fuzz >= 0.5 && detection < 0.5 && sim < 0.1) || (fuzz >= 0.5 && sim >= 0.1 && detection < 0.5)"
 */
export function buildCategoryGroupPatternSplit(
  categoryGroups: Array<{ id: string; name: string; columnIds: string[]; color: string }>,
  metrics: string[],
  thresholds: number[]
): ExpressionSplitRule {
  if (metrics.length === 0) {
    throw new Error('At least one metric must be provided for score agreement')
  }

  if (metrics.length !== thresholds.length) {
    throw new Error('Number of metrics must match number of thresholds')
  }

  if (categoryGroups.length === 0) {
    throw new Error('At least one category group must be provided')
  }

  // Helper: Parse columnId to get metric states
  const parseColumnIdToMetricStates = (columnId: string): Record<string, 'high' | 'low'> => {
    if (columnId.startsWith('all_') && columnId.endsWith('_high')) {
      return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'high' as const }), {})
    }
    if (columnId.startsWith('all_') && columnId.endsWith('_low')) {
      return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'low' as const }), {})
    }
    const match = columnId.match(/\d+_of_\d+_high_(.+)/)
    if (match) {
      const metricsPart = match[1]
      const shortNames = metricsPart.split('_')
      const highMetrics = new Set(
        shortNames
          .map(shortName => metrics.find(m => m.includes(shortName)))
          .filter((m): m is string => m !== undefined)
      )
      return metrics.reduce((acc, metric) => ({
        ...acc,
        [metric]: highMetrics.has(metric) ? 'high' as const : 'low' as const
      }), {})
    }
    return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'low' as const }), {})
  }

  // Helper: Build condition string for a single columnId
  const buildConditionForColumn = (columnId: string): string => {
    const metricStates = parseColumnIdToMetricStates(columnId)
    const conditions: string[] = []

    metrics.forEach((metric, idx) => {
      const threshold = thresholds[idx]
      const state = metricStates[metric]
      const condition = state === 'high' ? `${metric} >= ${threshold}` : `${metric} < ${threshold}`
      conditions.push(condition)
    })

    return `(${conditions.join(' && ')})`
  }

  // Create branches for each CategoryGroup
  const branches: ExpressionSplitRule['branches'] = categoryGroups.map(group => {
    if (group.columnIds.length === 0) {
      throw new Error(`CategoryGroup ${group.id} has no columnIds`)
    }

    // Build OR condition for all columnIds in this group
    const columnConditions = group.columnIds.map(buildConditionForColumn)
    const condition = columnConditions.length === 1
      ? columnConditions[0]
      : columnConditions.join(' || ')

    return {
      condition,
      child_id: group.id,
      description: group.name
    }
  })

  // Check if all possible combinations are covered
  const totalCombinations = Math.pow(2, metrics.length)
  const totalColumnIds = categoryGroups.reduce((sum, group) => sum + group.columnIds.length, 0)
  const needsOthers = totalColumnIds < totalCombinations

  // Only add "others" if not all combinations are covered
  const defaultChildId = needsOthers ? 'others' : branches[branches.length - 1].child_id

  return buildExpressionSplit(branches, defaultChildId, metrics)
}

/**
 * Get short name for a metric (remove 'score_' prefix)
 * @param metric Full metric name (e.g., 'score_fuzz')
 * @returns Short name (e.g., 'fuzz')
 */
function getMetricShortName(metric: string): string {
  return metric.replace('score_', '')
}

/**
 * Create a SankeyThreshold node
 * @param id Unique identifier for the node
 * @param stage Stage number (0 for root)
 * @param category Category type of the node
 * @param parentPath Array of parent path information
 * @param splitRule Split rule for this node (null for leaf nodes)
 * @param childrenIds Array of child node IDs
 * @returns SankeyThreshold node
 */
export function createNode(
  id: string,
  stage: number,
  category: CategoryType,
  parentPath: ParentPathInfo[] = [],
  splitRule: SankeyThreshold['split_rule'] = null,
  childrenIds: string[] = []
): SankeyThreshold {
  return {
    id,
    stage,
    category,
    parent_path: parentPath,
    split_rule: splitRule,
    children_ids: childrenIds
  }
}

/**
 * Create parent path info for child nodes
 * @param parentId ID of the parent node
 * @param splitType Type of split rule
 * @param branchIndex Index of this child in parent's children array
 * @param details Additional details about the split
 * @returns ParentPathInfo
 */
export function createParentPath(
  parentId: string,
  splitType: 'range' | 'pattern' | 'expression',
  branchIndex: number,
  details: {
    metric?: string
    thresholds?: number[]
    patternIndex?: number
    patternDescription?: string
    condition?: string
    description?: string
  } = {}
): ParentPathInfo {
  const parentSplitRule: ParentPathInfo['parent_split_rule'] = {
    type: splitType
  }

  if (splitType === 'range' && details.metric && details.thresholds) {
    parentSplitRule.range_info = {
      metric: details.metric,
      thresholds: details.thresholds
    }
  } else if (splitType === 'pattern' && details.patternIndex !== undefined) {
    parentSplitRule.pattern_info = {
      pattern_index: details.patternIndex,
      pattern_description: details.patternDescription
    }
  } else if (splitType === 'expression' && details.condition) {
    parentSplitRule.expression_info = {
      branch_index: branchIndex,
      condition: details.condition,
      description: details.description
    }
  }

  return {
    parent_id: parentId,
    parent_split_rule: parentSplitRule,
    branch_index: branchIndex
  }
}
