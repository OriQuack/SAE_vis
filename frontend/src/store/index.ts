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
  ActivationExamples,
  SankeySegmentSelection,
  FlowPathData
} from '../types'
import { getNodeThresholdPath, processFeatureGroupResponse } from '../lib/threshold-utils'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  TAG_CATEGORY_FEATURE_SPLITTING
} from '../lib/constants'
import { createInitialPanelState, type PanelState } from './utils'
import { createSimplifiedSankeyActions } from './sankey-actions'
import { createCommonActions } from './common-actions'
import { createFeatureSplitActions } from './feature-split-actions'
import { createQualityActions } from './quality-actions'
import { createCauseActions } from './cause-actions'
import { createActivationActions } from './activation-actions'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

// Stage 1 commit type for revisiting state restoration
export interface Stage1FinalCommit {
  pairSelectionStates: Map<string, 'selected' | 'rejected'>
  pairSelectionSources: Map<string, 'manual' | 'auto'>
  featureIds: Set<number>  // Original Stage 1 feature IDs for pair fetching
}

interface AppState {
  // Data state - now split for left and right panels
  leftPanel: PanelState
  rightPanel: PanelState

  // Shared state
  filterOptions: FilterOptions | null
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
  restorePairSelectionStates: (states: Map<string, 'selected' | 'rejected'>, sources: Map<string, 'manual' | 'auto'>) => void
  restoreFeatureSelectionStates: (states: Map<number, 'selected' | 'rejected'>, sources: Map<number, 'manual' | 'auto'>) => void

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

