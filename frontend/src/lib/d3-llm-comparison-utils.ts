// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_LLM_COMPARISON_DIMENSIONS = {
  width: 800,
  height: 350,
  margin: { top: 10, right: 5, bottom: 5, left: 5 },
  triangleGap: 10  // Gap between right triangles
} as const

// ============================================================================
// TYPES
// ============================================================================

export interface Dimensions {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  triangleGap: number
}

export interface Cell {
  points: string
  row: number
  col: number
  type: 'diamond' | 'triangle'
}

export interface TriangleCells {
  cells: Cell[]
}

export interface LLMComparisonLayout {
  leftTriangle: TriangleCells
  topRightTriangle: TriangleCells
  middleRightTriangle: TriangleCells
  bottomRightTriangle: TriangleCells
  innerWidth: number
  innerHeight: number
}

// ============================================================================
// CALCULATION FUNCTIONS - Cell Point Helpers
// ============================================================================

/**
 * Calculate diamond (45° rotated square) cell polygon points
 * Diamond is a square rotated 45°. For a square with side length S,
 * the diagonal length is S√2.
 *
 * @param cx - center x
 * @param cy - center y
 * @param size - side length of the diamond (NOT diagonal)
 * @returns SVG polygon points string
 */
function calculateDiamondCellPoints(cx: number, cy: number, size: number): string {
  // For side length = size, diagonal = size * √2
  // Half diagonal = size / √2
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
  // For an isosceles right triangle with leg length = size,
  // the legs extend at 45° angles from the vertex
  // Offset along each axis = size / √2
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
// CALCULATION FUNCTIONS - Matrix Cell Builder
// ============================================================================

/**
 * Divide triangle into 6 matrix cells (3 diamonds + 3 edge triangles)
 * Each triangle is divided into a 3x3 lower triangular matrix pattern:
 *   Row 0: [T]        (1 triangle at vertex)
 *   Row 1: [D][T]     (1 diamond + 1 triangle)
 *   Row 2: [D][D][T]  (2 diamonds + 1 triangle)
 *
 * @param vx - vertex x coordinate (90° angle vertex)
 * @param vy - vertex y coordinate (90° angle vertex)
 * @param size - triangle leg length
 * @param orientation - direction the 90° vertex points ('left', 'right', 'down', 'up')
 * @param gap - gap between cells in pixels (default: 2)
 * @returns Array of 6 cells with calculated polygon points
 */
function calculateTriangleCells(
  vx: number,
  vy: number,
  size: number,
  orientation: 'left' | 'right' | 'down' | 'up',
  gap: number = 2
): Cell[] {
  const cells: Cell[] = []
  const cellSize = size / 2

  // Cell dimension: each cell has edge length = cellSize
  // Cell span (width or height of diamond/triangle) = cellSize / √2
  const cellSpan = cellSize / Math.sqrt(2)
  const row1X = vx + cellSpan + gap
  const row2X = vx + 2 * cellSpan + 2 * gap
  const diagmonVerticalOffset = cellSpan + gap
  const triangleVerticalOffset = cellSpan * 2 + gap * 2
  
  if (orientation === 'left') {
    // Left-pointing triangle: vertex at left, extends to the right
    // Row 0: triangle at vertex
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy - triangleVerticalOffset, cellSize, 'left'),
      row: 0,
      col: 0,
      type: 'triangle'
    })

    // Row 1: diamond + triangle (horizontally adjacent)
    cells.push({
      points: calculateDiamondCellPoints(row1X + cellSpan / 2, vy, cellSize),
      row: 1,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy, cellSize, 'left'),
      row: 1,
      col: 1,
      type: 'triangle'
    })

    // Row 2: two diamonds (vertically stacked) + triangle
    cells.push({
      points: calculateDiamondCellPoints(row2X + cellSpan / 2, vy - diagmonVerticalOffset, cellSize),
      row: 2,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateDiamondCellPoints(row2X + cellSpan / 2, vy + diagmonVerticalOffset, cellSize),
      row: 2,
      col: 1,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X + cellSpan * 1.5 + gap * 2, vy + triangleVerticalOffset, cellSize, 'left'),
      row: 2,
      col: 2,
      type: 'triangle'
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
      row: 0,
      col: 0,
      type: 'triangle'
    })

    // Row 1: diamond + triangle (horizontally adjacent)
    cells.push({
      points: calculateDiamondCellPoints(row1X - cellSpan / 2, vy, cellSize),
      row: 1,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X - cellSpan * 1.5 - gap * 2, vy, cellSize, 'right'),
      row: 1,
      col: 1,
      type: 'triangle'
    })

    // Row 2: two diamonds (vertically stacked) + triangle
    cells.push({
      points: calculateDiamondCellPoints(row2X - cellSpan / 2, vy - diamondVerticalOffset, cellSize),
      row: 2,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateDiamondCellPoints(row2X - cellSpan / 2, vy + diamondVerticalOffset, cellSize),
      row: 2,
      col: 1,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(row1X - cellSpan * 1.5 - gap * 2, vy + triangleVerticalOffset, cellSize, 'right'),
      row: 2,
      col: 2,
      type: 'triangle'
    })
  } else if (orientation === 'down') {
    // Down-pointing triangle: vertex at bottom, extends upward
    const row1Y = vy - cellSpan - gap
    const row2Y = vy - 2 * cellSpan - 2 * gap
    const diamondHorizontalOffset = cellSpan + gap
    const triangleHorizontalOffset = cellSpan * 2 + gap * 2
    const triangleY = row1Y - cellSpan * 1.5 - gap * 2

    // Row 0: triangle at vertex
    cells.push({
      points: calculateTriangleCellPoints(vx - triangleHorizontalOffset, triangleY, cellSize, 'down'),
      row: 0,
      col: 0,
      type: 'triangle'
    })

    // Row 1: diamond + triangle (vertically adjacent)
    cells.push({
      points: calculateDiamondCellPoints(vx, row1Y - cellSpan / 2, cellSize),
      row: 1,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(vx, triangleY, cellSize, 'down'),
      row: 1,
      col: 1,
      type: 'triangle'
    })

    // Row 2: two diamonds (horizontally adjacent) + triangle
    cells.push({
      points: calculateDiamondCellPoints(vx - diamondHorizontalOffset, row2Y - cellSpan / 2, cellSize),
      row: 2,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateDiamondCellPoints(vx + diamondHorizontalOffset, row2Y - cellSpan / 2, cellSize),
      row: 2,
      col: 1,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(vx + triangleHorizontalOffset, triangleY, cellSize, 'down'),
      row: 2,
      col: 2,
      type: 'triangle'
    })
  } else {
    // Up-pointing triangle: vertex at top, extends downward
    const row1Y = vy + cellSpan + gap
    const row2Y = vy + 2 * cellSpan + 2 * gap
    const diamondHorizontalOffset = cellSpan + gap
    const triangleHorizontalOffset = cellSpan * 2 + gap * 2
    const triangleY = row1Y + cellSpan * 1.5 + gap * 2

    // Row 0: triangle at vertex
    cells.push({
      points: calculateTriangleCellPoints(vx - triangleHorizontalOffset, triangleY, cellSize, 'up'),
      row: 0,
      col: 0,
      type: 'triangle'
    })

    // Row 1: diamond + triangle (vertically adjacent)
    cells.push({
      points: calculateDiamondCellPoints(vx, row1Y + cellSpan / 2, cellSize),
      row: 1,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(vx, triangleY, cellSize, 'up'),
      row: 1,
      col: 1,
      type: 'triangle'
    })

    // Row 2: two diamonds (horizontally adjacent) + triangle
    cells.push({
      points: calculateDiamondCellPoints(vx - diamondHorizontalOffset, row2Y + cellSpan / 2, cellSize),
      row: 2,
      col: 0,
      type: 'diamond'
    })
    cells.push({
      points: calculateDiamondCellPoints(vx + diamondHorizontalOffset, row2Y + cellSpan / 2, cellSize),
      row: 2,
      col: 1,
      type: 'diamond'
    })
    cells.push({
      points: calculateTriangleCellPoints(vx + triangleHorizontalOffset, triangleY, cellSize, 'up'),
      row: 2,
      col: 2,
      type: 'triangle'
    })
  }

  return cells
}

