import type {
  Filters,
  Thresholds,
  NodeThresholds,
  HierarchicalThresholds,
  PopoverState,
  LoadingState,
  ErrorState,
  MetricType
} from '../../services/types'

// ============================================================================
// INITIAL STATES
// ============================================================================

export const INITIAL_FILTERS: Filters = {
  sae_id: [],
  explanation_method: [],
  llm_explainer: [],
  llm_scorer: []
}

// Default thresholds - these will be automatically updated to the mean values
// from the histogram data once it's fetched
export const INITIAL_THRESHOLDS: Thresholds = {
  semdist_mean: 0.1,  // Default to middle of range (0-1), will be replaced with actual mean
  score_high: 0.5     // Default to middle of range (0-1), will be replaced with actual mean
}

export const INITIAL_NODE_THRESHOLDS: NodeThresholds = {}

export const INITIAL_HIERARCHICAL_THRESHOLDS: HierarchicalThresholds = {
  global_thresholds: INITIAL_THRESHOLDS
}

export const INITIAL_POPOVER_STATE: PopoverState = {
  histogram: null
}

export const INITIAL_LOADING: LoadingState = {
  filters: false,
  histogram: false,
  sankey: false,
  comparison: false
}

export const INITIAL_ERRORS: ErrorState = {
  filters: null,
  histogram: null,
  sankey: null,
  comparison: null
}

export const INITIAL_CURRENT_METRIC: MetricType = 'semdist_mean'

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  INVALID_FILTERS: 'Invalid filter selection. Please check your selections and try again.',
  INSUFFICIENT_DATA: 'Not enough data matches your current filters. Try adjusting your selection.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your connection.',
  INTERNAL_ERROR: 'A server error occurred. Please try again later.',
  UNEXPECTED_ERROR: 'An unexpected error occurred'
} as const

// ============================================================================
// API CONFIGURATION
// ============================================================================

export const API_CONFIG = {
  DEFAULT_BINS: 20,
  DEBOUNCE_DELAY: 300
} as const

// ============================================================================
// STORE CONFIGURATION
// ============================================================================

export const STORE_CONFIG = {
  STORE_NAME: 'visualization-store',
  // Only persist filters and thresholds, not data or loading states
  PERSIST_KEYS: [
    'filters',
    'thresholds',
    'nodeThresholds',
    'hierarchicalThresholds',
    'currentMetric'
  ]
} as const