import React, { useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../store'
import {
  DEFAULT_ANIMATION,
  calculateSankeyLayout,
  validateSankeyData,
  validateDimensions,
  getNodeColor,
  getLinkColor,
  getSankeyPath,
  calculateStageLabels,
  applyRightToLeftTransform,
  RIGHT_SANKEY_MARGIN,
  calculateLinkGradientStops
} from '../lib/d3-sankey-utils'
import { sortFeatures } from '../lib/d3-table-utils'
import { calculateVerticalBarNodeLayout } from '../lib/d3-vertical-bar-sankey-utils'
import {
  getNodeMetrics,
  getAvailableStages,
  canAddStage,
  hasChildren
} from '../lib/threshold-utils'
import { useResizeObserver } from '../lib/utils'
import type { D3SankeyNode, D3SankeyLink } from '../types'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_FEATURE_SPLITTING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_LLM_SCORER_CONSISTENCY,
  METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
  METRIC_LLM_EXPLAINER_CONSISTENCY,
  METRIC_OVERALL_SCORE,
  CONSISTENCY_THRESHOLDS,
  METRIC_COLORS
} from '../lib/constants'
import '../styles/SankeyDiagram.css'

// Simple stage configuration for inline selector
interface StageOption {
  id: string
  name: string
  description: string
  metric: string
  thresholds: readonly number[]
  category: 'Feature Splitting' | 'Score' | 'Consistency'
}

// Available stages for the NEW system - categorized by type
const AVAILABLE_STAGES: StageOption[] = [
  // Feature Splitting (1 metric)
  {
    id: 'feature_splitting',
    name: 'Feature Splitting',
    description: 'Split by feature splitting score',
    metric: METRIC_FEATURE_SPLITTING,
    thresholds: [0.3],
    category: 'Feature Splitting'
  },

  // Score metrics (4 metrics)
  {
    id: 'fuzz_score',
    name: 'Fuzz Score',
    description: 'Split by fuzz score',
    metric: METRIC_SCORE_FUZZ,
    thresholds: [0.5],
    category: 'Score'
  },
  {
    id: 'detection_score',
    name: 'Detection Score',
    description: 'Split by detection score',
    metric: METRIC_SCORE_DETECTION,
    thresholds: [0.5],
    category: 'Score'
  },
  {
    id: 'embedding_score',
    name: 'Embedding Score',
    description: 'Split by embedding score',
    metric: METRIC_SCORE_EMBEDDING,
    thresholds: [0.5],
    category: 'Score'
  },
  {
    id: 'overall_score',
    name: 'Overall Score',
    description: 'Split by overall score',
    metric: METRIC_OVERALL_SCORE,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_OVERALL_SCORE],
    category: 'Score'
  },

  // Consistency metrics (5 metrics)
  {
    id: 'llm_scorer_consistency',
    name: 'LLM Scorer',
    description: 'Consistency across different scorers',
    metric: METRIC_LLM_SCORER_CONSISTENCY,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_LLM_SCORER_CONSISTENCY],
    category: 'Consistency'
  },
  {
    id: 'within_explanation_consistency',
    name: 'Within-Explanation Metric',
    description: 'Consistency across metrics within explainer',
    metric: METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY],
    category: 'Consistency'
  },
  {
    id: 'cross_explanation_metric_consistency',
    name: 'Cross-Explanation Metric',
    description: 'Consistency across explainers per metric',
    metric: METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY],
    category: 'Consistency'
  },
  {
    id: 'cross_explanation_overall_consistency',
    name: 'Cross-Explanation Overall Score',
    description: 'Overall score consistency across explainers',
    metric: METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY],
    category: 'Consistency'
  },
  {
    id: 'llm_explainer_consistency',
    name: 'LLM Explainer',
    description: 'Semantic similarity between explanations',
    metric: METRIC_LLM_EXPLAINER_CONSISTENCY,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_LLM_EXPLAINER_CONSISTENCY],
    category: 'Consistency'
  }
]

// ==================== HELPER FUNCTIONS ====================

/**
 * Get display color for a metric in the stage selector
 * Maps metric constants to their corresponding HIGH color values from METRIC_COLORS
 */
function getMetricColorForDisplay(metric: string): string {
  switch (metric) {
    case METRIC_FEATURE_SPLITTING:
      return METRIC_COLORS.FEATURE_SPLITTING
    case METRIC_SCORE_FUZZ:
      return METRIC_COLORS.SCORE_FUZZ.HIGH
    case METRIC_SCORE_DETECTION:
      return METRIC_COLORS.SCORE_DETECTION.HIGH
    case METRIC_SCORE_EMBEDDING:
      return METRIC_COLORS.SCORE_EMBEDDING.HIGH
    case METRIC_OVERALL_SCORE:
      return METRIC_COLORS.OVERALL_SCORE_COLORS.HIGH
    case METRIC_LLM_SCORER_CONSISTENCY:
      return METRIC_COLORS.LLM_SCORER.HIGH
    case METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY:
      return METRIC_COLORS.WITHIN_EXPLANATION.HIGH
    case METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY:
      return METRIC_COLORS.CROSS_EXPLANATION.HIGH
    case METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY:
      return METRIC_COLORS.CROSS_EXPLANATION_OVERALL.HIGH
    case METRIC_LLM_EXPLAINER_CONSISTENCY:
      return METRIC_COLORS.LLM_EXPLAINER.HIGH
    default:
      return '#9ca3af' // Default gray
  }
}

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showHistogramOnClick?: boolean
  flowDirection?: 'left-to-right' | 'right-to-left'
  panel?: typeof PANEL_LEFT | typeof PANEL_RIGHT
}

