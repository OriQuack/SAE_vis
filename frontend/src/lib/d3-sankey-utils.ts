import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import type {
  NodeCategory,
  D3SankeyNode,
  D3SankeyLink,
  SankeyLayout
} from '../types'
import {
  CATEGORY_ROOT,
  CATEGORY_DECODER_SIMILARITY,
  CATEGORY_SEMANTIC_SIMILARITY,
  getMetricBaseColor
} from './constants'

// ============================================================================
// UTILS-SPECIFIC TYPES (Internal use only - not exported)
// ============================================================================

interface StageLabel {
  x: number
  y: number
  label: string
  stage: number
}

export interface ScrollIndicator {
  y: number
  height: number
}

export interface VerticalBarSubNode {
  id: string                  // e.g., "llama", "qwen", "openai"
  modelName: string          // Display name (e.g., "Llama", "Qwen", "OpenAI")
  x: number                  // Left edge x-coordinate
  y: number                  // Top edge y-coordinate
  width: number              // Bar width
  height: number             // Bar height
  color: string              // Bar color
  selected: boolean          // Whether this explainer is selected
}

export interface VerticalBarNodeLayout {
  node: D3SankeyNode         // Original Sankey node
  subNodes: VerticalBarSubNode[]  // Vertical bar (single bar)
  scrollIndicator: ScrollIndicator | null  // Global scroll indicator
  totalWidth: number         // Total width of the bar
  totalHeight: number        // Total height
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_ANIMATION = {
  duration: 300,
  easing: 'ease-out'
} as const

export const SANKEY_COLORS: Record<NodeCategory, string> = {
  [CATEGORY_ROOT]: '#d1d5db',
  [CATEGORY_DECODER_SIMILARITY]: '#9ca3af',
  [CATEGORY_SEMANTIC_SIMILARITY]: '#6b7280'
} as const

export const DEFAULT_SANKEY_MARGIN = { top: 20, right: 100, bottom: 20, left: 20 } as const
export const RIGHT_SANKEY_MARGIN = { top: 80, right: 80, bottom: 50, left: 120 } as const

// Validation constants
export const MIN_CONTAINER_WIDTH = 200
export const MIN_CONTAINER_HEIGHT = 250

// Category display names
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  [CATEGORY_ROOT]: 'All Features',
  [CATEGORY_DECODER_SIMILARITY]: 'Decoder Similarity',
  [CATEGORY_SEMANTIC_SIMILARITY]: 'Semantic Similarity'
} as const

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * D3-sankey node alignment function that respects actual stage positions
 */
