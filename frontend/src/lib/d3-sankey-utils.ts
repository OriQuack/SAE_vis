import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { NodeCategory, D3SankeyNode, D3SankeyLink } from '../types'
import { CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT } from './constants'

// ============================================================================
// TYPES
// ============================================================================

export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

// Hook Types
interface Size {
  width: number
  height: number
}

interface UseResizeObserverOptions {
  defaultWidth?: number
  defaultHeight?: number
  debounceMs?: number
}

interface UseResizeObserverReturn<T extends HTMLElement = HTMLElement> {
  ref: React.RefObject<T | null>
  size: Size
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_ANIMATION = {
  duration: 300,
  easing: 'ease-out'
}

export const SANKEY_COLORS: Record<NodeCategory, string> = {
  [CATEGORY_ROOT]: '#8b5cf6',
  [CATEGORY_FEATURE_SPLITTING]: '#06b6d4',
  [CATEGORY_SEMANTIC_DISTANCE]: '#3b82f6',
  [CATEGORY_SCORE_AGREEMENT]: '#10b981'
}

const DEFAULT_SANKEY_MARGIN = { top: 80, right: 20, bottom: 20, left: 80 }

// ============================================================================
// SANKEY UTILITIES
// ============================================================================

/**
 * Professional D3-sankey node alignment function that respects actual stage positions.
 * This is the proper way to control node positioning in D3-sankey.
 */
function stageBasedAlign(node: D3SankeyNode, n: number): number {
  // Use our stage property instead of D3's calculated depth
  // This ensures nodes are positioned at their actual stages
  return node.stage || 0
}

export function calculateSankeyLayout(sankeyData: any, layoutWidth?: number, layoutHeight?: number): SankeyLayout {
  if (!sankeyData?.nodes || !sankeyData?.links) {
    throw new Error('Invalid sankey data: missing nodes or links')
  }

  const width = (layoutWidth || 800) - DEFAULT_SANKEY_MARGIN.left - DEFAULT_SANKEY_MARGIN.right
  const height = (layoutHeight || 600) - DEFAULT_SANKEY_MARGIN.top - DEFAULT_SANKEY_MARGIN.bottom

  // Create node ID to index mapping
  const nodeIdMap = new Map<string, number>()
  sankeyData.nodes.forEach((node: any, index: number) => {
    nodeIdMap.set(String(node.id), index)
  })

  // Transform data for d3-sankey
  const transformedLinks: any[] = []

  sankeyData.links.forEach((link: any, linkIndex: number) => {
    // Handle different link reference formats
    let sourceIndex = -1
    let targetIndex = -1

    if (typeof link.source === 'number') {
      sourceIndex = link.source
    } else if (typeof link.source === 'string') {
      sourceIndex = nodeIdMap.get(link.source) ?? -1
    } else if (typeof link.source === 'object' && link.source?.id) {
      sourceIndex = nodeIdMap.get(String(link.source.id)) ?? -1
    }

    if (typeof link.target === 'number') {
      targetIndex = link.target
    } else if (typeof link.target === 'string') {
      targetIndex = nodeIdMap.get(link.target) ?? -1
    } else if (typeof link.target === 'object' && link.target?.id) {
      targetIndex = nodeIdMap.get(String(link.target.id)) ?? -1
    }

    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('calculateSankeyLayout: Invalid link reference (skipping):', {
        linkIndex,
        original: link,
        sourceIndex,
        targetIndex,
        sourceId: typeof link.source === 'object' ? link.source?.id : link.source,
        targetId: typeof link.target === 'object' ? link.target?.id : link.target,
        availableNodeIds: Array.from(nodeIdMap.keys()).slice(0, 10)
      })
      return // Skip invalid links
    }

    // Validate indices are within bounds
    if (sourceIndex >= sankeyData.nodes.length || targetIndex >= sankeyData.nodes.length || sourceIndex < 0 || targetIndex < 0) {
      console.error('calculateSankeyLayout: Link index out of bounds (skipping):', {
        linkIndex,
        sourceIndex,
        targetIndex,
        nodeCount: sankeyData.nodes.length
      })
      return // Skip out-of-bounds links
    }

    transformedLinks.push({
      ...link,
      source: sourceIndex,
      target: targetIndex
    })
  })

  const transformedData = {
    nodes: sankeyData.nodes.map((node: any, index: number) => {
      // Preserve all original node properties to prevent d3-sankey from losing them
      const transformedNode = {
        ...node,
        index // Add index for debugging
      }
      return transformedNode
    }),
    links: transformedLinks
  }

  // Validate we have valid data for d3-sankey
  if (transformedData.nodes.length === 0) {
    throw new Error('No valid nodes found for Sankey diagram')
  }

  // Allow empty links for root-only trees (dynamic tree building starts with just the root)
  if (transformedData.links.length === 0 && transformedData.nodes.length > 1) {
    throw new Error('No valid links found for Sankey diagram')
  }

  // Preserve original node order with flexible stage handling
  const nodesWithOrder = transformedData.nodes.map((node: D3SankeyNode, index: number) => ({
    ...node,
    originalIndex: index
  }))

  // ============================================================================
  // NODE SORTING HELPER FUNCTIONS
  // ============================================================================

  /**
   * Extract parent ID from a node ID by removing the last component
   * Examples:
   * - "root_feature_splitting_0" -> "root"
   * - "root_feature_splitting_1_semdist_mean_0" -> "root_feature_splitting_1"
   * - "root_false_semdist_high_all_3_high" -> "root_false_semdist_high"
   */
  function extractParentId(nodeId: string): string {
    if (nodeId === 'root') return ''

    // For range splits (ending with numbers), remove the last part
    const parts = nodeId.split('_')
    if (/^\d+$/.test(parts[parts.length - 1])) {
      return parts.slice(0, -1).join('_')
    }

    // For score agreement patterns "all_N_high" or "all_N_low"
    const allPatternMatch = nodeId.match(/_all_\d+_(high|low)$/)
    if (allPatternMatch) {
      return nodeId.slice(0, allPatternMatch.index)
    }

    // For score agreement patterns "X_of_N_high_[metrics]"
    const partialPatternMatch = nodeId.match(/_\d+_of_\d+_high_[a-z_]+$/)
    if (partialPatternMatch) {
      return nodeId.slice(0, partialPatternMatch.index)
    }

    // Fallback: remove last component
    return parts.slice(0, -1).join('_')
  }

  /**
   * Get sorting priority for score agreement nodes (lower number = higher priority)
   * Most agreement (all_N_high) should come first, least agreement (all_N_low) last
   * Works flexibly with any number of metrics (2, 3, 4, etc.)
   */
  function getScoreAgreementPriority(nodeId: string): number {
    // Extract pattern from node ID
    // Pattern examples: "all_3_high", "2_of_3_high_fuzz_det", "all_4_low"

    // Match "all_N_high" pattern
    const allHighMatch = nodeId.match(/all_(\d+)_high/)
    if (allHighMatch) {
      return 0  // Highest priority - all scores high
    }

    // Match "all_N_low" pattern
    const allLowMatch = nodeId.match(/all_(\d+)_low/)
    if (allLowMatch) {
      const totalScores = parseInt(allLowMatch[1])
      return totalScores + 1  // Lowest priority - all scores low
    }

    // Match "X_of_N_high_..." pattern
    const partialMatch = nodeId.match(/(\d+)_of_(\d+)_high/)
    if (partialMatch) {
      const numHigh = parseInt(partialMatch[1])
      const totalScores = parseInt(partialMatch[2])
      // Sort by number of high scores (descending)
      // More high scores = lower priority number = comes first
      return totalScores - numHigh + 1
    }

    // Fallback for unknown patterns
    return 999
  }

  /**
   * Get category-specific sort order within the same parent
   */
  function getCategorySortOrder(nodeId: string, category: string): number {
    switch (category) {
      case CATEGORY_FEATURE_SPLITTING:
        // feature_splitting_0 (False) before feature_splitting_1 (True)
        return nodeId.includes('_0') ? 0 : 1

      case CATEGORY_SEMANTIC_DISTANCE:
        // semdist_mean_0 (Low) before semdist_mean_1 (High)
        return nodeId.includes('_0') ? 0 : 1

      case CATEGORY_SCORE_AGREEMENT:
        // Use score agreement priority (most agreement first)
        return getScoreAgreementPriority(nodeId)

      default:
        return 0
    }
  }

  // Create a map of all nodes by ID for quick parent lookup
  const nodeMap = new Map<string, D3SankeyNode>()
  nodesWithOrder.forEach((node: D3SankeyNode) => {
    if (node.id) {
      nodeMap.set(node.id, node)
    }
  })

  // Build a map from child node to parent node using link data
  const childToParentMap = new Map<string, string>()
  transformedData.links.forEach(link => {
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any)?.id
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any)?.id
    if (targetId && sourceId) {
      childToParentMap.set(targetId, sourceId)
    }
  })

  // Smart node sorting function that groups by parent and sorts by category rules
  const smartNodeSort = (a: any, b: any) => {
    // First, sort by stage
    if (a.stage != null && b.stage != null && a.stage !== b.stage) {
      return a.stage - b.stage
    }

    // Within same stage, get actual parent IDs from link data
    const parentA = childToParentMap.get(a.id || '') || extractParentId(a.id || '')
    const parentB = childToParentMap.get(b.id || '') || extractParentId(b.id || '')

    // If different parents, sort by parent's Y position (if available)
    if (parentA !== parentB) {
      const parentNodeA = nodeMap.get(parentA)
      const parentNodeB = nodeMap.get(parentB)

      // If both parents have been positioned by d3-sankey (have y0), use visual position
      if (parentNodeA?.y0 != null && parentNodeB?.y0 != null) {
        return parentNodeA.y0 - parentNodeB.y0
      }

      // Fallback to original node ordering if parents not positioned yet
      const aIndex = a.originalIndex ?? 0
      const bIndex = b.originalIndex ?? 0
      return aIndex - bIndex
    }

    // Same parent: apply category-specific sorting rules
    if (a.category && b.category) {
      // If different categories within same parent, maintain original order
      if (a.category !== b.category) {
        const aIndex = a.originalIndex ?? 0
        const bIndex = b.originalIndex ?? 0
        return aIndex - bIndex
      }

      // Same category and parent: apply specific sorting rules
      const sortOrderA = getCategorySortOrder(a.id || '', a.category)
      const sortOrderB = getCategorySortOrder(b.id || '', b.category)

      if (sortOrderA !== sortOrderB) {
        return sortOrderA - sortOrderB
      }
    }

    // Fallback: preserve original order
    const aIndex = a.originalIndex ?? 0
    const bIndex = b.originalIndex ?? 0
    return aIndex - bIndex
  }

  // Update the transformed data with original indices
  const orderedData = {
    nodes: nodesWithOrder,
    links: transformedData.links
  }

  // Link sorting function to match visual node order
  // This ensures links connect from top to bottom on both source and target nodes
  const linkSort = (a: D3SankeyLink, b: D3SankeyLink) => {
    const sourceA = a.source as D3SankeyNode
    const sourceB = b.source as D3SankeyNode
    const targetA = a.target as D3SankeyNode
    const targetB = b.target as D3SankeyNode

    // First, sort by source node (to group links from same source)
    if (sourceA.index !== sourceB.index) {
      return (sourceA.index ?? 0) - (sourceB.index ?? 0)
    }

    // Within same source, sort by target node index (which follows our node sort order)
    return (targetA.index ?? 0) - (targetB.index ?? 0)
  }

  // Create D3 sankey generator with professional stage-based alignment
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 1]])
    .nodeAlign(stageBasedAlign) // Use stage-based alignment (professional approach)
    .nodeSort(smartNodeSort) // Smart sorting by parent groups and category-specific rules
    .linkSort(linkSort) // Enable link sorting to match node order

  // Process the data with d3-sankey using our ordered data
  const sankeyLayout = sankeyGenerator(orderedData)

  // Handle single-node case (root-only tree) where d3-sankey can't position nodes properly
  if (sankeyLayout.links.length === 0 && sankeyLayout.nodes.length === 1) {
    const singleNode = sankeyLayout.nodes[0]
    const nodeWidth = 15 // Same as sankeyGenerator nodeWidth
    const nodeHeight = Math.min(100, height * 0.6) // Reasonable height for single node

    // Center the single node
    singleNode.x0 = (width - nodeWidth) / 2
    singleNode.x1 = singleNode.x0 + nodeWidth
    singleNode.y0 = (height - nodeHeight) / 2
    singleNode.y1 = singleNode.y0 + nodeHeight
  }

  return {
    nodes: sankeyLayout.nodes,
    links: sankeyLayout.links,
    width,
    height,
    margin: DEFAULT_SANKEY_MARGIN
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
    return '#6b728080'
  }

  const sourceNode = link.source as D3SankeyNode

  // Check if category exists on the source node
  if (!sourceNode?.category) {
    console.warn('getLinkColor: Source node category is undefined:', {
      sourceNode,
      hasCategory: 'category' in sourceNode,
      nodeKeys: Object.keys(sourceNode)
    })
    return '#6b728080' // Default gray with transparency
  }

  const baseColor = SANKEY_COLORS[sourceNode.category] || '#6b7280'
  return `${baseColor}80` // Add transparency
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function validateDimensions(width: number, height: number): string[] {
  const errors: string[] = []

  if (width < 200) {
    errors.push('Container width must be at least 200px')
  }
  if (height < 150) {
    errors.push('Container height must be at least 150px')
  }

  return errors
}

export function validateSankeyData(data: any): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('Sankey data is required')
    return errors
  }

  if (!data.nodes || !Array.isArray(data.nodes)) {
    errors.push('Sankey data must contain nodes array')
    return errors
  }

  if (!data.links || !Array.isArray(data.links)) {
    errors.push('Sankey data must contain links array')
    return errors
  }

  // Check that all link source/target IDs exist in nodes
  if (data.nodes.length > 0 && data.links.length > 0) {
    const nodeIdToIndex = new Map<string, number>()
    data.nodes.forEach((node: any, index: number) => {
      nodeIdToIndex.set(String(node.id), index)
    })

    // Track which nodes are referenced by links
    const referencedNodeIndices = new Set<number>()

    for (let i = 0; i < data.links.length; i++) {
      const link = data.links[i]

      // Handle both string IDs and object references
      const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
      const targetId = typeof link.target === 'object' ? link.target?.id : link.target

      let sourceIndex = -1
      let targetIndex = -1

      // Convert source to index
      if (typeof sourceId === 'number') {
        sourceIndex = sourceId
      } else if (typeof sourceId === 'string') {
        sourceIndex = nodeIdToIndex.get(sourceId) ?? -1
      }

      // Convert target to index
      if (typeof targetId === 'number') {
        targetIndex = targetId
      } else if (typeof targetId === 'string') {
        targetIndex = nodeIdToIndex.get(targetId) ?? -1
      }

      if (sourceIndex === -1) {
        errors.push(`Link ${i} references missing source node: "${sourceId}"`)
      } else {
        referencedNodeIndices.add(sourceIndex)
      }

      if (targetIndex === -1) {
        errors.push(`Link ${i} references missing target node: "${targetId}"`)
      } else {
        referencedNodeIndices.add(targetIndex)
      }
    }

    // Check for disconnected nodes (not referenced by any links)
    const disconnectedNodes: string[] = []
    data.nodes.forEach((node: any, index: number) => {
      if (!referencedNodeIndices.has(index)) {
        disconnectedNodes.push(String(node.id))
      }
    })

    if (disconnectedNodes.length > 0) {
      console.warn('validateSankeyData: Found disconnected nodes:', disconnectedNodes)
    }

    // Check for specific d3-sankey issues
    if (errors.length === 0 && data.links.length > 0) {
      // Simulate what d3-sankey will do to catch "missing: root" type errors early
      const linksBySource = new Map<number, any[]>()
      const linksByTarget = new Map<number, any[]>()

      data.links.forEach((link: any) => {
        let sourceIndex = -1
        let targetIndex = -1

        // Convert references to indices
        const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
        const targetId = typeof link.target === 'object' ? link.target?.id : link.target

        if (typeof sourceId === 'number') {
          sourceIndex = sourceId
        } else if (typeof sourceId === 'string') {
          sourceIndex = nodeIdToIndex.get(sourceId) ?? -1
        }

        if (typeof targetId === 'number') {
          targetIndex = targetId
        } else if (typeof targetId === 'string') {
          targetIndex = nodeIdToIndex.get(targetId) ?? -1
        }

        if (sourceIndex >= 0) {
          if (!linksBySource.has(sourceIndex)) linksBySource.set(sourceIndex, [])
          linksBySource.get(sourceIndex)!.push(link)
        }

        if (targetIndex >= 0) {
          if (!linksByTarget.has(targetIndex)) linksByTarget.set(targetIndex, [])
          linksByTarget.get(targetIndex)!.push(link)
        }
      })

      // Look for root nodes (nodes with no incoming links)
      const rootNodes: number[] = []
      for (let i = 0; i < data.nodes.length; i++) {
        if (!linksByTarget.has(i) && linksBySource.has(i)) {
          rootNodes.push(i)
        }
      }

      if (rootNodes.length === 0 && referencedNodeIndices.size > 0) {
        errors.push('No root nodes found - all nodes have incoming links, creating circular dependencies')
      }
    }
  }

  return errors
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to observe element size changes with debouncing
 */
export const useResizeObserver = <T extends HTMLElement = HTMLElement>({
  defaultWidth = 0,
  defaultHeight = 0,
  debounceMs = 100
}: UseResizeObserverOptions = {}): UseResizeObserverReturn<T> => {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ width: defaultWidth, height: defaultHeight })
  const timeoutRef = useRef<number | undefined>(undefined)

  const updateSize = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setSize({
        width: rect.width || defaultWidth,
        height: rect.height || defaultHeight
      })
    }
  }, [defaultWidth, defaultHeight])

  const debouncedUpdateSize = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(updateSize, debounceMs)
  }, [updateSize, debounceMs])

  useEffect(() => {
    updateSize()

    const resizeObserver = new ResizeObserver(debouncedUpdateSize)
    if (ref.current) {
      resizeObserver.observe(ref.current)
    }

    return () => {
      resizeObserver.disconnect()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [updateSize, debouncedUpdateSize])

  return { ref, size }
}