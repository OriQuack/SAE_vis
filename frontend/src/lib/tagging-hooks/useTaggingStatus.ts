import { useMemo } from 'react'

// ============================================================================
// useTaggingStatus - Tagging completion status
// ============================================================================
// Extracts the allTagged calculation pattern used in FeatureSplitView and QualityView

type SelectionState = 'selected' | 'rejected'

interface UseTaggingStatusOptions<K> {
  /** All item keys that need to be tagged */
  itemKeys: K[]
  /** Current selection states */
  selectionStates: Map<K, SelectionState>
}

interface UseTaggingStatusReturn {
  /** True if all items have been tagged */
  allTagged: boolean
  /** Number of items that have been tagged */
  taggedCount: number
  /** Number of items not yet tagged */
  untaggedCount: number
  /** Number of items tagged as 'selected' */
  selectedCount: number
  /** Number of items tagged as 'rejected' */
  rejectedCount: number
  /** Total number of items */
  totalCount: number
}

export function useTaggingStatus<K>(
  options: UseTaggingStatusOptions<K>
): UseTaggingStatusReturn {
  const { itemKeys, selectionStates } = options

  return useMemo(() => {
    if (itemKeys.length === 0) {
      return {
        allTagged: false,
        taggedCount: 0,
        untaggedCount: 0,
        selectedCount: 0,
        rejectedCount: 0,
        totalCount: 0
      }
    }

    let selectedCount = 0
    let rejectedCount = 0

    for (const key of itemKeys) {
      const state = selectionStates.get(key)
      if (state === 'selected') {
        selectedCount++
      } else if (state === 'rejected') {
        rejectedCount++
      }
    }

    const taggedCount = selectedCount + rejectedCount
    const untaggedCount = itemKeys.length - taggedCount
    const allTagged = itemKeys.length > 0 && taggedCount === itemKeys.length

    return {
      allTagged,
      taggedCount,
      untaggedCount,
      selectedCount,
      rejectedCount,
      totalCount: itemKeys.length
    }
  }, [itemKeys, selectionStates])
}

export default useTaggingStatus
