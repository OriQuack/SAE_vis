import React, { useMemo } from 'react'
import { COMPONENT_COLORS, getComponentBackgroundColor, METRIC_COLORS, LLM_EXPLAINER_ICON_SVG, LLM_SCORER_ICON_SVG } from '../lib/constants'
import { calculateFlowLayout, getIconTransform, splitLabel, type FlowNode } from '../lib/d3-flow-utils'
import '../styles/FlowPanel.css'

// ============================================================================
// ICON COMPONENTS - Cute SVG icons for each SAE method
// ============================================================================

const LLMExplainerIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon" dangerouslySetInnerHTML={{ __html: LLM_EXPLAINER_ICON_SVG }} />
)

const LLMScorerIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon" dangerouslySetInnerHTML={{ __html: LLM_SCORER_ICON_SVG }} />
)

const DecoderIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Neural network nodes */}
    <circle cx="30" cy="30" r="8" fill={COMPONENT_COLORS.DECODER} />
    <circle cx="30" cy="50" r="8" fill={COMPONENT_COLORS.DECODER} />
    <circle cx="30" cy="70" r="8" fill={COMPONENT_COLORS.DECODER} />

    <circle cx="70" cy="40" r="10" fill={COMPONENT_COLORS.DECODER} opacity="0.8" />
    <circle cx="70" cy="60" r="10" fill={COMPONENT_COLORS.DECODER} opacity="0.8" />

    {/* Connections (weights) */}
    <line x1="38" y1="30" x2="60" y2="40" stroke={COMPONENT_COLORS.DECODER} strokeWidth="2" opacity="0.5" />
    <line x1="38" y1="30" x2="60" y2="60" stroke={COMPONENT_COLORS.DECODER} strokeWidth="2" opacity="0.3" />

    <line x1="38" y1="50" x2="60" y2="40" stroke={COMPONENT_COLORS.DECODER} strokeWidth="3" opacity="0.7" />
    <line x1="38" y1="50" x2="60" y2="60" stroke={COMPONENT_COLORS.DECODER} strokeWidth="3" opacity="0.7" />

    <line x1="38" y1="70" x2="60" y2="40" stroke={COMPONENT_COLORS.DECODER} strokeWidth="2" opacity="0.3" />
    <line x1="38" y1="70" x2="60" y2="60" stroke={COMPONENT_COLORS.DECODER} strokeWidth="2" opacity="0.5" />

    {/* Weight indicators */}
    <text x="45" y="35" fontSize="10" fill={COMPONENT_COLORS.DECODER} fontWeight="bold">W</text>
    <text x="45" y="52" fontSize="10" fill={COMPONENT_COLORS.DECODER} fontWeight="bold">W</text>
    <text x="45" y="65" fontSize="10" fill={COMPONENT_COLORS.DECODER} fontWeight="bold">W</text>
  </svg>
)

const EmbeddingIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Hub/Share icon - commonly used for embeddings/vectors */}
    {/* Center hub */}
    <circle cx="50" cy="50" r="8" fill={COMPONENT_COLORS.EMBEDDER} />

    {/* Outer nodes */}
    <circle cx="50" cy="20" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />
    <circle cx="75" cy="35" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />
    <circle cx="75" cy="65" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />
    <circle cx="50" cy="80" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />
    <circle cx="25" cy="65" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />
    <circle cx="25" cy="35" r="6" fill={COMPONENT_COLORS.EMBEDDER} opacity="0.8" />

    {/* Connection lines */}
    <line x1="50" y1="42" x2="50" y2="26" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
    <line x1="56" y1="44" x2="69" y2="36" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
    <line x1="56" y1="56" x2="69" y2="64" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
    <line x1="50" y1="58" x2="50" y2="74" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
    <line x1="44" y1="56" x2="31" y2="64" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
    <line x1="44" y1="44" x2="31" y2="36" stroke={COMPONENT_COLORS.EMBEDDER} strokeWidth="3" />
  </svg>
)

// ============================================================================
// METHOD ITEM COMPONENT
// ============================================================================

// interface MethodItemProps {
//   icon: React.ReactNode
//   title: string
//   color: string
//   badge?: string
// }

// const MethodItem: React.FC<MethodItemProps> = ({ icon, title, color, badge }) => (
//   <div className="method-item">
//     <div className="method-item__icon-container" style={{ backgroundColor: `${color}15`, position: 'relative' }}>
//       {icon}
//       {badge && (
//         <div className="method-item__badge" style={{ backgroundColor: color }}>
//           {badge}
//         </div>
//       )}
//     </div>
//     <span className="method-item__label" style={{ color }}>{title}</span>
//   </div>
// )

// ============================================================================
// ICON RENDERER - Renders icon based on node type
// ============================================================================

const renderIconForNode = (node: FlowNode) => {
  switch (node.iconType) {
    case 'decoder':
      return <DecoderIcon />
    case 'explainer':
      return <LLMExplainerIcon />
    case 'scorer':
      return <LLMScorerIcon />
    case 'embedder':
      return <EmbeddingIcon />
    default:
      return null
  }
}

const getIconBorderColor = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return COMPONENT_COLORS.DECODER
    case 'explainer':
      return COMPONENT_COLORS.EXPLAINER
    case 'scorer':
      return COMPONENT_COLORS.SCORER
    case 'embedder':
      return COMPONENT_COLORS.EMBEDDER
    default:
      return '#6b7280'
  }
}

const getIconBackgroundColor = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
    case 'explainer':
    case 'scorer':
    case 'embedder':
      return getComponentBackgroundColor(iconType)
    default:
      return 'white'
  }
}

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
  // Default (Feature node)
  return '#f8fafc'
}

const getTextNodeFontSize = (nodeId: string) => {
  // Smaller font for activating example and label nodes
  if (nodeId === 'activating-example' || nodeId === 'explanation-label' || nodeId === 'score-label' || nodeId === 'embedding-label') {
    return '12'
  }
  // Medium font for final output nodes
  if (nodeId === 'feature-splitting' || nodeId === 'semantic-similarity' || nodeId === 'embedding-score' ||
      nodeId === 'fuzz-score' || nodeId === 'detection-score') {
    return '15'
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

const getArrowMarker = (edgeColor: string) => {
  const colorMap: Record<string, string> = {
    [COMPONENT_COLORS.DECODER]: 'url(#arrow-green)',
    [COMPONENT_COLORS.EXPLAINER]: 'url(#arrow-orange)',
    [COMPONENT_COLORS.EMBEDDER]: 'url(#arrow-purple)',
    [COMPONENT_COLORS.SCORER]: 'url(#arrow-blue)',
    '#475569': 'url(#arrow-gray)'
  }
  return colorMap[edgeColor] || 'url(#arrow-gray)'
}

const getBadgeText = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return '×1'
    case 'embedder':
      return '×1'
    case 'scorer':
      return '×3'
    case 'explainer':
      return '×3'
    default:
      return null
  }
}

const getBadgeColor = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return COMPONENT_COLORS.DECODER
    case 'embedder':
      return COMPONENT_COLORS.EMBEDDER
    case 'scorer':
      return COMPONENT_COLORS.SCORER
    case 'explainer':
      return COMPONENT_COLORS.EXPLAINER
    default:
      return '#6b7280'
  }
}

// ============================================================================
// MAIN FLOW PANEL COMPONENT
// ============================================================================

const FlowPanel: React.FC = () => {
  // Calculate layout once - no dynamic resizing needed
  const flowLayout = useMemo(() => calculateFlowLayout(), [])

  return (
    <div className="flow-panel">
      {/* Left: Method Icons Grid
      <div className="flow-panel__icons">
        <div className="flow-panel__row">
          <MethodItem
            icon={<DecoderIcon />}
            title="Decoder"
            color={PAUL_TOL_BRIGHT.GREEN}
            badge="16k"
          />
          <MethodItem
            icon={<EmbeddingIcon />}
            title="Embedding"
            color={OKABE_ITO_PALETTE.REDDISH_PURPLE}
            badge="1"
          />
        </div>

        <div className="flow-panel__row">
          <MethodItem
            icon={<LLMScorerIcon />}
            title="LLM Scorer"
            color={OKABE_ITO_PALETTE.BLUE}
            badge="3"
          />
          <MethodItem
            icon={<LLMExplainerIcon />}
            title="LLM Explainer"
            color={OKABE_ITO_PALETTE.ORANGE}
            badge="3"
          />
        </div>
      </div> */}

      {/* Right: D3-Calculated Flowchart */}
      <div className="flow-panel__chart">
        <svg viewBox="0 0 600 175" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Arrow markers for each edge color */}
            <marker
              id="arrow-gray"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" opacity="1.0" />
            </marker>

            <marker
              id="arrow-green"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COMPONENT_COLORS.DECODER} opacity="1.0" />
            </marker>

            <marker
              id="arrow-orange"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COMPONENT_COLORS.EXPLAINER} opacity="1.0" />
            </marker>

            <marker
              id="arrow-purple"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COMPONENT_COLORS.EMBEDDER} opacity="1.0" />
            </marker>

            <marker
              id="arrow-blue"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COMPONENT_COLORS.SCORER} opacity="1.0" />
            </marker>
          </defs>

          {/* Render edges (connections) */}
          {flowLayout.edges.map((edge) => (
            <g key={edge.id}>
              <path
                d={edge.path}
                fill="none"
                stroke={edge.color || '#475569'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
                markerEnd={getArrowMarker(edge.color || '#475569')}
              />
              {edge.label && edge.labelX && edge.labelY && (
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#64748b"
                  fontWeight="500"
                  fontStyle="italic"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}

          {/* Render nodes */}
          {flowLayout.nodes.map((node) => (
            <g key={node.id}>
              {node.iconType ? (
                <>
                  {/* Icon node with embedded icon */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="6"
                    fill={getIconBackgroundColor(node.iconType)}
                    stroke={getIconBorderColor(node.iconType)}
                    strokeWidth="2"
                  />
                  <g transform={getIconTransform(node)}>
                    {renderIconForNode(node)}
                  </g>
                  {/* Badge */}
                  {getBadgeText(node.iconType) && (
                    <>
                      <rect
                        x={node.x + node.width - 20}
                        y={node.y - 10}
                        width="24"
                        height="18"
                        rx="9"
                        fill={getBadgeColor(node.iconType)}
                      />
                      <text
                        x={node.x + node.width - 8}
                        y={node.y - 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                        fill="white"
                        fontWeight="700"
                      >
                        {getBadgeText(node.iconType)}
                      </text>
                    </>
                  )}
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
                      <rect
                        x={node.x + node.width / 2 - (node.id === 'score-label' ? 2 : 0)}
                        y={node.y - (node.id === 'explanation-label' ? 50 : node.id === 'score-label' ? 30 : 45)}
                        width={node.id === 'score-label' ? 32 : 28}
                        height="18"
                        rx="9"
                        fill="#475569"
                      />
                      <text
                        x={node.x + node.width / 2 + 14}
                        y={node.y - (node.id === 'explanation-label' ? 41 : node.id === 'score-label' ? 21 : 36)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                        fill="white"
                        fontWeight="700"
                      >
                        {node.id === 'explanation-label' ? '48k' : node.id === 'score-label' ? '144k' : node.id === 'embedding-label' ? '48k' : '3'}
                      </text>
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
                      {/* Badge for Feature node */}
                      {node.id === 'feature' && (
                        <>
                          <rect
                            x={node.x + node.width - 20}
                            y={node.y - 10}
                            width="24"
                            height="18"
                            rx="9"
                            fill="#475569"
                          />
                          <text
                            x={node.x + node.width - 8}
                            y={node.y-1}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="10"
                            fill="white"
                            fontWeight="700"
                          >
                            16k
                          </text>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

export default FlowPanel
