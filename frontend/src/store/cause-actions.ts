import * as api from '../api'
import { updateStage3Threshold } from '../lib/sankey-builder'
import { PANEL_LEFT } from '../lib/constants'

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
      const state = get()
      const newStates = new Map(state.causeSelectionStates)
      const newSources = new Map(state.causeSelectionSources)

      // Set of manually tagged feature IDs (from the request)
      const manualFeatureIds = new Set(Object.keys(causeSelections).map(Number))

      response.results.forEach((result) => {
        // Only update non-manually-tagged features
        if (!manualFeatureIds.has(result.feature_id)) {
          newStates.set(result.feature_id, result.predicted_category as 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained')
          newSources.set(result.feature_id, 'auto')
        }
      })

      console.log('[Store.fetchCauseClassification] Updated selection states:', {
        manualCount: manualFeatureIds.size,
        autoCount: newStates.size - manualFeatureIds.size,
        totalStates: newStates.size
      })

      set({
        causeCategoryDecisionMargins: categoryDecisionMargins,
        causeSelectionStates: newStates,
        causeSelectionSources: newSources,
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

  // ============================================================================
  // STAGE 3 QUALITY SCORES ACTIONS (Using Stage 2 SVM)
  // ============================================================================

  /**
   * Fetch Stage 3 quality scores using Stage 2's SVM model.
   *
   * The SVM is trained on Stage 2's ABOVE-threshold features ("Well-Explained Candidates")
   * that were manually reviewed and tagged as Well-Explained or Need Revision.
   *
   * The SVM then classifies Stage 2's BELOW-threshold features ("Need Revision" segment)
   * which were NOT manually reviewed - these are the features in the need_revision node.
   *
   * This is called when transitioning from Stage 2 to Stage 3.
   *
   * SKIP MODE (Stage 2 → Stage 3 without tagging):
   * When skipping Stage 2 tagging (no stage2FinalCommit), we simulate training data by
   * randomly sampling from above-threshold features and splitting them 50/50:
   * - Half → "selected" (Well-Explained training class)
   * - Half → "rejected" (Need Revision training class)
   *
   * Classification uses below-threshold features (need_revision) - same as normal flow.
   * This ensures no overlap between training and classification data.
   */
  fetchStage3QualityScores: async () => {
    const state = get()
    const { stage2FinalCommit, leftPanel } = state
    const { sankeyStructure } = leftPanel

    console.log('[Store.fetchStage3QualityScores] 🔍 DEBUG: Function called')
    console.log('[Store.fetchStage3QualityScores] 🔍 DEBUG: stage2FinalCommit:', stage2FinalCommit ? {
      hasStates: stage2FinalCommit.featureSelectionStates?.size > 0,
      statesSize: stage2FinalCommit.featureSelectionStates?.size,
      featureIdsSize: stage2FinalCommit.featureIds?.size
    } : 'NULL')

    if (!sankeyStructure) {
      console.warn('[Store.fetchStage3QualityScores] No Sankey structure available')
      return
    }

    console.log('[Store.fetchStage3QualityScores] 🔍 DEBUG: sankeyStructure:', {
      currentStage: sankeyStructure.currentStage,
      nodeCount: sankeyStructure.nodes.length,
      nodeIds: sankeyStructure.nodes.map(n => n.id)
    })

    // Get nodes for Stage 3
    const needRevisionNode = sankeyStructure.nodes.find(n => n.id === 'need_revision')
    const wellExplainedNode = sankeyStructure.nodes.find(n => n.id === 'well_explained_terminal')

    console.log('[Store.fetchStage3QualityScores] 🔍 DEBUG: Found nodes:', {
      needRevisionNode: needRevisionNode ? {
        id: needRevisionNode.id,
        featureCount: needRevisionNode.featureCount,
        hasFeatureIds: !!needRevisionNode.featureIds,
        featureIdsSize: needRevisionNode.featureIds?.size
      } : 'NOT FOUND',
      wellExplainedNode: wellExplainedNode ? {
        id: wellExplainedNode.id,
        featureCount: wellExplainedNode.featureCount,
        hasFeatureIds: !!wellExplainedNode.featureIds,
        featureIdsSize: wellExplainedNode.featureIds?.size
      } : 'NOT FOUND'
    })

    if (!needRevisionNode || !needRevisionNode.featureIds) {
      console.warn('[Store.fetchStage3QualityScores] need_revision node not found in structure')
      return
    }

    // Determine training data and classification features based on whether Stage 2 was completed manually
    let wellExplainedIds: number[] = []
    let needRevisionTrainingIds: number[] = []
    let classificationFeatureIds: number[] = []

    // Check if stage2FinalCommit has actual tagged features (not just exists)
    const hasTaggedFeatures = stage2FinalCommit &&
      stage2FinalCommit.featureSelectionStates &&
      stage2FinalCommit.featureSelectionStates.size > 0

    if (hasTaggedFeatures) {
      // NORMAL FLOW: Use manual tags from Stage 2
      // Training data comes from features that were manually reviewed in Stage 2
      const { featureSelectionStates } = stage2FinalCommit!

      featureSelectionStates.forEach((selectionState, featureId) => {
        // Use all labeled features (both manual and auto) for SVM training
        // because the user has already approved these via threshold application
        if (selectionState === 'selected') {
          wellExplainedIds.push(featureId)
        } else if (selectionState === 'rejected') {
          needRevisionTrainingIds.push(featureId)
        }
      })

      // In normal flow, classify only the need_revision features (below-threshold)
      // These are the features that weren't manually reviewed in Stage 2
      classificationFeatureIds = Array.from(needRevisionNode.featureIds)
    } else {
      // SKIP-TO-STAGE-3 DEVELOPMENT SHORTCUT (Stage 2 → Stage 3 without tagging):
      // No manual Stage 2 tagging was done. Simulate training data by randomly
      // sampling from above-threshold features (well_explained_terminal) and
      // splitting them into "selected" and "rejected" for SVM training.
      //
      // This mimics the normal flow where users review above-threshold features
      // and tag some as Well-Explained (selected) and some as Need Revision (rejected).
      //
      // Classification: Use below-threshold features (need_revision) - same as normal flow.

      if (!wellExplainedNode || !wellExplainedNode.featureIds || wellExplainedNode.featureIds.size === 0) {
        console.warn('[Store.fetchStage3QualityScores] No above-threshold features for training')
        return
      }

      // Get all above-threshold features and shuffle them
      const aboveThresholdFeatures = Array.from(wellExplainedNode.featureIds)

      // Fisher-Yates shuffle for random sampling
      for (let i = aboveThresholdFeatures.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[aboveThresholdFeatures[i], aboveThresholdFeatures[j]] =
          [aboveThresholdFeatures[j], aboveThresholdFeatures[i]]
      }

      // Split 50/50 into selected (Well-Explained) and rejected (Need Revision)
      const splitIndex = Math.floor(aboveThresholdFeatures.length / 2)
      wellExplainedIds = aboveThresholdFeatures.slice(0, splitIndex)
      needRevisionTrainingIds = aboveThresholdFeatures.slice(splitIndex)

      // Ensure we have at least 1 feature in each class
      if (wellExplainedIds.length === 0 || needRevisionTrainingIds.length === 0) {
        console.warn('[Store.fetchStage3QualityScores] Not enough above-threshold features for training split')
        return
      }

      // Classification: use below-threshold features (same as normal flow)
      classificationFeatureIds = Array.from(needRevisionNode.featureIds)
    }

    // Validate: need at least some examples of each class for training
    if (wellExplainedIds.length === 0 || needRevisionTrainingIds.length === 0) {
      console.warn('[Store.fetchStage3QualityScores] Need both Well-Explained and Need Revision in training data')
      return
    }

    // Validate: need features to classify
    if (classificationFeatureIds.length === 0) {
      console.warn('[Store.fetchStage3QualityScores] No features to classify (need_revision node is empty)')
      return
    }

    try {
      set({ isStage3QualityScoresLoading: true })

      // Train SVM on above-threshold features, classify below-threshold features
      const response = await api.getStage3QualityScores(
        wellExplainedIds,           // Training: Well-Explained class
        needRevisionTrainingIds,    // Training: Need Revision class
        classificationFeatureIds    // Classification input: below-threshold features
      )

      // Convert scores to Map
      const scoresMap = new Map<number, number>()
      Object.entries(response.scores).forEach(([idStr, score]) => {
        scoresMap.set(parseInt(idStr, 10), score)
      })

      // Default threshold: use 0.0 (decision boundary)
      const defaultThreshold = 0.0

      set({
        stage3QualityScores: scoresMap,
        stage3QualityHistogram: response,
        stage3QualityThreshold: defaultThreshold,
        isStage3QualityScoresLoading: false
      })

      // Also store histogram in standard HistogramData format for SankeyOverlay
      // This allows the overlay to render histogram and threshold handles on need_revision node
      const histogramData = {
        metric: 'decision_margin',
        histogram: response.histogram,
        statistics: {
          ...response.statistics,
          std: 0  // Not provided by SimilarityScoreHistogramResponse
        },
        total_features: response.total_items
      }
      state.setHistogramData({ 'decision_margin': histogramData }, PANEL_LEFT, 'stage3_segment')

      console.log('[Store.fetchStage3QualityScores] ✅ Quality scores cached:', {
        scoresMapSize: scoresMap.size,
        defaultThreshold,
        range: `${response.statistics.min.toFixed(2)} to ${response.statistics.max.toFixed(2)}`
      })

      // Now apply the default threshold to divide the segments
      // This is safe because getSelectedNodeFeatures returns ALL need_revision features
      // for Stage 3, regardless of which segment is selected (preventing infinite loops)
      get().updateStage3QualityThreshold(defaultThreshold)

    } catch (error) {
      console.error('[Store.fetchStage3QualityScores] ❌ Failed:', error)
      set({ isStage3QualityScoresLoading: false })
    }
  },

  /**
   * Update Stage 3 quality threshold and rebuild segments.
   *
   * This is called when the user drags the threshold handle on the Stage 3 histogram.
   */
  updateStage3QualityThreshold: (newThreshold: number) => {
    const state = get()
    const { stage3QualityScores, leftPanel } = state
    const { sankeyStructure } = leftPanel

    if (!sankeyStructure || !stage3QualityScores) {
      console.warn('[Store.updateStage3QualityThreshold] Missing data for threshold update')
      return
    }

    console.log('[Store.updateStage3QualityThreshold] Updating threshold:', {
      oldThreshold: state.stage3QualityThreshold,
      newThreshold
    })

    // Update threshold in state
    set({ stage3QualityThreshold: newThreshold })

    // Rebuild Stage 3 structure with new threshold
    const updatedStructure = updateStage3Threshold(
      sankeyStructure,
      stage3QualityScores,
      newThreshold
    )

    // Update store with new structure
    set({
      leftPanel: {
        ...state.leftPanel,
        sankeyStructure: updatedStructure
      }
    })

    // Recompute D3 layout
    get().recomputeD3StructureV2(PANEL_LEFT)

    console.log('[Store.updateStage3QualityThreshold] ✅ Structure updated')
  },
})
