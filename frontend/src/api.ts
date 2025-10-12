import type {
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
  SankeyData,
  SankeyDataRequest,
  ComparisonData,
  ComparisonDataRequest,
  FeatureDetail,
  Filters,
  LLMComparisonData,
  UMAPDataRequest,
  UMAPDataResponse
} from './types'

// ============================================================================
// API CONFIGURATION
// ============================================================================
const API_BASE_URL = "/api"

const API_ENDPOINTS = {
  FILTER_OPTIONS: "/filter-options",
  HISTOGRAM_DATA: "/histogram-data",
  SANKEY_DATA: "/sankey-data",
  COMPARISON_DATA: "/comparison-data",
  FEATURE_DETAIL: "/feature",
  LLM_COMPARISON: "/llm-comparison",
  UMAP_DATA: "/umap-data"
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
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.HISTOGRAM_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Histogram API error:', response.status, errorText)
    throw new Error(`Failed to fetch histogram data: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getSankeyData(request: SankeyDataRequest): Promise<SankeyData> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.SANKEY_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch sankey data: ${response.status}`)
  }
  return response.json()
}

export async function getComparisonData(request: ComparisonDataRequest): Promise<ComparisonData> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.COMPARISON_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch comparison data: ${response.status}`)
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

export async function getFeaturesInThreshold(
  filters: Filters,
  metric: string,
  minValue: number,
  maxValue: number
): Promise<{ feature_ids: number[]; total_count: number }> {
  console.log('[getFeaturesInThreshold] Request:', { filters, metric, minValue, maxValue })

  const response = await fetch(`${API_BASE}/features-in-threshold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters,
      metric,
      min_value: minValue,
      max_value: maxValue
    })
  })

  if (!response.ok) {
    console.error('[getFeaturesInThreshold] Error:', response.status, response.statusText)
    throw new Error(`Failed to fetch features in threshold: ${response.status}`)
  }

  const result = await response.json()
  console.log('[getFeaturesInThreshold] Response:', result)
  return result
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch('/health')
    return response.ok
  } catch {
    return false
  }
}

export async function getFilteredHistogramPanelData(
  featureIds: number[]
): Promise<Record<string, HistogramData>> {
  const response = await fetch(`${API_BASE}/histogram-panel-data-filtered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ featureIds })
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Filtered histogram panel API error:', response.status, errorText)
    throw new Error(`Failed to fetch filtered histogram panel data: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  return data.histograms  // Extract histograms dict from response
}

export async function getLLMComparisonData(filters: Filters = {}): Promise<LLMComparisonData> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.LLM_COMPARISON}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters })
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch LLM comparison data: ${response.status}`)
  }
  return response.json()
}

export async function getUMAPData(request: UMAPDataRequest): Promise<UMAPDataResponse> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.UMAP_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('UMAP API error:', response.status, errorText)
    throw new Error(`Failed to fetch UMAP data: ${response.status} - ${errorText}`)
  }
  return response.json()
}