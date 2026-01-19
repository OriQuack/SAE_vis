import { useState, useCallback, useEffect, useRef } from 'react'
import type { SortMode } from './useSortableList'

// ============================================================================
// MAIN LIST SCROLL HOOK - Scroll main list when items clicked in subviews
// ============================================================================
// When a feature/pair is clicked in subviews (boundary lists, RadViz), this hook
// manages scrolling the main StageAccordionList to show that item.
// If the item doesn't exist in the main list (e.g., in diversity mode), it
// automatically switches to decisionMargin mode and then scrolls.

interface UseMainListScrollOptions<K> {
  /** Current sorted/filtered list of item keys */
  sortedFilteredList: K[]
  /** Current sort mode */
  sortMode: SortMode
  /** Setter for sort mode (to switch out of diversity) */
  setSortMode: (mode: SortMode) => void
  /** Setter for sort direction */
  setSortDirection: (dir: 'asc' | 'desc') => void
}

interface UseMainListScrollReturn<K> {
  /** Current scroll target index (pass to StageAccordionList) */
  scrollTargetIndex: number | undefined
  /** Call this to scroll main list to an item */
  scrollToItemInMainList: (itemKey: K) => void
}

export function useMainListScroll<K>({
  sortedFilteredList,
  sortMode,
  setSortMode,
  setSortDirection,
}: UseMainListScrollOptions<K>): UseMainListScrollReturn<K> {
  const [scrollTargetIndex, setScrollTargetIndex] = useState<number | undefined>(undefined)
  const pendingScrollKeyRef = useRef<K | null>(null)

  const scrollToItemInMainList = useCallback((itemKey: K) => {
    const index = sortedFilteredList.indexOf(itemKey)

    // If not found and in diversity mode, switch to decisionMargin (Learn stage)
    if (index === -1 && sortMode === 'diversity') {
      setSortMode('decisionMargin')
      setSortDirection('asc')
      pendingScrollKeyRef.current = itemKey
      return
    }

    if (index !== -1) {
      setScrollTargetIndex(index)
      // Clear after a short delay to allow re-triggering for same index
      setTimeout(() => setScrollTargetIndex(undefined), 100)
    }
  }, [sortedFilteredList, sortMode, setSortMode, setSortDirection])

  // Handle deferred scroll after mode switch
  // When we switch from diversity to decisionMargin, the list changes
  // and we need to find the item in the new list
  useEffect(() => {
    if (pendingScrollKeyRef.current !== null) {
      const itemKey = pendingScrollKeyRef.current
      const index = sortedFilteredList.indexOf(itemKey)
      if (index !== -1) {
        setScrollTargetIndex(index)
        setTimeout(() => setScrollTargetIndex(undefined), 100)
      }
      pendingScrollKeyRef.current = null
    }
  }, [sortedFilteredList])

  return { scrollTargetIndex, scrollToItemInMainList }
}
