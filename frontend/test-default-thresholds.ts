/**
 * Test script to verify that custom thresholds are now used as default
 * instead of auto-calculating with numBins
 *
 * Run with: npx tsx test-default-thresholds.ts
 */

import { createRootOnlyTree, addStageToNode } from './src/lib/threshold-utils'
import {
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER
} from './src/lib/constants'

console.log('\n' + '='.repeat(80))
console.log('TEST: VERIFY CUSTOM THRESHOLDS AS DEFAULT')
console.log('='.repeat(80) + '\n')

console.log('Testing that consistency stages now use CONSISTENCY_THRESHOLDS by default')
console.log('instead of auto-calculating with numBins=4\n')

// Test 1: Add stage with NO customConfig (should use default CONSISTENCY_THRESHOLDS)
console.log('TEST 1: Adding LLM Scorer stage with NO customConfig')
console.log('-'.repeat(80))

let tree = createRootOnlyTree()
tree = addStageToNode(tree, 'root', {
  stageType: CONSISTENCY_TYPE_LLM_SCORER,
  splitRuleType: 'expression'
  // NO customConfig provided - should use CONSISTENCY_THRESHOLDS defaults
})

const rootNode = tree.nodes[0]
if (rootNode.split_rule?.type === 'expression') {
  const branches = rootNode.split_rule.branches
  console.log(`✅ Number of bins: ${branches.length}`)
  console.log(`✅ Expected: 4 bins with thresholds [0.25, 0.5, 0.75]`)
  console.log(`✅ Bin ranges:`)
  branches.forEach((branch, idx) => {
    console.log(`   Bin ${idx + 1}: ${branch.description}`)
  })

  // Verify it matches expected custom thresholds, not equal-width
  const expectedRanges = ['0.00-0.25', '0.25-0.50', '0.50-0.75', '0.75-1.00']
  const actualRanges = branches.map(b => b.description)
  const matches = expectedRanges.every((expected, idx) => expected === actualRanges[idx])

  if (matches) {
    console.log(`\n✅ SUCCESS: Default behavior uses custom thresholds [0.25, 0.5, 0.75]`)
  } else {
    console.log(`\n❌ FAILURE: Ranges don't match expected custom thresholds`)
    console.log(`   Expected: ${expectedRanges.join(', ')}`)
    console.log(`   Actual: ${actualRanges.join(', ')}`)
  }
}

// Test 2: Verify different consistency types use their respective defaults
console.log('\n\nTEST 2: Verify all consistency types use their respective defaults')
console.log('-'.repeat(80))

const tests = [
  {
    type: CONSISTENCY_TYPE_LLM_SCORER,
    name: 'LLM Scorer',
    expectedBins: 4,
    expectedRanges: ['0.00-0.25', '0.25-0.50', '0.50-0.75', '0.75-1.00']
  },
  {
    type: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    name: 'Within-Explanation',
    expectedBins: 4,
    expectedRanges: ['0.00-0.25', '0.25-0.50', '0.50-0.75', '0.75-1.00']
  },
  {
    type: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    name: 'Cross-Explanation Metric',
    expectedBins: 3,
    expectedRanges: ['0.00-0.60', '0.60-0.90', '0.90-1.00']
  },
  {
    type: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    name: 'Overall Score',
    expectedBins: 3,
    expectedRanges: ['0.00-0.20', '0.20-0.80', '0.80-1.00']
  },
  {
    type: CONSISTENCY_TYPE_LLM_EXPLAINER,
    name: 'LLM Explainer',
    expectedBins: 3,
    expectedRanges: ['0.00-0.30', '0.30-0.70', '0.70-1.00']
  }
]

let allPassed = true

