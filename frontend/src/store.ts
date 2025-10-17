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
  LoadingStates,
  ErrorStates,
  AlluvialFlow,
  SankeyNode,
  NodeCategory,
  AddStageConfig,
  ConsistencyType,
  SortBy,
  SortDirection
} from './types'
import { updateNodeThreshold, createRootOnlyTree, addStageToNode, removeStageFromNode } from './lib/threshold-utils'
import { PANEL_LEFT, PANEL_RIGHT, METRIC_SEMSIM_MEAN } from './lib/constants'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
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

  // Hover state for cross-component highlighting
  hoveredAlluvialNodeId: string | null
  hoveredAlluvialPanel: 'left' | 'right' | null
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) => void

  // Comparison view state
  showComparisonView: boolean
  toggleComparisonView: () => void

  // Data actions - now take panel parameter
  setFilters: (filters: Partial<Filters>, panel?: PanelSide) => void
  // New threshold tree actions
  updateThreshold: (nodeId: string, thresholds: number[], panel?: PanelSide, metric?: string) => void
  // Dynamic tree actions
  addStageToTree: (nodeId: string, config: AddStageConfig, panel?: PanelSide) => void
  removeStageFromTree: (nodeId: string, panel?: PanelSide) => void
  resetToRootOnlyTree: (panel?: PanelSide) => void
  setCurrentMetric: (metric: MetricType) => void
  setHistogramData: (data: Record<string, HistogramData> | null, panel?: PanelSide) => void
  setSankeyData: (data: SankeyData | null, panel?: PanelSide) => void

  // UI actions - now take panel parameter
  showHistogramPopover: (
    nodeId: string | undefined,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string,
    panel?: PanelSide,
    nodeCategory?: NodeCategory
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
  resetFilters: (panel?: PanelSide) => void

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Table data
  tableData: any | null

  // Table data actions
  fetchTableData: () => Promise<void>

  // Table scroll state
  tableScrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null
  setTableScrollState: (state: { scrollTop: number; scrollHeight: number; clientHeight: number } | null) => void

  // Table sort state
  tableSortBy: SortBy | null
  tableSortDirection: SortDirection | null
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null) => void

  // Consistency type selection (Table Panel)
  selectedConsistencyType: ConsistencyType
  setConsistencyType: (type: ConsistencyType) => void

  // Reset actions
  reset: () => void

  // Auto-initialization with default filters
  // DEFAULT APPROACH: Auto-initialize with first two LLM Explainers (subject to change)
  initializeWithDefaultFilters: () => void
}

const createInitialPanelState = (): PanelState => {
  const rootOnlyTree = createRootOnlyTree() // Start with just the root node
  return {
    filters: {
      sae_id: [],
      explanation_method: [],
      llm_explainer: [],
      llm_scorer: []
    },
    thresholdTree: rootOnlyTree,
    sankeyData: null,
    histogramData: null
  }
}

const initialState = {
  // Panel states
  leftPanel: createInitialPanelState(),
  rightPanel: createInitialPanelState(),

  // Shared state
  filterOptions: null,
  currentMetric: METRIC_SEMSIM_MEAN as MetricType,
  popoverState: {
    histogram: null
  },
  loading: {
    filters: false,
    histogram: false,
    sankey: false,
    sankeyLeft: false,
    sankeyRight: false,
    comparison: false,
    table: false
  },
  errors: {
    filters: null,
    histogram: null,
    sankey: null,
    sankeyLeft: null,
    sankeyRight: null,
    comparison: null,
    table: null
  },

  // Alluvial flows
  alluvialFlows: null,

  // Table data
  tableData: null,

  // Table scroll state
  tableScrollState: null,

  // Table sort state
  tableSortBy: null,
  tableSortDirection: null,

  // Consistency type selection (Table Panel)
  selectedConsistencyType: 'none' as ConsistencyType,

  // Hover state
  hoveredAlluvialNodeId: null,
  hoveredAlluvialPanel: null,

  // Comparison view state
  showComparisonView: false
}