// ============================================================================
// MAIN LAYOUT CALCULATION
// ============================================================================

/**
 * Calculate complete LLM comparison layout with 4 triangles
 * Uses simple absolute positioning based on viewBox dimensions
 */
export function calculateLLMComparisonLayout(
  dimensions: Dimensions = DEFAULT_LLM_COMPARISON_DIMENSIONS
): LLMComparisonLayout {
  const { width, height, margin } = dimensions
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  // Simple triangle sizes - scale with available space
  const leftTriangleSize = innerHeight * 0.25
  const rightTriangleSize = innerHeight * 0.24

  const cellGap = 5

  // Absolute positions based on viewBox
  // Left triangle: vertex at left edge, vertically centered
  const leftTriangle = {
    cells: calculateTriangleCells(
      margin.left + innerWidth * 0.5,
      margin.top + innerHeight * 0.55,
      leftTriangleSize,
      'right',
      cellGap
    )
  }

  // Top right triangle: vertex pointing down, in upper portion
  const topRightTriangle = {
    cells: calculateTriangleCells(
      margin.left + innerWidth * 0.5 + innerWidth * 0.02,
      margin.top + innerHeight * 0.55 + innerHeight * 0.05,
      rightTriangleSize,
      'down',
      cellGap
    )
  }

  // Middle right triangle: vertex pointing left, vertically centered
  const middleRightTriangle = {
    cells: calculateTriangleCells(
      margin.left + innerWidth * 0.5,
      margin.top + innerHeight * 0.55,
      rightTriangleSize,
      'left',
      cellGap
    )
  }

  // Bottom right triangle: vertex pointing up, in lower portion
  const bottomRightTriangle = {
    cells: calculateTriangleCells(
      margin.left + innerWidth * 0.5 + innerWidth * 0.02,
      margin.top + innerHeight * 0.55 - innerHeight * 0.05,
      rightTriangleSize,
      'up',
      cellGap
    )
  }

  return {
    leftTriangle,
    topRightTriangle,
    middleRightTriangle,
    bottomRightTriangle,
    innerWidth,
    innerHeight
  }
}
