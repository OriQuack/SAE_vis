import * as api from '../api'

// ============================================================================
// CAUSE STAGE ACTIONS (multi-class features)
// ============================================================================

/**
 * Factory function to create cause (multi-class feature) actions for the store
 */
export const createCauseActions = (set: any, get: any) => ({
  // ============================================================================
  // CAUSE SIMILARITY SORT ACTION
  // ============================================================================

  /**
   * Sort cause table by similarity scores (multi-category with One-vs-Rest SVM)
   */
  sortCauseBySimilarity: async () => {
    const state = get()
    const { causeSelectionStates, causeSelectionSources, tableData } = state

    console.log('[Store.sortCauseBySimilarity] Starting cause similarity sort:', {
      selectionStatesSize: causeSelectionStates.size,
      hasTableData: !!tableData
    })

    // Validate: need at least 2 different cause categories selected
    if (causeSelectionStates.size < 1) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  No cause categories selected for similarity sort')
      return
    }

    if (!tableData?.features) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  No table data available')
      return
    }

    // Count features per cause category (ONLY manually labeled)
    const categoryCounts: Record<string, number> = {
      'noisy-activation': 0,
      'missed-lexicon': 0,
      'missed-context': 0
    }

    causeSelectionStates.forEach((category: 'noisy-activation' | 'missed-lexicon' | 'missed-context', featureId: number) => {
      const source = causeSelectionSources.get(featureId)
      // Only count manually labeled features
      if (source === 'manual') {
        categoryCounts[category]++
      }
    })

    const categoriesWithFeatures = Object.values(categoryCounts).filter(c => c > 0).length

    console.log('[Store.sortCauseBySimilarity] Category counts (manual only):', categoryCounts, {
      categoriesWithFeatures
    })

    // Need at least 2 different categories for meaningful sort
    if (categoriesWithFeatures < 2) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  Need at least 2 different cause categories selected (manual only)')
      return
    }

    try {
      set({ isCauseSimilaritySortLoading: true })

      // Convert Map to plain object for API (ONLY manually labeled)
      const causeSelections: Record<number, string> = {}
      causeSelectionStates.forEach((category: string, featureId: number) => {
        const source = causeSelectionSources.get(featureId)
        // Only use manually labeled features for similarity sorting
        if (source === 'manual') {
          causeSelections[featureId] = category
        }
      })

      // Get all feature IDs
      const allFeatureIds = tableData.features.map((f: any) => f.feature_id)

      console.log('[Store.sortCauseBySimilarity] Calling API:', {
        taggedFeatures: Object.keys(causeSelections).length,
        totalFeatures: allFeatureIds.length,
        categories: Array.from(new Set(Object.values(causeSelections)))
      })

      // Call new multi-class OvR endpoint
      const response = await api.getCauseSimilaritySort(
        causeSelections,
        allFeatureIds
      )

      console.log('[Store.sortCauseBySimilarity] API response:', {
        sortedFeaturesCount: response.sorted_features.length,
        totalFeatures: response.total_features
      })

      // Store per-category decision margins in a nested map
      const categoryDecisionMargins = new Map<number, Record<string, number>>()
      response.sorted_features.forEach((fs) => {
        categoryDecisionMargins.set(fs.feature_id, fs.category_decision_margins)
      })

      // Store in state
      set({
        causeCategoryDecisionMargins: categoryDecisionMargins,
        tableSortBy: 'cause_similarity',
        tableSortDirection: 'desc',
        isCauseSimilaritySortLoading: false
      })

      console.log('[Store.sortCauseBySimilarity] ✅ Cause similarity sort complete:', {
        decisionMarginsMapSize: categoryDecisionMargins.size,
        sortBy: 'cause_similarity'
      })

    } catch (error) {
      console.error('[Store.sortCauseBySimilarity] ❌ Failed to calculate cause similarity sort:', error)
      set({ isCauseSimilaritySortLoading: false })
    }
  },

  /**
   * Set which category to use for cause similarity sorting
   * @param category - 'noisy-activation', 'missed-lexicon', 'missed-context', or null for max decision margin
   */
  setCauseSortCategory: (category: string | null) => {
    set({ causeSortCategory: category })
    console.log('[Store.setCauseSortCategory] Cause sort category updated:', category)
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
   * Show thresholds on table - sorts by similarity and shows threshold lines
   */
  showThresholdsOnTable: async () => {
    const { tagAutomaticState } = get()
    if (!tagAutomaticState) {
      console.warn('[Store.showThresholdsOnTable] No popover state available')
      return
    }

    const { mode, selectThreshold, rejectThreshold } = tagAutomaticState

    // Only handle cause mode in this file
    if (mode !== 'cause') {
      console.warn('[Cause.showThresholdsOnTable] Wrong mode:', mode)
      return
    }

    console.log('[Store.showThresholdsOnTable] Showing thresholds on table:', {
      mode,
      selectThreshold,
      rejectThreshold
    })

    try {
      // Step 1: Trigger cause similarity sort
      await get().sortCauseBySimilarity()

      // Step 2: Calculate preview sets (which items would be auto-tagged)
      const { causeSelectionStates, causeCategoryDecisionMargins, causeSortCategory } = get()
      const previewAutoSelected = new Set<number | string>()
      const previewAutoRejected = new Set<number | string>()

      // Check each feature with decision margin scores
      causeCategoryDecisionMargins.forEach((decisionMargins: any, featureId: any) => {
        const isAlreadyTagged = causeSelectionStates.has(featureId)
        if (!isAlreadyTagged) {
          let score = -Infinity
          if (causeSortCategory && decisionMargins[causeSortCategory] !== undefined) {
            score = decisionMargins[causeSortCategory] as number
          } else {
            score = Math.max(...Object.values(decisionMargins) as number[])
          }
          if (score >= selectThreshold) {
            previewAutoSelected.add(featureId)
          } else if (score <= rejectThreshold) {
            previewAutoRejected.add(featureId)
          }
        }
      })

      console.log('[Store.showThresholdsOnTable] Preview sets calculated:', {
        autoSelected: previewAutoSelected.size,
        autoRejected: previewAutoRejected.size
      })

      // Step 3: Store visualization state
      // Note: Setting positions to null - stripe patterns are sufficient for preview
      set({
        thresholdVisualization: {
          visible: true,
          mode,
          selectThreshold,
          rejectThreshold,
          selectPosition: null,
          rejectPosition: null,
          previewAutoSelected,
          previewAutoRejected
        }
      })

      // Step 4: Minimize popover
      get().minimizeSimilarityTaggingPopover()

      console.log('[Store.showThresholdsOnTable] Thresholds displayed for cause')

    } catch (error) {
      console.error('[Store.showThresholdsOnTable] Failed to show thresholds:', error)
    }
  },

  /**
   * Hide thresholds from table
   */
  hideThresholdsOnTable: () => {
    set({ thresholdVisualization: null })
    console.log('[Store.hideThresholdsOnTable] Thresholds hidden')
  }
})
