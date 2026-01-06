import * as api from '../api'

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
      const source = causeSelectionSources.get(featureId) || 'manual'

      if (category === 'noisy-activation') {
        noisyActivation++
        if (source === 'manual') noisyActivationManual++
        else noisyActivationAuto++
      } else if (category === 'missed-N-gram') {
        missedNgram++
        if (source === 'manual') missedNgramManual++
        else missedNgramAuto++
      } else if (category === 'missed-context') {
        missedContext++
        if (source === 'manual') missedContextManual++
        else missedContextAuto++
      } else if (category === 'well-explained') {
        wellExplained++
        if (source === 'manual') wellExplainedManual++
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
      'missed-N-gram': 0,
      'missed-context': 0,
      'well-explained': 0
    }

    causeSelectionStates.forEach((category: 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained', featureId: number) => {
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

  // ============================================================================
  // UMAP PROJECTION ACTIONS (for Stage 3 CauseView scatter plot)
  // ============================================================================

  /**
   * Fetch UMAP 2D projection for the given features.
   * Uses cause-related metrics: semantic_similarity, score_detection, score_embedding, score_fuzz
   *
   * Memoization: Skips API call if the same featureIds have already been fetched
   * and data is cached in the store. This prevents redundant fetches when
   * revisiting CauseView.
   */
  fetchUmapProjection: async (
    featureIds: number[],
    options?: { nNeighbors?: number; minDist?: number }
  ) => {
    // Validate minimum features (UMAP requires at least 3)
    if (featureIds.length < 3) {
      console.warn('[Store.fetchUmapProjection] ⚠️ UMAP requires at least 3 features')
      set({
        umapError: 'UMAP requires at least 3 features',
        umapLoading: false,
        umapFeatureSignature: null
      })
      return
    }

    // Compute stable signature: sorted feature IDs joined
    const sortedIds = [...featureIds].sort((a, b) => a - b)
    const signature = `${sortedIds.length}:${sortedIds.join(',')}`

    // Check if we already have this data cached
    const state = get()
    if (state.umapFeatureSignature === signature && state.umapProjection !== null) {
      console.log('[Store.fetchUmapProjection] ⚡ Using cached UMAP projection:', {
        featureCount: featureIds.length,
        cachedPoints: state.umapProjection.length
      })
      return
    }

    console.log('[Store.fetchUmapProjection] Starting UMAP projection:', {
      featureCount: featureIds.length,
      options,
      signatureChanged: state.umapFeatureSignature !== signature
    })

    try {
      set({ umapLoading: true, umapError: null })

      const response = await api.getUmapProjection(featureIds, options)

      console.log('[Store.fetchUmapProjection] ✅ UMAP projection complete:', {
        pointCount: response.points.length,
        totalFeatures: response.total_features,
        paramsUsed: response.params_used
      })

      set({
        umapProjection: response.points,
        umapFeatureSignature: signature,
        umapLoading: false,
        umapError: null
      })
    } catch (error) {
      console.error('[Store.fetchUmapProjection] ❌ Failed to fetch UMAP projection:', error)
      set({
        umapError: error instanceof Error ? error.message : 'Failed to fetch UMAP projection',
        umapLoading: false,
        umapFeatureSignature: null
      })
    }
  },

  /**
   * Fetch SVM cause classification for features.
   * Uses mean metric vectors per feature for OvR SVM classification.
   *
   * Backend uses anchor points as baseline training data, so manual tags
   * are optional. When provided, manual tags improve predictions.
   */
  fetchCauseClassification: async (
    featureIds: number[],
    causeSelections: Record<number, string>
  ) => {
    const state = get()

    // Early return if already loading to prevent duplicate concurrent requests
    if (state.causeClassificationLoading) {
      console.log('[Store.fetchCauseClassification] ⚠️ Already loading, skipping duplicate request')
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

    // No validation required - backend uses anchor points as baseline training data
    // Manual tags are optional and improve predictions when provided

    try {
      set({ causeClassificationLoading: true, causeClassificationError: null })

      const response = await api.getCauseClassification(featureIds, causeSelections)

      console.log('[Store.fetchCauseClassification] ✅ Classification complete:', {
        resultCount: response.results.length,
        totalFeatures: response.total_features,
        categoryCounts: response.category_counts
      })

      // Build decision margins map (feature_id -> { category -> score })
      const categoryDecisionMargins = new Map<number, Record<string, number>>()
      response.results.forEach((result) => {
        categoryDecisionMargins.set(result.feature_id, result.decision_scores)
      })

      // Update causeSelectionStates with predicted categories for non-manual features
      // This enables contour visualization of the SVM classification results
      const currentState = get()

      // Set of manually tagged feature IDs (from the request)
      const manualFeatureIds = new Set(Object.keys(causeSelections).map(Number))

      // Track if any actual changes occur to avoid unnecessary state updates
      // that would trigger cascading re-renders
      let hasChanges = false
      const newStates = new Map(currentState.causeSelectionStates)
      const newSources = new Map(currentState.causeSelectionSources)

      response.results.forEach((result) => {
        // Only update non-manually-tagged features
        if (!manualFeatureIds.has(result.feature_id)) {
          const currentCategory = currentState.causeSelectionStates.get(result.feature_id)
          const currentSource = currentState.causeSelectionSources.get(result.feature_id)
          const predictedCategory = result.predicted_category as 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

          // Only update if there's an actual change
          if (currentCategory !== predictedCategory || currentSource !== 'auto') {
            hasChanges = true
            newStates.set(result.feature_id, predictedCategory)
            newSources.set(result.feature_id, 'auto')
          }
        }
      })

      console.log('[Store.fetchCauseClassification] Updated selection states:', {
        manualCount: manualFeatureIds.size,
        autoCount: newStates.size - manualFeatureIds.size,
        totalStates: newStates.size,
        hasChanges
      })

      // Only update Map state if there were actual changes
      // This prevents cascading re-renders from new Map references
      if (hasChanges) {
        set({
          causeCategoryDecisionMargins: categoryDecisionMargins,
          causeSelectionStates: newStates,
          causeSelectionSources: newSources,
          causeClassificationLoading: false,
          causeClassificationError: null
        })
      } else {
        // Only update loading state - don't update any Maps to avoid triggering cascading effects
        set({
          causeClassificationLoading: false,
          causeClassificationError: null
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
   * Update the set of feature IDs selected via brush in the UMAP scatter plot
   */
  setUmapBrushedFeatureIds: (featureIds: Set<number>) => {
    console.log('[Store.setUmapBrushedFeatureIds] Brush selection updated:', featureIds.size, 'features')
    set({ umapBrushedFeatureIds: featureIds })
  },

  /**
   * Clear UMAP projection state (including cached signature)
   */
  clearUmapProjection: () => {
    console.log('[Store.clearUmapProjection] Clearing UMAP projection state')
    set({
      umapProjection: null,
      umapFeatureSignature: null,
      umapLoading: false,
      umapError: null,
      umapBrushedFeatureIds: new Set<number>()
    })
  },

  // ============================================================================
  // MULTI-MODALITY TEST ACTION
  // ============================================================================

  /**
   * Fetch multi-modality test results for the current cause selections.
   * Tests bimodality of SVM decision margins for each category and aggregates scores.
   * Requires at least 2 different categories with manual tags.
   */
  fetchMultiModality: async (
    featureIds: number[],
    causeSelections: Record<number, string>
  ) => {
    console.log('[Store.fetchMultiModality] Starting multi-modality test:', {
      featureCount: featureIds.length,
      manualTagCount: Object.keys(causeSelections).length
    })

    // Validate minimum features
    if (featureIds.length < 3) {
      console.warn('[Store.fetchMultiModality] ⚠️ Multi-modality test requires at least 3 features')
      set({ causeMultiModalityLoading: false })
      return
    }

    // Validate that we have at least 2 different categories tagged
    const taggedCategories = new Set(Object.values(causeSelections))
    if (taggedCategories.size < 2) {
      console.warn('[Store.fetchMultiModality] ⚠️ Need at least 2 different categories tagged')
      set({ causeMultiModalityLoading: false })
      return
    }

    try {
      set({ causeMultiModalityLoading: true })

      const response = await api.getMultiModalityTest(featureIds, causeSelections)

      console.log('[Store.fetchMultiModality] ✅ Multi-modality test complete:', {
        aggregateScore: response.multimodality.aggregate_score,
        categoryCount: response.multimodality.category_results.length,
        sampleSize: response.multimodality.sample_size
      })

      set({
        causeMultiModality: response.multimodality,
        causeMultiModalityLoading: false
      })
    } catch (error) {
      console.error('[Store.fetchMultiModality] ❌ Failed to fetch multi-modality test:', error)
      set({
        causeMultiModality: null,
        causeMultiModalityLoading: false
      })
    }
  },

})
