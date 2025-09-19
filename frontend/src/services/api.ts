import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type {
  ApiClient,
  ApiClientConfig,
  ApiError,
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

// ============================================================================
// CONFIGURATION
// ============================================================================

// Determine backend URL based on environment
const getBackendURL = (): string => {
  // 1. Use explicit environment variable if set
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // 2. In development, use localhost with default port
  if (import.meta.env.DEV) {
    return 'http://localhost:8003'
  }

  // 3. In production, assume same origin (backend serves frontend)
  return window.location.origin
}

const DEFAULT_CONFIG: ApiClientConfig = {
  baseURL: '/api',
  healthURL: import.meta.env.VITE_HEALTH_URL || getBackendURL(),
  timeout: 30000, // 30 seconds
  debounceMs: 300
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiClientError extends Error {
  public code: string
  public status?: number
  public details?: Record<string, any>

  constructor(message: string, code: string, status?: number, details?: Record<string, any>) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function handleApiError(error: any): never {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      const apiError = error.response.data as ApiError
      throw new ApiClientError(
        apiError.error.message,
        apiError.error.code,
        error.response.status,
        apiError.error.details
      )
    } else if (error.response) {
      throw new ApiClientError(
        `HTTP ${error.response.status}: ${error.response.statusText}`,
        'HTTP_ERROR',
        error.response.status
      )
    } else if (error.request) {
      throw new ApiClientError(
        'Network error: Unable to reach the server',
        'NETWORK_ERROR'
      )
    }
  }

  throw new ApiClientError(
    error.message || 'An unexpected error occurred',
    'UNKNOWN_ERROR'
  )
}

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

class DebounceManager {
  private timers: Map<string, number> = new Map()

  debounce<T extends (...args: any[]) => Promise<any>>(
    key: string,
    fn: T,
    delay: number
  ): T {
    return ((...args: any[]) => {
      return new Promise((resolve, reject) => {
        // Clear existing timer
        const existingTimer = this.timers.get(key)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        // Set new timer
        const timer = setTimeout(async () => {
          try {
            const result = await fn(...args)
            resolve(result)
          } catch (error) {
            reject(error)
          } finally {
            this.timers.delete(key)
          }
        }, delay)

        this.timers.set(key, timer)
      })
    }) as T
  }

  clear(key?: string) {
    if (key) {
      const timer = this.timers.get(key)
      if (timer) {
        clearTimeout(timer)
        this.timers.delete(key)
      }
    } else {
      this.timers.forEach(timer => clearTimeout(timer))
      this.timers.clear()
    }
  }
}

// ============================================================================
// API CLIENT IMPLEMENTATION
// ============================================================================

export class SaeApiClient implements ApiClient {
  private axiosInstance: AxiosInstance
  private debounceManager: DebounceManager
  private config: ApiClientConfig
  public getHistogramDataDebounced: (request: HistogramDataRequest) => Promise<HistogramData>
  public getSankeyDataDebounced: (request: SankeyDataRequest) => Promise<SankeyData>

  constructor(config: Partial<ApiClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.debounceManager = new DebounceManager()

    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data)
        return config
      },
      (error) => {
        console.error('[API] Request error:', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`[API] ${response.status} ${response.config.url}`, response.data)
        return response
      },
      (error) => {
        console.error('[API] Response error:', error)
        return Promise.reject(error)
      }
    )

    // Initialize debounced methods
    this.getHistogramDataDebounced = this.debounceManager.debounce(
      'histogram',
      this.getHistogramData.bind(this),
      this.config.debounceMs
    )

    this.getSankeyDataDebounced = this.debounceManager.debounce(
      'sankey',
      this.getSankeyData.bind(this),
      this.config.debounceMs
    )
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  async getFilterOptions(): Promise<FilterOptions> {
    try {
      const response: AxiosResponse<FilterOptions> = await this.axiosInstance.get('/filter-options')
      return response.data
    } catch (error) {
      handleApiError(error)
    }
  }

  async getHistogramData(request: HistogramDataRequest): Promise<HistogramData> {
    try {
      const response: AxiosResponse<HistogramData> = await this.axiosInstance.post(
        '/histogram-data',
        request
      )
      return response.data
    } catch (error) {
      handleApiError(error)
    }
  }

  async getSankeyData(request: SankeyDataRequest): Promise<SankeyData> {
    try {
      const response: AxiosResponse<SankeyData> = await this.axiosInstance.post(
        '/sankey-data',
        request
      )
      return response.data
    } catch (error) {
      handleApiError(error)
    }
  }

  async getComparisonData(request: ComparisonDataRequest): Promise<ComparisonData> {
    try {
      const response: AxiosResponse<ComparisonData> = await this.axiosInstance.post(
        '/comparison-data',
        request
      )
      return response.data
    } catch (error) {
      handleApiError(error)
    }
  }

  async getFeatureDetail(featureId: number, params: Partial<Filters> = {}): Promise<FeatureDetail> {
    try {
      const response: AxiosResponse<FeatureDetail> = await this.axiosInstance.get(
        `/feature/${featureId}`,
        { params }
      )
      return response.data
    } catch (error) {
      handleApiError(error)
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  clearDebounce(key?: string) {
    this.debounceManager.clear(key)
  }

  isErrorCode(error: any, code: string): boolean {
    return error instanceof ApiClientError && error.code === code
  }

  getErrorMessage(error: any): string {
    if (error instanceof ApiClientError) {
      return error.message
    }
    return 'An unexpected error occurred'
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    try {
      // In development, use proxied health endpoint; in production, use configured URL
      if (import.meta.env.DEV) {
        await axios.get('/health', {
          timeout: this.config.timeout
        })
      } else {
        const healthURL = this.config.healthURL || this.config.baseURL.replace('/api', '')
        await axios.get('/health', {
          baseURL: healthURL,
          timeout: this.config.timeout
        })
      }
      return true
    } catch (error) {
      console.warn('[API] Health check failed:', error)
      return false
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const apiClient = new SaeApiClient()

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export const api = {
  // Filter options
  getFilterOptions: () => apiClient.getFilterOptions(),

  // Histogram data (with debouncing)
  getHistogramData: (request: HistogramDataRequest) => apiClient.getHistogramData(request),
  getHistogramDataDebounced: (request: HistogramDataRequest) =>
    apiClient.getHistogramDataDebounced(request),

  // Sankey data (with debouncing)
  getSankeyData: (request: SankeyDataRequest) => apiClient.getSankeyData(request),
  getSankeyDataDebounced: (request: SankeyDataRequest) =>
    apiClient.getSankeyDataDebounced(request),

  // Comparison data (Phase 2)
  getComparisonData: (request: ComparisonDataRequest) => apiClient.getComparisonData(request),

  // Feature detail
  getFeatureDetail: (featureId: number, params?: Partial<Filters>) =>
    apiClient.getFeatureDetail(featureId, params),

  // Utilities
  clearDebounce: (key?: string) => apiClient.clearDebounce(key),
  isErrorCode: (error: any, code: string) => apiClient.isErrorCode(error, code),
  getErrorMessage: (error: any) => apiClient.getErrorMessage(error),
  healthCheck: () => apiClient.healthCheck(),
}

export default api