import type { StateCreator } from 'zustand'
import { api } from '../../../services/api'
import type { ApiSlice, VisualizationState, HistogramRequest, SankeyRequest } from '../types'
import type { NodeThresholds, MetricType, HistogramData } from '../../../services/types'
import {
  INITIAL_LOADING,
  INITIAL_ERRORS,
  INITIAL_CURRENT_METRIC,
  API_CONFIG
} from '../constants'
import { getErrorMessage, hasActiveFilters, getThresholdKey, shouldUpdateThreshold, logApiRequest } from '../utils'

export const createApiSlice: StateCreator<
  VisualizationState,
  [],
  [],
  ApiSlice
> = (set, get) => ({
  // ============================================================================
  // API STATE
  // ============================================================================

  histogramData: null,
  sankeyData: null,
  currentMetric: INITIAL_CURRENT_METRIC,
  loading: INITIAL_LOADING,
  errors: INITIAL_ERRORS,

  // ============================================================================
  // BASIC ACTIONS
  // ============================================================================

  setCurrentMetric: (metric) => {
    set(
      (state) => ({
        currentMetric: metric,
        errors: { ...state.errors, histogram: null }
      }),
      false,
      'setCurrentMetric'
    )
  },

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  clearError: (key) => {
    set(
      (state) => ({
        errors: { ...state.errors, [key]: null }
      }),
      false,
      'clearError'
    )
  },

  clearAllErrors: () => {
    set(
      () => ({
        errors: INITIAL_ERRORS
      }),
      false,
      'clearAllErrors'
    )
  },

  // ============================================================================
  // API FETCH FUNCTIONS
  // ============================================================================

  fetchFilterOptions: async () => {
    set(
      (state) => ({
        loading: { ...state.loading, filters: true },
        errors: { ...state.errors, filters: null }
      }),
      false,
      'fetchFilterOptions:start'
    )

    try {
      const filterOptions = await api.getFilterOptions()

      set(
        (state) => ({
          filterOptions,
          loading: { ...state.loading, filters: false }
        }),
        false,
        'fetchFilterOptions:success'
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set(
        (state) => ({
          loading: { ...state.loading, filters: false },
          errors: { ...state.errors, filters: errorMessage }
        }),
        false,
        'fetchFilterOptions:error'
      )

      console.error('Failed to fetch filter options:', error)
    }
  },

  fetchHistogramData: async (debounced = false, nodeId) => {
    const { filters, currentMetric } = get()

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set(
        (state) => ({
          histogramData: null,
          loading: { ...state.loading, histogram: false }
        }),
        false,
        'fetchHistogramData:noFilters'
      )
      return
    }

    set(
      (state) => ({
        loading: { ...state.loading, histogram: true },
        errors: { ...state.errors, histogram: null }
      }),
      false,
      'fetchHistogramData:start'
    )

    try {
      const request: HistogramRequest = {
        filters,
        metric: currentMetric,
        bins: API_CONFIG.DEFAULT_BINS,
        ...(nodeId && { nodeId })
      }

      const histogramData = debounced
        ? await api.getHistogramDataDebounced(request)
        : await api.getHistogramData(request)

      // Automatically update the threshold to the mean value
      const newThreshold = histogramData.statistics.mean

      set(
        (state) => {
          const thresholdKey = getThresholdKey(currentMetric)
          const updatedThresholds = shouldUpdateThreshold(currentMetric, state.thresholds)
            ? {
                ...state.thresholds,
                [thresholdKey]: newThreshold
              }
            : state.thresholds

          return {
            histogramData: { [currentMetric]: histogramData } as Record<string, HistogramData>,
            loading: { ...state.loading, histogram: false },
            thresholds: updatedThresholds
          }
        },
        false,
        'fetchHistogramData:success'
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set(
        (state) => ({
          loading: { ...state.loading, histogram: false },
          errors: { ...state.errors, histogram: errorMessage }
        }),
        false,
        'fetchHistogramData:error'
      )

      console.error('Failed to fetch histogram data:', error)
    }
  },

  fetchMultipleHistogramData: async (metrics, debounced = false, nodeId) => {
    const { filters } = get()

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set(
        (state) => ({
          histogramData: null,
          loading: { ...state.loading, histogram: false }
        }),
        false,
        'fetchMultipleHistogramData:noFilters'
      )
      return
    }

    set(
      (state) => ({
        loading: { ...state.loading, histogram: true },
        errors: { ...state.errors, histogram: null }
      }),
      false,
      'fetchMultipleHistogramData:start'
    )

    try {
      // Create parallel API requests for all metrics
      const requests = metrics.map(metric => {
        const request: HistogramRequest = {
          filters,
          metric,
          bins: API_CONFIG.DEFAULT_BINS,
          ...(nodeId && { nodeId })
        }

        return debounced
          ? api.getHistogramDataDebounced(request)
          : api.getHistogramData(request)
      })

      // Execute all requests in parallel
      const histogramResults = await Promise.all(requests)

      // Build the histogram data map
      const histogramDataMap: Record<string, HistogramData> = {}
      metrics.forEach((metric, index) => {
        histogramDataMap[metric] = histogramResults[index]
      })

      // Automatically update thresholds to the mean values
      const currentThresholds = get().thresholds
      const newThresholds = { ...currentThresholds }

      metrics.forEach((metric, index) => {
        const meanValue = histogramResults[index].statistics.mean

        if (metric === 'feature_splitting') {
          newThresholds.feature_splitting = meanValue
        } else if (metric === 'semdist_mean') {
          newThresholds.semdist_mean = meanValue
        } else if (metric.includes('score')) {
          // For score metrics, update the score_high threshold
          // Use the average of all score means if multiple scores are fetched
          const scoreMetrics = metrics.filter(m => m.includes('score'))
          if (scoreMetrics.length > 0) {
            const scoreMeans = scoreMetrics
              .map(scoreMetric => {
                const idx = metrics.indexOf(scoreMetric)
                return idx !== -1 ? histogramResults[idx].statistics.mean : 0
              })
              .filter(v => v > 0)

            if (scoreMeans.length > 0) {
              newThresholds.score_high = scoreMeans.reduce((a, b) => a + b, 0) / scoreMeans.length
            }
          }
        }
      })

      set(
        (state) => ({
          histogramData: histogramDataMap,
          loading: { ...state.loading, histogram: false },
          thresholds: newThresholds
        }),
        false,
        'fetchMultipleHistogramData:success'
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set(
        (state) => ({
          loading: { ...state.loading, histogram: false },
          errors: { ...state.errors, histogram: errorMessage }
        }),
        false,
        'fetchMultipleHistogramData:error'
      )

      console.error('Failed to fetch multiple histogram data:', error)
    }
  },

  fetchSankeyData: async (debounced = false, nodeThresholdsOverride) => {
    const { filters, thresholds, nodeThresholds, hierarchicalThresholds } = get()
    const actualNodeThresholds = nodeThresholdsOverride || nodeThresholds

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set(
        (state) => ({
          sankeyData: null,
          loading: { ...state.loading, sankey: false }
        }),
        false,
        'fetchSankeyData:noFilters'
      )
      return
    }

    set(
      (state) => ({
        loading: { ...state.loading, sankey: true },
        errors: { ...state.errors, sankey: null }
      }),
      false,
      'fetchSankeyData:start'
    )

    try {
      // Create request with hierarchical thresholds
      const request: SankeyRequest = {
        filters,
        thresholds,
        ...(Object.keys(actualNodeThresholds).length > 0 && { nodeThresholds: actualNodeThresholds }),
        hierarchicalThresholds
      }

      // Log the request for debugging
      logApiRequest(request, 'Sankey')

      const sankeyData = debounced
        ? await api.getSankeyDataDebounced(request)
        : await api.getSankeyData(request)

      set(
        (state) => ({
          sankeyData,
          loading: { ...state.loading, sankey: false }
        }),
        false,
        'fetchSankeyData:success'
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set(
        (state) => ({
          loading: { ...state.loading, sankey: false },
          errors: { ...state.errors, sankey: errorMessage }
        }),
        false,
        'fetchSankeyData:error'
      )

      console.error('Failed to fetch Sankey data:', error)
    }
  }
})