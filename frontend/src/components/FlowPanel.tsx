import React, { useMemo, useState } from 'react'
import { NEUTRAL_ICON_COLORS, METRIC_COLORS } from '../lib/constants'
import { calculateFlowLayout, splitLabel, type FlowNode } from '../lib/d3-flow-utils'
import { useVisualizationStore } from '../store'
import '../styles/FlowPanel.css'

// ============================================================================
// NODE STYLING FUNCTIONS
// ============================================================================

const getTextNodeBackgroundColor = (nodeId: string) => {
  // Feature splitting - dark bluish green with opacity
  if (nodeId === 'feature-splitting') {
    return METRIC_COLORS.FEATURE_SPLITTING
  }
  // Semantic similarity - medium vermillion with opacity
  if (nodeId === 'semantic-similarity') {
    return METRIC_COLORS.SEMANTIC_SIMILARITY
  }
  // Embedding score - medium sky blue with opacity
  if (nodeId === 'embedding-score') {
    return METRIC_COLORS.SCORE_EMBEDDING
  }
  // Fuzz score - light sky blue with opacity
  if (nodeId === 'fuzz-score') {
    return METRIC_COLORS.SCORE_FUZZ
  }
  // Detection score - light sky blue with opacity
  if (nodeId === 'detection-score') {
    return METRIC_COLORS.SCORE_DETECTION
  }
  // Activating Example - white background
  if (nodeId === 'activating-example') {
    return 'white'
  }
  // Special nodes - gray background
  if (nodeId === 'feature' || nodeId === 'decoder' || nodeId === 'embedder' ||
      nodeId === 'llm-explainer-container' || nodeId === 'llm-scorer-container') {
    return '#e2e8f0'
  }
  // Default (ordinary nodes)
  return '#f8fafc'
}

const getTextNodeFontSize = (nodeId: string) => {
  // Smaller font for activating example and label nodes
  if (nodeId === 'activating-example' || nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
    return '11'
  }
  // Medium font for final output nodes
  if (nodeId === 'feature-splitting' || nodeId === 'semantic-similarity' || nodeId === 'embedding-score' ||
      nodeId === 'fuzz-score' || nodeId === 'detection-score') {
    return '13'
  }
  // Default size for other nodes
  return '16'
}

const getTextNodeFontWeight = (nodeId: string) => {
  // Medium weight for activating example and label nodes
  if (nodeId === 'activating-example' || nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
    return '600'
  }
  // Bold for other nodes
  return '700'
}

const getTextNodeLetterSpacing = (nodeId: string) => {
  // Wider spacing for label nodes
  if (nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
    return '0.5'
  }
  return '0'
}

const getArrowMarker = () => {
  // Use single gray arrow marker for all edges in neutral color scheme
  return 'url(#arrow-gray)'
}



// ============================================================================
// MAIN FLOW PANEL COMPONENT
// ============================================================================

