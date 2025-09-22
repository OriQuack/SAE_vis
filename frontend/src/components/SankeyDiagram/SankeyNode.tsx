import React, { useState, useCallback } from 'react'
import { getNodeColor } from '../../utils/d3-helpers'
import type { D3SankeyNode, NodeCategory, MetricType } from '../../services/types'

interface ThresholdGroupInfo {
  hasGroup: boolean
  groupSize: number
  primaryMetric?: string
}

interface SankeyNodeComponentProps {
  node: D3SankeyNode
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, node: any) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, node: any) => void
  thresholdGroupInfo?: ThresholdGroupInfo
}

export const SankeyNode: React.FC<SankeyNodeComponentProps> = React.memo(({
  node,
  animationDuration,
  onHover,
  onLeave,
  onHistogramClick,
  thresholdGroupInfo
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = useCallback((event: React.MouseEvent) => {
    setIsHovered(true)
    onHover(event, node)
  }, [node, onHover])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    onLeave()
  }, [onLeave])

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (onHistogramClick) {
      onHistogramClick(event, node)
    }
  }, [onHistogramClick, node])

  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node.category as NodeCategory)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0

  // Determine if this node has threshold group styling
  const hasThresholdGroup = thresholdGroupInfo?.hasGroup && thresholdGroupInfo.groupSize > 1
  const strokeColor = isHovered ? '#ffffff' : (hasThresholdGroup ? '#3b82f6' : 'none')
  const strokeWidth = isHovered ? 2 : (hasThresholdGroup ? 1.5 : 0)
  const strokeDasharray = hasThresholdGroup ? '3,2' : 'none'

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{
          transition: `all ${animationDuration}ms ease-out`,
          cursor: onHistogramClick ? 'pointer' : 'default',
          filter: isHovered ? 'brightness(1.1)' : 'none'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onHistogramClick ? handleClick : undefined}
        aria-label={`${node.name}: ${node.feature_count} features${hasThresholdGroup ? ` (shares thresholds with ${thresholdGroupInfo.groupSize - 1} other nodes)` : ''}`}
      />

      {/* Node label */}
      <text
        x={node.x0 - 6}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#374151"
        fontWeight={isHovered ? 600 : 400}
        textAnchor="end"
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      {/* Feature count */}
      <text
        x={node.x0 - 6}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#6b7280"
        textAnchor="end"
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>

    </g>
  )
})

SankeyNode.displayName = 'SankeyNode'