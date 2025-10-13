import { create } from 'zustand'
import * as api from './api'
import { getFeaturesInThreshold } from './api'
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
import { PANEL_LEFT, PANEL_RIGHT, METRIC_SEMSIM_MEAN, getMetricColor } from './lib/constants'
import { convertThresholdGroupsToTree } from './lib/threshold-group-converter'

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
  featureIds: number[]  // Feature IDs within this threshold range
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
  histogramPanelFilteredFeatureIds: number[] | null  // Track filtering state

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

  // Global LLM selection (primary filter for all components)
  selectedLLMExplainers: string[]  // Empty array = all explainers
  selectedLLMScorers: string[]     // Empty array = all scorers

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
  fetchFilteredHistogramPanelData: (featureIds: number[]) => Promise<void>

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
  completeSelection: (metricType: string, barIndices: number[], thresholdRange: { min: number; max: number }) => Promise<void>
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
  applyThresholdGroupsToSankey: () => void

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

  // LLM selection actions
  setLLMSelection: (explainers: string[], scorers: string[]) => void
  assignLLMExplainersToPanels: (explainers: string[]) => void
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
  histogramPanelFilteredFeatureIds: null,

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

  // Global LLM selection
  selectedLLMExplainers: [],
  selectedLLMScorers: [],

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
      // Use base filters without LLM filtering for global histogram panel
      const baseFilters = {
        sae_id: [],
        explanation_method: [],
        llm_explainer: [],
        llm_scorer: []
      }

      // Define the metrics to fetch with their averaging configurations and fixed domains
      const metricsToFetch = [
        { metric: 'feature_splitting' as MetricType, averageBy: null, fixedDomain: [0.0, 0.6] as [number, number] },
        { metric: 'semsim_mean' as MetricType, averageBy: 'llm_explainer', fixedDomain: [0.75, 1.0] as [number, number] },
        { metric: 'score_embedding' as MetricType, averageBy: 'llm_scorer', fixedDomain: [0.0, 1.0] as [number, number] },
        { metric: 'score_fuzz' as MetricType, averageBy: 'llm_scorer', fixedDomain: [0.0, 1.0] as [number, number] },
        { metric: 'score_detection' as MetricType, averageBy: 'llm_scorer', fixedDomain: [0.0, 1.0] as [number, number] }
      ]

      // Fetch all histograms in parallel
      const histogramPromises = metricsToFetch.map(async ({ metric, averageBy, fixedDomain }) => {
        const request = {
          filters: baseFilters,
          metric,
          ...(averageBy && { averageBy }), // Only include averageBy if it's not null
          fixedDomain, // Always include fixed domain for all metrics
          ...(state.selectedLLMExplainers.length > 0 && { selectedLLMExplainers: state.selectedLLMExplainers })
        }

        console.log('[HistogramPanel] Sending request:', JSON.stringify(request, null, 2))
        const data = await api.getHistogramData(request)
        return { [metric]: data }
      })

      const results = await Promise.all(histogramPromises)
      const combinedData = results.reduce((acc, result) => ({ ...acc, ...result }), {})

      set({ histogramPanelData: combinedData, histogramPanelFilteredFeatureIds: null })
      state.setLoading('histogramPanel' as any, false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram panel data'
      state.setError('histogramPanel' as any, errorMessage)
      state.setLoading('histogramPanel' as any, false)
    }
  },

  fetchFilteredHistogramPanelData: async (featureIds: number[]) => {
    const state = get()
    state.setLoading('histogramPanel' as any, true)
    state.clearError('histogramPanel' as any)

    try {
      console.log(`[HistogramPanel] Fetching filtered data for ${featureIds.length} features`)

      const combinedData = await api.getFilteredHistogramPanelData(
        featureIds,
        state.selectedLLMExplainers.length > 0 ? state.selectedLLMExplainers : undefined
      )

      set({
        histogramPanelData: combinedData,
        histogramPanelFilteredFeatureIds: featureIds
      })
      state.setLoading('histogramPanel' as any, false)

      console.log(`[HistogramPanel] Successfully loaded filtered data for ${featureIds.length} features`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch filtered histogram panel data'
      console.error('[HistogramPanel] Error fetching filtered data:', errorMessage)
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

  // LLM selection actions
  setLLMSelection: (explainers: string[], scorers: string[]) => {
    console.log('[Store] Setting LLM selection:', { explainers, scorers })
    set({
      selectedLLMExplainers: explainers,
      selectedLLMScorers: scorers
    })
  },

  assignLLMExplainersToPanels: (explainers: string[]) => {
    console.log('[Store] Assigning LLM explainers to panels:', explainers)

    if (explainers.length === 0) {
      // No explainers: reset both panels to empty
      set({
        leftPanel: {
          ...get().leftPanel,
          filters: { sae_id: [], explanation_method: [], llm_explainer: [], llm_scorer: [] },
          viewState: 'empty',
          sankeyData: null,
          histogramData: null
        },
        rightPanel: {
          ...get().rightPanel,
          filters: { sae_id: [], explanation_method: [], llm_explainer: [], llm_scorer: [] },
          viewState: 'empty',
          sankeyData: null,
          histogramData: null
        }
      })
    } else if (explainers.length === 1) {
      // 1 explainer: assign to left panel, clear right panel
      set({
        leftPanel: {
          ...get().leftPanel,
          filters: {
            ...get().leftPanel.filters,
            llm_explainer: [explainers[0]]
          },
          viewState: 'visualization'
        },
        rightPanel: {
          ...get().rightPanel,
          filters: { sae_id: [], explanation_method: [], llm_explainer: [], llm_scorer: [] },
          viewState: 'empty',
          sankeyData: null,
          histogramData: null
        }
      })
    } else if (explainers.length >= 2) {
      // 2+ explainers: assign first two to panels (ignore rest)
      set({
        leftPanel: {
          ...get().leftPanel,
          filters: {
            ...get().leftPanel.filters,
            llm_explainer: [explainers[0]]
          },
          viewState: 'visualization'
        },
        rightPanel: {
          ...get().rightPanel,
          filters: {
            ...get().rightPanel.filters,
            llm_explainer: [explainers[1]]
          },
          viewState: 'visualization'
        }
      })
    }
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

  completeSelection: async (metricType, barIndices, thresholdRange) => {
    const state = get()

    // Use metric identity color
    const color = getMetricColor(metricType as MetricType)

    // Fetch feature IDs from backend
    let featureIds: number[] = []
    try {
      // Use base filters and pass selectedLLMExplainers for LLM-filtered feature IDs
      const baseFilters = {
        sae_id: [],
        explanation_method: [],
        llm_explainer: [],
        llm_scorer: []
      }
      const result = await getFeaturesInThreshold(
        baseFilters,
        metricType,
        thresholdRange.min,
        thresholdRange.max,
        state.selectedLLMExplainers
      )
      featureIds = result.feature_ids
      console.log(`Fetched ${featureIds.length} feature IDs for ${metricType} in range [${thresholdRange.min}, ${thresholdRange.max}] (LLM explainers: ${state.selectedLLMExplainers.length})`)
    } catch (error) {
      console.error('Failed to fetch feature IDs:', error)
      // Continue with empty feature IDs on error
    }

    const newSelection = {
      id: `sel_${Date.now()}`,
      metricType,
      barIndices,
      thresholdRange,
      featureIds,  // Now includes the fetched feature IDs
      color,  // Use metric identity color
      timestamp: Date.now()
    }

    let updatedPendingGroup: ThresholdSelection[] = []

    set((state) => {
      if (state.editingGroupId) {
        // Editing existing group: Update pendingGroup and immediately save to group
        updatedPendingGroup = [
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
        updatedPendingGroup = [
          ...state.pendingGroup.filter(s => s.metricType !== metricType),
          newSelection
        ]

        return {
          pendingGroup: updatedPendingGroup,
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

    // Calculate intersection using ALL selections from ALL visible groups
    if (updatedPendingGroup.length > 0 || state.isCreatingGroup) {
      const currentState = get()

      if (currentState.editingGroupId) {
        // Editing mode: combine pending group with other visible groups
        const otherVisibleGroups = currentState.thresholdGroups
          .filter(g => g.visible && g.id !== currentState.editingGroupId)
          .filter(g => g.selections.length > 0)

        // Collect all selections: pending group + other visible groups
        const allSelections = [
          ...updatedPendingGroup,
          ...otherVisibleGroups.flatMap(g => g.selections)
        ]

        if (allSelections.length > 0) {
          let intersectedFeatureIds = allSelections[0].featureIds
          for (let i = 1; i < allSelections.length; i++) {
            const currentSet = new Set(allSelections[i].featureIds)
            intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
          }

          console.log(`[Filtering] ${updatedPendingGroup.length} pending + ${otherVisibleGroups.length} other groups = ${allSelections.length} total selections → ${intersectedFeatureIds.length} features`)

          if (intersectedFeatureIds.length > 0) {
            state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
          } else {
            console.warn('[Filtering] No features match all selections from all visible groups')
            state.fetchHistogramPanelData()
          }
        }
      } else if (currentState.isCreatingGroup) {
        // Creating new group: only use pending group
        if (updatedPendingGroup.length > 0) {
          let intersectedFeatureIds = updatedPendingGroup[0].featureIds
          for (let i = 1; i < updatedPendingGroup.length; i++) {
            const currentSet = new Set(updatedPendingGroup[i].featureIds)
            intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
          }

          console.log(`[Filtering] ${updatedPendingGroup.length} selections → ${intersectedFeatureIds.length} features (new group)`)

          if (intersectedFeatureIds.length > 0) {
            state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
          } else {
            console.warn('[Filtering] No features match all selections - intersection is empty')
          }
        }
      }
    }
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

    // Hide all visible groups when starting new group creation
    updates.thresholdGroups = state.thresholdGroups.map(g =>
      g.visible ? { ...g, visible: false } : g
    )

    set(updates)

    // Reset histogram panel to unfiltered default state
    console.log('[Filtering] Starting new group creation - resetting to unfiltered')
    state.fetchHistogramPanelData()
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
      visible: true, // Immediately show the newly created group
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

    // Apply new threshold group to Sankey diagrams
    console.log('[Store.finishGroupCreation] Created new visible group, applying to Sankey')
    state.applyThresholdGroupsToSankey()
  },

  cancelGroupCreation: () => {
    const state = get()

    set(() => ({
      isCreatingGroup: false,
      selectionMode: false,
      pendingGroup: [],
      showGroupNameInput: false
    }))

    // Reset histogram panel to unfiltered default state
    console.log('[Filtering] Canceling group creation - resetting to unfiltered')
    state.fetchHistogramPanelData()
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

      // Apply filter based on ALL visible groups' selections (combined intersection)
      const allVisibleGroups = state.thresholdGroups
        .filter(g => g.id === groupId || g.visible) // Include the group we're showing
        .filter(g => g.selections.length > 0)

      if (allVisibleGroups.length > 0) {
        // Collect ALL selections from ALL visible groups
        const allSelections = allVisibleGroups.flatMap(g => g.selections)

        // Calculate intersection across ALL selections
        let intersectedFeatureIds = allSelections[0].featureIds
        for (let i = 1; i < allSelections.length; i++) {
          const currentSet = new Set(allSelections[i].featureIds)
          intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
        }

        console.log(`[Filtering] Showing group "${group.name}": ${allVisibleGroups.length} visible groups, ${allSelections.length} total selections → ${intersectedFeatureIds.length} features`)

        if (intersectedFeatureIds.length > 0) {
          state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
        } else {
          console.warn('[Filtering] No features match all selections from all visible groups')
          state.fetchHistogramPanelData() // Reset to unfiltered if no matches
        }
      }

      // Apply threshold groups to Sankey diagrams
      state.applyThresholdGroupsToSankey()
    } else {
      // Hiding group
      const updates: any = {
        thresholdGroups: state.thresholdGroups.map(g =>
          g.id === groupId ? { ...g, visible: false } : g
        )
      }

      // Check if we're hiding the group that's currently being edited
      if (state.editingGroupId === groupId) {
        // Find other visible groups (excluding the one we're hiding)
        const remainingVisibleGroups = state.thresholdGroups.filter(g =>
          g.visible && g.id !== groupId
        )

        if (remainingVisibleGroups.length > 0) {
          // There are other visible groups - switch to editing the first one
          const nextGroup = remainingVisibleGroups[0]
          updates.editingGroupId = nextGroup.id
          updates.selectionMode = true
          updates.pendingGroup = [...nextGroup.selections]

          set(updates)

          // Apply filter based on ALL remaining visible groups (combined intersection)
          const allVisibleGroupsWithSelections = remainingVisibleGroups.filter(g => g.selections.length > 0)

          if (allVisibleGroupsWithSelections.length > 0) {
            // Collect ALL selections from ALL visible groups
            const allSelections = allVisibleGroupsWithSelections.flatMap(g => g.selections)

            // Calculate intersection across ALL selections
            let intersectedFeatureIds = allSelections[0].featureIds
            for (let i = 1; i < allSelections.length; i++) {
              const currentSet = new Set(allSelections[i].featureIds)
              intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
            }

            console.log(`[Filtering] Switched to editing group "${nextGroup.name}": ${allVisibleGroupsWithSelections.length} visible groups, ${allSelections.length} total selections → ${intersectedFeatureIds.length} features`)

            if (intersectedFeatureIds.length > 0) {
              state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
            } else {
              console.warn('[Filtering] No features match all selections from remaining visible groups')
              state.fetchHistogramPanelData() // Reset to unfiltered if no matches
            }
          }
        } else {
          // No visible groups remain - disable editing mode completely
          updates.editingGroupId = null
          updates.selectionMode = false
          updates.pendingGroup = []

          set(updates)

          // Reset to unfiltered when no visible groups
          console.log('[Filtering] Hiding last visible group - resetting to unfiltered')
          state.fetchHistogramPanelData()
        }
      } else {
        // We're hiding a group that's not being edited - just update state
        set(updates)
      }

      // Apply threshold groups to Sankey diagrams (may revert to root-only tree)
      state.applyThresholdGroupsToSankey()
    }
  },

  deleteGroup: (groupId: string) => {
    const state = get()
    const group = state.thresholdGroups.find(g => g.id === groupId)
    const wasVisible = group?.visible || false

    set((state) => ({
      thresholdGroups: state.thresholdGroups.filter(group => group.id !== groupId)
    }))

    // If deleted group was visible, reset histogram and update Sankey diagrams
    if (wasVisible) {
      console.log('[Store.deleteGroup] Deleted visible group, resetting to unfiltered and applying threshold groups to Sankey')
      state.fetchHistogramPanelData()
      state.applyThresholdGroupsToSankey()
    }
  },

  setShowGroupNameInput: (show: boolean) => {
    set(() => ({
      showGroupNameInput: show
    }))
  },

  removeThresholdForMetric: (metricType: string) => {
    const state = get()
    let updatedPendingGroup: ThresholdSelection[] = []

    if (state.editingGroupId) {
      // Editing mode: Remove from pendingGroup and update the group
      updatedPendingGroup = state.pendingGroup.filter(s => s.metricType !== metricType)

      set({
        pendingGroup: updatedPendingGroup,
        thresholdGroups: state.thresholdGroups.map(g =>
          g.id === state.editingGroupId
            ? { ...g, selections: updatedPendingGroup }
            : g
        )
      })

      // Recalculate intersection using ALL visible groups
      const currentState = get()
      const otherVisibleGroups = currentState.thresholdGroups
        .filter(g => g.visible && g.id !== currentState.editingGroupId)
        .filter(g => g.selections.length > 0)

      // Collect all selections: updated pending group + other visible groups
      const allSelections = [
        ...updatedPendingGroup,
        ...otherVisibleGroups.flatMap(g => g.selections)
      ]

      if (allSelections.length > 0) {
        let intersectedFeatureIds = allSelections[0].featureIds
        for (let i = 1; i < allSelections.length; i++) {
          const currentSet = new Set(allSelections[i].featureIds)
          intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
        }

        console.log(`[Filtering] After removal: ${updatedPendingGroup.length} pending + ${otherVisibleGroups.length} other groups = ${allSelections.length} total selections → ${intersectedFeatureIds.length} features`)

        if (intersectedFeatureIds.length > 0) {
          state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
        } else {
          console.warn('[Filtering] No features match all selections from all visible groups')
          state.fetchHistogramPanelData()
        }
      } else {
        // No selections left in any visible group - reset to unfiltered
        console.log('[Filtering] No selections remaining in any visible group - resetting to unfiltered')
        state.fetchHistogramPanelData()
      }
    } else if (state.isCreatingGroup) {
      // Creating mode: Remove from pendingGroup
      updatedPendingGroup = state.pendingGroup.filter(s => s.metricType !== metricType)

      set({
        pendingGroup: updatedPendingGroup
      })

      // Recalculate intersection for new group only
      if (updatedPendingGroup.length > 0) {
        let intersectedFeatureIds = updatedPendingGroup[0].featureIds
        for (let i = 1; i < updatedPendingGroup.length; i++) {
          const currentSet = new Set(updatedPendingGroup[i].featureIds)
          intersectedFeatureIds = intersectedFeatureIds.filter(id => currentSet.has(id))
        }

        console.log(`[Filtering] After removal: ${updatedPendingGroup.length} selections → ${intersectedFeatureIds.length} features (new group)`)

        if (intersectedFeatureIds.length > 0) {
          state.fetchFilteredHistogramPanelData(intersectedFeatureIds)
        }
      } else {
        // No selections left in pending group - reset to unfiltered
        console.log('[Filtering] No selections remaining in pending group - resetting to unfiltered')
        state.fetchHistogramPanelData()
      }
    }
  },

  applyThresholdGroupsToSankey: () => {
    const state = get()
    const visibleGroups = state.thresholdGroups.filter(g => g.visible)

    console.log(`[Store.applyThresholdGroupsToSankey] Processing ${visibleGroups.length} visible groups`)

    let tree: ThresholdTree
    if (visibleGroups.length === 0) {
      // No visible groups: revert to default root-only tree
      console.log('[Store.applyThresholdGroupsToSankey] No visible groups, using root-only tree')
      tree = createRootOnlyTree()
    } else {
      // Convert groups to tree
      console.log('[Store.applyThresholdGroupsToSankey] Converting groups to threshold tree')
      tree = convertThresholdGroupsToTree(visibleGroups)
      console.log('[Store.applyThresholdGroupsToSankey] Generated tree with', tree.nodes.length, 'nodes')
    }

    // Apply to both panels
    set({
      leftPanel: { ...state.leftPanel, thresholdTree: tree },
      rightPanel: { ...state.rightPanel, thresholdTree: tree }
    })

    console.log('[Store.applyThresholdGroupsToSankey] Applied tree to both panels, triggering Sankey refresh')

    // Fetch new Sankey data for both panels
    state.fetchSankeyData('left')
    state.fetchSankeyData('right')
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore