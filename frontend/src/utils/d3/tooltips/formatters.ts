// Tooltip formatting utilities

import type { TooltipData } from '../shared'

/**
 * Generate ARIA label for histogram bins
 * @param bin - Histogram bin data
 * @param index - Bin index
 * @param totalBins - Total number of bins
 * @param threshold - Current threshold value
 * @returns Accessible ARIA label
 */
export function generateHistogramBinAriaLabel(
  bin: { x0: number; x1: number; count: number },
  index: number,
  totalBins: number,
  threshold: number
): string {
  const status = bin.x0 >= threshold ? 'above' : 'below'
  return `Bin ${index + 1} of ${totalBins}: ${bin.count} features in range ${bin.x0.toFixed(3)} to ${bin.x1.toFixed(3)}, ${status} threshold`
}

/**
 * Generate ARIA label for slider controls
 * @param value - Current slider value
 * @param min - Minimum value
 * @param max - Maximum value
 * @param metric - Metric name
 * @returns Accessible ARIA label
 */
export function generateSliderAriaLabel(
  value: number,
  min: number,
  max: number,
  metric: string
): string {
  const percentage = max === min ? 0 : ((value - min) / (max - min)) * 100
  return `${metric} threshold: ${value.toFixed(3)} (${percentage.toFixed(1)}% of range)`
}

/**
 * Format tooltip content for better readability
 * @param content - Raw tooltip content array
 * @returns Formatted tooltip content
 */
export function formatTooltipContent(content: TooltipData['content']): TooltipData['content'] {
  return content.map(item => ({
    label: item.label,
    value: typeof item.value === 'number'
      ? item.value.toLocaleString()
      : item.value
  }))
}