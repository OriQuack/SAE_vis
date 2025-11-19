/**
 * Sankey D3 Converter
 *
 * Converts simplified SankeyStructure to D3-compatible format for rendering.
 * Handles node positioning based on stage and type (regular, segment, terminal).
 */

import type {
  SankeyStructure,
  SimplifiedSankeyNode,
  RegularSankeyNode,
  SegmentSankeyNode,
  TerminalSankeyNode,
  SankeyNode,
  D3SankeyNode,
  SankeyLink,
  D3SankeyLink
} from '../types'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert SimplifiedSankeyNode to D3SankeyNode for rendering
 */
function convertNode(node: SimplifiedSankeyNode, stage: number): SankeyNode {
  const baseNode: SankeyNode = {
    id: node.id,
    name: node.tagName || node.id,
    stage,
    depth: node.depth,
    feature_count: node.featureCount,
    category: 'root',  // Simplified - we'll use colors instead
    feature_ids: Array.from(node.featureIds),
    colorHex: node.color
  }

  // Set node type
  if (node.type === 'segment') {
    baseNode.node_type = 'vertical_bar'
  } else if (node.type === 'terminal') {
    baseNode.node_type = 'vertical_bar'
  } else {
    baseNode.node_type = 'standard'
  }

  // Add metric if segment node
  if (node.type === 'segment') {
    baseNode.metric = node.metric
  }

  return baseNode
}

/**
 * Convert simplified structure to D3-compatible format
 */
export function convertToD3Format(
  structure: SankeyStructure,
  width: number,
  height: number
): { nodes: D3SankeyNode[], links: D3SankeyLink[] } {
  const margin = { top: 10, right: 50, bottom: 20, left: 20 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // 1. Convert nodes
  const nodes: SankeyNode[] = structure.nodes.map(node => {
    // Determine stage based on node type and position
    let stage: number
    if (node.id === 'root') {
      stage = 0
    } else if (node.depth === 1) {
      stage = 1
    } else if (node.depth === 2) {
      stage = 2
    } else {
      stage = 3
    }

    return convertNode(node, stage)
  })

  // 2. Create node ID map for link transformation (D3 requires numeric indices)
  const nodeIdMap = new Map<string, number>()
  nodes.forEach((node, index) => {
    nodeIdMap.set(node.id || '', index)
  })

  // 3. Transform links to use numeric indices instead of string IDs
  const transformedLinks: any[] = []
  for (const link of structure.links) {
    const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
    const targetId = typeof link.target === 'object' ? link.target?.id : link.target

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
  const sankeyGenerator = sankey<SankeyNode, SankeyLink>()
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[1, 1], [innerWidth - 1, innerHeight - 1]])
    .nodeAlign((node: any) => node.stage || 0)

  // 5. Process with D3
  const sankeyLayout = sankeyGenerator({
    nodes,
    links: transformedLinks
  })

  // 6. Expand vertical bar nodes (3x for better visibility)
  const nodeWidth = 15
  sankeyLayout.nodes.forEach(node => {
    if (node.node_type === 'vertical_bar' && node.x0 !== undefined && node.x1 !== undefined) {
      const newWidth = nodeWidth * 6  // 6x width for vertical bars
      node.x1 = node.x0 + newWidth
    }
  })

  // 7. Handle special cases (2-node case)
  if (sankeyLayout.links.length === 1 && sankeyLayout.nodes.length === 2) {
    const [rootNode, segmentNode] = sankeyLayout.nodes
    const nodeHeight = Math.min(200, innerHeight * 0.8)

    // Position root on left
    const leftMargin = 20
    rootNode.x0 = leftMargin
    rootNode.x1 = rootNode.x0 + nodeWidth
    rootNode.y0 = (innerHeight - nodeHeight) / 2
    rootNode.y1 = rootNode.y0 + nodeHeight

    // Position segment on right
    const rightMargin = 20
    const segmentWidth = nodeWidth * 6
    segmentNode.x0 = innerWidth - rightMargin - segmentWidth
    segmentNode.x1 = segmentNode.x0 + segmentWidth
    segmentNode.y0 = (innerHeight - nodeHeight) / 2
    segmentNode.y1 = segmentNode.y0 + nodeHeight
  }

  return {
    nodes: sankeyLayout.nodes,
    links: sankeyLayout.links
  }
}

/**
 * Get Sankey link path (D3 default)
 */
export function getSankeyPath(link: D3SankeyLink): string {
  return sankeyLinkHorizontal()(link) || ''
}

/**
 * Get node color (use colorHex from node)
 */
export function getNodeColor(node: D3SankeyNode): string {
  return node.colorHex || '#6b7280'
}

/**
 * Get link color (based on source node color with opacity)
 */
export function getLinkColor(link: D3SankeyLink): string {
  const sourceNode = link.source as D3SankeyNode
  const baseColor = sourceNode?.colorHex || '#6b7280'
  return `${baseColor}30`  // 30% opacity
}
