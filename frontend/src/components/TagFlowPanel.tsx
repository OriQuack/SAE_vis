import React, { useMemo } from 'react'
import { getTagCategoriesInOrder, getTagColor } from '../lib/tag-system'
import { NEUTRAL_ICON_COLORS } from '../lib/constants'
import '../styles/TagFlowPanel.css'

// ============================================================================
// TYPES
// ============================================================================

interface TagFlowPanelProps {
  /** Tag counts organized by stage: { categoryId: { tagName: count } } */
  tagCounts: Record<string, Record<string, number>>
  /** Currently active stage for highlighting */
  activeStage?: string | null
}

interface TagFlowNode {
  id: string           // e.g., "feature_splitting:Monosemantic"
  categoryId: string   // e.g., "feature_splitting"
  tag: string          // e.g., "Monosemantic"
  x: number
  y: number
  width: number
  height: number
  color: string        // Hex color from tag-system
  count: number
  stageOrder: number   // 1, 2, or 3
}

interface TagFlowEdge {
  id: string
  source: string       // Source node id
  target: string       // Target node id
  path: string         // SVG bezier path d attribute
}

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

const LAYOUT = {
  PANEL_WIDTH: 340,
  PANEL_HEIGHT: 70,
  BADGE_WIDTH: 90,
  BADGE_HEIGHT: 20,
  BADGE_RX: 3,
  BADGE_GAP_Y: 4,
  STAGE_1_X: 5,
  STAGE_2_X: 120,
  STAGE_3_X: 235,
  TOP_PADDING: 5,
  COUNT_BOX_WIDTH: 28,
  COUNT_BOX_MARGIN: 2,
}

// ============================================================================
// LAYOUT CALCULATION
// ============================================================================

/**
 * Create smooth bezier curve between two points
 */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

/**
 * Calculate node positions and edge paths for the tag flow diagram
 */
function calculateTagFlowLayout(
  tagCounts: Record<string, Record<string, number>>
): { nodes: TagFlowNode[], edges: TagFlowEdge[] } {
  const categories = getTagCategoriesInOrder()
  const nodes: TagFlowNode[] = []
  const edges: TagFlowEdge[] = []

  // Column X positions by stage order
  const columnX: Record<number, number> = {
    1: LAYOUT.STAGE_1_X,
    2: LAYOUT.STAGE_2_X,
    3: LAYOUT.STAGE_3_X
  }

  // Build nodes for each category (only stages 1-3, skip stage 4 "temp")
  for (const category of categories) {
    if (category.stageOrder > 3) continue  // Skip temp stage

    const stageX = columnX[category.stageOrder]
    const counts = tagCounts[category.id] || {}

    category.tags.forEach((tag, index) => {
      const y = LAYOUT.TOP_PADDING + index * (LAYOUT.BADGE_HEIGHT + LAYOUT.BADGE_GAP_Y)

      nodes.push({
        id: `${category.id}:${tag}`,
        categoryId: category.id,
        tag,
        x: stageX,
        y,
        width: LAYOUT.BADGE_WIDTH,
        height: LAYOUT.BADGE_HEIGHT,
        color: getTagColor(category.id, tag) || '#94a3b8',
        count: counts[tag] || 0,
        stageOrder: category.stageOrder
      })
    })
  }

  // Build edges based on parentTagForNextStage relationships
  // Monosemantic -> Both Quality tags
  edges.push({
    id: 'mono-to-need-revision',
    source: 'feature_splitting:Monosemantic',
    target: 'quality:Need Revision',
    path: ''
  })
  edges.push({
    id: 'mono-to-well-explained',
    source: 'feature_splitting:Monosemantic',
    target: 'quality:Well-Explained',
    path: ''
  })

  // Need Revision -> All Cause tags
  edges.push({
    id: 'revision-to-noisy',
    source: 'quality:Need Revision',
    target: 'cause:Noisy Activation',
    path: ''
  })
  edges.push({
    id: 'revision-to-context',
    source: 'quality:Need Revision',
    target: 'cause:Missed Context',
    path: ''
  })
  edges.push({
    id: 'revision-to-ngram',
    source: 'quality:Need Revision',
    target: 'cause:Missed N-gram',
    path: ''
  })

  // Compute bezier paths for each edge
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    const tgt = nodeMap.get(edge.target)

    if (!src || !tgt) continue

    // Source: right edge center
    const x1 = src.x + src.width
    const y1 = src.y + src.height / 2

    // Target: left edge center
    const x2 = tgt.x
    const y2 = tgt.y + tgt.height / 2

    // Bezier curve with horizontal control points
    edge.path = curve(x1, y1, x2, y2)
  }

  return { nodes, edges }
}

// ============================================================================
// COMPONENT
// ============================================================================

const TagFlowPanel: React.FC<TagFlowPanelProps> = ({ tagCounts, activeStage }) => {
  // Memoize layout calculation
  const { nodes, edges } = useMemo(() => {
    return calculateTagFlowLayout(tagCounts)
  }, [tagCounts])

  return (
    <div className="tag-flow-panel">
      <svg
        viewBox={`0 0 ${LAYOUT.PANEL_WIDTH} ${LAYOUT.PANEL_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="tag-flow-panel__svg"
        role="img"
        aria-label="Tag flow diagram showing relationships between stages"
      >
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="tag-flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={NEUTRAL_ICON_COLORS.ICON_LIGHT} />
          </marker>
        </defs>

        {/* Render edges first (behind nodes) */}
        {edges.map(edge => (
          <path
            key={edge.id}
            d={edge.path}
            className="tag-flow-panel__edge"
            markerEnd="url(#tag-flow-arrow)"
          />
        ))}

        {/* Render nodes (tag badges) */}
        {nodes.map(node => (
          <g
            key={node.id}
            className={`tag-flow-panel__node ${
              activeStage === node.categoryId ? 'tag-flow-panel__node--active' : ''
            }`}
          >
            {/* Badge background */}
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={LAYOUT.BADGE_RX}
              fill={node.color}
              className="tag-flow-panel__badge"
            />
            {/* Tag label (left side) */}
            <text
              x={node.x + 4}
              y={node.y + node.height / 2}
              dominantBaseline="central"
              className="tag-flow-panel__label"
            >
              {node.tag}
            </text>
            {/* Count background (right side, white) */}
            <rect
              x={node.x + node.width - LAYOUT.COUNT_BOX_WIDTH - LAYOUT.COUNT_BOX_MARGIN}
              y={node.y + LAYOUT.COUNT_BOX_MARGIN}
              width={LAYOUT.COUNT_BOX_WIDTH}
              height={node.height - LAYOUT.COUNT_BOX_MARGIN * 2}
              rx={2}
              fill="#ffffff"
              className="tag-flow-panel__count-bg"
            />
            {/* Count text */}
            <text
              x={node.x + node.width - LAYOUT.COUNT_BOX_WIDTH / 2 - LAYOUT.COUNT_BOX_MARGIN}
              y={node.y + node.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="tag-flow-panel__count"
            >
              {node.count.toLocaleString()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export default TagFlowPanel
