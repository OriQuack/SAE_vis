// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import { useRef, useEffect, useState, useCallback } from 'react'
import type { MetricType, Filters, ThresholdTree, SankeyData, HistogramData } from '../types'
import {
  METRIC_SEMSIM_MEAN,
  METRIC_SCORE_FUZZ,
  METRIC_FEATURE_SPLITTING
} from './constants'

// ============================================================================
// TYPES
// ============================================================================

// Hook Types
interface Size {
  width: number
  height: number
}

interface UseResizeObserverOptions {
  defaultWidth?: number
  defaultHeight?: number
  debounceMs?: number
  debugId?: string
}

interface UseResizeObserverReturn<T extends HTMLElement = HTMLElement> {
  ref: (node: T | null) => void
  size: Size
}

// Panel State (matches store.ts PanelState)
interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to observe element size changes with debouncing
 */
export const useResizeObserver = <T extends HTMLElement = HTMLElement>({
  defaultWidth = 0,
  defaultHeight = 0,
  debounceMs = 100,
  debugId = 'unknown'
}: UseResizeObserverOptions = {}): UseResizeObserverReturn<T> => {
  const [size, setSize] = useState<Size>({ width: defaultWidth, height: defaultHeight })
  const timeoutRef = useRef<number | undefined>(undefined)
  const observerRef = useRef<ResizeObserver | null>(null)
  const debugIdRef = useRef(debugId)

  // Update debugId ref when it changes
  debugIdRef.current = debugId

  const callbackRef = useCallback((node: T | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
    //   console.log(`[useResizeObserver ${debugIdRef.current}] Element attached, measuring immediately`)

      // Immediate measurement
      const rect = node.getBoundingClientRect()
      const newSize = {
        width: rect.width || defaultWidth,
        height: rect.height || defaultHeight
      }
    //   console.log(`[useResizeObserver ${debugIdRef.current}] Initial size:`, newSize)
      setSize(newSize)

      // Set up observer for future changes
      observerRef.current = new ResizeObserver(() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(() => {
          const rect = node.getBoundingClientRect()
          const newSize = {
            width: rect.width || defaultWidth,
            height: rect.height || defaultHeight
          }
        //   console.log(`[useResizeObserver ${debugIdRef.current}] Resize detected:`, newSize)
          setSize(newSize)
        }, debounceMs)
      })
      observerRef.current.observe(node)
    }
  }, [defaultWidth, defaultHeight, debounceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { ref: callbackRef, size }
}

/**
 * Hook to handle data loading for a panel (left or right)
 * Consolidates duplicate filter and threshold watching logic
 */
export const usePanelDataLoader = (
  panel: 'left' | 'right',
  panelState: PanelState,
  isHealthy: boolean,
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string, panel?: 'left' | 'right') => Promise<void>,
  fetchSankeyData: (panel?: 'left' | 'right') => void
): void => {
  // Watch for filter changes and fetch data
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(panelState.filters).some(
        (filterArray): filterArray is string[] => filterArray !== undefined && filterArray.length > 0
      )

      if (hasActiveFilters) {
        try {
          await fetchMultipleHistogramData(
            [METRIC_FEATURE_SPLITTING, METRIC_SEMSIM_MEAN, METRIC_SCORE_FUZZ],
            undefined,
            panel
          )
          fetchSankeyData(panel)
        } catch (error) {
          console.error(`Failed to load ${panel} visualization data:`, error)
        }
      }
    }

    if (isHealthy) {
      loadData()
    }
  }, [panelState.filters, isHealthy, fetchMultipleHistogramData, fetchSankeyData, panel])

  // Watch for threshold changes and re-fetch Sankey data
  useEffect(() => {
    const hasActiveFilters = Object.values(panelState.filters).some(
      (filterArray): filterArray is string[] => filterArray !== undefined && filterArray.length > 0
    )

    if (hasActiveFilters && isHealthy) {
      try {
        fetchSankeyData(panel)
      } catch (error) {
        console.error(`Failed to update ${panel} Sankey data:`, error)
      }
    }
  }, [panelState.thresholdTree, panelState.filters, isHealthy, fetchSankeyData, panel])
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Get color for saved cell group selection based on color index
 * Uses a 6-color palette cycling through color indices
 * Note: Blue (#3b82f6) is excluded as it's used for default drag selection
 */
export function getSavedGroupColor(colorIndex: number): string {
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']  // Green, Orange, Red, Purple, Pink, Teal
  return colors[colorIndex % colors.length]
}
