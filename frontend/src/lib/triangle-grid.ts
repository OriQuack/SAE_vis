// ============================================================================
// TRIANGLE GRID - Hierarchical adaptive triangle cells for UMAP selection
// ============================================================================

import type { UmapPoint } from '../types'
import { BARYCENTRIC_TRIANGLE } from './umap-utils'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum hierarchy level (1024 finest cells at level 5, 1/32 edge) */
export const MAX_LEVEL = 5

/** Divisor for dynamic threshold: k = totalFeatures / THRESHOLD_DIVISOR */
export const THRESHOLD_DIVISOR = 50

/** Triangle height constant */
const TRIANGLE_HEIGHT = BARYCENTRIC_TRIANGLE.yMax  // 0.866

// ============================================================================
// TYPES
// ============================================================================

/** Triangle orientation in the grid */
export type TriangleOrientation = 'up' | 'down'

/** 2D point in barycentric coordinate space */
export interface Point2D {
  x: number
  y: number
}

/** A cell in the triangle hierarchy */
export interface TriangleCell {
  key: string                              // Unique identifier: "L-i-j-o"
  level: number                            // 0-4
  gridI: number                            // Row index at this level
  gridJ: number                            // Column index at this level
  orientation: TriangleOrientation         // 'up' or 'down'
  vertices: [Point2D, Point2D, Point2D]    // In barycentric 2D coords
  featureIds: Set<number>                  // Features in this cell
  parentKey: string | null                 // Parent cell key (null for root)
  childKeys: string[]                      // Child cell keys (empty at finest)
}

/** Complete grid state for rendering */
export interface TriangleGridState {
  cells: Map<string, TriangleCell>         // All cells in hierarchy
  leafCells: Set<string>                   // Keys of visible (leaf) cells
  featureToCell: Map<number, string>       // Feature ID → leaf cell key
}

// ============================================================================
// BARYCENTRIC CONVERSION
// ============================================================================

/**
 * Convert 2D position (x, y) to barycentric weights (w1, w2, w3).
 * Triangle vertices: V0=(0,0), V1=(1,0), V2=(0.5, 0.866)
 * w1 = weight for V0 (missedNgram)
 * w2 = weight for V1 (missedContext)
 * w3 = weight for V2 (noisyActivation)
 */
function xyToBarycentric(x: number, y: number): [number, number, number] {
  const w3 = y / TRIANGLE_HEIGHT
  const w2 = x - 0.5 * w3
  const w1 = 1 - w2 - w3
  return [w1, w2, w3]
}

/**
 * Convert barycentric weights to 2D position.
 */
function barycentricToXY(_w1: number, w2: number, w3: number): Point2D {
  // Using the standard barycentric formula:
  // P = w1*V0 + w2*V1 + w3*V2
  // V0 = (0, 0), V1 = (1, 0), V2 = (0.5, 0.866)
  return {
    x: w2 * 1 + w3 * 0.5,  // w1*0 + w2*1 + w3*0.5
    y: w3 * TRIANGLE_HEIGHT  // w1*0 + w2*0 + w3*0.866
  }
}

// ============================================================================
// CELL KEY UTILITIES
// ============================================================================

/**
 * Generate cell key from components.
 */
function makeCellKey(level: number, i: number, j: number, orientation: TriangleOrientation): string {
  return `${level}-${i}-${j}-${orientation === 'up' ? 'u' : 'd'}`
}

// ============================================================================
// CELL VERTEX COMPUTATION
// ============================================================================

/**
 * Compute the three vertices of a cell in 2D coordinates.
 *
 * For level L, the triangle is divided into n = 2^L parts per edge.
 * Each cell is identified by (i, j) where:
 *   - i indexes along the w1 direction (0 to n-1)
 *   - j indexes along the w2 direction (0 to n-i-1 for up, varies for down)
 *
 * Up-pointing triangles have vertices at barycentric coords:
 *   (i/n, j/n, 1-i/n-j/n), (i/n, (j+1)/n, ...), ((i+1)/n, j/n, ...)
 *
 * Down-pointing triangles (inverted) fill the gaps.
 */
function computeCellVertices(
  level: number,
  i: number,
  j: number,
  orientation: TriangleOrientation
): [Point2D, Point2D, Point2D] {
  const n = Math.pow(2, level)
  const step = 1 / n

  if (orientation === 'up') {
    // Up-pointing triangle
    const w1_0 = i * step
    const w2_0 = j * step
    const w3_0 = 1 - w1_0 - w2_0

    const w1_1 = i * step
    const w2_1 = (j + 1) * step
    const w3_1 = 1 - w1_1 - w2_1

    const w1_2 = (i + 1) * step
    const w2_2 = j * step
    const w3_2 = 1 - w1_2 - w2_2

    return [
      barycentricToXY(w1_0, w2_0, w3_0),
      barycentricToXY(w1_1, w2_1, w3_1),
      barycentricToXY(w1_2, w2_2, w3_2)
    ]
  } else {
    // Down-pointing triangle (inverted)
    // Vertices are at the "opposite" corners
    const w1_0 = (i + 1) * step
    const w2_0 = j * step
    const w3_0 = 1 - w1_0 - w2_0

    const w1_1 = i * step
    const w2_1 = (j + 1) * step
    const w3_1 = 1 - w1_1 - w2_1

    const w1_2 = (i + 1) * step
    const w2_2 = (j + 1) * step
    const w3_2 = 1 - w1_2 - w2_2

    return [
      barycentricToXY(w1_0, w2_0, w3_0),
      barycentricToXY(w1_1, w2_1, w3_1),
      barycentricToXY(w1_2, w2_2, w3_2)
    ]
  }
}

