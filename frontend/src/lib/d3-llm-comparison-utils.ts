import { scaleLinear } from 'd3-scale'

// ============================================================================
// CONSTANTS - Fixed ViewBox Dimensions
// ============================================================================

// Fixed viewBox dimensions - triangles never resize or reposition
const VIEWBOX_WIDTH = 800
const VIEWBOX_HEIGHT = 350

// Legacy export for backward compatibility with components
export const DEFAULT_LLM_COMPARISON_DIMENSIONS = {
  width: VIEWBOX_WIDTH,
  height: VIEWBOX_HEIGHT,
  margin: { top: 10, right: 5, bottom: 5, left: 5 },
  triangleGap: 10
} as const

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
 * Uses fixed absolute positioning - triangles never resize or move
 * (viewBox: 0 0 800 350)
 */
export function calculateLLMComparisonLayout(): LLMComparisonLayout {
  // Fixed triangle sizes (absolute pixels)
  const leftTriangleSize = 80
  const rightTriangleSize = 75
  const cellGap = 6

  // Fixed absolute positions based on viewBox 800x350
  // Left triangle: vertex at center-left, vertically centered
  const leftTriangle = {
    cells: calculateTriangleCells(
      320,  // vx - horizontal center
      180,  // vy - slightly below vertical center
      leftTriangleSize,
      'right',
      cellGap
    )
  }

  // Top right triangle: vertex pointing down, upper right
  const topRightTriangle = {
    cells: calculateTriangleCells(
      480,  // vx - slightly right of center
      190,  // vy - lower than left triangle
      rightTriangleSize,
      'down',
      cellGap
    )
  }

  // Middle right triangle: vertex pointing left, same position as left triangle
  const middleRightTriangle = {
    cells: calculateTriangleCells(
      470,  // vx - same as left triangle
      180,  // vy - same as left triangle
      rightTriangleSize,
      'left',
      cellGap
    )
  }

  // Bottom right triangle: vertex pointing up, lower right
  const bottomRightTriangle = {
    cells: calculateTriangleCells(
      480,  // vx - same as top right
      170,  // vy - higher than left triangle
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
    innerWidth: VIEWBOX_WIDTH,  // Legacy compatibility
    innerHeight: VIEWBOX_HEIGHT  // Legacy compatibility
  }
}

// ============================================================================
// CONSISTENCY COLOR UTILITIES
// ============================================================================

/**
 * Color scale constants for consistency visualization
 * Domain adjusted to 0.85-1.0 to better show high-consistency variations
 */
export const CONSISTENCY_SCALE = {
  MIN: 0.75,
  MID: 0.875,
  MAX: 1.0
} as const

/**
 * Get color for consistency score using focused high-consistency range
 * Domain: 0.85 (red/lower consistency) → 0.925 (yellow) → 1.0 (green/high consistency)
 * Values outside this range are clamped to show relative consistency
 */
export function getConsistencyColor(value: number): string {
  const colorScale = scaleLinear<string>()
    .domain([CONSISTENCY_SCALE.MIN, CONSISTENCY_SCALE.MID, CONSISTENCY_SCALE.MAX])
    .range(['#d73027', '#fee08b', '#1a9850'])
    .clamp(true)

  return colorScale(value)
}

/**
 * Get gradient stops for legend (maps 0%-100% to the focused consistency range)
 */
export function getGradientStops(): Array<{ offset: string; color: string }> {
  return [
    { offset: '0%', color: '#d73027' },    // red (0.85)
    { offset: '50%', color: '#fee08b' },   // yellow (0.925)
    { offset: '100%', color: '#1a9850' }   // green (1.0)
  ]
}
