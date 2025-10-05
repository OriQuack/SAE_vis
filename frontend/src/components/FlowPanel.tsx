import React, { useMemo } from 'react'
import { OKABE_ITO_PALETTE, PAUL_TOL_BRIGHT } from '../lib/constants'
import { calculateFlowLayout, getIconTransform, splitLabel, type FlowNode } from '../lib/d3-flow-utils'
import '../styles/FlowPanel.css'

// ============================================================================
// ICON COMPONENTS - Cute SVG icons for each SAE method
// ============================================================================

const LLMExplainerIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Cute robot head */}
    <rect x="25" y="35" width="50" height="45" rx="12" fill={OKABE_ITO_PALETTE.ORANGE} />

    {/* Eyes - friendly teacher look */}
    <circle cx="38" cy="53" r="6" fill="white" />
    <circle cx="62" cy="53" r="6" fill="white" />
    <circle cx="38" cy="53" r="3" fill="#1f2937" />
    <circle cx="62" cy="53" r="3" fill="#1f2937" />

    {/* Neutral mouth */}
    <line x1="40" y1="65" x2="60" y2="65" stroke="white" strokeWidth="3" strokeLinecap="round" />

    {/* Glasses - teacher style */}
    <circle cx="38" cy="53" r="8" stroke="#1f2937" strokeWidth="2" fill="none" />
    <circle cx="62" cy="53" r="8" stroke="#1f2937" strokeWidth="2" fill="none" />
    <line x1="46" y1="53" x2="54" y2="53" stroke="#1f2937" strokeWidth="2" />

    {/* Graduation cap */}
    {/* Cap base */}
    <rect x="35" y="25" width="30" height="6" rx="1" fill="#1f2937" />
    {/* Cap top (mortarboard) */}
    <path d="M 30 25 L 70 25 L 68 20 L 32 20 Z" fill="#1f2937" />
    {/* Tassel */}
    <line x1="65" y1="20" x2="68" y2="15" stroke="#1f2937" strokeWidth="1.5" />
    <circle cx="68" cy="14" r="2" fill={OKABE_ITO_PALETTE.YELLOW} />

    {/* Book/document - teaching symbol */}
    <rect x="70" y="40" width="18" height="24" rx="2" fill="white" stroke={OKABE_ITO_PALETTE.ORANGE} strokeWidth="2" />
    <line x1="73" y1="47" x2="85" y2="47" stroke={OKABE_ITO_PALETTE.ORANGE} strokeWidth="1.5" />
    <line x1="73" y1="52" x2="85" y2="52" stroke={OKABE_ITO_PALETTE.ORANGE} strokeWidth="1.5" />
    <line x1="73" y1="57" x2="85" y2="57" stroke={OKABE_ITO_PALETTE.ORANGE} strokeWidth="1.5" />
  </svg>
)

const LLMScorerIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Cute robot head */}
    <rect x="25" y="35" width="50" height="45" rx="12" fill={OKABE_ITO_PALETTE.BLUE} />

    {/* Eyes - focused student look */}
    <circle cx="38" cy="53" r="6" fill="white" />
    <circle cx="62" cy="53" r="6" fill="white" />
    <circle cx="40" cy="53" r="3" fill="#1f2937" />
    <circle cx="64" cy="53" r="3" fill="#1f2937" />

    {/* Sad expression - linear mouth */}
    <line x1="38" y1="66" x2="62" y2="66" stroke="white" strokeWidth="3" strokeLinecap="round" />

    {/* Cute antenna */}
    <line x1="50" y1="35" x2="50" y2="22" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    <circle cx="50" cy="18" r="4" fill={OKABE_ITO_PALETTE.YELLOW} stroke="#1f2937" strokeWidth="1.5" />

    {/* Pencil - upside down */}
    {/* Pencil tip pointing up */}
    <polygon points="78,30 75,35 81,35" fill="#1f2937" />
    {/* Wood body */}
    <rect x="75" y="35" width="6" height="26" rx="1" fill={OKABE_ITO_PALETTE.YELLOW} />
    {/* Metal band */}
    <rect x="75" y="61" width="6" height="2" fill="#9CA3AF" />
    {/* Eraser */}
    <rect x="75" y="63" width="6" height="5" fill="#FF6B9D" />
  </svg>
)

const DecoderIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Neural network nodes */}
    <circle cx="30" cy="30" r="8" fill={PAUL_TOL_BRIGHT.GREEN} />
    <circle cx="30" cy="50" r="8" fill={PAUL_TOL_BRIGHT.GREEN} />
    <circle cx="30" cy="70" r="8" fill={PAUL_TOL_BRIGHT.GREEN} />

    <circle cx="70" cy="40" r="10" fill={PAUL_TOL_BRIGHT.GREEN} opacity="0.8" />
    <circle cx="70" cy="60" r="10" fill={PAUL_TOL_BRIGHT.GREEN} opacity="0.8" />

    {/* Connections (weights) */}
    <line x1="38" y1="30" x2="60" y2="40" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="2" opacity="0.5" />
    <line x1="38" y1="30" x2="60" y2="60" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="2" opacity="0.3" />

    <line x1="38" y1="50" x2="60" y2="40" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="3" opacity="0.7" />
    <line x1="38" y1="50" x2="60" y2="60" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="3" opacity="0.7" />

    <line x1="38" y1="70" x2="60" y2="40" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="2" opacity="0.3" />
    <line x1="38" y1="70" x2="60" y2="60" stroke={PAUL_TOL_BRIGHT.GREEN} strokeWidth="2" opacity="0.5" />

    {/* Weight indicators */}
    <text x="45" y="35" fontSize="10" fill={PAUL_TOL_BRIGHT.GREEN} fontWeight="bold">W</text>
    <text x="45" y="52" fontSize="10" fill={PAUL_TOL_BRIGHT.GREEN} fontWeight="bold">W</text>
    <text x="45" y="65" fontSize="10" fill={PAUL_TOL_BRIGHT.GREEN} fontWeight="bold">W</text>
  </svg>
)

const EmbeddingIcon: React.FC = () => (
  <svg viewBox="0 0 100 100" className="flow-icon">
    {/* Hub/Share icon - commonly used for embeddings/vectors */}
    {/* Center hub */}
    <circle cx="50" cy="50" r="8" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} />

    {/* Outer nodes */}
    <circle cx="50" cy="20" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />
    <circle cx="75" cy="35" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />
    <circle cx="75" cy="65" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />
    <circle cx="50" cy="80" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />
    <circle cx="25" cy="65" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />
    <circle cx="25" cy="35" r="6" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="0.8" />

    {/* Connection lines */}
    <line x1="50" y1="42" x2="50" y2="26" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
    <line x1="56" y1="44" x2="69" y2="36" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
    <line x1="56" y1="56" x2="69" y2="64" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
    <line x1="50" y1="58" x2="50" y2="74" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
    <line x1="44" y1="56" x2="31" y2="64" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
    <line x1="44" y1="44" x2="31" y2="36" stroke={OKABE_ITO_PALETTE.REDDISH_PURPLE} strokeWidth="3" />
  </svg>
)

// ============================================================================
// METHOD ITEM COMPONENT
// ============================================================================

interface MethodItemProps {
  icon: React.ReactNode
  title: string
  color: string
  badge?: string
}

const MethodItem: React.FC<MethodItemProps> = ({ icon, title, color, badge }) => (
  <div className="method-item">
    <div className="method-item__icon-container" style={{ backgroundColor: `${color}15`, position: 'relative' }}>
      {icon}
      {badge && (
        <div className="method-item__badge" style={{ backgroundColor: color }}>
          {badge}
        </div>
      )}
    </div>
    <span className="method-item__label" style={{ color }}>{title}</span>
  </div>
)

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
      return PAUL_TOL_BRIGHT.GREEN
    case 'explainer':
      return OKABE_ITO_PALETTE.ORANGE
    case 'scorer':
      return OKABE_ITO_PALETTE.BLUE
    case 'embedder':
      return OKABE_ITO_PALETTE.REDDISH_PURPLE
    default:
      return '#6b7280'
  }
}

const getIconBackgroundColor = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return `${PAUL_TOL_BRIGHT.GREEN}30`
    case 'explainer':
      return `${OKABE_ITO_PALETTE.ORANGE}30`
    case 'scorer':
      return `${OKABE_ITO_PALETTE.BLUE}30`
    case 'embedder':
      return `${OKABE_ITO_PALETTE.REDDISH_PURPLE}30`
    default:
      return 'white'
  }
}

const getTextNodeBackgroundColor = (nodeId: string) => {
  // Feature splitting - green tint (from decoder)
  if (nodeId === 'feature-splitting') {
    return `${PAUL_TOL_BRIGHT.GREEN}30`
  }
  // Semantic similarity & Embedding score - gradient from explainer (orange) to embedder (purple)
  if (nodeId === 'semantic-similarity' || nodeId === 'embedding-score') {
    return 'url(#gradient-semantic-similarity)'
  }
  // Fuzz and Detection scores - gradient from explainer (orange) to scorer (blue)
  if (nodeId === 'fuzz-score' || nodeId === 'detection-score') {
    return 'url(#gradient-scorer-metrics)'
  }
  // Activating Example - white background
  if (nodeId === 'activating-example') {
    return 'white'
  }
  // Default (Feature node)
  return '#f8fafc'
}

