import React from 'react'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE, UNSURE_GRAY } from '../lib/constants'
import { t, USE_KOREAN } from '../lib/i18n'
import '../styles/LabelingGuidePopup.css'

// ============================================================================
// LABELING GUIDE POPUP - Decision flowchart for labeling guidance
// ============================================================================
// Data-driven flowchart popup. Each stage defines its own node layout.
// Extendable: add STAGE_2_CONFIG, STAGE_3_CONFIG with same pattern.

interface FlowchartNode {
  id: string
  type: 'question' | 'outcome'
  text: string
  tag?: string         // Tag name (for outcome coloring via getTagColor)
  categoryId?: string  // Tag category id
  // Layout positions (hand-tuned per stage)
  x: number
  y: number
  width: number
  height: number
}

interface FlowchartEdge {
  from: string
  to: string
  label: string
  // Path control points
  points: Array<{ x: number; y: number }>
}

interface FlowchartConfig {
  stageLabel: string
  viewBox: string
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
}

// ============================================================================
// STAGE CONFIGS
// ============================================================================

const STAGE_1_CONFIG: FlowchartConfig = {
  stageLabel: 'Structural Soundness',
  viewBox: '0 0 480 340',
  nodes: [
    {
      id: 'q1', type: 'question',
      text: t('Can you find an overarching concept that encompasses all its activating examples for each feature?', '각 feature의 모든 activating example을 아우르는 특징적인 개념을 찾을 수 있는가?'),
      x: 60, y: 20, width: 360, height: 56
    },
    {
      id: 'q2', type: 'question',
      text: t('Can you separate shuffled activating examples into the original feature they belong to?', '섞인 activating example들을 원래 속한 feature로 분리할 수 있는가?'),
      x: 200, y: 150, width: 260, height: 56
    },
    {
      id: 'monosemantic', type: 'outcome',
      text: 'Monosemantic',
      tag: 'Monosemantic', categoryId: TAG_CATEGORY_FEATURE_SPLITTING,
      x: 20, y: 260, width: 140, height: 44
    },
    {
      id: 'incoherent', type: 'outcome',
      text: 'Incoherent Splitting',
      tag: 'Incoherent Splitting', categoryId: TAG_CATEGORY_FEATURE_SPLITTING,
      x: 300, y: 260, width: 160, height: 44
    },
  ],
  edges: [
    // Q1 --Yes--> Q2  (exit Q1 bottom-right at x=330)
    {
      from: 'q1', to: 'q2', label: 'Yes',
      points: [
        { x: 330, y: 76 },
        { x: 330, y: 150 }
      ]
    },
    // Q1 --No--> Monosemantic  (exit Q1 bottom-left at x=150, L-path left)
    {
      from: 'q1', to: 'monosemantic', label: 'No',
      points: [
        { x: 150, y: 76 },
        { x: 150, y: 115 },
        { x: 85, y: 115 },
        { x: 85, y: 260 }
      ]
    },
    // Q2 --Yes--> Monosemantic  (exit Q2 bottom-left at x=270, L-path left)
    {
      from: 'q2', to: 'monosemantic', label: 'Yes',
      points: [
        { x: 270, y: 206 },
        { x: 270, y: 233 },
        { x: 85, y: 233 },
        { x: 85, y: 260 }
      ]
    },
    // Q2 --No--> Incoherent Splitting  (exit Q2 bottom-right at x=380)
    {
      from: 'q2', to: 'incoherent', label: 'No',
      points: [
        { x: 380, y: 206 },
        { x: 380, y: 260 }
      ]
    },
  ]
}

