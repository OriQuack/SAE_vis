import type {
  Filters,
  Thresholds,
  NodeThresholds,
  HierarchicalThresholds,
  PopoverState,
  FilterOptions,
  HistogramData,
  SankeyData,
  LoadingState,
  ErrorState,
  MetricType
} from '../../services/types'

// ============================================================================
// SLICE INTERFACES
// ============================================================================

export interface FilterSlice {
  // State
  filters: Filters
  filterOptions: FilterOptions | null

  // Actions
  setFilters: (filters: Partial<Filters>) => void
  resetFilters: () => void
}

export interface ThresholdSlice {
  // State
  thresholds: Thresholds
  nodeThresholds: NodeThresholds
  hierarchicalThresholds: HierarchicalThresholds

  // Actions
  setThresholds: (thresholds: Partial<Thresholds>) => void
  setNodeThreshold: (nodeId: string, metric: MetricType, threshold: number) => void
  clearNodeThreshold: (nodeId: string, metric?: MetricType) => void
  resetNodeThresholds: () => void
  setThresholdGroup: (groupId: string, metric: MetricType, threshold: number) => void
  clearThresholdGroup: (groupId: string, metric?: MetricType) => void
  getEffectiveThresholdForNode: (nodeId: string, metric: MetricType) => number
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => string[]
  resetThresholds: () => void
}

export interface PopoverSlice {
  // State
  popoverState: PopoverState

  // Actions
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string
  ) => void
  hideHistogramPopover: () => void
}

export interface ApiSlice {
  // State
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null
  currentMetric: MetricType
  loading: LoadingState
  errors: ErrorState

  // Actions
  setCurrentMetric: (metric: MetricType) => void
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (debounced?: boolean, nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], debounced?: boolean, nodeId?: string) => Promise<void>
  fetchSankeyData: (debounced?: boolean, nodeThresholdsOverride?: NodeThresholds) => Promise<void>
  clearError: (key: keyof ErrorState) => void
  clearAllErrors: () => void
}

export interface ViewSlice {
  // State
  viewState: 'empty' | 'filtering' | 'visualization'
  isFilterModalOpen: boolean

  // Actions
  setViewState: (state: 'empty' | 'filtering' | 'visualization') => void
  openFilterModal: () => void
  closeFilterModal: () => void
  showVisualization: () => void
  editFilters: () => void
  removeVisualization: () => void
  resetView: () => void
}

// ============================================================================
// COMBINED STATE INTERFACE
// ============================================================================

export interface VisualizationState extends FilterSlice, ThresholdSlice, PopoverSlice, ApiSlice, ViewSlice {
  // Reset action
  resetAll: () => void
}

// ============================================================================
// API REQUEST HELPER TYPES
// ============================================================================

export interface HistogramRequest {
  filters: Filters
  metric: MetricType
  bins: number
  nodeId?: string
}

export interface SankeyRequest {
  filters: Filters
  thresholds: Thresholds
  nodeThresholds?: NodeThresholds
  hierarchicalThresholds: HierarchicalThresholds
}

// ============================================================================
// SELECTOR RETURN TYPES
// ============================================================================

export interface FilterStateSelector {
  filters: Filters
  filterOptions: FilterOptions | null
  loading: boolean
  error: string | null
}

export interface HistogramStateSelector {
  data: Record<string, HistogramData> | null
  threshold: number
  metric: MetricType
  loading: boolean
  error: string | null
}

export interface SankeyStateSelector {
  data: SankeyData | null
  loading: boolean
  error: string | null
}