import { useCallback, useMemo } from 'react'
import type { SortMode } from './useSortableList'

// Minimal type — callers always pass 'all' now that boundary lists are removed
type ListSource = string

// ============================================================================
// useTaggingNavigation - Centralized post-tagging navigation logic
// ============================================================================
// Extracts common post-tagging navigation behavior from FeatureSplitView and QualityView
// Uses FeatureSplitView logic as the reference implementation:
// 1. Auto-advance when activeListSource === 'all' && (not decision margin OR histogram not ready)
// 2. In decision margin mode WITH histogram, manual tagging resets to first item (list re-sorts)
// 3. In decision margin mode WITHOUT histogram, advance to next (list doesn't re-sort yet)
// 4. Navigation does NOT reset activeListSource
// 5. Toggle off (clicking same tag) does NOT navigate - handled by caller
// 6. Unsure click always advances to next item

interface UseTaggingNavigationOptions {
  /** Current active list source ('all' | 'reject' | 'select') */
  activeListSource: ListSource
  /** Current sort mode ('diversity' behaves like 'default' for navigation) */
  sortMode: SortMode
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
  /** Whether histogram data is available (decision margin scores exist) */
  isHistogramReady?: boolean
  /** Whether tagged items are hidden - disables auto-advance since item disappears from list */
  hideTagged?: boolean
  /** Callback to clear stored selection state (e.g., selectedFeatureIdState/selectedPairKeyState) */
  onClearStoredSelection?: () => void
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
    navigationDelay = 150,
    isHistogramReady = false,
    hideTagged = false,
    onClearStoredSelection
  } = options

  // Auto-advance when viewing 'all' list AND either:
  // - NOT in decision margin mode, OR
  // - In decision margin mode but histogram not ready yet (list won't re-sort)
  // IMPORTANT: Disable auto-advance when hideTagged is true, because the tagged item
  // will disappear from the list and the next item will appear at the same index
  const shouldAutoAdvance = useMemo(() => {
    if (hideTagged) return false
    return activeListSource === 'all' && (sortMode !== 'decisionMargin' || !isHistogramReady)
  }, [activeListSource, sortMode, isHistogramReady, hideTagged])

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
      setTimeout(() => onResetToFirst(), navigationDelay)
    } else if (shouldAutoAdvance && canAdvance) {
      // Default mode OR decision margin without histogram: go to next item
      setTimeout(() => onNavigateNext(), navigationDelay)
    }
    // Otherwise: stay on current item
  }, [hideTagged, sortMode, isHistogramReady, shouldAutoAdvance, canAdvance, onNavigateNext, onResetToFirst, navigationDelay, onClearStoredSelection])

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
