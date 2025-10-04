// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { MetricType, Filters, ThresholdTree, SankeyData, HistogramData, ViewState } from '../types'
import {
  METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
  METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT,
  METRIC_DISPLAY_NAMES, CATEGORY_DISPLAY_NAMES,
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

interface UseClickOutsideOptions {
  enabled?: boolean
  ignoreEscape?: boolean
}

interface UseClickOutsideReturn {
  ref: React.RefObject<HTMLElement | null>
}

interface DragHandlerOptions {
  onDragStart?: (event: React.MouseEvent | MouseEvent) => void
  onDragMove: (event: React.MouseEvent | MouseEvent) => void
  onDragEnd?: (event: React.MouseEvent | MouseEvent) => void
  preventDefault?: boolean
  stopPropagation?: boolean
  preventPageScroll?: boolean
}

interface DragHandlerReturn {
  isDragging: React.MutableRefObject<boolean>
  handleMouseDown: (event: React.MouseEvent) => void
}

// Panel State (matches store.ts PanelState)
interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
  viewState: ViewState
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
 * Hook to handle clicks outside of an element
 */
export const useClickOutside = (
  onClickOutside: () => void,
  options: UseClickOutsideOptions = {}
): UseClickOutsideReturn => {
  const { enabled = true, ignoreEscape = false } = options
  const ref = useRef<HTMLElement | null>(null)

  const handleClick = useCallback((event: MouseEvent) => {
    if (!enabled) return

    if (ref.current && !ref.current.contains(event.target as Node)) {
      onClickOutside()
    }
  }, [enabled, onClickOutside])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || ignoreEscape) return

    if (event.key === 'Escape') {
      onClickOutside()
    }
  }, [enabled, ignoreEscape, onClickOutside])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('mousedown', handleClick)
    if (!ignoreEscape) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClick)
      if (!ignoreEscape) {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [enabled, handleClick, handleKeyDown, ignoreEscape])

  return { ref }
}

/**
 * Hook to handle drag interactions with scroll prevention
 */
export const useDragHandler = ({
  onDragStart,
  onDragMove,
  onDragEnd,
  preventDefault = true,
  stopPropagation = true,
  preventPageScroll = true
}: DragHandlerOptions): DragHandlerReturn => {
  const isDraggingRef = useRef(false)
  const scrollPositionRef = useRef<{ x: number; y: number } | null>(null)

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (preventDefault) event.preventDefault()
    if (stopPropagation) event.stopPropagation()

    if (preventPageScroll) {
      scrollPositionRef.current = {
        x: window.scrollX,
        y: window.scrollY
      }
    }

    isDraggingRef.current = true
    onDragStart?.(event)
  }, [onDragStart, preventDefault, stopPropagation, preventPageScroll])

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return

    event.preventDefault()
    onDragMove(event)

    if (preventPageScroll && scrollPositionRef.current) {
      const currentX = window.scrollX
      const currentY = window.scrollY
      if (currentX !== scrollPositionRef.current.x || currentY !== scrollPositionRef.current.y) {
        window.scrollTo(scrollPositionRef.current.x, scrollPositionRef.current.y)
      }
    }
  }, [onDragMove, preventPageScroll])

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false

    if (preventPageScroll) {
      scrollPositionRef.current = null
    }

    onDragEnd?.(event)
  }, [onDragEnd, preventPageScroll])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return {
    isDragging: isDraggingRef,
    handleMouseDown
  }
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
  // Watch for filter changes and fetch data when in visualization mode
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(panelState.filters).some(
        (filterArray): filterArray is string[] => filterArray !== undefined && filterArray.length > 0
      )

      if (hasActiveFilters && panelState.viewState === 'visualization') {
        try {
          await fetchMultipleHistogramData(
            [METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SCORE_FUZZ],
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
  }, [panelState.filters, panelState.viewState, isHealthy, fetchMultipleHistogramData, fetchSankeyData, panel])

  // Watch for threshold changes and re-fetch Sankey data
  useEffect(() => {
    const hasActiveFilters = Object.values(panelState.filters).some(
      (filterArray): filterArray is string[] => filterArray !== undefined && filterArray.length > 0
    )

    if (hasActiveFilters && panelState.viewState === 'visualization' && isHealthy) {
      try {
        fetchSankeyData(panel)
      } catch (error) {
        console.error(`Failed to update ${panel} Sankey data:`, error)
      }
    }
  }, [panelState.thresholdTree, panelState.filters, panelState.viewState, isHealthy, fetchSankeyData, panel])
}

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

export function formatSmartNumber(value: number): string {
  if (Math.abs(value) < 0.001 && value !== 0) {
    return value.toExponential(2)
  }

  if (Math.abs(value) < 1) {
    return value.toFixed(3)
  }

  return value.toFixed(2)
}

// ============================================================================
// STRING FORMATTING (Internal Helper)
// ============================================================================

function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// ============================================================================
// METRIC FORMATTING
// ============================================================================

export function formatMetricName(metric: string): string {
  const metricLabels: Record<string, string> = {
    [METRIC_SEMDIST_MEAN]: METRIC_DISPLAY_NAMES[METRIC_SEMDIST_MEAN],
    [METRIC_SEMDIST_MAX]: METRIC_DISPLAY_NAMES[METRIC_SEMDIST_MAX],
    [METRIC_SCORE_FUZZ]: METRIC_DISPLAY_NAMES[METRIC_SCORE_FUZZ],
    [METRIC_SCORE_SIMULATION]: METRIC_DISPLAY_NAMES[METRIC_SCORE_SIMULATION],
    [METRIC_SCORE_DETECTION]: METRIC_DISPLAY_NAMES[METRIC_SCORE_DETECTION],
    [METRIC_SCORE_EMBEDDING]: METRIC_DISPLAY_NAMES[METRIC_SCORE_EMBEDDING]
  }

  return metricLabels[metric] || toTitleCase(metric)
}

export function formatCategoryName(category: string): string {
  const categoryLabels: Record<string, string> = {
    [CATEGORY_ROOT]: CATEGORY_DISPLAY_NAMES[CATEGORY_ROOT],
    [CATEGORY_FEATURE_SPLITTING]: CATEGORY_DISPLAY_NAMES[CATEGORY_FEATURE_SPLITTING],
    [CATEGORY_SEMANTIC_DISTANCE]: CATEGORY_DISPLAY_NAMES[CATEGORY_SEMANTIC_DISTANCE],
    [CATEGORY_SCORE_AGREEMENT]: CATEGORY_DISPLAY_NAMES[CATEGORY_SCORE_AGREEMENT]
  }

  return categoryLabels[category] || toTitleCase(category)
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
