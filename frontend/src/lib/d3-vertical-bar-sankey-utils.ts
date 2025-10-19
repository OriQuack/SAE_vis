/**
 * D3 Vertical Bar Sankey Integration Utilities
 *
 * Handles layout calculations for rendering vertical bar nodes within Sankey diagrams.
 * Vertical bar nodes show three columns (one per LLM explainer) instead of a single rectangular node.
 */

import type { D3SankeyNode } from '../types'
import type { ScrollIndicator } from './d3-vertical-bar-utils'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
  subNodes: VerticalBarSubNode[]  // Three vertical bars
  scrollIndicator: ScrollIndicator | null  // Global scroll indicator
  totalWidth: number         // Total width of all three bars
  totalHeight: number        // Total height
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LLM_EXPLAINERS = [
  { id: 'llama', name: 'Llama' },
  { id: 'qwen', name: 'Qwen' },
  { id: 'openai', name: 'OpenAI' }
]

const BAR_COLOR = '#9ca3af'  // Gray-400 (same as standalone vertical bar)

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate layout for a vertical bar node within Sankey diagram
 *
 * Takes a Sankey node's position (x0, x1, y0, y1) and splits it into three vertical bars
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
  const barWidth = totalWidth / 3

  // Calculate layout for each vertical bar
  const subNodes: VerticalBarSubNode[] = LLM_EXPLAINERS.map((explainer, index) => ({
    id: explainer.id,
    modelName: explainer.name,
    x: node.x0! + (index * barWidth),
    y: node.y0!,
    width: barWidth,
    height: totalHeight,
    color: BAR_COLOR,
    selected: true  // TODO: Get from filter state
  }))

  // Calculate if this node should show scroll indicator
  let scrollIndicator: ScrollIndicator | null = null
  if (scrollState && scrollState.scrollHeight > scrollState.clientHeight) {
    const scrollPercentage = scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight)
    const visiblePercentage = scrollState.clientHeight / scrollState.scrollHeight

    // Special case: placeholder node always shows indicator (represents all features)
    const isPlaceholder = node.id === 'placeholder_vertical_bar'

    if (isPlaceholder) {
      // For placeholder, show indicator based on full scroll state
      const indicatorHeight = totalHeight * visiblePercentage
      const indicatorY = node.y0! + (totalHeight - indicatorHeight) * scrollPercentage

      scrollIndicator = {
        y: indicatorY,
        height: indicatorHeight
      }
    } else if (totalFeatureCount > 0) {
      // For regular nodes, check if this node contains any visible features
      const visibleStart = Math.floor(scrollPercentage * totalFeatureCount)
      const visibleEnd = Math.ceil((scrollPercentage + visiblePercentage) * totalFeatureCount)

      const nodeEndIndex = nodeStartIndex + node.feature_count

      // Check if this node contains any visible features
      if (visibleStart < nodeEndIndex && visibleEnd > nodeStartIndex) {
        // Calculate indicator position within this node
        const nodeVisibleStart = Math.max(0, visibleStart - nodeStartIndex)
        const nodeVisibleEnd = Math.min(node.feature_count, visibleEnd - nodeStartIndex)

        const startPercent = nodeVisibleStart / node.feature_count
        const endPercent = nodeVisibleEnd / node.feature_count

        scrollIndicator = {
          y: node.y0! + (totalHeight * startPercent),
          height: totalHeight * (endPercent - startPercent)
        }
      }
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

/**
 * Get the center x-coordinate of a vertical bar node for link connections
 */
export function getVerticalBarNodeCenterX(node: D3SankeyNode): number {
  if (node.x0 === undefined || node.x1 === undefined) {
    return 0
  }
  return (node.x0 + node.x1) / 2
}

/**
 * Get explainer color (currently all gray, but can be customized)
 */
export function getExplainerColor(_explainerId: string, _selected: boolean = true): string {
  return BAR_COLOR
}

/**
 * Get explainer display name
 */
export function getExplainerDisplayName(explainerId: string): string {
  const explainer = LLM_EXPLAINERS.find(e => e.id === explainerId)
  return explainer?.name || explainerId
}
