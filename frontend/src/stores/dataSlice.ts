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

    console.log('🔍 [DataSlice] getEffectiveThresholdForNode:', {
      nodeId,
      metric,
      hierarchicalThresholds: state.hierarchicalThresholds
    })

    // First check for individual node threshold override
    const individualGroupId = `node_${nodeId}`
    if (state.hierarchicalThresholds.individual_node_groups?.[individualGroupId]?.[metric] !== undefined) {
      const value = state.hierarchicalThresholds.individual_node_groups[individualGroupId][metric]!
      console.log('🏷️ [DataSlice] Found individual node threshold:', { nodeId, metric, value })
      return value
    }

    // For semantic distance metrics, check parent group
    if (metric === 'semdist_mean') {
      // Extract splitting parent from node (e.g., "split_true_semdist_high" -> "split_true")
      const splittingParent = nodeId.match(/^(split_(?:true|false))/)?.[1]
      if (splittingParent && state.hierarchicalThresholds.semantic_distance_groups?.[splittingParent] !== undefined) {
        const value = state.hierarchicalThresholds.semantic_distance_groups[splittingParent]
        console.log('🌐 [DataSlice] Found semantic distance group threshold:', {
          nodeId,
          splittingParent,
          value
        })
        return value
      }
    }

    // For score metrics, check parent group
    if (['score_fuzz', 'score_simulation', 'score_detection'].includes(metric)) {
      // Extract semantic parent from score agreement node (e.g., "split_true_semdist_high_agree_all" -> "split_true_semdist_high")
      const semanticParent = nodeId.includes('_agree_')
        ? nodeId.split('_agree_')[0]
        : null

      if (semanticParent && state.hierarchicalThresholds.score_agreement_groups?.[semanticParent]?.[metric] !== undefined) {
        const value = state.hierarchicalThresholds.score_agreement_groups[semanticParent][metric]!
        console.log('📊 [DataSlice] Found score agreement group threshold:', {
          nodeId,
          semanticParent,
          metric,
          value
        })
        return value
      }
    }

    // Fallback to global thresholds
    if (state.hierarchicalThresholds.global_thresholds[metric] !== undefined) {
      const value = state.hierarchicalThresholds.global_thresholds[metric]
      console.log('🌍 [DataSlice] Found global threshold:', { metric, value })
      return value
    }

    // Handle score_fuzz ↔ score_high mapping for reading (legacy support)
    const mappedMetric = metric === 'score_fuzz' ? 'score_high' :
                        metric === 'score_high' ? 'score_fuzz' : null

    if (mappedMetric && state.hierarchicalThresholds.global_thresholds[mappedMetric] !== undefined) {
      const value = state.hierarchicalThresholds.global_thresholds[mappedMetric]
      console.log('🔄 [DataSlice] Found mapped threshold:', {
        originalMetric: metric,
        mappedMetric,
        value
      })
      return value
    }

    console.log('❌ [DataSlice] No threshold found, using default:', { metric, default: 0.5 })
    return 0.5
  },

  setThresholdGroup: (groupId, metric, threshold) => {
    console.log('🎯 [DataSlice] setThresholdGroup called:', { groupId, metric, threshold })

    const state = get()

    // Check if this is an individual node (starts with 'node_')
    const isIndividualNode = groupId.startsWith('node_')

    if (isIndividualNode) {
      // Individual node threshold - add to hierarchical individual_node_groups
      const nodeId = groupId.replace('node_', '')

      set((state) => {
        const updatedHierarchical = {
          ...state.hierarchicalThresholds,
          individual_node_groups: {
            ...state.hierarchicalThresholds.individual_node_groups,
            [groupId]: {
              ...state.hierarchicalThresholds.individual_node_groups?.[groupId],
              [metric]: threshold
            }
          }
        }

        console.log('🏷️ [DataSlice] Setting individual node threshold:', {
          nodeId,
          groupId,
          metric,
          threshold,
          updatedHierarchical
        })

        return {
          hierarchicalThresholds: updatedHierarchical
        }
      })
    } else {
      // Parent group threshold - update appropriate group in hierarchical structure
      set((state) => {
        const updatedHierarchical = { ...state.hierarchicalThresholds }

        if (metric === 'semdist_mean') {
          // Semantic distance group threshold
          updatedHierarchical.semantic_distance_groups = {
            ...state.hierarchicalThresholds.semantic_distance_groups,
            [groupId]: threshold
          }
          console.log('🌐 [DataSlice] Setting semantic distance group threshold:', {
            groupId,
            threshold
          })
        } else if (['score_fuzz', 'score_simulation', 'score_detection'].includes(metric)) {
          // Score agreement group threshold
          updatedHierarchical.score_agreement_groups = {
            ...state.hierarchicalThresholds.score_agreement_groups,
            [groupId]: {
              ...state.hierarchicalThresholds.score_agreement_groups?.[groupId],
              [metric]: threshold
            }
          }
          console.log('📊 [DataSlice] Setting score agreement group threshold:', {
            groupId,
            metric,
            threshold
          })
        }

        return {
          hierarchicalThresholds: updatedHierarchical
        }
      })
    }
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