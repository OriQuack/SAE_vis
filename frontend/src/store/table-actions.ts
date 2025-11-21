import { createCommonTableActions } from './table-actions-common'
import { createFeatureSplittingActions } from './table-actions-feature-splitting'
import { createQualityActions } from './table-actions-quality'
import { createCauseActions } from './table-actions-cause'

// ============================================================================
// TABLE ACTIONS COMPOSER
// Combines all table-related actions from 4 modules:
// 1. Common (shared functionality)
// 2. Feature Splitting (pairs)
// 3. Quality (features)
// 4. Cause (multi-class features)
// ============================================================================

/**
 * Factory function to create all table-related actions for the store
 *
 * Note: Similarity tagging functions (showSimilarityTaggingPopover, applySimilarityTags, etc.)
 * are present in all 3 stage modules. They route to the correct implementation based on mode.
 * The routing happens within each function by checking the mode parameter.
 */
export const createTableActions = (set: any, get: any) => {
  // Create all action groups
  const commonActions = createCommonTableActions(set, get)
  const featureSplittingActions = createFeatureSplittingActions(set, get)
  const qualityActions = createQualityActions(set, get)
  const causeActions = createCauseActions(set, get)

  // Create unified similarity tagging actions that route based on mode
  const unifiedSimilarityActions = {
    showSimilarityTaggingPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string) => {
      if (mode === 'feature') {
        return qualityActions.showSimilarityTaggingPopover(mode, position, tagLabel)
      } else if (mode === 'pair') {
        return featureSplittingActions.showSimilarityTaggingPopover(mode, position, tagLabel)
      } else if (mode === 'cause') {
        return causeActions.showSimilarityTaggingPopover(mode, position, tagLabel)
      }
    },

    applySimilarityTags: () => {
      const { similarityTaggingPopover } = get()
      if (!similarityTaggingPopover) return

      const { mode } = similarityTaggingPopover
      if (mode === 'feature') {
        return qualityActions.applySimilarityTags()
      } else if (mode === 'pair') {
        return featureSplittingActions.applySimilarityTags()
      } else if (mode === 'cause') {
        return causeActions.applySimilarityTags()
      }
    },

    showThresholdsOnTable: async () => {
      const { similarityTaggingPopover } = get()
      if (!similarityTaggingPopover) return

      const { mode } = similarityTaggingPopover
      if (mode === 'feature') {
        return qualityActions.showThresholdsOnTable()
      } else if (mode === 'pair') {
        return featureSplittingActions.showThresholdsOnTable()
      } else if (mode === 'cause') {
        return causeActions.showThresholdsOnTable()
      }
    },

    // These functions are shared across all modes (use any implementation)
    hideSimilarityTaggingPopover: qualityActions.hideSimilarityTaggingPopover,
    updateSimilarityThresholds: qualityActions.updateSimilarityThresholds,
    updateBothSimilarityThresholds: qualityActions.updateBothSimilarityThresholds,
    minimizeSimilarityTaggingPopover: qualityActions.minimizeSimilarityTaggingPopover,
    restoreSimilarityTaggingPopover: qualityActions.restoreSimilarityTaggingPopover,
    hideThresholdsOnTable: qualityActions.hideThresholdsOnTable
  }

  // Combine all actions
  // Note: Similarity actions are overridden with unified implementations
  return {
    // Common actions (node selection, data fetching, stage management, etc.)
    ...commonActions,

    // Feature Splitting actions (pairs)
    sortPairsBySimilarity: featureSplittingActions.sortPairsBySimilarity,
    fetchDistributedPairs: featureSplittingActions.fetchDistributedPairs,
    clearDistributedPairs: featureSplittingActions.clearDistributedPairs,
    fetchSimilarityHistogram: featureSplittingActions.fetchSimilarityHistogram,

    // Quality actions (features)
    sortBySimilarity: qualityActions.sortBySimilarity,

    // Cause actions (multi-class features)
    sortCauseBySimilarity: causeActions.sortCauseBySimilarity,
    setCauseSortCategory: causeActions.setCauseSortCategory,

    // Unified similarity tagging actions (route based on mode)
    ...unifiedSimilarityActions
  }
}
