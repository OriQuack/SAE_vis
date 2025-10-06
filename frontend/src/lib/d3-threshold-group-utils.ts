// ============================================================================
// D3 THRESHOLD GROUP UTILITIES
// ============================================================================

/**
 * Utility functions for threshold group visualization calculations
 * Following the pattern from d3-histogram-utils.ts and d3-flow-utils.ts
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ThresholdGroup {
  id: string
  label: string
  threshold: number
  count: number
  color: string
}

export interface ThresholdGroupLayout {
  groups: ThresholdGroupData[]
  width: number
  height: number
}

export interface ThresholdGroupData {
  x: number
  y: number
  width: number
  height: number
  label: string
  value: number
  color: string
}

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate layout for threshold group visualization
 * @param groups - Array of threshold groups
 * @param containerWidth - Container width
 * @param containerHeight - Container height
 * @returns Calculated layout data
 */
export function calculateThresholdGroupLayout(
  groups: ThresholdGroup[],
  containerWidth: number,
  containerHeight: number
): ThresholdGroupLayout {
  // Placeholder implementation - ready for future development
  const calculatedGroups: ThresholdGroupData[] = groups.map((group, index) => ({
    x: index * 100,
    y: 0,
    width: 80,
    height: 100,
    label: group.label,
    value: group.threshold,
    color: group.color
  }))

  return {
    groups: calculatedGroups,
    width: containerWidth,
    height: containerHeight
  }
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format threshold value for display
 * @param value - Threshold value
 * @returns Formatted string
 */
export function formatThresholdValue(value: number): string {
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(2)
  }
  if (Math.abs(value) < 1) {
    return value.toFixed(3)
  }
  return value.toFixed(2)
}

/**
 * Format count value for display
 * @param count - Count value
 * @returns Formatted string
 */
export function formatCountValue(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate threshold group data
 * @param groups - Array of threshold groups
 * @returns Array of validation errors (empty if valid)
 */
export function validateThresholdGroups(groups: ThresholdGroup[]): string[] {
  const errors: string[] = []

  if (!groups || groups.length === 0) {
    errors.push('Threshold groups array is empty')
    return errors
  }

  groups.forEach((group, index) => {
    if (!group.id) {
      errors.push(`Group at index ${index} missing id`)
    }
    if (!group.label) {
      errors.push(`Group at index ${index} missing label`)
    }
    if (typeof group.threshold !== 'number') {
      errors.push(`Group at index ${index} has invalid threshold`)
    }
    if (typeof group.count !== 'number' || group.count < 0) {
      errors.push(`Group at index ${index} has invalid count`)
    }
  })

  return errors
}

/**
 * Validate container dimensions
 * @param width - Container width
 * @param height - Container height
 * @returns Array of validation errors (empty if valid)
 */
export function validateDimensions(width: number, height: number): string[] {
  const errors: string[] = []

  if (width < 100) {
    errors.push('Container width must be at least 100px')
  }
  if (height < 100) {
    errors.push('Container height must be at least 100px')
  }

  return errors
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Generate color for threshold group based on index
 * @param index - Group index
 * @returns CSS color string
 */
export function getGroupColor(index: number): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
  ]
  return colors[index % colors.length]
}
