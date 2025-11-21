import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type {
  D3SankeyNode,
  D3SankeyLink,
  SankeyLayout,
} from '../types'
import {
  CATEGORY_DECODER_SIMILARITY,
  CATEGORY_SEMANTIC_SIMILARITY
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
  modelName: string          // Display name (e.g., "Llama", "Qwen", "OpenAI", or "Feature {featureId}")
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
const MIN_CONTAINER_WIDTH = 200
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

/**
 * D3-sankey node alignment function that respects actual stage positions
 */
function stageBasedAlign(node: D3SankeyNode): number {
  // Return the stage directly (it's already an integer from tree structure)
  return node.stage || 0
}

/**
 * Extract parent ID from a node ID by removing the last component
 */
function extractParentId(nodeId: string): string {
  if (nodeId === 'root') return ''

  const parts = nodeId.split('_')

  // For range splits (ending with numbers), remove the last part
  if (/^\d+$/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join('_')
  }

  // Fallback: remove last component
  return parts.slice(0, -1).join('_')
}

/**
 * Get category-specific sort order within the same parent
 */
function getCategorySortOrder(nodeId: string, category: string): number {
  switch (category) {
    case CATEGORY_DECODER_SIMILARITY:
      // decoder_similarity_0 (False) before decoder_similarity_1 (True)
      return nodeId.includes('_0') ? 0 : 1

    case CATEGORY_SEMANTIC_SIMILARITY:
      // semsim_mean_0 (Low) before semsim_mean_1 (High)
      return nodeId.includes('_0') ? 0 : 1
      
      default:
        return 0
      }
    }
    
// ============================================================================
// MAIN SANKEY CALCULATION
// ============================================================================

/**
 * Calculate Sankey layout from data
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

  // Transform links efficiently
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

  // Prepare nodes with original index for sorting
  // Also convert feature_ids to featureIds for consistency
  const nodesWithOrder = filteredNodes.map((node: D3SankeyNode, index: number) => ({
    ...node,
    originalIndex: index,
    // Convert snake_case feature_ids to camelCase featureIds if it exists
    featureIds: node.feature_ids ? new Set(node.feature_ids) : undefined,
    // stage is already an integer from the tree structure
    stage: node.stage ?? 0
  }))

  // Build parent-child relationships
  const nodeMap = new Map<string, D3SankeyNode>()
  const childToParentMap = new Map<string, string>()

  nodesWithOrder.forEach((node: D3SankeyNode) => {
    if (node.id) nodeMap.set(node.id, node)
  })

  transformedLinks.forEach(link => {
    const targetId = typeof link.target === 'number' ? filteredNodes[link.target]?.id : link.target
    const sourceId = typeof link.source === 'number' ? filteredNodes[link.source]?.id : link.source
    if (targetId && sourceId) {
      childToParentMap.set(String(targetId), String(sourceId))
    }
  })

  /**
   * Get the originalIndex of the stage-1 ancestor (first child of root).
   * This groups terminal nodes by their subtree for proper visual ordering.
   */
  const getStage1AncestorIndex = (
    node: D3SankeyNode,
    nodeMap: Map<string, D3SankeyNode>,
    childToParentMap: Map<string, string>
  ): number => {
    let current = node

    // Walk up the tree until we find a node whose parent is root
    while (current) {
      const parentId = childToParentMap.get(current.id || '') || extractParentId(current.id || '')

      if (parentId === 'root') {
        // current is a direct child of root (stage-1 ancestor)
        return current.originalIndex ?? 0
      }

      const parent = nodeMap.get(parentId)
      if (!parent) break

      current = parent
    }

    // Fallback for root node itself
    return 0
  }

  // Node sorting function
  const smartNodeSort = (a: D3SankeyNode, b: D3SankeyNode) => {
    // Ensure nodes are defined
    if (!a || !b) {
      console.warn('Undefined node in sort comparison', { a, b })
      return 0
    }

    // Sort by stage first
    const stageA = a.stage ?? 0
    const stageB = b.stage ?? 0
    if (stageA !== stageB) {
      return stageA - stageB
    }

    // Within same stage, sort by stage-1 ancestor to group by subtree
    const ancestorIndexA = getStage1AncestorIndex(a, nodeMap, childToParentMap)
    const ancestorIndexB = getStage1AncestorIndex(b, nodeMap, childToParentMap)

    if (ancestorIndexA !== ancestorIndexB) {
      return ancestorIndexA - ancestorIndexB
    }

    // Within same subtree, sort by depth (deeper nodes first)
    if (a.depth !== b.depth) {
      return (b.depth || 0) - (a.depth || 0)  // Descending: 3 → 2 → 1
    }

    // Same subtree and depth: sort by immediate parent's originalIndex
    const parentA = childToParentMap.get(a.id || '') || extractParentId(a.id || '')
    const parentB = childToParentMap.get(b.id || '') || extractParentId(b.id || '')

    if (parentA !== parentB) {
      const parentNodeA = nodeMap.get(parentA)
      const parentNodeB = nodeMap.get(parentB)

      if (parentNodeA && parentNodeB) {
        return (parentNodeA.originalIndex ?? 0) - (parentNodeB.originalIndex ?? 0)
      }

      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0)
    }

    // Same parent and category: apply category-specific sorting
    if (a.category === b.category && a.category) {
      const sortOrderA = getCategorySortOrder(a.id || '', a.category)
      const sortOrderB = getCategorySortOrder(b.id || '', b.category)

      if (sortOrderA !== sortOrderB) {
        return sortOrderA - sortOrderB
      }
    }

    // Final fallback to original order
    return (a.originalIndex ?? 0) - (b.originalIndex ?? 0)
  }

  // Link sorting function
  const linkSort = (a: D3SankeyLink, b: D3SankeyLink) => {
    // Ensure links are defined
    if (!a || !b) {
      console.warn('Undefined link in sort comparison', { a, b })
      return 0
    }

    const sourceA = a.source as D3SankeyNode
    const sourceB = b.source as D3SankeyNode
    const targetA = a.target as D3SankeyNode
    const targetB = b.target as D3SankeyNode

    // Ensure source/target nodes are defined
    if (!sourceA || !sourceB || !targetA || !targetB) {
      console.warn('Undefined node in link sort', { sourceA, sourceB, targetA, targetB })
      return 0
    }

    // Sort by source node index
    if (sourceA.index !== sourceB.index) {
      return (sourceA.index ?? 0) - (sourceB.index ?? 0)
    }

    // Within same source, sort by target node index
    return (targetA.index ?? 0) - (targetB.index ?? 0)
  }

  // Create D3 sankey generator
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(20)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 1]])
    .nodeAlign(stageBasedAlign)
    .nodeSort(smartNodeSort as any)
    .linkSort(linkSort as any)

  // Process the data
  const sankeyLayout = sankeyGenerator({
    nodes: nodesWithOrder,
    links: transformedLinks
  })

  // Expand width of vertical bar nodes (3x for three LLM explainer bars)
  const nodeWidth = 15 // Same as sankeyGenerator nodeWidth
  sankeyLayout.nodes.forEach(node => {
    if (node.node_type === 'vertical_bar' && node.x0 !== undefined && node.x1 !== undefined) {
      const newWidth = nodeWidth * 3
      // Expand to the right (keep x0, increase x1)
      node.x1 = node.x0 + newWidth
    }
  })

  // Handle special cases where d3-sankey can't position nodes properly
  if (sankeyLayout.links.length === 0) {
    if (sankeyLayout.nodes.length === 1) {
      // Single-node case (root-only tree)
      const singleNode = sankeyLayout.nodes[0]
      const nodeWidth = 15 // Same as sankeyGenerator nodeWidth
      const nodeHeight = Math.min(200, height * 0.8) // Longer height to accommodate growth

      // Position on left middle (not center)
      const leftMargin = 20 // Small margin from left edge
      singleNode.x0 = leftMargin
      singleNode.x1 = singleNode.x0 + nodeWidth
      singleNode.y0 = (height - nodeHeight) / 2
      singleNode.y1 = singleNode.y0 + nodeHeight
    } else if (sankeyLayout.nodes.length === 2) {
      // Two-node case (root + vertical_bar placeholder)
      const [rootNode, verticalBarNode] = sankeyLayout.nodes
      const nodeWidth = 15 // Same as sankeyGenerator nodeWidth
      const nodeHeight = Math.min(200, height * 0.8) // Longer height

      // Position root on left
      const leftMargin = 20
      rootNode.x0 = leftMargin
      rootNode.x1 = rootNode.x0 + nodeWidth
      rootNode.y0 = (height - nodeHeight) / 2
      rootNode.y1 = rootNode.y0 + nodeHeight

      // Position vertical bar on right (6x width for better visibility)
      const rightMargin = 20  // Increased margin to show full width
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
  // Nodes are colored based on the metric that splits them (root) or created them (children)
  const metric = node.metric

  if (metric) {
    return getMetricBaseColor(metric)
  }

  // Final fallback for nodes without colors or metrics
  return '#6b7280' // Default gray
}

/**
 * Get the base color for a link (without opacity)
 * Links are colored based on their source node
 */
export function getLinkColor(link: D3SankeyLink): string {
  // Defensive checks for d3-sankey processed data
  if (!link?.source) {
    console.warn('getLinkColor: Link source is undefined, using default color')
    return '#6b7280'  // Default gray
  }

  const sourceNode = link.source as D3SankeyNode

  // Use hierarchical color from source node (preferred)
  if (sourceNode?.colorHex) {
    return sourceNode.colorHex
  }

  // Fallback: Get metric from source node (links are colored by the metric that created them)
  const metric = sourceNode?.metric

  if (!metric) {
    // No metric: use default gray (root node or nodes without metrics)
    return '#6b7280'
  }

  // Get base color from centralized source
  return getMetricBaseColor(metric)
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate container dimensions
 */
export function validateDimensions(width: number, height: number): string[] {
  const errors: string[] = []
  if (width < MIN_CONTAINER_WIDTH) errors.push(`Container width must be at least ${MIN_CONTAINER_WIDTH}px`)
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
  // Only validate link structure if links exist
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


const BAR_COLOR = '#9ca3af'  // Gray-400

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
    // Use hierarchical color from parent node (preferred), fallback to default
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
    // Calculate viewport position as percentage of total scrollable area
    const scrollPercent = scrollState.scrollTop / scrollState.scrollHeight
    const viewportPercent = scrollState.clientHeight / scrollState.scrollHeight

    // Indicator shows the visible portion of the table
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
// D3 FORMAT CONVERSION (Moved from sankey-d3-converter.ts)
// ============================================================================

/**
 * Convert simplified SankeyStructure to D3-compatible format for rendering
 * Handles node positioning based on stage and type (regular, segment, terminal)
 *
 * Note: This is the NEW architecture converter for the fixed 3-stage system.
 * The old calculateSankeyLayout() above is kept for backward compatibility.
 */
export function convertToD3Format(
  structure: any,  // SankeyStructure from types
  width: number,
  height: number
): { nodes: D3SankeyNode[], links: D3SankeyLink[] } {
  const margin = { top: 10, right: 50, bottom: 20, left: 20 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // Helper: Convert node
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
  const nodes: any[] = structure.nodes.map((node: any) => {
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

  // 2. Create node ID map
  const nodeIdMap = new Map<string, number>()
  nodes.forEach((node, index) => {
    nodeIdMap.set(node.id || '', index)
  })

  // 3. Transform links
  const transformedLinks: any[] = []
  for (const link of structure.links) {
    const linkAny = link as any
    const sourceId = typeof linkAny.source === 'object' ? linkAny.source?.id : linkAny.source
    const targetId = typeof linkAny.target === 'object' ? linkAny.target?.id : linkAny.target

    const sourceIndex = typeof sourceId === 'number' ? sourceId : nodeIdMap.get(String(sourceId))
    const targetIndex = typeof targetId === 'number' ? targetId : nodeIdMap.get(String(targetId))

    if (sourceIndex === undefined || targetIndex === undefined) {
      console.warn(`[convertToD3Format] Skipping invalid link: ${sourceId} -> ${targetId}`)
      continue
    }

    transformedLinks.push({
      ...link,
      source: sourceIndex,
      target: targetIndex
    })
  }

  // 4. Create D3 sankey generator
  const sankeyGenerator = sankey<any, any>()
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[1, 1], [innerWidth - 1, innerHeight - 1]])
    .nodeAlign((node: any) => node.stage || 0)

  // 5. Process with D3
  const sankeyLayout = sankeyGenerator({
    nodes,
    links: transformedLinks
  })

  // 6. Expand vertical bar nodes (6x for better visibility)
  const nodeWidth = 15
  sankeyLayout.nodes.forEach(node => {
    if (node.node_type === 'vertical_bar' && node.x0 !== undefined && node.x1 !== undefined) {
      const newWidth = nodeWidth * 6
      node.x1 = node.x0 + newWidth
    }
  })

  // 7. Handle 2-node special case
  if (sankeyLayout.links.length === 1 && sankeyLayout.nodes.length === 2) {
    const [rootNode, segmentNode] = sankeyLayout.nodes
    const nodeHeight = Math.min(200, innerHeight * 0.8)

    const leftMargin = 20
    rootNode.x0 = leftMargin
    rootNode.x1 = rootNode.x0 + nodeWidth
    rootNode.y0 = (innerHeight - nodeHeight) / 2
    rootNode.y1 = rootNode.y0 + nodeHeight

    const rightMargin = 20
    const segmentWidth = nodeWidth * 6
    segmentNode.x0 = innerWidth - rightMargin - segmentWidth
    segmentNode.x1 = segmentNode.x0 + segmentWidth
    segmentNode.y0 = (innerHeight - nodeHeight) / 2
    segmentNode.y1 = segmentNode.y0 + nodeHeight
  }

  return {
    nodes: sankeyLayout.nodes as D3SankeyNode[],
    links: sankeyLayout.links as D3SankeyLink[]
  }
}

