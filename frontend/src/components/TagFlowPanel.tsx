import React, { useMemo, useRef, useLayoutEffect, useState } from 'react'
import { getTagCategoriesInOrder, getTagColor } from '../lib/tag-system'
import '../styles/TagFlowPanel.css'

// ============================================================================
// TYPES
// ============================================================================

interface TagFlowPanelProps {
  tagCounts: Record<string, Record<string, number>>
  activeStage?: string | null
}

interface TagNode {
  id: string
  categoryId: string
  tag: string
  color: string
  count: number
  stageOrder: number
}

// ============================================================================
// DATA
// ============================================================================

function getTagNodes(tagCounts: Record<string, Record<string, number>>): TagNode[] {
  const categories = getTagCategoriesInOrder()
  const nodes: TagNode[] = []

  for (const category of categories) {
    if (category.stageOrder > 3) continue
    const counts = tagCounts[category.id] || {}

    category.tags.forEach((tag) => {
      nodes.push({
        id: `${category.id}:${tag}`,
        categoryId: category.id,
        tag,
        color: getTagColor(category.id, tag) || '#94a3b8',
        count: counts[tag] || 0,
        stageOrder: category.stageOrder,
      })
    })
  }

  return nodes
}

// ============================================================================
// COMPONENT
// ============================================================================

