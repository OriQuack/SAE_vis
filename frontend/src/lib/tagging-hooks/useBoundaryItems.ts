import { useMemo, useRef } from 'react'

// ============================================================================
// useBoundaryItems - Threshold-based item filtering for boundary lists
// ============================================================================
// Extracts common boundary filtering logic from FeatureSplitView and QualityView

interface UseBoundaryItemsOptions<T, K extends string | number> {
  /** All items to filter */
  items: T[]
  /** Map of item key to similarity score */
  scores: Map<K, number>
  /** Function to extract key from item */
  getItemKey: (item: T) => K
  /** Threshold for select (items >= this go to selectAbove) */
  selectThreshold: number
  /** Threshold for reject (items < this go to rejectBelow) */
  rejectThreshold: number
  /** Histogram data - when null, returns cached or empty (prevents flicker during reload) */
  histogramData: unknown | null
}

interface UseBoundaryItemsReturn<T> {
  /** Items below reject threshold, sorted descending (closest to threshold first) */
  rejectBelow: T[]
  /** Items at or above select threshold, sorted ascending (closest to threshold first) */
  selectAbove: T[]
}

export function useBoundaryItems<T, K extends string | number>(
  options: UseBoundaryItemsOptions<T, K>
): UseBoundaryItemsReturn<T> {
  const {
    items,
    scores,
    getItemKey,
    selectThreshold,
    rejectThreshold,
    histogramData
  } = options

  // Keep previous boundary items during histogram reload to prevent flicker
  const prevBoundaryItemsRef = useRef<UseBoundaryItemsReturn<T>>({
    rejectBelow: [],
    selectAbove: []
  })

  const boundaryItems = useMemo(() => {
    // Don't compute if histogram not yet loaded
    if (!histogramData) {
      // During reload (after initial fetch), return previous values to prevent flicker
      if (
        prevBoundaryItemsRef.current.rejectBelow.length > 0 ||
        prevBoundaryItemsRef.current.selectAbove.length > 0
      ) {
        return prevBoundaryItemsRef.current
      }
      // Before first fetch, return empty lists
      return { rejectBelow: [] as T[], selectAbove: [] as T[] }
    }

    if (items.length === 0) {
      return { rejectBelow: [] as T[], selectAbove: [] as T[] }
    }

    // Filter items that have scores
    const itemsWithScores = items.filter(item => scores.has(getItemKey(item)))

    if (itemsWithScores.length === 0) {
      return { rejectBelow: [] as T[], selectAbove: [] as T[] }
    }

    // REJECT THRESHOLD - Below reject: items < rejectThreshold
    // Sorted descending (highest first = closest to threshold)
    const rejectBelow = itemsWithScores
      .filter(item => scores.get(getItemKey(item))! < rejectThreshold)
      .sort((a, b) => scores.get(getItemKey(b))! - scores.get(getItemKey(a))!)

    // SELECT THRESHOLD - Above select: items >= selectThreshold
    // Sorted ascending (lowest first = closest to threshold)
    const selectAbove = itemsWithScores
      .filter(item => scores.get(getItemKey(item))! >= selectThreshold)
      .sort((a, b) => scores.get(getItemKey(a))! - scores.get(getItemKey(b))!)

    const result = { rejectBelow, selectAbove }
    // Store in ref for use during histogram reload
    prevBoundaryItemsRef.current = result
    return result
  }, [items, scores, getItemKey, selectThreshold, rejectThreshold, histogramData])

  return boundaryItems
}

export default useBoundaryItems
