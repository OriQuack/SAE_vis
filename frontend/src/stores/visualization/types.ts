import type {
  Filters,
  Thresholds,
  NodeThresholds,
  HierarchicalThresholds,
  PopoverState,
  FilterOptions,
  HistogramData,
  SankeyData,
  MetricType
} from '../../services/types'

// ============================================================================
// ENHANCED ERROR TYPES
// ============================================================================

export type ApiErrorCode =
  | 'INVALID_FILTERS'
  | 'INSUFFICIENT_DATA'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNEXPECTED_ERROR'

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: any
}

// ============================================================================
// ENHANCED LOADING STATES
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

// ============================================================================
// SLICE INTERFACES WITH IMPROVED TYPE SAFETY
// ============================================================================

export interface FilterSlice {
  // State
  readonly filters: Filters
  readonly filterOptions: FilterOptions | null

  // Actions
  setFilters: (_filters: Partial<Filters>) => void
  resetFilters: () => void
}

export interface ThresholdSlice {
  // State
  readonly thresholds: Thresholds
  readonly nodeThresholds: NodeThresholds
  readonly hierarchicalThresholds: HierarchicalThresholds

  // Actions
  setThresholds: (_thresholds: Partial<Thresholds>) => void
  setNodeThreshold: (_nodeId: string, _metric: MetricType, _threshold: number) => void
  clearNodeThreshold: (_nodeId: string, _metric?: MetricType) => void
  resetNodeThresholds: () => void
  setThresholdGroup: (_groupId: string, _metric: MetricType, _threshold: number) => void
  clearThresholdGroup: (_groupId: string, _metric?: MetricType) => void
  getEffectiveThresholdForNode: (_nodeId: string, _metric: MetricType) => number
  getNodesInSameThresholdGroup: (_nodeId: string, _metric: MetricType) => string[]
  resetThresholds: () => void
}

export interface PopoverSlice {
  // State
  readonly popoverState: PopoverState

  // Actions
  showHistogramPopover: (
    _nodeId: string,
    _nodeName: string,
    _metrics: MetricType[],
    _position: { x: number; y: number },
    _parentNodeId?: string,
    _parentNodeName?: string
  ) => void
  hideHistogramPopover: () => void
}

export interface ApiSlice {
  // State
  readonly histogramData: Record<string, HistogramData> | null
  readonly sankeyData: SankeyData | null
  readonly currentMetric: MetricType
  readonly loading: LoadingStates
  readonly errors: ErrorStates

  // Actions
  setCurrentMetric: (_metric: MetricType) => void
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (_debounced?: boolean, _nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (_metrics: MetricType[], _debounced?: boolean, _nodeId?: string) => Promise<void>
  fetchSankeyData: (_debounced?: boolean, _nodeThresholdsOverride?: NodeThresholds) => Promise<void>
  clearError: (_key: keyof ErrorStates) => void
  clearAllErrors: () => void
}

export interface ViewSlice {
  // State
  readonly viewState: 'empty' | 'filtering' | 'visualization'

  // Actions
  setViewState: (_state: 'empty' | 'filtering' | 'visualization') => void
  showVisualization: () => void
  editFilters: () => void
  removeVisualization: () => void
  resetView: () => void
}

// ============================================================================
// COMPOSITE ACTIONS INTERFACE
// ============================================================================

export interface CompositeActions {
  clearAllErrors: () => void
  clearErrorsAfterFilterChange: () => void
  clearErrorsAfterThresholdChange: () => void
  resetDataOnFilterChange: () => void
  setLoadingStates: (_loadingStates: Partial<LoadingStates>) => void
}

// ============================================================================
// COMBINED STATE INTERFACE
// ============================================================================

export interface VisualizationState
  extends FilterSlice,
          ThresholdSlice,
          PopoverSlice,
          ApiSlice,
          ViewSlice,
          CompositeActions {
  // Global reset action
  resetAll: () => void
}

// ============================================================================
// SELECTOR RETURN TYPES WITH BETTER TYPE SAFETY
// ============================================================================

export interface FilterStateSelector {
  readonly filters: Filters
  readonly filterOptions: FilterOptions | null
  readonly loading: boolean
  readonly error: string | null
}

export interface HistogramStateSelector {
  readonly data: Record<string, HistogramData> | null
  readonly threshold: number
  readonly metric: MetricType
  readonly loading: boolean
  readonly error: string | null
}

export interface SankeyStateSelector {
  readonly data: SankeyData | null
  readonly loading: boolean
  readonly error: string | null
}

// ============================================================================
// API REQUEST TYPES
// ============================================================================

export interface ApiRequest {
  readonly timestamp: number
  readonly requestId: string
}

export interface HistogramApiRequest extends ApiRequest {
  readonly filters: Filters
  readonly metric: MetricType
  readonly bins: number
  readonly nodeId?: string
}

export interface SankeyApiRequest extends ApiRequest {
  readonly filters: Filters
  readonly thresholds: Thresholds
  readonly nodeThresholds?: NodeThresholds
  readonly hierarchicalThresholds: HierarchicalThresholds
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' &&
         error !== null &&
         'code' in error &&
         'message' in error
}

export function isValidMetric(metric: string): metric is MetricType {
  const validMetrics: MetricType[] = [
    'semdist_mean',
    'feature_splitting',
    'score_fuzz',
    'score_simulation',
    'score_detection'
  ]
  return validMetrics.includes(metric as MetricType)
}