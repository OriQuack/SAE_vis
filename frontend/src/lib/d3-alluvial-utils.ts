import { sum } from 'd3-array'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type { AlluvialFlow, SankeyNode } from '../types'

// ============================================================================
// TYPES
// ============================================================================

export interface AlluvialSankeyNode {
  id: string
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  label: string
  featureCount: number
  height?: number
  width?: number
}

export interface AlluvialSankeyLink {
  source: AlluvialSankeyNode | number
  target: AlluvialSankeyNode | number
  value: number
  y0?: number
  y1?: number
  width?: number
  flow: AlluvialFlow
  color: string
  opacity: number
  id: string
}

export interface AlluvialLayoutData {
  flows: AlluvialSankeyLink[]
  leftNodes: AlluvialSankeyNode[]
  rightNodes: AlluvialSankeyNode[]
  sankeyGenerator: any // The d3-sankey generator for path creation
  stats: {
    totalFlows: number
    consistentFlows: number
    totalFeatures: number
    consistencyRate: number
  } | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const ALLUVIAL_MARGIN = { top: 50, right: 30, bottom: 50, left: 30 }
export const ALLUVIAL_NODE_WIDTH = 20

export const ALLUVIAL_COLORS = {
  consistent: '#10b981',    // green
  inconsistent: '#f59e0b',  // orange
  hover: '#3b82f6'          // blue
}

export const ALLUVIAL_OPACITY = {
  default: 0.6,
  hover: 0.9,
  inactive: 0.2
}

// ============================================================================
// ALLUVIAL DIAGRAM UTILITIES
// ============================================================================

/**
 * Calculate alluvial diagram layout using d3-sankey
 * This is a pure function - no DOM manipulation, just calculations
 */
export function calculateAlluvialLayout(
  flows: AlluvialFlow[] | null,
  width: number,
  height: number,
  leftSankeyNodes?: SankeyNode[],
  rightSankeyNodes?: SankeyNode[]
): AlluvialLayoutData {
  if (!flows || flows.length === 0) {
    return {
      flows: [],
      leftNodes: [],
      rightNodes: [],
      sankeyGenerator: null,
      stats: null
    }
  }

  // Extract unique source and target nodes from flows
  const sourceFeatureCounts = new Map<string, number>()
  const targetFeatureCounts = new Map<string, number>()

  // Aggregate feature counts for each node
  flows.forEach(flow => {
    sourceFeatureCounts.set(flow.source, (sourceFeatureCounts.get(flow.source) || 0) + flow.value)
    targetFeatureCounts.set(flow.target, (targetFeatureCounts.get(flow.target) || 0) + flow.value)
  })

  // Create node order maps from Sankey data if provided
  const leftNodeOrder = new Map<string, number>()
  const rightNodeOrder = new Map<string, number>()

  if (leftSankeyNodes) {
    // Get only stage 3 nodes and record their order
    leftSankeyNodes
      .filter(n => n.stage === 3)
      .forEach((node, index) => {
        leftNodeOrder.set(node.id, index)
      })
  }

  if (rightSankeyNodes) {
    // Get only stage 3 nodes and record their order
    rightSankeyNodes
      .filter(n => n.stage === 3)
      .forEach((node, index) => {
        rightNodeOrder.set(node.id, index)
      })
  }

  // Create nodes for d3-sankey with unique IDs to prevent circular references
  const nodes: AlluvialSankeyNode[] = []
  const sourceIndexMap = new Map<string, number>()
  const targetIndexMap = new Map<string, number>()

  // Add source nodes (left side) with "left_" prefix, sorted by Sankey order
  let nodeIndex = 0
  const sourceKeys = Array.from(sourceFeatureCounts.keys())

  // Sort source keys based on leftNodeOrder if available
  if (leftNodeOrder.size > 0) {
    sourceKeys.sort((a, b) => {
      const orderA = leftNodeOrder.get(a) ?? 999
      const orderB = leftNodeOrder.get(b) ?? 999
      return orderA - orderB
    })
  }

  sourceKeys.forEach(originalId => {
    const uniqueId = `left_${originalId}`
    const featureCount = sourceFeatureCounts.get(originalId) || 0
    nodes.push({
      id: uniqueId,
      label: originalId.split('_').pop() || originalId,
      featureCount,
      value: featureCount
    })
    sourceIndexMap.set(originalId, nodeIndex++)
  })

  // Add target nodes (right side) with "right_" prefix, sorted by Sankey order
  const targetKeys = Array.from(targetFeatureCounts.keys())

  // Sort target keys based on rightNodeOrder if available
  if (rightNodeOrder.size > 0) {
    targetKeys.sort((a, b) => {
      const orderA = rightNodeOrder.get(a) ?? 999
      const orderB = rightNodeOrder.get(b) ?? 999
      return orderA - orderB
    })
  }

  targetKeys.forEach(originalId => {
    const uniqueId = `right_${originalId}`
    const featureCount = targetFeatureCounts.get(originalId) || 0
    nodes.push({
      id: uniqueId,
      label: originalId.split('_').pop() || originalId,
      featureCount,
      value: featureCount
    })
    targetIndexMap.set(originalId, nodeIndex++)
  })

  // Create links for d3-sankey
  const links: AlluvialSankeyLink[] = flows.map(flow => {
    const sourceIndex = sourceIndexMap.get(flow.source)!
    const targetIndex = targetIndexMap.get(flow.target)!
    const isConsistent = flow.sourceCategory === flow.targetCategory
    const color = isConsistent ? ALLUVIAL_COLORS.consistent : ALLUVIAL_COLORS.inconsistent

    return {
      source: sourceIndex,
      target: targetIndex,
      value: flow.value,
      flow,
      color,
      opacity: ALLUVIAL_OPACITY.default,
      id: `${flow.source}-${flow.target}`
    }
  })

  // Configure d3-sankey
  const sankeyGenerator = sankey<AlluvialSankeyNode, AlluvialSankeyLink>()
    .nodeWidth(ALLUVIAL_NODE_WIDTH)
    .nodePadding(10)
    .extent([
      [ALLUVIAL_MARGIN.left, ALLUVIAL_MARGIN.top],
      [width - ALLUVIAL_MARGIN.right, height - ALLUVIAL_MARGIN.bottom]
    ])
    .nodeAlign((node) => {
      // Force left nodes to left side (x=0) and right nodes to right side (x=1)
      const nodeId = (node as AlluvialSankeyNode).id
      return nodeId.startsWith('left_') ? 0 : 1
    })

  // Calculate the layout
  const sankeyData = sankeyGenerator({
    nodes: nodes.map(n => ({ ...n })), // Create copies to avoid mutation
    links: links.map(l => ({ ...l }))
  })

  // Separate left and right nodes based on their ID prefix
  const leftNodes: AlluvialSankeyNode[] = []
  const rightNodes: AlluvialSankeyNode[] = []

  sankeyData.nodes.forEach(node => {
    const nodeId = (node as AlluvialSankeyNode).id
    if (nodeId.startsWith('left_')) {
      leftNodes.push(node as AlluvialSankeyNode)
    } else {
      rightNodes.push(node as AlluvialSankeyNode)
    }
  })

  // Don't re-sort nodes - keep the order from Sankey layout which preserves our intended order

  // d3-sankey automatically calculates the width property based on value
  // No need for custom strokeWidth scaling - use the calculated width directly

  // Calculate statistics
  const consistentFlows = flows.filter(f => f.sourceCategory === f.targetCategory).length
  const totalFeatures = sum(flows, d => d.value)

  const stats = {
    totalFlows: flows.length,
    consistentFlows,
    totalFeatures,
    consistencyRate: (consistentFlows / flows.length) * 100
  }


  return {
    flows: sankeyData.links as AlluvialSankeyLink[],
    leftNodes,
    rightNodes,
    sankeyGenerator: sankeyLinkHorizontal(),
    stats
  }
}