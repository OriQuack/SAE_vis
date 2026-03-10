import * as api from '../api'
import { isUserConfirmed } from '../lib/tagging-hooks/useCommitHistory'
import { FLIP_HISTORY_WINDOW_SIZE } from '../components/ConvergenceIndicator'
import type { FlipTrackingInfo } from '../types'

// ============================================================================
// CAUSE STAGE ACTIONS (multi-class features)
// ============================================================================

/**
 * Factory function to create cause (multi-class feature) actions for the store
 */
export const createCauseActions = (set: any, get: any) => ({
  // ============================================================================
  // CAUSE COUNTS GETTER
  // ============================================================================

  /**
   * Get feature counts from cause selection states
   * Returns: { noisyActivation, missedNgram, missedContext, wellExplained, unsure, total } + manual/auto breakdown
   * Used by TagStagePanel for consistent counts
   *
   * NOTE: Stage 3 is different from Stage 1 & 2:
   * - Stage 1 & 2 use getSelectedNodeFeatures() because selection states map to threshold segments
   * - Stage 3 iterates causeSelectionStates directly (features from need_revision node are fixed)
   */
  getCauseCounts: () => {
    const state = get()
    const { causeSelectionStates, causeSelectionSources } = state

    let noisyActivation = 0, missedNgram = 0, missedContext = 0, wellExplained = 0
    let noisyActivationManual = 0, noisyActivationAuto = 0
    let missedNgramManual = 0, missedNgramAuto = 0
    let missedContextManual = 0, missedContextAuto = 0
    let wellExplainedManual = 0, wellExplainedAuto = 0

    // Iterate directly over causeSelectionStates (not filtered by current selection)
    // This matches how OverviewSummary.tsx counts Stage 3 tags
    causeSelectionStates.forEach((category: string, featureId: number) => {
      const source = causeSelectionSources.get(featureId) || 'click'

      if (category === 'noisy-activation') {
        noisyActivation++
        if (isUserConfirmed(source)) noisyActivationManual++
        else noisyActivationAuto++
      } else if (category === 'missed-N-gram') {
        missedNgram++
        if (isUserConfirmed(source)) missedNgramManual++
        else missedNgramAuto++
      } else if (category === 'missed-context') {
        missedContext++
        if (isUserConfirmed(source)) missedContextManual++
        else missedContextAuto++
      } else if (category === 'well-explained') {
        wellExplained++
        if (isUserConfirmed(source)) wellExplainedManual++
        else wellExplainedAuto++
      }
    })

    return {
      noisyActivation, missedNgram, missedContext, wellExplained,
      unsure: 0,  // No "unsure" in causeSelectionStates (only tagged features are stored)
      total: causeSelectionStates.size,
      noisyActivationManual, noisyActivationAuto,
      missedNgramManual, missedNgramAuto,
      missedContextManual, missedContextAuto,
      wellExplainedManual, wellExplainedAuto
    }
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (cause mode)
  // ============================================================================

  showTagAutomaticPopover: async (mode: 'feature' | 'pair' | 'cause', _position: { x: number; y: number }, tagLabel: string, _selectedFeatureIds?: Set<number>, _threshold?: number) => {
    // Only handle cause mode in this file
    if (mode !== 'cause') {
      console.warn('[Cause.showTagAutomaticPopover] Wrong mode:', mode)
      return
    }

    console.log(`[Store.showTagAutomaticPopover] Opening ${mode} tagging popover with label: ${tagLabel}`)

    // For cause mode, we don't use histogram-based tagging
    // This is a placeholder for consistency
    console.warn('[Store.showTagAutomaticPopover] Cause mode tagging not yet implemented')
    set({ tagAutomaticState: null })
  },

  hideTagAutomaticPopover: () => {
    console.log('[Store.hideTagAutomaticPopover] Closing tagging popover')
    set({ tagAutomaticState: null })
  },

  updateSimilarityThresholds: (selectThreshold: number) => {
    const { tagAutomaticState } = get()
    if (!tagAutomaticState) return

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        selectThreshold
      }
    })
  },

  updateBothSimilarityThresholds: (selectThreshold: number, rejectThreshold: number) => {
    const { tagAutomaticState } = get()
    if (!tagAutomaticState) return

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        selectThreshold,
        rejectThreshold
      }
    })
  },

  applySimilarityTags: () => {
    const { tagAutomaticState } = get()

    if (!tagAutomaticState || !tagAutomaticState.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode } = tagAutomaticState

    // Only handle cause mode in this file
    if (mode !== 'cause') {
      console.warn('[Cause.applySimilarityTags] Wrong mode:', mode)
      return
    }

    // For cause mode, we don't use histogram-based tagging
    // This is a placeholder for consistency
    console.warn('[Store.applySimilarityTags] Cause mode tagging not yet implemented')

    // Close popover after applying
    set({ tagAutomaticState: null })
  },

  minimizeSimilarityTaggingPopover: () => {
    const { tagAutomaticState } = get()
    if (!tagAutomaticState) return

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        minimized: true
      }
    })
    console.log('[Store.minimizeSimilarityTaggingPopover] Popover minimized')
  },

  restoreSimilarityTaggingPopover: () => {
    const { tagAutomaticState } = get()
    if (!tagAutomaticState) return

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        minimized: false
      }
    })
    console.log('[Store.restoreSimilarityTaggingPopover] Popover restored')
  },

  /**
   * Fetch SVM cause classification for features.
   * Uses mean metric vectors per feature for OvR SVM classification.
   *
   * Requires manual tags before training SVM - will early-return if
   * causeSelections is empty. This ensures no auto-classification
   * happens on initial CauseView entry.
   *
   * @param featureIds - All feature IDs to classify
   * @param causeSelections - Manual selections with source for weighted SVM training
   */
  fetchCauseClassification: async (
    featureIds: number[],
    causeSelections: Record<number, { category: string; source: 'click' | 'threshold' }>
  ) => {
    const state = get()

    // Early return if already loading to prevent duplicate concurrent requests
    if (state.causeClassificationLoading) {
      console.log('[Store.fetchCauseClassification] ⚠️ Already loading, skipping duplicate request')
      return
    }

    // Require at least some manual tags before training SVM
    // This prevents auto-triggering with anchor points on entry
    if (Object.keys(causeSelections).length === 0) {
      console.log('[Store.fetchCauseClassification] ⚠️ No manual tags provided, skipping SVM training')
      return
    }

    // Skip API call if ALL features are already manually tagged - nothing to predict
    const manualTagCount = Object.keys(causeSelections).length
    if (manualTagCount === featureIds.length && manualTagCount > 0) {
      console.log('[Store.fetchCauseClassification] ⚠️ All features already tagged, skipping API call')
      return
    }

    console.log('[Store.fetchCauseClassification] Starting classification:', {
      featureCount: featureIds.length,
      manualTagCount: Object.keys(causeSelections).length
    })

    try {
      set({ causeClassificationLoading: true, causeClassificationError: null })

      const response = await api.getCauseClassification(featureIds, causeSelections)

      console.log('[Store.fetchCauseClassification] ✅ Classification complete:', {
        resultCount: response.results.length,
        totalFeatures: response.total_features,
        categoryCounts: response.category_counts
      })

      // Update causeSelectionStates with predicted categories for non-manual features
      // This enables contour visualization of the SVM classification results
      const currentState = get()

      // === FLIP TRACKING LOGIC ===
      // Build current predictions map from SVM results
      const currentPredictions = new Map<number, string>()
      response.results.forEach((result) => {
        currentPredictions.set(result.feature_id, result.predicted_category)
      })

      // Get existing flip tracking
      const existingFlipTracking = currentState.causeFlipTracking

      let updatedFlipTracking: FlipTrackingInfo

      if (existingFlipTracking && existingFlipTracking.previousPredictions.size > 0) {
        // Calculate flips vs previous iteration
        let flips = 0
        let total = 0
        const flipTransitions: Record<string, number> = {}

        currentPredictions.forEach((curr, featureId) => {
          const prev = existingFlipTracking.previousPredictions.get(featureId)
          if (prev !== undefined) {
            total++
            if (prev !== curr) {
              flips++
              const transitionKey = `${prev}→${curr}`
              flipTransitions[transitionKey] = (flipTransitions[transitionKey] || 0) + 1
            }
          }
        })

        const flipRate = total > 0 ? flips / total : 0
        const newIteration = existingFlipTracking.totalIterations + 1

        // Count predictions by category
        const predictionCounts: Record<string, number> = {}
        currentPredictions.forEach((category) => {
          predictionCounts[category] = (predictionCounts[category] || 0) + 1
        })

        updatedFlipTracking = {
          flipHistory: [
            ...existingFlipTracking.flipHistory,
            { flipRate, isBatch: false, iteration: newIteration, predictionCounts, flipTransitions }
          ].slice(-FLIP_HISTORY_WINDOW_SIZE),
          totalIterations: newIteration,
          flippedBins: new Set<number>(),
          previousPredictions: currentPredictions as Map<number | string, string> as Map<number | string, 'selected' | 'rejected'>
        }
      } else {
        // First classification - initialize iteration 0
        const predictionCounts: Record<string, number> = {}
        currentPredictions.forEach((category) => {
          predictionCounts[category] = (predictionCounts[category] || 0) + 1
        })

        updatedFlipTracking = {
          flipHistory: [{
            flipRate: 0,
            isBatch: false,
            iteration: 0,
            predictionCounts,
            flipTransitions: {}
          }],
          totalIterations: 0,
          flippedBins: new Set<number>(),
          previousPredictions: currentPredictions as Map<number | string, string> as Map<number | string, 'selected' | 'rejected'>
        }
      }
      // === END FLIP TRACKING LOGIC ===

      // Set of manually tagged feature IDs: includes cause-category tags (from the request)
      // AND any other user-confirmed tags (e.g., well-explained) that should not be overwritten
      const manualFeatureIds = new Set(Object.keys(causeSelections).map(Number))
      currentState.causeSelectionStates.forEach((_category: string, featureId: number) => {
        const source = currentState.causeSelectionSources.get(featureId)
        if (isUserConfirmed(source)) {
          manualFeatureIds.add(featureId)
        }
      })

      // Build change lists first without creating Maps
      // Only create new Map objects if there are actual changes to prevent infinite loops
      const statesToUpdate: Array<[number, 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained']> = []
      const sourcesToUpdate: Array<[number, 'predicted']> = []

      response.results.forEach((result) => {
        // Only update non-manually-tagged features
        if (!manualFeatureIds.has(result.feature_id)) {
          const currentCategory = currentState.causeSelectionStates.get(result.feature_id)
          const currentSource = currentState.causeSelectionSources.get(result.feature_id)
          const predictedCategory = result.predicted_category as 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

          // Only update if there's an actual change
          if (currentCategory !== predictedCategory || currentSource !== 'predicted') {
            statesToUpdate.push([result.feature_id, predictedCategory])
            sourcesToUpdate.push([result.feature_id, 'predicted'])
          }
        }
      })

      console.log('[Store.fetchCauseClassification] Updated selection states:', {
        manualCount: manualFeatureIds.size,
        changesToApply: statesToUpdate.length,
        hasChanges: statesToUpdate.length > 0
      })

      // Parse committee votes if returned by API (for disagreement highlighting)
      let causeCommitteeVotes: Map<number, { svm_category: string; rf_category: string; mlp_category: string }> | null = null
      if (response.committee_votes) {
        causeCommitteeVotes = new Map(
          Object.entries(response.committee_votes).map(([id, vote]) => [
            parseInt(id, 10),
            vote as { svm_category: string; rf_category: string; mlp_category: string }
          ])
        )
        console.log('[Store.fetchCauseClassification] Committee votes parsed:', causeCommitteeVotes.size)
      }

      // Compute signature of manual tags to mark as "already classified"
      // This prevents CauseRadViz from re-triggering classification on commit restore
      const classificationManualIds: number[] = []
      currentState.causeSelectionStates.forEach((_category: string, featureId: number) => {
        const source = currentState.causeSelectionSources.get(featureId)
        if (source === 'click' || source === 'threshold') {
          classificationManualIds.push(featureId)
        }
      })
      const causeLastClassificationSignature = classificationManualIds.sort((a, b) => a - b).join(',')

      // Only create new Maps and update state if there are actual changes
      // This prevents cascading re-renders from new Map references that would cause infinite loops
      if (statesToUpdate.length > 0) {
        const newStates = new Map(currentState.causeSelectionStates)
        const newSources = new Map(currentState.causeSelectionSources)

        statesToUpdate.forEach(([id, category]) => newStates.set(id, category))
        sourcesToUpdate.forEach(([id, source]) => newSources.set(id, source))

        // Build decision margins maps from response
        const categoryDecisionMargins = new Map<number, Record<string, number>>()
        const decisionMargins = new Map<number, number>()
        response.results.forEach((result) => {
          categoryDecisionMargins.set(result.feature_id, result.decision_scores)
          decisionMargins.set(result.feature_id, result.decision_margin)
        })

        set({
          causeCategoryDecisionMargins: categoryDecisionMargins,
          causeDecisionMargins: decisionMargins,
          causeSelectionStates: newStates,
          causeSelectionSources: newSources,
          causeClassificationLoading: false,
          causeClassificationError: null,
          causeFlipTracking: updatedFlipTracking,
          causeCommitteeVotes,
          causeLastClassificationSignature
        })
      } else {
        // No state changes but still update flip tracking and committee votes
        set({
          causeClassificationLoading: false,
          causeClassificationError: null,
          causeFlipTracking: updatedFlipTracking,
          causeCommitteeVotes,
          causeLastClassificationSignature
        })
      }
    } catch (error) {
      console.error('[Store.fetchCauseClassification] ❌ Failed:', error)
      set({
        causeClassificationError: error instanceof Error ? error.message : 'Failed to fetch cause classification',
        causeClassificationLoading: false
      })
    }
  },

  /**
   * Clear cause flip tracking state
   */
  clearCauseFlipTracking: () => {
    console.log('[Store.clearCauseFlipTracking] Clearing cause flip tracking state')
    set({ causeFlipTracking: null })
  },

})
