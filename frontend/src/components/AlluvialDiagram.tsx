import React, { useMemo, useState } from 'react'
import { useVisualizationStore } from '../store'
import { calculateAlluvialLayout, ALLUVIAL_COLORS, ALLUVIAL_OPACITY } from '../lib/d3-alluvial-utils'
import type { AlluvialSankeyNode, AlluvialSankeyLink } from '../lib/d3-alluvial-utils'

// ==================== TYPES ====================

interface AlluvialDiagramProps {
  width?: number
  height?: number
  className?: string
}

// ==================== REACT COMPONENT ====================

const AlluvialDiagram: React.FC<AlluvialDiagramProps> = ({
  width = 400,
  height = 600,
  className = ''
}) => {
  // Get data from store
  const alluvialFlows = useVisualizationStore(state => state.alluvialFlows)
  const leftSankeyData = useVisualizationStore(state => state.leftPanel.sankeyData)
  const rightSankeyData = useVisualizationStore(state => state.rightPanel.sankeyData)

  // State for interactions
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Calculate layout using D3 (memoized for performance)
  const layout = useMemo(
    () => calculateAlluvialLayout(
      alluvialFlows,
      width,
      height,
      leftSankeyData?.nodes,
      rightSankeyData?.nodes
    ),
    [alluvialFlows, width, height, leftSankeyData?.nodes, rightSankeyData?.nodes]
  )

  // Handle empty state
  if (!layout.flows.length) {
    return (
      <div className={`alluvial-diagram alluvial-diagram--empty ${className}`}>
        <div className="alluvial-empty">
          <div className="alluvial-empty__icon">🌊</div>
          <h3 className="alluvial-empty__title">No Flows Available</h3>
          <p className="alluvial-empty__text">
            {!alluvialFlows
              ? 'Create visualizations in both panels to see feature flows'
              : 'No overlapping features found between configurations'}
          </p>
        </div>
      </div>
    )
  }

  // React renders all elements
  return (
    <div className={`alluvial-diagram ${className}`}>
      {/* Compact statistics header */}
      {layout.stats && (
        <div className="alluvial-header" style={{ padding: '8px 12px', marginBottom: '8px', background: 'transparent' }}>
          <div className="alluvial-stats" style={{ display: 'flex', justifyContent: 'space-around', gap: '12px' }}>
            <div className="alluvial-stat" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className="alluvial-stat__value" style={{ fontSize: '14px', fontWeight: '600' }}>{layout.stats.totalFeatures}</span>
              <span className="alluvial-stat__label" style={{ fontSize: '10px', color: '#6b7280' }}>Features</span>
            </div>
            <div className="alluvial-stat" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className="alluvial-stat__value" style={{ fontSize: '14px', fontWeight: '600' }}>{layout.stats.totalFlows}</span>
              <span className="alluvial-stat__label" style={{ fontSize: '10px', color: '#6b7280' }}>Flows</span>
            </div>
            <div className="alluvial-stat" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                className="alluvial-stat__value"
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: layout.stats.consistencyRate > 50
                    ? ALLUVIAL_COLORS.consistent
                    : ALLUVIAL_COLORS.inconsistent
                }}
              >
                {layout.stats.consistencyRate.toFixed(1)}%
              </span>
              <span className="alluvial-stat__label" style={{ fontSize: '10px', color: '#6b7280' }}>Consistent</span>
            </div>
          </div>
        </div>
      )}

      {/* SVG visualization */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="alluvial-svg"
      >
        {/* Render flows as curved ribbons with proper width */}
        <g className="alluvial-flows">
          {layout.flows.map((flow: AlluvialSankeyLink) => {
            const isHovered = hoveredFlowId === flow.id
            const opacity = isHovered
              ? ALLUVIAL_OPACITY.hover
              : hoveredFlowId
                ? ALLUVIAL_OPACITY.inactive
                : flow.opacity

            // Create path data using sankeyLinkHorizontal
            // The link object from d3-sankey has source and target nodes with coordinates
            let pathData = ''
            if (layout.sankeyGenerator && flow.source && flow.target) {
              // After d3-sankey processing, source and target should be node objects with coordinates
              pathData = layout.sankeyGenerator(flow) || ''
            }

            // Get the flow width from d3-sankey calculations
            const flowWidth = Math.max(1, flow.width || 1)

            return (
              <path
                key={flow.id}
                d={pathData}
                fill="none"
                stroke={flow.color}
                strokeWidth={flowWidth}
                opacity={opacity}
                className="alluvial-flow-ribbon"
                onMouseEnter={() => setHoveredFlowId(flow.id)}
                onMouseLeave={() => setHoveredFlowId(null)}
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
          })}
        </g>

        {/* Left nodes as rectangles */}
        <g className="alluvial-left-nodes">
          <text
            x={30}
            y={15}
            textAnchor="start"
            className="alluvial-panel-label"
            fontSize="10"
            fontWeight="500"
            fill="#6b7280"
          >
            Left Panel
          </text>
          {layout.leftNodes.map((node: AlluvialSankeyNode) => {
            // Determine color based on category (using similar logic to flows)
            const baseColor = node.label === 'all' ? '#10b981' :
                             node.label === 'none' ? '#f59e0b' :
                             node.label.includes('1of') ? '#ef4444' :
                             node.label.includes('2of') ? '#f97316' : '#6b7280'

            const isHovered = hoveredNodeId === node.id
            const fillOpacity = isHovered ? 0.9 : 0.7
            const strokeWidth = isHovered ? 2 : 0.5
            const strokeColor = isHovered ? '#ffffff' : '#374151'

            // Use d3-sankey calculated positions
            const x = node.x0 || 0
            const y = node.y0 || 0
            const nodeWidth = (node.x1 || 0) - (node.x0 || 0)
            const nodeHeight = (node.y1 || 0) - (node.y0 || 0)
            const centerY = y + nodeHeight / 2

            return (
              <g key={node.id} className="alluvial-node-group">
                <rect
                  x={x}
                  y={y}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill={baseColor}
                  fillOpacity={fillOpacity}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  rx={2}
                  className="alluvial-node-rect"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  <title>{`${node.label}: ${node.featureCount} features`}</title>
                </rect>
              </g>
            )
          })}
        </g>

        {/* Right nodes as rectangles */}
        <g className="alluvial-right-nodes">
          <text
            x={width - 30}
            y={15}
            textAnchor="end"
            className="alluvial-panel-label"
            fontSize="10"
            fontWeight="500"
            fill="#6b7280"
          >
            Right Panel
          </text>
          {layout.rightNodes.map((node: AlluvialSankeyNode) => {
            // Determine color based on category
            const baseColor = node.label === 'all' ? '#10b981' :
                             node.label === 'none' ? '#f59e0b' :
                             node.label.includes('1of') ? '#ef4444' :
                             node.label.includes('2of') ? '#f97316' : '#6b7280'

            const isHovered = hoveredNodeId === node.id
            const fillOpacity = isHovered ? 0.9 : 0.7
            const strokeWidth = isHovered ? 2 : 0.5
            const strokeColor = isHovered ? '#ffffff' : '#374151'

            // Use d3-sankey calculated positions
            const x = node.x0 || 0
            const y = node.y0 || 0
            const nodeWidth = (node.x1 || 0) - (node.x0 || 0)
            const nodeHeight = (node.y1 || 0) - (node.y0 || 0)
            const centerY = y + nodeHeight / 2

            return (
              <g key={node.id} className="alluvial-node-group">
                <rect
                  x={x}
                  y={y}
                  width={nodeWidth}
                  height={nodeHeight}
                  fill={baseColor}
                  fillOpacity={fillOpacity}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  rx={2}
                  className="alluvial-node-rect"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  <title>{`${node.label}: ${node.featureCount} features`}</title>
                </rect>
              </g>
            )
          })}
        </g>

        {/* Hover tooltip */}
        {hoveredFlowId && (
          <g className="alluvial-tooltip" style={{ pointerEvents: 'none' }}>
            {/* Tooltip implementation could go here */}
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="alluvial-legend" style={{ display: 'flex', justifyContent: 'center', gap: '16px', padding: '8px', fontSize: '11px', flexWrap: 'wrap', background: 'transparent' }}>
        <div className="alluvial-legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.trivial, width: '12px', height: '12px', borderRadius: '2px' }}
          />
          <span>Trivial (Same)</span>
        </div>
        <div className="alluvial-legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.minor, width: '12px', height: '12px', borderRadius: '2px' }}
          />
          <span>Minor (1 level)</span>
        </div>
        <div className="alluvial-legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.moderate, width: '12px', height: '12px', borderRadius: '2px' }}
          />
          <span>Moderate (2 levels)</span>
        </div>
        <div className="alluvial-legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.major, width: '12px', height: '12px', borderRadius: '2px' }}
          />
          <span>Major (3+ levels)</span>
        </div>
        <div className="alluvial-legend-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.differentStage, width: '12px', height: '12px', borderRadius: '2px' }}
          />
          <span>Different Stage</span>
        </div>
      </div>
    </div>
  )
}

export default AlluvialDiagram