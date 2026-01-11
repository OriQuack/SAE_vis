import { useState, useMemo, useCallback } from 'react'

// ============================================================================
// SORTABLE LIST HOOK - Reusable sorting logic for scrollable lists
// ============================================================================
// Extracts common sorting patterns from QualityView and FeatureSplitView
// Supports two modes: default (primary metric) and decisionMargin (SVM scores)
// Supports ascending/descending direction for both modes
// Tracks if current sort matches the template (default) for selection highlighting

export interface SortableListConfig<T, K> {
  items: T[]
  getItemKey: (item: T) => K
  getDefaultScore: (item: T) => number | null | undefined
  decisionMarginScores: Map<K, number>
  defaultLabel: string      // e.g., 'Quality score', 'Decoder sim'
  defaultDirection?: 'asc' | 'desc'  // default: 'desc' (used as initial direction for default mode)
  // Template configuration - defines the "canonical" sort state for this view (used for isTemplateSort)
  templateMode?: 'default' | 'decisionMargin'  // default: 'decisionMargin'
  templateDirection?: 'asc' | 'desc'           // default: 'asc'
  // Initial state configuration - defines the starting sort state (defaults to template values)
  initialMode?: 'default' | 'decisionMargin'
  initialDirection?: 'asc' | 'desc'
}

export interface SortableListResult<T> {
  sortMode: 'default' | 'decisionMargin'
  setSortMode: (mode: 'default' | 'decisionMargin') => void
  sortDirection: 'asc' | 'desc'
  setSortDirection: (direction: 'asc' | 'desc') => void
  sortedItems: T[]
  columnHeaderProps: {
    label: string
    sortDirection: 'asc' | 'desc'
    onClick: () => void
    isPulsing?: boolean
  }
  getDisplayScore: (item: T) => number | undefined
  isTemplateSort: boolean  // true if current sort matches the template
}

export function useSortableList<T, K>({
  items,
  getItemKey,
  getDefaultScore,
  decisionMarginScores,
  defaultLabel,
  defaultDirection: _defaultDirection = 'desc',  // Kept for backward compatibility, but sortDirection is used
  templateMode = 'decisionMargin',
  templateDirection = 'asc',
  initialMode,
  initialDirection
}: SortableListConfig<T, K>): SortableListResult<T> {
  void _defaultDirection  // Consume to avoid unused variable warning
  // Sort mode: 'default' (primary metric) or 'decisionMargin' (SVM uncertainty)
  // Initialize to initialMode if provided, otherwise use templateMode
  const [sortMode, setSortModeInternal] = useState<'default' | 'decisionMargin'>(initialMode ?? templateMode)

  // Sort direction: applies to both modes
  // Initialize to initialDirection if provided, otherwise use templateDirection
  const [sortDirection, setSortDirectionInternal] = useState<'asc' | 'desc'>(initialDirection ?? templateDirection)

  const [isPulsing, setIsPulsing] = useState(false)

  // Wrapped setSortMode that triggers pulse animation when switching to decisionMargin
  const setSortMode = useCallback((mode: 'default' | 'decisionMargin') => {
    setSortModeInternal(mode)
    if (mode === 'decisionMargin') {
      setIsPulsing(true)
      setTimeout(() => setIsPulsing(false), 2400)
    }
  }, [])

  // setSortDirection wrapper
  const setSortDirection = useCallback((direction: 'asc' | 'desc') => {
    setSortDirectionInternal(direction)
  }, [])

  // Check if current sort matches the template
  const isTemplateSort = useMemo(() => {
    return sortMode === templateMode && sortDirection === templateDirection
  }, [sortMode, sortDirection, templateMode, templateDirection])

  const sortedItems = useMemo(() => {
    if (sortMode === 'decisionMargin' && decisionMarginScores.size > 0) {
      // Decision margin mode: sort by |score|
      // sortDirection determines order: asc = least confident first, desc = most confident first
      // Items without scores go to the end
      return [...items].sort((a, b) => {
        const keyA = getItemKey(a)
        const keyB = getItemKey(b)
        const scoreA = decisionMarginScores.get(keyA)
        const scoreB = decisionMarginScores.get(keyB)
        const valA = scoreA !== undefined ? Math.abs(scoreA) : Infinity
        const valB = scoreB !== undefined ? Math.abs(scoreB) : Infinity
        return sortDirection === 'asc' ? valA - valB : valB - valA
      })
    }

    // Default mode: sort by primary metric
    // sortDirection determines order
    return [...items].sort((a, b) => {
      const scoreA = getDefaultScore(a) ?? (sortDirection === 'desc' ? -Infinity : Infinity)
      const scoreB = getDefaultScore(b) ?? (sortDirection === 'desc' ? -Infinity : Infinity)
      return sortDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB
    })
  }, [items, decisionMarginScores, sortMode, sortDirection, getItemKey, getDefaultScore])

  const toggleSortDirection = useCallback(() => {
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    setSortDirection(newDirection)
  }, [sortDirection, setSortDirection])

  const columnHeaderProps = useMemo(() => ({
    label: sortMode === 'decisionMargin' ? '|Decision Margin|' : defaultLabel,
    sortDirection: sortDirection,
    onClick: toggleSortDirection,
    isSortable: true,
    isPulsing
  }), [sortMode, defaultLabel, sortDirection, toggleSortDirection, isPulsing])

  const getDisplayScore = useCallback((item: T): number | undefined => {
    if (sortMode === 'decisionMargin') {
      return decisionMarginScores.get(getItemKey(item))
    }
    const score = getDefaultScore(item)
    return score ?? undefined
  }, [sortMode, decisionMarginScores, getItemKey, getDefaultScore])

  return {
    sortMode,
    setSortMode,
    sortDirection,
    setSortDirection,
    sortedItems,
    columnHeaderProps,
    getDisplayScore,
    isTemplateSort
  }
}
