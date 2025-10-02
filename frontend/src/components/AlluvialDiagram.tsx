import React, { useMemo, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateAlluvialLayout,
  getNodeColor,
  getNodeStyle,
  getConnectedFlowIds,
  getFlowOpacity,
  ALLUVIAL_LEGEND_ITEMS
} from '../lib/d3-alluvial-utils'
import { calculateSankeyLayout } from '../lib/d3-sankey-utils'
import { ALLUVIAL_MARGIN } from '../lib/d3-alluvial-utils'
import { useResizeObserver } from '../lib/utils'
import type { AlluvialSankeyNode, AlluvialSankeyLink } from '../types'
import '../styles/AlluvialDiagram.css'

// ==================== INTERFACES ====================

interface AlluvialDiagramProps {
  width?: number
  height?: number
  className?: string
}

// ==================== HELPER COMPONENTS ====================

const EmptyState: React.FC = () => (
  <div className="alluvial-empty">
    <div className="alluvial-empty__icon">🌊</div>
    <h3 className="alluvial-empty__title">No Flows Available</h3>
    <p className="alluvial-empty__text">
      Create visualizations in both panels to see feature flows
    </p>
  </div>
)

const FlowPath: React.FC<{
  flow: AlluvialSankeyLink
  pathData: string
  opacity: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = ({ flow, pathData, opacity, onMouseEnter, onMouseLeave }) => (
  <path
    d={pathData}
    fill="none"
    stroke={flow.color}
    strokeWidth={Math.max(1, flow.width || 1)}
    opacity={opacity}
    className="alluvial-flow-ribbon"
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    style={{
      transition: 'opacity 0.2s ease',
      cursor: 'pointer'
    }}
  >
    <title>
      {`${flow.flow.value} features: ${flow.flow.source} → ${flow.flow.target}`}
    </title>
  </path>
)

const NodeRect: React.FC<{
  node: AlluvialSankeyNode
  isHovered: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = ({ node, isHovered, onMouseEnter, onMouseLeave }) => {
  const color = getNodeColor(node.label)
  const style = getNodeStyle(isHovered)

  const x = node.x0 || 0
  const y = node.y0 || 0
  const width = (node.x1 || 0) - (node.x0 || 0)
  const height = (node.y1 || 0) - (node.y0 || 0)

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      fillOpacity={style.fillOpacity}
      stroke={style.strokeColor}
      strokeWidth={style.strokeWidth}
      rx={2}
      className="alluvial-node-rect"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <title>{`${node.label}: ${node.featureCount} features`}</title>
    </rect>
  )
}

const Legend: React.FC = () => {
  // Calculate approximate widths for each item (rect + gap + text)
  const itemWidths = [35, 35, 55, 35, 75] // Approximate widths for each label
  const gap = 10 // Gap between items
  const totalWidth = itemWidths.reduce((sum, w) => sum + w, 0) + (gap * (itemWidths.length - 1))
  const startX = (300 - totalWidth) / 2 - 5 // Center based on 300px width

  let currentX = startX

  return (
    <>
      {ALLUVIAL_LEGEND_ITEMS.map((item, index) => {
        const x = currentX
        currentX += itemWidths[index] + gap

        return (
          <g key={index} className="alluvial-legend-item">
            <rect
              x={x}
              y={580}
              width={10}
              height={10}
              fill={item.color}
              rx={2}
              opacity={0.8}
            />
            <text
              x={x+11}
              y={588}
              fontSize={10}
              fill="#4b5563"
              fontWeight={500}
            >
              {item.label}
            </text>
          </g>
        )
      })}
    </>
  )
}

// ==================== MAIN COMPONENT ====================

const AlluvialDiagram: React.FC<AlluvialDiagramProps> = ({
  width = 400,
  height = 600,
  className = ''
}) => {
  // Get data from store
  const alluvialFlows = useVisualizationStore(state => state.alluvialFlows)
  const leftSankeyData = useVisualizationStore(state => state.leftPanel.sankeyData)
  const rightSankeyData = useVisualizationStore(state => state.rightPanel.sankeyData)
  const setHoveredAlluvialNode = useVisualizationStore(state => state.setHoveredAlluvialNode)

  // State for interactions
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Resize observer for responsive width with minimal debounce
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: width,
    defaultHeight: height,
    debounceMs: 16  // ~60fps for smooth resizing
  })

  // Calculate Sankey layouts to get nodes with positions
  const leftLayout = useMemo(
    () => leftSankeyData ? calculateSankeyLayout(leftSankeyData, containerSize.width, height) : null,
    [leftSankeyData, containerSize.width, height]
  )

  const rightLayout = useMemo(
    () => rightSankeyData ? calculateSankeyLayout(rightSankeyData, containerSize.width, height) : null,
    [rightSankeyData, containerSize.width, height]
  )

  // Calculate alluvial layout using D3 utilities
  const layout = useMemo(
    () => calculateAlluvialLayout(
      alluvialFlows,
      containerSize.width,
      height,
      leftLayout?.nodes,
      rightLayout?.nodes
    ),
    [alluvialFlows, containerSize.width, height, leftLayout?.nodes, rightLayout?.nodes]
  )

  // Get connected flow IDs using utility function
  const hoveredNodeLinkIds = useMemo(
    () => getConnectedFlowIds(hoveredNodeId, layout.flows),
    [hoveredNodeId, layout.flows]
  )

  // Event handlers with useCallback for performance
  const handleNodeMouseEnter = useCallback(
    (nodeId: string, panel: 'left' | 'right') => {
      setHoveredNodeId(nodeId)
      const sankeyNodeId = nodeId.replace(/^(left_|right_)/, '')
      setHoveredAlluvialNode(sankeyNodeId, panel)
    },
    [setHoveredAlluvialNode]
  )

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
    setHoveredAlluvialNode(null, null)
  }, [setHoveredAlluvialNode])

  // Handle empty state
  if (!layout.flows.length) {
    return (
      <div className={`alluvial-diagram alluvial-diagram--empty ${className}`}>
        {!alluvialFlows ? (
          <EmptyState />
        ) : (
          <div className="alluvial-empty">
            <div className="alluvial-empty__icon">🌊</div>
            <h3 className="alluvial-empty__title">No Flows Available</h3>
            <p className="alluvial-empty__text">
              No overlapping features found between configurations
            </p>
          </div>
        )}
      </div>
    )
  }

  // Render the visualization
  return (
    <div ref={containerRef} className={`alluvial-diagram ${className}`} style={{ width: '100%', height }}>
      <svg
        width={containerSize.width}
        height={height}
        viewBox={`0 0 ${containerSize.width} ${height}`}
        className="alluvial-svg"
      >
        {/* Apply transform to position content with margins like SankeyDiagram */}
        <g transform={`translate(${ALLUVIAL_MARGIN.left},${ALLUVIAL_MARGIN.top})`}>
          {/* Render flows */}
          <g className="alluvial-flows">
          {layout.flows.map(flow => {
            const isFlowHovered = hoveredFlowId === flow.id
            const isConnectedToNode = hoveredNodeId !== null && hoveredNodeLinkIds.has(flow.id)

            const opacity = getFlowOpacity(
              isFlowHovered,
              isConnectedToNode,
              hoveredFlowId,
              hoveredNodeId,
              flow.opacity
            )

            // Get path data from D3 sankey generator
            const pathData = layout.sankeyGenerator && flow.source && flow.target
              ? layout.sankeyGenerator(flow) || ''
              : ''

            return (
              <FlowPath
                key={flow.id}
                flow={flow}
                pathData={pathData}
                opacity={opacity}
                onMouseEnter={() => setHoveredFlowId(flow.id)}
                onMouseLeave={() => setHoveredFlowId(null)}
              />
            )
          })}
        </g>

        {/* Render left nodes */}
        <g className="alluvial-left-nodes">
          {layout.leftNodes.map(node => (
            <NodeRect
              key={node.id}
              node={node}
              isHovered={hoveredNodeId === node.id}
              onMouseEnter={() => handleNodeMouseEnter(node.id, 'left')}
              onMouseLeave={handleNodeMouseLeave}
            />
          ))}
        </g>

        {/* Render right nodes */}
        <g className="alluvial-right-nodes">
          {layout.rightNodes.map(node => (
            <NodeRect
              key={node.id}
              node={node}
              isHovered={hoveredNodeId === node.id}
              onMouseEnter={() => handleNodeMouseEnter(node.id, 'right')}
              onMouseLeave={handleNodeMouseLeave}
            />
          ))}
        </g>
        </g>{/* Close transform group */}

        {/* Legend - Rendered directly in SVG */}
        <Legend />
      </svg>
    </div>
  )
}

export default AlluvialDiagram