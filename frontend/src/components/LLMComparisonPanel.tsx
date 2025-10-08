import React, { useMemo, useState } from 'react'
import { useResizeObserver } from '../lib/utils'
import {
  calculateLLMComparisonLayout,
  DEFAULT_LLM_COMPARISON_DIMENSIONS
} from '../lib/d3-llm-comparison-utils'
import { OKABE_ITO_PALETTE } from '../lib/constants'
import '../styles/LLMComparisonPanel.css'

interface LLMComparisonPanelProps {
  className?: string
}

export const LLMComparisonPanel: React.FC<LLMComparisonPanelProps> = ({ className = '' }) => {
  // State for hover effects
  const [hoveredTriangle, setHoveredTriangle] = useState<string | null>(null)

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

  return (
    <div ref={containerRef} className={`llm-comparison-panel ${className}`}>
      <svg
        className="llm-comparison-panel__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Left triangle cells - 90° vertex pointing left */}
        {leftTriangle.cells.map((cell, i) => (
          <polygon
            key={`left-${i}`}
            points={cell.points}
            fill={OKABE_ITO_PALETTE.BLUE}
            opacity={hoveredTriangle === 'left' ? 1 : 0.8}
            stroke="white"
            strokeWidth={2}
            className="llm-comparison-panel__cell"
            onMouseEnter={() => setHoveredTriangle('left')}
            onMouseLeave={() => setHoveredTriangle(null)}
          />
        ))}

        {/* Top right triangle cells - 90° vertex pointing down */}
        {topRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`top-right-${i}`}
            points={cell.points}
            fill={OKABE_ITO_PALETTE.ORANGE}
            opacity={hoveredTriangle === 'top-right' ? 1 : 0.8}
            stroke="white"
            strokeWidth={2}
            className="llm-comparison-panel__cell"
            onMouseEnter={() => setHoveredTriangle('top-right')}
            onMouseLeave={() => setHoveredTriangle(null)}
          />
        ))}

        {/* Middle right triangle cells - 90° vertex pointing left */}
        {middleRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`middle-right-${i}`}
            points={cell.points}
            fill={OKABE_ITO_PALETTE.REDDISH_PURPLE}
            opacity={hoveredTriangle === 'middle-right' ? 1 : 0.8}
            stroke="white"
            strokeWidth={2}
            className="llm-comparison-panel__cell"
            onMouseEnter={() => setHoveredTriangle('middle-right')}
            onMouseLeave={() => setHoveredTriangle(null)}
          />
        ))}

        {/* Bottom right triangle cells - 90° vertex pointing up */}
        {bottomRightTriangle.cells.map((cell, i) => (
          <polygon
            key={`bottom-right-${i}`}
            points={cell.points}
            fill={OKABE_ITO_PALETTE.BLUISH_GREEN}
            opacity={hoveredTriangle === 'bottom-right' ? 1 : 0.8}
            stroke="white"
            strokeWidth={2}
            className="llm-comparison-panel__cell"
            onMouseEnter={() => setHoveredTriangle('bottom-right')}
            onMouseLeave={() => setHoveredTriangle(null)}
          />
        ))}
      </svg>
    </div>
  )
}

export default LLMComparisonPanel
