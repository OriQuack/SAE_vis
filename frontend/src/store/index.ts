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
  ActivationExamples
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
import { createActivationActions } from './activation-actions'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

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

  // Feature selection state (used by TablePanel checkboxes)
  // Three-state system: null (empty) -> 'selected' (checkmark) -> 'rejected' (red X) -> null
  featureSelectionStates: Map<number, 'selected' | 'rejected'>
  // Track how features were selected: 'manual' (user click) or 'auto' (histogram tagging)
  featureSelectionSources: Map<number, 'manual' | 'auto'>
  toggleFeatureSelection: (featureId: number) => void
  selectAllFeatures: () => void
  clearFeatureSelection: () => void

  // Pair selection state (used by FeatureSplitTable checkboxes)
  // Three-state system: null (empty) -> 'selected' (checkmark) -> 'rejected' (red X) -> null
  // Key format: "${mainFeatureId}-${similarFeatureId}"
  pairSelectionStates: Map<string, 'selected' | 'rejected'>
  // Track how pairs were selected: 'manual' (user click) or 'auto' (histogram tagging)
  pairSelectionSources: Map<string, 'manual' | 'auto'>
  togglePairSelection: (mainFeatureId: number, similarFeatureId: number) => void
  clearPairSelection: () => void

  // Cause category selection state (used by CauseTablePanel)
  // Three-state cycle: null -> noisy-activation -> missed-lexicon -> missed-context -> null
  causeSelectionStates: Map<number, 'noisy-activation' | 'missed-lexicon' | 'missed-context'>
  // Track how features were selected: 'manual' (user click) or 'auto' (automatic tagging)
  causeSelectionSources: Map<number, 'manual' | 'auto'>
  toggleCauseCategory: (featureId: number) => void
  clearCauseSelection: () => void
  // Cause table activation (similar to activeStageNodeId for other tables)
  activeCauseStageNode: string | null
  activateCauseTable: (nodeId: string) => void

  // Comparison view state
  showComparisonView: boolean
  toggleComparisonView: () => void

  // Data actions
  setFilters: (filters: Partial<any>, panel?: PanelSide) => void

  // Tree-based threshold system actions (from tree-actions.ts)
  initializeFixedSankeyTree: (panel?: PanelSide) => Promise<void>
  addStageToNodeInternal: (nodeId: string, categoryId: string, panel?: PanelSide) => Promise<void>
  addCauseStage: (nodeId: string, panel?: PanelSide) => Promise<void>
  updateNodeThresholds: (nodeId: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  updateNodeThresholdsByPercentile: (nodeId: string, percentiles: number[], panel?: PanelSide) => Promise<void>
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
  sortBySimilarity: () => Promise<void>
  sortPairsBySimilarity: (allPairKeys: string[]) => Promise<void>
  sortCauseBySimilarity: () => Promise<void>
  sortTableByCategory: (category: 'confirmed' | 'expanded' | 'rejected' | 'auto-rejected' | 'unsure', mode: 'feature' | 'pair' | 'cause') => void

  // Similarity tagging actions (automatic tagging based on histogram)
  showSimilarityTaggingPopover: (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string) => Promise<void>
  hideSimilarityTaggingPopover: () => void
  updateSimilarityThresholds: (selectThreshold: number) => void
  applySimilarityTags: () => void

  // Node selection actions
  toggleNodeSelection: (nodeId: string) => void
  clearNodeSelection: () => void
  selectSingleNode: (nodeId: string | null) => void
  getNodeCategory: (nodeId: string) => string | null
  selectNodeWithCategory: (nodeId: string, categoryId: string) => void
  getSelectedNodeFeatures: () => Set<number> | null

  // Table data
  tableData: any | null

  // Table scroll state (simple feature tracking for indicator positioning)
  tableScrollState: {
    scrollTop: number              // Current scroll position in pixels
    scrollHeight: number           // Total scrollable height in pixels
    clientHeight: number           // Viewport height in pixels
    visibleFeatureIds: Set<number> // Feature IDs currently visible in viewport
  } | null

  // Table sort state
  tableSortBy: SortBy | null
  tableSortDirection: SortDirection | null

  // Similarity sort state
  similarityScores: Map<number, number>
  isSimilaritySortLoading: boolean
  lastSortedSelectionSignature: string | null  // Track selection state at last sort
  sortedBySelectionStates: Map<number, 'selected' | 'rejected'> | null,  // Frozen selection states when sorted
  doneFeatureSelectionStates: Map<number, 'selected' | 'rejected'> | null

  // Pair similarity sort state (for feature split table)
  pairSimilarityScores: Map<string, number>
  isPairSimilaritySortLoading: boolean
  lastPairSortedSelectionSignature: string | null  // Track pair selection state at last sort
  pairSortedBySelectionStates: Map<string, 'selected' | 'rejected'> | null,  // Frozen pair selection states when sorted
  donePairSelectionStates: Map<string, 'selected' | 'rejected'> | null

  // Cause similarity sort state (for cause table - multi-class OvR)
  causeSimilarityScores: Map<number, number>  // Legacy: single score per feature
  causeCategoryConfidences: Map<number, Record<string, number>>  // New: per-category confidences
  causeSortCategory: string | null  // Which category to sort by ('noisy-activation', 'missed-lexicon', 'missed-context', or null for max)
  isCauseSimilaritySortLoading: boolean

  // Similarity tagging popover state (for automatic tagging feature)
  similarityTaggingPopover: {
    visible: boolean
    mode: 'feature' | 'pair'
    position: { x: number; y: number }
    histogramData: any | null  // SimilarityScoreHistogramResponse
    selectThreshold: number  // Threshold for auto-selecting (blue, right side)
    rejectThreshold: number  // Threshold for auto-rejecting (light red, left side)
    tagLabel: string  // Tag name (e.g., "well-explained", "fragmented")
    isLoading: boolean
  } | null

  // Node selection for table filtering
  tableSelectedNodeIds: string[]

  // Table column display state
  scoreColumnDisplay: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION

  // Stage table state (decoder similarity stage table)
  activeStageNodeId: string | null
  activeStageCategory: string | null

  // Stage table actions
  setActiveStageNode: (nodeId: string | null, category?: string | null) => void
  clearActiveStageNode: () => void
  activateCategoryTable: (categoryId: string) => void
  moveToNextStep: () => void

  // Activation examples cache (centralized for all components)
  activationExamples: Record<number, ActivationExamples>
  activationLoading: Set<number>
  activationLoadingState: boolean

  // Activation examples actions (from activation-actions.ts)
  fetchActivationExamples: (featureIds: number[]) => Promise<void>
  getActivationData: (featureId: number) => ActivationExamples | undefined
  isActivationDataCached: (featureId: number) => boolean
  isActivationDataLoading: (featureId: number) => boolean
  prefetchAllActivationData: () => Promise<void>
  clearActivationCache: () => void

  // Auto-initialization with default filters
  initializeWithDefaultFilters: () => Promise<void>
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

  // Similarity sort state
  similarityScores: new Map<number, number>(),
  isSimilaritySortLoading: false,
  lastSortedSelectionSignature: null,
  sortedBySelectionStates: null,
  doneFeatureSelectionStates: null,

  // Pair similarity sort state (for feature split table)
  pairSimilarityScores: new Map<string, number>(),
  isPairSimilaritySortLoading: false,
  lastPairSortedSelectionSignature: null,
  pairSortedBySelectionStates: null,
  donePairSelectionStates: null,

  // Cause similarity sort state (for cause table - multi-class OvR)
  causeSimilarityScores: new Map<number, number>(),  // Legacy
  causeCategoryConfidences: new Map<number, Record<string, number>>(),  // New: per-category confidences
  causeSortCategory: null,  // Sort by max confidence by default
  isCauseSimilaritySortLoading: false,

  // Similarity tagging popover state (for automatic tagging feature)
  similarityTaggingPopover: null,

  // Node selection for table filtering
  tableSelectedNodeIds: [],

  // Table column display state
  scoreColumnDisplay: METRIC_QUALITY_SCORE as typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION,

  // Stage table state
  activeStageNodeId: null,
  activeStageCategory: null,

  // Hover state
  hoveredAlluvialNodeId: null,
  hoveredAlluvialPanel: null,

  // Feature selection state (used by TablePanel checkboxes)
  // Three-state system: null (empty) -> 'selected' (checkmark) -> 'rejected' (red X) -> null
  featureSelectionStates: new Map<number, 'selected' | 'rejected'>(),
  featureSelectionSources: new Map<number, 'manual' | 'auto'>(),

  // Pair selection state (used by FeatureSplitTable checkboxes)
  pairSelectionStates: new Map<string, 'selected' | 'rejected'>(),
  pairSelectionSources: new Map<string, 'manual' | 'auto'>(),

  // Cause category selection state (used by CauseTablePanel)
  causeSelectionStates: new Map<number, 'noisy-activation' | 'missed-lexicon' | 'missed-context'>(),
  causeSelectionSources: new Map<number, 'manual' | 'auto'>(),
  activeCauseStageNode: null,

  // Comparison view state
  showComparisonView: false,

  // Activation examples cache
  activationExamples: {},
  activationLoading: new Set<number>(),
  activationLoadingState: false
}

export const useStore = create<AppState>((set, get) => ({
  ...initialState,

  // Compose tree actions
  ...createTreeActions(set, get),

  // Compose table actions
  ...createTableActions(set, get),

  // Compose activation actions
  ...createActivationActions(set, get),

  // Hover state actions
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) =>
    set({ hoveredAlluvialNodeId: nodeId, hoveredAlluvialPanel: panel }),

  // Feature selection actions (used by TablePanel checkboxes)
  // Three-state toggle: null -> 'selected' -> 'rejected' -> null
  toggleFeatureSelection: (featureId: number) => {
    set((state) => {
      const newStates = new Map(state.featureSelectionStates)
      const newSources = new Map(state.featureSelectionSources)
      const currentState = newStates.get(featureId)

      if (currentState === undefined) {
        // null -> selected
        newStates.set(featureId, 'selected')
        newSources.set(featureId, 'manual')
      } else if (currentState === 'selected') {
        // selected -> rejected
        newStates.set(featureId, 'rejected')
        newSources.set(featureId, 'manual')
      } else {
        // rejected -> null (remove from map)
        newStates.delete(featureId)
        newSources.delete(featureId)
      }

      // Clear last sorted selection signature when selection changes
      // This re-enables the sort button
      return {
        featureSelectionStates: newStates,
        featureSelectionSources: newSources,
        lastSortedSelectionSignature: null,
        doneFeatureSelectionStates: null
      }
    })
  },

  selectAllFeatures: () => {
    const tableData = get().tableData
    if (tableData && tableData.features) {
      const newStates = new Map<number, 'selected' | 'rejected'>()
      const newSources = new Map<number, 'manual' | 'auto'>()
      tableData.features.forEach((f: any) => {
        newStates.set(f.feature_id, 'selected')
        newSources.set(f.feature_id, 'manual')
      })
      set({
        featureSelectionStates: newStates,
        featureSelectionSources: newSources,
        lastSortedSelectionSignature: null
      })
    }
  },

  clearFeatureSelection: () => {
    set({
      featureSelectionStates: new Map<number, 'selected' | 'rejected'>(),
      featureSelectionSources: new Map<number, 'manual' | 'auto'>(),
      lastSortedSelectionSignature: null
    })
  },

  // Pair selection actions (used by FeatureSplitTable checkboxes)
  // Three-state toggle: null -> 'selected' -> 'rejected' -> null
  togglePairSelection: (mainFeatureId: number, similarFeatureId: number) => {
    set((state) => {
      // IMPORTANT: Use canonical key format (smaller ID first) to match API and row keys
      const pairKey = mainFeatureId < similarFeatureId
        ? `${mainFeatureId}-${similarFeatureId}`
        : `${similarFeatureId}-${mainFeatureId}`
      const newStates = new Map(state.pairSelectionStates)
      const newSources = new Map(state.pairSelectionSources)
      const currentState = newStates.get(pairKey)

      if (currentState === undefined) {
        // null -> selected
        newStates.set(pairKey, 'selected')
        newSources.set(pairKey, 'manual')
      } else if (currentState === 'selected') {
        // selected -> rejected
        newStates.set(pairKey, 'rejected')
        newSources.set(pairKey, 'manual')
      } else {
        // rejected -> null (remove from map)
        newStates.delete(pairKey)
        newSources.delete(pairKey)
      }

      return {
        pairSelectionStates: newStates,
        pairSelectionSources: newSources,
        donePairSelectionStates: null
      }
    })
  },

  clearPairSelection: () => {
    set({
      pairSelectionStates: new Map<string, 'selected' | 'rejected'>(),
      pairSelectionSources: new Map<string, 'manual' | 'auto'>()
    })
  },

  // Cause category selection actions (used by CauseTablePanel)
  // Three-state cycle: null -> noisy-activation -> missed-lexicon -> missed-context -> null
  toggleCauseCategory: (featureId: number) => {
    set((state) => {
      const newStates = new Map(state.causeSelectionStates)
      const newSources = new Map(state.causeSelectionSources)
      const currentState = newStates.get(featureId)

      // Three-state cycle
      if (currentState === undefined) {
        // null -> noisy-activation
        newStates.set(featureId, 'noisy-activation')
        newSources.set(featureId, 'manual')
      } else if (currentState === 'noisy-activation') {
        // noisy-activation -> missed-lexicon
        newStates.set(featureId, 'missed-lexicon')
        newSources.set(featureId, 'manual')
      } else if (currentState === 'missed-lexicon') {
        // missed-lexicon -> missed-context
        newStates.set(featureId, 'missed-context')
        newSources.set(featureId, 'manual')
      } else if (currentState === 'missed-context') {
        // missed-context -> null (remove from map)
        newStates.delete(featureId)
        newSources.delete(featureId)
      }

      return {
        causeSelectionStates: newStates,
        causeSelectionSources: newSources
      }
    })
  },

  clearCauseSelection: () => {
    set({
      causeSelectionStates: new Map<number, 'noisy-activation' | 'missed-lexicon' | 'missed-context'>(),
      causeSelectionSources: new Map<number, 'manual' | 'auto'>()
    })
  },

  activateCauseTable: (nodeId: string) => {
    set({ activeCauseStageNode: nodeId })
    console.log('[Store.activateCauseTable] Activated cause table for node:', nodeId)
  },

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
        thresholdPath,
        bins: 50
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
          thresholdPath,
          bins: 50
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
  initializeWithDefaultFilters: async () => {
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

    // OPTIMIZATION: Pre-load table data BEFORE tree building
    // This ensures activation examples are cached when decoder similarity table renders
    console.log('📥 Pre-loading table data before tree building...')
    await get().fetchTableData()
    console.log('✅ Table data loaded - now building Sankey tree')

    // Initialize fixed 3-stage Sankey tree automatically
    console.log('🌱 Initializing fixed Sankey tree: Root → Feature Splitting → Quality → Cause')
    await get().initializeFixedSankeyTree(PANEL_LEFT)
    console.log('✅ Fixed 3-stage tree initialized - decoder similarity table ready')
  }
}))

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore
