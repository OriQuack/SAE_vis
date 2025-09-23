import type { StateCreator } from 'zustand'
import type {
  Filters,
  Thresholds,
  HierarchicalThresholds,
  FilterOptions,
  HistogramData,
  SankeyData,
  MetricType,
  PopoverState
} from '../services/types'

// ============================================================================
// ERROR & LOADING STATES
// ============================================================================

export interface LoadingStates {
  filters: boolean
  histogram: boolean
  sankey: boolean
  comparison: boolean
}

export interface ErrorStates {
  filters: string | null
  histogram: string | null
  sankey: string | null
  comparison: string | null
}

export type ViewState = 'empty' | 'filtering' | 'visualization'

// ============================================================================
// DATA SLICE - All data-related state
// ============================================================================

export interface DataSlice {
  // Filters & Options
  filters: Filters
  filterOptions: FilterOptions | null

  // Thresholds
  thresholds: Thresholds
  hierarchicalThresholds: HierarchicalThresholds
  currentMetric: MetricType

  // API Data
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null

  // Actions
  setFilters: (filters: Partial<Filters>) => void
  resetFilters: () => void
  setThresholds: (thresholds: Partial<Thresholds>) => void
  setCurrentMetric: (metric: MetricType) => void
  setHistogramData: (data: Record<string, HistogramData> | null) => void
  setSankeyData: (data: SankeyData | null) => void

  // API Actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (debounced?: boolean, nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], debounced?: boolean, nodeId?: string) => Promise<void>
  fetchSankeyData: (debounced?: boolean) => Promise<void>

  // Threshold Group Functions
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => string[]
  getEffectiveThresholdForNode: (nodeId: string, metric: MetricType) => number
  setThresholdGroup: (groupId: string, metric: MetricType, threshold: number) => void

  resetData: () => void
}

// ============================================================================
// UI SLICE - All UI-related state
// ============================================================================

export interface UISlice {
  // View State
  viewState: ViewState

  // Popover State
  popoverState: PopoverState

  // Loading & Error States
  loading: LoadingStates
  errors: ErrorStates

  // Actions
  setViewState: (state: ViewState) => void
  showVisualization: () => void
  editFilters: () => void
  removeVisualization: () => void

  // Popover Actions
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string
  ) => void
  hideHistogramPopover: () => void

  // Loading & Error Actions
  setLoading: (key: keyof LoadingStates, value: boolean) => void
  setError: (key: keyof ErrorStates, error: string | null) => void
  clearError: (key: keyof ErrorStates) => void
  clearAllErrors: () => void

  resetUI: () => void
}

// ============================================================================
// COMBINED APP STATE
// ============================================================================

export interface AppState extends DataSlice, UISlice {
  resetAll: () => void
}

// ============================================================================
// ZUSTAND SLICE CREATORS
// ============================================================================

export type DataSliceCreator = StateCreator<AppState, [], [], DataSlice>
export type UISliceCreator = StateCreator<AppState, [], [], UISlice>

// ============================================================================
// CONSTANTS
// ============================================================================

export const INITIAL_FILTERS: Filters = {
  sae_id: [],
  explanation_method: [],
  llm_explainer: [],
  llm_scorer: []
}

export const INITIAL_THRESHOLDS: Thresholds = {
  feature_splitting: 0.1,
  semdist_mean: 0.1,
  score_high: 0.5
}

export const INITIAL_HIERARCHICAL_THRESHOLDS: HierarchicalThresholds = {
  global_thresholds: INITIAL_THRESHOLDS
}

export const INITIAL_POPOVER_STATE: PopoverState = {
  histogram: null
}

export const INITIAL_LOADING: LoadingStates = {
  filters: false,
  histogram: false,
  sankey: false,
  comparison: false
}

export const INITIAL_ERRORS: ErrorStates = {
  filters: null,
  histogram: null,
  sankey: null,
  comparison: null
}

export const INITIAL_CURRENT_METRIC: MetricType = 'semdist_mean'