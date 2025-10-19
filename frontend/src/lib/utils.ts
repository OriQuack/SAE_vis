// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import { useRef, useEffect, useState, useCallback } from 'react'
import { scaleLinear } from 'd3-scale'
import type { ConsistencyType } from '../types'
import {
  METRIC_COLORS,
  CONSISTENCY_TYPE_NONE,
  METRIC_LLM_SCORER_CONSISTENCY,
  METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY,
  METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
  METRIC_LLM_EXPLAINER_CONSISTENCY
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
// COLOR ENCODING UTILITIES (for scores and consistency)
// ============================================================================

/**
 * Get consistency color gradient definition based on consistency type
 *
 * @param consistencyType - Type of consistency metric
 * @returns Color gradient definition (LOW, MEDIUM, HIGH)
 */
export function getConsistencyColorGradient(consistencyType: ConsistencyType): { LOW: string; MEDIUM: string; HIGH: string } {
  switch (consistencyType) {
    case METRIC_LLM_SCORER_CONSISTENCY:
      return METRIC_COLORS.LLM_SCORER
    case METRIC_WITHIN_EXPLANATION_METRIC_CONSISTENCY:
      return METRIC_COLORS.WITHIN_EXPLANATION
    case METRIC_CROSS_EXPLANATION_METRIC_CONSISTENCY:
      return METRIC_COLORS.CROSS_EXPLANATION
    case METRIC_CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY:
      return METRIC_COLORS.CROSS_EXPLANATION_OVERALL
    case METRIC_LLM_EXPLAINER_CONSISTENCY:
      return METRIC_COLORS.LLM_EXPLAINER
    case CONSISTENCY_TYPE_NONE:
    default:
      // Default to white (no coloring)
      return { LOW: '#FFFFFF', MEDIUM: '#FFFFFF', HIGH: '#FFFFFF' }
  }
}

/**
 * Get color for a consistency value (0-1)
 *
 * Uses single-color gradient (white to color) based on consistency type.
 * Can be used for coloring table cells, charts, etc.
 *
 * @param value - Consistency value between 0 and 1
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns RGB color string (e.g., "#4477AA")
 */
export function getConsistencyColor(value: number, consistencyType: ConsistencyType = CONSISTENCY_TYPE_NONE): string {
  // Clamp value between 0 and 1
  const clampedValue = Math.max(0, Math.min(1, value))

  // Get color gradient for this consistency type
  const gradient = getConsistencyColorGradient(consistencyType)

  // Create D3 color scale: white (0) → light color (0.5) → full color (1.0)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([gradient.LOW, gradient.MEDIUM, gradient.HIGH])

  return colorScale(clampedValue)
}

/**
 * Get color for an overall score value (0-1)
 *
 * Uses performance gradient: white (poor) → green (good) with increasing opacity
 * Designed for displaying overall scores in the simplified table.
 *
 * @param score - Overall score value between 0 and 1
 * @returns RGB color string with alpha
 */
export function getOverallScoreColor(score: number): string {
  // Clamp value between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Create performance color scale: white (0) → light green (0.5) → full green (1)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([METRIC_COLORS.OVERALL_SCORE_COLORS.LOW, METRIC_COLORS.OVERALL_SCORE_COLORS.MEDIUM, METRIC_COLORS.OVERALL_SCORE_COLORS.HIGH])

  return colorScale(clampedScore)
}

/**
 * Get gradient stops for consistency color scale
 *
 * Returns array of gradient stops that can be used in SVG linearGradient
 *
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns Array of gradient stop objects
 */
export function getConsistencyGradientStops(consistencyType: ConsistencyType = CONSISTENCY_TYPE_NONE): Array<{ offset: string; color: string }> {
  const gradient = getConsistencyColorGradient(consistencyType)

  return [
    { offset: '0%', color: gradient.LOW },      // White (low consistency at 0)
    { offset: '50%', color: gradient.MEDIUM },  // Light color (medium)
    { offset: '100%', color: gradient.HIGH }    // Full color (high consistency at 1)
  ]
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
