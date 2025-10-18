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
 * @param metric The metric to split on (e.g., 'feature_splitting', 'semsim_mean')
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
 * @param conditions Condition definitions for each metric
 * @param patterns Pattern matching rules evaluated in order
 * @param defaultChildId Optional default child ID when no patterns match
 * @returns PatternSplitRule
 */
export function buildPatternSplit(
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
 * @param branches Branch conditions evaluated in order
 * @param defaultChildId Required default child for when all conditions are false
 * @param availableMetrics Optional list of available metrics that can be used in expressions
 * @returns ExpressionSplitRule
 */
export function buildExpressionSplit(
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
 * Build a percentile-based expression split for consistency metrics
 * Divides a metric into N equal percentile ranges (e.g., 0-10%, 10-20%, ..., 90-100%)
 * @param metric The metric to split on (e.g., 'llm_scorer_consistency')
 * @param numBins Number of percentile bins (default: 10)
 * @returns ExpressionSplitRule with percentile-based branches
 */
export function buildPercentileSplit(
  metric: string,
  numBins: number = 10
): ExpressionSplitRule {
  if (numBins < 2) {
    throw new Error('Number of bins must be at least 2')
  }

  const binSize = 1.0 / numBins
  const branches: ExpressionSplitRule['branches'] = []

  for (let i = 0; i < numBins; i++) {
    const lowerBound = i * binSize
    const upperBound = (i + 1) * binSize

    const percentLower = Math.round(lowerBound * 100)
    const percentUpper = Math.round(upperBound * 100)

    // Use percentile format to make it clear we're working with percentiles
    const condition = i === numBins - 1
      ? `${metric} >= ${percentLower}% && ${metric} <= ${percentUpper}%`
      : `${metric} >= ${percentLower}% && ${metric} < ${percentUpper}%`

    branches.push({
      condition,
      child_id: `${metric}_p${percentUpper}`,
      description: `${percentLower}-${percentUpper}%`
    })
  }

  return buildExpressionSplit(branches, branches[branches.length - 1].child_id, [metric])
}

/**
 * Build an absolute value-based expression split for consistency metrics
 * Divides a metric into N equal-width bins using absolute thresholds (e.g., 0-0.25, 0.25-0.5, 0.5-0.75, 0.75-1.0)
 * @param metric The metric to split on (e.g., 'llm_scorer_consistency')
 * @param numBins Number of bins for splitting (default: 4)
 * @returns ExpressionSplitRule with absolute value-based branches
 */
export function buildAbsoluteValueSplit(
  metric: string,
  numBins: number = 4
): ExpressionSplitRule {
  if (numBins < 2) {
    throw new Error('Number of bins must be at least 2')
  }

  const binSize = 1.0 / numBins
  const branches: ExpressionSplitRule['branches'] = []

  for (let i = 0; i < numBins; i++) {
    const lowerBound = i * binSize
    const upperBound = (i + 1) * binSize

    // Format thresholds with 2 decimal places for readability
    const lowerStr = lowerBound.toFixed(2)
    const upperStr = upperBound.toFixed(2)

    // Use absolute value conditions
    const condition = i === numBins - 1
      ? `${metric} >= ${lowerStr} && ${metric} <= ${upperStr}`
      : `${metric} >= ${lowerStr} && ${metric} < ${upperStr}`

    branches.push({
      condition,
      child_id: `${metric}_${upperStr.replace('.', '_')}`,
      description: `${lowerStr}-${upperStr}`
    })
  }

  return buildExpressionSplit(branches, branches[branches.length - 1].child_id, [metric])
}

/**
 * Build a custom value-based expression split with explicit threshold values
 * Creates bins using provided threshold values instead of auto-calculating equal-width bins
 * @param metric The metric to split on (e.g., 'llm_scorer_consistency')
 * @param thresholds Array of explicit threshold values (must be sorted ascending and in range [0, 1])
 * @returns ExpressionSplitRule with custom value-based branches
 * @example
 * // Creates 4 bins: [0-0.2), [0.2-0.5), [0.5-0.8), [0.8-1.0]
 * buildCustomValueSplit('llm_scorer_consistency', [0.2, 0.5, 0.8])
 */
export function buildCustomValueSplit(
  metric: string,
  thresholds: number[]
): ExpressionSplitRule {
  // Validate inputs
  if (thresholds.length < 1) {
    throw new Error('At least one threshold value is required')
  }

  // Validate thresholds are sorted and in valid range
  for (let i = 0; i < thresholds.length; i++) {
    const threshold = thresholds[i]

    if (threshold < 0 || threshold > 1) {
      throw new Error(`Threshold value ${threshold} is out of valid range [0, 1]`)
    }

    if (i > 0 && threshold <= thresholds[i - 1]) {
      throw new Error(`Thresholds must be sorted in ascending order. Found ${thresholds[i - 1]} followed by ${threshold}`)
    }
  }

  const branches: ExpressionSplitRule['branches'] = []
  const numBins = thresholds.length + 1

  for (let i = 0; i < numBins; i++) {
    const lowerBound = i === 0 ? 0 : thresholds[i - 1]
    const upperBound = i === numBins - 1 ? 1 : thresholds[i]

    // Format thresholds with 2 decimal places for readability
    const lowerStr = lowerBound.toFixed(2)
    const upperStr = upperBound.toFixed(2)

    // Use absolute value conditions
    const condition = i === numBins - 1
      ? `${metric} >= ${lowerStr} && ${metric} <= ${upperStr}`
      : `${metric} >= ${lowerStr} && ${metric} < ${upperStr}`

    branches.push({
      condition,
      child_id: `${metric}_${upperStr.replace('.', '_')}`,
      description: `${lowerStr}-${upperStr}`
    })
  }

  return buildExpressionSplit(branches, branches[branches.length - 1].child_id, [metric])
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
