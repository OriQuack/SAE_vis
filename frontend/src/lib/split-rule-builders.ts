import type {
  RangeSplitRule,
  PatternSplitRule,
  ExpressionSplitRule,
  SankeyThreshold,
  ParentPathInfo
} from '../types'
import { CategoryType } from '../types'

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
 * Build a score agreement pattern split for the common case
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
  return buildPatternSplit(
    {
      'score_fuzz': { threshold: fuzzThreshold },
      'score_simulation': { threshold: simThreshold },
      'score_detection': { threshold: detThreshold }
    },
    [
      {
        match: {
          'score_fuzz': 'high',
          'score_simulation': 'high',
          'score_detection': 'high'
        },
        child_id: 'all_3_high',
        description: 'All 3 scores high'
      },
      {
        match: {
          'score_fuzz': 'high',
          'score_simulation': 'high',
          'score_detection': 'low'
        },
        child_id: '2_of_3_high_fuzz_sim',
        description: '2 of 3 high (fuzz & simulation)'
      },
      {
        match: {
          'score_fuzz': 'high',
          'score_simulation': 'low',
          'score_detection': 'high'
        },
        child_id: '2_of_3_high_fuzz_det',
        description: '2 of 3 high (fuzz & detection)'
      },
      {
        match: {
          'score_fuzz': 'low',
          'score_simulation': 'high',
          'score_detection': 'high'
        },
        child_id: '2_of_3_high_sim_det',
        description: '2 of 3 high (simulation & detection)'
      },
      {
        match: {
          'score_fuzz': 'high',
          'score_simulation': 'low',
          'score_detection': 'low'
        },
        child_id: '1_of_3_high_fuzz',
        description: '1 of 3 high (fuzz only)'
      },
      {
        match: {
          'score_fuzz': 'low',
          'score_simulation': 'high',
          'score_detection': 'low'
        },
        child_id: '1_of_3_high_sim',
        description: '1 of 3 high (simulation only)'
      },
      {
        match: {
          'score_fuzz': 'low',
          'score_simulation': 'low',
          'score_detection': 'high'
        },
        child_id: '1_of_3_high_det',
        description: '1 of 3 high (detection only)'
      },
      {
        match: {
          'score_fuzz': 'low',
          'score_simulation': 'low',
          'score_detection': 'low'
        },
        child_id: 'all_3_low',
        description: 'All 3 scores low'
      }
    ]
  )
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
    CategoryType.ROOT,
    [],
    buildRangeSplit('feature_splitting', [0.1]),
    ['split_false', 'split_true']
  )
  nodes.push(root)

  // Stage 1: Feature Splitting
  const splitFalse = createNode(
    'split_false',
    1,
    CategoryType.FEATURE_SPLITTING,
    [createParentPath('root', 'range', 0, { metric: 'feature_splitting', thresholds: [0.1] })],
    buildRangeSplit('semdist_mean', [0.1]),
    ['split_false_semdist_low', 'split_false_semdist_high']
  )
  nodes.push(splitFalse)

  const splitTrue = createNode(
    'split_true',
    1,
    CategoryType.FEATURE_SPLITTING,
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
      CategoryType.SEMANTIC_DISTANCE,
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
        CategoryType.SCORE_AGREEMENT,
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