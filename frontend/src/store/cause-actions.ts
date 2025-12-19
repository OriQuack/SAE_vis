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
   */
  fetchUmapProjection: async (
    featureIds: number[],
    options?: { nNeighbors?: number; minDist?: number }
  ) => {
    console.log('[Store.fetchUmapProjection] Starting UMAP projection:', {
      featureCount: featureIds.length,
      options
    })

    // Validate minimum features (UMAP requires at least 3)
    if (featureIds.length < 3) {
      console.warn('[Store.fetchUmapProjection] ⚠️ UMAP requires at least 3 features')
      set({
        umapError: 'UMAP requires at least 3 features',
        umapLoading: false
      })
      return
    }

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
        umapLoading: false,
        umapError: null
      })
    } catch (error) {
      console.error('[Store.fetchUmapProjection] ❌ Failed to fetch UMAP projection:', error)
      set({
        umapError: error instanceof Error ? error.message : 'Failed to fetch UMAP projection',
        umapLoading: false
      })
    }
  },

  /**
   * Fetch SVM cause classification for features.
   * Uses mean metric vectors per feature for OvR SVM classification.
   * Requires at least one manually tagged feature per category.
   */
  fetchCauseClassification: async (
    featureIds: number[],
    causeSelections: Record<number, string>
  ) => {
    console.log('[Store.fetchCauseClassification] Starting classification:', {
      featureCount: featureIds.length,
      manualTagCount: Object.keys(causeSelections).length
    })

    // Validate that we have tags for all 3 categories
    const categories = ['noisy-activation', 'missed-N-gram', 'missed-context']
    const taggedCategories = new Set(Object.values(causeSelections))
    const missingCategories = categories.filter(c => !taggedCategories.has(c))

    if (missingCategories.length > 0) {
      console.warn('[Store.fetchCauseClassification] ⚠️ Missing tags for categories:', missingCategories)
      set({
        causeClassificationError: `Tag at least one feature per category. Missing: ${missingCategories.join(', ')}`,
        causeClassificationLoading: false
      })
      return
    }

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

      set({
        causeCategoryDecisionMargins: categoryDecisionMargins,
        causeClassificationLoading: false,
        causeClassificationError: null
      })
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
   * Clear UMAP projection state
   */
  clearUmapProjection: () => {
    console.log('[Store.clearUmapProjection] Clearing UMAP projection state')
    set({
      umapProjection: null,
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
