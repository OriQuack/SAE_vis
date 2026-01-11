import { useState, useMemo, useCallback } from 'react'

// ============================================================================
// SORTABLE LIST HOOK - Reusable sorting logic for scrollable lists
// ============================================================================
// Extracts common sorting patterns from QualityView and FeatureSplitView
// Supports three modes: default (primary metric), decisionMargin (SVM scores), diversity (medoids first)
// Supports ascending/descending direction for default and decisionMargin modes
// Tracks if current sort matches the template (default) for selection highlighting

export type SortMode = 'default' | 'decisionMargin' | 'diversity'

export interface SortableListConfig<T, K> {
  items: T[]
  getItemKey: (item: T) => K
  getDefaultScore: (item: T) => number | null | undefined
  decisionMarginScores: Map<K, number>
  diversityIds?: Set<K>     // IDs of medoids to show first in diversity mode
  defaultLabel: string      // e.g., 'Quality score', 'Decoder sim'
  defaultDirection?: 'asc' | 'desc'  // default: 'desc' (used as initial direction for default mode)
  // Template configuration - defines the "canonical" sort state for this view (used for isTemplateSort)
  templateMode?: SortMode   // default: 'decisionMargin'
  templateDirection?: 'asc' | 'desc'           // default: 'asc'
  // Initial state configuration - defines the starting sort state (defaults to template values)
  initialMode?: SortMode
  initialDirection?: 'asc' | 'desc'
}

export interface SortableListResult<T> {
  sortMode: SortMode
  setSortMode: (mode: SortMode) => void
  sortDirection: 'asc' | 'desc'
  setSortDirection: (direction: 'asc' | 'desc') => void
  sortedItems: T[]
  columnHeaderProps: {
    label: string
    sortDirection?: 'asc' | 'desc'  // undefined for diversity mode (no direction indicator)
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
  diversityIds,
  defaultLabel,
  defaultDirection: _defaultDirection = 'desc',  // Kept for backward compatibility, but sortDirection is used
  templateMode = 'decisionMargin',
  templateDirection = 'asc',
  initialMode,
  initialDirection
}: SortableListConfig<T, K>): SortableListResult<T> {
  void _defaultDirection  // Consume to avoid unused variable warning
  // Sort mode: 'default' (primary metric), 'decisionMargin' (SVM uncertainty), or 'diversity' (medoids first)
  // Initialize to initialMode if provided, otherwise use templateMode
  const [sortMode, setSortModeInternal] = useState<SortMode>(initialMode ?? templateMode)

  // Sort direction: applies to default and decisionMargin modes (diversity ignores direction)
  // Initialize to initialDirection if provided, otherwise use templateDirection
  const [sortDirection, setSortDirectionInternal] = useState<'asc' | 'desc'>(initialDirection ?? templateDirection)

  const [isPulsing, setIsPulsing] = useState(false)

  // Wrapped setSortMode that triggers pulse animation when switching to decisionMargin
  const setSortMode = useCallback((mode: SortMode) => {
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
    // Diversity mode: show only medoids (diverse representatives)
    if (sortMode === 'diversity' && diversityIds && diversityIds.size > 0) {
      const medoids: T[] = []
      for (const item of items) {
        if (diversityIds.has(getItemKey(item))) {
          medoids.push(item)
        }
      }
      return medoids
    }

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
  }, [items, decisionMarginScores, diversityIds, sortMode, sortDirection, getItemKey, getDefaultScore])

  const toggleSortDirection = useCallback(() => {
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    setSortDirection(newDirection)
  }, [sortDirection, setSortDirection])

  const columnHeaderProps = useMemo(() => ({
    label: sortMode === 'decisionMargin' ? '|Decision Margin|' : sortMode === 'diversity' ? '-' : defaultLabel,
    sortDirection: sortMode === 'diversity' ? undefined : sortDirection,  // No direction for diversity mode
    onClick: toggleSortDirection,
    isSortable: sortMode !== 'diversity',  // Diversity mode doesn't support direction toggle
    isPulsing
  }), [sortMode, defaultLabel, sortDirection, toggleSortDirection, isPulsing])

  const getDisplayScore = useCallback((item: T): number | undefined => {
    if (sortMode === 'diversity') {
      // No score display for diversity mode (items are just medoids or not)
      return undefined
    }
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
