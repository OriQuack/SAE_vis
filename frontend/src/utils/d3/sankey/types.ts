// Sankey-specific types and interfaces

import type { SankeyData, NodeCategory, LayoutMargin } from '../shared'

// Re-export the original SankeyNode from services/types.ts to maintain compatibility
export type { SankeyNode } from '../../../services/types'

// D3-enhanced sankey node (after d3-sankey processing)
export interface D3SankeyNode extends SankeyNode {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
}

// Sankey link from API (before d3-sankey processing)
export interface SankeyLink {
  source: string  // Node ID
  target: string  // Node ID
  value: number
}

// D3-enhanced sankey link (after d3-sankey processing)
export interface D3SankeyLink {
  source: D3SankeyNode | number
  target: D3SankeyNode | number
  value: number
  y0?: number
  y1?: number
  width?: number
}

// Complete sankey layout
export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: LayoutMargin
}

// Node sorting utilities
export interface NodeSortConfig {
  stage4Enabled: boolean  // Whether to apply special stage 4 sorting
  preserveOriginalOrder: boolean  // Whether to preserve original order for other stages
}

// Memoization cache entries
export interface SankeyLayoutCacheEntry {
  layout: SankeyLayout
  key: string
  timestamp: number
}

export interface NodeSortingCacheEntry {
  sortedNodes: SankeyNode[]
  key: string
  timestamp: number
}

// Re-export commonly used types
export type { SankeyData, NodeCategory }