// ============================================================================
// D3 FLOW CHART UTILITIES - Simplified and Clean
// ============================================================================

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
 */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

/**
 * Calculate flow chart layout - SIMPLE VERSION
 */
export function calculateFlowLayout(): FlowLayout {
  // Node definitions with absolute coordinates (viewBox: 0 0 600 300)
  const nodes: FlowNode[] = [
    // Feature (starting point)
    { id: 'feature', label: 'Feature', x: 0, y: 95, width: 100, height: 45 },

    // Top path: Decoder
    { id: 'decoder', label: '', x: 150, y: 20, width: 60, height: 60, iconType: 'decoder' },
    { id: 'feature-splitting', label: 'Feature Splitting', x: 420, y: 25, width: 180, height: 45 },

    // Middle path: Explainer
    { id: 'explainer', label: '', x: 150, y: 190, width: 60, height: 60, iconType: 'explainer' },

    // Scorer branch
    { id: 'scorer', label: '', x: 280, y: 120, width: 60, height: 60, iconType: 'scorer' },
    { id: 'fuzz-score', label: 'Fuzz Score', x: 420, y: 100, width: 180, height: 45 },
    { id: 'detection-score', label: 'Detection Score', x: 420, y: 150, width: 180, height: 45 },

    // Embedder branch
    { id: 'embedder', label: '', x: 280, y: 230, width: 60, height: 60, iconType: 'embedder' },
    { id: 'embedding-score', label: 'Embedding Score', x: 420, y: 210, width: 180, height: 45 },
    { id: 'semantic-similarity', label: 'Semantic Similarity', x: 420, y: 260, width: 180, height: 45 }
  ]

  // Edge definitions (source → target)
  const edgeDefs: EdgeDef[] = [
    { id: 'feature-to-decoder', source: 'feature', target: 'decoder' },
    { id: 'decoder-to-splitting', source: 'decoder', target: 'feature-splitting' },

    { id: 'feature-to-explainer', source: 'feature', target: 'explainer' },

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

    // Calculate connection points (right edge of source, left edge of target)
    const x1 = src.x + src.width
    const y1 = src.y + src.height / 2
    const x2 = tgt.x
    const y2 = tgt.y + tgt.height / 2

    // Create path
    const path = curve(x1, y1, x2, y2)

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
      labelY
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
  // Scale up to use 90% of node size for better visibility
  const scale = (node.width / 100)*0.4

  // Center the icon
  const centerX = node.x - 30
  const centerY = node.y + 5

  // Icon center in viewBox is (50, 50)
  return `translate(${centerX}, ${centerY}) scale(${scale}) translate(-50, -50)`
}

/**
 * Split multi-line labels
 */
export function splitLabel(label: string): string[] {
  return label.split('\n')
}
