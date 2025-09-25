import { create } from 'zustand'
import * as api from './api'
import type {
  Filters,
  Thresholds,
  HierarchicalThresholds,
  FilterOptions,
  HistogramData,
  SankeyData,
  MetricType,
  PopoverState,
  ViewState,
  LoadingStates,
  ErrorStates
} from './types'

interface AppState {
  // Data state
  filters: Filters
  filterOptions: FilterOptions | null
  hierarchicalThresholds: HierarchicalThresholds
  currentMetric: MetricType
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null

  // UI state
  viewState: ViewState
  popoverState: PopoverState
  loading: LoadingStates
  errors: ErrorStates

  // Data actions
  setFilters: (filters: Partial<Filters>) => void
  setGlobalThresholds: (thresholds: Partial<Thresholds>) => void
  setHierarchicalThresholds: (thresholds: Partial<Thresholds>, parentNodeId?: string) => void
  setCurrentMetric: (metric: MetricType) => void
  setHistogramData: (data: Record<string, HistogramData> | null) => void
  setSankeyData: (data: SankeyData | null) => void

  // UI actions
  setViewState: (state: ViewState) => void
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string
  ) => void
  hideHistogramPopover: () => void
  setLoading: (key: keyof LoadingStates, value: boolean) => void
  setError: (key: keyof ErrorStates, error: string | null) => void
  clearError: (key: keyof ErrorStates) => void

  // API actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (metric?: MetricType, nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string) => Promise<void>
  fetchSankeyData: () => Promise<void>

  // View state actions
  showVisualization: () => void
  editFilters: () => void
  removeVisualization: () => void
  resetFilters: () => void

  // Utility functions
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => any[]

  // Reset actions
  reset: () => void
}

const initialState = {
  // Data initial state
  filters: {
    sae_id: [],
    explanation_method: [],
    llm_explainer: [],
    llm_scorer: []
  },
  filterOptions: null,
  hierarchicalThresholds: {
    global_thresholds: {
      feature_splitting: 0.1,
      semdist_mean: 0.1,
      score_fuzz: 0.5,
      score_detection: 0.5,
      score_simulation: 0.2,
    }
  },
  currentMetric: 'semdist_mean' as MetricType,
  histogramData: null,
  sankeyData: null,

  // UI initial state
  viewState: 'empty' as ViewState,
  popoverState: {
    histogram: null
  },
  loading: {
    filters: false,
    histogram: false,
    sankey: false,
    comparison: false
  },
  errors: {
    filters: null,
    histogram: null,
    sankey: null,
    comparison: null
  }
}

