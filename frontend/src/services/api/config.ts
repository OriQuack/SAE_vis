export interface ApiConfig {
  baseURL: string
  healthURL: string
  timeout: number
  debounceMs: number
}

/**
 * Determine backend URL based on environment configuration
 */
function getBackendURL(): string {
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

export const API_CONFIG: ApiConfig = {
  baseURL: '/api',
  healthURL: import.meta.env.VITE_HEALTH_URL || getBackendURL(),
  timeout: 30000, // 30 seconds
  debounceMs: 300
}

export const isDevelopment = import.meta.env.DEV