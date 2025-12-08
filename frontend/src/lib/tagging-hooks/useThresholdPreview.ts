import { useMemo } from 'react'
import type { CategoryCounts } from '../../components/SelectionBar'

// ============================================================================
// useThresholdPreview - Calculate preview counts for SelectionBar
// ============================================================================
// Calculates how selection counts would change if thresholds are applied

type SelectionState = 'selected' | 'rejected'
type SelectionSource = 'manual' | 'auto'

interface UseThresholdPreviewOptions<K> {
  /** All item keys */
  itemKeys: K[]
  /** Similarity scores for each item */
  scores: Map<K, number>
  /** Current selection states */
  selectionStates: Map<K, SelectionState>
  /** Current selection sources */
  selectionSources: Map<K, SelectionSource>
  /** Threshold for auto-selecting (items >= this become 'selected') */
  selectThreshold: number
  /** Threshold for auto-rejecting (items < this become 'rejected') */
  rejectThreshold: number
}

interface UseThresholdPreviewReturn {
  /** Preview counts for SelectionBar previewCounts prop */
  previewCounts: CategoryCounts
  /** Current counts (for comparison) */
  currentCounts: CategoryCounts
  /** Number of unsure items that would be auto-selected */
  willBeAutoSelected: number
  /** Number of unsure items that would be auto-rejected */
  willBeAutoRejected: number
}

export function useThresholdPreview<K>(
  options: UseThresholdPreviewOptions<K>
): UseThresholdPreviewReturn {
  const {
    itemKeys,
    scores,
    selectionStates,
    selectionSources,
    selectThreshold,
    rejectThreshold
  } = options

  return useMemo(() => {
    // Current counts
    let confirmed = 0
    let autoSelected = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    // Preview additions
    let willBeAutoSelected = 0
    let willBeAutoRejected = 0

    for (const key of itemKeys) {
      const state = selectionStates.get(key)
      const source = selectionSources.get(key)
      const score = scores.get(key)

      // Count current state
      if (state === 'selected') {
        if (source === 'auto') {
          autoSelected++
        } else {
          confirmed++
        }
      } else if (state === 'rejected') {
        if (source === 'auto') {
          autoRejected++
        } else {
          rejected++
        }
      } else {
        // Currently unsure - check if would be auto-tagged
        unsure++

        if (score !== undefined) {
          if (score >= selectThreshold) {
            willBeAutoSelected++
          } else if (score < rejectThreshold) {
            willBeAutoRejected++
          }
        }
      }
    }

    const total = itemKeys.length

    const currentCounts: CategoryCounts = {
      confirmed,
      autoSelected,
      rejected,
      autoRejected,
      unsure,
      total
    }

    // Preview counts after threshold would be applied
    const previewCounts: CategoryCounts = {
      confirmed,
      autoSelected: autoSelected + willBeAutoSelected,
      rejected,
      autoRejected: autoRejected + willBeAutoRejected,
      unsure: unsure - willBeAutoSelected - willBeAutoRejected,
      total
    }

    return {
      previewCounts,
      currentCounts,
      willBeAutoSelected,
      willBeAutoRejected
    }
  }, [itemKeys, scores, selectionStates, selectionSources, selectThreshold, rejectThreshold])
}

export default useThresholdPreview
