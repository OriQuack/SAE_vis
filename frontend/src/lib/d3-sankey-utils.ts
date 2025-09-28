import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { NodeCategory, D3SankeyNode, D3SankeyLink } from '../types'

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
  root: '#8b5cf6',
  feature_splitting: '#06b6d4',
  semantic_distance: '#3b82f6',
  score_agreement: '#10b981'
}

const DEFAULT_SANKEY_MARGIN = { top: 80, right: 20, bottom: 20, left: 80 }

// ============================================================================
// SANKEY UTILITIES
// ============================================================================

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

  if (transformedData.links.length === 0) {
    throw new Error('No valid links found for Sankey diagram')
  }

  // Preserve original node order with flexible stage handling
  const nodesWithOrder = transformedData.nodes.map((node, index) => ({
    ...node,
    originalIndex: index
  }))

  // Flexible sorting function that preserves backend ordering regardless of stage structure
  const preserveBackendOrder = (a: any, b: any) => {
    // If stages exist and are different, sort by stage
    if (a.stage != null && b.stage != null && a.stage !== b.stage) {
      return a.stage - b.stage
    }

    // Within same stage (or if stages don't exist), preserve original backend order
    const aIndex = a.originalIndex ?? 0
    const bIndex = b.originalIndex ?? 0
    return aIndex - bIndex
  }

  // Update the transformed data with original indices
  const orderedData = {
    nodes: nodesWithOrder,
    links: transformedData.links
  }

  // Create D3 sankey generator with custom sorting to preserve backend ordering
  const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 1]])
    .nodeSort(preserveBackendOrder) // Preserve backend order regardless of stage structure
    .linkSort(null) // Disable link reordering to reduce crossing interference

  // Process the data with d3-sankey using our ordered data
  const sankeyLayout = sankeyGenerator(orderedData)

  // Sort links to match node visual order and prevent crossing
  const sortedLinks = sortLinksToMatchNodeOrder(sankeyLayout.links, sankeyLayout.nodes)

  return {
    nodes: sankeyLayout.nodes,
    links: sortedLinks,
    width,
    height,
    margin: DEFAULT_SANKEY_MARGIN
  }
}

/**
 * Sort links to match the visual order of nodes and prevent crossing.
 * Links to nodes that appear higher (lower y-coordinate) should connect
 * from higher positions on the source node.
 */
function sortLinksToMatchNodeOrder(links: D3SankeyLink[], nodes: D3SankeyNode[]): D3SankeyLink[] {
  // Create a map of node ID to y-position for sorting
  const nodeYPositions = new Map<string, number>()

  nodes.forEach(node => {
    if (node.y !== undefined && node.id !== undefined) {
      nodeYPositions.set(String(node.id), node.y)
    }
  })

  // Group links by source node to sort targets within each source
  const linksBySource = new Map<string, D3SankeyLink[]>()

  links.forEach(link => {
    const source = link.source as D3SankeyNode
    const sourceId = String(source?.id || '')

    if (!linksBySource.has(sourceId)) {
      linksBySource.set(sourceId, [])
    }
    linksBySource.get(sourceId)!.push(link)
  })

  // Sort links within each source group by target node's y-position
  const sortedLinks: D3SankeyLink[] = []

  linksBySource.forEach(sourceLinks => {
    // Sort links to this source by target node y-position (ascending = top to bottom)
    const sortedSourceLinks = sourceLinks.sort((a, b) => {
      const targetA = a.target as D3SankeyNode
      const targetB = b.target as D3SankeyNode

      const yA = nodeYPositions.get(String(targetA?.id || '')) ?? Number.MAX_SAFE_INTEGER
      const yB = nodeYPositions.get(String(targetB?.id || '')) ?? Number.MAX_SAFE_INTEGER

      return yA - yB
    })

    sortedLinks.push(...sortedSourceLinks)
  })

  return sortedLinks
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