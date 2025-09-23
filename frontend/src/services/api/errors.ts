import axios from 'axios'

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

export type ApiErrorCode =
  | 'INVALID_FILTERS'
  | 'INVALID_THRESHOLDS'
  | 'INVALID_METRIC'
  | 'INSUFFICIENT_DATA'
  | 'FEATURE_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'UNKNOWN_ERROR'

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

export function handleApiError(error: any): never {
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

export function isErrorCode(error: any, code: string): boolean {
  return error instanceof ApiClientError && error.code === code
}

export function getErrorMessage(error: any): string {
  if (error instanceof ApiClientError) {
    return error.message
  }
  return 'An unexpected error occurred'
}