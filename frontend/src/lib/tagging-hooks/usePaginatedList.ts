import { useState, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'

// ============================================================================
// usePaginatedList - Index-based pagination with derived page state
// ============================================================================
// Extracts common pagination logic from FeatureSplitView and QualityView

interface PageNavigation {
  currentPage: number
  totalPages: number
  onPreviousPage: () => void
  onNextPage: () => void
}

interface UsePaginatedListOptions {
  /** Total number of items in the list */
  itemsLength: number
  /** Items per page (default: 10) */
  itemsPerPage?: number
  /** Initial index (default: 0) */
  initialIndex?: number
}

interface UsePaginatedListReturn<T> {
  /** Current selected item index (global, not page-relative) */
  currentIndex: number
  /** Set current index */
  setCurrentIndex: Dispatch<SetStateAction<number>>
  /** Current page number (0-indexed) */
  currentPage: number
  /** Total number of pages */
  totalPages: number
  /** Get items for current page from full list */
  getCurrentPageItems: (items: T[]) => T[]
  /** Navigate to specific page (sets index to first item on that page) */
  goToPage: (page: number) => void
  /** Navigate to next page */
  goToNextPage: () => void
  /** Navigate to previous page */
  goToPreviousPage: () => void
  /** Ready-to-use pageNavigation prop for ScrollableItemList */
  pageNavigation: PageNavigation
  /** Current index within the current page (for ScrollableItemList currentIndex prop) */
  pageRelativeIndex: number
}

export function usePaginatedList<T = unknown>(
  options: UsePaginatedListOptions
): UsePaginatedListReturn<T> {
  const { itemsLength, itemsPerPage = 10, initialIndex = 0 } = options

  // Core state: current index (global, not page-relative)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // Derived: current page from index
  const currentPage = Math.floor(currentIndex / itemsPerPage)
  const totalPages = Math.max(1, Math.ceil(itemsLength / itemsPerPage))

  // Page-relative index for ScrollableItemList
  const pageRelativeIndex = currentIndex % itemsPerPage

  // Reset to valid index when items length changes
  useEffect(() => {
    if (currentIndex >= itemsLength && itemsLength > 0) {
      setCurrentIndex(itemsLength - 1)
    }
  }, [itemsLength, currentIndex])

  // Get items for current page
  const getCurrentPageItems = useCallback(
    (items: T[]): T[] => {
      const start = currentPage * itemsPerPage
      return items.slice(start, start + itemsPerPage)
    },
    [currentPage, itemsPerPage]
  )

  // Navigate to specific page
  const goToPage = useCallback(
    (page: number) => {
      const clampedPage = Math.max(0, Math.min(page, totalPages - 1))
      setCurrentIndex(clampedPage * itemsPerPage)
    },
    [totalPages, itemsPerPage]
  )

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentIndex((currentPage + 1) * itemsPerPage)
    }
  }, [currentPage, totalPages, itemsPerPage])

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentIndex((currentPage - 1) * itemsPerPage)
    }
  }, [currentPage, itemsPerPage])

  // Ready-to-use pageNavigation prop for ScrollableItemList
  const pageNavigation = useMemo(
    (): PageNavigation => ({
      currentPage,
      totalPages,
      onPreviousPage: goToPreviousPage,
      onNextPage: goToNextPage
    }),
    [currentPage, totalPages, goToPreviousPage, goToNextPage]
  )

  return {
    currentIndex,
    setCurrentIndex,
    currentPage,
    totalPages,
    getCurrentPageItems,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    pageNavigation,
    pageRelativeIndex
  }
}

export default usePaginatedList
