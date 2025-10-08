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
  // State for hover effects - track individual cells and linked triangles
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)
  const [linkedTriangles, setLinkedTriangles] = useState<('top' | 'middle' | 'bottom')[]>([])

  // State for click/selection - track filled cells
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())

  // Determine which right triangle groups correspond to a left triangle cell (cross-triangle linking)
  const getLinkedTriangles = (cellIndex: number): ('top' | 'middle' | 'bottom')[] => {
    switch (cellIndex) {
      case 0: return ['top']                    // Top triangle at vertex
      case 1: return ['top', 'bottom']          // Right diamond (row 1) → top AND bottom
      case 2: return ['middle']                 // Right triangle (row 1)
      case 3: return ['top', 'middle']          // Top-left diamond (row 2) → top AND middle
      case 4: return ['middle', 'bottom']       // Bottom-left diamond (row 2) → middle AND bottom
      case 5: return ['bottom']                 // Bottom-right triangle (row 2)
      default: return []
    }
  }

  // Get triangle cells linked to a diamond within the same triangle (intra-triangle linking)
  const getIntraTriangleLinks = (cellIndex: number): number[] => {
    switch (cellIndex) {
      case 1: return [0, 5]     // Right diamond (row 1, col 0) → top and bottom triangles
      case 3: return [0, 2]     // Top-left diamond (row 2, col 0) → top 2 triangles
      case 4: return [2, 5]     // Bottom-left diamond (row 2, col 1) → middle and bottom triangles
      default: return []        // Triangles don't link to other cells within triangle
    }
  }

  // Check if a left cell is a triangle (not a diamond)
  const isTriangleCell = (cellIndex: number): boolean => {
    return [0, 2, 5].includes(cellIndex)  // Triangle cells at vertices
  }

  // Get which left cells affect a right triangle cell (reverse mapping for additive opacity)
  const getLeftCellsAffectingRightCell = (triangleGroup: string): number[] => {
    switch (triangleGroup) {
      case 'top-right': return [0, 1, 3]       // Top right affected by left cells 0, 1, 3
      case 'middle-right': return [2, 3, 4]    // Middle right affected by left cells 2, 3, 4
      case 'bottom-right': return [1, 4, 5]    // Bottom right affected by left cells 1, 4, 5
      default: return []
    }
  }

  // Check if a left cell is affected by any right triangle cell hover (reverse linking)
  const isLeftCellAffectedByRightInteraction = (leftIndex: number): boolean => {
    // Only triangle cells (0, 2, 5) are affected by reverse linking
    if (!isTriangleCell(leftIndex)) return false

    const linkedTriangles = getLinkedTriangles(leftIndex)

    // For each linked triangle group, check if any cell is hovered (not selected)
    for (const triangleGroup of linkedTriangles) {
      const prefix = triangleGroup === 'top' ? 'top-right-' :
                     triangleGroup === 'middle' ? 'middle-right-' :
                     'bottom-right-'

      // Check if any cell in this triangle is hovered
      for (let i = 0; i < 6; i++) {
        const rightCellId = `${prefix}${i}`
        if (hoveredCell === rightCellId) {
          return true
        }
      }
    }

    return false
  }

  // Check if a cell should be highlighted (hovered)
  const isCellHighlighted = (cellId: string, triangleGroup: string): boolean => {
    if (hoveredCell === cellId) return true

    // Cross-triangle linking (left cell → right triangles)
    if (hoveredCell?.startsWith('left-') && linkedTriangles.length > 0) {
      if (triangleGroup === 'top-right' && linkedTriangles.includes('top')) return true
      if (triangleGroup === 'middle-right' && linkedTriangles.includes('middle')) return true
      if (triangleGroup === 'bottom-right' && linkedTriangles.includes('bottom')) return true
    }

    // Intra-triangle linking (diamond → triangles within same triangle)
    if (hoveredCell) {
      const hoveredParts = hoveredCell.split('-')
      const hoveredIndex = parseInt(hoveredParts[hoveredParts.length - 1])
      const hoveredTriangleId = hoveredParts.slice(0, -1).join('-')

      const cellParts = cellId.split('-')
      const cellIndex = parseInt(cellParts[cellParts.length - 1])
      const currentTriangleId = cellParts.slice(0, -1).join('-')

      // Check if same triangle and cell is in intra-triangle links
      if (hoveredTriangleId === currentTriangleId) {
        const linkedCells = getIntraTriangleLinks(hoveredIndex)
        if (linkedCells.includes(cellIndex)) return true
      }
    }

    return false
  }

  // Handle cell click - toggle selection with linking
  const handleCellClick = (cellId: string, cellIndex?: number) => {
    const cellsToToggle = new Set<string>([cellId])

    if (cellIndex !== undefined) {
      // Intra-triangle linking: Add triangle cells linked within the same triangle
      const intraCellLinks = getIntraTriangleLinks(cellIndex)
      const triangleId = cellId.split('-').slice(0, -1).join('-')

      intraCellLinks.forEach(linkedIndex => {
        cellsToToggle.add(`${triangleId}-${linkedIndex}`)
      })
    }

    // Reverse linking: if clicking a right cell, add linked left triangle cells
    if (!cellId.startsWith('left-')) {
      const triangleGroup = cellId.split('-').slice(0, -1).join('-')
      const affectingLeftCells = getLeftCellsAffectingRightCell(triangleGroup)

      affectingLeftCells.forEach(leftIndex => {
        // Only add triangle cells, not diamonds
        if (isTriangleCell(leftIndex)) {
          cellsToToggle.add(`left-${leftIndex}`)
        }
      })
    }

    setSelectedCells(prev => {
      const newSet = new Set(prev)
      const isCurrentlySelected = newSet.has(cellId)

      // Toggle all cells in the group
      cellsToToggle.forEach(c => {
        if (isCurrentlySelected) {
          newSet.delete(c)
        } else {
          newSet.add(c)
        }
      })

      return newSet
    })
  }

  // Get visual properties for a cell based on state
  const getCellVisuals = (cellId: string, triangleGroup: string) => {
    const isSelected = selectedCells.has(cellId)
    const isHighlighted = isCellHighlighted(cellId, triangleGroup)
    const isDirectHover = hoveredCell === cellId
    const isLeftCell = cellId.startsWith('left-')

    // Left cells: use absolute opacity logic
    if (isLeftCell) {
      const leftIndex = parseInt(cellId.split('-')[1])

      if (isSelected) {
        return { fillOpacity: 1.0, strokeWidth: 3 }
      } else if (isHighlighted) {
        return { fillOpacity: isDirectHover ? 0.3 : 0.2, strokeWidth: 3 }
      } else if (isLeftCellAffectedByRightInteraction(leftIndex)) {
        // Reverse linking: right cell interaction affects this left cell
        return { fillOpacity: 0.2, strokeWidth: 3 }
      } else {
        return { fillOpacity: 0, strokeWidth: 3 }
      }
    }

    // Right cells: use hybrid logic (absolute when selected, additive otherwise)
    // If directly selected (clicked on this right cell) → absolute 1.0
    if (isSelected) {
      return { fillOpacity: 1.0, strokeWidth: 3 }
    }

    // Otherwise, use additive logic
    let opacity = 0

    // Base: if ANY linked left cell is selected → 0.4
    const affectingLeftCells = getLeftCellsAffectingRightCell(triangleGroup)
    const hasLinkedLeftSelection = affectingLeftCells.some(idx =>
      selectedCells.has(`left-${idx}`)
    )
    if (hasLinkedLeftSelection) opacity = 0.4

    // If ANY linked left cell is hovered → +0.3
    const hasLinkedLeftHover = affectingLeftCells.some(idx =>
      hoveredCell === `left-${idx}`
    )
    if (hasLinkedLeftHover) opacity += 0.3

    // Intra-triangle hover: if a diamond in same triangle is hovered and links to this cell → +0.3
    if (hoveredCell) {
      const hoveredParts = hoveredCell.split('-')
      const hoveredIndex = parseInt(hoveredParts[hoveredParts.length - 1])
      const hoveredTriangleId = hoveredParts.slice(0, -1).join('-')

      const cellParts = cellId.split('-')
      const cellIndex = parseInt(cellParts[cellParts.length - 1])
      const currentTriangleId = cellParts.slice(0, -1).join('-')

      // Check if same triangle and this cell is in hovered cell's intra-triangle links
      if (hoveredTriangleId === currentTriangleId) {
        const linkedCells = getIntraTriangleLinks(hoveredIndex)
        if (linkedCells.includes(cellIndex)) {
          opacity += 0.3
        }
      }
    }

    // Direct hover adds +0.3
    if (isDirectHover) opacity += 0.3

    return { fillOpacity: Math.min(1.0, opacity), strokeWidth: 3 }
  }

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
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId, 'left')
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.EXPLAINER}
              fillOpacity={fillOpacity}
              stroke={COMPONENT_COLORS.EXPLAINER}
              strokeWidth={strokeWidth}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => {
                setHoveredCell(cellId)
                setLinkedTriangles(getLinkedTriangles(i))
              }}
              onMouseLeave={() => {
                setHoveredCell(null)
                setLinkedTriangles([])
              }}
              onClick={() => handleCellClick(cellId, i)}
            />
          )
        })}

        {/* Top right triangle cells - LLM Scorer (Blue) */}
        {topRightTriangle.cells.map((cell, i) => {
          const cellId = `top-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId, 'top-right')
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              fillOpacity={fillOpacity}
              stroke={COMPONENT_COLORS.SCORER}
              strokeWidth={strokeWidth}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => handleCellClick(cellId, i)}
            />
          )
        })}

        {/* Middle right triangle cells - LLM Scorer (Blue) */}
        {middleRightTriangle.cells.map((cell, i) => {
          const cellId = `middle-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId, 'middle-right')
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              fillOpacity={fillOpacity}
              stroke={COMPONENT_COLORS.SCORER}
              strokeWidth={strokeWidth}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => handleCellClick(cellId, i)}
            />
          )
        })}

        {/* Bottom right triangle cells - LLM Scorer (Blue) */}
        {bottomRightTriangle.cells.map((cell, i) => {
          const cellId = `bottom-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId, 'bottom-right')
          return (
            <polygon
              key={cellId}
              points={cell.points}
              fill={COMPONENT_COLORS.SCORER}
              fillOpacity={fillOpacity}
              stroke={COMPONENT_COLORS.SCORER}
              strokeWidth={strokeWidth}
              className="llm-comparison-panel__cell"
              onMouseEnter={() => setHoveredCell(cellId)}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => handleCellClick(cellId, i)}
            />
          )
        })}
      </svg>
    </div>
  )
}

export default LLMComparisonPanel
