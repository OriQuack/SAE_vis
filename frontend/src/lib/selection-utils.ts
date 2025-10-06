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
 * Calculate exact threshold range from mouse selection coordinates
 * @param selectionRect - Selection rectangle in container coordinates
 * @param chartRect - Chart SVG element bounding rect
 * @param histogramData - Histogram data with bin edges
 * @param innerWidth - Inner width of chart (excluding margins)
 * @param margin - Chart margins
 * @returns Exact min and max threshold values based on pixel positions
 */
export function calculateExactThresholdRange(
  selectionRect: SelectionRect,
  chartRect: DOMRect,
  histogramData: HistogramData,
  innerWidth: number,
  margin: { left: number; top: number }
): ThresholdRange {
  // Convert selection x coordinates to chart space
  const chartX1 = selectionRect.x - chartRect.left - margin.left
  const chartX2 = (selectionRect.x + selectionRect.width) - chartRect.left - margin.left

  // Ensure coordinates are within chart bounds
  const clampedX1 = Math.max(0, Math.min(innerWidth, chartX1))
  const clampedX2 = Math.max(0, Math.min(innerWidth, chartX2))

  // Use bin_edges to determine the domain (handles both fixed and data-based domains)
  const domainMin = histogramData.histogram.bin_edges[0]
  const domainMax = histogramData.histogram.bin_edges[histogramData.histogram.bin_edges.length - 1]
  const dataRange = domainMax - domainMin

  // Convert pixel positions to exact threshold values
  // Linear interpolation from pixel space to data space
  const min = domainMin + (Math.min(clampedX1, clampedX2) / innerWidth) * dataRange
  const max = domainMin + (Math.max(clampedX1, clampedX2) / innerWidth) * dataRange

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

/**
 * Check if a threshold value falls within a bar's range
 * @param value - Threshold value to check
 * @param binEdges - Array of bin edges from histogram
 * @param barIndex - Index of the bar to check
 * @returns True if value is within the bar's range
 */
export function isValueInBar(
  value: number,
  binEdges: number[],
  barIndex: number
): boolean {
  if (barIndex < 0 || barIndex >= binEdges.length - 1) return false
  return value >= binEdges[barIndex] && value < binEdges[barIndex + 1]
}

/**
 * Get bars that contain the threshold range
 * @param thresholdRange - Min and max threshold values
 * @param histogramData - Histogram data with bin edges
 * @returns Array of bar indices that fall within the threshold range
 */
export function getBarsInThresholdRange(
  thresholdRange: ThresholdRange,
  histogramData: HistogramData
): number[] {
  const selectedIndices: number[] = []
  const binEdges = histogramData.histogram.bin_edges

  for (let i = 0; i < binEdges.length - 1; i++) {
    const binStart = binEdges[i]
    const binEnd = binEdges[i + 1]

    // Check if this bin overlaps with the threshold range
    if (
      (binStart >= thresholdRange.min && binStart < thresholdRange.max) ||
      (binEnd > thresholdRange.min && binEnd <= thresholdRange.max) ||
      (binStart <= thresholdRange.min && binEnd >= thresholdRange.max)
    ) {
      selectedIndices.push(i)
    }
  }

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