  // Simplified 3-stage Sankey actions (from sankey-actions-v2.ts)
  initializeSankey: (panel?: PanelSide) => Promise<void>
  buildSankeyFromFeatureIds: (featureIds: number[], panel?: PanelSide) => Promise<void>
  activateStage2: (panel?: PanelSide) => Promise<void>
  activateStage3: (panel?: PanelSide) => Promise<void>
  updateStageThreshold: (stageNumber: 1 | 2, newThreshold: number, panel?: PanelSide) => Promise<void>
  recomputeD3StructureV2: (panel?: PanelSide) => void

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
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string, panel?: PanelSide) => Promise<void>

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Alluvial flow actions
  updateAlluvialFlows: () => void

  // Table data actions (composed from modular action files)
  fetchTableData: () => Promise<void>
  setTableScrollState: (state: { scrollTop: number; scrollHeight: number; clientHeight: number } | null) => void
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null) => void
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION) => void
  sortBySimilarity: () => Promise<void>
  sortPairsBySimilarity: (allPairKeys: string[]) => Promise<void>
  getFeatureSplittingCounts: () => { fragmented: number; monosemantic: number; unsure: number; total: number; fragmentedManual: number; fragmentedAuto: number; monosematicManual: number; monosematicAuto: number }
  sortCauseBySimilarity: () => Promise<void>
  sortTableByCategory: (category: 'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure', mode: 'feature' | 'pair' | 'cause') => void
  fetchSimilarityHistogram: (selectedFeatureIds?: Set<number>, threshold?: number) => Promise<any>

  // Similarity tagging actions (automatic tagging based on histogram)
  showTagAutomaticPopover: (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string, selectedFeatureIds?: Set<number>, threshold?: number) => Promise<void>
  hideTagAutomaticPopover: () => void
  updateSimilarityThresholds: (selectThreshold: number) => void
  updateBothSimilarityThresholds: (selectThreshold: number, rejectThreshold: number) => void
  applySimilarityTags: () => void
  minimizeSimilarityTaggingPopover: () => void
  restoreSimilarityTaggingPopover: () => void

  // Threshold visualization actions
  showThresholdsOnTable: () => Promise<void>
  hideThresholdsOnTable: () => void

  // Node selection actions
  toggleNodeSelection: (nodeId: string) => void
  clearNodeSelection: () => void
  selectSingleNode: (nodeId: string | null, segmentIndex?: number | null) => void
  getNodeCategory: (nodeId: string) => string | null
  selectNodeWithCategory: (nodeId: string, categoryId: string) => void
  getSelectedNodeFeatures: () => Set<number> | null

  // V2: Segment-specific selection
  selectedSegment: { nodeId: string; segmentIndex: number } | null
  selectSegment: (nodeId: string, segmentIndex: number) => void
  clearSegmentSelection: () => void

  // Sankey-to-Selection flow visualization
  selectedSankeySegment: SankeySegmentSelection | null
  sankeyToSelectionFlows: FlowPathData[] | null
  setSelectedSankeySegment: (selection: SankeySegmentSelection | null) => void

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

  // Cluster-based feature pairs state (for FeatureSplitPairViewer) - SIMPLIFIED FLOW
  allClusterPairs: Array<{main_id: number, similar_id: number, pair_key: string, cluster_id: number}> | null  // ALL pair objects from clustering
  clusterGroups: Array<{cluster_id: number, feature_ids: number[]}> | null  // All clusters with their members
  featureToClusterMap: Record<number, number> | null  // Map of all feature IDs to their cluster IDs
  totalClusters: number | null  // Total number of clusters at the threshold used
  isLoadingDistributedPairs: boolean

  // Cause similarity sort state (for cause table - multi-class OvR)
  causeSimilarityScores: Map<number, number>  // Legacy: single score per feature
  causeCategoryConfidences: Map<number, Record<string, number>>  // New: per-category confidences
  causeSortCategory: string | null  // Which category to sort by ('noisy-activation', 'missed-lexicon', 'missed-context', or null for max)
  isCauseSimilaritySortLoading: boolean

  // Tag automatic state (for automatic tagging feature with threshold controls)
  tagAutomaticState: {
    visible: boolean
    minimized: boolean  // Whether popover is minimized
    mode: 'feature' | 'pair'
    position: { x: number; y: number }
    histogramData: any | null  // SimilarityScoreHistogramResponse
    selectThreshold: number  // Threshold for auto-selecting (blue, right side)
    rejectThreshold: number  // Threshold for auto-rejecting (light red, left side)
    tagLabel: string  // Tag name (e.g., "well-explained", "fragmented")
    isLoading: boolean
  } | null

  // Whether threshold handle is currently being dragged (to prevent rapid updates)
  isDraggingThreshold: boolean
  setDraggingThreshold: (isDragging: boolean) => void

  // Threshold visualization state (for showing thresholds in table)
  thresholdVisualization: {
    visible: boolean
    mode: 'feature' | 'pair' | 'cause'
    selectThreshold: number       // Blue line threshold
    rejectThreshold: number       // Red line threshold
    selectPosition: number | null  // Row index for blue line
    rejectPosition: number | null  // Row index for red line
    previewAutoSelected: Set<number | string>  // IDs that would be auto-selected (blue stripe)
    previewAutoRejected: Set<number | string>  // IDs that would be auto-rejected (red stripe)
  } | null

  // Node selection for table filtering
  tableSelectedNodeIds: string[]

  // Table column display state
  scoreColumnDisplay: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION

  // Stage table state (decoder similarity stage table)
  activeStageNodeId: string | null
  activeStageCategory: string | null

  // Stage 1 revisiting state (for restoring state when returning from Stage 2+)
  isRevisitingStage1: boolean
  stage1FinalCommit: Stage1FinalCommit | null
  setStage1FinalCommit: (commit: Stage1FinalCommit | null) => void
  setIsRevisitingStage1: (value: boolean) => void

  // Stage table actions
  setActiveStageNode: (nodeId: string | null, category?: string | null) => void
  clearActiveStageNode: () => void
  activateCategoryTable: (categoryId: string) => Promise<void>
  moveToNextStep: () => void

  // Activation examples cache (centralized for all components)
  activationExamples: Record<number, ActivationExamples>
  activationLoading: Set<number>
  activationLoadingState: boolean

  // Activation examples actions (from activation-actions.ts)
  fetchActivationExamples: (featureIds: number[]) => Promise<void>
  fetchAllActivationsChunked: (featureIds: number[], chunkSize?: number) => Promise<void>
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

  // Cluster-based feature pairs state (for FeatureSplitPairViewer) - SIMPLIFIED FLOW
  allClusterPairs: null,  // ALL pair objects from clustering
  clusterGroups: null,
  featureToClusterMap: null,
  totalClusters: null,
  isLoadingDistributedPairs: false,

  // Cause similarity sort state (for cause table - multi-class OvR)
  causeSimilarityScores: new Map<number, number>(),  // Legacy
  causeCategoryConfidences: new Map<number, Record<string, number>>(),  // New: per-category confidences
  causeSortCategory: null,  // Sort by max confidence by default
  isCauseSimilaritySortLoading: false,

  // Similarity tagging popover state (for automatic tagging feature)
  tagAutomaticState: null,

  // Whether threshold handle is currently being dragged
  isDraggingThreshold: false,

  // Threshold visualization state (for showing thresholds in table)
  thresholdVisualization: null,

  // Node selection for table filtering
  tableSelectedNodeIds: [],
  selectedSegment: null,

  // Sankey-to-Selection flow visualization state
  selectedSankeySegment: null,
  sankeyToSelectionFlows: null,

  // Table column display state
  scoreColumnDisplay: METRIC_QUALITY_SCORE as typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION,

  // Stage table state
  activeStageNodeId: null,
  activeStageCategory: TAG_CATEGORY_FEATURE_SPLITTING,

  // Stage 1 revisiting state
  isRevisitingStage1: false,
  stage1FinalCommit: null,

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

