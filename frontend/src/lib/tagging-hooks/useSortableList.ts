import { useState, useMemo, useCallback } from 'react'

// ============================================================================
// SORTABLE LIST HOOK - Reusable sorting logic for scrollable lists
// ============================================================================
// Extracts common sorting patterns from QualityView and FeatureSplitView
// Supports two modes: default (primary metric) and decisionMargin (SVM scores)

export interface SortableListConfig<T, K> {
  items: T[]
  getItemKey: (item: T) => K
  getDefaultScore: (item: T) => number | null | undefined
  decisionMarginScores: Map<K, number>
  defaultLabel: string      // e.g., 'Quality score', 'Decoder sim'
  defaultDirection?: 'asc' | 'desc'  // default: 'desc'
}

export interface SortableListResult<T> {
  sortMode: 'default' | 'decisionMargin'
  setSortMode: (mode: 'default' | 'decisionMargin') => void
  sortedItems: T[]
  columnHeaderProps: {
    label: string
    sortDirection: 'asc' | 'desc'
    onClick: () => void
  }
  getDisplayScore: (item: T) => number | undefined
}

export function useSortableList<T, K>({
  items,
  getItemKey,
  getDefaultScore,
  decisionMarginScores,
  defaultLabel,
  defaultDirection = 'desc'
}: SortableListConfig<T, K>): SortableListResult<T> {
  const [sortMode, setSortMode] = useState<'default' | 'decisionMargin'>('default')

  const sortedItems = useMemo(() => {
    if (sortMode === 'decisionMargin' && decisionMarginScores.size > 0) {
      // Decision margin mode: sort by |score| ascending (least confident first)
      // Items without scores go to the end (Infinity)
      return [...items].sort((a, b) => {
        const keyA = getItemKey(a)
        const keyB = getItemKey(b)
        const scoreA = decisionMarginScores.get(keyA)
        const scoreB = decisionMarginScores.get(keyB)
        const valA = scoreA !== undefined ? Math.abs(scoreA) : Infinity
        const valB = scoreB !== undefined ? Math.abs(scoreB) : Infinity
        return valA - valB
      })
    }

    // Default mode: sort by primary metric
    return [...items].sort((a, b) => {
      const scoreA = getDefaultScore(a) ?? (defaultDirection === 'desc' ? -Infinity : Infinity)
      const scoreB = getDefaultScore(b) ?? (defaultDirection === 'desc' ? -Infinity : Infinity)
      return defaultDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB
    })
  }, [items, decisionMarginScores, sortMode, getItemKey, getDefaultScore, defaultDirection])

  const toggleSortMode = useCallback(() => {
    setSortMode(prev => prev === 'default' ? 'decisionMargin' : 'default')
  }, [])

  const columnHeaderProps = useMemo(() => ({
    label: sortMode === 'decisionMargin' ? 'Decision Margin' : defaultLabel,
    sortDirection: (sortMode === 'decisionMargin' ? 'asc' : defaultDirection) as 'asc' | 'desc',
    onClick: toggleSortMode
  }), [sortMode, defaultLabel, defaultDirection, toggleSortMode])

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
    sortedItems,
    columnHeaderProps,
    getDisplayScore
  }
}
