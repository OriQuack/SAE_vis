// ============================================================================
// D3 FLOW CHART UTILITIES - Simplified and Clean
// ============================================================================

import { COMPONENT_COLORS } from './constants'

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

// Edge color mapping based on source node type
function getEdgeColor(sourceId: string): string {
  const colorMap: Record<string, string> = {
    'feature': '#475569',                      // neutral gray
    'activating-example': '#475569',           // neutral gray
    'decoder': COMPONENT_COLORS.DECODER,       // Decoder (green)
    'explainer': COMPONENT_COLORS.EXPLAINER,   // LLM Explainer (orange)
    'embedder': COMPONENT_COLORS.EMBEDDER,     // Embedder (purple)
    'scorer': COMPONENT_COLORS.SCORER          // LLM Scorer (blue)
  }
  return colorMap[sourceId] || '#475569'
}

/**
 * Calculate flow chart layout - SIMPLE VERSION
 */
export function calculateFlowLayout(): FlowLayout {
  // Node definitions with absolute coordinates (viewBox: 0 0 600 180)
  const nodes: FlowNode[] = [
    // Feature (starting point)
    { id: 'feature', label: 'Feature', x: 10, y: 45, width: 80, height: 30 },

    // Activating Example (below Feature)
    { id: 'activating-example', label: 'Activating Examples', x: 20, y: 145, width: 140, height: 17 },

    // Explanation label (rotated, between explainer and outputs)
    { id: 'explanation-label', label: 'Explanation', x: 195, y: 100, width: 90, height: 17 },

    // Top path: Decoder
    { id: 'decoder', label: '', x: 150, y: 10, width: 55, height: 55, iconType: 'decoder' },
    { id: 'feature-splitting', label: 'Feature Splitting', x: 450, y: 5, width: 145, height: 26 },

    // Middle path: Explainer
    { id: 'explainer', label: '', x: 150, y: 83, width: 55, height: 55, iconType: 'explainer' },

    // Embedder branch
    { id: 'embedder', label: '', x: 280, y: 48, width: 55, height: 55, iconType: 'embedder' },

    // Embedding label (rotated, between embedder and embedding outputs)
    { id: 'embedding-label', label: 'Embedding', x: 370, y: 70, width: 80, height: 17 },

    { id: 'semantic-similarity', label: 'Semantic Similarity', x: 450, y: 45, width: 145, height: 26 },
    { id: 'embedding-score', label: 'Embedding Score', x: 450, y: 74, width: 145, height: 26 },

    // Scorer branch
    { id: 'scorer', label: '', x: 280, y: 118, width: 55, height: 55, iconType: 'scorer' },

    // Score label (rotated, between scorer and score outputs)
    { id: 'score-label', label: 'Score', x: 360, y: 135, width: 50, height: 17 },

    { id: 'fuzz-score', label: 'Fuzz Score', x: 450, y: 113, width: 145, height: 26 },
    { id: 'detection-score', label: 'Detection Score', x: 450, y: 142, width: 145, height: 26 }
  ]

  // Edge definitions (source → target)
  const edgeDefs: EdgeDef[] = [
    { id: 'feature-to-decoder', source: 'feature', target: 'decoder' },
    { id: 'decoder-to-splitting', source: 'decoder', target: 'feature-splitting' },

    { id: 'feature-to-explainer', source: 'feature', target: 'explainer' },
    { id: 'activating-example-to-explainer', source: 'activating-example', target: 'explainer' },

    { id: 'explainer-to-scorer', source: 'explainer', target: 'scorer' },
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

    // Special case: activating-example connects from top center to left center of target
    if (def.source === 'activating-example') {
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
      color: getEdgeColor(def.source)
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
  // Scale down for smaller viewBox (600x180 instead of 600x300)
  const scale = (node.width / 100) * 0.74

  // Center the icon
  const centerX = node.x - 75
  const centerY = node.y + 11.5

  // Icon center in viewBox is (50, 50)
  return `translate(${centerX}, ${centerY}) scale(${scale}) translate(-50, -50)`
}

/**
 * Split multi-line labels
 */
export function splitLabel(label: string): string[] {
  return label.split('\n')
}