const getTextNodeFontSize = (nodeId: string) => {
  // Smaller font for activating example and explanation label
  if (nodeId === 'activating-example' || nodeId === 'explanation-label') {
    return '14'
  }
  // Default size for other nodes
  return '16'
}

const getTextNodeFontWeight = (nodeId: string) => {
  // Medium weight for activating example and explanation label
  if (nodeId === 'activating-example' || nodeId === 'explanation-label') {
    return '600'
  }
  // Bold for other nodes
  return '700'
}

const getTextNodeLetterSpacing = (nodeId: string) => {
  // Wider spacing for explanation label
  if (nodeId === 'explanation-label') {
    return '0.5'
  }
  return '0'
}

const getArrowMarker = (edgeColor: string) => {
  const colorMap: Record<string, string> = {
    [PAUL_TOL_BRIGHT.GREEN]: 'url(#arrow-green)',
    [OKABE_ITO_PALETTE.ORANGE]: 'url(#arrow-orange)',
    [OKABE_ITO_PALETTE.REDDISH_PURPLE]: 'url(#arrow-purple)',
    [OKABE_ITO_PALETTE.SKY_BLUE]: 'url(#arrow-blue)',
    '#475569': 'url(#arrow-gray)'
  }
  return colorMap[edgeColor] || 'url(#arrow-gray)'
}

const getBadgeText = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return '16k'
    case 'embedder':
      return '1'
    case 'scorer':
      return '3'
    case 'explainer':
      return '3'
    default:
      return null
  }
}

const getBadgeColor = (iconType?: string) => {
  switch (iconType) {
    case 'decoder':
      return PAUL_TOL_BRIGHT.GREEN
    case 'embedder':
      return OKABE_ITO_PALETTE.REDDISH_PURPLE
    case 'scorer':
      return OKABE_ITO_PALETTE.SKY_BLUE
    case 'explainer':
      return OKABE_ITO_PALETTE.ORANGE
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
        <svg viewBox="0 0 600 180" preserveAspectRatio="xMidYMid meet">
          {/* Define gradients */}
          <defs>
            {/* Semantic Similarity: Explainer (Orange) → Embedder (Purple) */}
            <linearGradient id="gradient-semantic-similarity" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={OKABE_ITO_PALETTE.ORANGE} stopOpacity="0.4" />
              <stop offset="30%" stopColor={OKABE_ITO_PALETTE.ORANGE} stopOpacity="0.4" />
              <stop offset="70%" stopColor={OKABE_ITO_PALETTE.REDDISH_PURPLE} stopOpacity="0.4" />
              <stop offset="100%" stopColor={OKABE_ITO_PALETTE.REDDISH_PURPLE} stopOpacity="0.4" />
            </linearGradient>

            {/* Fuzz & Detection Scores: Explainer (Orange) → Scorer (Blue) */}
            <linearGradient id="gradient-scorer-metrics" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={OKABE_ITO_PALETTE.ORANGE} stopOpacity="0.4" />
              <stop offset="30%" stopColor={OKABE_ITO_PALETTE.ORANGE} stopOpacity="0.4" />
              <stop offset="70%" stopColor={OKABE_ITO_PALETTE.SKY_BLUE} stopOpacity="0.4" />
              <stop offset="100%" stopColor={OKABE_ITO_PALETTE.SKY_BLUE} stopOpacity="0.4" />
            </linearGradient>

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
              <path d="M 0 0 L 10 5 L 0 10 z" fill={PAUL_TOL_BRIGHT.GREEN} opacity="1.0" />
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill={OKABE_ITO_PALETTE.ORANGE} opacity="1.0" />
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill={OKABE_ITO_PALETTE.REDDISH_PURPLE} opacity="1.0" />
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill={OKABE_ITO_PALETTE.SKY_BLUE} opacity="1.0" />
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
                      <circle
                        cx={node.x + node.width - 3}
                        cy={node.y + 3}
                        r="10"
                        fill={getBadgeColor(node.iconType)}
                      />
                      <text
                        x={node.x + node.width - 3}
                        y={node.y + 3}
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
                  {node.id === 'explanation-label' ? (
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
