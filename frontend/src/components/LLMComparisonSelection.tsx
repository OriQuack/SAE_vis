import React, { useMemo, useState, useEffect } from 'react'
import { calculateLLMComparisonLayout, getConsistencyColor, getGradientStops, CONSISTENCY_SCALE } from '../lib/d3-llm-comparison-utils'
import { COMPONENT_COLORS, LLM_EXPLAINER_ICON_SVG, LLM_SCORER_ICON_SVG } from '../lib/constants'
import type { LLMComparisonData } from '../types'
import { getLLMComparisonData } from '../api'
import '../styles/LLMComparisonSelection.css'

interface LLMComparisonSelectionProps {
  className?: string
}

export const LLMComparisonSelection: React.FC<LLMComparisonSelectionProps> = ({ className = '' }) => {
  // State for hover effects - track individual cells
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  // State for click/selection - track filled cells with timestamps for ordering
  const [selectedCells, setSelectedCells] = useState<Map<string, number>>(new Map())

  // State for LLM comparison data
  const [comparisonData, setComparisonData] = useState<LLMComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load real data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const data = await getLLMComparisonData({})
        setComparisonData(data)
        setError(null)
      } catch (err) {
        console.error('Failed to load LLM comparison data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Calculate layout once - MUST be before early returns (Rules of Hooks)
  const layout = useMemo(() => calculateLLMComparisonLayout(), [])

  // Show loading state
  if (loading || !comparisonData) {
    return (
      <div className={`llm-comparison-selection ${className}`}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Loading LLM comparison data...
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className={`llm-comparison-selection ${className}`}>
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          Error: {error}
        </div>
      </div>
    )
  }

  // Helper: Get model name for a cell
  const getModelName = (cellId: string, cellIndex: number): string | null => {
    const triangleIndices = [0, 2, 5]
    const modelIndex = triangleIndices.indexOf(cellIndex)

    if (modelIndex < 0) return null // Diamond cell

    if (cellId.startsWith('left-')) {
      return comparisonData.explainers[modelIndex].name
    } else if (cellId.startsWith('top-right-')) {
      return comparisonData.scorersForExplainer1[modelIndex].name
    } else if (cellId.startsWith('middle-right-')) {
      return comparisonData.scorersForExplainer2[modelIndex].name
    } else if (cellId.startsWith('bottom-right-')) {
      return comparisonData.scorersForExplainer3[modelIndex].name
    }

    return null
  }

  // Helper: Get consistency color for diamond cells
  const getConsistencyColorForCell = (cellId: string): string | null => {
    if (cellId.startsWith('left-')) {
      const score = comparisonData.explainerConsistencies[cellId as keyof typeof comparisonData.explainerConsistencies]
      return score ? getConsistencyColor(score.value) : null
    } else {
      const score = comparisonData.scorerConsistencies[cellId]
      return score ? getConsistencyColor(score.value) : null
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

  // Check if a cell is a diamond
  const isDiamondCell = (cellIndex: number): boolean => {
    return [1, 3, 4].includes(cellIndex)  // Diamond cells
  }

  // Get the diamond linked to two triangle cells within the same triangle
  const getLinkedDiamond = (triangleIndex1: number, triangleIndex2: number): number | null => {
    const indices = [triangleIndex1, triangleIndex2].sort()
    if (indices[0] === 0 && indices[1] === 2) return 3  // Top two triangles → top-left diamond
    if (indices[0] === 0 && indices[1] === 5) return 1  // Top and bottom → right diamond
    if (indices[0] === 2 && indices[1] === 5) return 4  // Middle and bottom → bottom-left diamond
    return null
  }

  // Get triangle cells currently selected in a specific triangle
  const getSelectedTriangleCells = (triangleId: string, selections: Map<string, number>): Array<{ cellId: string; timestamp: number }> => {
    const triangleCells = []
    for (const [cellId, timestamp] of selections.entries()) {
      if (!cellId.startsWith(triangleId)) continue
      const cellIndex = parseInt(cellId.split('-').pop() || '-1')
      if (isTriangleCell(cellIndex)) {
        triangleCells.push({ cellId, timestamp })
      }
    }
    return triangleCells.sort((a, b) => a.timestamp - b.timestamp)  // Sort by timestamp (oldest first)
  }

  // Get protected left triangle cells (selected via reverse linking from right triangles)
  const getProtectedLeftCells = (selections: Map<string, number>): Set<string> => {
    const protectedCells = new Set<string>()
    const rightTriangles = ['top-right', 'middle-right', 'bottom-right']

    // For each right triangle, check if any cells are selected
    for (const rightTriangle of rightTriangles) {
      let hasRightSelection = false
      for (const cellId of selections.keys()) {
        if (cellId.startsWith(rightTriangle)) {
          hasRightSelection = true
          break
        }
      }

      // If this right triangle has selections, its linked left cells (if selected) are protected
      if (hasRightSelection) {
        const linkedLeftIndices = getLeftCellsAffectingRightCell(rightTriangle)
        linkedLeftIndices.forEach(leftIndex => {
          if (isTriangleCell(leftIndex)) {
            const leftCellId = `left-${leftIndex}`
            // Only protect if this left cell is actually selected
            if (selections.has(leftCellId)) {
              protectedCells.add(leftCellId)
            }
          }
        })
      }
    }

    return protectedCells
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

    // Check each right triangle group to see if any cell is hovered
    const triangleGroups = ['top-right', 'middle-right', 'bottom-right'] as const

    for (const triangleGroup of triangleGroups) {
      // Check if this left cell affects this right triangle group
      const affectingCells = getLeftCellsAffectingRightCell(triangleGroup)
      if (!affectingCells.includes(leftIndex)) continue

      // This left cell affects this right triangle group
      // Check if any cell in this right triangle group is hovered
      for (let i = 0; i < 6; i++) {
        const rightCellId = `${triangleGroup}-${i}`
        if (hoveredCell === rightCellId) {
          return true
        }
      }
    }

    return false
  }

  // Check if a cell should be highlighted (hovered)
  const isCellHighlighted = (cellId: string): boolean => {
    if (hoveredCell === cellId) return true

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
    if (cellIndex === undefined) return

    const triangleId = cellId.split('-').slice(0, -1).join('-')
    const isClickedTriangle = isTriangleCell(cellIndex)
    const isClickedDiamond = isDiamondCell(cellIndex)

    setSelectedCells(prev => {
      const newMap = new Map(prev)
      const isCurrentlySelected = newMap.has(cellId)
      const now = Date.now()

      // If clicking to deselect
      if (isCurrentlySelected) {
        // Remove the cell
        newMap.delete(cellId)

        // If it's a diamond, also remove its linked triangle cells
        if (isClickedDiamond) {
          const linkedCells = getIntraTriangleLinks(cellIndex)
          linkedCells.forEach(linkedIdx => {
            newMap.delete(`${triangleId}-${linkedIdx}`)
          })

          // If this is a right triangle diamond, also clear reverse-linked left triangle cells
          if (triangleId !== 'left') {
            const affectingLeftCells = getLeftCellsAffectingRightCell(triangleId)
            affectingLeftCells.forEach(leftIndex => {
              if (isTriangleCell(leftIndex)) {
                newMap.delete(`left-${leftIndex}`)
              }
            })
          }
        }

        // If it's a triangle cell, check if we need to deselect the linked diamond
        if (isClickedTriangle) {
          const selectedTriangles = getSelectedTriangleCells(triangleId, newMap)
          // If less than 2 triangle cells after removal, remove any linked diamond
          if (selectedTriangles.length < 2) {
            const diamondIndices = [1, 3, 4]
            diamondIndices.forEach(diamondIdx => {
              newMap.delete(`${triangleId}-${diamondIdx}`)
            })
          }
        }

        return newMap
      }

      // If clicking to select
      // RESTRICTION 1: Only one diamond can be selected at a time
      if (isClickedDiamond) {
        const allTriangles = ['left', 'top-right', 'middle-right', 'bottom-right']
        const diamondIndices = [1, 3, 4]

        // Clear all other diamonds and their linked cells
        allTriangles.forEach(triangle => {
          diamondIndices.forEach(idx => {
            const diamondId = `${triangle}-${idx}`
            if (newMap.has(diamondId)) {
              newMap.delete(diamondId)

              // Remove the diamond's linked triangle cells
              const linkedCells = getIntraTriangleLinks(idx)
              linkedCells.forEach(linkedIdx => {
                newMap.delete(`${triangle}-${linkedIdx}`)
              })

              // If this is a right triangle diamond, also clear reverse-linked left triangle cells
              if (triangle !== 'left') {
                const affectingLeftCells = getLeftCellsAffectingRightCell(triangle)
                affectingLeftCells.forEach(leftIndex => {
                  if (isTriangleCell(leftIndex)) {
                    newMap.delete(`left-${leftIndex}`)
                  }
                })
              }
            }
          })
        })

        // Add the clicked diamond and its linked triangle cells
        newMap.set(cellId, now)
        const linkedCells = getIntraTriangleLinks(cellIndex)
        linkedCells.forEach(linkedIdx => {
          newMap.set(`${triangleId}-${linkedIdx}`, now)
        })

        // Reverse linking: if clicking a right cell, add linked left triangle cells
        if (triangleId !== 'left') {
          const affectingLeftCells = getLeftCellsAffectingRightCell(triangleId)
          affectingLeftCells.forEach(leftIndex => {
            if (isTriangleCell(leftIndex)) {
              newMap.set(`left-${leftIndex}`, now)
            }
          })
        }

        return newMap
      }

      // RESTRICTION 2: At most 2 triangle cells per triangle
      if (isClickedTriangle) {
        const selectedTriangles = getSelectedTriangleCells(triangleId, newMap)

        // For left triangle, protect cells selected via reverse linking
        let trianglesToConsider = selectedTriangles
        if (triangleId === 'left') {
          const protectedCells = getProtectedLeftCells(newMap)
          // Filter out protected cells - they don't count toward the "at most 2" limit
          trianglesToConsider = selectedTriangles.filter(t => !protectedCells.has(t.cellId))
        }

        // If already have 2 non-protected triangle cells, remove the oldest one
        if (trianglesToConsider.length >= 2) {
          const oldestTriangle = trianglesToConsider[0]
          newMap.delete(oldestTriangle.cellId)

          // Check if we need to remove the previously linked diamond
          const remainingTriangles = getSelectedTriangleCells(triangleId, newMap)
          if (remainingTriangles.length < 2) {
            const diamondIndices = [1, 3, 4]
            diamondIndices.forEach(diamondIdx => {
              newMap.delete(`${triangleId}-${diamondIdx}`)
            })
          }
        }

        // Add the new triangle cell
        newMap.set(cellId, now)

        // Reverse linking: if clicking a right cell, add linked left triangle cells
        if (triangleId !== 'left') {
          const affectingLeftCells = getLeftCellsAffectingRightCell(triangleId)
          affectingLeftCells.forEach(leftIndex => {
            if (isTriangleCell(leftIndex)) {
              newMap.set(`left-${leftIndex}`, now)
            }
          })
        }

        // Check if we now have exactly 2 triangle cells → auto-select linked diamond
        const updatedTriangles = getSelectedTriangleCells(triangleId, newMap)
        if (updatedTriangles.length === 2) {
          const cellIndices = updatedTriangles.map(t => parseInt(t.cellId.split('-').pop() || '-1'))
          const linkedDiamond = getLinkedDiamond(cellIndices[0], cellIndices[1])

          if (linkedDiamond !== null) {
            // First clear all other diamonds (only one diamond at a time restriction)
            const allTriangles = ['left', 'top-right', 'middle-right', 'bottom-right']
            const diamondIndices = [1, 3, 4]

            allTriangles.forEach(triangle => {
              diamondIndices.forEach(idx => {
                const diamondId = `${triangle}-${idx}`
                if (newMap.has(diamondId)) {
                  newMap.delete(diamondId)

                  // Remove the diamond's linked triangle cells (only if not in current triangle)
                  if (triangle !== triangleId) {
                    const linkedCells = getIntraTriangleLinks(idx)
                    linkedCells.forEach(linkedIdx => {
                      newMap.delete(`${triangle}-${linkedIdx}`)
                    })

                    // If this is a right triangle diamond, also clear reverse-linked left triangle cells
                    // BUT: if we're currently selecting a left diamond, don't remove left cells (they're being used)
                    if (triangle !== 'left' && triangleId !== 'left') {
                      const affectingLeftCells = getLeftCellsAffectingRightCell(triangle)
                      affectingLeftCells.forEach(leftIndex => {
                        if (isTriangleCell(leftIndex)) {
                          newMap.delete(`left-${leftIndex}`)
                        }
                      })
                    }
                  }
                }
              })
            })

            // Add the linked diamond
            newMap.set(`${triangleId}-${linkedDiamond}`, now)
          }
        }

        return newMap
      }

      return newMap
    })
  }

  // Get visual properties for a cell based on state
  const getCellVisuals = (cellId: string) => {
    const isSelected = selectedCells.has(cellId)
    const isHighlighted = isCellHighlighted(cellId)
    const isDirectHover = hoveredCell === cellId
    const isLeftCell = cellId.startsWith('left-')

    // Left cells: use absolute opacity logic
    if (isLeftCell) {
      const leftIndex = parseInt(cellId.split('-')[1])

      if (isSelected) {
        return { fillOpacity: 1.0, strokeWidth: 4 }
      } else if (isHighlighted) {
        return { fillOpacity: isDirectHover ? 0.3 : 0.2, strokeWidth: 4 }
      } else if (isLeftCellAffectedByRightInteraction(leftIndex)) {
        // Reverse linking: right cell interaction affects this left cell
        return { fillOpacity: 0.2, strokeWidth: 4 }
      } else {
        return { fillOpacity: 0, strokeWidth: 4 }
      }
    }

    // Right cells: use hybrid logic (absolute when selected, additive otherwise)
    // If directly selected (clicked on this right cell) → absolute 1.0
    if (isSelected) {
      return { fillOpacity: 1.0, strokeWidth: 4 }
    }

    // Otherwise, use additive logic
    let opacity = 0

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

    return { fillOpacity: Math.min(1.0, opacity), strokeWidth: 4 }
  }

  // Destructure layout for use in rendering
  const { leftTriangle, topRightTriangle, middleRightTriangle, bottomRightTriangle } = layout

  // Fixed label positions (absolute coordinates for viewBox 800x350)
  const iconSize = 70
  const iconTextGap = 5
  const labelY = 35

  // Left: align to left edge (icon first, then text)
  const leftIconX = 5
  const leftTextX = leftIconX + iconSize + iconTextGap

  // Right: align to right edge (icon first, then text)
  const estimatedTextWidth = 120
  const rightGroupEnd = 795
  const rightIconX = rightGroupEnd - estimatedTextWidth - iconTextGap - iconSize
  const rightTextX = rightIconX + iconSize + iconTextGap

  // Helper function to calculate center of polygon from points string
  const getPolygonCenter = (points: string): { x: number; y: number } => {
    const coords = points.split(' ').map(pair => {
      const [x, y] = pair.split(',').map(Number)
      return { x, y }
    })
    const sumX = coords.reduce((sum, p) => sum + p.x, 0)
    const sumY = coords.reduce((sum, p) => sum + p.y, 0)
    return { x: sumX / coords.length, y: sumY / coords.length }
  }

  // Helper function to get label position and rotation for a triangle cell
  const getLabelConfig = (cellId: string, cellIndex: number, center: { x: number; y: number }) => {
    const triangleIndices = [0, 2, 5]
    if (!triangleIndices.includes(cellIndex)) return null

    const offset = 35 // Distance from triangle

    // Left triangle (pointing right) - labels on the left
    if (cellId.startsWith('left-')) {
      return {
        x: center.x - offset / 2,
        y: center.y,
        rotation: 0,
        textAnchor: 'end' as const
      }
    }

    // Top right triangle (pointing down) - labels on top, rotated -45°
    if (cellId.startsWith('top-right-')) {
      return {
        x: center.x,
        y: center.y - offset,
        rotation: -45,
        textAnchor: 'middle' as const
      }
    }

    // Middle right triangle (pointing left) - labels on the right
    if (cellId.startsWith('middle-right-')) {
      return {
        x: center.x + offset / 2,
        y: center.y,
        rotation: 0,
        textAnchor: 'start' as const
      }
    }

    // Bottom right triangle (pointing up) - labels on bottom, rotated +45°
    if (cellId.startsWith('bottom-right-')) {
      return {
        x: center.x,
        y: center.y + offset,
        rotation: 45,
        textAnchor: 'middle' as const
      }
    }

    return null
  }

  // Helper to split long text into multiple lines
  const splitTextIntoLines = (text: string, maxLength: number = 8): string[] => {
    if (text.length <= maxLength) return [text]

    // Try to split at hyphen or space
    const words = text.split(/[\s-]/)
    if (words.length > 1 && words[0].length <= maxLength) {
      return [words[0], words.slice(1).join(' ')]
    }

    // Otherwise split at maxLength
    return [text.slice(0, maxLength), text.slice(maxLength)]
  }

  return (
    <div className={`llm-comparison-selection ${className}`}>
      <svg
        className="llm-comparison-selection__svg"
        viewBox="0 0 800 350"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gradient Definition for Horizontal Legend */}
        <defs>
          <linearGradient id="consistencyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            {getGradientStops().map(stop => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>

        {/* Left Label with Icon - LLM Explainer */}
        <g className="llm-comparison-selection__label-group">
          <svg
            x={leftIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-selection__icon"
            dangerouslySetInnerHTML={{ __html: LLM_EXPLAINER_ICON_SVG }}
          />
          <text
            x={leftTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-selection__label"
            fill="#333"
            fontSize="18"
            fontWeight="600"
          >
            LLM Explainer
          </text>
        </g>

        {/* Right Label with Icon - LLM Scorer */}
        <g className="llm-comparison-selection__label-group">
          <svg
            x={rightIconX}
            y={labelY - iconSize / 2}
            width={iconSize}
            height={iconSize}
            viewBox="0 0 100 100"
            className="llm-comparison-selection__icon"
            dangerouslySetInnerHTML={{ __html: LLM_SCORER_ICON_SVG }}
          />
          <text
            x={rightTextX}
            y={labelY}
            textAnchor="start"
            dominantBaseline="middle"
            className="llm-comparison-selection__label"
            fill="#333"
            fontSize="18"
            fontWeight="600"
          >
            LLM Scorer
          </text>
        </g>

        {/* Left triangle cells - LLM Explainer */}
        {leftTriangle.cells.map((cell, i) => {
          const cellId = `left-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId)
          const isDiamond = cell.type === 'diamond'
          const fillColor = isDiamond
            ? getConsistencyColorForCell(cellId) || COMPONENT_COLORS.EXPLAINER
            : COMPONENT_COLORS.EXPLAINER

          return (
            <g key={cellId}>
              <polygon
                points={cell.points}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={isDiamond ? fillColor : COMPONENT_COLORS.EXPLAINER}
                strokeWidth={strokeWidth}
                className="llm-comparison-selection__cell"
                onMouseEnter={() => setHoveredCell(cellId)}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={() => handleCellClick(cellId, i)}
              />
              {cell.type === 'triangle' && (() => {
                const modelName = getModelName(cellId, i)
                if (!modelName) return null
                const center = getPolygonCenter(cell.points)
                const labelConfig = getLabelConfig(cellId, i, center)
                if (!labelConfig) return null

                const lines = splitTextIntoLines(modelName)
                const lineHeight = 16

                return (
                  <text
                    x={labelConfig.x}
                    y={labelConfig.y}
                    textAnchor={labelConfig.textAnchor}
                    dominantBaseline="middle"
                    fontSize="16"
                    fontWeight="600"
                    fill="#333"
                    pointerEvents="none"
                    transform={labelConfig.rotation !== 0 ? `rotate(${labelConfig.rotation} ${labelConfig.x} ${labelConfig.y})` : undefined}
                  >
                    {lines.map((line, idx) => (
                      <tspan
                        key={idx}
                        x={labelConfig.x}
                        dy={idx === 0 ? -(lines.length - 1) * lineHeight / 2 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                )
              })()}
            </g>
          )
        })}

        {/* Top right triangle cells - LLM Scorer */}
        {topRightTriangle.cells.map((cell, i) => {
          const cellId = `top-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId)
          const isDiamond = cell.type === 'diamond'
          const fillColor = isDiamond
            ? getConsistencyColorForCell(cellId) || COMPONENT_COLORS.SCORER
            : COMPONENT_COLORS.SCORER

          return (
            <g key={cellId}>
              <polygon
                points={cell.points}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={isDiamond ? fillColor : COMPONENT_COLORS.SCORER}
                strokeWidth={strokeWidth}
                className="llm-comparison-selection__cell"
                onMouseEnter={() => setHoveredCell(cellId)}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={() => handleCellClick(cellId, i)}
              />
              {cell.type === 'triangle' && (() => {
                const modelName = getModelName(cellId, i)
                if (!modelName) return null
                const center = getPolygonCenter(cell.points)
                const labelConfig = getLabelConfig(cellId, i, center)
                if (!labelConfig) return null

                const lines = splitTextIntoLines(modelName)
                const lineHeight = 16

                return (
                  <text
                    x={labelConfig.x}
                    y={labelConfig.y}
                    textAnchor={labelConfig.textAnchor}
                    dominantBaseline="middle"
                    fontSize="16"
                    fontWeight="600"
                    fill="#333"
                    pointerEvents="none"
                    transform={labelConfig.rotation !== 0 ? `rotate(${labelConfig.rotation} ${labelConfig.x} ${labelConfig.y})` : undefined}
                  >
                    {lines.map((line, idx) => (
                      <tspan
                        key={idx}
                        x={labelConfig.x}
                        dy={idx === 0 ? -(lines.length - 1) * lineHeight / 2 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                )
              })()}
            </g>
          )
        })}

        {/* Middle right triangle cells - LLM Scorer */}
        {middleRightTriangle.cells.map((cell, i) => {
          const cellId = `middle-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId)
          const isDiamond = cell.type === 'diamond'
          const fillColor = isDiamond
            ? getConsistencyColorForCell(cellId) || COMPONENT_COLORS.SCORER
            : COMPONENT_COLORS.SCORER

          return (
            <g key={cellId}>
              <polygon
                points={cell.points}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={isDiamond ? fillColor : COMPONENT_COLORS.SCORER}
                strokeWidth={strokeWidth}
                className="llm-comparison-selection__cell"
                onMouseEnter={() => setHoveredCell(cellId)}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={() => handleCellClick(cellId, i)}
              />
              {cell.type === 'triangle' && (() => {
                const modelName = getModelName(cellId, i)
                if (!modelName) return null
                const center = getPolygonCenter(cell.points)
                const labelConfig = getLabelConfig(cellId, i, center)
                if (!labelConfig) return null

                const lines = splitTextIntoLines(modelName)
                const lineHeight = 16

                return (
                  <text
                    x={labelConfig.x}
                    y={labelConfig.y}
                    textAnchor={labelConfig.textAnchor}
                    dominantBaseline="middle"
                    fontSize="16"
                    fontWeight="600"
                    fill="#333"
                    pointerEvents="none"
                    transform={labelConfig.rotation !== 0 ? `rotate(${labelConfig.rotation} ${labelConfig.x} ${labelConfig.y})` : undefined}
                  >
                    {lines.map((line, idx) => (
                      <tspan
                        key={idx}
                        x={labelConfig.x}
                        dy={idx === 0 ? -(lines.length - 1) * lineHeight / 2 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                )
              })()}
            </g>
          )
        })}

        {/* Bottom right triangle cells - LLM Scorer */}
        {bottomRightTriangle.cells.map((cell, i) => {
          const cellId = `bottom-right-${i}`
          const { fillOpacity, strokeWidth } = getCellVisuals(cellId)
          const isDiamond = cell.type === 'diamond'
          const fillColor = isDiamond
            ? getConsistencyColorForCell(cellId) || COMPONENT_COLORS.SCORER
            : COMPONENT_COLORS.SCORER

          return (
            <g key={cellId}>
              <polygon
                points={cell.points}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={isDiamond ? fillColor : COMPONENT_COLORS.SCORER}
                strokeWidth={strokeWidth}
                className="llm-comparison-selection__cell"
                onMouseEnter={() => setHoveredCell(cellId)}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={() => handleCellClick(cellId, i)}
              />
              {cell.type === 'triangle' && (() => {
                const modelName = getModelName(cellId, i)
                if (!modelName) return null
                const center = getPolygonCenter(cell.points)
                const labelConfig = getLabelConfig(cellId, i, center)
                if (!labelConfig) return null

                const lines = splitTextIntoLines(modelName)
                const lineHeight = 16

                return (
                  <text
                    x={labelConfig.x}
                    y={labelConfig.y}
                    textAnchor={labelConfig.textAnchor}
                    dominantBaseline="middle"
                    fontSize="16"
                    fontWeight="600"
                    fill="#333"
                    pointerEvents="none"
                    transform={labelConfig.rotation !== 0 ? `rotate(${labelConfig.rotation} ${labelConfig.x} ${labelConfig.y})` : undefined}
                  >
                    {lines.map((line, idx) => (
                      <tspan
                        key={idx}
                        x={labelConfig.x}
                        dy={idx === 0 ? -(lines.length - 1) * lineHeight / 2 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                )
              })()}
            </g>
          )
        })}

        {/* Horizontal Gradient Legend below Left Triangle */}
        <g className="llm-comparison-selection__legend">
          <text
            x="140"
            y="310"
            fontSize="14"
            fontWeight="600"
            fill="#333"
            textAnchor="middle"
          >
            Consistency Score
          </text>
          <text
            x="140"
            y="325"
            fontSize="12"
            fill="#666"
            textAnchor="middle"
            fontStyle="italic"
          >
            (High-consistency range)
          </text>
          <rect
            x="25"
            y="330"
            width="230"
            height="8"
            fill="url(#consistencyGradient)"
            stroke="#999"
            strokeWidth="1"
          />
          <text x="25" y="348" fontSize="11" fill="#000000ff" textAnchor="start">
            {CONSISTENCY_SCALE.MIN.toFixed(2)}
          </text>
          <text x="255" y="348" fontSize="11" fill="#000000ff" textAnchor="end">
            {CONSISTENCY_SCALE.MAX.toFixed(2)}
          </text>
        </g>
      </svg>
    </div>
  )
}

export default LLMComparisonSelection
