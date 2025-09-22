// Histogram formatting utilities

import { HISTOGRAM_COLORS, METRIC_TITLES } from './constants'
import type { HistogramBin, HistogramData } from './types'
import type { TooltipData } from '../shared'

/**
 * Get color for histogram bar based on threshold
 * @param binValue - The bin's start value (x0)
 * @param threshold - Current threshold value
 * @returns Color string for the bar
 */
export function getBarColor(binValue: number, threshold: number): string {
  return binValue >= threshold ? HISTOGRAM_COLORS.threshold : HISTOGRAM_COLORS.bars
}

/**
 * Format metric name for display in charts
 * @param metric - Raw metric name from API
 * @returns Formatted display title
 */
export function formatMetricTitle(metric: string): string {
  return METRIC_TITLES[metric] || metric.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * Format tooltip content for histogram bins
 * @param bin - Histogram bin data
 * @param threshold - Current threshold value
 * @returns Formatted tooltip content
 */
export function formatTooltipContent(bin: HistogramBin, threshold: number): TooltipData['content'] {
  return [
    { label: 'Range', value: `${bin.x0.toFixed(3)} - ${bin.x1.toFixed(3)}` },
    { label: 'Count', value: bin.count.toLocaleString() },
    { label: 'Density', value: `${(bin.density * 100).toFixed(1)}%` },
    { label: 'Status', value: bin.x0 >= threshold ? 'Above threshold' : 'Below threshold' }
  ]
}

/**
 * Format threshold tooltip content
 * @param threshold - Current threshold value
 * @param statistics - Histogram statistics from API
 * @returns Formatted tooltip content
 */
export function formatThresholdTooltip(threshold: number, statistics: HistogramData['statistics']): TooltipData['content'] {
  const percentile = ((threshold - statistics.min) / (statistics.max - statistics.min)) * 100

  return [
    { label: 'Threshold', value: threshold.toFixed(3) },
    { label: 'Percentile', value: `${percentile.toFixed(1)}%` },
    { label: 'Range', value: `${statistics.min.toFixed(3)} - ${statistics.max.toFixed(3)}` }
  ]
}