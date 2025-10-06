// ============================================================================
// SELECTION UTILITIES FOR HISTOGRAM INTERACTION
// ============================================================================

import type { HistogramData } from '../types'

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
 * @param mouseX - Mouse X coordinate relative to container
 * @param chartRect - Chart bounding rectangle
 * @param margin - Chart margins
 * @param innerWidth - Chart inner width (excluding margins)
 * @param domain - Metric domain {min, max}
 * @returns Threshold value
 */
export function calculateThresholdFromMouseX(
  mouseX: number,
  chartRect: DOMRect,
  margin: { left: number },
  innerWidth: number,
  domain: { min: number; max: number }
): number {
  // Convert mouse position to chart coordinates
  const chartX = mouseX - chartRect.left - margin.left

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
 * @param chartRect - Chart bounding rectangle
 * @param margin - Chart margins
 * @param innerWidth - Chart inner width
 * @param domain - Metric domain
 * @returns Min and max threshold values
 */
export function calculateThresholdRangeFromMouse(
  selectionRect: SelectionRect,
  chartRect: DOMRect,
  margin: { left: number },
  innerWidth: number,
  domain: { min: number; max: number }
): ThresholdRange {
  const minX = selectionRect.x
  const maxX = selectionRect.x + selectionRect.width

  const minThreshold = calculateThresholdFromMouseX(minX, chartRect, margin, innerWidth, domain)
  const maxThreshold = calculateThresholdFromMouseX(maxX, chartRect, margin, innerWidth, domain)

  return {
    min: Math.min(minThreshold, maxThreshold),
    max: Math.max(minThreshold, maxThreshold)
  }
}

/**
 * Calculate threshold range from selected bar indices
 * @param histogramData - Histogram data containing bin edges
 * @param selectedIndices - Array of selected bar indices
 * @returns Min and max threshold values
 */
export function calculateThresholdRange(
  histogramData: HistogramData,
  selectedIndices: number[]
): ThresholdRange {
  if (selectedIndices.length === 0) {
    return { min: 0, max: 0 }
  }

  const minIndex = Math.min(...selectedIndices)
  const maxIndex = Math.max(...selectedIndices)

  // Get exact threshold values from bin edges
  const min = histogramData.histogram.bin_edges[minIndex]
  const max = histogramData.histogram.bin_edges[maxIndex + 1]

  return { min, max }
}

/**
 * Get bars that intersect with selection rectangle
 * @param selectionRect - Selection rectangle in container coordinates
 * @param chartRect - Chart SVG element bounding rect
 * @param bars - Array of bar data with positions
 * @param margin - Chart margins
 * @returns Array of selected bar indices
 */
export function getBarsInSelection(
  selectionRect: SelectionRect,
  chartRect: DOMRect,
  bars: Array<{ x: number; width: number }>,
  margin: { left: number; top: number }
): number[] {
  const selectedIndices: number[] = []

  // Convert selection rect to chart coordinates
  const chartSelectionX = selectionRect.x - chartRect.left - margin.left
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
// COLOR UTILITIES
// ============================================================================

/**
 * Get selection color based on index
 * @param index - Selection index
 * @returns CSS color string
 */
export function getSelectionColor(index: number): string {
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

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format threshold range for display
 * @param min - Minimum threshold value
 * @param max - Maximum threshold value
 * @returns Formatted string
 */
export function formatThresholdRange(min: number, max: number): string {
  const formatValue = (val: number): string => {
    if (Math.abs(val) < 0.001 && val !== 0) {
      return val.toExponential(2)
    }
    if (Math.abs(val) < 1) {
      return val.toFixed(3)
    }
    return val.toFixed(2)
  }

  return `${formatValue(min)} - ${formatValue(max)}`
}

/**
 * Format metric name for display
 * @param metricType - Metric type key
 * @returns Human-readable metric name
 */
export function formatMetricName(metricType: string): string {
  const names: Record<string, string> = {
    feature_splitting: 'Feature Splitting',
    semdist_mean: 'Semantic Similarity',
    score_embedding: 'Embedding Score',
    score_fuzz: 'Fuzz Score',
    score_detection: 'Detection Score'
  }
  return names[metricType] || metricType
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