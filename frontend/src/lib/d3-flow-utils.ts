// ============================================================================
// D3 FLOW CHART UTILITIES - Simplified and Clean
// ============================================================================

import { NEUTRAL_ICON_COLORS } from './constants'

export interface Badge {
  x: number
  y: number
  width: number
  height: number
  rx: number
  text: string
  textX: number
  textY: number
  fill: string
}

export interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  nodeType?: 'text' | 'list-item'  // 'text' for regular nodes, 'list-item' for clickable LLM items
  llmType?: 'explainer' | 'scorer'  // For list items only
  llmId?: string  // Full LLM identifier for list items
  badge?: Badge  // Optional badge data
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
 * Helper function to get display name for LLM models
 */
function getLLMDisplayName(fullName: string): string {
  if (fullName.includes('Llama')) return 'Llama'
  if (fullName.includes('Qwen')) return 'Qwen'
  if (fullName.includes('openai') || fullName.includes('gpt')) return 'OpenAI'
  return fullName.split('/').pop() || fullName
}

/**
 * Calculate badge position for a node corner
 * @param node - Node position and dimensions
 * @param badgeWidth - Width of the badge
 * @param badgeHeight - Height of the badge
 * @param isRotated - Whether the node is rotated -90 degrees
 * @returns Badge position with text center
 */
function calculateBadgePosition(
  node: { x: number; y: number; width: number; height: number },
  badgeWidth: number,
  badgeHeight: number,
  isRotated: boolean
): { x: number; y: number; textX: number; textY: number } {
  const padding = 5 // Distance from node corner

  if (isRotated) {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2

    // Visual bottom-right corner after rotation
    const visualBottomRightX = cx + node.height / 2
    const visualBottomRightY = cy - node.width / 2

    // Place badge to the right and below this corner
    const badgeX = visualBottomRightX + padding
    const badgeY = visualBottomRightY + padding

    return {
      x: badgeX - padding * 2,
      y: badgeY - padding * 4,
      textX: badgeX + badgeWidth / 2 - padding * 2,
      textY: badgeY + badgeHeight / 2 - padding * 4
    }
  } else {
    // For upright nodes, badge at top-right corner
    const badgeX = node.x + node.width - badgeWidth / 2 - padding / 2
    const badgeY = node.y - badgeHeight / 2 - padding / 2

    return {
      x: badgeX,
      y: badgeY,
      textX: badgeX + badgeWidth / 2,
      textY: badgeY + badgeHeight / 2
    }
  }
}

/**
 * Calculate badge placement for a node
 * Returns badge data or undefined if node doesn't have a badge
 */
function calculateBadge(nodeId: string, node: { x: number; y: number; width: number; height: number }, isRotated: boolean = false): Badge | undefined {
  const badgeColor = '#475569'
  const badgeRx = 9

  // Define badge content for specific nodes
  let badgeText: string | undefined
  let badgeWidth: number
  let badgeHeight = 18

  if (nodeId === 'feature') {
    badgeText = '16k'
    badgeWidth = 24
  } else if (nodeId === 'explanation-label') {
    badgeText = '48k'
    badgeWidth = 28
  } else if (nodeId === 'score-label') {
    badgeText = '144k'
    badgeWidth = 32
  } else if (nodeId === 'embedding-label') {
    badgeText = '48k'
    badgeWidth = 28
  } else {
    return undefined
  }

  // Calculate position using the helper function
  const position = calculateBadgePosition(node, badgeWidth, badgeHeight, isRotated)

  return {
    x: position.x,
    y: position.y,
    width: badgeWidth,
    height: badgeHeight,
    rx: badgeRx,
    text: badgeText,
    textX: position.textX,
    textY: position.textY,
    fill: badgeColor
  }
}

/**
 * Calculate flow chart layout with LLM explainer/scorer lists
 */