// ============================================================================
// POINT TO CELL LOOKUP
// ============================================================================

/**
 * Find which cell a point belongs to at a given level.
 * Uses O(1) barycentric formula.
 */
function pointToCellKey(x: number, y: number, level: number): string {
  const [w1, w2, w3] = xyToBarycentric(x, y)
  const n = Math.pow(2, level)

  // Compute grid indices (clamp to valid range)
  const i = Math.max(0, Math.min(n - 1, Math.floor(w1 * n)))
  const j = Math.max(0, Math.min(n - 1, Math.floor(w2 * n)))

  // Determine orientation based on fractional parts
  // If the sum of fractional parts < 1, it's an up-pointing triangle
  const frac1 = w1 * n - Math.floor(w1 * n)
  const frac2 = w2 * n - Math.floor(w2 * n)
  const frac3 = w3 * n - Math.floor(w3 * n)
  const fracSum = frac1 + frac2 + frac3

  // Due to floating point, use tolerance
  const orientation: TriangleOrientation = fracSum < 1.0001 ? 'up' : 'down'

  return makeCellKey(level, i, j, orientation)
}

// ============================================================================
// HIERARCHY BUILDING
// ============================================================================

/**
 * Get parent cell key for a given cell.
 * Parent is at level-1 and covers 4 children.
 */
function getParentKey(level: number, i: number, j: number, _orientation: TriangleOrientation): string | null {
  if (level === 0) return null

  // Parent indices are floor(i/2), floor(j/2)
  const parentI = Math.floor(i / 2)
  const parentJ = Math.floor(j / 2)

  // Use the center of the parent cell to determine its orientation
  const parentLevel = level - 1
  const pn = Math.pow(2, parentLevel)
  const pw1 = (parentI + 0.5) / pn
  const pw2 = (parentJ + 0.5) / pn
  const pw3 = 1 - pw1 - pw2

  // If parent center is in valid barycentric region
  if (pw1 >= 0 && pw2 >= 0 && pw3 >= 0) {
    // Parent orientation: use 'up' as default for valid parents
    // (In a proper implementation, this would consider the child's position)
    return makeCellKey(parentLevel, parentI, parentJ, 'up')
  }

  return null
}

/**
 * Get child cell keys for a given cell.
 * Each cell at level L has 4 children at level L+1.
 */
function getChildKeys(level: number, i: number, j: number, orientation: TriangleOrientation): string[] {
  if (level >= MAX_LEVEL) return []

  const childLevel = level + 1
  const children: string[] = []

  // Child indices are 2*i, 2*i+1 for rows and 2*j, 2*j+1 for columns
  const baseI = i * 2
  const baseJ = j * 2

  if (orientation === 'up') {
    // Up-pointing parent has:
    // - 3 up-pointing corner children
    // - 1 down-pointing center child
    children.push(makeCellKey(childLevel, baseI, baseJ, 'up'))
    children.push(makeCellKey(childLevel, baseI, baseJ + 1, 'up'))
    children.push(makeCellKey(childLevel, baseI + 1, baseJ, 'up'))
    children.push(makeCellKey(childLevel, baseI, baseJ, 'down'))  // Center inverted
  } else {
    // Down-pointing parent has:
    // - 3 down-pointing corner children
    // - 1 up-pointing center child
    children.push(makeCellKey(childLevel, baseI + 1, baseJ, 'down'))
    children.push(makeCellKey(childLevel, baseI, baseJ + 1, 'down'))
    children.push(makeCellKey(childLevel, baseI + 1, baseJ + 1, 'down'))
    children.push(makeCellKey(childLevel, baseI + 1, baseJ + 1, 'up'))  // Center upright
  }

  return children
}

/**
 * Build the complete triangle hierarchy (all levels).
 * Returns a Map of all cells keyed by their unique key.
 */
