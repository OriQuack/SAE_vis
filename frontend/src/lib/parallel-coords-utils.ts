// ============================================================================
// PARALLEL COORDINATES UTILITIES
// Summary statistics computation for category bands
// ============================================================================

import type { CauseMetricScores } from './cause-tagging-utils'
import type { CauseCategory } from './cause-visualization-utils'

// ============================================================================
// TYPES
// ============================================================================

export interface MetricSummary {
  median: number
  q1: number   // 25th percentile
  q3: number   // 75th percentile
}

export interface CategoryBand {
  category: CauseCategory | 'well-explained'
  color: string
  label: string
  count: number
  metrics: Partial<Record<keyof CauseMetricScores, MetricSummary | null>>
  // null if < 2 features in category (not enough data for a band)
}

// ============================================================================
// PERCENTILE HELPERS
// ============================================================================

/**
 * Compute a percentile from a sorted array using linear interpolation.
 * @param sorted - Pre-sorted array of numbers (ascending)
 * @param p - Percentile in [0, 1]
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]

  const index = p * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const frac = index - lower

  if (lower === upper) return sorted[lower]
  return sorted[lower] * (1 - frac) + sorted[upper] * frac
}

/**
 * Compute median, Q1, Q3 for a set of values (ignoring nulls).
 * Returns null if fewer than 2 valid values.
 */
function computeSummary(values: (number | null)[]): MetricSummary | null {
  const valid = values.filter((v): v is number => v !== null && v !== undefined)
  if (valid.length < 2) return null

  valid.sort((a, b) => a - b)

  return {
    q1: percentile(valid, 0.25),
    median: percentile(valid, 0.5),
    q3: percentile(valid, 0.75)
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/** Metric keys used in parallel coordinates axes */
const PARALLEL_METRIC_KEYS: (keyof CauseMetricScores)[] = [
  'fracNonzero', 'consensusScore', 'embedding', 'detection', 'fuzz'
]

/**
 * Compute per-category summary bands for parallel coordinates.
 *
 * @param categoryScoresMap - Map from category string to Map<featureId, CauseMetricScores>
 * @param colorMap - Map from category string to hex color
 * @param labelMap - Map from category string to display label
 * @returns Array of CategoryBand objects
 */
export function computeCategoryBands(
  categoryScoresMap: Map<string, Map<number, CauseMetricScores>>,
  colorMap: Map<string, string>,
  labelMap: Map<string, string>
): CategoryBand[] {
  const bands: CategoryBand[] = []

  for (const [category, scoresMap] of categoryScoresMap) {
    const color = colorMap.get(category) || '#9ca3af'
    const label = labelMap.get(category) || category
    const count = scoresMap.size

    const metrics: Partial<Record<keyof CauseMetricScores, MetricSummary | null>> = {}

    for (const key of PARALLEL_METRIC_KEYS) {
      const values: (number | null)[] = []
      scoresMap.forEach(scores => {
        values.push(scores[key])
      })
      metrics[key] = computeSummary(values)
    }

    bands.push({
      category: category as CauseCategory | 'well-explained',
      color,
      label,
      count,
      metrics
    })
  }

  return bands
}
