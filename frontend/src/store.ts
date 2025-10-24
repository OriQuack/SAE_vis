import { create } from 'zustand'
import * as api from './api'
import type {
  Filters,
  FilterOptions,
  HistogramData,
  MetricType,
  PopoverState,
  LoadingStates,
  ErrorStates,
  AlluvialFlow,
  SankeyNode,
  NodeCategory,
  SortBy,
  SortDirection,
  FeatureGroup,
  SankeyTreeNode,
  CachedFeatureGroups,
  TreeBasedSankeyStructure
} from './types'
import { processFeatureGroupResponse, convertTreeToSankeyStructure, getNodeThresholdPath } from './lib/threshold-utils'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION
} from './lib/constants'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

// ============================================================================
// METRIC MAPPING UTILITIES
// ============================================================================

/**
 * Maps table sort keys to Sankey metrics
 * Returns null if no mapping exists
 */
const mapTableSortToSankeyMetric = (sortBy: string | null): string | null => {
  if (!sortBy) return null

  const mappings: Record<string, string> = {
    [METRIC_FEATURE_SPLITTING]: METRIC_FEATURE_SPLITTING,
    [METRIC_SEMANTIC_SIMILARITY]: METRIC_SEMANTIC_SIMILARITY,
    [METRIC_QUALITY_SCORE]: METRIC_QUALITY_SCORE,
    [METRIC_SCORE_EMBEDDING]: METRIC_SCORE_EMBEDDING,
    [METRIC_SCORE_FUZZ]: METRIC_SCORE_FUZZ,
    [METRIC_SCORE_DETECTION]: METRIC_SCORE_DETECTION
  }

  return mappings[sortBy] || null
}

/**
 * Maps Sankey metrics to table sort keys
 * Returns null if no mapping exists
 */
const mapSankeyMetricToTableSort = (metric: string | null): string | null => {
  if (!metric) return null

  const mappings: Record<string, string> = {
    [METRIC_FEATURE_SPLITTING]: METRIC_FEATURE_SPLITTING,
    [METRIC_SEMANTIC_SIMILARITY]: METRIC_SEMANTIC_SIMILARITY,
    [METRIC_QUALITY_SCORE]: METRIC_QUALITY_SCORE,
    [METRIC_SCORE_EMBEDDING]: METRIC_SCORE_EMBEDDING,
    [METRIC_SCORE_FUZZ]: METRIC_SCORE_FUZZ,
    [METRIC_SCORE_DETECTION]: METRIC_SCORE_DETECTION
  }

  return mappings[metric] || null
}

interface PanelState {
  filters: Filters
  histogramData: Record<string, HistogramData> | null

  // NEW tree-based system
  sankeyTree: Map<string, SankeyTreeNode>  // Node ID to node mapping
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

  // Data actions
  setFilters: (filters: Partial<Filters>, panel?: PanelSide) => void

  // NEW tree-based threshold system actions
  addUnsplitStageToNode: (nodeId: string, metric: string, panel?: PanelSide) => Promise<void>
  updateNodeThresholds: (nodeId: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  recomputeSankeyTree: (panel?: PanelSide) => void
  removeNodeStage: (nodeId: string, panel?: PanelSide) => void
  initializeSankeyTree: (panel?: PanelSide) => void
  loadRootFeatures: (panel?: PanelSide) => Promise<void>

  // Data setters
  setHistogramData: (data: Record<string, HistogramData> | null, panel?: PanelSide) => void

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

  // API actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (metric?: MetricType, nodeId?: string, panel?: PanelSide) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string, panel?: PanelSide) => Promise<void>

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Get rightmost stage feature IDs for table filtering
  getRightmostStageFeatureIds: () => Set<number> | null

  // Get max stage metric and sync table sort
  getMaxStageMetric: () => string | null
  syncTableSortWithMaxStage: () => void

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
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null, skipSankeySync?: boolean) => void

  // Table column display state (what metric is shown in the column)
  scoreColumnDisplay: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION) => void

  // Auto-initialization with default filters
  // DEFAULT APPROACH: Auto-initialize with first two LLM Explainers (subject to change)
  initializeWithDefaultFilters: () => void
}

const createInitialPanelState = (): PanelState => {
  // Initialize NEW tree-based system with root node
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
  currentMetric: METRIC_SEMANTIC_SIMILARITY as MetricType,
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

  // Table column display state
  scoreColumnDisplay: METRIC_QUALITY_SCORE as typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION,

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
        histogramData: null
      }
    }))
  },

  setHistogramData: (data, panel = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        // Merge new histogram data with existing data instead of replacing
        histogramData: data ? {
          ...state[panelKey].histogramData,
          ...data
        } : null
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
    const panelState = state[panelKey]
    const { filters } = panelState

    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (!hasActiveFilters) {
      return
    }

    state.setLoading('histogram', true)
    state.clearError('histogram')

    try {
      // Compute threshold path if nodeId provided
      const thresholdPath = nodeId
        ? getNodeThresholdPath(nodeId, panelState.sankeyTree)
        : undefined

      const request = {
        filters,
        metric: targetMetric,
        nodeId,
        thresholdPath
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
    const panelState = state[panelKey]
    const { filters } = panelState

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
      // Compute threshold path if nodeId provided
      const thresholdPath = nodeId
        ? getNodeThresholdPath(nodeId, panelState.sankeyTree)
        : undefined

      const histogramPromises = metrics.map(async (metric) => {
        const request = {
          filters,
          metric,
          nodeId,
          thresholdPath
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

  // Update alluvial flows from both panel data (NEW SYSTEM - uses computedSankey)
  updateAlluvialFlows: () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    // Return null if either panel doesn't have visualization data
    if (!leftPanel.computedSankey || !rightPanel.computedSankey) {
      set({ alluvialFlows: null })
      return
    }

    // Extract leaf nodes (nodes with feature_ids) from both panels
    // Leaf nodes are identified by having feature_ids, not by stage number
    const leftFinalNodes = leftPanel.computedSankey.nodes.filter((node: SankeyNode) =>
      node.feature_ids && node.feature_ids.length > 0
    )
    const rightFinalNodes = rightPanel.computedSankey.nodes.filter((node: SankeyNode) =>
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

  // Get feature IDs from rightmost stage nodes for table filtering
  getRightmostStageFeatureIds: () => {
    const state = get()
    const { leftPanel } = state

    // Use left panel's computed Sankey (main visualization)
    if (!leftPanel.computedSankey) {
      return null
    }

    // Find rightmost stage (maximum stage number)
    const nodes = leftPanel.computedSankey.nodes
    const maxStage = Math.max(...nodes.map(n => n.stage))

    // Get all nodes at rightmost stage
    const rightmostNodes = nodes.filter(n => n.stage === maxStage)

    // Collect all feature IDs from rightmost nodes
    const featureIds = new Set<number>()
    rightmostNodes.forEach(node => {
      if (node.feature_ids) {
        node.feature_ids.forEach(id => featureIds.add(id))
      }
    })

    // console.log(`[Store] Rightmost stage has ${featureIds.size} features across ${rightmostNodes.length} nodes`)
    return featureIds
  },

  // Get the metric used by the maximum stage nodes
  getMaxStageMetric: () => {
    const state = get()
    const { leftPanel } = state

    if (!leftPanel.computedSankey || leftPanel.computedSankey.nodes.length === 0) {
      return null
    }

    // Find maximum stage (depth)
    const maxStage = Math.max(...leftPanel.computedSankey.nodes.map(n => n.stage))

    // Get nodes at maximum stage
    const maxStageNodes = leftPanel.computedSankey.nodes.filter(n => n.stage === maxStage)

    // Return the metric used by max stage nodes (should be consistent)
    // Root nodes have null metric, so skip them
    const nodeWithMetric = maxStageNodes.find(n => n.metric)
    return nodeWithMetric?.metric || null
  },

  // Synchronize table sort with the maximum Sankey stage
  syncTableSortWithMaxStage: () => {
    const state = get()
    const maxStageMetric = state.getMaxStageMetric()

    if (!maxStageMetric) {
      console.log('[Store.syncTableSortWithMaxStage] No max stage metric found')
      return
    }

    // Map metric to table sort key
    const tableSortKey = mapSankeyMetricToTableSort(maxStageMetric)

    if (!tableSortKey) {
      console.log('[Store.syncTableSortWithMaxStage] Metric not mappable to table sort:', maxStageMetric)
      return
    }

    console.log('[Store.syncTableSortWithMaxStage] Syncing table sort to max stage:', {
      maxStageMetric,
      tableSortKey
    })

    // Swap the metric display to show the selected metric prominently
    state.swapMetricDisplay(tableSortKey as typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION)

    // Update table sort, skip Sankey sync to prevent recursion
    state.setTableSort(tableSortKey as SortBy, 'asc', true)
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

  // Set table sort state - with optional Sankey synchronization
  setTableSort: (sortBy, sortDirection, skipSankeySync = false) => {
    const state = get()

    // Update table sort state
    set({
      tableSortBy: sortBy,
      tableSortDirection: sortDirection
    })

    // Sync with Sankey if sorting by a mappable metric (unless skipped to prevent recursion)
    if (!skipSankeySync && sortBy && sortDirection) {
      const sankeyMetric = mapTableSortToSankeyMetric(sortBy)
      if (sankeyMetric) {
        // Check if left panel already has this metric in its tree
        const leftPanelTree = state.leftPanel.sankeyTree
        const hasMetricInTree = Array.from(leftPanelTree.values()).some(
          node => node.metric === sankeyMetric
        )

        // If metric not already in tree, add it to root node
        if (!hasMetricInTree) {
          console.log('[Store.setTableSort] Adding Sankey stage for table sort:', {
            metric: sankeyMetric
          })
          // Add unsplit stage to root node in left panel
          state.addUnsplitStageToNode('root', sankeyMetric, PANEL_LEFT)
        }
      }
    }
  },

  swapMetricDisplay: (newMetric) => {
    const state = get()

    // Store the current display metric
    const currentDisplay = state.scoreColumnDisplay

    // Set the new display metric
    set({
      scoreColumnDisplay: newMetric as typeof state.scoreColumnDisplay
    })

    console.log('[Store.swapMetricDisplay] Swapped score column:', {
      from: currentDisplay,
      to: newMetric
    })
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
   * Add a new unsplit stage to a specific node in the tree.
   * Creates a single child node with all parent features, without splitting by thresholds.
   * User can later set thresholds via histogram to split the node.
   */
  addUnsplitStageToNode: async (nodeId, metric, panel = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.addUnsplitStageToNode] 🎯 Called for ${panel}:`, {
      nodeId,
      metric,
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addUnsplitStageToNode] ❌ Node ${nodeId} not found in tree`)
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      const parentNode = sankeyTree.get(nodeId)!
      const newDepth = parentNode.depth + 1
      const newTree = new Map(sankeyTree)

      // Create a single child node with all parent features (no splitting)
      const childId = `${nodeId}_stage${newDepth}_group0`
      const childNode: SankeyTreeNode = {
        id: childId,
        parentId: nodeId,
        metric: null, // Child has no metric (not being split)
        thresholds: [], // Empty thresholds - no split yet
        depth: newDepth,
        children: [],
        featureIds: new Set(parentNode.featureIds), // Copy all parent features
        featureCount: parentNode.featureCount,
        rangeLabel: 'All' // Label for unsplit node
      }

      newTree.set(childId, childNode)

      // Update parent's children AND set the metric/thresholds on parent
      parentNode.children = [childId]
      parentNode.metric = metric           // Set metric on parent (how parent splits)
      parentNode.thresholds = []           // Empty thresholds (unsplit state)
      newTree.set(nodeId, { ...parentNode })

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      console.log(`[Store.addUnsplitStageToNode] 🌳 Tree updated with 1 unsplit child for node ${nodeId}`)

      // Fetch histogram data for the new metric (for node overlay visualization)
      // This displays small histogram bars on the node, but does NOT open the popover
      console.log(`[Store.addUnsplitStageToNode] 📊 Fetching histogram data for metric: ${metric}`)
      try {
        await state.fetchHistogramData(metric as MetricType, nodeId, panel)
        console.log(`[Store.addUnsplitStageToNode] ✅ Histogram data fetched for metric: ${metric}`)
      } catch (error) {
        console.warn(`[Store.addUnsplitStageToNode] ⚠️ Failed to fetch histogram data:`, error)
        // Don't fail the entire operation if histogram fetch fails
      }

      // Recompute Sankey structure
      console.log(`[Store.addUnsplitStageToNode] 🔄 Now calling recomputeSankeyTree...`)
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
      console.log(`[Store.addUnsplitStageToNode] ✅ Unsplit stage addition complete!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add unsplit stage'
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

      // Interface to capture entire subtree structure before deletion
      interface SubtreeSplitState {
        nodeId: string
        metric: string | null
        thresholds: number[]
        featureIds: Set<number>
        rangeLabel: string
        children: SubtreeSplitState[]
      }

      // Helper to collect entire subtree structure before any modifications
      const collectSubtreeStructure = (tree: Map<string, SankeyTreeNode>, nodeId: string): SubtreeSplitState[] => {
        const node = tree.get(nodeId)
        if (!node || node.children.length === 0) return []

        return node.children.map(childId => {
          const child = tree.get(childId)
          if (!child) return null

          return {
            nodeId: childId,
            metric: child.metric,
            thresholds: child.thresholds,
            featureIds: new Set(child.featureIds),
            rangeLabel: child.rangeLabel,
            children: collectSubtreeStructure(tree, childId) // Recursively collect grandchildren
          }
        }).filter((item): item is SubtreeSplitState => item !== null)
      }

      // Rebuild this node and its descendants
      const rebuildNodeAndDescendants = async (
        tree: Map<string, SankeyTreeNode>,
        nodeId: string,
        newGroups: FeatureGroup[],
        oldSubtreeStructure?: SubtreeSplitState[]
      ): Promise<Array<{nodeId: string, metric: string}>> => {
        const node = tree.get(nodeId)!

        // Track nodes that need histogram refresh
        const nodesToRefreshHistograms: Array<{nodeId: string, metric: string}> = []

        // Collect structure ONLY if not provided (this is the root call)
        const subtreeStructure = oldSubtreeStructure !== undefined
          ? oldSubtreeStructure
          : collectSubtreeStructure(tree, nodeId)

        // Recursively delete all descendants
        const deleteDescendants = (targetNodeId: string) => {
          const targetNode = tree.get(targetNodeId)
          if (!targetNode) return
          targetNode.children.forEach(childId => {
            deleteDescendants(childId)
            tree.delete(childId)
          })
        }
        node.children.forEach(childId => {
          deleteDescendants(childId)
          tree.delete(childId)
        })
        node.children = []

        // Step 2: Build new children and match with old structure
        for (const [index, group] of newGroups.entries()) {
          const intersectedFeatures = new Set<number>()

          if (node.id === 'root' || node.featureCount === 0) {
            // Root node - use all features from group
            group.featureIds.forEach(id => intersectedFeatures.add(id))
          } else {
            // Intersect with CURRENT node's features (not parent's!)
            // This ensures children only contain features from their parent's subset
            for (const id of group.featureIds) {
              if (node.featureIds.has(id)) {
                intersectedFeatures.add(id)
              }
            }
          }

          const childId = `${nodeId}_stage${node.depth + 1}_group${index}`
          const childNode: SankeyTreeNode = {
            id: childId,
            parentId: nodeId,
            metric: null,  // Child has no metric initially (not being split yet)
            thresholds: [],  // Children don't need thresholds initially
            depth: node.depth + 1,
            children: [],
            featureIds: intersectedFeatures,
            featureCount: intersectedFeatures.size,
            rangeLabel: group.rangeLabel
          }

          tree.set(childId, childNode)
          node.children.push(childId)

          // Step 3: Find best matching old child by feature overlap (not by index!)
          let bestMatch: SubtreeSplitState | null = null
          let bestOverlap = 0

          for (const oldChild of subtreeStructure) {
            // Calculate overlap between new child's features and old child's features
            const overlap = [...intersectedFeatures].filter(id => oldChild.featureIds.has(id)).length
            if (overlap > bestOverlap) {
              bestOverlap = overlap
              bestMatch = oldChild
            }
          }

          // Step 4: If found matching old child with splits, rebuild recursively
          if (bestMatch && bestMatch.metric && bestOverlap > 0) {
            const cacheKey = `${bestMatch.metric}:${bestMatch.thresholds.join(',')}`

            // Get cached groups or fetch if not cached
            let childGroups = state.cachedGroups[cacheKey]
            if (!childGroups) {
              console.log(`[updateNodeThresholds.rebuild] Fetching groups for child: ${cacheKey}`)
              const response = await api.getFeatureGroups({
                filters,
                metric: bestMatch.metric,
                thresholds: bestMatch.thresholds
              })
              childGroups = processFeatureGroupResponse(response)

              // Update cache
              set((currentState) => ({
                cachedGroups: {
                  ...currentState.cachedGroups,
                  [cacheKey]: childGroups
                }
              }))
            } else {
              console.log(`[updateNodeThresholds.rebuild] Using cached groups for child: ${cacheKey}`)
            }

            // Set metric on child before recursive rebuild
            childNode.metric = bestMatch.metric
            // Temporarily restore old thresholds - we'll check if they're valid after rebuilding
            childNode.thresholds = bestMatch.thresholds
            tree.set(childId, childNode)

            // Track this node for histogram refresh
            nodesToRefreshHistograms.push({nodeId: childId, metric: bestMatch.metric})

            // Recursively rebuild this child's children WITH its subtree structure
            console.log(`[updateNodeThresholds.rebuild] Recursively rebuilding child: ${childId} with ${bestMatch.children.length} old grandchildren`)
            const grandchildrenToRefresh = await rebuildNodeAndDescendants(tree, childId, childGroups, bestMatch.children)

            // NOW check if the rebuilt child has only 0-1 grandchildren (unsplit after intersection)
            // This detects nodes that had thresholds but became unsplit due to parent feature changes
            const rebuiltChild = tree.get(childId)!
            if (rebuiltChild.children.length <= 1 && rebuiltChild.thresholds.length > 0) {
              // Node had thresholds but resulted in 0-1 non-empty children after rebuild
              // This means thresholds were boundary values or became invalid - reset them
              rebuiltChild.thresholds = []
              tree.set(childId, rebuiltChild)
              console.log(`[updateNodeThresholds.rebuild] Reset boundary thresholds for child: ${childId} (${rebuiltChild.children.length} children after rebuild)`)
            }

            // Collect histogram refresh requests from recursive calls
            nodesToRefreshHistograms.push(...grandchildrenToRefresh)
          }
        }

        // Update the node's thresholds
        node.thresholds = thresholds

        // Return list of nodes that need histogram refresh
        return nodesToRefreshHistograms
      }

      // Update the tree
      const newTree = new Map(sankeyTree)
      // Collect entire subtree structure BEFORE any modifications
      const subtreeStructure = collectSubtreeStructure(newTree, nodeId)
      console.log(`[updateNodeThresholds] Collected subtree structure with ${subtreeStructure.length} direct children`)
      const nodesToRefresh = await rebuildNodeAndDescendants(newTree, nodeId, groups, subtreeStructure)

      set((state) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Refresh histogram data for all rebuilt nodes with metrics
      // This ensures slider positioning is correct after parent threshold changes
      if (nodesToRefresh.length > 0) {
        console.log(`[updateNodeThresholds] Refreshing histograms for ${nodesToRefresh.length} nodes`)
        await Promise.all(
          nodesToRefresh.map(({nodeId: refreshNodeId, metric}) => {
            console.log(`[updateNodeThresholds] Refreshing histogram for node ${refreshNodeId}, metric ${metric}`)
            return state.fetchHistogramData(metric as MetricType, refreshNodeId, panel)
          })
        )
      }

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

      // Sync table sort with max stage (only for left panel)
      if (panel === PANEL_LEFT) {
        get().syncTableSortWithMaxStage()
      }
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

    // Clear metric and thresholds from parent node
    const parentNode = newTree.get(nodeId)
    if (parentNode) {
      parentNode.metric = null
      parentNode.thresholds = []
      newTree.set(nodeId, { ...parentNode })
    }

    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: newTree,
        // Also clear histogram data for this node
        histogramData: Object.fromEntries(
          Object.entries(state[panelKey].histogramData || {}).filter(
            ([key]) => !key.startsWith(`${nodeId}_`)
          )
        )
      }
    }))

    // Recompute Sankey
    get().recomputeSankeyTree(panel)
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
