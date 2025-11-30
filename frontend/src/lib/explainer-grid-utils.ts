// ============================================================================
// EXPLAINER GRID UTILITIES
// Geometry calculations for 3x3 lower triangular grid (rotated 45°)
// Based on reference: /home/dohyun/interface/d3-llm-comparison-utils.ts
// ============================================================================

export interface Cell {
  points: string
  row: number
  col: number
  type: 'diamond' | 'triangle'
  cellIndex: number
}

// ============================================================================
// CELL POINT CALCULATIONS
// ============================================================================

/**
 * Calculate diamond (45° rotated square) cell polygon points
 * For a square with side length S rotated 45°, the distance from center
 * to vertex is S / sqrt(2)
 *
 * @param cx - center x
 * @param cy - center y
 * @param size - side length of the diamond
 * @returns SVG polygon points string
 */
function calculateDiamondCellPoints(cx: number, cy: number, size: number): string {
  const halfDiagonal = size / Math.sqrt(2)
  return `${cx},${cy - halfDiagonal} ${cx + halfDiagonal},${cy} ${cx},${cy + halfDiagonal} ${cx - halfDiagonal},${cy}`
}

/**
 * Calculate triangle cell polygon points for an isosceles right triangle
 * The 90° angle is at the vertex, and the two legs have equal length.
 *
 * @param vx - vertex x coordinate (90° angle vertex)
 * @param vy - vertex y coordinate (90° angle vertex)
 * @param size - leg length of the isosceles right triangle
 * @param orientation - direction the 90° vertex points
 * @returns SVG polygon points string
 */
function calculateTriangleCellPoints(
  vx: number,
  vy: number,
  size: number,
  orientation: 'left' | 'right' | 'down' | 'up'
): string {
  const offset = size / Math.sqrt(2)

  if (orientation === 'left') {
    // Vertex at left, two points to the right at ±45°
    return `${vx},${vy} ${vx + offset},${vy - offset} ${vx + offset},${vy + offset}`
  } else if (orientation === 'right') {
    // Vertex at right, two points to the left at ±45°
    return `${vx},${vy} ${vx - offset},${vy - offset} ${vx - offset},${vy + offset}`
  } else if (orientation === 'down') {
    // Vertex at bottom, two points above at ±45°
    return `${vx},${vy} ${vx - offset},${vy - offset} ${vx + offset},${vy - offset}`
  } else {
    // orientation === 'up'
    // Vertex at top, two points below at ±45°
    return `${vx},${vy} ${vx - offset},${vy + offset} ${vx + offset},${vy + offset}`
  }
}

// ============================================================================
// GRID CELL CALCULATION
// ============================================================================

/**
 * Calculate all 6 cells for a triangular grid (3x3 lower triangular matrix)
 * Layout:
 *   Row 0: [0]         → Triangle at vertex
 *   Row 1: [1] [2]     → Diamond + Triangle
 *   Row 2: [3] [4] [5] → Diamond + Diamond + Triangle
 *
 * @param vx - vertex x coordinate of the overall triangle
 * @param vy - vertex y coordinate of the overall triangle
 * @param size - overall triangle leg length
 * @param orientation - direction the 90° vertex points ('left', 'right', 'down', 'up')
 * @param gap - gap between cells in pixels
 * @returns Array of 6 cells with calculated polygon points
 */
export function calculateExplainerGridCells(
  vx: number,
  vy: number,
  size: number,
  orientation: 'left' | 'right' | 'down' | 'up',
  gap: number = 2
): Cell[] {
  const cells: Cell[] = []
  const cellSize = size / 2
  const cellSpan = cellSize / Math.sqrt(2)

  if (orientation === 'left') {
    // Left-pointing triangle: vertex at left, extends to the right
    const row1X = vx + cellSpan + gap
    const row2X = vx + 2 * cellSpan + 2 * gap
    const diamondVerticalOffset = cellSpan + gap
    const triangleVerticalOffset = cellSpan * 2 + gap * 2

    // Row 0: triangle at vertex (index 0)
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy - triangleVerticalOffset, cellSize, 'left'),
      row: 0, col: 0, type: 'triangle', cellIndex: 0
    })

    // Row 1: diamond (index 1) + triangle (index 2)
    cells.push({
      points: calculateDiamondCellPoints(row1X + cellSpan / 2, vy, cellSize),
      row: 1, col: 0, type: 'diamond', cellIndex: 1
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy, cellSize, 'left'),
      row: 1, col: 1, type: 'triangle', cellIndex: 2
    })

    // Row 2: diamond (index 3) + diamond (index 4) + triangle (index 5)
    cells.push({
      points: calculateDiamondCellPoints(row2X + cellSpan / 2, vy - diamondVerticalOffset, cellSize),
      row: 2, col: 0, type: 'diamond', cellIndex: 3
    })
    cells.push({
      points: calculateDiamondCellPoints(row2X + cellSpan / 2, vy + diamondVerticalOffset, cellSize),
      row: 2, col: 1, type: 'diamond', cellIndex: 4
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy + triangleVerticalOffset, cellSize, 'left'),
      row: 2, col: 2, type: 'triangle', cellIndex: 5
    })
  } else if (orientation === 'right') {
    // Right-pointing triangle: vertex at right, extends to the left
    const row1X = vx - cellSpan - gap
    const row2X = vx - 2 * cellSpan - 2 * gap
    const diamondVerticalOffset = cellSpan + gap
    const triangleVerticalOffset = cellSpan * 2 + gap * 2

    // Row 0: triangle at vertex
    cells.push({
      points: calculateTriangleCellPoints(row1X - cellSpan * 1.5 - gap * 2, vy - triangleVerticalOffset, cellSize, 'right'),
      row: 0, col: 0, type: 'triangle', cellIndex: 0
    })

    // Row 1: diamond + triangle
    cells.push({
      points: calculateDiamondCellPoints(row1X - cellSpan / 2, vy, cellSize),
      row: 1, col: 0, type: 'diamond', cellIndex: 1
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X - cellSpan * 1.5 - gap * 2, vy, cellSize, 'right'),
      row: 1, col: 1, type: 'triangle', cellIndex: 2
    })

    // Row 2: diamonds + triangle
    cells.push({
      points: calculateDiamondCellPoints(row2X - cellSpan / 2, vy - diamondVerticalOffset, cellSize),
      row: 2, col: 0, type: 'diamond', cellIndex: 3
    })
    cells.push({
      points: calculateDiamondCellPoints(row2X - cellSpan / 2, vy + diamondVerticalOffset, cellSize),
      row: 2, col: 1, type: 'diamond', cellIndex: 4
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X - cellSpan * 1.5 - gap * 2, vy + triangleVerticalOffset, cellSize, 'right'),
      row: 2, col: 2, type: 'triangle', cellIndex: 5
    })
  }

  return cells
}

// ============================================================================
// BAR GRAPH POSITION CALCULATIONS
// ============================================================================

export interface BarPosition {
  barX: number
  barY: number
  barMaxWidth: number
  barHeight: number
  centerY: number
}

export interface BarGraphLayout {
  // Shared axis for all bars
  axis: {
    x: number         // X position of Y-axis
    y1: number        // Top of Y-axis (extended)
    y2: number        // Bottom of Y-axis (extended)
    xAxisY: number    // Y position of X-axis (at bottom of bar area)
    xAxisEndX: number // Right end of X-axis
  }
  // Individual bar positions by cell index
  bars: Map<number, BarPosition>
}

/**
 * Parse a polygon points string to extract coordinates
 * @param points - SVG polygon points string (e.g., "10,20 30,10 30,30")
 * @returns Array of {x, y} coordinates
 */
