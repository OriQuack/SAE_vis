import { sum } from 'd3-array'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type { AlluvialFlow, D3SankeyNode, AlluvialSankeyNode, AlluvialSankeyLink, AlluvialLayoutData } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================
export const ALLUVIAL_MARGIN = { top: 80, right: 2, bottom: 50, left: 2 }
const ALLUVIAL_NODE_WIDTH = 20

const ALLUVIAL_COLORS = {
  trivial: '#10b981',
  minor: '#60a5fa',
  moderate: '#fb923c',
  major: '#ef4444',
  differentStage: '#9ca3af',
  hover: '#3b82f6',
  consistent: '#10b981',
  inconsistent: '#ef4444'
} as const

const ALLUVIAL_OPACITY = {
  default: 0.6,
  hover: 0.9,
  inactive: 0.2
} as const

// ============================================================================
// ALLUVIAL DIAGRAM UTILITIES
// ============================================================================

/**
 * Calculate the triviality level of a connection between two nodes
 * Returns: 'trivial', 'minor', 'moderate', or 'major'
 */
function calculateTrivialityLevel(sourceId: string, targetId: string): 'trivial' | 'minor' | 'moderate' | 'major' {
  // Extract the meaningful part of node IDs (last segments after splitting by underscore)
  const getNodeType = (id: string): string => {
    // For feature splitting: "split_true" or "split_false" -> extract "true"/"false"
    if (id.includes('split_true') || id === 'True') return 'true'
    if (id.includes('split_false') || id === 'False') return 'false'

    // For semantic distance: contains "high" or "low"
    if (id.toLowerCase().includes('semdist_high') || id === 'High') return 'high'
    if (id.toLowerCase().includes('semdist_low') || id === 'Low') return 'low'

    // For score agreement: extract pattern
    const allHighMatch = id.match(/all_\d+_high/)
    if (allHighMatch) return 'all_high'

    const allLowMatch = id.match(/all_\d+_low/)
    if (allLowMatch) return 'all_low'

    const kOfNHighMatch = id.match(/(\d+)_of_\d+_high/)
    if (kOfNHighMatch) {
      const k = parseInt(kOfNHighMatch[1])
      return `${k}_high`
    }

    const kOfNLowMatch = id.match(/(\d+)_of_\d+_low/)
    if (kOfNLowMatch) {
      const k = parseInt(kOfNLowMatch[1])
      return `${k}_low`
    }

    return id
  }

  const sourceType = getNodeType(sourceId)
  const targetType = getNodeType(targetId)

  // Exact match - trivial
  if (sourceType === targetType) {
    return 'trivial'
  }

  // Feature splitting or semantic distance: different values - major
  if ((sourceType === 'true' && targetType === 'false') ||
      (sourceType === 'false' && targetType === 'true') ||
      (sourceType === 'high' && targetType === 'low') ||
      (sourceType === 'low' && targetType === 'high')) {
    return 'major'
  }

  // Score agreement: calculate difference
  if (sourceType.includes('high') || sourceType.includes('low')) {
    // Parse score agreement levels
    const getScoreLevel = (type: string): number => {
      if (type === 'all_high') return 3  // All scores high
      if (type === 'all_low') return 0   // All scores low
      const match = type.match(/^(\d+)_(high|low)$/)
      if (match) {
        const k = parseInt(match[1])
        return match[2] === 'high' ? k : (3 - k)  // Normalize to 0-3 scale
      }
      return 1.5  // Default middle value
    }

    const sourceLevel = getScoreLevel(sourceType)
    const targetLevel = getScoreLevel(targetType)
    const difference = Math.abs(sourceLevel - targetLevel)

    if (difference === 0) return 'trivial'
    if (difference === 1) return 'minor'
    if (difference === 2) return 'moderate'
    return 'major'
  }

  // Default: moderate
  return 'moderate'
}

/**
 * Calculate alluvial diagram layout using d3-sankey
 * This is a pure function - no DOM manipulation, just calculations
 */
export function calculateAlluvialLayout(
  flows: AlluvialFlow[] | null,
  width: number,
  height: number,
  leftSankeyNodes?: D3SankeyNode[],
  rightSankeyNodes?: D3SankeyNode[]
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

  // Create node order and position maps from Sankey data if provided
  // Extract leaf nodes and sort by middle position (top to bottom)
  const leftNodeOrder = new Map<string, number>()
  const rightNodeOrder = new Map<string, number>()
  const leftNodePositions = new Map<string, { y0: number; y1: number; yMid: number }>()
  const rightNodePositions = new Map<string, { y0: number; y1: number; yMid: number }>()

  if (leftSankeyNodes) {
    const nodesInFlows = leftSankeyNodes
      .filter(n => {
        const hasPosition = 'y0' in n && 'y1' in n
        const isInFlows = sourceFeatureCounts.has(n.id)
        return hasPosition && isInFlows
      })

    // Sort by middle position (y0 + y1) / 2
    nodesInFlows.sort((a, b) => {
      const aMid = ((a.y0 as number) + (a.y1 as number)) / 2
      const bMid = ((b.y0 as number) + (b.y1 as number)) / 2
      return aMid - bMid
    })

    nodesInFlows.forEach((node, index) => {
      const yMid = ((node.y0 as number) + (node.y1 as number)) / 2
      leftNodeOrder.set(node.id, index)
      leftNodePositions.set(node.id, {
        y0: node.y0 as number,
        y1: node.y1 as number,
        yMid
      })
    })
  }

  if (rightSankeyNodes) {
    const nodesInFlows = rightSankeyNodes
      .filter(n => {
        const hasPosition = 'y0' in n && 'y1' in n
        const isInFlows = targetFeatureCounts.has(n.id)
        return hasPosition && isInFlows
      })

    // Sort by middle position (y0 + y1) / 2
    nodesInFlows.sort((a, b) => {
      const aMid = ((a.y0 as number) + (a.y1 as number)) / 2
      const bMid = ((b.y0 as number) + (b.y1 as number)) / 2
      return aMid - bMid
    })

    nodesInFlows.forEach((node, index) => {
      const yMid = ((node.y0 as number) + (node.y1 as number)) / 2
      rightNodeOrder.set(node.id, index)
      rightNodePositions.set(node.id, {
        y0: node.y0 as number,
        y1: node.y1 as number,
        yMid
      })
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

  // Create links for d3-sankey with triviality-based coloring
  const links: AlluvialSankeyLink[] = flows.map(flow => {
    const sourceIndex = sourceIndexMap.get(flow.source)!
    const targetIndex = targetIndexMap.get(flow.target)!

    // Check if source and target are from different stages (different categories)
    // If so, use gray color to indicate inconsistent classification
    let color: string
    if (flow.sourceCategory !== flow.targetCategory) {
      color = ALLUVIAL_COLORS.differentStage
    } else {
      // Same stage - calculate triviality level and assign color based on consistency
      const trivialityLevel = calculateTrivialityLevel(flow.source, flow.target)
      color = ALLUVIAL_COLORS[trivialityLevel]
    }

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

  // Configure d3-sankey with fixed node ordering based on Sankey positions
  // Note: We use 0,0 as the starting point since margins will be applied via transform in the component
  const sankeyGenerator = sankey<AlluvialSankeyNode, AlluvialSankeyLink>()
    .nodeWidth(ALLUVIAL_NODE_WIDTH)
    .nodePadding(10)
    .extent([
      [0, 0],
      [width - ALLUVIAL_MARGIN.left - ALLUVIAL_MARGIN.right, height - ALLUVIAL_MARGIN.top - ALLUVIAL_MARGIN.bottom]
    ])
    .nodeAlign((node) => {
      // Force left nodes to left side (x=0) and right nodes to right side (x=1)
      const nodeId = (node as AlluvialSankeyNode).id
      return nodeId.startsWith('left_') ? 0 : 1
    })
    .nodeSort((a, b) => {
      // Sort by middle position-based order indices from Sankey (with yMid fallback)
      const aNode = a as AlluvialSankeyNode
      const bNode = b as AlluvialSankeyNode
      const aOriginalId = aNode.id.replace(/^(left_|right_)/, '')
      const bOriginalId = bNode.id.replace(/^(left_|right_)/, '')

      if (aNode.id.startsWith('left_')) {
        // Primary: Use middle position-based order indices
        const aOrder = leftNodeOrder.get(aOriginalId)
        const bOrder = leftNodeOrder.get(bOriginalId)
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder
        }

        // Fallback: Use middle positions (yMid) directly
        const aPos = leftNodePositions.get(aOriginalId)
        const bPos = leftNodePositions.get(bOriginalId)
        if (aPos && bPos) {
          return aPos.yMid - bPos.yMid
        }
      } else {
        // Primary: Use middle position-based order indices
        const aOrder = rightNodeOrder.get(aOriginalId)
        const bOrder = rightNodeOrder.get(bOriginalId)
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder
        }

        // Fallback: Use middle positions (yMid) directly
        const aPos = rightNodePositions.get(aOriginalId)
        const bPos = rightNodePositions.get(bOriginalId)
        if (aPos && bPos) {
          return aPos.yMid - bPos.yMid
        }
      }
      return 0
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

// ============================================================================
// NODE COLOR UTILITIES
// ============================================================================

/**
 * Get node color based on label pattern
 * Centralized logic for consistent node coloring
 */
export function getNodeColor(label: string): string {
  if (label === 'all' || label.includes('all_') && label.includes('_high')) return '#10b981'
  if (label === 'none' || label.includes('all_') && label.includes('_low')) return '#f59e0b'
  if (label.includes('1_of_') || label.includes('1of')) return '#ef4444'
  if (label.includes('2_of_') || label.includes('2of')) return '#f97316'
  return '#6b7280'
}

/**
 * Get node style properties based on hover state
 */
export function getNodeStyle(isHovered: boolean) {
  return {
    fillOpacity: isHovered ? 0.9 : 0.7,
    strokeWidth: isHovered ? 2 : 0.5,
    strokeColor: isHovered ? '#ffffff' : '#374151'
  }
}

// ============================================================================
// FLOW INTERACTION UTILITIES
// ============================================================================

/**
 * Get connected flow IDs for a hovered node
 */
export function getConnectedFlowIds(
  nodeId: string | null,
  flows: AlluvialSankeyLink[]
): Set<string> {
  if (!nodeId) return new Set<string>()

  const linkIds = new Set<string>()
  flows.forEach(flow => {
    const sourceId = typeof flow.source === 'object' ? flow.source.id : flow.source
    const targetId = typeof flow.target === 'object' ? flow.target.id : flow.target

    if (sourceId === nodeId || targetId === nodeId) {
      linkIds.add(flow.id)
    }
  })

  return linkIds
}

/**
 * Calculate flow opacity based on hover states
 */
export function getFlowOpacity(
  isFlowHovered: boolean,
  isConnectedToNode: boolean,
  hoveredFlowId: string | null,
  hoveredNodeId: string | null,
  defaultOpacity: number
): number {
  if (isFlowHovered || isConnectedToNode) {
    return ALLUVIAL_OPACITY.hover
  }

  if (hoveredFlowId || hoveredNodeId) {
    return ALLUVIAL_OPACITY.inactive
  }

  return defaultOpacity
}

// ============================================================================
// LEGEND DATA
// ============================================================================

export const ALLUVIAL_LEGEND_ITEMS = [
  { color: ALLUVIAL_COLORS.trivial, label: 'Trivial' },
  { color: ALLUVIAL_COLORS.minor, label: 'Minor' },
  { color: ALLUVIAL_COLORS.moderate, label: 'Moderate' },
  { color: ALLUVIAL_COLORS.major, label: 'Major' },
  { color: ALLUVIAL_COLORS.differentStage, label: 'Different Stage' }
] as const