export function calculateFlowLayout(
  explainerOptions: string[] = [],
  scorerOptions: string[] = []
): FlowLayout {
  // Node definitions with absolute coordinates (viewBox: 0 0 600 180)
  // Badges are calculated and attached after initial node definition
  const nodeDefinitions: Array<Omit<FlowNode, 'badge'>> = [
    // Feature (starting point)
    { id: 'feature', label: 'Feature', x: 10, y: 48, width: 70, height: 30, nodeType: 'text' },

    // Activating Example (below Feature)
    { id: 'activating-example', label: 'Activating Examples', x: 90, y: 158, width: 120, height: 15, nodeType: 'text' },

    // Explanation label (rotated, between explainer and outputs)
    { id: 'explanation-label', label: 'Explanation', x: 200, y: 100, width: 76, height: 15, nodeType: 'text' },

    // Top path: Decoder (text node now)
    { id: 'decoder', label: 'Decoder', x: 170, y: 10, width: 80, height: 30, nodeType: 'text' },
    { id: 'feature-splitting', label: 'Feature Splitting', x: 460, y: 10, width: 130, height: 22, nodeType: 'text' },

    // Embedder branch (text node now)
    { id: 'embedder', label: 'Embedder', x: 285, y: 45, width: 90, height: 30, nodeType: 'text' },

    // Embedding label (rotated, between embedder and embedding outputs)
    { id: 'embedding-label', label: 'Embedding', x: 365, y: 65, width: 70, height: 15, nodeType: 'text' },

    { id: 'semantic-similarity', label: 'Semantic Similarity', x: 460, y: 50, width: 130, height: 22, nodeType: 'text' },
    { id: 'embedding-score', label: 'Embedding Score', x: 460, y: 95, width: 130, height: 22, nodeType: 'text' },

    // Score label (rotated, between scorer and score outputs)
    { id: 'score-label', label: 'Score', x: 380, y: 140, width: 50, height: 15, nodeType: 'text' },

    { id: 'fuzz-score', label: 'Fuzz Score', x: 460, y: 122, width: 130, height: 22, nodeType: 'text' },
    { id: 'detection-score', label: 'Detection Score', x: 460, y: 150, width: 130, height: 22, nodeType: 'text' }
  ]

  // Calculate badges for nodes and create final node list
  const nodes: FlowNode[] = nodeDefinitions.map(nodeDef => {
    // Determine if node is rotated based on ID
    const isRotated = nodeDef.id === 'explanation-label' ||
                      nodeDef.id === 'score-label' ||
                      nodeDef.id === 'embedding-label'

    return {
      ...nodeDef,
      badge: calculateBadge(nodeDef.id, nodeDef, isRotated)
    }
  })

  // Constants for list items
  const itemHeight = 18
  const itemSpacing = 2
  const containerPadding = 4
  const headerHeight = 22

  // Add LLM Explainer container (rendered first so it appears behind list items)
  const explainerStartY = 60
  const explainerItemsHeight = explainerOptions.length * (itemHeight + itemSpacing) - itemSpacing
  const explainerContainerHeight = headerHeight + explainerItemsHeight + containerPadding * 2

  nodes.push({
    id: 'llm-explainer-container',
    label: 'LLM Explainer',
    x: 120,
    y: explainerStartY - containerPadding,
    width: 100,
    height: explainerContainerHeight,
    nodeType: 'text'
  })

  // Add LLM Explainer list items (middle path)
  explainerOptions.forEach((option, idx) => {
    nodes.push({
      id: `explainer-${idx}`,
      label: getLLMDisplayName(option),
      x: 140,
      y: explainerStartY + headerHeight + idx * (itemHeight + itemSpacing),
      width: 65,
      height: itemHeight,
      nodeType: 'list-item',
      llmType: 'explainer',
      llmId: option
    })
  })

  // Add LLM Scorer container (rendered first so it appears behind list items)
  const scorerStartY = 91
  const scorerItemsHeight = scorerOptions.length * (itemHeight + itemSpacing) - itemSpacing
  const scorerContainerHeight = headerHeight + scorerItemsHeight + containerPadding * 2

  nodes.push({
    id: 'llm-scorer-container',
    label: 'LLM Scorer',
    x: 290,
    y: scorerStartY - containerPadding,
    width: 85,
    height: scorerContainerHeight,
    nodeType: 'text'
  })

  // Add LLM Scorer list items (scorer branch)
  scorerOptions.forEach((option, idx) => {
    nodes.push({
      id: `scorer-${idx}`,
      label: getLLMDisplayName(option),
      x: 300,
      y: scorerStartY + headerHeight + idx * (itemHeight + itemSpacing),
      width: 65,
      height: itemHeight,
      nodeType: 'list-item',
      llmType: 'scorer',
      llmId: option
    })
  })

  // Edge definitions (source → target)
  // Note: Edges to explainer/scorer will be created dynamically based on list items
  const edgeDefs: EdgeDef[] = [
    { id: 'feature-to-decoder', source: 'feature', target: 'decoder' },
    { id: 'decoder-to-splitting', source: 'decoder', target: 'feature-splitting' },

    // Embedder connections
    { id: 'embedder-to-embedding', source: 'embedder', target: 'embedding-score' },
    { id: 'embedder-to-semantic', source: 'embedder', target: 'semantic-similarity' }
  ]

  // Add edges from Feature to each explainer list item
  explainerOptions.forEach((_, idx) => {
    edgeDefs.push({
      id: `feature-to-explainer-${idx}`,
      source: 'feature',
      target: `explainer-${idx}`
    })
  })

  // Add edges from Activating Example to each explainer list item
  explainerOptions.forEach((_, idx) => {
    edgeDefs.push({
      id: `activating-example-to-explainer-${idx}`,
      source: 'activating-example',
      target: `explainer-${idx}`
    })
  })

  // Add edges from explainer list items to embedder
  explainerOptions.forEach((_, idx) => {
    edgeDefs.push({
      id: `explainer-${idx}-to-embedder`,
      source: `explainer-${idx}`,
      target: 'embedder'
    })
  })

  // Add edges from explainer list items to scorer list items
  explainerOptions.forEach((_, explainerIdx) => {
    scorerOptions.forEach((_, scorerIdx) => {
      edgeDefs.push({
        id: `explainer-${explainerIdx}-to-scorer-${scorerIdx}`,
        source: `explainer-${explainerIdx}`,
        target: `scorer-${scorerIdx}`
      })
    })
  })

  // Add edges from Activating Example to each scorer list item
  scorerOptions.forEach((_, idx) => {
    edgeDefs.push({
      id: `activating-example-to-scorer-${idx}`,
      source: 'activating-example',
      target: `scorer-${idx}`
    })
  })

  // Add edges from scorer list items to score outputs
  scorerOptions.forEach((_, idx) => {
    edgeDefs.push({
      id: `scorer-${idx}-to-fuzz`,
      source: `scorer-${idx}`,
      target: 'fuzz-score'
    })
    edgeDefs.push({
      id: `scorer-${idx}-to-detection`,
      source: `scorer-${idx}`,
      target: 'detection-score'
    })
  })

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
 * Split multi-line labels
 */
export function splitLabel(label: string): string[] {
  return label.split('\n')
}
