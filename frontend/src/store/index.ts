import { create } from 'zustand'
import * as api from '../api'
import type {
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
  Tag
} from '../types'
import { getNodeThresholdPath } from '../lib/threshold-utils'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION
} from '../lib/constants'
import { createInitialPanelState, type PanelState } from './utils'
import { createTreeActions } from './sankey-actions'
import { createTableActions } from './table-actions'
import { createTagActions, type TagState } from './tag-actions'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

interface AppState extends TagState {
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

  // Data actions
  setFilters: (filters: Partial<any>, panel?: PanelSide) => void

  // Tree-based threshold system actions (from tree-actions.ts)
  addUnsplitStageToNode: (nodeId: string, metric: string, panel?: PanelSide) => Promise<void>
  updateNodeThresholds: (nodeId: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  recomputeSankeyTree: (panel?: PanelSide) => void
  removeNodeStage: (nodeId: string, panel?: PanelSide) => void
  initializeSankeyTree: (panel?: PanelSide) => void
  loadRootFeatures: (panel?: PanelSide) => Promise<void>

  // Data setters
  setHistogramData: (data: Record<string, HistogramData> | null, panel?: PanelSide, nodeId?: string) => void

  // UI actions
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

  // Table data actions (from table-actions.ts)
  getRightmostStageFeatureIds: () => Set<number> | null
  getMaxStageMetric: () => string | null
  getRightmostNodeWithScrollIndicator: () => string
  findNodeWithMetric: (metric: string) => string | null
  fetchTableData: () => Promise<void>
  setTableScrollState: (state: { scrollTop: number; scrollHeight: number; clientHeight: number } | null) => void
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null) => void
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION) => void

  // Node selection actions
  toggleNodeSelection: (nodeId: string) => void
  clearNodeSelection: () => void
  getSelectedNodeFeatures: () => Set<number> | null

  // Table data
  tableData: any | null

  // Table scroll state
  tableScrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null

  // Table sort state
  tableSortBy: SortBy | null
  tableSortDirection: SortDirection | null

  // Node selection for table filtering
  tableSelectedNodeIds: string[]

  // Table column display state
  scoreColumnDisplay: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION

  // Auto-initialization with default filters
  initializeWithDefaultFilters: () => void
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

  // Alluvial flows
  alluvialFlows: null,

  // Table data
  tableData: null,

  // Table scroll state
  tableScrollState: null,

  // Table sort state
  tableSortBy: null,
  tableSortDirection: null,

  // Node selection for table filtering
  tableSelectedNodeIds: [],

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

  // Compose tree actions
  ...createTreeActions(set, get),

  // Compose table actions
  ...createTableActions(set, get),

  // Compose tag actions
  ...createTagActions(set, get),

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

  setHistogramData: (data, panel = PANEL_LEFT, nodeId?: string) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    set((state) => ({
      [panelKey]: {
        ...state[panelKey],
        // Merge new histogram data with existing data instead of replacing
        histogramData: data ? {
          ...state[panelKey].histogramData,
          // Transform data keys to include nodeId if provided
          ...Object.fromEntries(
            Object.entries(data).map(([metric, histData]) => {
              // Create composite key: "metric:nodeId" or just "metric" if no nodeId
              const key = nodeId ? `${metric}:${nodeId}` : metric
              return [key, histData]
            })
          )
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

      state.setHistogramData({ [targetMetric]: histogramData }, panel, nodeId)

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

      state.setHistogramData(combinedData, panel, nodeId)

      state.setLoading('histogram', false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch histogram data'
      state.setError('histogram', errorMessage)
      state.setLoading('histogram', false)
    }
  },

  // Update alluvial flows from both panel data (uses computedSankey)
  updateAlluvialFlows: () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    // Return null if either panel doesn't have visualization data
    if (!leftPanel.computedSankey || !rightPanel.computedSankey) {
      set({ alluvialFlows: null })
      return
    }

    // Extract leaf nodes (nodes with feature_ids) from both panels
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
        const commonFeatures = leftNode.feature_ids.filter((id: number) =>
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

  // Auto-initialization with default filters
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

    // Initialize template tags
    console.log('🏷️  Initializing template tags...')
    get().initializeTemplateTags()
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore
