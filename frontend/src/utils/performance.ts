/**
 * Performance monitoring and optimization utilities
 */

interface PerformanceMetrics {
  renderTime: number
  apiCallTime: number
  memoryUsage?: number
  componentCount: number
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics[]> = new Map()
  private timers: Map<string, number> = new Map()

  startTimer(label: string): void {
    this.timers.set(label, performance.now())
  }

  endTimer(label: string): number {
    const startTime = this.timers.get(label)
    if (!startTime) {
      console.warn(`No timer found for label: ${label}`)
      return 0
    }

    const duration = performance.now() - startTime
    this.timers.delete(label)
    return duration
  }

  recordMetric(component: string, metric: Partial<PerformanceMetrics>): void {
    if (!this.metrics.has(component)) {
      this.metrics.set(component, [])
    }

    const metrics = this.metrics.get(component)!
    metrics.push({
      renderTime: 0,
      apiCallTime: 0,
      componentCount: 0,
      ...metric
    })

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift()
    }
  }

  getAverageMetrics(component: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(component)
    if (!metrics || metrics.length === 0) return null

    const sum = metrics.reduce((acc, m) => ({
      renderTime: acc.renderTime + m.renderTime,
      apiCallTime: acc.apiCallTime + m.apiCallTime,
      memoryUsage: (acc.memoryUsage || 0) + (m.memoryUsage || 0),
      componentCount: acc.componentCount + m.componentCount
    }))

    return {
      renderTime: sum.renderTime / metrics.length,
      apiCallTime: sum.apiCallTime / metrics.length,
      memoryUsage: sum.memoryUsage ? sum.memoryUsage / metrics.length : undefined,
      componentCount: sum.componentCount / metrics.length
    }
  }

  getReport(): Record<string, PerformanceMetrics | null> {
    const report: Record<string, PerformanceMetrics | null> = {}
    this.metrics.forEach((_, component) => {
      report[component] = this.getAverageMetrics(component)
    })
    return report
  }

  clear(): void {
    this.metrics.clear()
    this.timers.clear()
  }
}

export const performanceMonitor = new PerformanceMonitor()

/**
 * React hook for performance monitoring
 */
import { useEffect, useRef } from 'react'

export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>()

  useEffect(() => {
    renderStartTime.current = performance.now()

    return () => {
      if (renderStartTime.current) {
        const renderTime = performance.now() - renderStartTime.current
        performanceMonitor.recordMetric(componentName, { renderTime })
      }
    }
  })

  const measureApiCall = async <T,>(
    apiCall: () => Promise<T>,
    label?: string
  ): Promise<T> => {
    const startTime = performance.now()
    try {
      const result = await apiCall()
      const duration = performance.now() - startTime
      performanceMonitor.recordMetric(componentName, {
        apiCallTime: duration
      })
      if (label) {
        console.debug(`API call "${label}" took ${duration.toFixed(2)}ms`)
      }
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`API call failed after ${duration.toFixed(2)}ms`, error)
      throw error
    }
  }

  return { measureApiCall }
}

/**
 * Debounce function with TypeScript support
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, wait)
  }
}

/**
 * Throttle function with TypeScript support
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Memory-efficient LRU cache
 */
export class LRUCache<K, V> {
  private capacity: number
  private cache: Map<K, V>

  constructor(capacity: number) {
    this.capacity = capacity
    this.cache = new Map()
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined

    // Move to end (most recently used)
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.capacity) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}