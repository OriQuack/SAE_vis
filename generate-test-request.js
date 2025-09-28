// Script to generate the default threshold structure for testing
// This uses the exact same function as the frontend

const CategoryType = {
  ROOT: "root",
  FEATURE_SPLITTING: "feature_splitting",
  SEMANTIC_DISTANCE: "semantic_distance",
  SCORE_AGREEMENT: "score_agreement"
};

function buildRangeSplit(metric, thresholds) {
  return {
    type: 'range',
    metric,
    thresholds
  };
}

function buildPatternSplit(conditions, patterns, defaultChildId) {
  return {
    type: 'pattern',
    conditions,
    patterns,
    default_child_id: defaultChildId
  };
}

function buildScoreAgreementSplit(fuzzThreshold = 0.5, simThreshold = 0.5, detThreshold = 0.2) {
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
  );
}

function createNode(id, stage, category, parentPath = [], splitRule = null, childrenIds = []) {
  return {
    id,
    stage,
    category,
    parent_path: parentPath,
    split_rule: splitRule,
    children_ids: childrenIds
  };
}

function createParentPath(parentId, splitType, branchIndex, details = {}) {
  const parentSplitRule = {
    type: splitType
  };

  if (splitType === 'range' && details.metric && details.thresholds) {
    parentSplitRule.range_info = {
      metric: details.metric,
      thresholds: details.thresholds
    };
  } else if (splitType === 'pattern' && details.patternIndex !== undefined) {
    parentSplitRule.pattern_info = {
      pattern_index: details.patternIndex,
      pattern_description: details.patternDescription
    };
  } else if (splitType === 'expression' && details.condition) {
    parentSplitRule.expression_info = {
      branch_index: branchIndex,
      condition: details.condition,
      description: details.description
    };
  }

  return {
    parent_id: parentId,
    parent_split_rule: parentSplitRule,
    branch_index: branchIndex
  };
}

function buildDefaultThresholdStructure() {
  const nodes = [];

  // Root node
  const root = createNode(
    'root',
    0,
    CategoryType.ROOT,
    [],
    buildRangeSplit('feature_splitting', [0.1]),
    ['split_false', 'split_true']
  );
  nodes.push(root);

  // Stage 1: Feature Splitting
  const splitFalse = createNode(
    'split_false',
    1,
    CategoryType.FEATURE_SPLITTING,
    [createParentPath('root', 'range', 0, { metric: 'feature_splitting', thresholds: [0.1] })],
    buildRangeSplit('semdist_mean', [0.3]),
    ['split_false_semdist_low', 'split_false_semdist_high']
  );
  nodes.push(splitFalse);

  const splitTrue = createNode(
    'split_true',
    1,
    CategoryType.FEATURE_SPLITTING,
    [createParentPath('root', 'range', 1, { metric: 'feature_splitting', thresholds: [0.1] })],
    buildRangeSplit('semdist_mean', [0.3]),
    ['split_true_semdist_low', 'split_true_semdist_high']
  );
  nodes.push(splitTrue);

  // Stage 2: Semantic Distance
  const semanticDistanceNodes = [
    { id: 'split_false_semdist_low', parentId: 'split_false', branchIdx: 0 },
    { id: 'split_false_semdist_high', parentId: 'split_false', branchIdx: 1 },
    { id: 'split_true_semdist_low', parentId: 'split_true', branchIdx: 0 },
    { id: 'split_true_semdist_high', parentId: 'split_true', branchIdx: 1 }
  ];

  for (const sdNode of semanticDistanceNodes) {
    const parentPath = nodes.find(n => n.id === sdNode.parentId).parent_path.concat([
      createParentPath(sdNode.parentId, 'range', sdNode.branchIdx, {
        metric: 'semdist_mean',
        thresholds: [0.3]
      })
    ]);

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
    );
    nodes.push(node);
  }

  // Stage 3: Score Agreement (leaf nodes)
  for (const sdNode of semanticDistanceNodes) {
    const parentNode = nodes.find(n => n.id === sdNode.id);
    const scoreCategories = [
      'all_3_high', '2_of_3_high_fuzz_sim', '2_of_3_high_fuzz_det',
      '2_of_3_high_sim_det', '1_of_3_high_fuzz', '1_of_3_high_sim',
      '1_of_3_high_det', 'all_3_low'
    ];

    scoreCategories.forEach((category, idx) => {
      const nodeId = `${sdNode.id}_${category}`;
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
      );
      nodes.push(node);
    });
  }

  return nodes;
}

// Generate the complete request structure
const thresholdStructure = buildDefaultThresholdStructure();

const testRequest = {
  filters: {},
  thresholdTree: {
    nodes: thresholdStructure,
    metrics: ['feature_splitting', 'semdist_mean', 'score_fuzz', 'score_simulation', 'score_detection'],
    version: 2
  },
  version: 2
};

console.log(JSON.stringify(testRequest, null, 2));