// ==================== HELPER COMPONENTS ====================
const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="sankey-error">
    {message}
  </div>
)

// Metric overlay panel component
interface MetricOverlayPanelProps {
  rootNode: D3SankeyNode
  availableStages: StageOption[]
  onMetricClick: (metric: string, thresholds: readonly number[]) => void
}

const MetricOverlayPanel: React.FC<MetricOverlayPanelProps> = ({
  rootNode,
  availableStages,
  onMetricClick
}) => {
  const [hoveredMetric, setHoveredMetric] = React.useState<string | null>(null)

  // Group stages by category
  const categories: Array<{ name: string; stages: StageOption[] }> = [
    {
      name: 'FEATURE SPLITTING',
      stages: availableStages.filter(s => s.category === 'Feature Splitting')
    },
    {
      name: 'SCORE',
      stages: availableStages.filter(s => s.category === 'Score')
    },
    {
      name: 'CONSISTENCY',
      stages: availableStages.filter(s => s.category === 'Consistency')
    }
  ].filter(cat => cat.stages.length > 0)

  // Layout constants
  const itemHeight = 26
  const categoryHeaderHeight = 20
  const categoryPadding = 8  // Reduced padding for Feature Splitting and Score
  const categoryPaddingLarge = 12  // Normal padding for Consistency
  const categorySpacing = 10
  const instructionHeight = 20
  const instructionSpacing = 16
  const categoryBoxWidth = 180
  const categoryBoxWidthConsistency = 230  // Wider box for Consistency
  const verticalSpacing = 10  // Spacing between Feature Splitting and Score

  // Get individual category objects
  const featureSplittingCat = categories.find(c => c.name === 'FEATURE SPLITTING')
  const scoreCat = categories.find(c => c.name === 'SCORE')
  const consistencyCat = categories.find(c => c.name === 'CONSISTENCY')

  // Calculate heights for left column (Feature Splitting + Score)
  const featureSplittingHeight = featureSplittingCat
    ? categoryHeaderHeight + categoryPadding + (featureSplittingCat.stages.length * itemHeight) + categoryPadding
    : 0
  const scoreHeight = scoreCat
    ? categoryHeaderHeight + categoryPadding + (scoreCat.stages.length * itemHeight) + categoryPadding
    : 0
  const leftColumnHeight = featureSplittingHeight + verticalSpacing + scoreHeight

  // Calculate consistency height to match left column
  const consistencyHeight = leftColumnHeight

  // Position overlay to the right of root node
  const overlayX = (rootNode.x1 || 0) + 30
  const totalHeight = instructionHeight + instructionSpacing + consistencyHeight
  const overlayY = ((rootNode.y0 || 0) + (rootNode.y1 || 0)) / 2 - totalHeight / 2

  return (
    <g className="sankey-metric-overlay">
      {/* Instruction header */}
      <text
        x={overlayX}
        y={overlayY}
        dy="0.8em"
        fontSize="14"
        fontWeight="600"
        fill="#374151"
        style={{ userSelect: 'none' }}
      >
        Select a metric to begin:
      </text>

      {/* Left column: Feature Splitting */}
      {featureSplittingCat && (
        <g key="feature-splitting">
          {/* Dotted container */}
          <rect
            x={overlayX}
            y={overlayY + instructionHeight + instructionSpacing}
            width={categoryBoxWidth}
            height={featureSplittingHeight}
            fill="transparent"
            stroke="#d1d5db"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            rx="6"
          />

          {/* Category header */}
          <text
            x={overlayX + categoryPadding}
            y={overlayY + instructionHeight + instructionSpacing + categoryPadding}
            dy="0.8em"
            fontSize="11"
            fontWeight="700"
            fill="#6b7280"
            letterSpacing="0.5"
            style={{ textTransform: 'uppercase', userSelect: 'none' }}
          >
            {featureSplittingCat.name}
          </text>

          {/* Metrics */}
          {featureSplittingCat.stages.map((stage, stageIndex) => {
            const itemY = overlayY + instructionHeight + instructionSpacing + categoryHeaderHeight + categoryPadding + (stageIndex * itemHeight)
            const isHovered = hoveredMetric === stage.id

            return (
              <g
                key={stage.id}
                className="sankey-metric-overlay__item"
                onClick={() => onMetricClick(stage.metric, stage.thresholds)}
                onMouseEnter={() => setHoveredMetric(stage.id)}
                onMouseLeave={() => setHoveredMetric(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={overlayX + 4}
                  y={itemY}
                  width={categoryBoxWidth - 8}
                  height={itemHeight}
                  fill={isHovered ? '#eff6ff' : 'transparent'}
                  rx="3"
                />
                <circle
                  cx={overlayX + categoryPadding + 7}
                  cy={itemY + itemHeight / 2}
                  r="7"
                  fill={getMetricColorForDisplay(stage.metric)}
                  stroke="#d1d5db"
                  strokeWidth="0.5"
                />
                <text
                  x={overlayX + categoryPadding + 22}
                  y={itemY + itemHeight / 2}
                  dy="0.35em"
                  fontSize="12"
                  fontWeight="500"
                  fill="#1f2937"
                  style={{ userSelect: 'none' }}
                >
                  {stage.name}
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* Left column: Score (below Feature Splitting) */}
      {scoreCat && (
        <g key="score">
          {/* Dotted container */}
          <rect
            x={overlayX}
            y={overlayY + instructionHeight + instructionSpacing + featureSplittingHeight + verticalSpacing}
            width={categoryBoxWidth}
            height={scoreHeight}
            fill="transparent"
            stroke="#d1d5db"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            rx="6"
          />

          {/* Category header */}
          <text
            x={overlayX + categoryPadding}
            y={overlayY + instructionHeight + instructionSpacing + featureSplittingHeight + verticalSpacing + categoryPadding}
            dy="0.8em"
            fontSize="11"
            fontWeight="700"
            fill="#6b7280"
            letterSpacing="0.5"
            style={{ textTransform: 'uppercase', userSelect: 'none' }}
          >
            {scoreCat.name}
          </text>

          {/* Metrics */}
          {scoreCat.stages.map((stage, stageIndex) => {
            const itemY = overlayY + instructionHeight + instructionSpacing + featureSplittingHeight + verticalSpacing + categoryHeaderHeight + categoryPadding + (stageIndex * itemHeight)
            const isHovered = hoveredMetric === stage.id

            return (
              <g
                key={stage.id}
                className="sankey-metric-overlay__item"
                onClick={() => onMetricClick(stage.metric, stage.thresholds)}
                onMouseEnter={() => setHoveredMetric(stage.id)}
                onMouseLeave={() => setHoveredMetric(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={overlayX + 4}
                  y={itemY}
                  width={categoryBoxWidth - 8}
                  height={itemHeight}
                  fill={isHovered ? '#eff6ff' : 'transparent'}
                  rx="3"
                />
                <circle
                  cx={overlayX + categoryPadding + 7}
                  cy={itemY + itemHeight / 2}
                  r="7"
                  fill={getMetricColorForDisplay(stage.metric)}
                  stroke="#d1d5db"
                  strokeWidth="0.5"
                />
                <text
                  x={overlayX + categoryPadding + 22}
                  y={itemY + itemHeight / 2}
                  dy="0.35em"
                  fontSize="12"
                  fontWeight="500"
                  fill="#1f2937"
                  style={{ userSelect: 'none' }}
                >
                  {stage.name}
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* Right column: Consistency (full height) */}
      {consistencyCat && (
        <g key="consistency">
          {/* Dotted container */}
          <rect
            x={overlayX + categoryBoxWidth + categorySpacing}
            y={overlayY + instructionHeight + instructionSpacing}
            width={categoryBoxWidthConsistency}
            height={consistencyHeight}
            fill="transparent"
            stroke="#d1d5db"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            rx="6"
          />

          {/* Category header */}
          <text
            x={overlayX + categoryBoxWidth + categorySpacing + categoryPaddingLarge}
            y={overlayY + instructionHeight + instructionSpacing + categoryPaddingLarge}
            dy="0.8em"
            fontSize="11"
            fontWeight="700"
            fill="#6b7280"
            letterSpacing="0.5"
            style={{ textTransform: 'uppercase', userSelect: 'none' }}
          >
            {consistencyCat.name}
          </text>

          {/* Metrics */}
          {consistencyCat.stages.map((stage, stageIndex) => {
            const itemY = overlayY + instructionHeight + instructionSpacing + categoryHeaderHeight + categoryPaddingLarge + (stageIndex * itemHeight)
            const isHovered = hoveredMetric === stage.id

            return (
              <g
                key={stage.id}
                className="sankey-metric-overlay__item"
                onClick={() => onMetricClick(stage.metric, stage.thresholds)}
                onMouseEnter={() => setHoveredMetric(stage.id)}
                onMouseLeave={() => setHoveredMetric(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={overlayX + categoryBoxWidth + categorySpacing + 4}
                  y={itemY}
                  width={categoryBoxWidthConsistency - 8}
                  height={itemHeight}
                  fill={isHovered ? '#eff6ff' : 'transparent'}
                  rx="3"
                />
                <circle
                  cx={overlayX + categoryBoxWidth + categorySpacing + categoryPaddingLarge + 7}
                  cy={itemY + itemHeight / 2}
                  r="7"
                  fill={getMetricColorForDisplay(stage.metric)}
                  stroke="#d1d5db"
                  strokeWidth="0.5"
                />
                <text
                  x={overlayX + categoryBoxWidth + categorySpacing + categoryPaddingLarge + 22}
                  y={itemY + itemHeight / 2}
                  dy="0.35em"
                  fontSize="12"
                  fontWeight="500"
                  fill="#1f2937"
                  style={{ userSelect: 'none' }}
                >
                  {stage.name}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </g>
  )
}

const SankeyNode: React.FC<{
  node: D3SankeyNode
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick?: (e: React.MouseEvent) => void
  onAddStage?: (e: React.MouseEvent) => void
  onRemoveStage?: (e: React.MouseEvent) => void
  isHovered: boolean
  isHighlighted: boolean
  canAddStage: boolean
  canRemoveStage: boolean
  flowDirection: 'left-to-right' | 'right-to-left'
  animationDuration: number
}> = ({
  node,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onAddStage,
  onRemoveStage,
  isHovered,
  isHighlighted,
  canAddStage,
  canRemoveStage,
  flowDirection,
  animationDuration
}) => {
  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0
  const isRightToLeft = flowDirection === 'right-to-left'
  const labelX = isRightToLeft ? node.x1 + 6 : node.x0 - 6
  const textAnchor = isRightToLeft ? 'start' : 'end'
  const buttonX = isRightToLeft ? node.x0 - 15 : node.x1 + 15

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        stroke="none"
        strokeWidth={0}
        style={{
        //   transition: `all ${animationDuration}ms ease-out`,
          cursor: onClick ? 'pointer' : 'default',
          filter: isHovered || isHighlighted ? 'brightness(1.1)' : 'none'
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />

      <text
        x={labelX}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#374151"
        fontWeight={isHovered ? 600 : 400}
        textAnchor={textAnchor}
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      <text
        x={labelX}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#6b7280"
        textAnchor={textAnchor}
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>

      {canAddStage && (
        <g className="sankey-node-add-stage">
          <circle
            cx={buttonX}
            cy={(node.y0 + node.y1) / 2}
            r={12}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: isHovered ? 1 : 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onAddStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={(node.y0 + node.y1) / 2}
            dy="0.35em"
            fontSize={14}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            +
          </text>
        </g>
      )}

      {canRemoveStage && (
        <g className="sankey-node-remove-stage">
          <circle
            cx={buttonX}
            cy={(node.y0 + node.y1) / 2}
            r={12}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: isHovered ? 1 : 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onRemoveStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={(node.y0 + node.y1) / 2}
            dy="0.35em"
            fontSize={16}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
}

const SankeyLink: React.FC<{
  link: D3SankeyLink
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick?: (e: React.MouseEvent) => void
  animationDuration: number
  gradientId?: string
}> = ({ link, onMouseEnter, onMouseLeave, onClick, animationDuration, gradientId }) => {
  const sourceNode = typeof link.source === 'object' ? link.source : null
  if (!sourceNode) return null

  const path = getSankeyPath(link)
  const color = gradientId ? `url(#${gradientId})` : getLinkColor(link)

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, link.width || 0)}
      opacity={1.0}
      style={{
        transition: `opacity ${animationDuration}ms ease-out, stroke ${animationDuration}ms ease-out`,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  )
}

const VerticalBarSankeyNode: React.FC<{
  node: D3SankeyNode
  scrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null
  onAddStage?: (e: React.MouseEvent) => void
  onRemoveStage?: (e: React.MouseEvent) => void
  canAddStage: boolean
  canRemoveStage: boolean
  flowDirection: 'left-to-right' | 'right-to-left'
  animationDuration: number
  showLabels?: boolean
  totalFeatureCount?: number
  nodeStartIndex?: number
}> = ({ node, scrollState, onAddStage, onRemoveStage, canAddStage, canRemoveStage, flowDirection, animationDuration: _animationDuration, showLabels = false, totalFeatureCount = 0, nodeStartIndex = 0 }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState, totalFeatureCount, nodeStartIndex)

  // Check if this is a placeholder node
  const isPlaceholder = node.id === 'placeholder_vertical_bar'

  // Calculate button position (same logic as standard nodes)
  const isRightToLeft = flowDirection === 'right-to-left'
  const buttonX = isRightToLeft && node.x0 !== undefined ? node.x0 - 15 : (node.x1 !== undefined ? node.x1 + 15 : 0)
  const buttonY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  // Calculate label position (same as normal nodes)
  const labelX = isRightToLeft && node.x1 !== undefined ? node.x1 + 6 : (node.x0 !== undefined ? node.x0 - 6 : 0)
  const textAnchor = isRightToLeft ? 'start' : 'end'
  const labelY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  return (
    <g className="sankey-vertical-bar-node">
      {/* Render three vertical bars */}
      {layout.subNodes.map((subNode, index) => {
        // Calculate horizontal offset for label spacing: left (-15), center (0), right (+15)
        const labelXOffset = (index - 1) * 8

        return (
          <g key={subNode.id}>
            {/* Bar rectangle */}
            <rect
              x={subNode.x}
              y={subNode.y}
              width={subNode.width}
              height={subNode.height}
              fill={subNode.color}
              opacity={isPlaceholder ? 0.4 : (subNode.selected ? 0.7 : 0.3)}
              stroke="#e5e7eb"
              strokeWidth={0.5}
              strokeDasharray={isPlaceholder ? "3,3" : undefined}
              rx={3}
            />
            {/* Model name label - only shown on topmost vertical bar node */}
            {showLabels && (
              <text
                x={subNode.x + subNode.width / 2 + labelXOffset}
                y={subNode.y - 10}
                textAnchor="middle"
                fontSize={10}
                fontWeight={subNode.selected ? 600 : 500}
                fill="#374151"
                opacity={isPlaceholder ? 0.6 : (subNode.selected ? 1.0 : 0.5)}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {subNode.modelName}
              </text>
            )}
          </g>
        )
      })}

      {/* Global scroll indicator spanning all three bars */}
      {layout.scrollIndicator && layout.subNodes.length > 0 && (
        <rect
          x={layout.subNodes[0].x}
          y={layout.scrollIndicator.y}
          width={layout.totalWidth}
          height={layout.scrollIndicator.height}
          fill="rgba(30, 41, 59, 0.25)"
          stroke="#1e293b"
          strokeWidth={1.5}
          rx={3}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Node name and feature count labels (same as normal nodes) */}
      {!isPlaceholder && (
        <>
          <text
            x={labelX}
            y={labelY}
            dy="0.35em"
            fontSize={12}
            fill="#374151"
            fontWeight={400}
            textAnchor={textAnchor}
            style={{ pointerEvents: 'none' }}
          >
            {node.name}
          </text>
          <text
            x={labelX}
            y={labelY + 14}
            dy="0.35em"
            fontSize={10}
            fill="#6b7280"
            textAnchor={textAnchor}
            style={{ pointerEvents: 'none' }}
          >
            ({node.feature_count.toLocaleString()})
          </text>
        </>
      )}

      {/* Add stage button - not shown for placeholder */}
      {canAddStage && !isPlaceholder && (
        <g className="sankey-node-add-stage">
          <circle
            cx={buttonX}
            cy={buttonY}
            r={12}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onAddStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={buttonY}
            dy="0.35em"
            fontSize={14}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            +
          </text>
        </g>
      )}

      {/* Remove stage button - not shown for placeholder */}
      {canRemoveStage && !isPlaceholder && (
        <g className="sankey-node-remove-stage">
          <circle
            cx={buttonX}
            cy={buttonY}
            r={12}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onRemoveStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={buttonY}
            dy="0.35em"
            fontSize={16}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
}

// ==================== MAIN COMPONENT ====================
export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  width = 800,
  height = 800,
  className = '',
  animationDuration = DEFAULT_ANIMATION.duration,
  showHistogramOnClick = true,
  flowDirection = 'left-to-right',
  panel = PANEL_LEFT
}) => {
  const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
  const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
  const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

  // Get data from store - NEW TREE-BASED SYSTEM ONLY
  const computedSankey = useVisualizationStore(state => state[panelKey].computedSankey)
  const filters = useVisualizationStore(state => state[panelKey].filters)
  const loading = useVisualizationStore(state => state.loading[loadingKey])
  const error = useVisualizationStore(state => state.errors[errorKey])
  const hoveredAlluvialNodeId = useVisualizationStore(state => state.hoveredAlluvialNodeId)
  const hoveredAlluvialPanel = useVisualizationStore(state => state.hoveredAlluvialPanel)
  const tableScrollState = useVisualizationStore(state => state.tableScrollState)

  // Access table data and sorting state for gradient generation
  const tableData = useVisualizationStore(state => state.tableData)
  const tableSortBy = useVisualizationStore(state => state.tableSortBy)
  const tableSortDirection = useVisualizationStore(state => state.tableSortDirection)
  const sankeyTree = useVisualizationStore(state => state[panelKey].sankeyTree)
  const getRightmostStageFeatureIds = useVisualizationStore(state => state.getRightmostStageFeatureIds)
  const { showHistogramPopover, addStageToNode, removeNodeStage } = useVisualizationStore()

  // NEW TREE-BASED SYSTEM: use computedSankey directly
  const data = useMemo(() => {
    if (!computedSankey) {
      console.log(`[SankeyDiagram ${panel}] ⚠️ No computed sankey data`)
      return null
    }

    console.log(`[SankeyDiagram ${panel}] ✅ Using TREE-BASED system`, {
      nodes: computedSankey.nodes.length,
      links: computedSankey.links.length,
      maxDepth: computedSankey.maxDepth,
      sankeyTreeSize: sankeyTree?.size
    })

    // Return computed structure in SankeyData format
    return {
      nodes: computedSankey.nodes,
      links: computedSankey.links,
      metadata: {
        total_features: computedSankey.nodes.find(n => n.id === 'root')?.feature_count || 0,
        applied_filters: filters
      }
    }
  }, [computedSankey, filters, panel, sankeyTree])

  // Track previous data for smooth transitions
  const [displayData, setDisplayData] = useState(data)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [_hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
  const [inlineSelector, setInlineSelector] = useState<{
    nodeId: string
    position: { x: number; y: number }
    availableStages: StageOption[]
  } | null>(null)

  // Resize observer hook with minimal debounce for responsiveness
  const containerElementRef = React.useRef<HTMLDivElement | null>(null)
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: width,
    defaultHeight: height,
    debounceMs: 16,  // ~60fps for smooth resizing
    debugId: panel
  })

  // Combined ref callback to support both resize observer and direct access
  const setContainerRef = React.useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node
    containerRef(node)
  }, [containerRef])

  // Update display data when loading completes
  React.useEffect(() => {
    if (!loading && data) {
      setDisplayData(data)
    }
  }, [data, loading])

  // Calculate layout with memoization
  const { layout, validationErrors } = useMemo(() => {
    const errors = validateDimensions(containerSize.width, containerSize.height)

    if (displayData) {
      errors.push(...validateSankeyData(displayData))
    }

    if (errors.length > 0 || !displayData) {
      return { layout: null, validationErrors: errors }
    }

    // console.log(`[SankeyDiagram ${panel}] Calculating layout with container size:`, containerSize)

    try {
      // Use different margins for right panel
      const margin = flowDirection === 'right-to-left' ? RIGHT_SANKEY_MARGIN : undefined
      let calculatedLayout = calculateSankeyLayout(displayData, containerSize.width, containerSize.height, margin)

      if (flowDirection === 'right-to-left' && calculatedLayout) {
        calculatedLayout = applyRightToLeftTransform(calculatedLayout, containerSize.width)
      }

      return { layout: calculatedLayout, validationErrors: [] }
    } catch (error) {
      console.error('Sankey layout calculation failed:', error)
      return {
        layout: null,
        validationErrors: [`Layout error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }
    }
  }, [displayData, containerSize.width, containerSize.height, flowDirection])

  // Calculate stage labels
  const stageLabels = useMemo(() => {
    return calculateStageLabels(layout, displayData)
  }, [layout, displayData])

  // Calculate gradients for links based on table sorting
  const linkGradients = useMemo(() => {
    if (!layout || !tableData || !tableSortBy || !tableSortDirection) {
      return null
    }

    // Get rightmost stage number
    const maxStage = Math.max(...layout.nodes.map(n => n.stage))

    // Get all rightmost vertical bar nodes
    const rightmostNodes = layout.nodes.filter(n =>
      n.stage === maxStage && n.node_type === 'vertical_bar'
    )

    if (rightmostNodes.length === 0) {
      return null
    }

    // Get features and filter to only rightmost stage features (same as TablePanel)
    let sortedFeatures = [...tableData.features]

    // Filter to only rightmost stage features
    const rightmostFeatureIds = getRightmostStageFeatureIds()
    if (rightmostFeatureIds && rightmostFeatureIds.size > 0 && rightmostFeatureIds.size < sortedFeatures.length) {
      sortedFeatures = sortedFeatures.filter(f => rightmostFeatureIds.has(f.feature_id))
      console.log(`[SankeyDiagram] Filtered gradient to ${sortedFeatures.length} rightmost features (from ${tableData.features.length} total)`)
    }

    // Apply sorting
    sortedFeatures = sortFeatures(
      sortedFeatures,
      tableSortBy,
      tableSortDirection,
      tableData
    )

    // Collect feature count from rightmost nodes for distribution calculation
    let totalFeatures = 0
    rightmostNodes.forEach(node => {
      if (node.feature_ids) {
        totalFeatures += node.feature_ids.length
      }
    })

    if (totalFeatures === 0) {
      return null
    }

    // Calculate ONE master gradient for all features
    const masterGradientStops = calculateLinkGradientStops(sortedFeatures, tableSortBy, tableData)

    if (!masterGradientStops) {
      return null
    }

    // Now distribute this gradient proportionally across links to rightmost nodes
    const gradients: Array<{
      id: string
      stops: Array<{ offset: string; color: string; opacity: number }>
    }> = []

    // Calculate cumulative feature distribution
    let cumulativeFeatures = 0

    layout.links.forEach((link, index) => {
      const targetNode = typeof link.target === 'object' ? link.target : null

      // Only create gradient for links to rightmost vertical bar nodes
      if (targetNode && rightmostNodes.some(n => n.id === targetNode.id)) {
        const linkFeatureCount = targetNode.feature_ids?.length || 0

        // Find this link's position in the overall gradient
        const startRatio = cumulativeFeatures / totalFeatures
        const endRatio = (cumulativeFeatures + linkFeatureCount) / totalFeatures

        // Extract only the gradient stops for this link's portion
        const linkStops = []
        const totalStops = masterGradientStops.length
        const startStopIndex = Math.floor(startRatio * totalStops)
        const endStopIndex = Math.ceil(endRatio * totalStops)

        // Extract and remap the relevant stops
        for (let i = startStopIndex; i <= endStopIndex && i < totalStops; i++) {
          const localProgress = (i - startStopIndex) / Math.max(1, endStopIndex - startStopIndex)
          linkStops.push({
            ...masterGradientStops[i],
            offset: `${localProgress * 100}%`
          })
        }

        if (linkStops.length > 0) {
          gradients.push({
            id: `gradient-${panel}-link-${index}`,
            stops: linkStops
          })
        }

        cumulativeFeatures += linkFeatureCount
      }
    })

    return gradients.length > 0 ? gradients : null
  }, [layout, tableData, tableSortBy, tableSortDirection, panel])

  // Event handlers
  const handleNodeHistogramClick = useCallback((node: D3SankeyNode) => {
    if (!showHistogramOnClick || !sankeyTree) return

    const treeNode = sankeyTree.get(node.id)
    if (!treeNode) return

    // Get metrics for this node (root shows all, others show their metric)
    const metrics = getNodeMetrics(treeNode, sankeyTree)
    if (metrics.length === 0) return

    const containerRect = containerElementRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(node.id, node.name, metrics, position, undefined, undefined, panel, node.category)
  }, [showHistogramOnClick, showHistogramPopover, sankeyTree, panel])

  const handleLinkHistogramClick = useCallback((link: D3SankeyLink) => {
    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return
    handleNodeHistogramClick(sourceNode)
  }, [handleNodeHistogramClick])

  const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()

    // NEW TREE SYSTEM: get available stages (filter out already-used metrics)
    if (!sankeyTree || !computedSankey) return

    const treeNode = sankeyTree.get(node.id)
    if (!treeNode) return

    const availableStages = getAvailableStages(treeNode, sankeyTree, AVAILABLE_STAGES)
    if (availableStages.length === 0) return

    const rect = event.currentTarget.getBoundingClientRect()

    // Position popup next to button with center Y aligned
    setInlineSelector({
      nodeId: node.id,
      position: {
        x: rect.left + rect.width + 10,
        y: rect.top + rect.height / 2  // Center Y of button
      },
      availableStages
    })
  }, [sankeyTree, computedSankey])

  const handleRemoveStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()

    // Use tree-based system for both panels
    if (sankeyTree) {
      // Remove all descendants of this node
      removeNodeStage(node.id, panel)
    }
  }, [removeNodeStage, panel, sankeyTree])

  const handleStageSelect = useCallback(async (stageTypeId: string) => {
    if (!inlineSelector) return

    const stageType = inlineSelector.availableStages.find(s => s.id === stageTypeId)
    if (!stageType) {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Stage type not found:', stageTypeId)
      return
    }

    console.log('[SankeyDiagram.handleStageSelect] 🎯 Stage selected:', {
      stageTypeId,
      stageType,
      metric: stageType.metric,
      thresholds: stageType.thresholds
    })

    setInlineSelector(null)

    // Use tree-based system
    const metric = stageType.metric
    const thresholds = stageType.thresholds

    if (metric && thresholds) {
      console.log('[SankeyDiagram.handleStageSelect] ✅ Calling addStageToNode with:', { metric, thresholds })
      await addStageToNode(inlineSelector.nodeId, metric, [...thresholds], panel)

      // Show histogram popover after adding stage
      setTimeout(() => {
        const parentNode = layout?.nodes.find(n => n.id === inlineSelector.nodeId)
        if (parentNode) {
          handleNodeHistogramClick(parentNode)
        }
      }, 500)
    } else {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Missing metric or thresholds:', {
        metric,
        thresholds,
        stageType
      })
    }
  }, [inlineSelector, addStageToNode, panel, layout, handleNodeHistogramClick])

  const handleOverlayMetricClick = useCallback(async (metric: string, thresholds: readonly number[]) => {
    console.log('[SankeyDiagram.handleOverlayMetricClick] 🎯 Metric clicked:', {
      metric,
      thresholds
    })

    // Add stage to root node
    await addStageToNode('root', metric, [...thresholds], panel)

    // Show histogram popover after adding stage
    setTimeout(() => {
      const rootNode = layout?.nodes.find(n => n.id === 'root')
      if (rootNode) {
        handleNodeHistogramClick(rootNode)
      }
    }, 500)
  }, [addStageToNode, panel, layout, handleNodeHistogramClick])

  // Render
  if (error) {
    return <ErrorMessage message={error} />
  }

  if (validationErrors.length > 0) {
    return (
      <div>
        {validationErrors.map((err, i) => (
          <ErrorMessage key={i} message={err} />
        ))}
      </div>
    )
  }

  if (!displayData && !loading) {
    return (
      <div className={`sankey-diagram ${className}`}>
        <div className="sankey-diagram__empty">
          <div className="sankey-diagram__empty-icon">📊</div>
          <div className="sankey-diagram__empty-title">No Data Available</div>
          <div className="sankey-diagram__empty-description">
            Select filters to generate the Sankey diagram
          </div>
        </div>
      </div>
    )
  }

  if (!layout || !displayData) {
    return null
  }

  return (
    <div className={`sankey-diagram ${className}`}>
      <div
        ref={setContainerRef}
        className="sankey-diagram__container"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <svg width={containerSize.width} height={containerSize.height} className="sankey-diagram__svg">
          <rect width={containerSize.width} height={containerSize.height} fill="#ffffff" />

          {/* Gradient definitions for links */}
          {linkGradients && (
            <defs>
              {linkGradients.map(gradient => (
                <linearGradient
                  key={gradient.id}
                  id={gradient.id}
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  {gradient.stops.map((stop, i) => (
                    <stop
                      key={i}
                      offset={stop.offset}
                      stopColor={stop.color}
                      stopOpacity={stop.opacity}
                    />
                  ))}
                </linearGradient>
              ))}
            </defs>
          )}

          <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
            {/* Stage labels */}
            <g className="sankey-diagram__stage-labels">
              {stageLabels.map((label) => (
                <text
                  key={`stage-${label.stage}`}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill="#374151"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label.label}
                </text>
              ))}
            </g>

            {/* Links */}
            <g className="sankey-diagram__links">
              {layout.links.map((link, index) => {
                // Check if this specific link has a gradient
                const hasGradient = linkGradients?.some(g => g.id === `gradient-${panel}-link-${index}`)

                return (
                  <SankeyLink
                    key={`link-${index}`}
                    link={link}
                    animationDuration={animationDuration}
                    onMouseEnter={() => setHoveredLinkIndex(index)}
                    onMouseLeave={() => setHoveredLinkIndex(null)}
                    onClick={showHistogramOnClick ? () => handleLinkHistogramClick(link) : undefined}
                    gradientId={hasGradient ? `gradient-${panel}-link-${index}` : undefined}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g className="sankey-diagram__nodes">
              {(() => {
                // Get all vertical bar nodes sorted by y position (top to bottom)
                const verticalBarNodes = layout.nodes
                  .filter(n => n.node_type === 'vertical_bar')
                  .sort((a, b) => (a.y0 || 0) - (b.y0 || 0))

                // Find the topmost vertical bar node for label display
                const topmostVerticalBarNode = verticalBarNodes[0]

                // Calculate total features and cumulative indices for vertical bars
                const totalFeatures = verticalBarNodes.reduce((sum, node) => sum + (node.feature_count || 0), 0)
                const nodeIndices = new Map<string, number>()
                let cumulativeIndex = 0
                verticalBarNodes.forEach(node => {
                  nodeIndices.set(node.id, cumulativeIndex)
                  cumulativeIndex += node.feature_count || 0
                })

                return layout.nodes.map((node) => {
                  // Calculate common props for both node types
                  // Use tree-based system for button visibility
                  let canAdd = false
                  let canRemove = false

                  if (sankeyTree && computedSankey) {
                    // Tree-based system: check if node exists and can have children
                    const treeNode = sankeyTree.get(node.id)
                    if (treeNode) {
                      // Don't show + button on root when it has no children (overlay is showing)
                      if (node.id === 'root' && treeNode.children.length === 0) {
                        canAdd = false
                      } else {
                        canAdd = canAddStage(treeNode)
                      }
                      canRemove = hasChildren(treeNode)
                    }
                  }

                  const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                      hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')

                  // Check if this is a vertical bar node
                  if (node.node_type === 'vertical_bar') {
                    const isTopmostVerticalBar = topmostVerticalBarNode && node.id === topmostVerticalBarNode.id
                    const nodeStartIndex = nodeIndices.get(node.id) || 0
                    return (
                      <VerticalBarSankeyNode
                        key={node.id}
                        node={node}
                        scrollState={tableScrollState}
                        onAddStage={canAdd ? (e) => handleAddStageClick(e, node) : undefined}
                        onRemoveStage={canRemove ? (e) => handleRemoveStageClick(e, node) : undefined}
                        canAddStage={!!canAdd}
                        canRemoveStage={!!canRemove}
                        flowDirection={flowDirection}
                        animationDuration={animationDuration}
                        showLabels={isTopmostVerticalBar}
                        totalFeatureCount={totalFeatures}
                        nodeStartIndex={nodeStartIndex}
                      />
                    )
                  }

                // Otherwise render standard node
                return (
                  <SankeyNode
                    key={node.id}
                    node={node}
                    isHovered={hoveredNodeId === node.id}
                    isHighlighted={isHighlighted}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={showHistogramOnClick ? () => handleNodeHistogramClick(node) : undefined}
                    onAddStage={canAdd ? (e) => handleAddStageClick(e, node) : undefined}
                    onRemoveStage={canRemove ? (e) => handleRemoveStageClick(e, node) : undefined}
                    canAddStage={!!canAdd}
                    canRemoveStage={!!canRemove}
                    flowDirection={flowDirection}
                    animationDuration={animationDuration}
                  />
                )
              })
            })()}
            </g>

            {/* Metric Overlay Panel - Visible only when root has no children (initial state) */}
            {(() => {
              const rootNode = layout.nodes.find(n => n.id === 'root')
              if (!rootNode || !sankeyTree) return null

              const treeNode = sankeyTree.get('root')
              if (!treeNode) return null

              // Only show when root has no children (initial state)
              if (treeNode.children.length > 0) return null

              const availableStages = getAvailableStages(treeNode, sankeyTree, AVAILABLE_STAGES)
              if (availableStages.length === 0) return null

              return (
                <MetricOverlayPanel
                  rootNode={rootNode}
                  availableStages={availableStages}
                  onMetricClick={handleOverlayMetricClick}
                />
              )
            })()}
          </g>
        </svg>
      </div>

      {/* Inline Stage Selector */}
      {inlineSelector && (
        <>
          <div
            className="sankey-stage-selector-overlay"
            onClick={() => setInlineSelector(null)}
          />
          <div
            className="sankey-stage-selector"
            style={{
              left: Math.min(inlineSelector.position.x, window.innerWidth - 280),
              top: inlineSelector.position.y,
              transform: 'translateY(-50%)'
            }}
          >
            {/* Group stages by category */}
            {['Feature Splitting', 'Score', 'Consistency'].map((category) => {
              const stagesInCategory = inlineSelector.availableStages.filter(
                (stage) => stage.category === category
              )

              if (stagesInCategory.length === 0) return null

              return (
                <div key={category} className="sankey-stage-selector__category-group">
                  <div className="sankey-stage-selector__category-header">
                    {category}
                  </div>
                  {stagesInCategory.map((stageType) => (
                    <div
                      key={stageType.id}
                      onClick={() => handleStageSelect(stageType.id)}
                      className="sankey-stage-selector__item"
                    >
                      <div className="sankey-stage-selector__item-content">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 20 20"
                          className="sankey-stage-selector__item-circle"
                        >
                          <circle
                            cx="10"
                            cy="10"
                            r="8"
                            fill={getMetricColorForDisplay(stageType.metric)}
                            stroke="#d1d5db"
                            strokeWidth="1"
                          />
                        </svg>
                        <div className="sankey-stage-selector__item-text">
                          <div className="sankey-stage-selector__item-title">
                            {stageType.name}
                          </div>
                          <div className="sankey-stage-selector__item-description">
                            {stageType.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default SankeyDiagram