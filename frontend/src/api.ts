import type {
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
  FeatureDetail,
  Filters,
  TableDataRequest,
  FeatureTableDataResponse
} from './types'

// ============================================================================
// METRIC NAME MAPPING (Frontend → Backend)
// ============================================================================

/**
 * Map frontend metric names to backend metric names
 * Frontend uses "quality_score" for display, but backend expects "overall_score"
 * Frontend uses "semantic_similarity" for display, but backend expects "semsim_mean"
 */
const FRONTEND_TO_BACKEND_METRIC: Record<string, string> = {
  'quality_score': 'overall_score',
  'semantic_similarity': 'semsim_mean'
  // All other metrics (feature_splitting, score_embedding, etc.) use same name
}

/**
 * Convert frontend metric name to backend metric name
 */
function mapMetricToBackend(metric: string): string {
  return FRONTEND_TO_BACKEND_METRIC[metric] || metric
}

// ============================================================================
// API CONFIGURATION
// ============================================================================
const API_BASE_URL = "/api"

const API_ENDPOINTS = {
  FILTER_OPTIONS: "/filter-options",
  HISTOGRAM_DATA: "/histogram-data",
  FEATURE_DETAIL: "/feature",
  TABLE_DATA: "/table-data",
  FEATURE_GROUPS: "/feature-groups"
} as const

const API_BASE = API_BASE_URL

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FILTER_OPTIONS}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch filter options: ${response.status}`)
  }
  return response.json()
}

export async function getHistogramData(request: HistogramDataRequest): Promise<HistogramData> {
  const backendRequest = {
    ...request,
    metric: mapMetricToBackend(request.metric),  // Map frontend metric to backend metric
    thresholdPath: request.thresholdPath?.map(constraint => ({
      metric: mapMetricToBackend(constraint.metric),  // Map threshold path metrics too
      range_label: constraint.rangeLabel
    }))
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.HISTOGRAM_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backendRequest)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Histogram API error:', response.status, errorText)
    throw new Error(`Failed to fetch histogram data: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getFeatureDetail(featureId: number, params: Partial<Filters> = {}): Promise<FeatureDetail> {
  const url = new URL(`${API_BASE}${API_ENDPOINTS.FEATURE_DETAIL}/${featureId}`, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value && Array.isArray(value) && value.length > 0) {
      value.forEach(v => url.searchParams.append(key, v))
    }
  })

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Failed to fetch feature detail: ${response.status}`)
  }
  return response.json()
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch('/health')
    return response.ok
  } catch {
    return false
  }
}

export async function getTableData(request: TableDataRequest): Promise<FeatureTableDataResponse> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.TABLE_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Table API error:', response.status, errorText)
    throw new Error(`Failed to fetch table data: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getFeatureGroups(request: {
  filters: Filters
  metric: string
  thresholds: number[]
}): Promise<{
  metric: string
  groups: Array<{
    group_index: number
    range_label: string
    feature_ids?: number[]
    feature_ids_by_source?: Record<string, number[]>
    feature_count: number
  }>
  total_features: number
}> {
  // Map frontend metric to backend metric before sending request
  const backendRequest = {
    ...request,
    metric: mapMetricToBackend(request.metric)
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FEATURE_GROUPS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backendRequest)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Feature groups API error:', response.status, errorText)
    throw new Error(`Failed to fetch feature groups: ${response.status} - ${errorText}`)
  }
  return response.json()
}