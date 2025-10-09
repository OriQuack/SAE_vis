// ============================================================================
// SELECTION UTILITIES FOR HISTOGRAM INTERACTION
// ============================================================================

import React from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ThresholdRange {
  min: number
  max: number
}

// ============================================================================
// THRESHOLD CALCULATIONS
// ============================================================================

/**
 * Calculate threshold value from mouse X position
 * @param mouseScreenX - Mouse X coordinate in screen coordinates
 * @param chartRect - Chart SVG bounding rectangle (screen coordinates)
 * @param margin - Chart margins
 * @param innerWidth - Chart inner width (excluding margins)
 * @param domain - Metric domain {min, max}
 * @returns Threshold value
 */
export function calculateThresholdFromMouseX(
  mouseScreenX: number,
  chartRect: DOMRect,
  margin: { left: number },
  innerWidth: number,
  domain: { min: number; max: number }
): number {
  // Convert from screen coordinates to chart coordinates
  const chartX = mouseScreenX - chartRect.left - margin.left

  // Clamp to chart bounds
  const clampedX = Math.max(0, Math.min(innerWidth, chartX))

  // Convert to domain value
  const ratio = clampedX / innerWidth
  const value = domain.min + ratio * (domain.max - domain.min)

  return value
}

/**
 * Calculate threshold range from mouse selection rectangle
 * @param selectionRect - Selection rectangle in container coordinates
 * @param chartRect - Chart SVG bounding rectangle (screen coordinates)
 * @param containerRect - Container bounding rectangle (screen coordinates)
 * @param margin - Chart margins
 * @param innerWidth - Chart inner width
 * @param domain - Metric domain
 * @returns Min and max threshold values
 */
export function calculateThresholdRangeFromMouse(
  selectionRect: SelectionRect,
  chartRect: DOMRect,
  containerRect: DOMRect,
  margin: { left: number },
  innerWidth: number,
  domain: { min: number; max: number }
): ThresholdRange {
  // Convert from container coordinates to screen coordinates
  const minScreenX = containerRect.left + selectionRect.x
  const maxScreenX = containerRect.left + selectionRect.x + selectionRect.width

  const minThreshold = calculateThresholdFromMouseX(minScreenX, chartRect, margin, innerWidth, domain)
  const maxThreshold = calculateThresholdFromMouseX(maxScreenX, chartRect, margin, innerWidth, domain)

  return {
    min: Math.min(minThreshold, maxThreshold),
    max: Math.max(minThreshold, maxThreshold)
  }
}

/**
 * Get bars that intersect with selection rectangle
 * @param selectionRect - Selection rectangle in container coordinates
 * @param chartRect - Chart SVG element bounding rect (screen coordinates)
 * @param containerRect - Container bounding rectangle (screen coordinates)
 * @param bars - Array of bar data with positions
 * @param margin - Chart margins
 * @returns Array of selected bar indices
 */
export function getBarsInSelection(
  selectionRect: SelectionRect,
  chartRect: DOMRect,
  containerRect: DOMRect,
  bars: Array<{ x: number; width: number }>,
  margin: { left: number; top: number }
): number[] {
  const selectedIndices: number[] = []

  // Convert from container coordinates to screen coordinates, then to chart coordinates
  const selectionScreenX = containerRect.left + selectionRect.x
  const chartSelectionX = selectionScreenX - chartRect.left - margin.left
  const chartSelectionRight = chartSelectionX + selectionRect.width

  bars.forEach((bar, index) => {
    const barRight = bar.x + bar.width

    // Check if bar intersects with selection
    if (
      (bar.x >= chartSelectionX && bar.x <= chartSelectionRight) ||
      (barRight >= chartSelectionX && barRight <= chartSelectionRight) ||
      (bar.x <= chartSelectionX && barRight >= chartSelectionRight)
    ) {
      selectedIndices.push(index)
    }
  })

  return selectedIndices
}

// ============================================================================
// COORDINATE UTILITIES
// ============================================================================

/**
 * Convert mouse event to container coordinates
 * @param event - Mouse event
 * @param container - Container element
 * @returns Coordinates relative to container
 */
export function getContainerCoordinates(
  event: React.MouseEvent,
  container: HTMLElement
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

/**
 * Check if point is inside rectangle
 * @param point - Point coordinates
 * @param rect - Rectangle bounds
 * @returns True if point is inside rectangle
 */
export function isPointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate selection rectangle
 * @param rect - Selection rectangle
 * @returns True if rectangle is valid (has area)
 */
export function isValidSelection(rect: SelectionRect | null): boolean {
  if (!rect) return false
  return rect.width > 5 && rect.height > 5 // Minimum 5x5 pixels
}