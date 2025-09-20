import { ApiClientError } from '../../services/api'
import type { Filters, MetricType } from '../../services/types'
import { ERROR_MESSAGES } from './constants'

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'INVALID_FILTERS':
        return ERROR_MESSAGES.INVALID_FILTERS
      case 'INSUFFICIENT_DATA':
        return ERROR_MESSAGES.INSUFFICIENT_DATA
      case 'NETWORK_ERROR':
        return ERROR_MESSAGES.NETWORK_ERROR
      case 'INTERNAL_ERROR':
        return ERROR_MESSAGES.INTERNAL_ERROR
      default:
        return error.message
    }
  }
  return ERROR_MESSAGES.UNEXPECTED_ERROR
}

// ============================================================================
// FILTER UTILITIES
// ============================================================================

export function hasActiveFilters(filters: Filters): boolean {
  return Object.values(filters).some(filterArray => filterArray && filterArray.length > 0)
}

// ============================================================================
// THRESHOLD UTILITIES
// ============================================================================

export function getThresholdKey(metric: MetricType): keyof { semdist_mean: number; score_high: number } | MetricType {
  if (metric === 'semdist_mean') {
    return 'semdist_mean'
  }
  if (metric.includes('score')) {
    return 'score_high'
  }
  return metric
}

export function shouldUpdateThreshold(metric: MetricType, currentThresholds: Record<string, number>): boolean {
  const thresholdKey = getThresholdKey(metric)
  return thresholdKey in currentThresholds
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

export function logThresholdUpdate(type: 'node' | 'group', id: string, metric: MetricType, threshold: number): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🎯 Setting ${type} threshold: ${id}.${metric} = ${threshold}`)
  }
}

export function logThresholdState(state: any, label: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🎯 New ${label} state:`, JSON.stringify(state, null, 2))
  }
}

export function logApiRequest(request: any, endpoint: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 ${endpoint} API Request:`, JSON.stringify(request, null, 2))
  }
}