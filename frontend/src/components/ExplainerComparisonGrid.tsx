import React, { useMemo } from 'react'
import '../styles/ExplainerComparisonGrid.css'

interface ExplainerComparisonGridProps {
  /** Size of the container (width/height should be equal for square aspect) */
  size: number
  /** Gap between cells */
  cellGap?: number
  /** Explainer IDs for comparison */
  explainerIds?: string[]
  /** Optional click handler for pair cells */
  onPairClick?: (explainer1: string, explainer2: string) => void
}

// Calculate diamond (rotated square) cell points
function calculateDiamondCellPoints(
  row: number,
  col: number,
  cellSize: number,
  gap: number,
  startX: number,
  startY: number
): string {
  // After 45° rotation, diamond vertices: Top, Right, Bottom, Left
  const halfCell = cellSize / 2
  const effectiveSize = cellSize + gap

  // Each cell offset based on row/col with diagonal layout
  const cx = startX + (col - row / 2) * effectiveSize + halfCell
  const cy = startY + row * effectiveSize * 0.866 + halfCell  // 0.866 ≈ sqrt(3)/2

  return `${cx},${cy - halfCell} ${cx + halfCell},${cy} ${cx},${cy + halfCell} ${cx - halfCell},${cy}`
}

// Calculate left triangle cell points (for diagonal positions)
function calculateTriangleCellPoints(
  row: number,
  col: number,
  cellSize: number,
  gap: number,
  startX: number,
  startY: number
): string {
  // Triangle on the right edge of each row (left-pointing after rotation)
  const halfCell = cellSize / 2
  const effectiveSize = cellSize + gap

  const cx = startX + (col - row / 2) * effectiveSize + halfCell
  const cy = startY + row * effectiveSize * 0.866 + halfCell

  // Left-pointing triangle
  return `${cx + halfCell},${cy - halfCell} ${cx + halfCell},${cy + halfCell} ${cx - halfCell},${cy}`
}

// Generate all cells for the triangular grid
function calculateTriangleCells(n: number, cellSize: number, gap: number, width: number, height: number) {
  const cells: Array<{
    type: 'diamond' | 'triangle'
    row: number
    col: number
    points: string
    pairIndex?: [number, number]
  }> = []

  // Center the grid
  const totalWidth = n * (cellSize + gap) + (n - 1) * (cellSize + gap) / 2
  const totalHeight = n * (cellSize + gap) * 0.866
  const startX = (width - totalWidth) / 2 + cellSize / 2
  const startY = (height - totalHeight) / 2

  // For lower triangular: row i has (i + 1) cells
  // Last cell in each row is triangle (diagonal), rest are diamonds (off-diagonal)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col <= row; col++) {
      const isTriangle = col === row  // Diagonal position

      const points = isTriangle
        ? calculateTriangleCellPoints(row, col, cellSize, gap, startX, startY)
        : calculateDiamondCellPoints(row, col, cellSize, gap, startX, startY)

      cells.push({
        type: isTriangle ? 'triangle' : 'diamond',
        row,
        col,
        points,
        pairIndex: isTriangle ? undefined : [col, row] // Off-diagonal pair indices
      })
    }
  }

  return cells
}

const ExplainerComparisonGrid: React.FC<ExplainerComparisonGridProps> = ({
  size,
  cellGap = 4,
  explainerIds = [],
  onPairClick
}) => {
  const n = explainerIds.length || 3  // Default to 3 explainers
  const cellSize = (size - (n + 1) * cellGap) / (n * 1.5)  // Approximate sizing

  const cells = useMemo(() => {
    return calculateTriangleCells(n, cellSize, cellGap, size, size)
  }, [n, cellSize, cellGap, size])

  return (
    <svg
      className="explainer-comparison-grid"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {cells.map((cell, idx) => (
        <polygon
          key={idx}
          className={`grid-cell grid-cell--${cell.type}`}
          points={cell.points}
          onClick={() => {
            if (cell.pairIndex && onPairClick && explainerIds.length >= 2) {
              const [i, j] = cell.pairIndex
              onPairClick(explainerIds[i], explainerIds[j])
            }
          }}
        />
      ))}
    </svg>
  )
}

export default React.memo(ExplainerComparisonGrid)
