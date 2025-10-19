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
  SortDirection,
  FeatureGroup,
  SankeyTreeNode,
  CachedFeatureGroups,
  TreeBasedSankeyStructure
} from './types'
import { updateNodeThreshold, createRootOnlyTree, addStageToNode, removeStageFromNode } from './lib/threshold-utils'
import { processFeatureGroupResponse, convertTreeToSankeyStructure } from './lib/feature-group-utils'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_SEMSIM_MEAN,
  CONSISTENCY_TYPE_NONE,
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER,
  CONSISTENCY_THRESHOLDS,
  CATEGORY_CONSISTENCY,
  SPLIT_TYPE_EXPRESSION,
  SPLIT_TYPE_RANGE
} from './lib/constants'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

// ============================================================================
// HELPER FUNCTIONS FOR SANKEY-TABLE SYNC
// ============================================================================

/**
 * Check if a sortBy value is a consistency type (excluding NONE)
 */
function isConsistencyType(sortBy: SortBy | null): boolean {
  if (!sortBy) return false
  return [
    CONSISTENCY_TYPE_LLM_SCORER,
    CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    CONSISTENCY_TYPE_LLM_EXPLAINER
  ].includes(sortBy as any)
}

/**
 * Check if a stage config represents a consistency stage
 */
function isConsistencyStageConfig(config: AddStageConfig): boolean {
  // Check if stageType is a consistency type
  if (isConsistencyType(config.stageType as any)) {
    return true
  }
  // Check if metric is a consistency type (fallback)
  if (config.metric && isConsistencyType(config.metric as any)) {
    return true
  }
  return false
}

/**
 * Extract consistency type from stage config
 */
function getConsistencyTypeFromConfig(config: AddStageConfig): string | null {
  // Check stageType first (primary method)
  if (isConsistencyType(config.stageType as any)) {
    return config.stageType
  }
  // Check metric as fallback
  if (config.metric && isConsistencyType(config.metric as any)) {
    return config.metric
  }
  return null
}

/**
 * Build consistency stage config from consistency type
 */
function buildConsistencyStageConfig(consistencyType: string): AddStageConfig {
  // Type guard - only valid consistency types (excluding NONE)
  const validTypes = [
    CONSISTENCY_TYPE_LLM_SCORER,
    CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
    CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
    CONSISTENCY_TYPE_LLM_EXPLAINER
  ]

  if (!validTypes.includes(consistencyType)) {
    throw new Error(`Invalid consistency type: ${consistencyType}`)
  }

  const thresholdsMap: Record<string, readonly number[]> = CONSISTENCY_THRESHOLDS
  const thresholds = thresholdsMap[consistencyType] || [0.25, 0.5, 0.75]

  return {
    stageType: consistencyType,  // Use the consistency type as the stage type ID
    splitRuleType: 'expression',  // Consistency stages use expression split rules
    metric: consistencyType,
    customConfig: {
      customThresholds: [...thresholds]  // Copy array to make it mutable
    }
  }
}

/**
 * Check if a threshold tree already has a consistency stage
 */
function hasConsistencyStage(tree: ThresholdTree): boolean {
  return tree.nodes.some(node => node.category === CATEGORY_CONSISTENCY)
}

/**
 * Find the node ID of the first consistency stage in the tree
 * Returns null if no consistency stage exists
 */
function findConsistencyStageNodeId(tree: ThresholdTree): string | null {
  const consistencyNode = tree.nodes.find(node => node.category === CATEGORY_CONSISTENCY)
  return consistencyNode ? consistencyNode.id : null
}

/**
 * Check if tree has a specific consistency type
 */
function hasSpecificConsistencyType(tree: ThresholdTree, consistencyType: ConsistencyType): boolean {
  for (const node of tree.nodes) {
    if (node.category === CATEGORY_CONSISTENCY && node.split_rule) {
      if (node.split_rule.type === SPLIT_TYPE_EXPRESSION) {
        const rule = node.split_rule as any
        const metrics = rule.available_metrics || []
        if (metrics.includes(consistencyType)) {
          return true
        }
      } else if (node.split_rule.type === SPLIT_TYPE_RANGE) {
        const rule = node.split_rule as any
        if (rule.metric === consistencyType) {
          return true
        }
      }
    }
  }
  return false
}

interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree  // Old system (right panel)
  sankeyData: SankeyData | null  // Old system (right panel)
  histogramData: Record<string, HistogramData> | null

  // Tree-based system (both panels)
  sankeyTree?: Map<string, SankeyTreeNode>  // Node ID to node mapping
  computedSankey?: TreeBasedSankeyStructure  // Tree-based Sankey structure
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

  // Global cache for feature groups (shared across panels)
  cachedGroups: CachedFeatureGroups

  // Hover state for cross-component highlighting
  hoveredAlluvialNodeId: string | null
  hoveredAlluvialPanel: 'left' | 'right' | null
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) => void

  // Comparison view state
  showComparisonView: boolean
  toggleComparisonView: () => void

  // Data actions - now take panel parameter
  setFilters: (filters: Partial<Filters>, panel?: PanelSide) => void
  // Old threshold tree actions (right panel)
  updateThreshold: (nodeId: string, thresholds: number[], panel?: PanelSide, metric?: string) => void
  addStageToTree: (nodeId: string, config: AddStageConfig, panel?: PanelSide) => void
  removeStageFromTree: (nodeId: string, panel?: PanelSide) => void
  resetToRootOnlyTree: (panel?: PanelSide) => void
  // Tree-based threshold system actions (both panels)
  addStageToNode: (nodeId: string, metric: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  updateNodeThresholds: (nodeId: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  recomputeSankeyTree: (panel?: PanelSide) => void
  removeNodeStage: (nodeId: string, panel?: PanelSide) => void
  initializeSankeyTree: (panel?: PanelSide) => void
  loadRootFeatures: (panel?: PanelSide) => Promise<void>
  // Data setters
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

  // Initialize tree-based system with root node
  const rootNode: SankeyTreeNode = {
    id: 'root',
    parentId: null,
    metric: null,
    thresholds: [],
    depth: 0,
    children: [],
    featureIds: new Set(),
    featureCount: 0,
    rangeLabel: 'All Features'
  }

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
    sankeyTree: new Map([['root', rootNode]])
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

  // Global cache for feature groups
  cachedGroups: {} as CachedFeatureGroups,

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
  selectedConsistencyType: CONSISTENCY_TYPE_NONE as ConsistencyType,

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

        // NEW: Sync table sort if this is a consistency stage in LEFT panel only
        let newTableSort = state.tableSortBy
        let newTableSortDirection = state.tableSortDirection

        if (panel === PANEL_LEFT && isConsistencyStageConfig(config)) {
          const consistencyType = getConsistencyTypeFromConfig(config)
          if (consistencyType && state.tableSortBy !== consistencyType) {
            console.log('[Store.addStageToTree] Consistency stage detected in left panel, syncing table sort to:', consistencyType)
            newTableSort = consistencyType as SortBy
            newTableSortDirection = 'asc'
          }
        }

        return {
          [panelKey]: {
            ...state[panelKey],
            thresholdTree: updatedTree,
            // Clear existing data to trigger refresh
            sankeyData: null,
            histogramData: null
          },
          tableSortBy: newTableSort,
          tableSortDirection: newTableSortDirection
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

        // NEW: Check if we removed a consistency stage from LEFT panel only
        const removedConsistencyStage = hasConsistencyStage(currentTree) && !hasConsistencyStage(updatedTree)

        // Reset table sort if LEFT panel had consistency stage removed
        let newTableSort = state.tableSortBy
        let newTableSortDirection = state.tableSortDirection

        if (panel === PANEL_LEFT && removedConsistencyStage && isConsistencyType(state.tableSortBy)) {
          console.log('[Store.removeStageFromTree] Consistency stage removed from left panel, resetting table sort')
          newTableSort = null
          newTableSortDirection = null
        }

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
          },
          tableSortBy: newTableSort,
          tableSortDirection: newTableSortDirection
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

      // Add stack trace to identify caller
      const stack = new Error().stack
      console.log('📤 Sending Sankey request:', {
        panel,
        filters,
        thresholdTree: JSON.stringify(thresholdTree, null, 2),
        calledFrom: stack?.split('\n')[2] // Show caller
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
    const state = get()

    // Track if left panel needs fetching
    let shouldFetchLeft = false

    // Prepare state updates
    const stateUpdates: any = {
      tableSortBy: sortBy,
      tableSortDirection: sortDirection
    }

    // NEW: Sync Sankey stages if sorting by consistency type (LEFT PANEL ONLY)
    if (sortBy && isConsistencyType(sortBy)) {
      console.log('[Store.setTableSort] Consistency type detected, syncing left Sankey:', sortBy)

      const stageConfig = buildConsistencyStageConfig(sortBy)

      // Handle left panel only
      if (!hasSpecificConsistencyType(state.leftPanel.thresholdTree, sortBy as ConsistencyType)) {
        console.log('[Store.setTableSort] Updating consistency stage in left panel')

        let workingTree = state.leftPanel.thresholdTree

        // Remove existing consistency stage if present
        if (hasConsistencyStage(workingTree)) {
          const consistencyNodeId = findConsistencyStageNodeId(workingTree)
          if (consistencyNodeId) {
            // Find parent of consistency node to remove from
            const consistencyNode = workingTree.nodes.find(n => n.id === consistencyNodeId)
            if (consistencyNode && consistencyNode.parent_path.length > 0) {
              const parentId = consistencyNode.parent_path[consistencyNode.parent_path.length - 1].parent_id
              workingTree = removeStageFromNode(workingTree, parentId)
            }
          }
        }

        // Add new consistency stage
        const rootNode = workingTree.nodes.find(n => n.id === 'root')
        if (rootNode) {
          const updatedTreeLeft = addStageToNode(workingTree, rootNode.id, stageConfig)
          stateUpdates.leftPanel = {
            ...state.leftPanel,
            thresholdTree: updatedTreeLeft,
            sankeyData: null,
            histogramData: null
          }
          shouldFetchLeft = true
        }
      }
    }

    // Single state update with all changes
    set(stateUpdates)

    // Fetch data only for left panel if it changed (use fresh state reference)
    const freshState = get()
    if (shouldFetchLeft) {
      console.log('[Store.setTableSort] Fetching Sankey data for left panel')
      freshState.fetchSankeyData(PANEL_LEFT)
    }
  },

  // ============================================================================
  // TREE-BASED THRESHOLD SYSTEM ACTIONS
  // ============================================================================

  /**
   * Initialize the Sankey tree with root node containing all features.
   * Gets initial feature count from filters.
   */
  initializeSankeyTree: (panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'

    const rootNode: SankeyTreeNode = {
      id: 'root',
      parentId: null,
      metric: null,
      thresholds: [],
      depth: 0,
      children: [],
      featureIds: new Set(),
      featureCount: 0,
      rangeLabel: 'All Features'
    }

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: new Map([['root', rootNode]])
      }
    }))
  },

  /**
   * Load actual feature IDs for the root node from the backend.
   * Calls /api/feature-groups with empty thresholds to get all features.
   */
  loadRootFeatures: async (panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, sankeyTree } = state[panelKey]

    console.log(`[Store.loadRootFeatures] 🌱 Loading root features for ${panel}`)

    if (!sankeyTree || !sankeyTree.has('root')) {
      console.error('[Store.loadRootFeatures] ❌ Root node not found in tree')
      return
    }

    try {
      // Call API with empty thresholds to get all features
      const response = await api.getFeatureGroups({
        filters,
        metric: 'root',
        thresholds: []
      })

      // Process response - should have single group with all features
      const groups = processFeatureGroupResponse(response)
      if (groups.length === 0) {
        console.warn('[Store.loadRootFeatures] ⚠️  No groups returned from API')
        return
      }

      const rootGroup = groups[0]
      console.log(`[Store.loadRootFeatures] ✅ Loaded ${rootGroup.featureCount} features for root node`)

      // Update root node with actual feature IDs
      const updatedRoot: SankeyTreeNode = {
        ...sankeyTree.get('root')!,
        featureIds: rootGroup.featureIds,
        featureCount: rootGroup.featureCount
      }

      const newTree = new Map(sankeyTree)
      newTree.set('root', updatedRoot)

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Compute Sankey tree to activate tree-based system immediately
      console.log(`[Store.loadRootFeatures] 🔄 Computing Sankey tree to activate tree-based system...`)
      get().recomputeSankeyTree(panel)
      console.log(`[Store.loadRootFeatures] ✅ Tree-based system now active - old API will be skipped`)
    } catch (error) {
      console.error('[Store.loadRootFeatures] ❌ Failed to load root features:', error)
    }
  },

  /**
   * Add a new stage to a specific node in the tree.
   * Supports branching - different nodes can have different metrics at the same depth.
   */
  addStageToNode: async (nodeId, metric, thresholds, panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { filters, sankeyTree } = state[panelKey]

    console.log(`[Store.addStageToNode] 🎯 Called for ${panel}:`, {
      nodeId,
      metric,
      thresholds,
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addStageToNode] ❌ Node ${nodeId} not found in tree`)
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Create cache key for this metric and thresholds
      const cacheKey = `${metric}:${thresholds.join(',')}`

      let groups: FeatureGroup[]

      // Check if we already have these groups cached
      if (state.cachedGroups[cacheKey]) {
        groups = state.cachedGroups[cacheKey]
        console.log(`[Store.addStageToNode] Using cached groups for ${cacheKey}`)
      } else {
        // Fetch feature groups from backend
        const response = await api.getFeatureGroups({ filters, metric, thresholds })
        groups = processFeatureGroupResponse(response)

        // Cache the groups globally
        set((state) => ({
          cachedGroups: {
            ...state.cachedGroups,
            [cacheKey]: groups
          }
        }))
        console.log(`[Store.addStageToNode] Cached groups for ${cacheKey}`)
      }

      // Now build child nodes by intersecting parent features with groups
      const parentNode = sankeyTree.get(nodeId)!
      const newDepth = parentNode.depth + 1
      const newTree = new Map(sankeyTree)
      const childIds: string[] = []

      groups.forEach((group, index) => {
        // Intersect parent features with group features
        const intersectedFeatures = new Set<number>()
        if (parentNode.featureCount === 0 && parentNode.depth === 0) {
          // Root node - use all features from the group
          intersectedFeatures.clear()
          group.featureIds.forEach(id => intersectedFeatures.add(id))
        } else {
          // Non-root - intersect with parent
          for (const id of group.featureIds) {
            if (parentNode.featureIds.has(id)) {
              intersectedFeatures.add(id)
            }
          }
        }

        // Create child node
        const childId = `${nodeId}_stage${newDepth}_group${index}`
        const childNode: SankeyTreeNode = {
          id: childId,
          parentId: nodeId,
          metric,
          thresholds,
          depth: newDepth,
          children: [],
          featureIds: intersectedFeatures,
          featureCount: intersectedFeatures.size,
          rangeLabel: group.rangeLabel
        }

        newTree.set(childId, childNode)
        childIds.push(childId)
      })

      // Update parent's children
      parentNode.children = childIds
      newTree.set(nodeId, { ...parentNode })

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      console.log(`[Store.addStageToNode] 🌳 Tree updated with ${childIds.length} new children for node ${nodeId}`)

      // Recompute Sankey structure
      console.log(`[Store.addStageToNode] 🔄 Now calling recomputeSankeyTree to activate tree-based system...`)
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
      console.log(`[Store.addStageToNode] ✅ Stage addition complete - tree-based system should now be active!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add stage'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
    }
  },

  /**
   * Update thresholds for a node and its descendants.
   * Uses cached groups for instant updates.
   */
  updateNodeThresholds: async (nodeId: string, thresholds: number[], panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { filters, sankeyTree } = state[panelKey]

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.updateNodeThresholds] Node ${nodeId} not found`)
      return
    }

    const node = sankeyTree.get(nodeId)!
    if (!node.metric) {
      console.error(`[Store.updateNodeThresholds] Node ${nodeId} has no metric`)
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Create cache key
      const cacheKey = `${node.metric}:${thresholds.join(',')}`

      let groups: FeatureGroup[]

      // Check cache first
      if (state.cachedGroups[cacheKey]) {
        groups = state.cachedGroups[cacheKey]
        console.log(`[Store.updateNodeThresholds] Using cached groups for ${cacheKey}`)
      } else {
        // Fetch new groups
        const response = await api.getFeatureGroups({ filters, metric: node.metric, thresholds })
        groups = processFeatureGroupResponse(response)

        // Cache them
        set((state) => ({
          cachedGroups: {
            ...state.cachedGroups,
            [cacheKey]: groups
          }
        }))
      }

      // Rebuild this node and its descendants
      const rebuildNodeAndDescendants = (tree: Map<string, SankeyTreeNode>, nodeId: string, newGroups: FeatureGroup[]): void => {
        const node = tree.get(nodeId)!
        const parentNode = node.parentId ? tree.get(node.parentId) : null

        // Remove old children
        node.children.forEach(childId => tree.delete(childId))
        node.children = []

        // Build new children
        newGroups.forEach((group, index) => {
          const intersectedFeatures = new Set<number>()

          if (!parentNode || (parentNode.featureCount === 0 && parentNode.depth === 0)) {
            // Root node or parent is root - use all features from group
            group.featureIds.forEach(id => intersectedFeatures.add(id))
          } else {
            // Intersect with parent features
            for (const id of group.featureIds) {
              if (parentNode.featureIds.has(id)) {
                intersectedFeatures.add(id)
              }
            }
          }

          const childId = `${nodeId}_stage${node.depth + 1}_group${index}`
          const childNode: SankeyTreeNode = {
            id: childId,
            parentId: nodeId,
            metric: node.metric,
            thresholds,
            depth: node.depth + 1,
            children: [],
            featureIds: intersectedFeatures,
            featureCount: intersectedFeatures.size,
            rangeLabel: group.rangeLabel
          }

          tree.set(childId, childNode)
          node.children.push(childId)
        })

        // Update the node's thresholds
        node.thresholds = thresholds
      }

      // Update the tree
      const newTree = new Map(sankeyTree)
      rebuildNodeAndDescendants(newTree, nodeId, groups)

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Recompute Sankey
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update thresholds'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
    }
  },

  /**
   * Recompute Sankey structure from the tree.
   * Converts tree to flat nodes and links for D3 rendering.
   */
  recomputeSankeyTree: (panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.recomputeSankeyTree] 🔄 Called for ${panel}:`, {
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree) {
      console.warn('[Store.recomputeSankeyTree] ⚠️  No tree available')
      return
    }

    try {
      // Use the utility function to convert tree to Sankey structure
      const computedSankey = convertTreeToSankeyStructure(sankeyTree)

      console.log(`[Store.recomputeSankeyTree] ✅ Computed Sankey for ${panel}:`, {
        nodes: computedSankey.nodes.length,
        links: computedSankey.links.length,
        maxDepth: computedSankey.maxDepth
      })

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          computedSankey
        }
      }))

      console.log(`[Store.recomputeSankeyTree] 💾 Stored computedSankey in ${panelKey}`)

      // Update alluvial flows if both panels have data
      get().updateAlluvialFlows()
    } catch (error) {
      console.error('[Store.recomputeSankeyTree] ❌ Failed to recompute Sankey:', error)
    }
  },

  /**
   * Remove a node's children (stage removal).
   * Removes all descendants of the specified node.
   */
  removeNodeStage: (nodeId: string, panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.removeNodeStage] Node ${nodeId} not found`)
      return
    }

    const newTree = new Map(sankeyTree)

    // Recursive function to remove all descendants
    const removeDescendants = (nodeId: string) => {
      const node = newTree.get(nodeId)
      if (!node) return

      node.children.forEach(childId => {
        removeDescendants(childId)
        newTree.delete(childId)
      })
      node.children = []
    }

    // Remove all descendants
    removeDescendants(nodeId)

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: newTree
      }
    }))

    // Recompute Sankey
    get().recomputeSankeyTree(panel)
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

    console.log('🌳 Initializing tree-based system with empty root nodes (no computedSankey yet)')

    // Set filters: Left panel gets ALL LLM explainers, right panel stays empty
    set((state) => ({
      leftPanel: {
        ...state.leftPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: llmExplainers,  // Select ALL LLM Explainers
          llm_scorer: llmScorers  // Select ALL LLM Scorers
        },
        // Initialize tree-based system with root node
        sankeyTree: new Map([['root', {
          id: 'root',
          parentId: null,
          metric: null,
          thresholds: [],
          depth: 0,
          children: [],
          featureIds: new Set(),
          featureCount: 0,
          rangeLabel: 'All Features'
        }]])
      },
      rightPanel: {
        ...state.rightPanel,
        filters: {
          sae_id: [],
          explanation_method: [],
          llm_explainer: [],  // No explainer selected in right panel
          llm_scorer: llmScorers  // Select ALL LLM Scorers
        },
        // Initialize tree-based system with root node
        sankeyTree: new Map([['root', {
          id: 'root',
          parentId: null,
          metric: null,
          thresholds: [],
          depth: 0,
          children: [],
          featureIds: new Set(),
          featureCount: 0,
          rangeLabel: 'All Features'
        }]])
      }
    }))

    // Don't compute Sankey tree yet - let old system handle initial display
    // Tree-based system will take over when user adds first stage
    console.log('✅ Initialization complete - OLD system will handle initial Sankey, tree-based system ready for stage additions')

    // Load actual root features from API
    console.log('🌱 Now loading root features from API...')
    get().loadRootFeatures(PANEL_LEFT)
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore
