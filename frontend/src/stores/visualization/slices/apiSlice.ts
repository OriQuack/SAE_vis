import type { StateCreator } from 'zustand'
import { visualizationApiService } from '../services/apiService'
import { thresholdCalculationService } from '../services/thresholdService'
import type { ApiSlice, VisualizationState } from '../types'
import {
  INITIAL_LOADING,
  INITIAL_ERRORS,
  INITIAL_CURRENT_METRIC
} from '../constants'
import { getErrorMessage, hasActiveFilters, logApiRequest } from '../utils'

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
    set((state) => ({
      currentMetric: metric,
      errors: { ...state.errors, histogram: null }
    }))
  },

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  clearError: (key) => {
    set((state) => ({
      errors: { ...state.errors, [key]: null }
    }))
  },

  clearAllErrors: () => {
    set(() => ({
      errors: INITIAL_ERRORS
    }))
  },

  // ============================================================================
  // API FETCH FUNCTIONS
  // ============================================================================

  fetchFilterOptions: async () => {
    set((state) => ({
      loading: { ...state.loading, filters: true },
      errors: { ...state.errors, filters: null }
    }))

    try {
      const filterOptions = await visualizationApiService.fetchFilterOptions()

      set((state) => ({
        filterOptions,
        loading: { ...state.loading, filters: false }
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set((state) => ({
        loading: { ...state.loading, filters: false },
        errors: { ...state.errors, filters: errorMessage }
      }))

      console.error('Failed to fetch filter options:', error)
    }
  },

  fetchHistogramData: async (debounced = false, nodeId) => {
    const { filters, currentMetric } = get()

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set((state) => ({
        histogramData: null,
        loading: { ...state.loading, histogram: false }
      }))
      return
    }

    set((state) => ({
      loading: { ...state.loading, histogram: true },
      errors: { ...state.errors, histogram: null }
    }))

    try {
      const histogramData = await visualizationApiService.fetchHistogramData(
        { filters, metric: currentMetric, nodeId },
        debounced
      )

      // Calculate automatic threshold update
      const currentThresholds = get().thresholds
      const thresholdUpdate = thresholdCalculationService.calculateThresholdFromHistogram(
        currentMetric,
        histogramData,
        currentThresholds
      )

      set((state) => ({
        histogramData: { [currentMetric]: histogramData },
        loading: { ...state.loading, histogram: false },
        thresholds: { ...state.thresholds, ...thresholdUpdate }
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set((state) => ({
        loading: { ...state.loading, histogram: false },
        errors: { ...state.errors, histogram: errorMessage }
      }))

      console.error('Failed to fetch histogram data:', error)
    }
  },

  fetchMultipleHistogramData: async (metrics, debounced = false, nodeId) => {
    const { filters } = get()

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set((state) => ({
        histogramData: null,
        loading: { ...state.loading, histogram: false }
      }))
      return
    }

    set((state) => ({
      loading: { ...state.loading, histogram: true },
      errors: { ...state.errors, histogram: null }
    }))

    try {
      const histogramDataMap = await visualizationApiService.fetchMultipleHistogramData(
        { filters, metrics, nodeId },
        debounced
      )

      // Calculate automatic threshold updates
      const currentThresholds = get().thresholds
      const histogramResults = Object.values(histogramDataMap)
      const thresholdUpdates = thresholdCalculationService.calculateThresholdsFromMultipleHistograms(
        metrics,
        histogramResults,
        currentThresholds
      )

      set((state) => ({
        histogramData: histogramDataMap,
        loading: { ...state.loading, histogram: false },
        thresholds: { ...state.thresholds, ...thresholdUpdates }
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set((state) => ({
        loading: { ...state.loading, histogram: false },
        errors: { ...state.errors, histogram: errorMessage }
      }))

      console.error('Failed to fetch multiple histogram data:', error)
    }
  },

  fetchSankeyData: async (debounced = false, nodeThresholdsOverride) => {
    const { filters, thresholds, nodeThresholds, hierarchicalThresholds } = get()
    const actualNodeThresholds = nodeThresholdsOverride || nodeThresholds

    // Don't fetch if no filters are active
    if (!hasActiveFilters(filters)) {
      set((state) => ({
        sankeyData: null,
        loading: { ...state.loading, sankey: false }
      }))
      return
    }

    set((state) => ({
      loading: { ...state.loading, sankey: true },
      errors: { ...state.errors, sankey: null }
    }))

    try {
      const request = {
        filters,
        thresholds,
        nodeThresholds: actualNodeThresholds,
        hierarchicalThresholds
      }

      // Log the request for debugging
      logApiRequest(request, 'Sankey')

      const sankeyData = await visualizationApiService.fetchSankeyData(request, debounced)

      set((state) => ({
        sankeyData,
        loading: { ...state.loading, sankey: false }
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      set((state) => ({
        loading: { ...state.loading, sankey: false },
        errors: { ...state.errors, sankey: errorMessage }
      }))

      console.error('Failed to fetch Sankey data:', error)
    }
  }
})