const STAGE_2_CONFIG: FlowchartConfig = {
  stageLabel: 'Explanation Adequacy',
  viewBox: '0 0 480 360',
  nodes: [
    {
      id: 'q1', type: 'question',
      text: t('Can you find an overarching concept that encompasses all its activating examples for each feature?', '각 feature의 모든 activating example을 아우르는 특징적인 개념을 찾을 수 있는가?'),
      x: 60, y: 20, width: 360, height: 56
    },
    {
      id: 'q2', type: 'question',
      text: t('Given the explanations, can you reproduce the activation pattern (sequence of tokens or context)?', 'Explanation을 참고하여 activation pattern (token sequence 또는 context)을 재현할 수 있는가?'),
      x: 200, y: 150, width: 260, height: 56
    },
    {
      id: 'need-revision', type: 'outcome',
      text: 'Need Revision',
      tag: 'Need Revision', categoryId: TAG_CATEGORY_QUALITY,
      x: 20, y: 280, width: 140, height: 44
    },
    {
      id: 'well-explained', type: 'outcome',
      text: 'Well-Explained',
      tag: 'Well-Explained', categoryId: TAG_CATEGORY_QUALITY,
      x: 310, y: 280, width: 150, height: 44
    },
  ],
  edges: [
    // Q1 --Yes--> Q2  (exit Q1 bottom-right at x=330)
    {
      from: 'q1', to: 'q2', label: 'Yes',
      points: [
        { x: 330, y: 76 },
        { x: 330, y: 150 }
      ]
    },
    // Q1 --No--> Need Revision  (exit Q1 bottom-left at x=150, L-path left)
    {
      from: 'q1', to: 'need-revision', label: 'No',
      points: [
        { x: 150, y: 76 },
        { x: 150, y: 115 },
        { x: 85, y: 115 },
        { x: 85, y: 280 }
      ]
    },
    // Q2 --No--> Need Revision  (exit Q2 bottom-left at x=270, L-path left)
    {
      from: 'q2', to: 'need-revision', label: 'No',
      points: [
        { x: 270, y: 206 },
        { x: 270, y: 250 },
        { x: 85, y: 250 },
        { x: 85, y: 280 }
      ]
    },
    // Q2 --Yes--> Well-Explained  (exit Q2 bottom-right at x=385)
    {
      from: 'q2', to: 'well-explained', label: 'Yes',
      points: [
        { x: 385, y: 206 },
        { x: 385, y: 280 }
      ]
    },
  ]
}

const STAGE_3_CONFIG: FlowchartConfig = {
  stageLabel: 'Failure Attribution',
  viewBox: '0 0 480 340',
  nodes: [
    {
      id: 'q1', type: 'question',
      text: t('Can you find an overarching concept that encompasses all its activating examples for each feature?', '각 feature의 모든 activating example을 아우르는 특징적인 개념을 찾을 수 있는가?'),
      x: 60, y: 20, width: 360, height: 56
    },
    {
      id: 'q2', type: 'question',
      text: t('What additional information do you need to reproduce the activation pattern?', 'Activation pattern을 재현하기 위해 어떤 추가 정보가 필요한가?'),
      x: 20, y: 150, width: 260, height: 44
    },
    {
      id: 'noisy-activation', type: 'outcome',
      text: 'Noisy Activation',
      tag: 'Noisy Activation', categoryId: TAG_CATEGORY_CAUSE,
      x: 330, y: 150, width: 130, height: 44
    },
    {
      id: 'missed-syntax', type: 'outcome',
      text: 'Missed Syntax',
      tag: 'Missed Syntax', categoryId: TAG_CATEGORY_CAUSE,
      x: 20, y: 260, width: 140, height: 44
    },
    {
      id: 'missed-context', type: 'outcome',
      text: 'Missed Context',
      tag: 'Missed Context', categoryId: TAG_CATEGORY_CAUSE,
      x: 200, y: 260, width: 150, height: 44
    },
  ],
  edges: [
    // Q1 --Yes--> Q2
    {
      from: 'q1', to: 'q2', label: 'Yes',
      points: [
        { x: 150, y: 76 },
        { x: 150, y: 150 }
      ]
    },
    // Q1 --No--> Noisy Activation (L-path right)
    {
      from: 'q1', to: 'noisy-activation', label: 'No',
      points: [
        { x: 330, y: 76 },
        { x: 330, y: 115 },
        { x: 395, y: 115 },
        { x: 395, y: 150 }
      ]
    },
    // Q2 --Syntax--> Missed Syntax
    {
      from: 'q2', to: 'missed-syntax', label: 'Syntax',
      points: [
        { x: 90, y: 194 },
        { x: 90, y: 260 }
      ]
    },
    // Q2 --Context--> Missed Context (L-path so label is visible below Q2)
    {
      from: 'q2', to: 'missed-context', label: 'Context',
      points: [
        { x: 210, y: 194 },
        { x: 210, y: 228 },
        { x: 275, y: 228 },
        { x: 275, y: 260 }
      ]
    },
  ]
}

