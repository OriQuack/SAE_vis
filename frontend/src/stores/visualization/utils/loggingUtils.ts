import type { MetricType } from '../../../services/types'

// Environment check helper
const isDevelopment = typeof window !== 'undefined' && import.meta.env?.DEV

/**
 * Log threshold updates in development mode
 */
export function logThresholdUpdate(type: 'node' | 'group', id: string, metric: MetricType, threshold: number): void {
  if (isDevelopment) {
    console.log(`🎯 Setting ${type} threshold: ${id}.${metric} = ${threshold}`)
  }
}

/**
 * Log threshold state in development mode
 */
export function logThresholdState(state: any, label: string): void {
  if (isDevelopment) {
    console.log(`🎯 New ${label} state:`, JSON.stringify(state, null, 2))
  }
}

/**
 * Log API requests in development mode
 */
export function logApiRequest(request: any, endpoint: string): void {
  if (isDevelopment) {
    console.log(`🔍 ${endpoint} API Request:`, JSON.stringify(request, null, 2))
  }
}

/**
 * Log state changes in development mode
 */
export function logStateChange(sliceName: string, actionName: string, newState?: any): void {
  if (isDevelopment) {
    console.log(`🔄 ${sliceName}.${actionName}`, newState ? JSON.stringify(newState, null, 2) : '')
  }
}