const FlowPanel: React.FC = () => {
  // Get filter options and selected filters from store
  const filterOptions = useVisualizationStore(state => state.filterOptions)
  const leftPanelFilters = useVisualizationStore(state => state.leftPanel.filters)
  const rightPanelFilters = useVisualizationStore(state => state.rightPanel.filters)
  const setFilters = useVisualizationStore(state => state.setFilters)

  // Hover state for list items
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  // Get available explainer and scorer options
  const explainerOptions = filterOptions?.llm_explainer || []
  const scorerOptions = filterOptions?.llm_scorer || []

  // Get selected items from both panels
  const selectedExplainers = new Set([
    ...(leftPanelFilters.llm_explainer || []),
    ...(rightPanelFilters.llm_explainer || [])
  ])
  const selectedScorers = new Set([
    ...(leftPanelFilters.llm_scorer || []),
    ...(rightPanelFilters.llm_scorer || [])
  ])

  // Calculate layout with LLM options
  const flowLayout = useMemo(
    () => calculateFlowLayout(explainerOptions, scorerOptions),
    [explainerOptions, scorerOptions]
  )

  // Handle list item click
  const handleListItemClick = (llmType: 'explainer' | 'scorer', llmId: string) => {
    const filterKey = llmType === 'explainer' ? 'llm_explainer' : 'llm_scorer'
    const leftSelected = leftPanelFilters[filterKey] || []
    const rightSelected = rightPanelFilters[filterKey] || []
    const allSelected = new Set([...leftSelected, ...rightSelected])

    const isSelected = allSelected.has(llmId)

    if (isSelected) {
      // Remove from both panels
      setFilters({ [filterKey]: leftSelected.filter(v => v !== llmId) }, 'left')
      setFilters({ [filterKey]: rightSelected.filter(v => v !== llmId) }, 'right')
    } else {
      // Add to left panel if nothing selected, otherwise add to right panel
      if (leftSelected.length === 0) {
        setFilters({ [filterKey]: [llmId] }, 'left')
      } else {
        setFilters({ [filterKey]: [...rightSelected, llmId] }, 'right')
      }
    }
  }

  return (
    <div className="flow-panel">
      {/* D3-Calculated Flowchart */}
      <div className="flow-panel__chart">
        <svg viewBox="0 0 600 175" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Arrow marker - neutral color for all edges */}
            <marker
              id="arrow-gray"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={NEUTRAL_ICON_COLORS.ICON_FILL} opacity="1.0" />
            </marker>
          </defs>

          {/* Render container nodes first (bottom layer) */}
          {flowLayout.nodes.filter(node =>
            node.id === 'llm-explainer-container' || node.id === 'llm-scorer-container'
          ).map((node) => (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="6"
                fill={getTextNodeBackgroundColor(node.id)}
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <text
                x={node.x + node.width / 2}
                y={node.y + 15}
                textAnchor="middle"
                fontSize="14"
                fill="#475569"
                fontWeight="600"
              >
                {node.label}
              </text>
            </g>
          ))}

          {/* Render edges (connections) */}
          {flowLayout.edges.map((edge) => (
            <g key={edge.id}>
              <path
                d={edge.path}
                fill="none"
                stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
                markerEnd={getArrowMarker()}
              />
              {edge.label && edge.labelX && edge.labelY && (
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  fontSize="12"
                  fill={NEUTRAL_ICON_COLORS.TEXT_SECONDARY}
                  fontWeight="500"
                  fontStyle="italic"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}

          {/* Render non-container nodes (top layer) */}
          {flowLayout.nodes.filter(node =>
            node.id !== 'llm-explainer-container' && node.id !== 'llm-scorer-container'
          ).map((node) => {
            // Check if this is a list item node
            const isListItem = node.nodeType === 'list-item'
            const isSelected = isListItem && node.llmId && (
              node.llmType === 'explainer'
                ? selectedExplainers.has(node.llmId)
                : selectedScorers.has(node.llmId)
            )

            return (
              <g key={node.id}>
                {isListItem ? (
                  <>
                    {/* List item node (clickable LLM explainer/scorer) */}
                    <g
                      className="flow-panel__list-item"
                      style={{
                        cursor: 'pointer',
                        opacity: hoveredItem === node.id ? 0.9 : 1
                      }}
                      onClick={() => node.llmType && node.llmId && handleListItemClick(node.llmType, node.llmId)}
                      onMouseEnter={() => setHoveredItem(node.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx="3"
                        fill={isSelected ? '#dbeafe' : '#f8fafc'}
                        stroke={isSelected ? '#3b82f6' : '#cbd5e1'}
                        strokeWidth={isSelected ? '2' : '1.5'}
                      />
                      <text
                        x={node.x + node.width / 2}
                        y={node.y + node.height / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="11"
                        fill={isSelected ? '#1e40af' : '#64748b'}
                        fontWeight={isSelected ? '700' : '600'}
                      >
                        {node.label}
                      </text>
                      {/* Selection indicator (checkmark) */}
                      {isSelected && (
                        <text
                          x={node.x + node.width - 6}
                          y={node.y + node.height / 2 + 1}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="10"
                          fill="#3b82f6"
                          fontWeight="700"
                        >
                          ✓
                        </text>
                      )}
                    </g>
                  </>
                ) : (
                <>
                  {/* Text node */}
                  {node.id === 'explanation-label' || node.id === 'score-label' || node.id === 'embedding-label' ? (
                    <>
                      <g transform={`rotate(-90, ${node.x + node.width / 2}, ${node.y + node.height / 2})`}>
                        <rect
                          x={node.x}
                          y={node.y}
                          width={node.width}
                          height={node.height}
                          rx="4"
                          fill={getTextNodeBackgroundColor(node.id)}
                          stroke="#cbd5e1"
                          strokeWidth="1.5"
                        />
                        {splitLabel(node.label).map((line, i) => (
                          <text
                            key={i}
                            x={node.x + node.width / 2}
                            y={node.y + node.height / 2 + (i - (splitLabel(node.label).length - 1) / 2) * 12 + 4}
                            textAnchor="middle"
                            fontSize={getTextNodeFontSize(node.id)}
                            fill="#334155"
                            fontWeight={getTextNodeFontWeight(node.id)}
                            letterSpacing={getTextNodeLetterSpacing(node.id)}
                          >
                            {line}
                          </text>
                        ))}
                      </g>
                      {/* Badge for label nodes - horizontal (not rotated) */}
                      {node.badge && (
                        <>
                          <rect
                            x={node.badge.x}
                            y={node.badge.y}
                            width={node.badge.width}
                            height={node.badge.height}
                            rx={node.badge.rx}
                            fill={node.badge.fill}
                          />
                          <text
                            x={node.badge.textX}
                            y={node.badge.textY}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="10"
                            fill="white"
                            fontWeight="700"
                          >
                            {node.badge.text}
                          </text>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx="4"
                        fill={getTextNodeBackgroundColor(node.id)}
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      />
                      {splitLabel(node.label).map((line, i) => (
                        <text
                          key={i}
                          x={node.x + node.width / 2}
                          y={node.y + node.height / 2 + (i - (splitLabel(node.label).length - 1) / 2) * 12 + 4}
                          textAnchor="middle"
                          fontSize={getTextNodeFontSize(node.id)}
                          fill="#334155"
                          fontWeight={getTextNodeFontWeight(node.id)}
                          letterSpacing={getTextNodeLetterSpacing(node.id)}
                        >
                          {line}
                        </text>
                      ))}
                      {/* Badge for node */}
                      {node.badge && (
                        <>
                          <rect
                            x={node.badge.x}
                            y={node.badge.y}
                            width={node.badge.width}
                            height={node.badge.height}
                            rx={node.badge.rx}
                            fill={node.badge.fill}
                          />
                          <text
                            x={node.badge.textX}
                            y={node.badge.textY}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="10"
                            fill="white"
                            fontWeight="700"
                          >
                            {node.badge.text}
                          </text>
                        </>
                      )}
                    </>
                  )}
                </>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default FlowPanel
