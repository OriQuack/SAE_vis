// ============================================================================
// D3 FLOW CHART UTILITIES - Simplified and Clean
// ============================================================================

import { NEUTRAL_ICON_COLORS } from './constants'

export interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  iconType?: 'decoder' | 'explainer' | 'scorer' | 'embedder'
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  path: string
  label?: string
  labelX?: number
  labelY?: number
  color?: string
}

export interface FlowLayout {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// Simple edge definition
interface EdgeDef {
  id: string
  source: string
  target: string
  label?: string
}

/**
 * Create a smooth curve between two nodes
 * @param orientation - 'horizontal' for left-right connections, 'vertical-to-horizontal' for top-left connections
 */
function curve(x1: number, y1: number, x2: number, y2: number, orientation: 'horizontal' | 'vertical-to-horizontal' = 'horizontal'): string {
  if (orientation === 'vertical-to-horizontal') {
    // For vertical-to-horizontal curves (e.g., from top of node to left of another)
    // Control points: first moves vertically, then horizontally
    const controlY1 = y1 - Math.abs(y2 - y1) / 2  // Move up from source
    const controlY2 = y2  // Same level as target
    return `M ${x1} ${y1} C ${x1} ${controlY1}, ${x2} ${controlY2}, ${x2} ${y2}`
  } else {
    // Default horizontal curve
    const midX = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
  }
}

// Edge color - use neutral color for all edges to avoid competing with data visualization
function getEdgeColor(): string {
  return NEUTRAL_ICON_COLORS.ICON_LIGHT
}

/**
 * Calculate flow chart layout - SIMPLE VERSION
 */
export function calculateFlowLayout(): FlowLayout {
  // Node definitions with absolute coordinates (viewBox: 0 0 600 180)
  const nodes: FlowNode[] = [
    // Feature (starting point)
    { id: 'feature', label: 'Feature', x: 10, y: 48, width: 70, height: 25 },

    // Activating Example (below Feature)
    { id: 'activating-example', label: 'Activating Examples', x: 40, y: 160, width: 120, height: 15 },

    // Explanation label (rotated, between explainer and outputs)
    { id: 'explanation-label', label: 'Explanation', x: 200, y: 100, width: 76, height: 15 },

    // Top path: Decoder
    { id: 'decoder', label: '', x: 155, y: 15, width: 45, height: 45, iconType: 'decoder' },
    { id: 'feature-splitting', label: 'Feature Splitting', x: 460, y: 10, width: 130, height: 22 },

    // Middle path: Explainer
    { id: 'explainer', label: '', x: 155, y: 88, width: 45, height: 45, iconType: 'explainer' },

    // Embedder branch
    { id: 'embedder', label: '', x: 285, y: 53, width: 45, height: 45, iconType: 'embedder' },

    // Embedding label (rotated, between embedder and embedding outputs)
    { id: 'embedding-label', label: 'Embedding', x: 375, y: 73, width: 70, height: 15 },

    { id: 'semantic-similarity', label: 'Semantic Similarity', x: 460, y: 50, width: 130, height: 22 },
    { id: 'embedding-score', label: 'Embedding Score', x: 460, y: 76, width: 130, height: 22 },

    // Scorer branch
    { id: 'scorer', label: '', x: 285, y: 123, width: 45, height: 45, iconType: 'scorer' },

    // Score label (rotated, between scorer and score outputs)
    { id: 'score-label', label: 'Score', x: 350, y: 138, width: 45, height: 15 },

    { id: 'fuzz-score', label: 'Fuzz Score', x: 460, y: 118, width: 130, height: 22 },
    { id: 'detection-score', label: 'Detection Score', x: 460, y: 144, width: 130, height: 22 }
  ]

  // Edge definitions (source → target)
  const edgeDefs: EdgeDef[] = [
    { id: 'feature-to-decoder', source: 'feature', target: 'decoder' },
    { id: 'decoder-to-splitting', source: 'decoder', target: 'feature-splitting' },

    { id: 'feature-to-explainer', source: 'feature', target: 'explainer' },
    { id: 'activating-example-to-explainer', source: 'activating-example', target: 'explainer' },

    { id: 'explainer-to-scorer', source: 'explainer', target: 'scorer' },
    { id: 'activating-example-to-scorer', source: 'activating-example', target: 'scorer' },
    { id: 'scorer-to-fuzz', source: 'scorer', target: 'fuzz-score' },
    { id: 'scorer-to-detection', source: 'scorer', target: 'detection-score' },

    { id: 'explainer-to-embedder', source: 'explainer', target: 'embedder' },
    { id: 'embedder-to-embedding', source: 'embedder', target: 'embedding-score' },
    { id: 'embedder-to-semantic', source: 'embedder', target: 'semantic-similarity' }
  ]

  // Create node lookup
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Generate edges automatically
  const edges: FlowEdge[] = edgeDefs.map(def => {
    const src = nodeMap.get(def.source)!
    const tgt = nodeMap.get(def.target)!

    // Calculate connection points
    let x1: number, y1: number, x2: number, y2: number
    let curveOrientation: 'horizontal' | 'vertical-to-horizontal' = 'horizontal'

    // Special case: activating-example to explainer uses vertical curve
    if (def.source === 'activating-example' && def.target === 'explainer') {
      x1 = src.x + src.width / 2  // Center horizontally
      y1 = src.y                   // Top of the node
      x2 = tgt.x                   // Left edge of target
      y2 = tgt.y + tgt.height / 2  // Center vertically of target
      curveOrientation = 'vertical-to-horizontal'
    } else {
      // Default: right edge of source, left edge of target
      x1 = src.x + src.width
      y1 = src.y + src.height / 2
      x2 = tgt.x
      y2 = tgt.y + tgt.height / 2
    }

    // Create path
    const path = curve(x1, y1, x2, y2, curveOrientation)

    // Calculate label position
    const labelX = def.label ? (x1 + x2) / 2 : undefined
    const labelY = def.label ? (y1 + y2) / 2 - 5 : undefined

    return {
      id: def.id,
      source: def.source,
      target: def.target,
      path,
      label: def.label,
      labelX,
      labelY,
      color: getEdgeColor()
    }
  })

  return { nodes, edges }
}

/**
 * Get icon transform - centers icon in node and scales to fit
 */
export function getIconTransform(node: FlowNode): string {
  if (!node.iconType) return ''

  // Icon viewBox is 100x100, but actual content is smaller
  // Scale down for smaller nodes (45x45) - reduced from 0.74 to 0.60
  const scale = (node.width / 100) * 0.75

  // Center the icon
  const centerX = node.x - 62
  const centerY = node.y + 10

  // Icon center in viewBox is (50, 50)
  return `translate(${centerX}, ${centerY}) scale(${scale}) translate(-50, -50)`
}

/**
 * Split multi-line labels
 */
export function splitLabel(label: string): string[] {
  return label.split('\n')
}