function buildHierarchy(): Map<string, TriangleCell> {
  const cells = new Map<string, TriangleCell>()

  // Build each level from 0 to MAX_LEVEL
  for (let level = 0; level <= MAX_LEVEL; level++) {
    const n = Math.pow(2, level)

    // Enumerate all valid cells at this level
    // For a triangular grid at level L, valid cells satisfy: i + j < n for up triangles
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        // Up-pointing triangle
        const upKey = makeCellKey(level, i, j, 'up')
        const upVertices = computeCellVertices(level, i, j, 'up')
        const upParent = level > 0 ? getParentKey(level, i, j, 'up') : null
        const upChildren = level < MAX_LEVEL ? getChildKeys(level, i, j, 'up') : []

        cells.set(upKey, {
          key: upKey,
          level,
          gridI: i,
          gridJ: j,
          orientation: 'up',
          vertices: upVertices,
          featureIds: new Set(),
          parentKey: upParent,
          childKeys: upChildren
        })

        // Down-pointing triangle (only if there's space)
        // Down triangles exist when i + j + 1 < n
        if (i + j + 1 < n) {
          const downKey = makeCellKey(level, i, j, 'down')
          const downVertices = computeCellVertices(level, i, j, 'down')
          const downParent = level > 0 ? getParentKey(level, i, j, 'down') : null
          const downChildren = level < MAX_LEVEL ? getChildKeys(level, i, j, 'down') : []

          cells.set(downKey, {
            key: downKey,
            level,
            gridI: i,
            gridJ: j,
            orientation: 'down',
            vertices: downVertices,
            featureIds: new Set(),
            parentKey: downParent,
            childKeys: downChildren
          })
        }
      }
    }
  }

  return cells
}

// Singleton hierarchy (computed once)
let cachedHierarchy: Map<string, TriangleCell> | null = null

function getHierarchy(): Map<string, TriangleCell> {
  if (!cachedHierarchy) {
    cachedHierarchy = buildHierarchy()
  }
  // Return a fresh copy with cleared featureIds
  const fresh = new Map<string, TriangleCell>()
  for (const [key, cell] of cachedHierarchy) {
    fresh.set(key, {
      ...cell,
      featureIds: new Set()
    })
  }
  return fresh
}

// ============================================================================
// GRID STATE COMPUTATION
// ============================================================================

/**
 * Compute the complete grid state for a set of points.
 *
 * @param points - UMAP points (after spread transformation)
 * @param mergeThreshold - Minimum features to prevent merge (k)
 * @returns Complete grid state for rendering
 */
export function computeTriangleGrid(
  points: UmapPoint[],
  mergeThreshold: number
): TriangleGridState {
  const cells = getHierarchy()
  const featureToCell = new Map<number, string>()

  // Step 1: Assign each point to its finest-level cell
  for (const point of points) {
    const cellKey = pointToCellKey(point.x, point.y, MAX_LEVEL)
    const cell = cells.get(cellKey)
    if (cell) {
      cell.featureIds.add(point.feature_id)
    }
  }

  // Step 2: Propagate feature counts up the hierarchy
  // For each cell, sum up its children's features
  for (let level = MAX_LEVEL - 1; level >= 0; level--) {
    for (const [, cell] of cells) {
      if (cell.level !== level) continue

      // Sum features from all children
      for (const childKey of cell.childKeys) {
        const child = cells.get(childKey)
        if (child) {
          for (const fid of child.featureIds) {
            cell.featureIds.add(fid)
          }
        }
      }
    }
  }

  // Step 3: Bottom-up merge to determine leaf cells
  // A cell is a leaf if:
  // - It's at MAX_LEVEL, OR
  // - All its children combined have >= mergeThreshold features (don't merge), OR
  // - It has < mergeThreshold features and no children (edge case)

  const leafCells = new Set<string>()
  const mergedCells = new Set<string>()  // Cells merged into parent

  // Process from finest to coarsest
  for (let level = MAX_LEVEL; level >= 0; level--) {
    for (const [key, cell] of cells) {
      if (cell.level !== level) continue
      if (mergedCells.has(key)) continue  // Already merged

      if (level === MAX_LEVEL) {
        // Finest level: check if should be merged with siblings
        // (handled by parent at level-1)
        // For now, mark as potential leaf
        leafCells.add(key)
      } else {
        // Check children
        const childFeatureCount = cell.featureIds.size
        const allChildrenMerged = cell.childKeys.every(ck => mergedCells.has(ck))
        const hasUnmergedChildren = cell.childKeys.some(ck => leafCells.has(ck) && !mergedCells.has(ck))

        if (childFeatureCount < mergeThreshold || allChildrenMerged) {
          // Merge all children into this cell
          for (const childKey of cell.childKeys) {
            mergedCells.add(childKey)
            leafCells.delete(childKey)
          }
          leafCells.add(key)
        } else if (hasUnmergedChildren) {
          // Keep children as leaves, this cell is not a leaf
          // (children stay in leafCells)
        }
      }
    }
  }

  // Step 4: Build featureToCell map (feature → its leaf cell)
  for (const leafKey of leafCells) {
    const cell = cells.get(leafKey)
    if (cell) {
      for (const fid of cell.featureIds) {
        featureToCell.set(fid, leafKey)
      }
    }
  }

  return {
    cells,
    leafCells,
    featureToCell
  }
}

// ============================================================================
// UTILITY FUNCTIONS FOR RENDERING
// ============================================================================

/**
 * Convert cell vertices to SVG polygon points string.
 */
export function cellToSvgPoints(
  cell: TriangleCell,
  xScale: (x: number) => number,
  yScale: (y: number) => number
): string {
  return cell.vertices
    .map(v => `${xScale(v.x)},${yScale(v.y)}`)
    .join(' ')
}

