// Sankey calculation utilities with performance optimizations

import * as d3Sankey from 'd3-sankey'
import { DEFAULT_SANKEY_MARGIN, SCORE_AGREEMENT_SORT_ORDER, SANKEY_LAYOUT_CONFIG, SANKEY_CACHE_CONFIG } from './constants'
import type {
  SankeyNode,
  D3SankeyNode,
  D3SankeyLink,
  SankeyLayout,
  SankeyLayoutCacheEntry,
  NodeSortingCacheEntry,
  NodeSortConfig,
  SankeyData
} from './types'

// Memoization caches
const sankeyLayoutCache = new Map<string, SankeyLayoutCacheEntry>()
const nodeSortingCache = new Map<string, NodeSortingCacheEntry>()

/**
 * Create cache key for sankey layout
 */
function createSankeyCacheKey(
  data: SankeyData,
  containerWidth: number,
  containerHeight: number
): string {
  const nodeIds = data.nodes.map(n => n.id).sort().join('_')
  const linkValues = data.links.map(l => `${l.source}_${l.target}_${l.value}`).sort().join('_')
  return `sankey_${containerWidth}_${containerHeight}_${nodeIds}_${linkValues}`
}

/**
 * Create cache key for node sorting
 */
function createSortingCacheKey(nodes: SankeyNode[], config: NodeSortConfig): string {
  const nodeStr = nodes.map(n => `${n.id}_${n.stage}_${n.name}`).join('_')
  return `sort_${config.stage4Enabled}_${config.preserveOriginalOrder}_${nodeStr}`
}

/**
 * Clean expired cache entries
 */
function cleanCache<T extends { timestamp: number }>(
  cache: Map<string, T>,
  ttlMs: number,
  maxEntries: number
): void {
  const now = Date.now()
  const expiredKeys: string[] = []

  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > ttlMs) {
      expiredKeys.push(key)
    }
  }

  expiredKeys.forEach(key => cache.delete(key))

  // Enforce max size
  if (cache.size > maxEntries) {
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, cache.size - maxEntries)
    toDelete.forEach(([key]) => cache.delete(key))
  }
}

/**
 * Get optimized sort order for stage 4 score agreement nodes
 * @param nodeName - Node name to analyze
 * @returns Sort order number (lower = earlier in list)
 */
function getScoreAgreementSortOrder(nodeName: string): number {
  const lowerName = nodeName.toLowerCase()

  for (const [pattern, order] of Object.entries(SCORE_AGREEMENT_SORT_ORDER)) {
    if (lowerName.includes(pattern)) {
      return order
    }
  }

  // Default fallback for unknown node names
  return 999
}

/**
 * Sort nodes with optimized caching and stage-specific logic
 * @param nodes - Array of sankey nodes to sort
 * @param config - Sorting configuration
 * @returns Sorted array of nodes
 */
function sortNodesByStage(nodes: SankeyNode[], config: NodeSortConfig = { stage4Enabled: true, preserveOriginalOrder: true }): SankeyNode[] {
  const cacheKey = createSortingCacheKey(nodes, config)

  // Check cache first
  const cachedEntry = nodeSortingCache.get(cacheKey)
  if (cachedEntry && Date.now() - cachedEntry.timestamp < SANKEY_CACHE_CONFIG.sortingTtlMs) {
    return [...cachedEntry.sortedNodes] // Return copy to prevent mutations
  }

  // Clean cache periodically
  if (nodeSortingCache.size > SANKEY_CACHE_CONFIG.sortingMaxEntries) {
    cleanCache(nodeSortingCache, SANKEY_CACHE_CONFIG.sortingTtlMs, SANKEY_CACHE_CONFIG.sortingMaxEntries)
  }

  // Perform sorting
  const sortedNodes = [...nodes].sort((a, b) => {
    // First sort by stage
    if (a.stage !== b.stage) {
      return a.stage - b.stage
    }

    // For stage 4 (score agreement), apply custom sorting if enabled
    if (config.stage4Enabled && a.stage === 4 && a.category === 'score_agreement') {
      const orderA = getScoreAgreementSortOrder(a.name)
      const orderB = getScoreAgreementSortOrder(b.name)
      if (orderA !== orderB) {
        return orderA - orderB
      }
    }

    // For other stages, maintain original order or sort by name
    if (config.preserveOriginalOrder) {
      return 0 // Maintain original order within stage
    } else {
      return a.name.localeCompare(b.name)
    }
  })

  // Cache the result
  nodeSortingCache.set(cacheKey, {
    sortedNodes: [...sortedNodes], // Store copy to prevent external mutations
    key: cacheKey,
    timestamp: Date.now()
  })

  return sortedNodes
}

