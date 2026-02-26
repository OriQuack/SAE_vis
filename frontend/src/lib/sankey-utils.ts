import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type {
  D3SankeyNode,
  D3SankeyLink,
  SankeyLayout,
} from '../types'
import {
  UNSURE_GRAY,
  SANKEY_COLORS
} from './constants'
import { getMetricBaseColor } from './color-utils'

// ============================================================================
// UTILS-SPECIFIC TYPES (Internal use only - not exported)
// ============================================================================

export interface ScrollIndicator {
  y: number
  height: number
}

export interface VerticalBarSubNode {
  id: string                  // e.g., "llama", "qwen", "openai", or "feature_{featureId}"
  modelName: string          // Display name (e.g., "Llama", "Qwen", "GPT", or "Feature {featureId}")
  x: number                  // Left edge x-coordinate
  y: number                  // Top edge y-coordinate
  width: number              // Bar width
  height: number             // Line/bar height
  color: string              // Line/bar color
  selected: boolean          // Whether this explainer is selected
  featureId?: number         // Feature ID (for feature line rendering)
  selectionState?: 'selected' | 'rejected' | null  // Feature selection state
}

export interface VerticalBarNodeLayout {
  node: D3SankeyNode         // Original Sankey node
  subNodes: VerticalBarSubNode[]  // Vertical bar (single bar)
  scrollIndicator: ScrollIndicator | null  // Global scroll indicator
  totalWidth: number         // Total width of the bar
  totalHeight: number        // Total height
}

// Segment for stage-based vertical bars (progressive reveal)
export interface StageSegment {
  childNodeId: string        // Child's node ID in the tree
  y: number                  // Top edge y-coordinate
  height: number             // Segment height (proportional to features)
  color: string              // Child's hierarchical color
  featureCount: number       // Features in this child
  label: string              // Child's rangeLabel
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_ANIMATION = {
  duration: 300,
  easing: 'ease-out'
} as const

const DEFAULT_SANKEY_MARGIN = { top: 10, right: 30, bottom: 20, left: 10 } as const
export const RIGHT_SANKEY_MARGIN = { top: 80, right: 80, bottom: 50, left: 120 } as const

// Validation constants
const MIN_CONTAINER_HEIGHT = 250

// Link opacity constants (0-1 range)
export const LINK_OPACITY = {
  DEFAULT: 0.35,   // 35% opacity for normal links
  HOVER: 0.28      // 28% opacity for hovered links
} as const

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Apply opacity to a hex color
 * @param hexColor - Base color in hex format (e.g., "#ff0000")
 * @param opacity - Opacity value (0-1 range)
 * @returns Color with opacity as hex (e.g., "#ff000059")
 */
export function applyOpacity(hexColor: string, opacity: number): string {
  const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0')
  return `${hexColor}${opacityHex}`
}

// ============================================================================
// MAIN SANKEY CALCULATION
// ============================================================================

/**
 * Calculate Sankey layout from pre-converted D3 data.
 * Runs D3 sankey generator at the given dimensions.
 *
 * Node order is controlled by insertion order from sankey-builder.ts
 * (nodeSort(null) preserves it). Link sort prevents visual crossing
 * when multiple sources share the same target.
 */
export function calculateSankeyLayout(
  sankeyData: any,
  layoutWidth?: number,
  layoutHeight?: number,
  customMargin?: { top: number; right: number; bottom: number; left: number }
): SankeyLayout {
  if (!sankeyData?.nodes || !sankeyData?.links) {
    throw new Error('Invalid sankey data: missing nodes or links')
  }

  const margin = customMargin || DEFAULT_SANKEY_MARGIN
  const width = (layoutWidth ?? 800) - margin.left - margin.right
  const height = (layoutHeight ?? 800) - margin.top - margin.bottom

  // Build reference sets and maps for efficiency
  const referencedNodeIds = new Set<string>()

  // Process links once to build reference set
  for (const link of sankeyData.links) {
    const sourceId = typeof link.source === 'object' ? String(link.source?.id) : String(link.source)
    const targetId = typeof link.target === 'object' ? String(link.target?.id) : String(link.target)
    referencedNodeIds.add(sourceId)
    referencedNodeIds.add(targetId)
  }

  // Filter nodes efficiently
  const filteredNodes = sankeyData.nodes.filter((node: any) => {
    const nodeId = String(node.id)
    return referencedNodeIds.has(nodeId) || (node.feature_count || 0) > 0
  })

  // Create node ID map for quick lookup
  const nodeIdMap = new Map<string, number>()
  filteredNodes.forEach((node: any, index: number) => {
    nodeIdMap.set(String(node.id), index)
  })

  // Transform links: convert string IDs to indices
  const transformedLinks: any[] = []

  for (const link of sankeyData.links) {
    const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
    const targetId = typeof link.target === 'object' ? link.target?.id : link.target

    const sourceIndex = typeof sourceId === 'number' ? sourceId : nodeIdMap.get(String(sourceId))
    const targetIndex = typeof targetId === 'number' ? targetId : nodeIdMap.get(String(targetId))

    if (sourceIndex === undefined || targetIndex === undefined) {
      console.warn(`Skipping invalid link: ${sourceId} -> ${targetId}`)
      continue
    }

    transformedLinks.push({
      ...link,
      source: sourceIndex,
      target: targetIndex
    })
  }

  // Validate data
  if (filteredNodes.length === 0) {
    throw new Error('No valid nodes found for Sankey diagram')
  }

  // Allow 1-node (root-only) or 2-node (root + vertical_bar) cases with no links
  if (transformedLinks.length === 0 && filteredNodes.length > 2) {
    throw new Error('No valid links found for Sankey diagram')
  }

  // Prepare nodes: convert feature_ids to featureIds Set
  const nodesWithOrder = filteredNodes.map((node: D3SankeyNode) => ({
    ...node,
    featureIds: node.feature_ids ? new Set(node.feature_ids) : undefined,
    stage: node.stage ?? 0
  }))

  // Link sort: prevent visual crossing when multiple sources share a target
  const linkSort = (a: D3SankeyLink, b: D3SankeyLink) => {
    if (!a || !b) return 0

    const sourceA = a.source as D3SankeyNode
    const sourceB = b.source as D3SankeyNode
    const targetA = a.target as D3SankeyNode
    const targetB = b.target as D3SankeyNode

    if (!sourceA || !sourceB || !targetA || !targetB) return 0

    // When links share the same target, sort by source stage (descending)
    if (targetA.id && targetA.id === targetB.id) {
      const stageA = sourceA.stage ?? 0
      const stageB = sourceB.stage ?? 0
      if (stageA !== stageB) {
        return stageB - stageA  // Higher stage first → connects at top of target
      }
    }

    // Sort by source node index
    if (sourceA.index !== sourceB.index) {
      return (sourceA.index ?? 0) - (sourceB.index ?? 0)
    }

    // Within same source, sort by target node index
    return (targetA.index ?? 0) - (targetB.index ?? 0)
  }

  // Create D3 sankey generator
  // Default nodeSort (undefined) lets D3 optimize vertical ordering via relaxation
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(20)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 1]])
    .nodeAlign((node: D3SankeyNode) => node.stage || 0)
    .linkSort(linkSort as any)

  // Process the data
  const sankeyLayout = sankeyGenerator({
    nodes: nodesWithOrder,
    links: transformedLinks
  })

  // Expand width of vertical bar nodes (3x for better visibility)
  const nodeWidth = 15
  sankeyLayout.nodes.forEach(node => {
    if (node.node_type === 'vertical_bar' && node.x0 !== undefined && node.x1 !== undefined) {
      const newWidth = nodeWidth * 3
      node.x1 = node.x0 + newWidth
    }
  })

  // Handle special cases where d3-sankey can't position nodes properly
  if (sankeyLayout.links.length === 0) {
    if (sankeyLayout.nodes.length === 1) {
      // Single-node case (root-only tree)
      const singleNode = sankeyLayout.nodes[0]
      const nodeHeight = Math.min(200, height * 0.8)

      const leftMargin = 20
      singleNode.x0 = leftMargin
      singleNode.x1 = singleNode.x0 + nodeWidth
      singleNode.y0 = (height - nodeHeight) / 2
      singleNode.y1 = singleNode.y0 + nodeHeight
    } else if (sankeyLayout.nodes.length === 2) {
      // Two-node case (root + vertical_bar placeholder)
      const [rootNode, verticalBarNode] = sankeyLayout.nodes
      const nodeHeight = Math.min(200, height * 0.8)

      const leftMargin = 20
      rootNode.x0 = leftMargin
      rootNode.x1 = rootNode.x0 + nodeWidth
      rootNode.y0 = (height - nodeHeight) / 2
      rootNode.y1 = rootNode.y0 + nodeHeight

      const rightMargin = 20
      const verticalBarWidth = nodeWidth * 6
      verticalBarNode.x0 = width - rightMargin - verticalBarWidth
      verticalBarNode.x1 = verticalBarNode.x0 + verticalBarWidth
      verticalBarNode.y0 = (height - nodeHeight) / 2
      verticalBarNode.y1 = verticalBarNode.y0 + nodeHeight
    }
  }

  return {
    nodes: sankeyLayout.nodes,
    links: sankeyLayout.links,
    width,
    height,
    margin
  }
}