function stageBasedAlign(node: D3SankeyNode): number {
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
  const nodesWithOrder = filteredNodes.map((node: D3SankeyNode, index: number) => ({
    ...node,
    originalIndex: index
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

  // Node sorting function
  const smartNodeSort = (a: D3SankeyNode, b: D3SankeyNode) => {
    // Sort by stage first
    if (a.stage !== b.stage) {
      return (a.stage || 0) - (b.stage || 0)
    }

    // Within same stage, get parent IDs
    const parentA = childToParentMap.get(a.id || '') || extractParentId(a.id || '')
    const parentB = childToParentMap.get(b.id || '') || extractParentId(b.id || '')

    // If different parents, sort by parent's originalIndex for stable ordering
    if (parentA !== parentB) {
      const parentNodeA = nodeMap.get(parentA)
      const parentNodeB = nodeMap.get(parentB)

      // Sort by parent's originalIndex (not Y position which is unreliable)
      if (parentNodeA && parentNodeB) {
        return (parentNodeA.originalIndex ?? 0) - (parentNodeB.originalIndex ?? 0)
      }

      // Fallback to child's originalIndex if parents not found
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

    // Fallback to original order
    return (a.originalIndex ?? 0) - (b.originalIndex ?? 0)
  }

  // Link sorting function
  const linkSort = (a: D3SankeyLink, b: D3SankeyLink) => {
    const sourceA = a.source as D3SankeyNode
    const sourceB = b.source as D3SankeyNode
    const targetA = a.target as D3SankeyNode
    const targetB = b.target as D3SankeyNode

    // Sort by source node index
    if (sourceA.index !== sourceB.index) {
      return (sourceA.index ?? 0) - (sourceB.index ?? 0)
    }

    // Within same source, sort by target node index
    return (targetA.index ?? 0) - (targetB.index ?? 0)
  }

  // Create D3 sankey generator
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(15)
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
      const newWidth = nodeWidth * 6
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
  // Defensive check for node category
  if (!node?.category) {
    console.warn('getNodeColor: Node category is undefined:', {
      node,
      hasCategory: 'category' in node,
      nodeKeys: Object.keys(node)
    })
    return '#6b7280' // Default gray
  }

  return SANKEY_COLORS[node.category] || '#6b7280'
}

export function getLinkColor(link: D3SankeyLink): string {
  // Defensive checks for d3-sankey processed data
  if (!link?.source) {
    console.warn('getLinkColor: Link source is undefined, using default color')
    return '#6b728040'  // 25% opacity
  }

  const sourceNode = link.source as D3SankeyNode

  // Get metric from source node (links are colored by the metric that created them)
  const metric = sourceNode?.metric

  if (!metric) {
    // No metric: use default gray (root node or nodes without metrics)
    return '#6b728040'  // 25% opacity
  }

  // Get base color from centralized source and apply 25% opacity
  const baseColor = getMetricBaseColor(metric)
  return `${baseColor}40`  // Add 25% opacity (hex '40' = 64/255)
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
// STAGE LABEL CALCULATIONS
// ============================================================================

/**
 * Calculate stage label positions from layout data
 */
export function calculateStageLabels(
  layout: SankeyLayout | null,
  displayData: any
): StageLabel[] {
  if (!layout || !displayData) return []

  // Group nodes by stage
  const nodesByStage = new Map<number, D3SankeyNode[]>()
  layout.nodes.forEach(node => {
    const stage = node.stage
    if (!nodesByStage.has(stage)) {
      nodesByStage.set(stage, [])
    }
    nodesByStage.get(stage)!.push(node)
  })

  // Calculate position and label for each stage
  const labels: StageLabel[] = []

  nodesByStage.forEach((nodes, stage) => {
    if (nodes.length === 0) return

    let label: string

    if (stage === 0) {
      // Stage 0 (root): always use category display name
      const category = nodes[0].category
      label = CATEGORY_DISPLAY_NAMES[category] || category
    } else {
      // Other stages: use category display name (derived from parent metric)
      // With new architecture, children don't have metric, but category is derived from parent
      const category = nodes[0].category
      label = CATEGORY_DISPLAY_NAMES[category] || category
    }

    // Calculate x position (average of all nodes in the stage)
    const avgX = nodes.reduce((sum, node) => sum + ((node.x0 || 0) + (node.x1 || 0)) / 2, 0) / nodes.length

    labels.push({ x: avgX, y: -40, label, stage })
  })

  return labels
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
 * Creates a single vertical bar spanning the full node width
 */
export function calculateVerticalBarNodeLayout(
  node: D3SankeyNode,
  scrollState?: { scrollTop: number; scrollHeight: number; clientHeight: number } | null,
  totalFeatureCount: number = 0,
  nodeStartIndex: number = 0
): VerticalBarNodeLayout {
  if (node.x0 === undefined || node.x1 === undefined ||
      node.y0 === undefined || node.y1 === undefined) {
    throw new Error('Sankey node missing position information')
  }

  const totalWidth = node.x1 - node.x0
  const totalHeight = node.y1 - node.y0

  // Create a single bar spanning the full width
  const subNodes: VerticalBarSubNode[] = [{
    id: 'vertical-bar',
    modelName: 'Vertical Bar',
    x: node.x0!,
    y: node.y0!,
    width: totalWidth,
    height: totalHeight,
    color: BAR_COLOR,
    selected: true
  }]

  // Calculate scroll indicator using visible feature IDs from virtual scroll
  let scrollIndicator: ScrollIndicator | null = null

  if (scrollState && scrollState.visibleFeatureIds && scrollState.visibleFeatureIds.size > 0 && node.featureIds) {
    // NEW APPROACH: Use feature IDs instead of pixel-based calculations
    // Find which of this node's features are visible in the table
    const visibleNodeFeatures: number[] = []
    const allNodeFeatures: number[] = []

    // Convert node's feature IDs to array for indexed access
    node.featureIds.forEach(fid => {
      allNodeFeatures.push(fid)
      if (scrollState.visibleFeatureIds!.has(fid)) {
        visibleNodeFeatures.push(fid)
      }
    })

    // Calculate what percentage of visible table features belong to this node
    const overlapPercentage = visibleNodeFeatures.length / scrollState.visibleFeatureIds.size

    console.log('[calculateVerticalBarNodeLayout] Feature-based calculation:', {
      nodeId: node.id,
      totalNodeFeatures: allNodeFeatures.length,
      visibleNodeFeatures: visibleNodeFeatures.length,
      totalVisibleInTable: scrollState.visibleFeatureIds.size,
      overlapPercentage: (overlapPercentage * 100).toFixed(1) + '%'
    })

    // Only show indicator if this node contains MAJORITY (>50%) of visible features
    // This ensures only ONE vertical bar shows the indicator at a time
    if (visibleNodeFeatures.length > 0 && overlapPercentage > 0.5) {
      // Find the position of visible features within this node
      // Sort all features by their position in the node
      allNodeFeatures.sort((a, b) => a - b)

      // Find indices of first and last visible features in the sorted node feature list
      const firstVisibleIndex = allNodeFeatures.indexOf(Math.min(...visibleNodeFeatures))
      const lastVisibleIndex = allNodeFeatures.indexOf(Math.max(...visibleNodeFeatures))

      // Calculate indicator position as percentage of node height
      const startPercent = firstVisibleIndex / Math.max(1, allNodeFeatures.length)
      const endPercent = (lastVisibleIndex + 1) / Math.max(1, allNodeFeatures.length)

      scrollIndicator = {
        y: node.y0! + (totalHeight * startPercent),
        height: totalHeight * (endPercent - startPercent)
      }

      console.log('[calculateVerticalBarNodeLayout] Scroll indicator created (majority node):', {
        firstVisibleIndex,
        lastVisibleIndex,
        startPercent: (startPercent * 100).toFixed(1) + '%',
        endPercent: (endPercent * 100).toFixed(1) + '%',
        indicator: scrollIndicator
      })
    } else {
      console.log('[calculateVerticalBarNodeLayout] Node does not have majority of visible features - no indicator')
    }
  } else {
    // No feature ID tracking available - hide indicator to prevent showing on all nodes
    console.log('[calculateVerticalBarNodeLayout] No visibleFeatureIds - hiding indicator')
    scrollIndicator = null
  }

  return {
    node,
    subNodes,
    scrollIndicator,
    totalWidth,
    totalHeight
  }
}

