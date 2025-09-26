import { create } from 'zustand'
import * as api from './api'
import type {
  Filters,
  ThresholdTree,
  FilterOptions,
  HistogramData,
  SankeyData,
  MetricType,
  PopoverState,
  ViewState,
  LoadingStates,
  ErrorStates,
  AlluvialFlow,
  SankeyNode
} from './types'
import { buildDefaultTree, updateNodeThreshold } from './lib/threshold-utils'

type PanelSide = 'left' | 'right'

interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
  viewState: ViewState
}

interface AppState {
  // Data state - now split for left and right panels
  leftPanel: PanelState
  rightPanel: PanelState

  // Shared state
  filterOptions: FilterOptions | null
  currentMetric: MetricType
  popoverState: PopoverState
  loading: LoadingStates & { sankeyLeft?: boolean; sankeyRight?: boolean }
  errors: ErrorStates & { sankeyLeft?: string | null; sankeyRight?: string | null }

  // Data actions - now take panel parameter
  setFilters: (filters: Partial<Filters>, panel?: PanelSide) => void
  // New threshold tree actions
  updateThreshold: (nodeId: string, thresholds: number[], panel?: PanelSide) => void
  resetThresholdTree: (panel?: PanelSide) => void
  setCurrentMetric: (metric: MetricType) => void
  setHistogramData: (data: Record<string, HistogramData> | null, panel?: PanelSide) => void
  setSankeyData: (data: SankeyData | null, panel?: PanelSide) => void

  // UI actions - now take panel parameter
  setViewState: (state: ViewState, panel?: PanelSide) => void
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string,
    panel?: PanelSide
  ) => void
  hideHistogramPopover: () => void
  setLoading: (key: keyof LoadingStates, value: boolean) => void
  setError: (key: keyof ErrorStates, error: string | null) => void
  clearError: (key: keyof ErrorStates) => void

  // API actions - now take panel parameter
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (metric?: MetricType, nodeId?: string, panel?: PanelSide) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string, panel?: PanelSide) => Promise<void>
  fetchSankeyData: (panel?: PanelSide) => Promise<void>

  // View state actions - now take panel parameter
  showVisualization: (panel?: PanelSide) => void
  editFilters: (panel?: PanelSide) => void
  removeVisualization: (panel?: PanelSide) => void
  resetFilters: (panel?: PanelSide) => void

  // Utility functions
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => any[]

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Reset actions
  reset: () => void

  // Legacy compatibility getters for backward compatibility
  // These delegate to leftPanel for backward compatibility - use panel-specific access in new code
  filters: Filters
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null
  viewState: ViewState
}

const createInitialPanelState = (): PanelState => {
  const defaultTree = buildDefaultTree()
  return {
    filters: {
      sae_id: [],
      explanation_method: [],
      llm_explainer: [],
      llm_scorer: []
    },
    thresholdTree: defaultTree,
    sankeyData: null,
    histogramData: null,
    viewState: 'empty' as ViewState
  }
}

const initialState = {
  // Panel states
  leftPanel: createInitialPanelState(),
  rightPanel: createInitialPanelState(),

  // Shared state
  filterOptions: null,
  currentMetric: 'semdist_mean' as MetricType,
  popoverState: {
    histogram: null
  },
  loading: {
    filters: false,
    histogram: false,
    sankey: false,
    sankeyLeft: false,
    sankeyRight: false,
    comparison: false
  },
  errors: {
    filters: null,
    histogram: null,
    sankey: null,
    sankeyLeft: null,
    sankeyRight: null,
    comparison: null
  },

  // Alluvial flows
  alluvialFlows: null
}

export const useStore = create<AppState>((set, get) => ({
  ...initialState,

  // Legacy compatibility getters
  get filters() {
    return get().leftPanel.filters
  },
  get thresholdTree() {
    return get().leftPanel.thresholdTree
  },
  get histogramData() {
    return get().leftPanel.histogramData
  },
  get sankeyData() {
    return get().leftPanel.sankeyData
  },
  get viewState() {
    return get().leftPanel.viewState
  },

  // Data actions
  setFilters: (newFilters, panel = 'left') => {
    set((state) => ({
      [panel === 'left' ? 'leftPanel' : 'rightPanel']: {
        ...state[panel === 'left' ? 'leftPanel' : 'rightPanel'],
        filters: { ...state[panel === 'left' ? 'leftPanel' : 'rightPanel'].filters, ...newFilters },
        histogramData: null,
        sankeyData: null
      }
    }))
  },



  // NEW THRESHOLD TREE ACTIONS
  updateThreshold: (nodeId, thresholds, panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => {
      const currentTree = state[panelKey].thresholdTree
      const updatedTree = updateNodeThreshold(currentTree, nodeId, thresholds)

      return {
        [panelKey]: {
          ...state[panelKey],
          thresholdTree: updatedTree
        }
      }
    })
  },

  resetThresholdTree: (panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    const defaultTree = buildDefaultTree()

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        thresholdTree: defaultTree
      }
    }))
  },

  setCurrentMetric: (metric) => {
    set(() => ({ currentMetric: metric }))
  },

  setHistogramData: (data, panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        histogramData: data
      }
    }))
  },

  setSankeyData: (data, panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyData: data
      }
    }))
  },

  // UI actions
  setViewState: (newState, panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: newState
      }
    }))
  },

  showHistogramPopover: (nodeId, nodeName, metrics, position, parentNodeId, parentNodeName, panel = 'left') => {
    set(() => ({
      popoverState: {
        histogram: {
          nodeId,
          nodeName,
          parentNodeId,
          parentNodeName,
          metrics,
          position,
          visible: true,
          panel
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

  fetchHistogramData: async (metric?: MetricType, nodeId?: string, panel = 'left') => {
    const state = get()
    const targetMetric = metric || state.currentMetric
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    const { filters } = state[panelKey]

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

      state.setHistogramData({ [targetMetric]: histogramData }, panel)

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  fetchMultipleHistogramData: async (metrics, nodeId?: string, panel = 'left') => {
    const state = get()
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    const { filters } = state[panelKey]

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

      state.setHistogramData(combinedData, panel)

      // DEPRECATED: Legacy auto-threshold-update logic (commented out)
      // In the new tree system, thresholds are set explicitly by users via histogram popovers
      // This auto-update behavior is no longer needed and could be confusing
      // TODO: Remove after confirming new system works as expected
      //
      // const newThresholds: Partial<Thresholds> = {}
      // for (const metric of metrics) {
      //   const data = combinedData[metric]
      //   if (data && data.statistics && data.statistics.mean !== undefined) {
      //     if (metric === 'score_fuzz') {
      //       newThresholds.score_fuzz = data.statistics.mean
      //     } else if (metric in state[panelKey].hierarchicalThresholds.global_thresholds) {
      //       newThresholds[metric as keyof Thresholds] = data.statistics.mean
      //     }
      //   }
      // }
      // if (Object.keys(newThresholds).length > 0) {
      //   state.setGlobalThresholds(newThresholds, panel)
      // }

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  fetchSankeyData: async (panel = 'left') => {
    const state = get()
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    const { filters, thresholdTree } = state[panelKey]
    const loadingKey = panel === 'left' ? 'sankeyLeft' : 'sankeyRight' as keyof LoadingStates
    const errorKey = panel === 'left' ? 'sankeyLeft' : 'sankeyRight' as keyof ErrorStates

    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      const requestData = {
        filters,
        thresholdTree
      }

      const sankeyData = await api.getSankeyData(requestData)

      state.setSankeyData(sankeyData, panel)
      state.setLoading(loadingKey, false)
      // For backward compatibility
      if (panel === 'left') {
        state.setLoading('sankey', false)
      }

      // Update alluvial flows after successful data fetch
      state.updateAlluvialFlows()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Sankey data'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      if (panel === 'left') {
        state.setError('sankey', errorMessage)
        state.setLoading('sankey', false)
      }
    }
  },

  // View state actions
  showVisualization: (panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'visualization'
      }
    }))
  },

  editFilters: (panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'filtering'
      }
    }))
  },

  removeVisualization: (panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'empty',
        sankeyData: null,
        histogramData: null
      }
    }))
  },

  resetFilters: (panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [],
          llm_scorer: []
        },
        sankeyData: null,
        histogramData: null
      }
    }))
  },

  // Utility functions
  getNodesInSameThresholdGroup: (_nodeId: string, _metric: MetricType) => {
    // Simplified implementation - return empty array for now
    // In the original complex system, this would return nodes that share threshold groups
    return []
  },

  // Update alluvial flows from both panel data
  updateAlluvialFlows: () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    console.log('🌊 Computing alluvial flows...', {
      leftData: !!leftPanel.sankeyData,
      rightData: !!rightPanel.sankeyData
    })

    // Return null if either panel doesn't have visualization data
    if (!leftPanel.sankeyData || !rightPanel.sankeyData) {
      console.log('❌ Missing panel data')
      set({ alluvialFlows: null })
      return
    }

    // Extract final nodes (stage 3) with feature IDs from both panels
    const leftFinalNodes = leftPanel.sankeyData.nodes.filter((node: SankeyNode) =>
      node.stage === 3 && node.feature_ids && node.feature_ids.length > 0
    )
    const rightFinalNodes = rightPanel.sankeyData.nodes.filter((node: SankeyNode) =>
      node.stage === 3 && node.feature_ids && node.feature_ids.length > 0
    )

    console.log('🔍 Final Nodes Debug:', {
      leftFinalNodes: leftFinalNodes.length,
      rightFinalNodes: rightFinalNodes.length
    })

    // If no final nodes with feature IDs, return empty array
    if (leftFinalNodes.length === 0 || rightFinalNodes.length === 0) {
      console.log('❌ No final nodes with feature IDs found')
      set({ alluvialFlows: [] })
      return
    }

    // Generate flows by finding overlapping feature IDs
    const flows: AlluvialFlow[] = []

    for (const leftNode of leftFinalNodes) {
      for (const rightNode of rightFinalNodes) {
        if (!leftNode.feature_ids || !rightNode.feature_ids) continue

        // Find common features between left and right nodes
        const commonFeatures = leftNode.feature_ids.filter(id =>
          rightNode.feature_ids!.includes(id)
        )

        if (commonFeatures.length > 0) {
          // Extract category names from node IDs for consistency analysis
          const leftCategory = leftNode.id.split('_').slice(-1)[0] // Last part after final underscore
          const rightCategory = rightNode.id.split('_').slice(-1)[0]

          flows.push({
            source: leftNode.id,
            target: rightNode.id,
            value: commonFeatures.length,
            feature_ids: commonFeatures,
            sourceCategory: leftCategory,
            targetCategory: rightCategory
          })
        }
      }
    }

    console.log('✅ Generated flows:', {
      flowCount: flows.length,
      sampleFlow: flows[0] ? {
        source: flows[0].source,
        target: flows[0].target,
        value: flows[0].value,
        sourceCategory: flows[0].sourceCategory,
        targetCategory: flows[0].targetCategory
      } : null
    })

    set({ alluvialFlows: flows })
  },

  reset: () => {
    set(() => ({
      ...initialState,
      leftPanel: createInitialPanelState(),
      rightPanel: createInitialPanelState()
    }))
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore