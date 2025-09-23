import React, { useRef, useEffect, useState, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// RESIZE OBSERVER HOOK
// ============================================================================

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

export default useResizeObserver