export const useStore = create<AppState>((set, get) => ({
  ...initialState,

  // Data actions
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      histogramData: null,
      sankeyData: null
    }))
  },

  setGlobalThresholds: (newThresholds) => {
    set((state) => ({
      hierarchicalThresholds: {
        ...state.hierarchicalThresholds,
        global_thresholds: { ...state.hierarchicalThresholds.global_thresholds, ...newThresholds }
      }
    }))
  },

  setHierarchicalThresholds: (newThresholds, parentNodeId = 'global_thresholds') => {
    if (parentNodeId === 'global_thresholds') {
      set((state) => ({
        hierarchicalThresholds: {
          ...state.hierarchicalThresholds,
          global_thresholds: { ...state.hierarchicalThresholds.global_thresholds, ...newThresholds }
        }
      }))
    } else {
      // Check if we're setting score thresholds
      const isScoreThreshold = Object.keys(newThresholds).some(key =>
        key.startsWith('score_') || key === 'score_fuzz' || key === 'score_detection' || key === 'score_simulation'
      )

      if (isScoreThreshold) {
        // Use score_agreement_groups for score thresholds
        // The parentNodeId should be the semantic distance parent (e.g., split_true_semdist_low)
        set((state) => ({
          hierarchicalThresholds: {
            ...state.hierarchicalThresholds,
            score_agreement_groups: {
              ...state.hierarchicalThresholds.score_agreement_groups,
              [parentNodeId]: {
                ...state.hierarchicalThresholds.score_agreement_groups?.[parentNodeId],
                ...newThresholds
              }
            }
          }
        }))
      } else {
        // Use individual_node_groups for other thresholds (like semdist_mean)
        const nodeKey = parentNodeId.startsWith('node_') ? parentNodeId : `node_${parentNodeId}`

        set((state) => ({
          hierarchicalThresholds: {
            ...state.hierarchicalThresholds,
            individual_node_groups: {
              ...state.hierarchicalThresholds.individual_node_groups,
              [nodeKey]: {
                ...state.hierarchicalThresholds.individual_node_groups?.[nodeKey],
                ...newThresholds
              }
            }
          }
        }))
      }
    }
  },

  setCurrentMetric: (metric) => {
    set(() => ({ currentMetric: metric }))
  },

  setHistogramData: (data) => {
    set(() => ({ histogramData: data }))
  },

  setSankeyData: (data) => {
    set(() => ({ sankeyData: data }))
  },

  // UI actions
  setViewState: (newState) => {
    set(() => ({ viewState: newState }))
  },

  showHistogramPopover: (nodeId, nodeName, metrics, position, parentNodeId, parentNodeName) => {
    set(() => ({
      popoverState: {
        histogram: {
          nodeId,
          nodeName,
          parentNodeId,
          parentNodeName,
          metrics,
          position,
          visible: true
        }
      }
    }))
  },

  hideHistogramPopover: () => {
    set(() => ({
      popoverState: {
        histogram: null
      }
    }))
  },

  setLoading: (key, value) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [key]: value
      }
    }))
  },

  setError: (key, error) => {
    set((state) => ({
      errors: {
        ...state.errors,
        [key]: error
      }
    }))
  },

  clearError: (key) => {
    set((state) => ({
      errors: {
        ...state.errors,
        [key]: null
      }
    }))
  },

  // API actions
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
    }
  },

  fetchHistogramData: async (metric?: MetricType, nodeId?: string) => {
    const state = get()
    const targetMetric = metric || state.currentMetric
    const { filters } = state

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
        metric: targetMetric,
        bins: 20,
        nodeId
      }

      const histogramData = await api.getHistogramData(request)

      set(() => ({
        histogramData: { [targetMetric]: histogramData }
      }))

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  fetchMultipleHistogramData: async (metrics, nodeId?: string) => {
    const state = get()
    const { filters } = state

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

        const data = await api.getHistogramData(request)
        return { [metric]: data }
      })

      const results = await Promise.all(histogramPromises)
      const combinedData = results.reduce((acc, result) => ({ ...acc, ...result }), {})

      set(() => ({
        histogramData: combinedData
      }))

      // Update global thresholds with mean values from histogram data
      const newThresholds: Partial<Thresholds> = {}
      for (const metric of metrics) {
        const data = combinedData[metric]
        if (data && data.statistics && data.statistics.mean !== undefined) {
          if (metric === 'score_fuzz') {
            newThresholds.score_fuzz = data.statistics.mean
          } else if (metric in state.hierarchicalThresholds.global_thresholds) {
            newThresholds[metric as keyof Thresholds] = data.statistics.mean
          }
        }
      }

      if (Object.keys(newThresholds).length > 0) {
        state.setGlobalThresholds(newThresholds)
      }

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  fetchSankeyData: async () => {
    const state = get()
    const { filters, hierarchicalThresholds } = state

    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      return
    }

    state.setLoading('sankey', true)
    state.clearError('sankey')

    try {
      // Ensure complete global thresholds with all required fields
      const globalThresholds = hierarchicalThresholds.global_thresholds || {
        feature_splitting: 0.1,
        semdist_mean: 0.1,
        score_fuzz: 0.5,
        score_detection: 0.5,
        score_simulation: 0.2
      }

      // Extract groups from hierarchical thresholds
      const individualNodeGroups = hierarchicalThresholds.individual_node_groups || {}
      const scoreAgreementGroups = hierarchicalThresholds.score_agreement_groups || {}

      // Create backend-compatible hierarchical thresholds structure
      const backendHierarchicalThresholds = {
        global_thresholds: globalThresholds,
        ...(Object.keys(scoreAgreementGroups).length > 0 && {
          score_agreement_groups: scoreAgreementGroups
        }),
        ...(Object.keys(individualNodeGroups).length > 0 && {
          individual_node_groups: individualNodeGroups
        })
      }

      // Send only hierarchical thresholds (no legacy thresholds field)
      const request = {
        filters,
        hierarchicalThresholds: backendHierarchicalThresholds
      }

      const sankeyData = await api.getSankeyData(request)

      set(() => ({ sankeyData }))
      state.setLoading('sankey', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Sankey data'
      state.setError('sankey', errorMessage)
      state.setLoading('sankey', false)
    }
  },

  // View state actions
  showVisualization: () => {
    set(() => ({ viewState: 'visualization' }))
  },

  editFilters: () => {
    set(() => ({ viewState: 'filtering' }))
  },

  removeVisualization: () => {
    set(() => ({
      viewState: 'empty',
      sankeyData: null,
      histogramData: null
    }))
  },

  resetFilters: () => {
    set(() => ({
      filters: {
        sae_id: [],
        explanation_method: [],
        llm_explainer: [],
        llm_scorer: []
      },
      sankeyData: null,
      histogramData: null
    }))
  },

  // Utility functions
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => {
    // Simplified implementation - return empty array for now
    // In the original complex system, this would return nodes that share threshold groups
    return []
  },

  reset: () => {
    set(() => initialState)
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore