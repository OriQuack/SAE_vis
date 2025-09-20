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
  stopPropagation = true
}: DragHandlerOptions): DragHandlerReturn => {
  const isDraggingRef = useRef(false)

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (preventDefault) event.preventDefault()
    if (stopPropagation) event.stopPropagation()

    isDraggingRef.current = true
    onDragStart?.(event)
  }, [onDragStart, preventDefault, stopPropagation])

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return
    onDragMove(event)
  }, [onDragMove])

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    onDragEnd?.(event)
  }, [onDragEnd])

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