export const useStore = create<AppState>((set, get) => ({
  ...initialState,

  // Hover state actions
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) =>
    set({ hoveredAlluvialNodeId: nodeId, hoveredAlluvialPanel: panel }),

  // Comparison view actions
  toggleComparisonView: () => {
    set((state) => ({ showComparisonView: !state.showComparisonView }))
  },

  // Data actions
  setFilters: (newFilters, panel = PANEL_LEFT) => {
    set((state) => ({
      [panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel']: {
        ...state[panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'],
        filters: { ...state[panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'].filters, ...newFilters },
        histogramData: null,
        sankeyData: null
      }
    }))
  },

  // NEW THRESHOLD TREE ACTIONS
  updateThreshold: (nodeId, thresholds, panel = PANEL_LEFT, metric) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => {
      const currentTree = state[panelKey].thresholdTree
      const updatedTree = updateNodeThreshold(currentTree, nodeId, thresholds, metric)

      return {
        [panelKey]: {
          ...state[panelKey],
          thresholdTree: updatedTree
        }
      }
    })
  },


  // DYNAMIC TREE ACTIONS
  addStageToTree: (nodeId, config, panel = PANEL_LEFT) => {
    console.log('[Store.addStageToTree] Called with nodeId:', nodeId, 'stageType:', config.stageType, 'panel:', panel)
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'

    set((state) => {
      try {
        const currentTree = state[panelKey].thresholdTree
        console.log('[Store.addStageToTree] Current tree nodes:', currentTree.nodes.length)

        const updatedTree = addStageToNode(currentTree, nodeId, config)
        console.log('[Store.addStageToTree] Updated tree nodes:', updatedTree.nodes.length)

        return {
          [panelKey]: {
            ...state[panelKey],
            thresholdTree: updatedTree,
            // Clear existing data to trigger refresh
            sankeyData: null,
            histogramData: null
          }
        }
      } catch (error) {
        console.error('[Store.addStageToTree] Failed to add stage to tree:', error)
        // Return unchanged state on error
        return state
      }
    })
  },

  removeStageFromTree: (nodeId, panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => {
      try {
        const currentTree = state[panelKey].thresholdTree
        const updatedTree = removeStageFromNode(currentTree, nodeId)

        return {
          [panelKey]: {
            ...state[panelKey],
            thresholdTree: updatedTree,
            // Clear existing data to trigger refresh
            sankeyData: null,
            histogramData: null
          },
          // Close histogram popover if it's open for the current panel
          popoverState: {
            histogram: state.popoverState.histogram?.panel === panel ? null : state.popoverState.histogram
          }
        }
      } catch (error) {
        console.error('Failed to remove stage from tree:', error)
        // Return unchanged state on error
        return state
      }
    })
  },

  resetToRootOnlyTree: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const rootOnlyTree = createRootOnlyTree()

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        thresholdTree: rootOnlyTree,
        // Clear existing data to trigger refresh
        sankeyData: null,
        histogramData: null
      }
    }))
  },

  setCurrentMetric: (metric) => {
    set(() => ({ currentMetric: metric }))
  },

  setHistogramData: (data, panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        histogramData: data
      }
    }))
  },

  setSankeyData: (data, panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyData: data
      }
    }))
  },

  // UI actions
  showHistogramPopover: (nodeId, nodeName, metrics, position, parentNodeId, parentNodeName, panel = PANEL_LEFT, nodeCategory) => {
    set(() => ({
      popoverState: {
        histogram: {
          nodeId,
          nodeName,
          nodeCategory,
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

  fetchHistogramData: async (metric?: MetricType, nodeId?: string, panel = PANEL_LEFT) => {
    const state = get()
    const targetMetric = metric || state.currentMetric
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, thresholdTree } = state[panelKey]

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
        nodeId,
        // Include thresholdTree when nodeId is provided for node-specific filtering
        ...(nodeId && { thresholdTree })
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

  fetchMultipleHistogramData: async (metrics, nodeId?: string, panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, thresholdTree } = state[panelKey]

    console.log('[HistogramPopover] fetchMultipleHistogramData called:', {
      metrics,
      nodeId,
      panel,
      filters
    })

    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      console.log('[HistogramPopover] No active filters, skipping request')
      return
    }

    state.setLoading('histogram', true)
    state.clearError('histogram')

    try {
      const histogramPromises = metrics.map(async (metric) => {
        const request = {
          filters,
          metric,
          nodeId,
          // Include thresholdTree when nodeId is provided for node-specific filtering
          ...(nodeId && { thresholdTree })
        }

        console.log('[HistogramPopover] Request for metric:', metric, request)

        const data = await api.getHistogramData(request)

        console.log('[HistogramPopover] Response for metric:', metric, {
          totalFeatures: data.total_features
        })

        return { [metric]: data }
      })

      const results = await Promise.all(histogramPromises)
      const combinedData = results.reduce((acc, result) => ({ ...acc, ...result }), {})

      state.setHistogramData(combinedData, panel)

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  fetchSankeyData: async (panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, thresholdTree } = state[panelKey]
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight' as keyof LoadingStates
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight' as keyof ErrorStates

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
        thresholdTree,
      }

      console.log('📤 Sending Sankey request:', {
        filters,
        thresholdTree: JSON.stringify(thresholdTree, null, 2),
      })

      const sankeyData = await api.getSankeyData(requestData)

      console.log('📥 Received Sankey response:', {
        nodes: sankeyData.nodes,
        links: sankeyData.links,
        metadata: sankeyData.metadata,
        nodeCount: sankeyData.nodes.length,
        linkCount: sankeyData.links.length
      })

      state.setSankeyData(sankeyData, panel)
      state.setLoading(loadingKey, false)
      // For backward compatibility
      if (panel === PANEL_LEFT) {
        state.setLoading('sankey', false)
      }

      // Update alluvial flows after successful data fetch
      state.updateAlluvialFlows()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Sankey data'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      if (panel === PANEL_LEFT) {
        state.setError('sankey', errorMessage)
        state.setLoading('sankey', false)
      }
    }
  },

  // View state actions
  showVisualization: (_panel = PANEL_LEFT) => {
    // This is now a no-op since we don't track view state anymore
    // Kept for backward compatibility with existing code
  },

  resetFilters: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
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

  // Update alluvial flows from both panel data
  updateAlluvialFlows: () => {
    const state = get()
    const { leftPanel, rightPanel } = state


    // Return null if either panel doesn't have visualization data
    if (!leftPanel.sankeyData || !rightPanel.sankeyData) {
      set({ alluvialFlows: null })
      return
    }

    // Extract leaf nodes (nodes with feature_ids) from both panels
    // Leaf nodes are identified by having feature_ids, not by stage number
    const leftFinalNodes = leftPanel.sankeyData.nodes.filter((node: SankeyNode) =>
      node.feature_ids && node.feature_ids.length > 0
    )
    const rightFinalNodes = rightPanel.sankeyData.nodes.filter((node: SankeyNode) =>
      node.feature_ids && node.feature_ids.length > 0
    )


    // If no final nodes with feature IDs, return empty array
    if (leftFinalNodes.length === 0 || rightFinalNodes.length === 0) {
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
          // Use the category field from nodes for proper stage comparison
          // This identifies the actual stage (root, feature_splitting, semantic_similarity, score_agreement)
          const leftCategory = leftNode.category
          const rightCategory = rightNode.category

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


    set({ alluvialFlows: flows })
  },

  // Fetch table data
  fetchTableData: async () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    // Collect all selected LLM explainers from both panels
    const explainers = new Set<string>()
    if (leftPanel.filters.llm_explainer) {
      leftPanel.filters.llm_explainer.forEach(e => explainers.add(e))
    }
    if (rightPanel.filters.llm_explainer) {
      rightPanel.filters.llm_explainer.forEach(e => explainers.add(e))
    }

    // Collect all selected LLM scorers from both panels
    const scorers = new Set<string>()
    if (leftPanel.filters.llm_scorer) {
      leftPanel.filters.llm_scorer.forEach(s => scorers.add(s))
    }
    if (rightPanel.filters.llm_scorer) {
      rightPanel.filters.llm_scorer.forEach(s => scorers.add(s))
    }

    // If no explainers selected, don't fetch
    if (explainers.size === 0) {
      set({ tableData: null })
      return
    }

    // Set loading state
    set(state => ({
      loading: { ...state.loading, table: true },
      errors: { ...state.errors, table: null }
    }))

    try {
      // Create filter with all selected explainers and scorers
      const filters = {
        sae_id: [],
        explanation_method: [],
        llm_explainer: Array.from(explainers),
        llm_scorer: Array.from(scorers)
      }

      const tableData = await api.getTableData({ filters })
      set(state => ({
        tableData,
        loading: { ...state.loading, table: false }
      }))
    } catch (error) {
      console.error('Failed to fetch table data:', error)
      set(state => ({
        tableData: null,
        loading: { ...state.loading, table: false },
        errors: { ...state.errors, table: error instanceof Error ? error.message : 'Failed to fetch table data' }
      }))
    }
  },

  // Set table scroll state
  setTableScrollState: (state) => {
    set({ tableScrollState: state })
  },

  // Set table sort state
  setTableSort: (sortBy, sortDirection) => {
    set({ tableSortBy: sortBy, tableSortDirection: sortDirection })
  },

  // Set consistency type for table panel
  setConsistencyType: (type: ConsistencyType) => {
    set({ selectedConsistencyType: type })
  },

  reset: () => {
    set(() => ({
      ...initialState,
      leftPanel: createInitialPanelState(),
      rightPanel: createInitialPanelState()
    }))
  },

  // DEFAULT APPROACH: Auto-initialize both panels with ALL LLM Explainers
  // This is a default configuration and is subject to change based on research needs
  initializeWithDefaultFilters: () => {
    const state = get()
    const { filterOptions } = state

    if (!filterOptions) {
      console.warn('Cannot initialize default filters: filterOptions not loaded')
      return
    }

    // Get LLM Explainers and Scorers
    const llmExplainers = filterOptions.llm_explainer || []
    const llmScorers = filterOptions.llm_scorer || []

    if (llmExplainers.length === 0) {
      console.warn('Cannot initialize default filters: no LLM Explainers available')
      return
    }

    console.log('🚀 Auto-initializing with default filters:', {
      leftLLMExplainers: llmExplainers,
      rightLLMExplainer: '(none - empty)',
      allLLMScorers: llmScorers
    })

    // Set filters: Left panel gets ALL LLM explainers, right panel stays empty
    set((state) => ({
      leftPanel: {
        ...state.leftPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: llmExplainers,  // Select ALL LLM Explainers
          llm_scorer: llmScorers  // Select ALL LLM Scorers
        }
      },
      rightPanel: {
        ...state.rightPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [],  // No explainer selected in right panel
          llm_scorer: llmScorers  // Select ALL LLM Scorers
        }
      }
    }))
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore
