import React, { useState, useCallback } from 'react'
import { getLinkColor, getSankeyPath } from '../../utils/d3-helpers'
import type { D3SankeyLink, NodeCategory } from '../../services/types'

interface SankeyLinkComponentProps {
  link: D3SankeyLink
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, link: any) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, link: any) => void
}

export const SankeyLink: React.FC<SankeyLinkComponentProps> = React.memo(({
  link,
  animationDuration,
  onHover,
  onLeave,
  onHistogramClick
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = useCallback((event: React.MouseEvent) => {
    setIsHovered(true)
    onHover(event, link)
  }, [link, onHover])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    onLeave()
  }, [onLeave])

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (onHistogramClick) {
      onHistogramClick(event, link)
    }
  }, [onHistogramClick, link])

  const sourceNode = typeof link.source === 'object' ? link.source : null
  if (!sourceNode) return null

  const path = getSankeyPath(link)
  const color = getLinkColor(sourceNode.category as NodeCategory)

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, link.width || 0)}
      opacity={isHovered ? 0.9 : 0.6}
      style={{
        transition: `all ${animationDuration}ms ease-out`,
        cursor: onHistogramClick ? 'pointer' : 'default'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onHistogramClick ? handleClick : undefined}
      aria-label={`Flow: ${link.value} features from ${sourceNode.name}`}
    />
  )
})

SankeyLink.displayName = 'SankeyLink'