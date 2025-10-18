/**
 * Consistency Tree Builder - Example implementation of building a complete
 * threshold tree with custom consistency thresholds
 *
 * This file demonstrates Example 2 from the implementation summary:
 * Setting individual threshold values for each consistency metric by code.
 */

import type { ThresholdTree } from '../types'
import {
  createRootOnlyTree,
  addStageToNode,
  addConsistencyStageWithCustomThresholds
} from './threshold-utils'
import {
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER,
  CONSISTENCY_THRESHOLDS,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMSIM_MEAN
} from './constants'

/**
 * Build a complete threshold tree with Feature Splitting → Semantic Similarity → Consistency stages
 * Uses pre-configured custom thresholds for each consistency metric
 *
 * Tree structure:
 * Stage 0: Root (all features)
 * Stage 1: Feature Splitting (threshold: 0.3)
 * Stage 2: Semantic Similarity (threshold: 0.88)
 * Stage 3: Consistency (custom thresholds per metric)
 *
 * @param consistencyType Which consistency metric to use for Stage 3
 * @returns Complete threshold tree with 3 stages
 */
export function buildThreeStageTreeWithConsistency(
  consistencyType: string = CONSISTENCY_TYPE_LLM_SCORER
): ThresholdTree {
  // Start with root-only tree
  let tree = createRootOnlyTree()

  // Stage 1: Feature Splitting (binary split at 0.3)
  tree = addStageToNode(tree, 'root', {
    stageType: 'feature_splitting',
    splitRuleType: 'range',
    metric: METRIC_FEATURE_SPLITTING,
    thresholds: [0.3]
  })

  // Stage 2: Semantic Similarity (binary split at 0.88) for both children
  const featureSplittingChildren = tree.nodes
    .filter(node => node.stage === 1)
    .map(node => node.id)

  for (const nodeId of featureSplittingChildren) {
    tree = addStageToNode(tree, nodeId, {
      stageType: 'semantic_similarity',
      splitRuleType: 'range',
      metric: METRIC_SEMSIM_MEAN,
      thresholds: [0.88]
    })
  }

  // Stage 3: Consistency with custom thresholds for all leaf nodes
  const semanticSimilarityChildren = tree.nodes
    .filter(node => node.stage === 2)
    .map(node => node.id)

  for (const nodeId of semanticSimilarityChildren) {
    tree = addConsistencyStageWithCustomThresholds(tree, nodeId, consistencyType)
  }

  return tree
}

/**
 * Build a single-stage consistency tree
 * Useful for testing or focusing solely on consistency classification
 *
 * Tree structure:
 * Stage 0: Root (all features)
 * Stage 1: Consistency (custom thresholds)
 *
 * @param consistencyType Which consistency metric to use
 * @returns Threshold tree with 1 consistency stage
 */
export function buildSingleStageConsistencyTree(
  consistencyType: string = CONSISTENCY_TYPE_LLM_SCORER
): ThresholdTree {
  let tree = createRootOnlyTree()

  // Add consistency stage directly to root
  tree = addConsistencyStageWithCustomThresholds(tree, 'root', consistencyType)

  return tree
}

/**
 * Build trees for all 5 consistency types programmatically
 * Demonstrates setting individual threshold values for each consistency metric
 *
 * @returns Record of consistency type to threshold tree
 *
 * @example
 * ```typescript
 * const trees = buildAllConsistencyTrees()
 *
 * // LLM Scorer Consistency with thresholds [0.15, 0.45, 0.75] → 4 bins
 * console.log('LLM Scorer tree:', trees[CONSISTENCY_TYPE_LLM_SCORER])
 *
 * // Within-Explanation with thresholds [0.25, 0.5, 0.75] → 4 bins
 * console.log('Within-Explanation tree:', trees[CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC])
 *
 * // Cross-Explanation Metric with thresholds [0.1, 0.3, 0.6, 0.9] → 5 bins
 * console.log('Cross-Explanation Metric tree:', trees[CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC])
 *
 * // Cross-Explanation Overall with thresholds [0.2, 0.8] → 3 bins
 * console.log('Cross-Explanation Overall tree:', trees[CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE])
 *
 * // LLM Explainer with thresholds [0.3, 0.7] → 3 bins
 * console.log('LLM Explainer tree:', trees[CONSISTENCY_TYPE_LLM_EXPLAINER])
 * ```
 */
export function buildAllConsistencyTrees(): Record<string, ThresholdTree> {
  const consistencyTypes = [
    CONSISTENCY_TYPE_LLM_SCORER,
    CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    CONSISTENCY_TYPE_LLM_EXPLAINER
  ]

  const trees: Record<string, ThresholdTree> = {}

  for (const consistencyType of consistencyTypes) {
    trees[consistencyType] = buildSingleStageConsistencyTree(consistencyType)
  }

  return trees
}

