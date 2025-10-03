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
  SankeyNode,
  NodeCategory,
  AddStageConfig,
  SetVisualizationData,
  CategoryGroup
} from './types'
import { updateNodeThreshold, createRootOnlyTree, addStageToNode, removeStageFromNode, extractScoreThresholdsFromTree, updateScoreThresholdsInTree } from './lib/threshold-utils'
import { buildFlexibleScoreAgreementSplit } from './lib/split-rule-builders'
import { PANEL_LEFT, PANEL_RIGHT, METRIC_SEMDIST_MEAN, METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_SIMULATION } from './lib/constants'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

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

  // Hover state for cross-component highlighting
  hoveredAlluvialNodeId: string | null
  hoveredAlluvialPanel: 'left' | 'right' | null
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) => void

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
  setViewState: (state: ViewState, panel?: PanelSide) => void
  showHistogramPopover: (
    nodeId: string,
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
  editFilters: (panel?: PanelSide) => void
  removeVisualization: (panel?: PanelSide) => void
  resetFilters: (panel?: PanelSide) => void

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Reset actions
  reset: () => void

  // Auto-initialization with default filters
  // DEFAULT APPROACH: Auto-initialize with first two LLM Explainers (subject to change)
  initializeWithDefaultFilters: () => void

  // Set visualization state (linear diagram)
  selectedScoringMetrics: string[]
  scoringMetricThresholds: Record<string, number>
  setVisualizationData: SetVisualizationData | null
  categoryGroups: CategoryGroup[]

  // Set visualization actions
  toggleScoringMetric: (metric: string) => void
  setScoringMetricThreshold: (metric: string, threshold: number) => void
  fetchSetVisualizationData: () => Promise<void>

  // Category group actions
  initializeCategoryGroups: () => void
  addCategoryGroup: (name: string, columnIds: string[], color?: string) => void
  removeCategoryGroup: (groupId: string) => void
  updateCategoryGroup: (groupId: string, updates: Partial<CategoryGroup>) => void
  moveColumnToGroup: (columnId: string, fromGroupId: string, toGroupId: string) => void
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
  currentMetric: METRIC_SEMDIST_MEAN as MetricType,
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
  alluvialFlows: null,

  // Hover state
  hoveredAlluvialNodeId: null,
  hoveredAlluvialPanel: null,

  // Set visualization state
  selectedScoringMetrics: [METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_SIMULATION],
  scoringMetricThresholds: {
    [METRIC_SCORE_FUZZ]: 0.5,
    [METRIC_SCORE_DETECTION]: 0.5,  // Match Sankey default
    [METRIC_SCORE_SIMULATION]: 0.1, // Match Sankey default
    score_embedding: 0.5
  },
  setVisualizationData: null,
  categoryGroups: []
}

