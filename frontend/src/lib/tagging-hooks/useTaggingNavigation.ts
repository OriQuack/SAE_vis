import { useCallback, useMemo } from 'react'
import type { ListSource } from './useListNavigation'

// ============================================================================
// useTaggingNavigation - Centralized post-tagging navigation logic
// ============================================================================
// Extracts common post-tagging navigation behavior from FeatureSplitView and QualityView
// Uses FeatureSplitView logic as the reference implementation:
// 1. Auto-advance only when activeListSource === 'all' && sortMode !== 'decisionMargin'
// 2. In decision margin mode, manual tagging resets to first item
// 3. Navigation does NOT reset activeListSource
// 4. Toggle off (clicking same tag) does NOT navigate - handled by caller
// 5. Unsure click always advances to next item

interface UseTaggingNavigationOptions {
  /** Current active list source ('all' | 'reject' | 'select') */
  activeListSource: ListSource
  /** Current sort mode */
  sortMode: 'default' | 'decisionMargin'
  /** Current item index */
  currentIndex: number
  /** Total number of items in the list */
  listLength: number
  /** Callback to navigate to next item (just increment, no side effects) */
  onNavigateNext: () => void
  /** Callback to reset to first item (index 0, activeListSource 'all') */
  onResetToFirst: () => void
  /** Navigation delay in ms (default: 150) */
  navigationDelay?: number
}

interface UseTaggingNavigationReturn {
  /** Whether auto-advance should happen after tagging (exposed for debugging/UI) */
  shouldAutoAdvance: boolean
  /** Call after a tag is set (selected/rejected) - handles advance/reset logic with delay */
  handlePostTagNavigation: () => void
  /** Call after unsure click - always advances with delay */
  handlePostUnsureNavigation: () => void
}

export function useTaggingNavigation(
  options: UseTaggingNavigationOptions
): UseTaggingNavigationReturn {
  const {
    activeListSource,
    sortMode,
    currentIndex,
    listLength,
    onNavigateNext,
    onResetToFirst,
    navigationDelay = 150
  } = options

  // Auto-advance only when viewing 'all' list AND NOT in decision margin mode
  const shouldAutoAdvance = useMemo(() => {
    return activeListSource === 'all' && sortMode !== 'decisionMargin'
  }, [activeListSource, sortMode])

  // Whether we can advance (not at end of list)
  const canAdvance = currentIndex < listLength - 1

  // Handle navigation after setting a tag (selected/rejected)
  // In decision margin mode: reset to first (list will re-sort)
  // Otherwise: advance to next if auto-advance enabled
  const handlePostTagNavigation = useCallback(() => {
    if (sortMode === 'decisionMargin') {
      // Decision margin mode: reset to first item (list will re-sort after tagging)
      setTimeout(() => onResetToFirst(), navigationDelay)
    } else if (shouldAutoAdvance && canAdvance) {
      // Normal mode with auto-advance: go to next item
      setTimeout(() => onNavigateNext(), navigationDelay)
    }
    // Otherwise: stay on current item
  }, [sortMode, shouldAutoAdvance, canAdvance, onNavigateNext, onResetToFirst, navigationDelay])

  // Handle navigation after unsure click
  // Always advances (since clearing doesn't change sort order)
  const handlePostUnsureNavigation = useCallback(() => {
    if (canAdvance) {
      setTimeout(() => onNavigateNext(), navigationDelay)
    }
  }, [canAdvance, onNavigateNext, navigationDelay])

  return {
    shouldAutoAdvance,
    handlePostTagNavigation,
    handlePostUnsureNavigation
  }
}

export default useTaggingNavigation
