import { useState, useEffect, useMemo } from 'react'
import { calculateOptimalPosition, calculateResponsiveSize, type PopoverPosition, type ResponsiveSize } from '../utils/positioning'

interface UsePopoverPositionProps {
  visible: boolean
  clickPosition?: { x: number; y: number }
  defaultWidth: number
  defaultHeight: number
  metricsCount?: number
}

interface UsePopoverPositionReturn {
  containerSize: ResponsiveSize
  calculatedPosition: PopoverPosition | null
}

export const usePopoverPosition = ({
  visible,
  clickPosition,
  defaultWidth,
  defaultHeight,
  metricsCount = 1
}: UsePopoverPositionProps): UsePopoverPositionReturn => {
  const [containerSize, setContainerSize] = useState(() =>
    calculateResponsiveSize(defaultWidth, defaultHeight, metricsCount)
  )
  const [calculatedPosition, setCalculatedPosition] = useState<PopoverPosition | null>(null)

  const memoizedContainerSize = useMemo(
    () => calculateResponsiveSize(defaultWidth, defaultHeight, metricsCount),
    [defaultWidth, defaultHeight, metricsCount]
  )

  useEffect(() => {
    if (visible && clickPosition) {
      const position = calculateOptimalPosition(
        clickPosition,
        { width: memoizedContainerSize.width, height: memoizedContainerSize.height }
      )
      setCalculatedPosition(position)
    } else {
      setCalculatedPosition(null)
    }
  }, [visible, clickPosition, memoizedContainerSize])

  useEffect(() => {
    const handleResize = () => {
      const newSize = calculateResponsiveSize(defaultWidth, defaultHeight, metricsCount)
      setContainerSize(newSize)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [defaultWidth, defaultHeight, metricsCount])

  useEffect(() => {
    setContainerSize(memoizedContainerSize)
  }, [memoizedContainerSize])

  return {
    containerSize,
    calculatedPosition
  }
}