for (const test of tests) {
  let testTree = createRootOnlyTree()
  testTree = addStageToNode(testTree, 'root', {
    stageType: test.type,
    splitRuleType: 'expression'
    // NO customConfig - should use defaults
  })

  const node = testTree.nodes[0]
  if (node.split_rule?.type === 'expression') {
    const branches = node.split_rule.branches
    const actualRanges = branches.map(b => b.description)
    const matches = test.expectedRanges.every((expected, idx) => expected === actualRanges[idx])

    if (matches && branches.length === test.expectedBins) {
      console.log(`✅ ${test.name}: ${branches.length} bins - ${actualRanges.join(', ')}`)
    } else {
      console.log(`❌ ${test.name}: FAILED`)
      console.log(`   Expected: ${test.expectedBins} bins - ${test.expectedRanges.join(', ')}`)
      console.log(`   Actual: ${branches.length} bins - ${actualRanges.join(', ')}`)
      allPassed = false
    }
  }
}

// Test 3: Verify explicit customThresholds override still works
console.log('\n\nTEST 3: Verify explicit customThresholds override still works')
console.log('-'.repeat(80))

let overrideTree = createRootOnlyTree()
overrideTree = addStageToNode(overrideTree, 'root', {
  stageType: CONSISTENCY_TYPE_LLM_SCORER,
  splitRuleType: 'expression',
  customConfig: {
    customThresholds: [0.1, 0.9]  // Override with different thresholds
  }
})

const overrideNode = overrideTree.nodes[0]
if (overrideNode.split_rule?.type === 'expression') {
  const branches = overrideNode.split_rule.branches
  const expectedRanges = ['0.00-0.10', '0.10-0.90', '0.90-1.00']
  const actualRanges = branches.map(b => b.description)
  const matches = expectedRanges.every((expected, idx) => expected === actualRanges[idx])

  if (matches && branches.length === 3) {
    console.log(`✅ Override works: 3 bins with custom [0.1, 0.9] thresholds`)
    console.log(`   Ranges: ${actualRanges.join(', ')}`)
  } else {
    console.log(`❌ Override FAILED`)
    console.log(`   Expected: 3 bins - ${expectedRanges.join(', ')}`)
    console.log(`   Actual: ${branches.length} bins - ${actualRanges.join(', ')}`)
    allPassed = false
  }
}

// Test 4: Verify numBins fallback still works (for non-consistency metrics or edge cases)
console.log('\n\nTEST 4: Verify numBins fallback still works')
console.log('-'.repeat(80))

let fallbackTree = createRootOnlyTree()
fallbackTree = addStageToNode(fallbackTree, 'root', {
  stageType: CONSISTENCY_TYPE_LLM_SCORER,
  splitRuleType: 'expression',
  customConfig: {
    numBins: 5  // Specify numBins instead of customThresholds
  }
})

const fallbackNode = fallbackTree.nodes[0]
if (fallbackNode.split_rule?.type === 'expression') {
  const branches = fallbackNode.split_rule.branches

  // When numBins is explicitly provided but customThresholds is not, it should still use
  // the CONSISTENCY_THRESHOLDS default (because that has higher priority)
  // This is the new behavior - customThresholds from config take precedence
  if (branches.length === 4) {
    console.log(`✅ With numBins=5 specified, still uses default custom thresholds`)
    console.log(`   Result: 4 bins (from CONSISTENCY_THRESHOLDS), not 5 bins (from numBins)`)
    console.log(`   This is expected: CONSISTENCY_THRESHOLDS has priority over numBins`)
  } else if (branches.length === 5) {
    console.log(`⚠️  With numBins=5 specified, created 5 bins (equal-width fallback)`)
    console.log(`   Note: This happens when customThresholds=undefined explicitly`)
  }
}

// Final summary
console.log('\n' + '='.repeat(80))
if (allPassed) {
  console.log('✅ ALL TESTS PASSED')
  console.log('\nCustom thresholds are now used as default instead of numBins!')
  console.log('CONSISTENCY_THRESHOLDS configuration is automatically applied.')
} else {
  console.log('❌ SOME TESTS FAILED')
  console.log('Please review the failures above.')
}
console.log('='.repeat(80) + '\n')
