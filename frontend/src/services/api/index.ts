import * as client from './client'
import { debounceManager } from './debounce'
import { API_CONFIG } from './config'
import type {
  _HistogramDataRequest,
  _SankeyDataRequest,
  _ComparisonDataRequest,
  _Filters
} from '../types/api'

// ============================================================================
// DEBOUNCED API METHODS
// ============================================================================

const getHistogramDataDebounced = debounceManager.debounce(
  'histogram',
  client.getHistogramData,
  API_CONFIG.debounceMs
)

const getSankeyDataDebounced = debounceManager.debounce(
  'sankey',
  client.getSankeyData,
  API_CONFIG.debounceMs
)

// ============================================================================
// MAIN API INTERFACE
// ============================================================================

export const api = {
  // Filter options
  getFilterOptions: client.getFilterOptions,

  // Histogram data (with debouncing)
  getHistogramData: client.getHistogramData,
  getHistogramDataDebounced,

  // Sankey data (with debouncing)
  getSankeyData: client.getSankeyData,
  getSankeyDataDebounced,

  // Comparison data (Phase 2)
  getComparisonData: client.getComparisonData,

  // Feature detail
  getFeatureDetail: client.getFeatureDetail,

  // Health check
  healthCheck: client.healthCheck,

  // Utilities
  clearDebounce: (key?: string) => debounceManager.clear(key),
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export { ApiClientError, isErrorCode, getErrorMessage } from './errors'
export type { ApiConfig } from './config'

// Export default for backward compatibility
export default api