export function getSankeyPath(link: D3SankeyLink): string {
  return sankeyLinkHorizontal()(link) || ''
}

export function getNodeColor(node: D3SankeyNode): string {
  // Use hierarchical color from HierarchicalColorAssigner (preferred)
  if (node.colorHex) {
    return node.colorHex
  }

  // Fallback to metric-based coloring for backward compatibility
  const metric = node.metric

  if (metric) {
    return getMetricBaseColor(metric)
  }

  // Final fallback for nodes without colors or metrics
  return '#6b7280' // Default gray
}

/**
 * Get the base color for a link (without opacity)
 * Returns a fixed neutral gray color for all links for visual consistency
 */
export function getLinkColor(_link: D3SankeyLink): string {
  return SANKEY_COLORS.LINK_COLOR
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate container dimensions
 */
export function validateDimensions(_width: number, height: number): string[] {
  const errors: string[] = []
  if (height < MIN_CONTAINER_HEIGHT) errors.push(`Container height must be at least ${MIN_CONTAINER_HEIGHT}px`)
  return errors
}

/**
 * Validate Sankey data structure
 */
export function validateSankeyData(data: any): string[] {
  if (!data) return ['Sankey data is required']
  if (!data.nodes || !Array.isArray(data.nodes)) return ['Sankey data must contain nodes array']
  if (!data.links || !Array.isArray(data.links)) return ['Sankey data must contain links array']

  const errors: string[] = []

  // Allow 1-node (root-only) or 2-node (root + vertical_bar) cases with no links
  if (data.nodes.length > 0 && data.links.length > 0) {
    // Build node ID map
    const nodeIdToIndex = new Map<string, number>()
    data.nodes.forEach((node: any, index: number) => {
      nodeIdToIndex.set(String(node.id), index)
    })

    // Validate links
    const referencedNodeIndices = new Set<number>()
    const linksByTarget = new Map<number, boolean>()

    for (let i = 0; i < data.links.length; i++) {
      const link = data.links[i]
      const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
      const targetId = typeof link.target === 'object' ? link.target?.id : link.target

      const sourceIndex = typeof sourceId === 'number' ? sourceId : nodeIdToIndex.get(String(sourceId))
      const targetIndex = typeof targetId === 'number' ? targetId : nodeIdToIndex.get(String(targetId))

      if (sourceIndex === undefined) {
        errors.push(`Link ${i} references missing source node: "${sourceId}"`)
      } else {
        referencedNodeIndices.add(sourceIndex)
      }

      if (targetIndex === undefined) {
        errors.push(`Link ${i} references missing target node: "${targetId}"`)
      } else {
        referencedNodeIndices.add(targetIndex)
        linksByTarget.set(targetIndex, true)
      }
    }

    // Check for circular dependencies (no root nodes)
    if (errors.length === 0 && referencedNodeIndices.size === data.nodes.length &&
        linksByTarget.size === data.nodes.length) {
      errors.push('No root nodes found - all nodes have incoming links, creating circular dependencies')
    }
  }

  return errors
}

// ============================================================================
// LAYOUT TRANSFORMATIONS
// ============================================================================

/**
 * Apply right-to-left flow transformation to layout
 */
export function applyRightToLeftTransform(
  layout: SankeyLayout,
  width: number
): SankeyLayout {
  const innerWidth = width - layout.margin.left - layout.margin.right
  const nodeMap = new Map<D3SankeyNode, D3SankeyNode>()

  // Transform nodes with mirrored x positions
  const transformedNodes = layout.nodes.map(node => {
    const transformedNode = {
      ...node,
      x0: innerWidth - (node.x1 || 0),
      x1: innerWidth - (node.x0 || 0)
    }
    nodeMap.set(node, transformedNode)
    return transformedNode
  })

  // Update links to reference transformed nodes
  const transformedLinks = layout.links.map(link => {
    const sourceNode = typeof link.source === 'object' ? link.source : layout.nodes[link.source as number]
    const targetNode = typeof link.target === 'object' ? link.target : layout.nodes[link.target as number]

    return {
      ...link,
      source: nodeMap.get(sourceNode) || sourceNode,
      target: nodeMap.get(targetNode) || targetNode
    }
  })

  return {
    nodes: transformedNodes,
    links: transformedLinks,
    width: layout.width,
    height: layout.height,
    margin: layout.margin
  }
}

// ============================================================================
// VERTICAL BAR NODE UTILITIES
// ============================================================================


const BAR_COLOR = UNSURE_GRAY  // Centralized unsure/untagged color

/**
 * Calculate layout for a vertical bar node within Sankey diagram
 *
 * Creates individual horizontal lines for each feature, colored by selection state
 * with a scroll indicator showing the current table viewport position
 */
export function calculateVerticalBarNodeLayout(
  node: D3SankeyNode,
  scrollState?: { scrollTop: number; scrollHeight: number; clientHeight: number; visibleFeatureIds?: Set<number> } | null,
  featureSelectionStates?: Map<number, 'selected' | 'rejected'> | null,
  tableSortedFeatureIds?: number[] | null
): VerticalBarNodeLayout {
  if (node.x0 === undefined || node.x1 === undefined ||
      node.y0 === undefined || node.y1 === undefined) {
    throw new Error('Sankey node missing position information')
  }

  const totalWidth = node.x1 - node.x0
  const totalHeight = node.y1 - node.y0

  // Get features from node
  const nodeFeatureIds = node.featureIds || new Set<number>()
  const featureCount = nodeFeatureIds.size

  // Create individual lines for each feature
  const subNodes: VerticalBarSubNode[] = []

  if (featureCount > 0 && tableSortedFeatureIds && tableSortedFeatureIds.length > 0) {
    // Filter sorted features to only include features in this node
    const orderedFeatures = tableSortedFeatureIds.filter(fid => nodeFeatureIds.has(fid))

    // Calculate height per feature line
    const lineHeight = totalHeight / orderedFeatures.length

    orderedFeatures.forEach((featureId, index) => {
      // Get selection state
      const selectionState = featureSelectionStates?.get(featureId) || null

      // Use hierarchical color from parent node (preferred), fallback to default
      const color = node.colorHex || BAR_COLOR

      subNodes.push({
        id: `feature-${featureId}`,
        modelName: `Feature ${featureId}`,
        x: node.x0!,
        y: node.y0! + (index * lineHeight),
        width: totalWidth,
        height: lineHeight,
        color,
        selected: selectionState === 'selected',
        featureId,
        selectionState
      })
    })
  } else {
    // Fallback: create single bar if no feature data available
    const color = node.colorHex || BAR_COLOR

    subNodes.push({
      id: 'vertical-bar',
      modelName: 'Vertical Bar',
      x: node.x0!,
      y: node.y0!,
      width: totalWidth,
      height: totalHeight,
      color,
      selected: true
    })
  }

  // Calculate scroll indicator based on table viewport position
  let scrollIndicator: ScrollIndicator | null = null

  if (scrollState && scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
    const scrollPercent = scrollState.scrollTop / scrollState.scrollHeight
    const viewportPercent = scrollState.clientHeight / scrollState.scrollHeight

    const startPercent = scrollPercent
    const endPercent = Math.min(1.0, scrollPercent + viewportPercent)

    scrollIndicator = {
      y: node.y0! + (startPercent * totalHeight),
      height: (endPercent - startPercent) * totalHeight
    }
  }

  return {
    node,
    subNodes,
    scrollIndicator,
    totalWidth,
    totalHeight
  }
}

// ============================================================================
// D3 FORMAT CONVERSION
// ============================================================================

/**
 * Convert SankeyStructure to D3-compatible node/link format WITHOUT running D3 layout.
 * Returns nodes with string source/target IDs — no positions computed.
 * The actual D3 layout is run once by calculateSankeyLayout() in the component.
 */
export function convertStructureToD3Nodes(
  structure: any  // SankeyStructure from types
): { nodes: D3SankeyNode[], links: D3SankeyLink[] } {
  // Helper: Convert node to D3 format
  function convertNode(node: any, stage: number): any {
    const baseNode: any = {
      id: node.id,
      name: node.tagName || node.id,
      stage,
      depth: node.depth,
      feature_count: node.featureCount,
      category: 'root',
      feature_ids: Array.from(node.featureIds),
      colorHex: node.color
    }

    if (node.type === 'segment' || node.type === 'terminal') {
      baseNode.node_type = 'vertical_bar'
    } else {
      baseNode.node_type = 'standard'
    }

    if (node.type === 'segment') {
      baseNode.metric = node.metric
    }

    return baseNode
  }

  // 1. Convert nodes
  const nodes: D3SankeyNode[] = structure.nodes.map((node: any) => {
    let stage: number
    if (node.id === 'root') {
      stage = 0
    } else if (node.type === 'terminal') {
      stage = structure.currentStage
    } else {
      stage = node.depth
    }
    return convertNode(node, stage)
  })

  // 2. Convert links (keep string source/target IDs)
  const links: D3SankeyLink[] = structure.links.map((link: any) => ({
    source: link.source,
    target: link.target,
    value: link.value
  }))

  return { nodes, links }
}
