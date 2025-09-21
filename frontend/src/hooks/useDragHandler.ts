import { useRef, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

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
// DRAG HANDLER HOOK
// ============================================================================

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

    // Store scroll position to restore if needed
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

    // Prevent any default behavior that might cause scrolling
    event.preventDefault()

    onDragMove(event)

    // Restore scroll position if it changed during drag
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

    // Clear stored scroll position
    if (preventPageScroll) {
      scrollPositionRef.current = null
    }

    onDragEnd?.(event)
  }, [onDragEnd, preventPageScroll])

  // Set up global mouse events for dragging
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

export default useDragHandler