import { useVisualizationStore } from './index'
import type { MetricType } from '../../services/types'
import type { FilterStateSelector, HistogramStateSelector, SankeyStateSelector } from './types'

// ============================================================================
// BASIC SELECTORS
// ============================================================================

// Simple state selectors
export const useFilters = () => useVisualizationStore((state) => state.filters)
export const useThresholds = () => useVisualizationStore((state) => state.thresholds)
export const useNodeThresholds = () => useVisualizationStore((state) => state.nodeThresholds)
export const useHierarchicalThresholds = () => useVisualizationStore((state) => state.hierarchicalThresholds)
export const usePopoverState = () => useVisualizationStore((state) => state.popoverState)
export const useFilterOptions = () => useVisualizationStore((state) => state.filterOptions)
export const useHistogramData = () => useVisualizationStore((state) => state.histogramData)
export const useSankeyData = () => useVisualizationStore((state) => state.sankeyData)
export const useLoading = () => useVisualizationStore((state) => state.loading)
export const useErrors = () => useVisualizationStore((state) => state.errors)

// ============================================================================
// COMBINED SELECTORS
// ============================================================================

// Combined filter state selector
export const useFilterState = (): FilterStateSelector => useVisualizationStore((state) => ({
  filters: state.filters,
  filterOptions: state.filterOptions,
  loading: state.loading.filters,
  error: state.errors.filters
}))

// Combined histogram state selector
export const useHistogramState = (): HistogramStateSelector => useVisualizationStore((state) => ({
  data: state.histogramData,
  threshold: state.thresholds.semdist_mean,
  metric: state.currentMetric,
  loading: state.loading.histogram,
  error: state.errors.histogram
}))

// Combined sankey state selector
export const useSankeyState = (): SankeyStateSelector => useVisualizationStore((state) => ({
  data: state.sankeyData,
  loading: state.loading.sankey,
  error: state.errors.sankey
}))

// ============================================================================
// PARAMETERIZED SELECTORS
// ============================================================================

// Histogram data for a specific metric
export const useHistogramDataForMetric = (metric: MetricType) => useVisualizationStore((state) =>
  state.histogramData?.[metric] || null
)

// Threshold for specific node and metric
export const useNodeThreshold = (parentNodeId: string, metric: MetricType) =>
  useVisualizationStore((state) => state.nodeThresholds[parentNodeId]?.[metric])

// ============================================================================
// MEMOIZED SELECTORS (for performance)
// ============================================================================

// Check if any filters are active
export const useHasActiveFilters = () => useVisualizationStore((state) =>
  Object.values(state.filters).some(filterArray => filterArray && filterArray.length > 0)
)

// Get current threshold for the current metric
export const useCurrentThreshold = () => useVisualizationStore((state) => {
  const { currentMetric, thresholds } = state

  if (currentMetric === 'semdist_mean') {
    return thresholds.semdist_mean
  }
  if (currentMetric.includes('score')) {
    return thresholds.score_high
  }
  return 0
})

// Check if data is available for current filters
export const useIsDataAvailable = () => useVisualizationStore((state) => {
  const hasFilters = Object.values(state.filters).some(filterArray => filterArray && filterArray.length > 0)
  return hasFilters && (state.histogramData !== null || state.sankeyData !== null)
})

// Get loading status for any operation
export const useIsAnyLoading = () => useVisualizationStore((state) =>
  Object.values(state.loading).some(loading => loading)
)

// Get if there are any errors
export const useHasAnyErrors = () => useVisualizationStore((state) =>
  Object.values(state.errors).some(error => error !== null)
)