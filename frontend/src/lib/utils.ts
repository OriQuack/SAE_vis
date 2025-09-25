// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import React, { useRef, useEffect, useState, useCallback } from 'react'

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
}

interface UseResizeObserverReturn {
  ref: React.RefObject<HTMLElement>
  size: Size
}

interface UseClickOutsideOptions {
  enabled?: boolean
  ignoreEscape?: boolean
}

interface UseClickOutsideReturn {
  ref: React.RefObject<HTMLElement>
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

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to observe element size changes with debouncing
 */
export const useResizeObserver = ({
  defaultWidth = 0,
  defaultHeight = 0,
  debounceMs = 100
}: UseResizeObserverOptions = {}): UseResizeObserverReturn => {
  const ref = useRef<HTMLElement>(null)
  const [size, setSize] = useState<Size>({ width: defaultWidth, height: defaultHeight })
  const timeoutRef = useRef<number>()

  const updateSize = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setSize({
        width: rect.width || defaultWidth,
        height: rect.height || defaultHeight
      })
    }
  }, [defaultWidth, defaultHeight])

  const debouncedUpdateSize = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(updateSize, debounceMs)
  }, [updateSize, debounceMs])

  useEffect(() => {
    updateSize()

    const resizeObserver = new ResizeObserver(debouncedUpdateSize)
    if (ref.current) {
      resizeObserver.observe(ref.current)
    }

    return () => {
      resizeObserver.disconnect()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [updateSize, debouncedUpdateSize])

  return { ref, size }
}

/**
 * Hook to handle clicks outside of an element
 */
export const useClickOutside = (
  onClickOutside: () => void,
  options: UseClickOutsideOptions = {}
): UseClickOutsideReturn => {
  const { enabled = true, ignoreEscape = false } = options
  const ref = useRef<HTMLElement>(null)

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

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value)
}

export function formatInteger(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 })
}

export function formatDecimal(value: number, decimals: number = 3): string {
  return formatNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return formatNumber(value, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatCompact(value: number): string {
  return formatNumber(value, { notation: 'compact' })
}

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
// STRING FORMATTING
// ============================================================================

export function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export function toSentenceCase(str: string): string {
  const words = str.replace(/_/g, ' ').toLowerCase().split(' ')
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  }
  return words.join(' ')
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// ============================================================================
// METRIC FORMATTING
// ============================================================================

export function formatMetricName(metric: string): string {
  const metricLabels: Record<string, string> = {
    'semdist_mean': 'Semantic Distance (Mean)',
    'semdist_max': 'Semantic Distance (Max)',
    'score_fuzz': 'Fuzz Score',
    'score_simulation': 'Simulation Score',
    'score_detection': 'Detection Score',
    'score_embedding': 'Embedding Score'
  }

  return metricLabels[metric] || toTitleCase(metric)
}

export function formatCategoryName(category: string): string {
  const categoryLabels: Record<string, string> = {
    'root': 'All Features',
    'feature_splitting': 'Feature Splitting',
    'semantic_distance': 'Semantic Distance',
    'score_agreement': 'Score Agreement'
  }

  return categoryLabels[category] || toTitleCase(category)
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

export function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000

  if (seconds < 1) {
    return `${Math.round(milliseconds)}ms`
  } else if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  } else {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// ============================================================================
// DATA SIZE FORMATTING
// ============================================================================

export function formatDataSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

export function isValidString(value: any): value is string {
  return typeof value === 'string' && value.length > 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

export function getUniqueValues<T>(array: T[]): T[] {
  return Array.from(new Set(array))
}

export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (_item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item)
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(item)
    return groups
  }, {} as Record<K, T[]>)
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

export function hexToRgba(hex: string, alpha: number = 1): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return hex

  const r = parseInt(result[1], 16)
  const g = parseInt(result[2], 16)
  const b = parseInt(result[3], 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getContrastColor(backgroundColor: string): string {
  const rgb = backgroundColor.match(/\d+/g)
  if (!rgb) return '#000000'

  const brightness = (
    parseInt(rgb[0]) * 299 +
    parseInt(rgb[1]) * 587 +
    parseInt(rgb[2]) * 114
  ) / 1000

  return brightness > 128 ? '#000000' : '#ffffff'
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Hooks
  useResizeObserver,
  useClickOutside,
  useDragHandler,

  // Number formatting
  formatNumber,
  formatInteger,
  formatDecimal,
  formatPercentage,
  formatCompact,
  formatSmartNumber,

  // String formatting
  toTitleCase,
  toSentenceCase,
  truncateText,

  // Metric formatting
  formatMetricName,
  formatCategoryName,

  // Time formatting
  formatDuration,
  formatTimestamp,

  // Data size formatting
  formatDataSize,

  // Validation
  isValidNumber,
  isValidString,
  clamp,

  // Array utilities
  getUniqueValues,
  groupBy,

  // Color utilities
  hexToRgba,
  getContrastColor
}