const STAGE_CONFIGS: Record<number, FlowchartConfig> = {
  1: STAGE_1_CONFIG,
  2: STAGE_2_CONFIG,
  3: STAGE_3_CONFIG,
}

// ============================================================================
// SVG HELPERS
// ============================================================================

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

function buildEdgePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  return d
}

// ============================================================================
// COMPONENT
// ============================================================================

interface LabelingGuidePopupProps {
  stage: 1 | 2 | 3
  onClose: () => void
}

const LabelingGuidePopup: React.FC<LabelingGuidePopupProps> = ({ stage, onClose }) => {
  const config = STAGE_CONFIGS[stage]
  if (!config) return null

  return (
    <>
      <div className="labeling-guide__backdrop" onClick={onClose} />
      <div className="labeling-guide__popup">
        {/* Header */}
        <div className="labeling-guide__header">
          <span className="labeling-guide__title">{t('Labeling Guide', 'Labeling 가이드')}</span>
          <button className="labeling-guide__close" onClick={onClose}>&times;</button>
        </div>

        {/* Flowchart */}
        <div className="labeling-guide__content">
          <svg
            className="labeling-guide__svg"
            viewBox={config.viewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker
                id="labeling-guide-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
              </marker>
            </defs>

            {/* Edges */}
            {config.edges.map((edge, i) => {
              const path = buildEdgePath(edge.points)
              // Label position: near the start of the edge
              const labelPt = edge.points[0]
              const nextPt = edge.points[1]
              const isVertical = Math.abs(nextPt.x - labelPt.x) < 10
              // Offset scales with label length to avoid overlapping the arrow
              const isYesNo = edge.label === 'Yes' || edge.label === 'No'
              const offset = isYesNo ? 16 : 4 + edge.label.length * 4
              const labelX = isVertical
                ? labelPt.x + (edge.label === 'Yes' ? -offset : offset)
                : (labelPt.x + nextPt.x) / 2
              const labelY = isVertical
                ? labelPt.y + 16
                : labelPt.y - 6

              return (
                <g key={`edge-${i}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd="url(#labeling-guide-arrow)"
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fill={edge.label === 'Yes' ? '#16a34a' : edge.label === 'No' ? '#dc2626' : '#475569'}
                  >
                    {edge.label}
                  </text>
                </g>
              )
            })}

            {/* Nodes */}
            {config.nodes.map(node => {
              const tagColor = node.tag && node.categoryId
                ? getTagColor(node.categoryId, node.tag) || UNSURE_GRAY
                : null

              if (node.type === 'question') {
                const charWidth = USE_KOREAN ? 9 : 6.5
                const lines = wrapText(node.text, Math.floor(node.width / charWidth))
                const lineHeight = 16
                const totalTextHeight = lines.length * lineHeight
                const startY = node.y + (node.height - totalTextHeight) / 2 + lineHeight * 0.75

                return (
                  <g key={node.id}>
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx="8"
                      fill="#ffffff"
                      stroke="#94a3b8"
                      strokeWidth="2"
                    />
                    {lines.map((line, i) => (
                      <text
                        key={i}
                        x={node.x + node.width / 2}
                        y={startY + i * lineHeight}
                        textAnchor="middle"
                        fontSize="14"
                        fill="#1f2937"
                        fontWeight="500"
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                )
              }

              // Outcome node
              return (
                <g key={node.id}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="6"
                    fill={tagColor || UNSURE_GRAY}
                    stroke={tagColor || UNSURE_GRAY}
                    strokeWidth="3"
                  />
                  <text
                    x={node.x + node.width / 2}
                    y={node.y + node.height / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="15"
                    fill="#000000"
                    fontWeight="700"
                  >
                    {node.text}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </>
  )
}

export default LabelingGuidePopup
