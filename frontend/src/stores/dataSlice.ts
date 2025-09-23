import type { DataSliceCreator } from './types'
import { api } from '../services/api'
import {
  INITIAL_FILTERS,
  INITIAL_THRESHOLDS,
  INITIAL_HIERARCHICAL_THRESHOLDS,
  INITIAL_CURRENT_METRIC
} from './types'

export const createDataSlice: DataSliceCreator = (set, get) => ({
  // ============================================================================
  // DATA STATE
  // ============================================================================

  filters: INITIAL_FILTERS,
  filterOptions: null,
  thresholds: INITIAL_THRESHOLDS,
  hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,
  currentMetric: INITIAL_CURRENT_METRIC,
  histogramData: null,
  sankeyData: null,

  // ============================================================================
  // DATA ACTIONS
  // ============================================================================

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      // Clear data when filters change
      histogramData: null,
      sankeyData: null
    }))
  },

  resetFilters: () => {
    set(() => ({
      filters: INITIAL_FILTERS,
      histogramData: null,
      sankeyData: null
    }))
  },

  setThresholds: (newThresholds) => {
    console.log('🎯 [DataSlice] setThresholds called:', { newThresholds })

    set((state) => {
      const updatedThresholds = { ...state.thresholds, ...newThresholds }
      const updatedHierarchical = {
        ...state.hierarchicalThresholds,
        global_thresholds: { ...state.hierarchicalThresholds.global_thresholds, ...newThresholds }
      }

      console.log('📦 [DataSlice] Updated state:', {
        previousThresholds: state.thresholds,
        newThresholds: updatedThresholds,
        hierarchicalThresholds: updatedHierarchical
      })

      return {
        thresholds: updatedThresholds,
        hierarchicalThresholds: updatedHierarchical
      }
    })
  },

  setCurrentMetric: (metric) => {
    set(() => ({
      currentMetric: metric
    }))
  },

  setHistogramData: (data) => {
    set(() => ({
      histogramData: data
    }))
  },

  setSankeyData: (data) => {
    set(() => ({
      sankeyData: data
    }))
  },

  // ============================================================================
  // API ACTIONS
  // ============================================================================

  fetchFilterOptions: async () => {
    const state = get()
    state.setLoading('filters', true)
    state.clearError('filters')

    try {
      const filterOptions = await api.getFilterOptions()
      set(() => ({ filterOptions }))
      state.setLoading('filters', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch filter options'
      state.setError('filters', errorMessage)
      state.setLoading('filters', false)
      console.error('Failed to fetch filter options:', error)
    }
  },

  fetchHistogramData: async (debounced = false, nodeId?: string) => {
    const state = get()
    const { filters, currentMetric } = state

    // Check if filters are active
    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      return
    }

    state.setLoading('histogram', true)
    state.clearError('histogram')

    try {
      const request = {
        filters,
        metric: currentMetric,
        bins: 20,
        nodeId
      }

      const histogramData = debounced
        ? await api.getHistogramDataDebounced(request)
        : await api.getHistogramData(request)

      // Store as a record with metric as key
      set(() => ({
        histogramData: { [currentMetric]: histogramData }
      }))

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
      console.error('Failed to fetch histogram data:', error)
    }
  },

  fetchMultipleHistogramData: async (metrics, debounced = false, nodeId?: string) => {
    const state = get()
    const { filters } = state

    // Check if filters are active
    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      return
    }

    state.setLoading('histogram', true)
    state.clearError('histogram')

    try {
      const histogramPromises = metrics.map(async (metric) => {
        const request = {
          filters,
          metric,
          bins: 20,
          nodeId
        }

        const data = debounced
          ? await api.getHistogramDataDebounced(request)
          : await api.getHistogramData(request)

        return { [metric]: data }
      })

      const results = await Promise.all(histogramPromises)
      const combinedData = results.reduce((acc, result) => ({ ...acc, ...result }), {})

      set(() => ({
        histogramData: combinedData
      }))

      // Update thresholds with mean values from histogram data
      const newThresholds: any = {}
      for (const metric of metrics) {
        const data = combinedData[metric]
        if (data && data.statistics && data.statistics.mean !== undefined) {
          newThresholds[metric] = data.statistics.mean
        }
      }

      if (Object.keys(newThresholds).length > 0) {
        state.setThresholds(newThresholds)
      }

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
      console.error('Failed to fetch multiple histogram data:', error)
    }
  },

  fetchSankeyData: async (debounced = false) => {
    console.log('🚀 [DataSlice] fetchSankeyData called')

    const state = get()
    const { filters, thresholds, hierarchicalThresholds } = state

    console.log('📋 [DataSlice] Current state for Sankey request:', {
      filters,
      thresholds,
      hierarchicalThresholds
    })

    // Check if filters are active
    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      console.log('❌ [DataSlice] No active filters, skipping fetchSankeyData')
      return
    }

    console.log('⏳ [DataSlice] Setting loading state and making API request')
    state.setLoading('sankey', true)
    state.clearError('sankey')

    try {
      const request = {
        filters,
        thresholds,
        hierarchicalThresholds
      }

      console.log('📡 [DataSlice] API request payload:', request)

      const sankeyData = debounced
        ? await api.getSankeyDataDebounced(request)
        : await api.getSankeyData(request)

      console.log('✅ [DataSlice] Sankey API response received:', sankeyData)

      set(() => ({
        sankeyData
      }))

      state.setLoading('sankey', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Sankey data'
      console.error('💥 [DataSlice] Failed to fetch Sankey data:', error)
      state.setError('sankey', errorMessage)
      state.setLoading('sankey', false)
    }
  },

  // ============================================================================
  // THRESHOLD GROUP FUNCTIONS
  // ============================================================================

  getNodesInSameThresholdGroup: (nodeId, metric) => {
    // For now, return just the single node since hierarchical threshold grouping
    // is complex functionality that may not be actively used
    // This prevents the error while maintaining the interface
    return [nodeId]
  },

  getEffectiveThresholdForNode: (nodeId, metric) => {
    // Get the current state to access thresholds
    const state = get()

    console.log('🔍 [DataSlice] getEffectiveThresholdForNode:', { nodeId, metric, thresholds: state.thresholds })

    // Check direct metric first
    if (state.thresholds[metric] !== undefined) {
      console.log('✅ [DataSlice] Found direct threshold:', { metric, value: state.thresholds[metric] })
      return state.thresholds[metric]
    }

    // Handle score_fuzz ↔ score_high mapping for reading
    const mappedMetric = metric === 'score_fuzz' ? 'score_high' :
                        metric === 'score_high' ? 'score_fuzz' : null

    if (mappedMetric && state.thresholds[mappedMetric] !== undefined) {
      console.log('🔄 [DataSlice] Found mapped threshold:', {
        originalMetric: metric,
        mappedMetric,
        value: state.thresholds[mappedMetric]
      })
      return state.thresholds[mappedMetric]
    }

    console.log('❌ [DataSlice] No threshold found, using default:', { metric, default: 0.5 })
    return 0.5
  },

  setThresholdGroup: (groupId, metric, threshold) => {
    console.log('🎯 [DataSlice] setThresholdGroup called:', { groupId, metric, threshold })

    // For now, just update the global threshold since hierarchical grouping
    // is complex functionality that may not be actively used
    const state = get()

    // Handle mapping for individual score metrics (independent behavior)
    const thresholdsToUpdate: Record<string, number> = { [metric]: threshold }
    const isScoreMetric = ['score_fuzz', 'score_detection', 'score_simulation'].includes(metric)

    if (isScoreMetric) {
      // Individual score metrics → also update score_high for API, but keep metrics independent
      thresholdsToUpdate['score_high'] = threshold
      console.log('🔄 [DataSlice] Individual score metric mapping:', { [metric]: threshold, score_high: threshold })
    }

    console.log('💾 [DataSlice] Setting thresholds:', thresholdsToUpdate)
    state.setThresholds(thresholdsToUpdate)
  },

  // ============================================================================
  // RESET ACTION
  // ============================================================================

  resetData: () => {
    set(() => ({
      filters: INITIAL_FILTERS,
      filterOptions: null,
      thresholds: INITIAL_THRESHOLDS,
      hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,
      currentMetric: INITIAL_CURRENT_METRIC,
      histogramData: null,
      sankeyData: null
    }))
  }
})