import React, { useMemo, useState } from 'react'
import { useVisualizationStore } from '../store'
import { calculateAlluvialLayout, ALLUVIAL_COLORS, ALLUVIAL_OPACITY, ALLUVIAL_MARGIN } from '../lib/d3-alluvial-utils'
import type { AlluvialFlow } from '../types'

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
//   const leftPanel = useVisualizationStore(state => state.leftPanel)
//   const rightPanel = useVisualizationStore(state => state.rightPanel)

//   // Debug logging
//   console.log('🎯 AlluvialDiagram rendering:', {
//     alluvialFlows: alluvialFlows ? `${alluvialFlows.length} flows` : alluvialFlows,
//     leftViewState: leftPanel.viewState,
//     rightViewState: rightPanel.viewState
//   })

  // State for interactions
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Calculate layout using D3 (memoized for performance)
  const layout = useMemo(
    () => calculateAlluvialLayout(alluvialFlows, width, height),
    [alluvialFlows, width, height]
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
      {/* Statistics header */}
      {layout.stats && (
        <div className="alluvial-header">
          <h3 className="alluvial-title">Feature Flow Consistency</h3>
          <div className="alluvial-stats">
            <div className="alluvial-stat">
              <span className="alluvial-stat__value">{layout.stats.totalFeatures}</span>
              <span className="alluvial-stat__label">Features</span>
            </div>
            <div className="alluvial-stat">
              <span className="alluvial-stat__value">{layout.stats.totalFlows}</span>
              <span className="alluvial-stat__label">Flows</span>
            </div>
            <div className="alluvial-stat">
              <span
                className="alluvial-stat__value"
                style={{
                  color: layout.stats.consistencyRate > 50
                    ? ALLUVIAL_COLORS.consistent
                    : ALLUVIAL_COLORS.inconsistent
                }}
              >
                {layout.stats.consistencyRate.toFixed(1)}%
              </span>
              <span className="alluvial-stat__label">Consistent</span>
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
        {/* Render flows as paths */}
        <g className="alluvial-flows">
          {layout.flows.map(flow => {
            const isHovered = hoveredFlowId === flow.id
            const opacity = isHovered
              ? ALLUVIAL_OPACITY.hover
              : hoveredFlowId
                ? ALLUVIAL_OPACITY.inactive
                : flow.opacity

            return (
              <path
                key={flow.id}
                d={flow.path}
                stroke={flow.color}
                strokeWidth={flow.strokeWidth}
                fill="none"
                opacity={opacity}
                strokeLinecap="round"
                className="alluvial-flow-path"
                onMouseEnter={() => setHoveredFlowId(flow.id)}
                onMouseLeave={() => setHoveredFlowId(null)}
                style={{
                  transition: 'opacity 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                <title>
                  {`${flow.flow.value} features: ${flow.flow.sourceCategory} → ${flow.flow.targetCategory}`}
                </title>
              </path>
            )
          })}
        </g>

        {/* Left nodes as rectangles */}
        <g className="alluvial-left-nodes">
          <text
            x={ALLUVIAL_MARGIN.left}
            y={ALLUVIAL_MARGIN.top - 10}
            textAnchor="start"
            className="alluvial-panel-label"
            fontSize="12"
            fontWeight="600"
            fill="#374151"
          >
            Left Panel
          </text>
          {layout.leftNodes.map(node => {
            // Determine color based on category (using similar logic to flows)
            const baseColor = node.label === 'all' ? '#10b981' :
                             node.label === 'none' ? '#f59e0b' :
                             node.label.includes('1of') ? '#ef4444' :
                             node.label.includes('2of') ? '#f97316' : '#6b7280'

            const isHovered = hoveredNodeId === node.id
            const fillOpacity = isHovered ? 0.9 : 0.7
            const strokeWidth = isHovered ? 2 : 0.5
            const strokeColor = isHovered ? '#ffffff' : '#374151'

            return (
              <g key={node.id} className="alluvial-node-group">
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
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
                <text
                  x={node.x - 6}
                  y={node.centerY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="#374151"
                  fontWeight={isHovered ? "600" : "500"}
                  className="alluvial-node-label"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
                <text
                  x={node.x - 6}
                  y={node.centerY + 12}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="9"
                  fill="#6b7280"
                  className="alluvial-node-count"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.featureCount}
                </text>
              </g>
            )
          })}
        </g>

        {/* Right nodes as rectangles */}
        <g className="alluvial-right-nodes">
          <text
            x={width - ALLUVIAL_MARGIN.right}
            y={ALLUVIAL_MARGIN.top - 10}
            textAnchor="end"
            className="alluvial-panel-label"
            fontSize="12"
            fontWeight="600"
            fill="#374151"
          >
            Right Panel
          </text>
          {layout.rightNodes.map(node => {
            // Determine color based on category
            const baseColor = node.label === 'all' ? '#10b981' :
                             node.label === 'none' ? '#f59e0b' :
                             node.label.includes('1of') ? '#ef4444' :
                             node.label.includes('2of') ? '#f97316' : '#6b7280'

            const isHovered = hoveredNodeId === node.id
            const fillOpacity = isHovered ? 0.9 : 0.7
            const strokeWidth = isHovered ? 2 : 0.5
            const strokeColor = isHovered ? '#ffffff' : '#374151'

            return (
              <g key={node.id} className="alluvial-node-group">
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
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
                <text
                  x={node.x + node.width + 6}
                  y={node.centerY}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="#374151"
                  fontWeight={isHovered ? "600" : "500"}
                  className="alluvial-node-label"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
                <text
                  x={node.x + node.width + 6}
                  y={node.centerY + 12}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize="9"
                  fill="#6b7280"
                  className="alluvial-node-count"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.featureCount}
                </text>
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
      <div className="alluvial-legend">
        <div className="alluvial-legend-item">
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.consistent }}
          />
          <span>Same Category</span>
        </div>
        <div className="alluvial-legend-item">
          <div
            className="alluvial-legend-color"
            style={{ backgroundColor: ALLUVIAL_COLORS.inconsistent }}
          />
          <span>Different Category</span>
        </div>
      </div>
    </div>
  )
}

export default AlluvialDiagram