function parsePolygonPoints(points: string): Array<{x: number, y: number}> {
  return points.split(' ').map(p => {
    const [x, y] = p.split(',').map(Number)
    return { x, y }
  })
}

/**
 * Calculate bar graph layout with shared axis for all triangle cells
 *
 * @param cells - Array of cells from calculateExplainerGridCells
 * @param barGap - Gap between triangles and bar axis
 * @param barWidth - Width of each bar (independent of height)
 * @param barHeight - Height of each bar (independent of width)
 * @param axisPadding - Extra length for axis lines beyond bar area
 * @param barAxisGap - Gap between Y-axis line and bar start
 * @returns BarGraphLayout with shared axis and individual bar positions
 */
export function calculateBarGraphLayout(
  cells: Cell[],
  barGap: number = 3,
  barWidth: number = 18,
  barHeight: number = 10,
  axisPadding: number = 4,
): BarGraphLayout {
  const triangleCells = cells.filter(c => c.type === 'triangle')
  const bars = new Map<number, BarPosition>()

  if (triangleCells.length === 0) {
    return {
      axis: {
        x: 0, y1: 0, y2: 0, xAxisEndX: 0,
        xAxisY: 0
      },
      bars
    }
  }

  // Find the rightmost x across all triangles and overall Y range
  let globalMaxX = -Infinity
  let globalMinY = Infinity
  let globalMaxY = -Infinity

  for (const cell of triangleCells) {
    const points = parsePolygonPoints(cell.points)
    const maxX = Math.max(...points.map(p => p.x))
    const minY = Math.min(...points.map(p => p.y))
    const maxY = Math.max(...points.map(p => p.y))

    globalMaxX = Math.max(globalMaxX, maxX)
    globalMinY = Math.min(globalMinY, minY)
    globalMaxY = Math.max(globalMaxY, maxY)
  }

  // Shared axis position
  const axisX = globalMaxX + barGap
  const barStartX = axisX  // Bars start after gap from Y-axis

  // Calculate individual bar positions - bar height and width are independent
  for (const cell of triangleCells) {
    const points = parsePolygonPoints(cell.points)
    const minY = Math.min(...points.map(p => p.y))
    const maxY = Math.max(...points.map(p => p.y))
    const centerY = (minY + maxY) / 2

    bars.set(cell.cellIndex, {
      barX: barStartX,  // Start after gap from Y-axis
      barY: centerY - barHeight / 2,  // Center bar vertically on triangle
      barMaxWidth: barWidth,
      barHeight,
      centerY
    })
  }

  return {
    axis: {
      x: axisX,
      y1: globalMinY - axisPadding,  // Extend above bars
      y2: globalMaxY + axisPadding,  // Extend below bars
      xAxisY: globalMaxY,  // X-axis at bottom of bar area
      xAxisEndX: barStartX + barWidth  // Extend beyond bars
    },
    bars
  }
}

// ============================================================================
// EXPLAINER MAPPINGS
// ============================================================================

// Mapping: cell index to explainer pair (for diamond cells)
export const EXPLAINER_PAIR_MAP: Record<number, [number, number]> = {
  1: [0, 1],  // Diamond 1 = Explainer 0 vs Explainer 1
  3: [0, 2],  // Diamond 3 = Explainer 0 vs Explainer 2
  4: [1, 2],  // Diamond 4 = Explainer 1 vs Explainer 2
}

// Mapping: cell index to single explainer (for triangle cells)
export const EXPLAINER_INDEX_MAP: Record<number, number> = {
  0: 0,  // Triangle 0 = Explainer 0
  2: 1,  // Triangle 2 = Explainer 1
  5: 2,  // Triangle 5 = Explainer 2
}

// ============================================================================
// COLOR UTILITIES (re-exported from color-utils.tsx for convenience)
// ============================================================================

export { getSemanticSimilarityColor, SEMANTIC_SIMILARITY_COLORS } from './color-utils'
