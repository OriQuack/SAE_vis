import { scaleLinear } from 'd3-scale'
import { max, sum, group } from 'd3-array'
import { linkHorizontal } from 'd3-shape'
import type { AlluvialFlow } from '../types'

// ============================================================================
// TYPES
// ============================================================================

export interface AlluvialLinkData {
  sourceY: number
  targetY: number
}

export interface AlluvialProcessedFlow {
  id: string
  path: string
  strokeWidth: number
  color: string
  opacity: number
  flow: AlluvialFlow
  sourceY: number
  targetY: number
}

export interface AlluvialLayoutData {
  flows: AlluvialProcessedFlow[]
  leftNodes: { id: string; y: number; label: string }[]
  rightNodes: { id: string; y: number; label: string }[]
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
export const ALLUVIAL_STROKE = {
  MAX_WIDTH: 30,
  MIN_WIDTH: 2
}

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
 * Calculate alluvial diagram layout using D3 scales and generators
 * This is a pure function - no DOM manipulation, just calculations
 */
export function calculateAlluvialLayout(
  flows: AlluvialFlow[] | null,
  width: number,
  height: number
): AlluvialLayoutData {
  if (!flows || flows.length === 0) {
    return {
      flows: [],
      leftNodes: [],
      rightNodes: [],
      stats: null
    }
  }

  // Group flows by source and target to get unique nodes
  const sourceGroups = group(flows, d => d.source)
  const targetGroups = group(flows, d => d.target)

  // Calculate total features for each node
  const sourceFeatureCounts = new Map<string, number>()
  const targetFeatureCounts = new Map<string, number>()

  // Aggregate feature counts for each node
  flows.forEach(flow => {
    sourceFeatureCounts.set(flow.source, (sourceFeatureCounts.get(flow.source) || 0) + flow.value)
    targetFeatureCounts.set(flow.target, (targetFeatureCounts.get(flow.target) || 0) + flow.value)
  })

  // Get unique node IDs sorted by their total features (larger nodes at top)
  const sourceNodes = Array.from(sourceGroups.keys()).sort((a, b) =>
    (sourceFeatureCounts.get(b) || 0) - (sourceFeatureCounts.get(a) || 0)
  )
  const targetNodes = Array.from(targetGroups.keys()).sort((a, b) =>
    (targetFeatureCounts.get(b) || 0) - (targetFeatureCounts.get(a) || 0)
  )

  // Calculate available height for stacking
  const availableHeight = height - ALLUVIAL_MARGIN.top - ALLUVIAL_MARGIN.bottom
  const totalSourceFeatures = sum(Array.from(sourceFeatureCounts.values()))
  const totalTargetFeatures = sum(Array.from(targetFeatureCounts.values()))

  // Create stacked node positions with proportional heights
  const sourceNodeData: Array<{
    id: string
    y: number
    height: number
    centerY: number
    featureCount: number
    label: string
  }> = []

  const targetNodeData: Array<{
    id: string
    y: number
    height: number
    centerY: number
    featureCount: number
    label: string
  }> = []

  // Stack source nodes
  let currentSourceY = ALLUVIAL_MARGIN.top
  sourceNodes.forEach(id => {
    const featureCount = sourceFeatureCounts.get(id) || 0
    const nodeHeight = (featureCount / totalSourceFeatures) * availableHeight
    const centerY = currentSourceY + nodeHeight / 2

    sourceNodeData.push({
      id,
      y: currentSourceY,
      height: nodeHeight,
      centerY,
      featureCount,
      label: id.split('_').pop() || id
    })

    currentSourceY += nodeHeight
  })

  // Stack target nodes
  let currentTargetY = ALLUVIAL_MARGIN.top
  targetNodes.forEach(id => {
    const featureCount = targetFeatureCounts.get(id) || 0
    const nodeHeight = (featureCount / totalTargetFeatures) * availableHeight
    const centerY = currentTargetY + nodeHeight / 2

    targetNodeData.push({
      id,
      y: currentTargetY,
      height: nodeHeight,
      centerY,
      featureCount,
      label: id.split('_').pop() || id
    })

    currentTargetY += nodeHeight
  })

  // Create lookup maps for centerY positions
  const sourceCenterYMap = new Map(sourceNodeData.map(node => [node.id, node.centerY]))
  const targetCenterYMap = new Map(targetNodeData.map(node => [node.id, node.centerY]))

  // Scale for stroke width based on feature count
  const maxFlowValue = max(flows, d => d.value) || 1
  const strokeScale = scaleLinear()
    .domain([0, maxFlowValue])
    .range([ALLUVIAL_STROKE.MIN_WIDTH, ALLUVIAL_STROKE.MAX_WIDTH])
    .clamp(true)

  // Create link generator with horizontal curve
  const linkGen = linkHorizontal<AlluvialLinkData>()
    .source(d => [ALLUVIAL_MARGIN.left + ALLUVIAL_NODE_WIDTH, d.sourceY])
    .target(d => [width - ALLUVIAL_MARGIN.right - ALLUVIAL_NODE_WIDTH, d.targetY])

  // Process flows into renderable data
  const processedFlows: AlluvialProcessedFlow[] = flows.map(flow => {
    const sourceY = sourceCenterYMap.get(flow.source) || 0
    const targetY = targetCenterYMap.get(flow.target) || 0
    const strokeWidth = strokeScale(flow.value)
    const isConsistent = flow.sourceCategory === flow.targetCategory
    const color = isConsistent ? ALLUVIAL_COLORS.consistent : ALLUVIAL_COLORS.inconsistent

    // Generate path using D3 link generator
    const pathData = linkGen({ sourceY, targetY } as AlluvialLinkData)

    return {
      id: `${flow.source}-${flow.target}`,
      path: pathData || '',
      strokeWidth,
      color,
      opacity: ALLUVIAL_OPACITY.default,
      flow,
      sourceY,
      targetY
    }
  })

  // Use the enhanced node data with dimensions
  const leftNodes = sourceNodeData.map(node => ({
    id: node.id,
    y: node.y,
    centerY: node.centerY,
    height: node.height,
    featureCount: node.featureCount,
    label: node.label,
    x: ALLUVIAL_MARGIN.left,
    width: ALLUVIAL_NODE_WIDTH
  }))

  const rightNodes = targetNodeData.map(node => ({
    id: node.id,
    y: node.y,
    centerY: node.centerY,
    height: node.height,
    featureCount: node.featureCount,
    label: node.label,
    x: width - ALLUVIAL_MARGIN.right - ALLUVIAL_NODE_WIDTH,
    width: ALLUVIAL_NODE_WIDTH
  }))

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
    flows: processedFlows,
    leftNodes,
    rightNodes,
    stats
  }
}