const TagFlowPanel: React.FC<TagFlowPanelProps> = ({ tagCounts, activeStage }) => {
  const nodes = useMemo(() => getTagNodes(tagCounts), [tagCounts])
  const containerRef = useRef<HTMLDivElement>(null)
  const [badgePositions, setBadgePositions] = useState<Record<string, { left: number; right: number; y: number }>>({})

  const nodesByStage = useMemo(() => {
    const grouped: Record<number, TagNode[]> = { 1: [], 2: [], 3: [] }
    for (const node of nodes) {
      grouped[node.stageOrder]?.push(node)
    }
    return grouped
  }, [nodes])

  // Map category ID to stage order for determining completed/active/future
  const stageIdToOrder: Record<string, number> = {
    feature_splitting: 1,
    quality: 2,
    cause: 3,
  }
  const activeStageOrder = activeStage ? stageIdToOrder[activeStage] ?? 0 : 0

  // Get stage status class
  const getStageStatus = (stageOrder: number): string => {
    if (activeStageOrder === 0) return 'future'
    if (stageOrder < activeStageOrder) return 'completed'
    if (stageOrder === activeStageOrder) return 'active'
    return 'future'
  }

  // Measure badge positions after render (left edge, right edge, vertical center)
  useLayoutEffect(() => {
    if (!containerRef.current) return

    const positions: Record<string, { left: number; right: number; y: number }> = {}
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()

    container.querySelectorAll('[data-node-id]').forEach((el) => {
      const nodeId = el.getAttribute('data-node-id')
      if (!nodeId) return
      const rect = el.getBoundingClientRect()
      positions[nodeId] = {
        left: rect.left - containerRect.left,
        right: rect.right - containerRect.left,
        y: rect.top - containerRect.top + rect.height / 2,
      }
    })

    setBadgePositions(positions)
  }, [nodes, tagCounts])

  // Generate SVG paths with gradients (right edge → left edge)
  const svgPaths = useMemo(() => {
    const paths: Array<{
      d: string
      key: string
      gradientId: string
      sourceColor: string
      targetColor: string
      x1: number
      x2: number
    }> = []

    const stage1 = nodesByStage[1] || []
    const stage2 = nodesByStage[2] || []
    const stage3 = nodesByStage[3] || []

    // Connector 1→2: Monosemantic → Well-Explained + Need Revision
    if (stage1[0] && stage2.length > 0) {
      const sourceNode = stage1[0]
      const source = badgePositions[sourceNode.id]

      if (source) {
        stage2.forEach((target, idx) => {
          const targetPos = badgePositions[target.id]
          if (targetPos) {
            const x1 = source.right
            const x2 = targetPos.left
            const midX = (x1 + x2) / 2
            paths.push({
              key: `c1-${idx}`,
              gradientId: `grad-c1-${idx}`,
              d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${targetPos.y}, ${x2} ${targetPos.y}`,
              sourceColor: sourceNode.color,
              targetColor: target.color,
              x1,
              x2,
            })
          }
        })
      }
    }

    // Connector 2→3: Need Revision → All Stage 3 badges
    if (stage2[0] && stage3.length > 0) {
      const sourceNode = stage2[0] // Need Revision is first
      const source = badgePositions[sourceNode.id]

      if (source) {
        stage3.forEach((target, idx) => {
          const targetPos = badgePositions[target.id]
          if (targetPos) {
            const x1 = source.right
            const x2 = targetPos.left
            const midX = (x1 + x2) / 2
            paths.push({
              key: `c2-${idx}`,
              gradientId: `grad-c2-${idx}`,
              d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${targetPos.y}, ${x2} ${targetPos.y}`,
              sourceColor: sourceNode.color,
              targetColor: target.color,
              x1,
              x2,
            })
          }
        })
      }
    }

    return paths
  }, [badgePositions, nodesByStage])

  return (
    <div className="tag-flow-panel" ref={containerRef}>
      {/* SVG layer for flow lines */}
      <svg className="tag-flow-panel__svg">
        <defs>
          {svgPaths.map(({ gradientId, sourceColor, targetColor, x1, x2 }) => (
            <linearGradient
              key={gradientId}
              id={gradientId}
              x1={x1}
              x2={x2}
              y1="0"
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={sourceColor} />
              <stop offset="100%" stopColor={targetColor} />
            </linearGradient>
          ))}
        </defs>
        {svgPaths.map(({ key, d, gradientId }) => (
          <path
            key={key}
            d={d}
            className="tag-flow-panel__path"
            stroke={`url(#${gradientId})`}
          />
        ))}
      </svg>

      {/* Badge columns */}
      <div className="tag-flow-panel__content">
        <div className={`tag-flow-panel__column tag-flow-panel__column--${getStageStatus(1)}`}>
          <span className={`tag-flow-panel__stage-number tag-flow-panel__stage-number--${getStageStatus(1)}`}>1</span>
          {nodesByStage[1]?.map(node => (
            <Badge key={node.id} node={node} isActive={activeStage === node.categoryId} />
          ))}
        </div>

        <div className="tag-flow-panel__spacer" />

        <div className={`tag-flow-panel__column tag-flow-panel__column--${getStageStatus(2)}`}>
          <span className={`tag-flow-panel__stage-number tag-flow-panel__stage-number--${getStageStatus(2)}`}>2</span>
          {nodesByStage[2]?.map(node => (
            <Badge key={node.id} node={node} isActive={activeStage === node.categoryId} />
          ))}
        </div>

        <div className="tag-flow-panel__spacer" />

        <div className={`tag-flow-panel__column tag-flow-panel__column--${getStageStatus(3)}`}>
          <span className={`tag-flow-panel__stage-number tag-flow-panel__stage-number--${getStageStatus(3)}`}>3</span>
          {nodesByStage[3]?.map(node => (
            <Badge key={node.id} node={node} isActive={activeStage === node.categoryId} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Badge sub-component
const Badge: React.FC<{ node: TagNode; isActive: boolean }> = ({ node, isActive }) => (
  <div
    data-node-id={node.id}
    className={`stage-tag-badge ${isActive ? 'stage-tag-badge--active' : ''}`}
    style={{ backgroundColor: node.color, borderColor: node.color }}
    title={`${node.tag}: ${node.count.toLocaleString()} features`}
  >
    <span className="stage-tag-badge__label">{node.tag}</span>
    <span className="stage-tag-badge__count">{node.count.toLocaleString()}</span>
  </div>
)

export default TagFlowPanel