export const useStore = create<AppState>((set, get) => {
  // Create action groups
  const commonActions = createCommonActions(set, get)
  const featureSplitActions = createFeatureSplitActions(set, get)
  const qualityActions = createQualityActions(set, get)
  const causeActions = createCauseActions(set, get)

  // Create unified routing actions for similarity tagging (routes based on mode)
  const unifiedSimilarityActions = {
    showTagAutomaticPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string, selectedFeatureIds?: Set<number>, threshold?: number) => {
      console.log('[store] Routing showTagAutomaticPopover - mode:', mode, ', features:', selectedFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5)
      if (mode === 'feature') {
        return qualityActions.showTagAutomaticPopover(mode, position, tagLabel, selectedFeatureIds, threshold)
      } else if (mode === 'pair') {
        return featureSplitActions.showTagAutomaticPopover(mode, position, tagLabel, selectedFeatureIds, threshold)
      } else if (mode === 'cause') {
        return causeActions.showTagAutomaticPopover(mode, position, tagLabel, selectedFeatureIds, threshold)
      }
    },

    applySimilarityTags: () => {
      const { tagAutomaticState } = get()
      if (!tagAutomaticState) return

      const { mode } = tagAutomaticState
      if (mode === 'feature') {
        return qualityActions.applySimilarityTags()
      } else if (mode === 'pair') {
        return featureSplitActions.applySimilarityTags()
      } else if (mode === 'cause') {
        return causeActions.applySimilarityTags()
      }
    },

    showThresholdsOnTable: async () => {
      const { tagAutomaticState } = get()
      if (!tagAutomaticState) return

      const { mode } = tagAutomaticState
      if (mode === 'feature') {
        return qualityActions.showThresholdsOnTable()
      } else if (mode === 'pair') {
        return featureSplitActions.showThresholdsOnTable()
      } else if (mode === 'cause') {
        return causeActions.showThresholdsOnTable()
      }
    },

    updateSimilarityThresholds: (selectThreshold: number) => {
      const { tagAutomaticState } = get()
      if (!tagAutomaticState) return

      const { mode } = tagAutomaticState
      if (mode === 'feature') {
        return qualityActions.updateSimilarityThresholds(selectThreshold)
      } else if (mode === 'pair') {
        return featureSplitActions.updateSimilarityThresholds(selectThreshold)
      } else if (mode === 'cause') {
        return causeActions.updateSimilarityThresholds(selectThreshold)
      }
    },

    updateBothSimilarityThresholds: (selectThreshold: number, rejectThreshold: number) => {
      const { tagAutomaticState } = get()

      // If no state exists yet, default to pair mode (Feature Split)
      if (!tagAutomaticState) {
        return featureSplitActions.updateBothSimilarityThresholds(selectThreshold, rejectThreshold)
      }

      const { mode } = tagAutomaticState
      if (mode === 'feature') {
        return qualityActions.updateBothSimilarityThresholds(selectThreshold, rejectThreshold)
      } else if (mode === 'pair') {
        return featureSplitActions.updateBothSimilarityThresholds(selectThreshold, rejectThreshold)
      } else if (mode === 'cause') {
        return causeActions.updateBothSimilarityThresholds(selectThreshold, rejectThreshold)
      }
    },

    // Shared functions (use any implementation - they're identical)
    hideTagAutomaticPopover: qualityActions.hideTagAutomaticPopover,
    minimizeSimilarityTaggingPopover: qualityActions.minimizeSimilarityTaggingPopover,
    restoreSimilarityTaggingPopover: qualityActions.restoreSimilarityTaggingPopover,
    hideThresholdsOnTable: qualityActions.hideThresholdsOnTable
  }

  return {
  ...initialState,

  // Compose Sankey actions
  ...createSimplifiedSankeyActions(set, get),

  // Compose common actions (shared by all stages)
  ...commonActions,

  // Compose Feature Split actions (Stage 1 - Pairs)
  getFeatureSplittingCounts: featureSplitActions.getFeatureSplittingCounts,
  sortPairsBySimilarity: featureSplitActions.sortPairsBySimilarity,
  fetchAllClusterPairs: featureSplitActions.fetchAllClusterPairs,
  clearDistributedPairs: featureSplitActions.clearDistributedPairs,
  fetchSimilarityHistogram: featureSplitActions.fetchSimilarityHistogram,

  // Compose Quality actions (Stage 2 - Features)
  sortBySimilarity: qualityActions.sortBySimilarity,

  // Compose Cause actions (Stage 3 - Multi-class)
  sortCauseBySimilarity: causeActions.sortCauseBySimilarity,
  setCauseSortCategory: causeActions.setCauseSortCategory,

  // Unified similarity tagging actions (route based on mode)
  ...unifiedSimilarityActions,

  // Compose activation actions
  ...createActivationActions(set, get),

  // Hover state actions
  setHoveredAlluvialNode: (nodeId: string | null, panel: 'left' | 'right' | null) =>
    set({ hoveredAlluvialNodeId: nodeId, hoveredAlluvialPanel: panel }),

  // Threshold drag state action
  setDraggingThreshold: (isDragging: boolean) => set({ isDraggingThreshold: isDragging }),

  // Stage 1 revisiting state actions
  setStage1FinalCommit: (commit: Stage1FinalCommit | null) => {
    set({ stage1FinalCommit: commit })
    console.log('[Store.setStage1FinalCommit] Saved Stage 1 final commit:', commit ? commit.pairSelectionStates.size : 0, 'pairs')
  },

  setIsRevisitingStage1: (value: boolean) => {
    set({ isRevisitingStage1: value })
    console.log('[Store.setIsRevisitingStage1] Set revisiting flag:', value)
  },

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
      pairSelectionSources: new Map<string, 'manual' | 'auto'>(),
      featureSelectionStates: new Map<number, 'selected' | 'rejected'>()
    })
  },

  restorePairSelectionStates: (states: Map<string, 'selected' | 'rejected'>, sources: Map<string, 'manual' | 'auto'>) => {
    set({
      pairSelectionStates: new Map(states),
      pairSelectionSources: new Map(sources),
      donePairSelectionStates: null
    })
  },

  restoreFeatureSelectionStates: (states: Map<number, 'selected' | 'rejected'>, sources: Map<number, 'manual' | 'auto'>) => {
    set({
      featureSelectionStates: new Map(states),
      featureSelectionSources: new Map(sources),
      doneFeatureSelectionStates: null,
      lastSortedSelectionSignature: null
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
      const thresholdPath = nodeId && panelState.sankeyTree
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

  // Update alluvial flows from both panel data (uses d3Layout)
  updateAlluvialFlows: () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    // Return null if either panel doesn't have visualization data
    if (!leftPanel.d3Layout || !rightPanel.d3Layout) {
      set({ alluvialFlows: null })
      return
    }

    // Extract leaf nodes (nodes with feature_ids) from both panels
    const leftFinalNodes = leftPanel.d3Layout.nodes.filter((node: SankeyNode) =>
      node.feature_ids && node.feature_ids.length > 0
    )
    const rightFinalNodes = rightPanel.d3Layout.nodes.filter((node: SankeyNode) =>
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

    console.log('🌳 Initializing tree-based system with empty root nodes (no d3Layout yet)')

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

    // OPTIMIZATION: Full parallel initialization with shared feature IDs
    // Step 1: Fetch all feature IDs first (single API call)
    const filters = {
      sae_id: [],
      explanation_method: [],
      llm_explainer: llmExplainers,
      llm_scorer: llmScorers
    }

    console.log('🔑 Step 1: Fetching all feature IDs...')
    const startTime = performance.now()
    const rootResponse = await api.getFeatureGroups({
      filters,
      metric: 'root',
      thresholds: []
    })
    const groups = processFeatureGroupResponse(rootResponse)
    if (groups.length === 0) {
      console.error('No features returned from API')
      return
    }
    const allFeatureIds = Array.from(groups[0].featureIds)
    console.log(`🔑 Feature IDs fetched: ${allFeatureIds.length} features in ${(performance.now() - startTime).toFixed(0)}ms`)

    // Step 2: Run ALL data loading in parallel (using shared feature IDs)
    console.log('🚀 Step 2: Starting parallel initialization: Table + Sankey + Activations')
    await Promise.all([
      get().fetchTableData(),
      get().buildSankeyFromFeatureIds(allFeatureIds, PANEL_LEFT),
      get().fetchAllActivationsCached()  // Optimized: single request with msgpack+gzip
    ])
    const totalDuration = performance.now() - startTime
    console.log(`✅ Full parallel initialization complete in ${totalDuration.toFixed(0)}ms - Table + Sankey + Activations ready`)

    // Activate Feature Splitting view by default
    await get().activateCategoryTable(TAG_CATEGORY_FEATURE_SPLITTING)
  }
}})

// Export for backward compatibility
export const useVisualizationStore = useStore
export const useAppStore = useStore

export default useStore
