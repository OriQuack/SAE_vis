import type {
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
  SankeyData,
  SankeyDataRequest,
  ComparisonData,
  ComparisonDataRequest,
  FeatureDetail,
  Filters
} from './types'

const API_BASE = '/api'

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE}/filter-options`)
  if (!response.ok) {
    throw new Error(`Failed to fetch filter options: ${response.status}`)
  }
  return response.json()
}

export async function getHistogramData(request: HistogramDataRequest): Promise<HistogramData> {
  const response = await fetch(`${API_BASE}/histogram-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch histogram data: ${response.status}`)
  }
  return response.json()
}

export async function getSankeyData(request: SankeyDataRequest): Promise<SankeyData> {
  const response = await fetch(`${API_BASE}/sankey-data`, {
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
  const response = await fetch(`${API_BASE}/comparison-data`, {
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
  const url = new URL(`${API_BASE}/feature/${featureId}`, window.location.origin)
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