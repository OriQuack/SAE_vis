import React, { useMemo, useState } from 'react'
import { useResizeObserver } from '../lib/utils'
import {
  calculateLLMComparisonLayout,
  DEFAULT_LLM_COMPARISON_DIMENSIONS
} from '../lib/d3-llm-comparison-utils'
import { COMPONENT_COLORS, LLM_EXPLAINER_ICON_SVG, LLM_SCORER_ICON_SVG } from '../lib/constants'
import '../styles/LLMComparisonPanel.css'

interface LLMComparisonPanelProps {
  className?: string
}

export const LLMComparisonPanel: React.FC<LLMComparisonPanelProps> = ({ className = '' }) => {
  // State for hover effects - track individual cells
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  // Resize observer for responsive sizing
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: DEFAULT_LLM_COMPARISON_DIMENSIONS.width,
    defaultHeight: DEFAULT_LLM_COMPARISON_DIMENSIONS.height,
    debounceMs: 16
  })

  // Use container dimensions
  const width = containerSize.width
  const height = containerSize.height

  // Calculate layout using D3 utilities
  const layout = useMemo(() => {
    const dimensions = {
      width,
      height,
      margin: DEFAULT_LLM_COMPARISON_DIMENSIONS.margin,
      triangleGap: DEFAULT_LLM_COMPARISON_DIMENSIONS.triangleGap
    }
    return calculateLLMComparisonLayout(dimensions)
  }, [width, height])

  const { leftTriangle, topRightTriangle, middleRightTriangle, bottomRightTriangle, innerWidth, innerHeight } = layout

  // Calculate label positions - at the top
  const margin = DEFAULT_LLM_COMPARISON_DIMENSIONS.margin
  const iconSize = 40
  const iconTextGap = 5
  const labelY = margin.top + 10
  const sidePadding = 0

  // Left: align to left edge (icon first, then text)
  const leftIconX = margin.left + sidePadding
  const leftTextX = leftIconX + iconSize + iconTextGap

  // Right: align to right edge (icon first, then text)
  const estimatedTextWidth = 90
  const rightGroupEnd = width - margin.right - sidePadding
  const rightIconX = rightGroupEnd - estimatedTextWidth - iconTextGap - iconSize
  const rightTextX = rightIconX + iconSize + iconTextGap

  return (
    <div ref={containerRef} className={`llm-comparison-panel ${className}`}>
      <svg
        className="llm-comparison-panel__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Left Label with Icon - LLM Explainer */}
        <g className="llm-comparison-panel__label-group">
          <svg
            x={leftIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-panel__icon"
            dangerouslySetInnerHTML={{ __html: LLM_EXPLAINER_ICON_SVG }}
          />
          <text
            x={leftTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-panel__label"
            fill="#333"
            fontSize="14"
            fontWeight="600"
          >
            LLM Explainer
          </text>
        </g>

        {/* Right Label with Icon - LLM Scorer */}
        <g className="llm-comparison-panel__label-group">
          <svg
            x={rightIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-panel__icon"
            dangerouslySetInnerHTML={{ __html: LLM_SCORER_ICON_SVG }}
          />
          <text
            x={rightTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-panel__label"
            fill="#333"
            fontSize="14"
            fontWeight="600"
          >
            LLM Scorer
          </text>
        </g>

        {/* Left triangle cells - LLM Explainer (Orange) */}
        {leftTriangle.cells.map((cell, i) => {
          const cellId = `left-${i}`
          const isHovered = hoveredCell === cellId
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.EXPLAINER}
              opacity={isHovered ? 1 : 0.3}
              stroke="white"
              strokeWidth={isHovered ? 3 : 2}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
            />
          )
        })}

        {/* Top right triangle cells - LLM Scorer (Blue) */}
        {topRightTriangle.cells.map((cell, i) => {
          const cellId = `top-right-${i}`
          const isHovered = hoveredCell === cellId
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              opacity={isHovered ? 1 : 0.3}
              stroke="white"
              strokeWidth={isHovered ? 3 : 2}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
            />
          )
        })}

        {/* Middle right triangle cells - LLM Scorer (Blue) */}
        {middleRightTriangle.cells.map((cell, i) => {
          const cellId = `middle-right-${i}`
          const isHovered = hoveredCell === cellId
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              opacity={isHovered ? 1 : 0.3}
              stroke="white"
              strokeWidth={isHovered ? 3 : 2}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
            />
          )
        })}

        {/* Bottom right triangle cells - LLM Scorer (Blue) */}
        {bottomRightTriangle.cells.map((cell, i) => {
          const cellId = `bottom-right-${i}`
          const isHovered = hoveredCell === cellId
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              opacity={isHovered ? 1 : 0.3}
              stroke="white"
              strokeWidth={isHovered ? 3 : 2}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
            />
          )
        })}
      </svg>
    </div>
  )
}

export default LLMComparisonPanel
