import React, { useMemo } from 'react'
import {
  calculateExplainerGridCells,
  calculateBarGraphLayout,
  EXPLAINER_PAIR_MAP,
  EXPLAINER_INDEX_MAP,
  getSemanticSimilarityColor
} from '../lib/explainer-grid-utils'
import '../styles/ExplainerComparisonGrid.css'

// ViewBox height for consistent calculations (width will be dynamic based on content)
const VIEWBOX_HEIGHT = 100

interface ExplainerComparisonGridProps {
  /** Gap between cells */
  cellGap?: number
  /** Explainer IDs for comparison */
  explainerIds?: string[]
  /** Pairwise similarity scores: Map<"explainerId1:explainerId2", similarity> */
  pairwiseSimilarities?: Map<string, number>
  /** Quality scores for each explainer: Map<explainerId, score> (0-1) */
  qualityScores?: Map<string, number>
  /** Optional click handler for pair cells */
  onPairClick?: (explainer1: string, explainer2: string) => void
}

const ExplainerComparisonGrid: React.FC<ExplainerComparisonGridProps> = ({
  cellGap = 2,  // Use 2-5 for visible gaps (0.5 is too small for viewBox 100)
  explainerIds = [],
  pairwiseSimilarities,
  qualityScores,
  onPairClick
}) => {
  // Calculate triangle size to fit within viewBox
  const triangleSize = VIEWBOX_HEIGHT * 0.32
  const cellSize = triangleSize / 2
  const cellSpan = cellSize / Math.sqrt(2)

  const cells = useMemo(() => {
    // Vertex position for 'left' orientation (vertex on left, extends right)
    const vx = 0
    // Calculate vy to top-align: need space for top triangle above the vertex
    const triangleVerticalOffset = cellSpan * 2 + cellGap * 2
    const topMargin = 5
    const vy = topMargin + triangleVerticalOffset + cellSpan
    return calculateExplainerGridCells(vx, vy, triangleSize, 'left', cellGap)
  }, [triangleSize, cellSpan, cellGap])

  // Calculate bar graph layout with shared axis
  // Parameters: cells, barGap, barWidth, barHeight, axisPadding, barAxisGap
  const barLayout = useMemo(() => {
    return calculateBarGraphLayout(cells, 3, 40, cellSize * Math.sqrt(2), 2)
  }, [cells, cellSpan])

  // Fixed viewBox width - decoupled from bar dimensions to prevent scaling issues
  const viewBoxWidth = 100

  return (
    <svg
      className="explainer-comparison-grid"
      viewBox={`0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMinYMin meet"
    >
      {cells.map((cell) => {
        const isDiamond = cell.type === 'diamond'
        const pairIndices = EXPLAINER_PAIR_MAP[cell.cellIndex]

        // Get similarity color for diamond cells
        let fillColor: string | undefined
        if (isDiamond && pairIndices && explainerIds.length >= 3 && pairwiseSimilarities) {
          const [i, j] = pairIndices
          const key = `${explainerIds[i]}:${explainerIds[j]}`
          const similarity = pairwiseSimilarities.get(key)
          if (similarity !== undefined) {
            fillColor = getSemanticSimilarityColor(similarity)
          }
        }

        return (
          <polygon
            key={cell.cellIndex}
            className={`grid-cell grid-cell--${cell.type}`}
            points={cell.points}
            style={fillColor ? { fill: fillColor } : undefined}
            onClick={() => {
              if (isDiamond && pairIndices && onPairClick && explainerIds.length >= 3) {
                onPairClick(explainerIds[pairIndices[0]], explainerIds[pairIndices[1]])
              }
            }}
          />
        )
      })}

      {/* Quality score bar graph with shared axis */}
      <g className="quality-bar-graph">
        {/* Shared Y-axis line (vertical) */}
        <line
          x1={barLayout.axis.x}
          y1={barLayout.axis.y1}
          x2={barLayout.axis.x}
          y2={barLayout.axis.y2 + 2}
          stroke="#9ca3af"
          strokeWidth={0.5}
        />
        {/* Shared X-axis line (horizontal at bottom of bar area) */}
        <line
          x1={barLayout.axis.x - 2}
          y1={barLayout.axis.xAxisY + 2}
          x2={barLayout.axis.xAxisEndX}
          y2={barLayout.axis.xAxisY + 2}
          stroke="#9ca3af"
          strokeWidth={0.5}
        />
        {/* Tick mark at 0 */}
        <line
          x1={barLayout.axis.x}
          y1={barLayout.axis.xAxisY + 2}
          x2={barLayout.axis.x}
          y2={barLayout.axis.xAxisY + 4}
          stroke="#9ca3af"
          strokeWidth={0.5}
        />
        {/* Tick mark at 1.0 */}
        <line
          x1={barLayout.axis.xAxisEndX}
          y1={barLayout.axis.xAxisY + 2}
          x2={barLayout.axis.xAxisEndX}
          y2={barLayout.axis.xAxisY + 4}
          stroke="#9ca3af"
          strokeWidth={0.5}
        />
        {/* Label: 0 */}
        <text
          x={barLayout.axis.x}
          y={barLayout.axis.xAxisY + 11}
          fontSize={7}
          fill="#6b7280"
          textAnchor="middle"
        >
          0
        </text>
        {/* Label: 1 */}
        <text
          x={barLayout.axis.xAxisEndX}
          y={barLayout.axis.xAxisY + 11}
          fontSize={7}
          fill="#6b7280"
          textAnchor="middle"
        >
          1
        </text>
        {/* Label: Quality Score */}
        <text
          x={(barLayout.axis.x + barLayout.axis.xAxisEndX) / 2}
          y={barLayout.axis.xAxisY + 20}
          fontSize={8}
          fill="#6b7280"
          textAnchor="middle"
        >
          Quality Score
        </text>

        {/* Individual bars for each explainer */}
        {cells.filter(cell => cell.type === 'triangle').map((cell) => {
          const explainerIndex = EXPLAINER_INDEX_MAP[cell.cellIndex]
          if (explainerIndex === undefined) return null

          const explainerId = explainerIds[explainerIndex]
          const score = qualityScores?.get(explainerId) ?? 0
          const barPos = barLayout.bars.get(cell.cellIndex)

          if (!barPos) return null

          // Bars start at the Y-axis position (no gap)
          const barStartX = barLayout.axis.x

          return (
            <rect
              key={`bar-${cell.cellIndex}`}
              x={barStartX}
              y={barPos.barY}
              width={barPos.barMaxWidth * score}
              height={barPos.barHeight}
              fill="#4b5563"
            />
          )
        })}
      </g>
    </svg>
  )
}

export default React.memo(ExplainerComparisonGrid)
