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
  CategoryGroup
} from './types'
import { updateNodeThreshold, createRootOnlyTree, addStageToNode, removeStageFromNode } from './lib/threshold-utils'
import { PANEL_LEFT, PANEL_RIGHT, METRIC_SEMDIST_MEAN } from './lib/constants'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
  viewState: ViewState
}

interface ThresholdSelection {
  id: string
  metricType: string
  barIndices: number[]
  thresholdRange: { min: number; max: number }
  color: string
  timestamp: number
}

interface ThresholdGroup {
  id: string
  name: string
  selections: ThresholdSelection[]
  visible: boolean
  timestamp: number
}

interface ActiveSelection {
  startPoint: { x: number; y: number } | null
  endPoint: { x: number; y: number } | null
  rect: { x: number; y: number; width: number; height: number } | null
}

interface AppState {
  // Data state - now split for left and right panels
  leftPanel: PanelState
  rightPanel: PanelState

  // Shared state
  filterOptions: FilterOptions | null
  currentMetric: MetricType
  popoverState: PopoverState
  loading: LoadingStates & { sankeyLeft?: boolean; sankeyRight?: boolean; histogramPanel?: boolean }
  errors: ErrorStates & { sankeyLeft?: string | null; sankeyRight?: string | null; histogramPanel?: string | null }

  // Histogram panel data
  histogramPanelData: Record<string, HistogramData> | null

  // Selection mode state
  selectionMode: boolean
  selections: ThresholdSelection[]  // Keep for backwards compatibility
  activeSelection: ActiveSelection | null

  // Threshold group management
  thresholdGroups: ThresholdGroup[]
  pendingGroup: ThresholdSelection[]
  isCreatingGroup: boolean
  showGroupNameInput: boolean
  editingGroupId: string | null

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
  fetchHistogramPanelData: () => Promise<void>

  // View state actions - now take panel parameter
  showVisualization: (panel?: PanelSide) => void
  editFilters: (panel?: PanelSide) => void
  removeVisualization: (panel?: PanelSide) => void
  resetFilters: (panel?: PanelSide) => void

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Selection mode actions
  setSelectionMode: (enabled: boolean) => void
  startSelection: (x: number, y: number) => void
  updateSelection: (x: number, y: number) => void
  completeSelection: (metricType: string, barIndices: number[], thresholdRange: { min: number; max: number }) => void
  removeSelection: (id: string) => void
  clearAllSelections: () => void

  // Threshold group actions
  startGroupCreation: () => void
  finishGroupCreation: (name: string) => void
  cancelGroupCreation: () => void
  toggleGroupVisibility: (groupId: string) => void
  deleteGroup: (groupId: string) => void
  setShowGroupNameInput: (show: boolean) => void
  removeThresholdForMetric: (metricType: string) => void

  // Reset actions
  reset: () => void

  // Auto-initialization with default filters
  // DEFAULT APPROACH: Auto-initialize with first two LLM Explainers (subject to change)
  initializeWithDefaultFilters: () => void

  // Category group state
  categoryGroups: CategoryGroup[]

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
    comparison: false,
    histogramPanel: false
  },
  errors: {
    filters: null,
    histogram: null,
    sankey: null,
    sankeyLeft: null,
    sankeyRight: null,
    comparison: null,
    histogramPanel: null
  },

  // Histogram panel data
  histogramPanelData: null,

  // Selection mode state
  selectionMode: false,
  selections: [],
  activeSelection: null,

  // Threshold group management
  thresholdGroups: [],
  pendingGroup: [],
  isCreatingGroup: false,
  showGroupNameInput: false,
  editingGroupId: null,

  // Alluvial flows
  alluvialFlows: null,

  // Hover state
  hoveredAlluvialNodeId: null,
  hoveredAlluvialPanel: null,

  // Category group state
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

  fetchHistogramPanelData: async () => {
    const state = get()
    state.setLoading('histogramPanel' as any, true)
    state.clearError('histogramPanel' as any)

    try {
      // Define the metrics to fetch with their averaging configurations
      const metricsToFetch = [
        { metric: 'feature_splitting' as MetricType, averageBy: null },
        { metric: 'semdist_mean' as MetricType, averageBy: 'llm_explainer' },
        { metric: 'score_embedding' as MetricType, averageBy: 'llm_scorer' },
        { metric: 'score_fuzz' as MetricType, averageBy: 'llm_scorer' },
        { metric: 'score_detection' as MetricType, averageBy: 'llm_scorer' }
      ]

      // Fetch all histograms in parallel
      const histogramPromises = metricsToFetch.map(async ({ metric, averageBy }) => {
        const request = {
          filters: {
            sae_id: [],
            explanation_method: [],
            llm_explainer: [],
            llm_scorer: []
          },
          metric,
          ...(averageBy && { averageBy }), // Only include averageBy if it's not null
          ...(metric.startsWith('score_') && { fixedDomain: [0.0, 1.0] }) // Fixed domain for score metrics
        }

        console.log('[HistogramPanel] Sending request:', JSON.stringify(request, null, 2))
        const data = await api.getHistogramData(request)
        return { [metric]: data }
      })

      const results = await Promise.all(histogramPromises)
      const combinedData = results.reduce((acc, result) => ({ ...acc, ...result }), {})

      set({ histogramPanelData: combinedData })
      state.setLoading('histogramPanel' as any, false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram panel data'
      state.setError('histogramPanel' as any, errorMessage)
      state.setLoading('histogramPanel' as any, false)
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

  // Category group actions
  initializeCategoryGroups: () => {
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
  },

  // Selection mode actions
  setSelectionMode: (enabled) => {
    set(() => ({
      selectionMode: enabled,
      activeSelection: enabled ? null : null // Clear active selection when toggling off
    }))
  },

  startSelection: (x, y) => {
    set(() => ({
      activeSelection: {
        startPoint: { x, y },
        endPoint: null,
        rect: null
      }
    }))
  },

  updateSelection: (x, y) => {
    set((state) => {
      if (!state.activeSelection?.startPoint) return state

      const startX = Math.min(state.activeSelection.startPoint.x, x)
      const startY = Math.min(state.activeSelection.startPoint.y, y)
      const width = Math.abs(x - state.activeSelection.startPoint.x)
      const height = Math.abs(y - state.activeSelection.startPoint.y)

      return {
        activeSelection: {
          ...state.activeSelection,
          endPoint: { x, y },
          rect: { x: startX, y: startY, width, height }
        }
      }
    })
  },

  completeSelection: (metricType, barIndices, thresholdRange) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    const state = get()

    // Determine color index based on whether we're creating/editing a group or not
    const existingCount = (state.isCreatingGroup || state.editingGroupId)
      ? state.pendingGroup.length
      : state.selections.length
    const colorIndex = existingCount % colors.length

    const newSelection = {
      id: `sel_${Date.now()}`,
      metricType,
      barIndices,
      thresholdRange,
      color: colors[colorIndex],
      timestamp: Date.now()
    }

    set((state) => {
      if (state.editingGroupId) {
        // Editing existing group: Update pendingGroup and immediately save to group
        const updatedPendingGroup = [
          ...state.pendingGroup.filter(s => s.metricType !== metricType),
          newSelection
        ]

        return {
          pendingGroup: updatedPendingGroup,
          thresholdGroups: state.thresholdGroups.map(g =>
            g.id === state.editingGroupId
              ? { ...g, selections: updatedPendingGroup }
              : g
          ),
          activeSelection: null
        }
      } else if (state.isCreatingGroup) {
        // Add to pending group, replacing existing selection for same metric
        return {
          pendingGroup: [
            ...state.pendingGroup.filter(s => s.metricType !== metricType),
            newSelection
          ],
          activeSelection: null
        }
      } else {
        // Old behavior for backwards compatibility
        return {
          selections: [
            ...state.selections.filter(s => s.metricType !== metricType),
            newSelection
          ],
          activeSelection: null
        }
      }
    })
  },

  removeSelection: (id) => {
    set((state) => ({
      selections: state.selections.filter(s => s.id !== id)
    }))
  },

  clearAllSelections: () => {
    set(() => ({
      selections: [],
      activeSelection: null
    }))
  },

  // Threshold group actions
  startGroupCreation: () => {
    const state = get()

    // If editing a group, cancel that first
    const updates: any = {
      isCreatingGroup: true,
      selectionMode: true,
      pendingGroup: [],
      showGroupNameInput: false,
      editingGroupId: null  // Clear editing state
    }

    // Hide the group that was being edited
    if (state.editingGroupId) {
      updates.thresholdGroups = state.thresholdGroups.map(g =>
        g.id === state.editingGroupId ? { ...g, visible: false } : g
      )
    }

    set(updates)
  },

  finishGroupCreation: (name: string) => {
    const state = get()
    if (state.pendingGroup.length === 0 || !name.trim()) {
      // Cancel if no selections or empty name
      set(() => ({
        isCreatingGroup: false,
        selectionMode: false,
        pendingGroup: [],
        showGroupNameInput: false
      }))
      return
    }

    const newGroup: ThresholdGroup = {
      id: `group_${Date.now()}`,
      name: name.trim(),
      selections: [...state.pendingGroup],
      visible: false, // Start with visualizations hidden
      timestamp: Date.now()
    }

    set(() => ({
      thresholdGroups: [...state.thresholdGroups, newGroup],
      isCreatingGroup: false,
      selectionMode: false,
      pendingGroup: [],
      showGroupNameInput: false,
      selections: [] // Clear old selections when we have groups
    }))
  },

  cancelGroupCreation: () => {
    set(() => ({
      isCreatingGroup: false,
      selectionMode: false,
      pendingGroup: [],
      showGroupNameInput: false
    }))
  },

  toggleGroupVisibility: (groupId: string) => {
    const state = get()
    const group = state.thresholdGroups.find(g => g.id === groupId)

    if (!group) return

    if (!group.visible) {
      // Showing group: Enable edit mode
      set({
        thresholdGroups: state.thresholdGroups.map(g =>
          g.id === groupId ? { ...g, visible: true } : g
        ),
        editingGroupId: groupId,
        selectionMode: true,
        pendingGroup: [...group.selections],
        // Cancel any ongoing group creation
        isCreatingGroup: false,
        showGroupNameInput: false
      })
    } else {
      // Hiding group: Disable edit mode
      set({
        thresholdGroups: state.thresholdGroups.map(g =>
          g.id === groupId ? { ...g, visible: false } : g
        ),
        editingGroupId: null,
        selectionMode: false,
        pendingGroup: []
      })
    }
  },

  deleteGroup: (groupId: string) => {
    set((state) => ({
      thresholdGroups: state.thresholdGroups.filter(group => group.id !== groupId)
    }))
  },

  setShowGroupNameInput: (show: boolean) => {
    set(() => ({
      showGroupNameInput: show
    }))
  },

  removeThresholdForMetric: (metricType: string) => {
    const state = get()

    if (state.editingGroupId) {
      // Editing mode: Remove from pendingGroup and update the group
      const updatedPendingGroup = state.pendingGroup.filter(s => s.metricType !== metricType)

      set({
        pendingGroup: updatedPendingGroup,
        thresholdGroups: state.thresholdGroups.map(g =>
          g.id === state.editingGroupId
            ? { ...g, selections: updatedPendingGroup }
            : g
        )
      })
    } else if (state.isCreatingGroup) {
      // Creating mode: Remove from pendingGroup
      set({
        pendingGroup: state.pendingGroup.filter(s => s.metricType !== metricType)
      })
    }
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore