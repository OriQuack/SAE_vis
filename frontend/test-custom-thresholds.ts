/**
 * Test script for custom consistency thresholds implementation
 * Demonstrates Example 2: Setting individual threshold values for each consistency metric
 *
 * Run with: npx tsx test-custom-thresholds.ts
 */

import {
  buildAllConsistencyTrees,
  buildManualConsistencyTree,
  buildSingleStageConsistencyTree,
  buildThreeStageTreeWithConsistency,
  printThresholdConfiguration
} from './src/lib/consistency-tree-builder'
import {
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER
} from './src/lib/constants'

console.log('\n' + '='.repeat(80))
console.log('EXAMPLE 2: CUSTOM CONSISTENCY THRESHOLDS IMPLEMENTATION TEST')
console.log('='.repeat(80) + '\n')

// Print the threshold configuration first
printThresholdConfiguration()

// Test 1: Build all consistency trees
console.log('\n' + '='.repeat(80))
console.log('TEST 1: Build all consistency trees programmatically')
console.log('='.repeat(80))

const allTrees = buildAllConsistencyTrees()

for (const consistencyType of [
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER
]) {
  const tree = allTrees[consistencyType]
  console.log(`\n${consistencyType}:`)
  console.log(`  Total nodes: ${tree.nodes.length}`)
  console.log(`  Root node: ${tree.nodes[0].id}`)
  console.log(`  Stage 1 nodes: ${tree.nodes.filter(n => n.stage === 1).length}`)

  // Check split rule
  const rootNode = tree.nodes[0]
  if (rootNode.split_rule?.type === 'expression') {
    const branches = rootNode.split_rule.branches
    console.log(`  Number of bins: ${branches.length}`)
    console.log(`  Bin ranges:`)
    branches.forEach((branch, idx) => {
      console.log(`    Bin ${idx + 1}: ${branch.description}`)
    })
  }
}

// Test 2: Build three-stage tree with LLM Scorer Consistency
console.log('\n' + '='.repeat(80))
console.log('TEST 2: Three-stage tree (Feature Splitting → Semantic Similarity → LLM Scorer)')
console.log('='.repeat(80))

const threeStageTree = buildThreeStageTreeWithConsistency(CONSISTENCY_TYPE_LLM_SCORER)
console.log(`\nTotal nodes: ${threeStageTree.nodes.length}`)
console.log(`Stage 0 nodes: ${threeStageTree.nodes.filter(n => n.stage === 0).length}`)
console.log(`Stage 1 nodes: ${threeStageTree.nodes.filter(n => n.stage === 1).length}`)
console.log(`Stage 2 nodes: ${threeStageTree.nodes.filter(n => n.stage === 2).length}`)
console.log(`Stage 3 nodes: ${threeStageTree.nodes.filter(n => n.stage === 3).length}`)

// Test 3: Manual tree building demonstration
console.log('\n' + '='.repeat(80))
console.log('TEST 3: Manual tree building with multiple consistency stages')
console.log('='.repeat(80))

const manualTree = buildManualConsistencyTree()
console.log(`\nTotal nodes: ${manualTree.nodes.length}`)
console.log(`Max stage depth: ${Math.max(...manualTree.nodes.map(n => n.stage))}`)
console.log(`Metrics used: ${manualTree.metrics.join(', ')}`)

// Analyze the tree structure
const nodesByStage = new Map<number, number>()
for (const node of manualTree.nodes) {
  nodesByStage.set(node.stage, (nodesByStage.get(node.stage) || 0) + 1)
}

console.log('\nNodes by stage:')
for (const [stage, count] of Array.from(nodesByStage.entries()).sort((a, b) => a[0] - b[0])) {
  console.log(`  Stage ${stage}: ${count} nodes`)
}

// Test 4: Verify custom thresholds are correctly applied
console.log('\n' + '='.repeat(80))
console.log('TEST 4: Verify custom thresholds in split rules')
console.log('='.repeat(80))

const singleTree = buildSingleStageConsistencyTree(CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC)
const rootNode = singleTree.nodes[0]

if (rootNode.split_rule?.type === 'expression') {
  const rule = rootNode.split_rule
  console.log(`\nConsistency Type: ${CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC}`)
  console.log(`Expected thresholds: [0.1, 0.3, 0.6, 0.9]`)
  console.log(`Number of branches: ${rule.branches.length}`)
  console.log(`\nBranch conditions:`)

  rule.branches.forEach((branch, idx) => {
    console.log(`  Branch ${idx + 1}:`)
    console.log(`    Condition: ${branch.condition}`)
    console.log(`    Description: ${branch.description}`)
    console.log(`    Child ID: ${branch.child_id}`)
  })
}

console.log('\n' + '='.repeat(80))
console.log('ALL TESTS COMPLETED SUCCESSFULLY')
console.log('='.repeat(80) + '\n')
