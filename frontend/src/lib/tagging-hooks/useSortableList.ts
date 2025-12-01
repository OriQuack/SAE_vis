import { useState, useMemo, useCallback } from 'react'

// ============================================================================
// SORTABLE LIST HOOK - Reusable sorting logic for scrollable lists
// ============================================================================
// Extracts common sorting patterns from QualityView and FeatureSplitView
// Supports two modes: default (primary metric) and confidence (SVM scores)

export interface SortableListConfig<T, K> {
  items: T[]
  getItemKey: (item: T) => K
  getDefaultScore: (item: T) => number | null | undefined
  confidenceScores: Map<K, number>
  defaultLabel: string      // e.g., 'Quality score', 'Decoder sim'
  defaultDirection?: 'asc' | 'desc'  // default: 'desc'
}

export interface SortableListResult<T> {
  sortMode: 'default' | 'confidence'
  setSortMode: (mode: 'default' | 'confidence') => void
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
  confidenceScores,
  defaultLabel,
  defaultDirection = 'desc'
}: SortableListConfig<T, K>): SortableListResult<T> {
  const [sortMode, setSortMode] = useState<'default' | 'confidence'>('default')

  const sortedItems = useMemo(() => {
    if (sortMode === 'confidence' && confidenceScores.size > 0) {
      // Confidence mode: sort by |score| ascending (least confident first)
      // Items without scores go to the end (Infinity)
      return [...items].sort((a, b) => {
        const keyA = getItemKey(a)
        const keyB = getItemKey(b)
        const scoreA = confidenceScores.get(keyA)
        const scoreB = confidenceScores.get(keyB)
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
  }, [items, confidenceScores, sortMode, getItemKey, getDefaultScore, defaultDirection])

  const toggleSortMode = useCallback(() => {
    setSortMode(prev => prev === 'default' ? 'confidence' : 'default')
  }, [])

  const columnHeaderProps = useMemo(() => ({
    label: sortMode === 'confidence' ? 'Confidence' : defaultLabel,
    sortDirection: (sortMode === 'confidence' ? 'asc' : defaultDirection) as 'asc' | 'desc',
    onClick: toggleSortMode
  }), [sortMode, defaultLabel, defaultDirection, toggleSortMode])

  const getDisplayScore = useCallback((item: T): number | undefined => {
    if (sortMode === 'confidence') {
      return confidenceScores.get(getItemKey(item))
    }
    const score = getDefaultScore(item)
    return score ?? undefined
  }, [sortMode, confidenceScores, getItemKey, getDefaultScore])

  return {
    sortMode,
    setSortMode,
    sortedItems,
    columnHeaderProps,
    getDisplayScore
  }
}
