import React, { useMemo, useState } from 'react'
import { NEUTRAL_ICON_COLORS } from '../lib/constants'
import { calculateFlowLayout, splitLabel } from '../lib/flow-utils'
import { useVisualizationStore } from '../store/index'
import '../styles/FlowPanel.css'

// ============================================================================
// NODE STYLING FUNCTIONS
// ============================================================================

const getTextNodeBackgroundColor = (nodeId: string) => {
  // Average operation node - white background
  if (nodeId === 'average-op') {
    return '#ffffff'
  }
  // Special nodes - gray background
  if (nodeId === 'feature' || nodeId === 'decoder' || nodeId === 'embedder' ||
      nodeId === 'llm-explainer-container' || nodeId === 'llm-scorer-container') {
    return '#e2e8f0'
  }
  // Default (ordinary nodes including all score nodes)
  return '#f8fafc'
}

const getTextNodeFontSize = (nodeId: string) => {
  // Smaller font for label nodes - reduced from 11 to 9
  if (nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
    return '9'
  }
  // Average operation node - medium font for symbol visibility
  if (nodeId === 'average-op') {
    return '14'
  }
  // Medium font for final output nodes - reduced from 13 to 11
  if (nodeId === 'decoder-similarity' || nodeId === 'semantic-similarity' || nodeId === 'embedding-score' ||
      nodeId === 'fuzz-score' || nodeId === 'detection-score' || nodeId === 'quality-score') {
    return '11'
  }
  // Default size for other nodes - reduced from 16 to 13
  return '13'
}

const getTextNodeFontWeight = (nodeId: string) => {
  // Medium weight for label nodes
  if (nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
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

const getTextNodeColor = (nodeId: string) => {
  // White text for quality score (dark background)
  if (nodeId === 'quality-score') {
    return '#ffffff'
  }
  // Default dark text for other nodes
  return '#334155'
}

const getArrowMarker = (isSelected: boolean) => {
  // Use blue arrow marker for edges connecting selected nodes, gray otherwise
  return isSelected ? 'url(#arrow-blue)' : 'url(#arrow-gray)'
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

  // Get available explainer and scorer options (memoized to prevent unnecessary recalculations)
  const explainerOptions = useMemo(() => filterOptions?.llm_explainer || [], [filterOptions?.llm_explainer])
  const scorerOptions = useMemo(() => filterOptions?.llm_scorer || [], [filterOptions?.llm_scorer])

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
  const baseFlowLayout = useMemo(
    () => calculateFlowLayout(explainerOptions, scorerOptions),
    [explainerOptions, scorerOptions]
  )

  // Update badges dynamically based on selected LLM counts
  const flowLayout = useMemo(() => {
    const numExplainers = selectedExplainers.size
    const numScorers = selectedScorers.size

    // Calculate badge values
    const explanationCount = 16 * numExplainers
    const embeddingCount = 16 * numExplainers
    const scoreCount = 16 * numExplainers * numScorers

    // Helper function to format count as "Xk"
    const formatCount = (count: number): string => {
      if (count === 0) return '0'
      return `${count}k`
    }

    // Helper function to calculate badge width based on text length
    const getBadgeWidth = (text: string): number => {
      return Math.max(24, text.length * 8 + 8)
    }

    // Update node badges
    const updatedNodes = baseFlowLayout.nodes.map(node => {
      if (node.badge) {
        let newBadgeText: string | undefined

        if (node.id === 'explanation-label') {
          newBadgeText = formatCount(explanationCount)
        } else if (node.id === 'embedding-label') {
          newBadgeText = formatCount(embeddingCount)
        } else if (node.id === 'score-label') {
          newBadgeText = formatCount(scoreCount)
        }

        if (newBadgeText) {
          const newBadgeWidth = getBadgeWidth(newBadgeText)
          const widthDiff = newBadgeWidth - node.badge.width

          return {
            ...node,
            badge: {
              ...node.badge,
              text: newBadgeText,
              width: newBadgeWidth,
              textX: node.badge.textX + widthDiff / 2
            }
          }
        }
      }
      return node
    })

    return {
      ...baseFlowLayout,
      nodes: updatedNodes
    }
  }, [baseFlowLayout, selectedExplainers.size, selectedScorers.size])

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
        <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Arrow marker - neutral gray for unselected edges */}
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
            {/* Arrow marker - blue for edges connecting selected nodes */}
            <marker
              id="arrow-blue"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" opacity="1.0" />
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
                fontSize="12"
                fill="#475569"
                fontWeight="600"
              >
                {node.label}
              </text>
            </g>
          ))}

          {/* Render edges (connections) */}
          {flowLayout.edges.map((edge) => {
            // Check if source or target nodes are selected list items
            const sourceNode = flowLayout.nodes.find(n => n.id === edge.source)
            const targetNode = flowLayout.nodes.find(n => n.id === edge.target)

            const isSourceSelected = !!(sourceNode?.nodeType === 'list-item' && sourceNode.llmId && (
              sourceNode.llmType === 'explainer'
                ? selectedExplainers.has(sourceNode.llmId)
                : selectedScorers.has(sourceNode.llmId)
            ))

            const isTargetSelected = !!(targetNode?.nodeType === 'list-item' && targetNode.llmId && (
              targetNode.llmType === 'explainer'
                ? selectedExplainers.has(targetNode.llmId)
                : selectedScorers.has(targetNode.llmId)
            ))

            // Always blue: Feature→Decoder→Decoder-Similarity path (always active)
            const isAlwaysBluePath = (edge.source === 'feature' && edge.target === 'decoder') ||
                                     (edge.source === 'decoder' && edge.target === 'decoder-similarity')

            // Special case: Embedder outgoing edges are blue if any explainer is selected
            const isEmbedderOutgoing = edge.source === 'embedder' && selectedExplainers.size > 0

            // Special case: Explainer→Scorer edges only blue if explainer (source) is selected, not scorer (target)
            const isExplainerToScorer = sourceNode?.llmType === 'explainer' && targetNode?.llmType === 'scorer'

            // Special case: Scorer→Metric edges only blue if scorer is selected AND at least one explainer is selected
            const isScorerToMetric = sourceNode?.llmType === 'scorer' &&
              (edge.target === 'fuzz-score' || edge.target === 'detection-score')

            // Edge selection logic:
            // - Always blue path: feature→decoder→decoder-similarity
            // - For explainer→scorer edges: only check source (explainer) selection
            // - For scorer→metric edges: require both scorer selection AND at least one explainer selected
            // - For other edges: check if either source OR target is selected, OR embedder outgoing
            const isEdgeSelected = isAlwaysBluePath ||
              (isExplainerToScorer
                ? isSourceSelected
                : isScorerToMetric
                  ? (isSourceSelected && selectedExplainers.size > 0)
                  : (isSourceSelected || isTargetSelected || isEmbedderOutgoing))

            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={isEdgeSelected ? '#3b82f6' : NEUTRAL_ICON_COLORS.ICON_LIGHT}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                  markerEnd={edge.noArrowhead ? undefined : getArrowMarker(isEdgeSelected)}
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
            )
          })}

          {/* Render non-container nodes (top layer) */}
          {flowLayout.nodes.filter(node =>
            node.id !== 'llm-explainer-container' && node.id !== 'llm-scorer-container'
          ).map((node) => {
            // Check if this is a list item node
            const isListItem = node.nodeType === 'list-item'
            const isSelected = !!(isListItem && node.llmId && (
              node.llmType === 'explainer'
                ? selectedExplainers.has(node.llmId)
                : selectedScorers.has(node.llmId)
            ))

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
                        x={node.x + node.width / 2 - 6}
                        y={node.y + node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                        fill={isSelected ? '#1e40af' : '#64748b'}
                        fontWeight={isSelected ? '700' : '600'}
                      >
                        {node.label}
                      </text>
                      {/* Selection indicator (💬 for explainer, 🎯 for scorer) */}
                      {isSelected && (
                        <text
                          x={node.x + node.width - 10}
                          y={node.y + node.height / 2 - 1}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="13"
                        >
                          {node.llmType === 'explainer' ? '💬' : '🎯'}
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
                            fill={getTextNodeColor(node.id)}
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
                            fontSize="9"
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
                          fill={getTextNodeColor(node.id)}
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
