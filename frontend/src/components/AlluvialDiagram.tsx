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
import type { AlluvialSankeyNode, AlluvialSankeyLink } from '../types'

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

const Legend: React.FC = () => (
  <div
    className="alluvial-legend"
    style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '16px',
      padding: '8px',
      fontSize: '11px',
      flexWrap: 'wrap'
    }}
  >
    {ALLUVIAL_LEGEND_ITEMS.map((item, index) => (
      <div
        key={index}
        className="alluvial-legend-item"
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <div
          className="alluvial-legend-color"
          style={{
            backgroundColor: item.color,
            width: '12px',
            height: '12px',
            borderRadius: '2px'
          }}
        />
        <span>{item.label}</span>
      </div>
    ))}
  </div>
)

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

  // Calculate Sankey layouts to get nodes with positions
  const leftLayout = useMemo(
    () => leftSankeyData ? calculateSankeyLayout(leftSankeyData, width, height) : null,
    [leftSankeyData, width, height]
  )

  const rightLayout = useMemo(
    () => rightSankeyData ? calculateSankeyLayout(rightSankeyData, width, height) : null,
    [rightSankeyData, width, height]
  )

  // Calculate alluvial layout using D3 utilities
  const layout = useMemo(
    () => calculateAlluvialLayout(
      alluvialFlows,
      width,
      height,
      leftLayout?.nodes,
      rightLayout?.nodes
    ),
    [alluvialFlows, width, height, leftLayout?.nodes, rightLayout?.nodes]
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
    <div className={`alluvial-diagram ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="alluvial-svg"
      >
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
      </svg>

      {/* Legend */}
      <Legend />
    </div>
  )
}

export default AlluvialDiagram