// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import { useRef, useEffect, useState, useCallback } from 'react'
import type { Filters, ThresholdTree, SankeyData, HistogramData } from '../types'

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
  // Tree-based system fields
  sankeyTree?: Map<string, any>
  computedSankey?: any
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
 * Hook to handle Sankey data loading for a panel (left or right)
 * Simplified: No histogram data, single effect, smart triggering
 * Only loads data when panel is visible to avoid unnecessary requests
 *
 * NOTE: Skips old API calls if panel uses tree-based system (computedSankey exists)
 */
export const usePanelDataLoader = (
  panel: 'left' | 'right',
  panelState: PanelState,
  isHealthy: boolean,
  shouldLoad: boolean,  // Only load when panel is visible
  fetchSankeyData: (panel?: 'left' | 'right') => void
): void => {
  useEffect(() => {
    console.log(`[usePanelDataLoader ${panel}] Effect triggered:`, {
      hasComputedSankey: panelState.computedSankey !== undefined,
      hasSankeyTree: !!panelState.sankeyTree,
      sankeyTreeSize: panelState.sankeyTree?.size,
      isHealthy,
      shouldLoad,
      hasActiveFilters: Object.values(panelState.filters).some(
        (filterArray): filterArray is string[] =>
          filterArray !== undefined && filterArray.length > 0
      )
    })

    // Skip if using tree-based system (computedSankey exists)
    if (panelState.computedSankey !== undefined) {
      console.log(`[usePanelDataLoader ${panel}] ✅ SKIPPING old API - tree-based system active`)
      return
    }

    // Check if we have active filters
    const hasActiveFilters = Object.values(panelState.filters).some(
      (filterArray): filterArray is string[] =>
        filterArray !== undefined && filterArray.length > 0
    )

    // Only fetch if: healthy + has filters + should load (visible)
    if (isHealthy && hasActiveFilters && shouldLoad) {
      console.log(`[usePanelDataLoader ${panel}] 📤 Fetching Sankey data via OLD API`)
      fetchSankeyData(panel)
    } else {
      console.log(`[usePanelDataLoader ${panel}] ⏸️  Not fetching:`, {
        isHealthy,
        hasActiveFilters,
        shouldLoad
      })
    }
  }, [
    panelState.filters,           // Re-fetch when filters change
    panelState.thresholdTree,     // Re-fetch when thresholds change
    panelState.computedSankey,    // Skip if using tree-based system
    isHealthy,
    shouldLoad,                   // Re-fetch when visibility changes
    fetchSankeyData,
    panel
  ])
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
