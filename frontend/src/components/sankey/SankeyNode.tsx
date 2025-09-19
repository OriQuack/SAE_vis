/**
 * Optimized Sankey node component
 */

import React, { memo, useCallback } from 'react'
import { SankeyNode as NodeType } from '../../types'

interface SankeyNodeProps {
  node: NodeType
  x: number
  y: number
  width: number
  height: number
  color: string
  isHighlighted: boolean
  isHovered: boolean
  onMouseEnter: (node: NodeType) => void
  onMouseLeave: (node: NodeType) => void
  onClick: (node: NodeType) => void
}

export const SankeyNode = memo<SankeyNodeProps>(({
  node,
  x,
  y,
  width,
  height,
  color,
  isHighlighted,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick
}) => {
  const handleMouseEnter = useCallback(() => {
    onMouseEnter(node)
  }, [node, onMouseEnter])

  const handleMouseLeave = useCallback(() => {
    onMouseLeave(node)
  }, [node, onMouseLeave])

  const handleClick = useCallback(() => {
    onClick(node)
  }, [node, onClick])

  const opacity = isHighlighted ? 1 : (isHovered ? 0.8 : 0.7)
  const strokeWidth = isHighlighted || isHovered ? 2 : 1

  return (
    <g className="sankey-node">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        opacity={opacity}
        stroke={isHighlighted ? '#3730a3' : '#9ca3af'}
        strokeWidth={strokeWidth}
        rx={4}
        ry={4}
        style={{
          cursor: 'pointer',
          transition: 'all 200ms ease-in-out'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Node label */}
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fill={isHighlighted || isHovered ? '#1f2937' : '#4b5563'}
        fontWeight={isHighlighted ? 600 : 400}
        pointerEvents="none"
      >
        {node.name}
      </text>

      {/* Value label */}
      <text
        x={x + width / 2}
        y={y + height / 2 + 16}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fill="#6b7280"
        pointerEvents="none"
      >
        ({node.value})
      </text>
    </g>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for performance
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.color === nextProps.color &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.value === nextProps.node.value
  )
})

SankeyNode.displayName = 'SankeyNode'