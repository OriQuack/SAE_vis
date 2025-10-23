// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import { useRef, useEffect, useState, useCallback } from 'react'
import { scaleLinear } from 'd3-scale'
import {
  METRIC_COLORS
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

// ============================================================================
// COLOR UTILITIES
// ============================================================================

// ============================================================================
// COLOR ENCODING UTILITIES (for scores)
// ============================================================================

/**
 * Get color for a quality score value (0-1)
 *
 * Uses performance gradient: white (poor) → green (good) with increasing opacity
 * Designed for displaying quality scores in the simplified table.
 *
 * @param score - Quality score value between 0 and 1
 * @returns RGB color string with alpha
 */
export function getQualityScoreColor(score: number): string {
  // Clamp value between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Create performance color scale: white (0) → light green (0.5) → full green (1)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([METRIC_COLORS.QUALITY_SCORE_COLORS.LOW, METRIC_COLORS.QUALITY_SCORE_COLORS.MEDIUM, METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH])

  return colorScale(clampedScore)
}

/**
 * Get metric-specific gradient color for score circles based on score value
 *
 * Uses distinct colorblind-safe colors for each metric type with opacity encoding:
 * - Low scores (0.0): Transparent/white
 * - Medium scores (0.5): 50% opacity
 * - High scores (1.0): Full color opacity
 *
 * Metric colors:
 * - Embedding: Blue gradient (#0072B2)
 * - Fuzz: Orange-red gradient (#D55E00)
 * - Detection: Green gradient (#228833)
 *
 * @param metricType - Type of metric (embedding, fuzz, detection)
 * @param score - Score value (0-1 range, normalized)
 * @returns RGB color string with opacity
 */
export function getMetricColor(metricType: 'embedding' | 'fuzz' | 'detection', score: number): string {
  // Clamp score between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Get color gradient for this metric type
  let gradient: { LOW: string; MEDIUM: string; HIGH: string }

  switch (metricType) {
    case 'embedding':
      gradient = METRIC_COLORS.SCORE_EMBEDDING
      break
    case 'fuzz':
      gradient = METRIC_COLORS.SCORE_FUZZ
      break
    case 'detection':
      gradient = METRIC_COLORS.SCORE_DETECTION
      break
    default:
      return '#e5e7eb'  // Default gray
  }

  // Create D3 color scale: white (0) → light color (0.5) → full color (1.0)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([gradient.LOW, gradient.MEDIUM, gradient.HIGH])

  return colorScale(clampedScore)
}
