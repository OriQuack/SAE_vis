import type {
  RangeSplitRule,
  PatternSplitRule,
  ExpressionSplitRule,
  SankeyThreshold,
  ParentPathInfo,
  CategoryType
} from '../types'
import {
  CATEGORY_ROOT,
  CATEGORY_FEATURE_SPLITTING,
  CATEGORY_SEMANTIC_DISTANCE,
  CATEGORY_SCORE_AGREEMENT
} from './constants'

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
 * @param conditions Object defining thresholds for each metric
 * @param patterns Array of pattern matches with child assignments
 * @param defaultChildId Default child for unmatched patterns
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
 * Build an expression-based split rule (for future extensibility)
 * @param branches Array of conditional branches
 * @param defaultChildId Default child for unmatched conditions
 * @param availableMetrics Optional list of available metrics
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
 * Build a score agreement pattern split for the common case (backward compatibility)
 * @param fuzzThreshold Threshold for fuzz score
 * @param simThreshold Threshold for simulation score
 * @param detThreshold Threshold for detection score
 * @returns PatternSplitRule configured for score agreement patterns
 */
export function buildScoreAgreementSplit(
  fuzzThreshold: number = 0.5,
  simThreshold: number = 0.5,
  detThreshold: number = 0.2
): PatternSplitRule {
  return buildFlexibleScoreAgreementSplit(
    ['score_fuzz', 'score_simulation', 'score_detection'],
    [fuzzThreshold, simThreshold, detThreshold]
  )
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

/**
 * Build the default threshold tree structure
 * This creates the standard 3-stage classification pipeline
 * @returns Array of SankeyThreshold nodes
 */
export function buildDefaultThresholdStructure(): SankeyThreshold[] {
  const nodes: SankeyThreshold[] = []

  // Root node
  const root = createNode(
    'root',
    0,
    CATEGORY_ROOT,
    [],
    buildRangeSplit('feature_splitting', [0.1]),
    ['split_false', 'split_true']
  )
  nodes.push(root)

  // Stage 1: Feature Splitting
  const splitFalse = createNode(
    'split_false',
    1,
    CATEGORY_FEATURE_SPLITTING,
    [createParentPath('root', 'range', 0, { metric: 'feature_splitting', thresholds: [0.1] })],
    buildRangeSplit('semdist_mean', [0.1]),
    ['split_false_semdist_low', 'split_false_semdist_high']
  )
  nodes.push(splitFalse)

  const splitTrue = createNode(
    'split_true',
    1,
    CATEGORY_FEATURE_SPLITTING,
    [createParentPath('root', 'range', 1, { metric: 'feature_splitting', thresholds: [0.1] })],
    buildRangeSplit('semdist_mean', [0.1]),
    ['split_true_semdist_low', 'split_true_semdist_high']
  )
  nodes.push(splitTrue)

  // Stage 2: Semantic Distance
  const semanticDistanceNodes = [
    { id: 'split_false_semdist_low', parentId: 'split_false', branchIdx: 0 },
    { id: 'split_false_semdist_high', parentId: 'split_false', branchIdx: 1 },
    { id: 'split_true_semdist_low', parentId: 'split_true', branchIdx: 0 },
    { id: 'split_true_semdist_high', parentId: 'split_true', branchIdx: 1 }
  ]

  for (const sdNode of semanticDistanceNodes) {
    const parentPath = nodes.find(n => n.id === sdNode.parentId)!.parent_path.concat([
      createParentPath(sdNode.parentId, 'range', sdNode.branchIdx, {
        metric: 'semdist_mean',
        thresholds: [0.1]
      })
    ])

    const node = createNode(
      sdNode.id,
      2,
      CATEGORY_SEMANTIC_DISTANCE,
      parentPath,
      buildScoreAgreementSplit(0.5, 0.5, 0.2),
      [
        `${sdNode.id}_all_3_high`,
        `${sdNode.id}_2_of_3_high_fuzz_sim`,
        `${sdNode.id}_2_of_3_high_fuzz_det`,
        `${sdNode.id}_2_of_3_high_sim_det`,
        `${sdNode.id}_1_of_3_high_fuzz`,
        `${sdNode.id}_1_of_3_high_sim`,
        `${sdNode.id}_1_of_3_high_det`,
        `${sdNode.id}_all_3_low`
      ]
    )
    nodes.push(node)
  }

  // Stage 3: Score Agreement (leaf nodes)
  for (const sdNode of semanticDistanceNodes) {
    const parentNode = nodes.find(n => n.id === sdNode.id)!
    const scoreCategories = [
      'all_3_high', '2_of_3_high_fuzz_sim', '2_of_3_high_fuzz_det',
      '2_of_3_high_sim_det', '1_of_3_high_fuzz', '1_of_3_high_sim',
      '1_of_3_high_det', 'all_3_low'
    ]

    scoreCategories.forEach((category, idx) => {
      const nodeId = `${sdNode.id}_${category}`
      const node = createNode(
        nodeId,
        3,
        CATEGORY_SCORE_AGREEMENT,
        parentNode.parent_path.concat([
          createParentPath(parentNode.id, 'pattern', idx, {
            patternIndex: idx,
            patternDescription: category.replace(/_/g, ' ')
          })
        ]),
        null, // Leaf node
        []
      )
      nodes.push(node)
    })
  }

  return nodes
}