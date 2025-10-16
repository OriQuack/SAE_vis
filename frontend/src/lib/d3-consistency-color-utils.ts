/**
 * D3 Consistency Color Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for consistency color bar calculations and color mapping.
 */

import { scaleLinear } from 'd3-scale'
import { CONSISTENCY_COLORS } from './constants'
import type { ConsistencyType } from '../types'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ColorBarLayout {
  width: number
  height: number
  barX: number
  barY: number
  barWidth: number
  barHeight: number
  leftLabelX: number
  leftLabelY: number
  rightLabelX: number
  rightLabelY: number
  gradientStops: Array<{
    offset: string
    color: string
  }>
}

// ============================================================================
// COLOR BAR LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate color bar layout with inline labels
 *
 * Following project pattern: D3 calculations in utils, React renders the result
 *
 * @param containerWidth - Total width available for the color bar and labels
 * @param barHeight - Height of the gradient bar
 * @param consistencyType - Type of consistency for color selection
 * @returns Layout calculations for rendering
 */
export function calculateColorBarLayout(
  containerWidth: number = 400,
  barHeight: number = 12,
  consistencyType: ConsistencyType = 'none'
): ColorBarLayout {
  const labelWidth = 35  // Width reserved for each label ("0 Low", "1 High")
  const labelGap = 8     // Gap between label and bar

  // Calculate bar width (total - labels - gaps)
  const barWidth = containerWidth - (labelWidth * 2) - (labelGap * 2)
  const barX = labelWidth + labelGap
  const barY = 0

  // Label positions (vertically centered with bar)
  const labelY = barHeight / 2

  return {
    width: containerWidth,
    height: barHeight,
    barX,
    barY,
    barWidth,
    barHeight,
    leftLabelX: 0,
    leftLabelY: labelY,
    rightLabelX: containerWidth - labelWidth,
    rightLabelY: labelY,
    gradientStops: getConsistencyGradientStops(consistencyType)
  }
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

/**
 * Get consistency color gradient definition based on consistency type
 *
 * @param consistencyType - Type of consistency metric
 * @returns Color gradient definition (LOW, MEDIUM, HIGH)
 */
function getConsistencyColorGradient(consistencyType: ConsistencyType): { LOW: string; MEDIUM: string; HIGH: string } {
  switch (consistencyType) {
    case 'llm_scorer_consistency':
      return CONSISTENCY_COLORS.LLM_SCORER
    case 'within_explanation_score':
      return CONSISTENCY_COLORS.WITHIN_EXPLANATION
    case 'cross_explanation_score':
      return CONSISTENCY_COLORS.CROSS_EXPLANATION
    case 'llm_explainer_consistency':
      return CONSISTENCY_COLORS.LLM_EXPLAINER
    case 'none':
    default:
      // Default to white (no coloring)
      return { LOW: '#FFFFFF', MEDIUM: '#FFFFFF', HIGH: '#FFFFFF' }
  }
}

/**
 * Get color for a consistency value (0-1)
 *
 * Uses single-color gradient (white to color) based on consistency type.
 * Can be used for coloring table cells, charts, etc.
 *
 * @param value - Consistency value between 0 and 1
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns RGB color string (e.g., "#4477AA")
 */
export function getConsistencyColor(value: number, consistencyType: ConsistencyType = 'none'): string {
  // Clamp value between 0 and 1
  const clampedValue = Math.max(0, Math.min(1, value))

  // Get color gradient for this consistency type
  const gradient = getConsistencyColorGradient(consistencyType)

  // Create D3 color scale: white (0) → light color (0.5) → full color (1.0)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([gradient.LOW, gradient.MEDIUM, gradient.HIGH])

  return colorScale(clampedValue)
}

/**
 * Get gradient stops for consistency color scale
 *
 * Returns array of gradient stops that can be used in SVG linearGradient
 *
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns Array of gradient stop objects
 */
export function getConsistencyGradientStops(consistencyType: ConsistencyType = 'none'): Array<{ offset: string; color: string }> {
  const gradient = getConsistencyColorGradient(consistencyType)

  return [
    { offset: '0%', color: gradient.LOW },      // White (low consistency at 0)
    { offset: '50%', color: gradient.MEDIUM },  // Light color (medium)
    { offset: '100%', color: gradient.HIGH }    // Full color (high consistency at 1)
  ]
}
