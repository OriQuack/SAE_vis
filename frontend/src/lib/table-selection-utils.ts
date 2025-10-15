/**
 * Table Cell Selection Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for group-level cell selection in the table.
 * Cells are grouped by feature_id (row) and explainer_id (LLM explainer).
 * Selection works at the group level: clicking any cell selects the entire group.
 */

import type { CellGroup } from '../types'
import type { HeaderStructure } from './d3-table-utils'

// ============================================================================
// GROUP KEY GENERATION
// ============================================================================

/**
 * Generate unique group key from feature_id and explainer_id
 *
 * @param featureId - Feature ID (row identifier)
 * @param explainerId - LLM Explainer ID (llama, qwen, openai)
 * @returns Unique group key
 */
export function getCellGroupKey(featureId: number, explainerId: string): string {
  return `${featureId}_${explainerId}`
}

// ============================================================================
// EXPLAINER ID MAPPING
// ============================================================================

/**
 * Get explainer_id for a column index using header structure
 *
 * Maps column index to explainer_id by examining header structure.
 * The header structure contains explainerId for each column.
 *
 * @param colIndex - Column index (0-based, excluding feature_id column)
 * @param headerStructure - Header structure from buildHeaderStructure()
 * @param isAveraged - Whether scores are averaged
 * @returns Explainer ID or null if not found
 */
export function getExplainerForColumnIndex(
  colIndex: number,
  headerStructure: HeaderStructure,
  isAveraged: boolean
): string | null {
  // Use row3 for individual scorer mode (has most specific cell info)
  // Use row2 for averaged mode
  const headerRow = !isAveraged && headerStructure.row3.length > 0
    ? headerStructure.row3
    : headerStructure.row2

  if (colIndex < 0 || colIndex >= headerRow.length) {
    return null
  }

  const headerCell = headerRow[colIndex]
  return headerCell?.explainerId || null
}

// ============================================================================
// GROUP CREATION
// ============================================================================

/**
 * Create a complete cell group for a given feature_id and explainer_id
 *
 * Finds ALL column indices that belong to the specified explainer and creates
 * a group containing all of them. This ensures that when any cell in a group
 * is selected, the entire group is highlighted.
 *
 * @param featureId - Feature ID (row identifier)
 * @param explainerId - LLM Explainer ID
 * @param headerStructure - Header structure from buildHeaderStructure()
 * @param isAveraged - Whether scores are averaged
 * @param existingGroupCount - Number of existing groups (for color index assignment)
 * @returns Complete CellGroup with all column indices for this explainer
 */
export function createCellGroup(
  featureId: number,
  explainerId: string,
  headerStructure: HeaderStructure,
  isAveraged: boolean,
  existingGroupCount: number = 0
): CellGroup {
  // Use row3 for individual scorer mode, row2 for averaged mode
  const headerRow = !isAveraged && headerStructure.row3.length > 0
    ? headerStructure.row3
    : headerStructure.row2

  // Find all column indices that belong to this explainer
  const cellIndices: number[] = []
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const headerCell = headerRow[colIdx]
    if (headerCell?.explainerId === explainerId) {
      cellIndices.push(colIdx)
    }
  }

  // Generate group key and assign color index
  const groupKey = getCellGroupKey(featureId, explainerId)
  const colorIndex = existingGroupCount % 3

  return {
    id: groupKey,
    featureId,
    explainerId,
    cellIndices,
    colorIndex
  }
}

// ============================================================================
// CELL MEMBERSHIP CHECKING
// ============================================================================

/**
 * Check if a cell belongs to any selected group
 *
 * @param _rowIndex - Row index (in sortedFeatures array) - unused but kept for API consistency
 * @param colIndex - Column index (0-based, excluding feature_id column)
 * @param featureId - Feature ID of the row
 * @param groups - Array of selected cell groups
 * @returns Group containing this cell, or null if not in any group
 */
export function getCellGroup(
  _rowIndex: number,
  colIndex: number,
  featureId: number,
  groups: CellGroup[]
): CellGroup | null {
  for (const group of groups) {
    if (group.featureId === featureId && group.cellIndices.includes(colIndex)) {
      return group
    }
  }
  return null
}

/**
 * Find group by feature_id and explainer_id
 *
 * @param featureId - Feature ID
 * @param explainerId - LLM Explainer ID
 * @param groups - Array of selected cell groups
 * @returns Group with matching feature_id and explainer_id, or null if not found
 */
export function findGroupByKey(
  featureId: number,
  explainerId: string,
  groups: CellGroup[]
): CellGroup | null {
  const groupKey = getCellGroupKey(featureId, explainerId)
  return groups.find(g => g.id === groupKey) || null
}

// ============================================================================
// GROUP-LEVEL DRAG SELECTION
// ============================================================================

/**
 * Find all groups that have at least one cell in the drag rectangle
 *
 * When dragging, if ANY cell in a group falls within the rectangle, the ENTIRE
 * group is selected (all cells with that feature_id + explainer_id combination).
 *
 * @param startRow - Starting row index of drag selection
 * @param startCol - Starting column index of drag selection
 * @param endRow - Ending row index of drag selection
 * @param endCol - Ending column index of drag selection
 * @param sortedFeatures - Array of feature rows (sorted)
 * @param headerStructure - Header structure from buildHeaderStructure()
 * @param isAveraged - Whether scores are averaged
 * @returns Array of complete CellGroup objects for all matched groups
 */
export function findGroupsInRectangle(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  sortedFeatures: any[],
  headerStructure: HeaderStructure,
  isAveraged: boolean
): CellGroup[] {
  // Calculate rectangle bounds
  const minRow = Math.min(startRow, endRow)
  const maxRow = Math.max(startRow, endRow)
  const minCol = Math.min(startCol, endCol)
  const maxCol = Math.max(startCol, endCol)

  // Set to track unique groups (feature_id + explainer_id combinations)
  const groupKeys = new Set<string>()

  // Scan rectangle to find which groups have cells in it
  for (let row = minRow; row <= maxRow; row++) {
    if (row < 0 || row >= sortedFeatures.length) continue

    const featureRow = sortedFeatures[row]
    const featureId = featureRow.feature_id

    for (let col = minCol; col <= maxCol; col++) {
      // Get explainer_id for this column
      const explainerId = getExplainerForColumnIndex(col, headerStructure, isAveraged)
      if (!explainerId) continue

      // Add this group to the set
      const groupKey = getCellGroupKey(featureId, explainerId)
      groupKeys.add(groupKey)
    }
  }

  // Now create complete groups for all matched group keys
  const groups: CellGroup[] = []
  let colorIndex = 0

  for (const groupKey of groupKeys) {
    // Parse the group key back to feature_id and explainer_id
    const [featureIdStr, explainerId] = groupKey.split('_')
    const featureId = parseInt(featureIdStr, 10)

    // Create complete group with ALL cells for this explainer
    const group = createCellGroup(
      featureId,
      explainerId,
      headerStructure,
      isAveraged,
      colorIndex
    )

    groups.push(group)
    colorIndex++
  }

  return groups
}

/**
 * Check if a cell is being actively selected (in current drag rectangle)
 *
 * @param rowIndex - Row index
 * @param colIndex - Column index
 * @param startRow - Selection start row
 * @param startCol - Selection start column
 * @param endRow - Selection end row
 * @param endCol - Selection end column
 * @returns True if cell is in active selection rectangle
 */
export function isCellBeingSelected(
  rowIndex: number,
  colIndex: number,
  startRow: number | null,
  startCol: number | null,
  endRow: number | null,
  endCol: number | null
): boolean {
  if (
    startRow === null ||
    startCol === null ||
    endRow === null ||
    endCol === null
  ) {
    return false
  }

  const minRow = Math.min(startRow, endRow)
  const maxRow = Math.max(startRow, endRow)
  const minCol = Math.min(startCol, endCol)
  const maxCol = Math.max(startCol, endCol)

  return (
    rowIndex >= minRow &&
    rowIndex <= maxRow &&
    colIndex >= minCol &&
    colIndex <= maxCol
  )
}
