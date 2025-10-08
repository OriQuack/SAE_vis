import React, { useMemo } from 'react'
import { useResizeObserver } from '../lib/utils'
import {
  calculateLLMComparisonLayout,
  DEFAULT_LLM_COMPARISON_DIMENSIONS
} from '../lib/d3-llm-comparison-utils'
import { COMPONENT_COLORS, LLM_EXPLAINER_ICON_SVG, LLM_SCORER_ICON_SVG } from '../lib/constants'
import '../styles/LLMComparisonVisualization.css'

interface LLMComparisonVisualizationProps {
  className?: string
  cellOpacity?: number
}

export const LLMComparisonVisualization: React.FC<LLMComparisonVisualizationProps> = ({
  className = '',
  cellOpacity = 0
}) => {
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

  const { leftTriangle, topRightTriangle, middleRightTriangle, bottomRightTriangle } = layout

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

  const strokeWidth = 3

  return (
    <div ref={containerRef} className={`llm-comparison-visualization ${className}`}>
      <svg
        className="llm-comparison-visualization__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Left Label with Icon - LLM Explainer */}
        <g className="llm-comparison-visualization__label-group">
          <svg
            x={leftIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-visualization__icon"
            dangerouslySetInnerHTML={{ __html: LLM_EXPLAINER_ICON_SVG }}
          />
          <text
            x={leftTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-visualization__label"
            fill="#333"
            fontSize="14"
            fontWeight="600"
          >
            LLM Explainer
          </text>
        </g>

        {/* Right Label with Icon - LLM Scorer */}
        <g className="llm-comparison-visualization__label-group">
          <svg
            x={rightIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-visualization__icon"
            dangerouslySetInnerHTML={{ __html: LLM_SCORER_ICON_SVG }}
          />
          <text
            x={rightTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-visualization__label"
            fill="#333"
            fontSize="14"
            fontWeight="600"
          >
            LLM Scorer
          </text>
        </g>

        {/* Left triangle cells - LLM Explainer (Orange) */}
        {leftTriangle.cells.map((cell, i) => (
          <polygon
            key={`left-${i}`}
            points={cell.points}
            fill={COMPONENT_COLORS.EXPLAINER}
            fillOpacity={cellOpacity}
            stroke={COMPONENT_COLORS.EXPLAINER}
            strokeWidth={strokeWidth}
            className="llm-comparison-visualization__cell"
          />
        ))}

        {/* Top right triangle cells - LLM Scorer (Blue) */}
        {topRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`top-right-${i}`}
            points={cell.points}
            fill={COMPONENT_COLORS.SCORER}
            fillOpacity={cellOpacity}
            stroke={COMPONENT_COLORS.SCORER}
            strokeWidth={strokeWidth}
            className="llm-comparison-visualization__cell"
          />
        ))}

        {/* Middle right triangle cells - LLM Scorer (Blue) */}
        {middleRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`middle-right-${i}`}
            points={cell.points}
            fill={COMPONENT_COLORS.SCORER}
            fillOpacity={cellOpacity}
            stroke={COMPONENT_COLORS.SCORER}
            strokeWidth={strokeWidth}
            className="llm-comparison-visualization__cell"
          />
        ))}

        {/* Bottom right triangle cells - LLM Scorer (Blue) */}
        {bottomRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`bottom-right-${i}`}
            points={cell.points}
            fill={COMPONENT_COLORS.SCORER}
            fillOpacity={cellOpacity}
            stroke={COMPONENT_COLORS.SCORER}
            strokeWidth={strokeWidth}
            className="llm-comparison-visualization__cell"
          />
        ))}
      </svg>
    </div>
  )
}

export default LLMComparisonVisualization
