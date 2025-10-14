/**
 * D3 Consistency Color Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for consistency color bar calculations and color mapping.
 */

import { scaleLinear } from 'd3-scale'

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
 * @returns Layout calculations for rendering
 */
export function calculateColorBarLayout(
  containerWidth: number = 400,
  barHeight: number = 12
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
    gradientStops: [
      { offset: '0%', color: '#ef4444' },   // Red (low consistency at 0)
      { offset: '50%', color: '#eab308' },  // Yellow (medium)
      { offset: '100%', color: '#22c55e' }  // Green (high consistency at 1)
    ]
  }
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

/**
 * Get color for a consistency value (0-1)
 *
 * Uses same gradient as the visualization color bar.
 * Can be used for coloring table cells, charts, etc.
 *
 * @param value - Consistency value between 0 and 1
 * @returns RGB color string (e.g., "#22c55e")
 */
export function getConsistencyColor(value: number): string {
  // Clamp value between 0 and 1
  const clampedValue = Math.max(0, Math.min(1, value))

  // Create D3 color scale
  // 0 = red (low consistency), 0.5 = yellow, 1 = green (high consistency)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range(['#ef4444', '#eab308', '#22c55e'])  // Red -> Yellow -> Green

  return colorScale(clampedValue)
}

/**
 * Get gradient stops for consistency color scale
 *
 * Returns array of gradient stops that can be used in SVG linearGradient
 *
 * @returns Array of gradient stop objects
 */
export function getConsistencyGradientStops(): Array<{ offset: string; color: string }> {
  return [
    { offset: '0%', color: '#ef4444' },   // Red (low consistency at 0)
    { offset: '50%', color: '#eab308' },  // Yellow (medium)
    { offset: '100%', color: '#22c55e' }  // Green (high consistency at 1)
  ]
}