/**
 * Calculate sankey layout with optimized performance and caching
 * @param data - Sankey data from API
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @returns Optimized sankey layout
 */
export function calculateSankeyLayout(
  data: SankeyData,
  containerWidth: number,
  containerHeight: number
): SankeyLayout {
  const cacheKey = createSankeyCacheKey(data, containerWidth, containerHeight)

  // Check cache first
  const cachedEntry = sankeyLayoutCache.get(cacheKey)
  if (cachedEntry && Date.now() - cachedEntry.timestamp < SANKEY_CACHE_CONFIG.ttlMs) {
    return cachedEntry.layout
  }

  // Clean cache periodically
  if (sankeyLayoutCache.size > SANKEY_CACHE_CONFIG.maxEntries) {
    cleanCache(sankeyLayoutCache, SANKEY_CACHE_CONFIG.ttlMs, SANKEY_CACHE_CONFIG.maxEntries)
  }

  const margin = DEFAULT_SANKEY_MARGIN
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  try {
    // Sort nodes with caching
    const sortedNodes = sortNodesByStage([...data.nodes])

    // Create d3-sankey generator with optimized configuration
    const sankey = d3Sankey.sankey()
      .nodeAlign(d3Sankey.sankeyLeft)
      .nodeWidth(SANKEY_LAYOUT_CONFIG.nodeWidth)
      .nodePadding(SANKEY_LAYOUT_CONFIG.nodePadding)
      .extent([[0, 0], [width, height]])

    // Create optimized node ID to index mapping
    const nodeIdToIndex = new Map<string, number>()
    sortedNodes.forEach((node, index) => {
      nodeIdToIndex.set(node.id, index)
    })

    // Validate all links have valid node references
    const invalidLinks = data.links.filter(link =>
      !nodeIdToIndex.has(link.source) || !nodeIdToIndex.has(link.target)
    )

    if (invalidLinks.length > 0) {
      console.error('Invalid links found:', invalidLinks)
      return createEmptyLayout(width, height, margin)
    }

    // Convert to d3-sankey format with minimal object creation
    const sankeyNodes = sortedNodes.map(node => ({
      id: node.id,
      name: node.name,
      category: node.category,
      feature_count: node.feature_count,
      stage: node.stage
    }))

    const sankeyLinks = data.links.map(link => ({
      source: nodeIdToIndex.get(link.source)!,
      target: nodeIdToIndex.get(link.target)!,
      value: link.value
    }))

    const sankeyData = {
      nodes: sankeyNodes,
      links: sankeyLinks
    }

    // Generate layout
    const result = sankey(sankeyData as any)

    // Validate result
    if (!result || !result.nodes || !result.links) {
      console.warn('D3 sankey returned invalid result')
      return createEmptyLayout(width, height, margin)
    }

    // Convert back to our format with property restoration
    const processedNodes = result.nodes.map((node: any, index: number) => ({
      ...node,
      id: sankeyNodes[index]?.id || '',
      name: sankeyNodes[index]?.name || '',
      category: sankeyNodes[index]?.category || 'root',
      feature_count: sankeyNodes[index]?.feature_count || 0,
      stage: sankeyNodes[index]?.stage || 0
    })) as D3SankeyNode[]

    const processedLinks = result.links as D3SankeyLink[]

    const layout: SankeyLayout = {
      nodes: processedNodes,
      links: processedLinks,
      width,
      height,
      margin
    }

    // Cache the result
    sankeyLayoutCache.set(cacheKey, {
      layout,
      key: cacheKey,
      timestamp: Date.now()
    })

    return layout

  } catch (error) {
    console.error('Error in d3-sankey layout calculation:', error)
    console.error('Input data:', data)

    // Return empty layout instead of crashing
    return createEmptyLayout(width, height, margin)
  }
}

/**
 * Create empty layout for error cases
 */
function createEmptyLayout(width: number, height: number, margin: typeof DEFAULT_SANKEY_MARGIN): SankeyLayout {
  return {
    nodes: [],
    links: [],
    width,
    height,
    margin
  }
}

/**
 * Clear all sankey caches (useful for testing or memory management)
 */
export function clearSankeyCache(): void {
  sankeyLayoutCache.clear()
  nodeSortingCache.clear()
}

/**
 * Get cache statistics for debugging
 */
export function getSankeyCacheStats() {
  return {
    layoutCache: {
      size: sankeyLayoutCache.size,
      maxSize: SANKEY_CACHE_CONFIG.maxEntries
    },
    sortingCache: {
      size: nodeSortingCache.size,
      maxSize: SANKEY_CACHE_CONFIG.sortingMaxEntries
    }
  }
}