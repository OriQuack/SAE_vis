import { useCallback, useMemo } from 'react'
import type { SortMode } from './useSortableList'

// ============================================================================
// useTaggingNavigation - Centralized post-tagging navigation logic
// ============================================================================
// Shared by FeatureSplitView, QualityView, and CauseView:
// 1. Auto-advance when not in decision margin mode, or histogram not ready
// 2. In decision margin mode WITH histogram, manual tagging resets to first item (list re-sorts)
// 3. In decision margin mode WITHOUT histogram, advance to next (list doesn't re-sort yet)
// 4. Toggle off (clicking same tag) does NOT navigate - handled by caller
// 5. Unsure click always advances to next item

interface UseTaggingNavigationOptions {
  /** Current sort mode ('diversity' behaves like 'default' for navigation) */
  sortMode: SortMode
  /** Current item index */
  currentIndex: number
  /** Total number of items in the list */
  listLength: number
  /** Callback to navigate to next item (just increment, no side effects) */
  onNavigateNext: () => void
  /** Callback to reset to first item (index 0) */
  onResetToFirst: () => void
  /** Whether histogram data is available (decision margin scores exist) */
  isHistogramReady?: boolean
  /** Whether tagged items are hidden - disables auto-advance since item disappears from list */
  hideTagged?: boolean
  /** Callback to clear stored selection state (e.g., selectedFeatureIdState/selectedPairKeyState) */
  onClearStoredSelection?: () => void
}

interface UseTaggingNavigationReturn {
  /** Call after a tag is set (selected/rejected) - handles advance/reset logic with delay */
  handlePostTagNavigation: () => void
  /** Call after unsure click - always advances with delay */
  handlePostUnsureNavigation: () => void
}

export function useTaggingNavigation(
  options: UseTaggingNavigationOptions
): UseTaggingNavigationReturn {
  const {
    sortMode,
    currentIndex,
    listLength,
    onNavigateNext,
    onResetToFirst,
    isHistogramReady = false,
    hideTagged = false,
    onClearStoredSelection
  } = options

  // Auto-advance when either:
  // - NOT in decision margin mode, OR
  // - In decision margin mode but histogram not ready yet (list won't re-sort)
  // IMPORTANT: Disable auto-advance when hideTagged is true, because the tagged item
  // will disappear from the list and the next item will appear at the same index
  const shouldAutoAdvance = useMemo(() => {
    if (hideTagged) return false
    return sortMode !== 'decisionMargin' || !isHistogramReady
  }, [sortMode, isHistogramReady, hideTagged])

  // Whether we can advance (not at end of list)
  const canAdvance = currentIndex < listLength - 1

  // Handle navigation after setting a tag (selected/rejected)
  // In decision margin mode WITH histogram: reset to first (list will re-sort)
  // Otherwise: advance to next if auto-advance enabled
  // IMPORTANT: Skip all auto-navigation when hideTagged is true (item disappears, next appears at same index)
  const handlePostTagNavigation = useCallback(() => {
    if (hideTagged) {
      // Clear stored selection so index-based fallback takes over
      // (next item will appear at same index after tagged item is removed)
      onClearStoredSelection?.()
      return
    }
    if (sortMode === 'decisionMargin' && isHistogramReady) {
      // Decision margin mode WITH histogram: reset to first item (list will re-sort after tagging)
      setTimeout(() => onResetToFirst(), 150)
    } else if (shouldAutoAdvance && canAdvance) {
      // Default mode OR decision margin without histogram: go to next item
      setTimeout(() => onNavigateNext(), 150)
    }
    // Otherwise: stay on current item
  }, [hideTagged, sortMode, isHistogramReady, shouldAutoAdvance, canAdvance, onNavigateNext, onResetToFirst, onClearStoredSelection])

  // Handle navigation after unsure click
  // Always advances (since clearing doesn't change sort order)
  const handlePostUnsureNavigation = useCallback(() => {
    if (canAdvance) {
      setTimeout(() => onNavigateNext(), 150)
    }
  }, [canAdvance, onNavigateNext])

  return {
    handlePostTagNavigation,
    handlePostUnsureNavigation
  }
}

export default useTaggingNavigation