/**
 * Manually build a consistency tree with explicit custom thresholds
 * This is the most flexible approach, showing exactly what's happening under the hood
 *
 * @example - Example 2 from implementation summary (explicit version)
 * ```typescript
 * let tree = createRootOnlyTree()
 *
 * // Add LLM Scorer Consistency with custom thresholds [0.15, 0.45, 0.75]
 * tree = addStageToNode(tree, 'root', {
 *   stageType: CONSISTENCY_TYPE_LLM_SCORER,
 *   splitRuleType: 'expression',
 *   customConfig: {
 *     customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_SCORER]
 *     // This resolves to: [0.15, 0.45, 0.75]
 *     // Creates 4 bins: [0-0.15), [0.15-0.45), [0.45-0.75), [0.75-1.0]
 *   }
 * })
 *
 * // Get a child node ID from the first stage
 * const childNodeId = tree.nodes.find(n => n.stage === 1)?.id
 *
 * if (childNodeId) {
 *   // Add Within-Explanation Metric with custom thresholds [0.25, 0.5, 0.75]
 *   tree = addStageToNode(tree, childNodeId, {
 *     stageType: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
 *     splitRuleType: 'expression',
 *     customConfig: {
 *       customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC]
 *       // This resolves to: [0.25, 0.5, 0.75]
 *       // Creates 4 bins: [0-0.25), [0.25-0.5), [0.5-0.75), [0.75-1.0]
 *     }
 *   })
 * }
 * ```
 */
export function buildManualConsistencyTree(): ThresholdTree {
  let tree = createRootOnlyTree()

  // Add LLM Scorer Consistency with custom thresholds [0.15, 0.45, 0.75] → 4 bins
  tree = addStageToNode(tree, 'root', {
    stageType: CONSISTENCY_TYPE_LLM_SCORER,
    splitRuleType: 'expression',
    customConfig: {
      customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_SCORER]
    }
  })

  // Add Within-Explanation to first child with custom thresholds [0.25, 0.5, 0.75] → 4 bins
  const firstChild = tree.nodes.find(n => n.stage === 1)
  if (firstChild) {
    tree = addStageToNode(tree, firstChild.id, {
      stageType: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
      splitRuleType: 'expression',
      customConfig: {
        customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC]
      }
    })
  }

  // Add Cross-Explanation Metric to one of the grandchildren with custom thresholds [0.1, 0.3, 0.6, 0.9] → 5 bins
  const grandchild = tree.nodes.find(n => n.stage === 2)
  if (grandchild) {
    tree = addStageToNode(tree, grandchild.id, {
      stageType: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
      splitRuleType: 'expression',
      customConfig: {
        customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC]
      }
    })
  }

  // Add Cross-Explanation Overall Score to one of the great-grandchildren with custom thresholds [0.2, 0.8] → 3 bins
  const greatGrandchild = tree.nodes.find(n => n.stage === 3)
  if (greatGrandchild) {
    tree = addStageToNode(tree, greatGrandchild.id, {
      stageType: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
      splitRuleType: 'expression',
      customConfig: {
        customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE]
      }
    })
  }

  // Add LLM Explainer to one of the deepest nodes with custom thresholds [0.3, 0.7] → 3 bins
  const deepestNode = tree.nodes.find(n => n.stage === 4)
  if (deepestNode) {
    tree = addStageToNode(tree, deepestNode.id, {
      stageType: CONSISTENCY_TYPE_LLM_EXPLAINER,
      splitRuleType: 'expression',
      customConfig: {
        customThresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_EXPLAINER]
      }
    })
  }

  return tree
}

/**
 * Print threshold configuration summary
 * Useful for debugging and verifying the custom threshold configuration
 */
export function printThresholdConfiguration(): void {
  console.log('='.repeat(80))
  console.log('CUSTOM CONSISTENCY THRESHOLD CONFIGURATION')
  console.log('='.repeat(80))

  const configs = [
    {
      name: 'LLM Scorer Consistency',
      type: CONSISTENCY_TYPE_LLM_SCORER,
      thresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_SCORER]
    },
    {
      name: 'Within-Explanation Metric',
      type: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
      thresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC]
    },
    {
      name: 'Cross-Explanation Metric',
      type: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
      thresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC]
    },
    {
      name: 'Cross-Explanation Overall Score',
      type: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
      thresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE]
    },
    {
      name: 'LLM Explainer Consistency',
      type: CONSISTENCY_TYPE_LLM_EXPLAINER,
      thresholds: CONSISTENCY_THRESHOLDS[CONSISTENCY_TYPE_LLM_EXPLAINER]
    }
  ]

  for (const config of configs) {
    const numBins = config.thresholds.length + 1
    console.log(`\n${config.name}:`)
    console.log(`  Type: ${config.type}`)
    console.log(`  Thresholds: [${config.thresholds.join(', ')}]`)
    console.log(`  Number of bins: ${numBins}`)
    console.log(`  Bins:`)

    // Print bin ranges
    for (let i = 0; i < numBins; i++) {
      const lower = i === 0 ? 0 : config.thresholds[i - 1]
      const upper = i === numBins - 1 ? 1.0 : config.thresholds[i]
      const operator = i === numBins - 1 ? '<=' : '<'
      console.log(`    Bin ${i + 1}: [${lower.toFixed(2)} - ${upper.toFixed(2)}${operator === '<=' ? ']' : ')'}`)
    }
  }

  console.log('\n' + '='.repeat(80))
}
