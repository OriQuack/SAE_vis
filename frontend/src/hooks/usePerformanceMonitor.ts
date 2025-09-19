/**
 * Custom hook for monitoring component performance
 * Tracks render times, re-renders, and performance metrics
 */

import { useRef, useEffect, useCallback } from 'react'

interface PerformanceMetrics {
  renderCount: number
  lastRenderTime: number
  averageRenderTime: number
  maxRenderTime: number
  minRenderTime: number
  renderHistory: number[]
}

interface UsePerformanceMonitorOptions {
  componentName: string
  enableLogging?: boolean
  warnThreshold?: number // ms
  historySize?: number
}

interface UsePerformanceMonitorReturn {
  metrics: PerformanceMetrics
  measureRender: () => () => void
  logMetrics: () => void
  resetMetrics: () => void
}

export function usePerformanceMonitor(
  options: UsePerformanceMonitorOptions
): UsePerformanceMonitorReturn {
  const {
    componentName,
    enableLogging = false,
    warnThreshold = 100,
    historySize = 20
  } = options

  const metricsRef = useRef<PerformanceMetrics>({
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
    maxRenderTime: 0,
    minRenderTime: Infinity,
    renderHistory: []
  })

  const renderStartTimeRef = useRef<number>(0)

  // Measure render start and end
  const measureRender = useCallback(() => {
    renderStartTimeRef.current = performance.now()

    return () => {
      const renderEndTime = performance.now()
      const renderTime = renderEndTime - renderStartTimeRef.current
      const metrics = metricsRef.current

      // Update metrics
      metrics.renderCount++
      metrics.lastRenderTime = renderTime
      metrics.maxRenderTime = Math.max(metrics.maxRenderTime, renderTime)
      metrics.minRenderTime = Math.min(metrics.minRenderTime, renderTime)

      // Update history
      metrics.renderHistory.push(renderTime)
      if (metrics.renderHistory.length > historySize) {
        metrics.renderHistory.shift()
      }

      // Calculate average
      metrics.averageRenderTime =
        metrics.renderHistory.reduce((sum, time) => sum + time, 0) /
        metrics.renderHistory.length

      // Log warning if threshold exceeded
      if (renderTime > warnThreshold && enableLogging) {
        console.warn(
          `[Performance] ${componentName} render took ${renderTime.toFixed(2)}ms (threshold: ${warnThreshold}ms)`
        )
      }

      // Log metrics if enabled
      if (enableLogging) {
        console.log(
          `[Performance] ${componentName}:`,
          `render #${metrics.renderCount}`,
          `time: ${renderTime.toFixed(2)}ms`,
          `avg: ${metrics.averageRenderTime.toFixed(2)}ms`
        )
      }
    }
  }, [componentName, enableLogging, warnThreshold, historySize])

  // Log current metrics
  const logMetrics = useCallback(() => {
    const metrics = metricsRef.current
    console.table({
      Component: componentName,
      'Render Count': metrics.renderCount,
      'Last Render (ms)': metrics.lastRenderTime.toFixed(2),
      'Average (ms)': metrics.averageRenderTime.toFixed(2),
      'Min (ms)': metrics.minRenderTime === Infinity ? 0 : metrics.minRenderTime.toFixed(2),
      'Max (ms)': metrics.maxRenderTime.toFixed(2),
      'History Size': metrics.renderHistory.length
    })
  }, [componentName])

  // Reset metrics
  const resetMetrics = useCallback(() => {
    metricsRef.current = {
      renderCount: 0,
      lastRenderTime: 0,
      averageRenderTime: 0,
      maxRenderTime: 0,
      minRenderTime: Infinity,
      renderHistory: []
    }
  }, [])

  // Track component mount/unmount
  useEffect(() => {
    if (enableLogging) {
      console.log(`[Performance] ${componentName} mounted`)
    }

    return () => {
      if (enableLogging) {
        console.log(`[Performance] ${componentName} unmounted`)
        logMetrics()
      }
    }
  }, [componentName, enableLogging, logMetrics])

  // Measure each render
  useEffect(() => {
    const cleanup = measureRender()
    return cleanup
  })

  return {
    metrics: metricsRef.current,
    measureRender,
    logMetrics,
    resetMetrics
  }
}

/**
 * Hook for tracking specific operations
 */
export function useOperationTimer(operationName: string) {
  const startTimeRef = useRef<number>(0)

  const startTimer = useCallback(() => {
    startTimeRef.current = performance.now()
  }, [])

  const endTimer = useCallback((log = true) => {
    const duration = performance.now() - startTimeRef.current
    if (log) {
      console.log(`[Timer] ${operationName}: ${duration.toFixed(2)}ms`)
    }
    return duration
  }, [operationName])

  return { startTimer, endTimer }
}