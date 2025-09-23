import type { SankeyNode } from './api'

// ============================================================================
// ENHANCED D3 TYPES FOR SANKEY VISUALIZATION
// ============================================================================

export interface D3SankeyNode extends SankeyNode {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
}

export interface D3SankeyLink {
  source: D3SankeyNode | string
  target: D3SankeyNode | string
  value: number
  y0?: number
  y1?: number
  width?: number
}