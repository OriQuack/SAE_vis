import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import { API_CONFIG, isDevelopment } from './config'
import { handleApiError } from './errors'
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
} from '../types/api'

// ============================================================================
// AXIOS INSTANCE
// ============================================================================

const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Request interceptor for logging in development
  instance.interceptors.request.use(
    (config) => {
      if (isDevelopment) {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data)
      }
      return config
    },
    (error) => {
      if (isDevelopment) {
        console.error('[API] Request error:', error)
      }
      return Promise.reject(error)
    }
  )

  // Response interceptor for logging and error handling
  instance.interceptors.response.use(
    (response) => {
      if (isDevelopment) {
        console.log(`[API] ${response.status} ${response.config.url}`, response.data)
      }
      return response
    },
    (error) => {
      if (isDevelopment) {
        console.error('[API] Response error:', error)
      }
      return Promise.reject(error)
    }
  )

  return instance
}

const axiosInstance = createAxiosInstance()

// ============================================================================
// API METHODS
// ============================================================================

export async function getFilterOptions(): Promise<FilterOptions> {
  try {
    const response: AxiosResponse<FilterOptions> = await axiosInstance.get('/filter-options')
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

export async function getHistogramData(request: HistogramDataRequest): Promise<HistogramData> {
  try {
    const response: AxiosResponse<HistogramData> = await axiosInstance.post(
      '/histogram-data',
      request
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

export async function getSankeyData(request: SankeyDataRequest): Promise<SankeyData> {
  try {
    const response: AxiosResponse<SankeyData> = await axiosInstance.post(
      '/sankey-data',
      request
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

export async function getComparisonData(request: ComparisonDataRequest): Promise<ComparisonData> {
  try {
    const response: AxiosResponse<ComparisonData> = await axiosInstance.post(
      '/comparison-data',
      request
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

export async function getFeatureDetail(featureId: number, params: Partial<Filters> = {}): Promise<FeatureDetail> {
  try {
    const response: AxiosResponse<FeatureDetail> = await axiosInstance.get(
      `/feature/${featureId}`,
      { params }
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    // In development, use proxied health endpoint; in production, use configured URL
    if (isDevelopment) {
      await axios.get('/health', {
        timeout: API_CONFIG.timeout
      })
    } else {
      const healthURL = API_CONFIG.healthURL || API_CONFIG.baseURL.replace('/api', '')
      await axios.get('/health', {
        baseURL: healthURL,
        timeout: API_CONFIG.timeout
      })
    }
    return true
  } catch (error) {
    if (isDevelopment) {
      console.warn('[API] Health check failed:', error)
    }
    return false
  }
}