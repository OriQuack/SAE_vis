// Histogram validation utilities

import type { HistogramData } from '../shared'

/**
 * Validates histogram data structure and content
 * @param data - Histogram data from API
 * @returns Array of validation error messages (empty if valid)
 */
export function validateHistogramData(data: HistogramData): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('No histogram data provided')
    return errors
  }

  // Validate histogram structure
  if (!data.histogram) {
    errors.push('No histogram structure provided')
    return errors
  }

  const { histogram, statistics } = data

  // Validate bins
  if (!histogram.bins || histogram.bins.length === 0) {
    errors.push('No histogram bins provided')
  }

  // Validate counts
  if (!histogram.counts || histogram.counts.length === 0) {
    errors.push('No histogram counts provided')
  }

  // Validate bin_edges
  if (!histogram.bin_edges || histogram.bin_edges.length === 0) {
    errors.push('No histogram bin edges provided')
  }

  // Validate array length consistency
  if (histogram.bins && histogram.counts && histogram.bins.length !== histogram.counts.length) {
    errors.push('Bins and counts arrays have different lengths')
  }

  if (histogram.bin_edges && histogram.bins && histogram.bin_edges.length !== histogram.bins.length + 1) {
    errors.push('Invalid bin edges array length')
  }

  // Validate statistics
  if (!statistics) {
    errors.push('No statistics provided')
  } else {
    if (typeof statistics.min !== 'number' || typeof statistics.max !== 'number') {
      errors.push('Invalid statistics: min and max must be numbers')
    } else if (statistics.min >= statistics.max) {
      errors.push('Invalid statistics: min should be less than max')
    }
  }

  // Validate counts are non-negative
  if (histogram.counts && histogram.counts.some(count => count < 0)) {
    errors.push('Histogram counts must be non-negative')
  }

  // Validate bin edges are in ascending order
  if (histogram.bin_edges && histogram.bin_edges.length > 1) {
    for (let i = 1; i < histogram.bin_edges.length; i++) {
      if (histogram.bin_edges[i] <= histogram.bin_edges[i - 1]) {
        errors.push('Bin edges must be in ascending order')
        break
      }
    }
  }

  return errors
}