export const useStore = create<AppState>((set, get) => ({
  ...initialState,

  // Hover state actions
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) =>
    set({ hoveredAlluvialNodeId: nodeId, hoveredAlluvialPanel: panel }),

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

      // Extract score thresholds from updated tree and sync to Linear Set
      const scoreThresholds = extractScoreThresholdsFromTree(updatedTree)
      const updatedScoringMetricThresholds = {
        ...state.scoringMetricThresholds,
        ...scoreThresholds
      }

      return {
        [panelKey]: {
          ...state[panelKey],
          thresholdTree: updatedTree
        },
        scoringMetricThresholds: updatedScoringMetricThresholds
      }
    })

    // Fetch new Linear Set data if score metrics were updated
    if (metric?.startsWith('score_')) {
      get().fetchSetVisualizationData()
    }
  },


  // DYNAMIC TREE ACTIONS
  addStageToTree: (nodeId, config, panel = PANEL_LEFT) => {
    console.log('[Store.addStageToTree] Called with nodeId:', nodeId, 'stageType:', config.stageType, 'panel:', panel)
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'

    const currentState = get()
    console.log('[Store.addStageToTree] Current categoryGroups count:', currentState.categoryGroups.length)

    // Pass CategoryGroups through config for score_agreement stages
    const enhancedConfig = config.stageType === 'score_agreement' && currentState.categoryGroups.length > 0
      ? { ...config, customConfig: { categoryGroups: currentState.categoryGroups } }
      : config

    console.log('[Store.addStageToTree] Enhanced config with categoryGroups:', enhancedConfig.customConfig?.categoryGroups?.length || 0)

    set((state) => {
      try {
        const currentTree = state[panelKey].thresholdTree
        console.log('[Store.addStageToTree] Current tree nodes:', currentTree.nodes.length)

        const updatedTree = addStageToNode(currentTree, nodeId, enhancedConfig)
        console.log('[Store.addStageToTree] Updated tree nodes:', updatedTree.nodes.length)

        return {
          [panelKey]: {
            ...state[panelKey],
            thresholdTree: updatedTree,
            // Clear existing data to trigger refresh
            sankeyData: null,
            histogramData: null
          }
          // Do NOT sync tree → scoringMetricThresholds here
          // Flow is scoringMetricThresholds → tree (via config.thresholds)
        }
      } catch (error) {
        console.error('[Store.addStageToTree] Failed to add stage to tree:', error)
        // Return unchanged state on error
        return state
      }
    })

    // Fetch new Linear Set data if score_agreement stage was added
    if (config.stageType === 'score_agreement') {
      console.log('[Store.addStageToTree] Fetching set visualization data after adding score_agreement')
      get().fetchSetVisualizationData()
    }
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
  setViewState: (newState, panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: newState
      }
    }))
  },

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
          nodeId,
          // Include thresholdTree when nodeId is provided for node-specific filtering
          ...(nodeId && { thresholdTree })
        }

        const data = await api.getHistogramData(request)
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
  showVisualization: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'visualization'
      }
    }))
  },

  editFilters: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'filtering'
      }
    }))
  },

  removeVisualization: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const rootOnlyTree = createRootOnlyTree() // Reset to root-only tree for fresh start

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        viewState: 'empty',
        thresholdTree: rootOnlyTree, // Reset threshold tree to root-only
        sankeyData: null,
        histogramData: null
      }
    }))
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
          // This identifies the actual stage (root, feature_splitting, semantic_distance, score_agreement)
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

  reset: () => {
    set(() => ({
      ...initialState,
      leftPanel: createInitialPanelState(),
      rightPanel: createInitialPanelState()
    }))
  },

  // DEFAULT APPROACH: Auto-initialize both panels with first two LLM Explainers
  // This is a default configuration and is subject to change based on research needs
  initializeWithDefaultFilters: () => {
    const state = get()
    const { filterOptions } = state

    if (!filterOptions) {
      console.warn('Cannot initialize default filters: filterOptions not loaded')
      return
    }

    // Get first two LLM Explainers (or reuse first if only one exists)
    const llmExplainers = filterOptions.llm_explainer || []
    if (llmExplainers.length === 0) {
      console.warn('Cannot initialize default filters: no LLM Explainers available')
      return
    }

    const leftLLMExplainer = llmExplainers[0]
    const rightLLMExplainer = llmExplainers.length > 1 ? llmExplainers[1] : llmExplainers[0]

    console.log('🚀 Auto-initializing with default filters:', {
      leftLLMExplainer,
      rightLLMExplainer
    })

    // Set filters for both panels and transition to visualization state
    set((state) => ({
      leftPanel: {
        ...state.leftPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [leftLLMExplainer],
          llm_scorer: []
        },
        viewState: 'visualization' as ViewState
      },
      rightPanel: {
        ...state.rightPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [rightLLMExplainer],
          llm_scorer: []
        },
        viewState: 'visualization' as ViewState
      }
    }))
  },

  // Set visualization actions
  toggleScoringMetric: (metric: string) => {
    set((state) => {
      const currentMetrics = state.selectedScoringMetrics
      const isSelected = currentMetrics.includes(metric)

      const newMetrics = isSelected
        ? currentMetrics.filter(m => m !== metric)
        : [...currentMetrics, metric]

      return { selectedScoringMetrics: newMetrics }
    })

    // Fetch new set visualization data after toggling
    get().fetchSetVisualizationData()
  },

  setScoringMetricThreshold: (metric: string, threshold: number) => {
    set((state) => {
      // Update scoring metric thresholds
      const updatedScoringMetricThresholds = {
        ...state.scoringMetricThresholds,
        [metric]: threshold
      }

      // Update threshold trees in both panels to reflect new score thresholds
      const updatedLeftTree = updateScoreThresholdsInTree(
        state.leftPanel.thresholdTree,
        updatedScoringMetricThresholds
      )
      const updatedRightTree = updateScoreThresholdsInTree(
        state.rightPanel.thresholdTree,
        updatedScoringMetricThresholds
      )

      return {
        scoringMetricThresholds: updatedScoringMetricThresholds,
        leftPanel: {
          ...state.leftPanel,
          thresholdTree: updatedLeftTree,
          sankeyData: null  // Clear to trigger refresh
        },
        rightPanel: {
          ...state.rightPanel,
          thresholdTree: updatedRightTree,
          sankeyData: null  // Clear to trigger refresh
        }
      }
    })

    // Fetch new visualization data
    get().fetchSetVisualizationData()
    get().fetchSankeyData('left')
    get().fetchSankeyData('right')
  },

  fetchSetVisualizationData: async () => {
    const state = get()
    const { selectedScoringMetrics, scoringMetricThresholds } = state

    if (selectedScoringMetrics.length === 0) {
      // No metrics selected, clear visualization data
      set({ setVisualizationData: null })
      return
    }

    try {
      // Build pattern rule using selected metrics and thresholds
      const thresholds = selectedScoringMetrics.map(m => scoringMetricThresholds[m] || 0.5)
      const patternRule = buildFlexibleScoreAgreementSplit(selectedScoringMetrics, thresholds)

      // Call API with empty filters (all data) and pattern rule
      const data = await api.getSetVisualizationData({
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [],
          llm_scorer: []
        },
        pattern_rule: patternRule
      })

      set({ setVisualizationData: data })
    } catch (error) {
      console.error('Failed to fetch set visualization data:', error)
      set({ setVisualizationData: null })
    }
  },

  // Category group actions
  initializeCategoryGroups: () => {
    // Will be called from LinearSetDiagram when columns are available
    set({ categoryGroups: [] })
  },

  addCategoryGroup: (name: string, columnIds: string[], color: string = '#e5e7eb') => {
    const state = get()
    const newGroupIndex = state.categoryGroups.length
    const newGroup: CategoryGroup = {
      id: `group_${newGroupIndex}`,
      name,
      columnIds,
      color
    }
    set({ categoryGroups: [...state.categoryGroups, newGroup] })
  },

  removeCategoryGroup: (groupId: string) => {
    const state = get()
    set({ categoryGroups: state.categoryGroups.filter(g => g.id !== groupId) })
  },

  updateCategoryGroup: (groupId: string, updates: Partial<CategoryGroup>) => {
    const state = get()
    set({
      categoryGroups: state.categoryGroups.map(g =>
        g.id === groupId ? { ...g, ...updates } : g
      )
    })
  },

  moveColumnToGroup: (columnId: string, fromGroupId: string, toGroupId: string) => {
    const state = get()
    set({
      categoryGroups: state.categoryGroups.map(g => {
        if (g.id === fromGroupId) {
          return { ...g, columnIds: g.columnIds.filter(id => id !== columnId) }
        }
        if (g.id === toGroupId) {
          return { ...g, columnIds: [...g.columnIds, columnId] }
        }
        return g
      })
    })
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore