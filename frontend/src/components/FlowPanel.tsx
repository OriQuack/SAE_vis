import React, { useMemo } from 'react'
import { NEUTRAL_ICON_COLORS, METRIC_COLORS, LLM_EXPLAINER_ICON_SVG, LLM_SCORER_ICON_SVG } from '../lib/constants'
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
    {/* Simplified 3-layer neural network - neutral colors */}
    {/* Input layer (3 nodes) */}
    <circle cx="30" cy="35" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="30" cy="50" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="30" cy="65" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />

    {/* Output layer (2 nodes) */}
    <circle cx="70" cy="42" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="70" cy="58" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />

    {/* Connections - simplified */}
    <line x1="36" y1="35" x2="64" y2="42" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="36" y1="50" x2="64" y2="42" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="36" y1="65" x2="64" y2="42" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />

    <line x1="36" y1="35" x2="64" y2="58" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="36" y1="50" x2="64" y2="58" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="36" y1="65" x2="64" y2="58" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
  </svg>
)

const EmbeddingIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Simplified hub/vector icon - neutral colors */}
    {/* Center hub */}
    <circle cx="50" cy="50" r="6" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />

    {/* Outer nodes (6 directions) */}
    <circle cx="50" cy="25" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="71" cy="38" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="71" cy="62" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="50" cy="75" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="29" cy="62" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />
    <circle cx="29" cy="38" r="5" fill="white" stroke={NEUTRAL_ICON_COLORS.ICON_FILL} strokeWidth="2" />

    {/* Connection lines */}
    <line x1="50" y1="44" x2="50" y2="30" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="55" y1="46" x2="66" y2="40" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="55" y1="54" x2="66" y2="60" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="50" y1="56" x2="50" y2="70" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="45" y1="54" x2="34" y2="60" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
    <line x1="45" y1="46" x2="34" y2="40" stroke={NEUTRAL_ICON_COLORS.ICON_LIGHT} strokeWidth="2" />
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

const getIconBorderColor = () => {
  // Use neutral colors for all icon borders to avoid competing with data visualization
  return NEUTRAL_ICON_COLORS.BORDER_MEDIUM
}

const getIconBackgroundColor = () => {
  // Use neutral light background for all icons to avoid competing with data visualization
  return NEUTRAL_ICON_COLORS.BACKGROUND_LIGHT
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
    return '11'
  }
  // Medium font for final output nodes
  if (nodeId === 'feature-splitting' || nodeId === 'semantic-similarity' || nodeId === 'embedding-score' ||
      nodeId === 'fuzz-score' || nodeId === 'detection-score') {
    return '12'
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

const getBadgeColor = () => {
  // Use neutral dark gray for all badges to avoid competing with data visualization
  return NEUTRAL_ICON_COLORS.BADGE_BACKGROUND
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
                    fill={getIconBackgroundColor()}
                    stroke={getIconBorderColor()}
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
                        fill={getBadgeColor()}
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
