// Sankey path generation utilities

import * as d3Sankey from 'd3-sankey'
import { SANKEY_COLORS, SANKEY_LAYOUT_CONFIG, DEFAULT_NODE_COLOR } from './constants'
import type { D3SankeyLink, NodeCategory } from './types'

/**
 * Generate SVG path for sankey link using d3-sankey
 * @param link - D3 sankey link with layout information
 * @returns SVG path string
 */
export function getSankeyPath(link: D3SankeyLink): string {
  return d3Sankey.sankeyLinkHorizontal()(link) || ''
}

/**
 * Get color for sankey node based on category
 * @param category - Node category
 * @returns Color string
 */
export function getNodeColor(category: NodeCategory): string {
  return SANKEY_COLORS[category] || DEFAULT_NODE_COLOR
}

/**
 * Get color for sankey link based on source node category
 * @param sourceCategory - Source node category
 * @returns Color string with transparency
 */
export function getLinkColor(sourceCategory: NodeCategory): string {
  const baseColor = SANKEY_COLORS[sourceCategory] || DEFAULT_NODE_COLOR
  const opacity = Math.round(SANKEY_LAYOUT_CONFIG.linkOpacity * 255).toString(16).padStart(2, '0')
  return baseColor + opacity
}