/**
 * Sankey diagram type definitions
 */

import { Metadata } from './common'

export interface SankeyNode {
  id: string
  name: string
  value: number
  x?: number
  y?: number
  dx?: number
  dy?: number
  color?: string
  stage?: number
}

export interface SankeyLink {
  source: string | number
  target: string | number
  value: number
  color?: string
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  metadata: Metadata
}

export interface SankeyLayout {
  width: number
  height: number
  nodeWidth: number
  nodePadding: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
}