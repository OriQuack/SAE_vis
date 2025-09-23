import React, { useCallback } from 'react'
import { useResizeObserver } from '../../../../hooks'
import { getMetricsForNode, getParentNodeName } from '../utils/nodeMetrics'
import { getParentNodeId, isScoreAgreementNode } from '../../../../services/types'
import type { D3SankeyNode, D3SankeyLink, SankeyData } from '../../../../services/types'

interface UseSankeyInteractionsProps {
  data: SankeyData | null
  showHistogramOnClick: boolean
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: string[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string
  ) => void
  defaultWidth: number
  defaultHeight: number
}

interface UseSankeyInteractionsReturn {
  // State
  containerSize: { width: number; height: number }

  // Refs
  containerRef: React.RefObject<HTMLDivElement>

  // Event handlers
  handleNodeHover: (event: React.MouseEvent, node: D3SankeyNode) => void
  handleLinkHover: (event: React.MouseEvent, link: D3SankeyLink) => void
  handleHoverLeave: () => void
  handleNodeHistogramClick: (event: React.MouseEvent, node: D3SankeyNode) => void
  handleLinkHistogramClick: (event: React.MouseEvent, link: D3SankeyLink) => void
}

export const useSankeyInteractions = ({
  data,
  showHistogramOnClick,
  showHistogramPopover,
  defaultWidth,
  defaultHeight
}: UseSankeyInteractionsProps): UseSankeyInteractionsReturn => {

  // Empty hover handlers (visual effects handled in components, no tooltips)
  const handleNodeHover = useCallback((_event: React.MouseEvent, _node: D3SankeyNode) => {
    // No tooltip logic - visual effects are handled in the component itself
  }, [])

  const handleLinkHover = useCallback((_event: React.MouseEvent, _link: D3SankeyLink) => {
    // No tooltip logic - visual effects are handled in the component itself
  }, [])

  const handleHoverLeave = useCallback(() => {
    // No tooltip logic - visual effects are handled in the component itself
  }, [])

  // Resize observer hook
  const { ref: containerRef, size: containerSize } = useResizeObserver({
    defaultWidth,
    defaultHeight
  })


  // Handle node histogram click with threshold group information
  const handleNodeHistogramClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!showHistogramOnClick) return

    event.stopPropagation()

    // Get appropriate metrics for this node
    const metrics = getMetricsForNode(node)
    if (!metrics) {
      // No histogram should be shown for this node type (e.g., root nodes)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()

    // Calculate position relative to viewport for accurate placement
    const position = {
      x: rect.left + rect.width / 2,  // Center horizontally on the node
      y: rect.top + window.scrollY     // Account for page scroll
    }

    // If container exists, ensure position is relative to the whole page
    if (containerRect) {
      // Adjust for container offset if needed
      position.x = Math.max(position.x, containerRect.left + 50)  // Minimum offset from container edge
      position.x = Math.min(position.x, containerRect.right - 50) // Maximum offset from container edge
    }

    // Check if this is a score agreement node to provide parent context
    const parentNodeId = isScoreAgreementNode(node.id) ? getParentNodeId(node.id) : undefined
    const parentNodeName = parentNodeId && data ? getParentNodeName(parentNodeId, data.nodes) : undefined

    showHistogramPopover(node.id, node.name, metrics, position, parentNodeId || undefined, parentNodeName || undefined)
  }, [showHistogramOnClick, showHistogramPopover, data, containerRef])

  // Handle link histogram click (show histogram for source node) with threshold group information
  const handleLinkHistogramClick = useCallback((event: React.MouseEvent, link: D3SankeyLink) => {
    if (!showHistogramOnClick) return

    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return

    // Get appropriate metrics for the source node
    const metrics = getMetricsForNode(sourceNode)
    if (!metrics) {
      // No histogram should be shown for this node type (e.g., root nodes)
      return
    }

    event.stopPropagation()

    // Use click position relative to viewport with scroll compensation
    const position = {
      x: event.clientX,                    // Mouse x position relative to viewport
      y: event.clientY + window.scrollY    // Mouse y position with scroll offset
    }

    // Ensure position is within reasonable bounds
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    // Keep position within viewport bounds with some padding
    position.x = Math.max(50, Math.min(position.x, viewport.width - 50))
    position.y = Math.max(50, Math.min(position.y + window.scrollY, viewport.height + window.scrollY - 50))

    // Check if this is a score agreement node to provide parent context
    const parentNodeId = isScoreAgreementNode(sourceNode.id) ? getParentNodeId(sourceNode.id) : undefined
    const parentNodeName = parentNodeId && data ? getParentNodeName(parentNodeId, data.nodes) : undefined

    showHistogramPopover(sourceNode.id, sourceNode.name, metrics, position, parentNodeId || undefined, parentNodeName || undefined)
  }, [showHistogramOnClick, showHistogramPopover, data])

  return {
    // State
    containerSize,

    // Refs
    containerRef,

    // Event handlers
    handleNodeHover,
    handleLinkHover,
    handleHoverLeave,
    handleNodeHistogramClick,
    handleLinkHistogramClick
  }
}