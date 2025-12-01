import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'

// ============================================================================
// useListNavigation - Active list source management with threshold drag reset
// ============================================================================
// Extracts common list source switching logic from FeatureSplitView and QualityView

export type ListSource = 'all' | 'reject' | 'select'

interface UseListNavigationOptions {
  /** Whether threshold is currently being dragged */
  isDraggingThreshold: boolean
  /** Callback when reset to 'all' (e.g., to reset index) */
  onReset?: () => void
}

interface UseListNavigationReturn {
  /** Current active list source */
  activeListSource: ListSource
  /** Set active list source */
  setActiveListSource: Dispatch<SetStateAction<ListSource>>
  /** Convenience: is 'all' list active */
  isAllActive: boolean
  /** Convenience: is 'reject' list active */
  isRejectActive: boolean
  /** Convenience: is 'select' list active */
  isSelectActive: boolean
  /** Reset to 'all' list */
  resetToAll: () => void
}

export function useListNavigation(
  options: UseListNavigationOptions
): UseListNavigationReturn {
  const { isDraggingThreshold, onReset } = options

  // Core state
  const [activeListSource, setActiveListSource] = useState<ListSource>('all')

  // Auto-reset to 'all' when threshold dragging starts
  // This prevents the selected item from becoming invalid as boundary items change
  useEffect(() => {
    if (isDraggingThreshold && (activeListSource === 'reject' || activeListSource === 'select')) {
      setActiveListSource('all')
      onReset?.()
    }
  }, [isDraggingThreshold, activeListSource, onReset])

  // Manual reset helper
  const resetToAll = useCallback(() => {
    setActiveListSource('all')
    onReset?.()
  }, [onReset])

  return {
    activeListSource,
    setActiveListSource,
    isAllActive: activeListSource === 'all',
    isRejectActive: activeListSource === 'reject',
    isSelectActive: activeListSource === 'select',
    resetToAll
  }
}

export default useListNavigation
