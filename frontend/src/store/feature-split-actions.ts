import * as api from '../api'

// ============================================================================
// FEATURE SPLIT ACTIONS (Stage 1 - Pairs)
// ============================================================================

/**
 * Factory function to create Feature Split actions for the store
 * Stage 1: Pair-based selection and similarity sorting
 */
export const createFeatureSplitActions = (set: any, get: any) => ({
  // ============================================================================
  // FEATURE SPLITTING COUNTS GETTER
  // ============================================================================

  /**
   * Get feature counts derived from pair selection states
   * Returns: { fragmented, monosemantic, unsure, total }
   * Used by TagStagePanel and SelectionPanel for consistent counts
   */
  getFeatureSplittingCounts: () => {
    const state = get()
    const { pairSelectionStates, pairSelectionSources, allClusterPairs } = state
    const filteredFeatureIds = state.getSelectedNodeFeatures()

    if (!filteredFeatureIds || filteredFeatureIds.size === 0 || !allClusterPairs) {
      return { fragmented: 0, monosemantic: 0, unsure: 0, total: 0, fragmentedManual: 0, fragmentedAuto: 0, monosematicManual: 0, monosematicAuto: 0 }
    }

    // Track features by state (with source for manual/auto distinction)
    const fragmentedFeatures = new Map<number, 'manual' | 'auto'>()
    const monosematicFeatures = new Map<number, 'manual' | 'auto'>()
    // Track features that have at least one pair (both endpoints in filtered set)
    const featuresWithPairs = new Set<number>()

    for (const pair of allClusterPairs) {
      if (!filteredFeatureIds.has(pair.main_id) || !filteredFeatureIds.has(pair.similar_id)) continue

      // Mark both features as having pairs
      featuresWithPairs.add(pair.main_id)
      featuresWithPairs.add(pair.similar_id)

      const pairState = pairSelectionStates.get(pair.pair_key)
      const pairSource = pairSelectionSources.get(pair.pair_key) || 'manual'

      if (pairState === 'selected') {
        // Update with priority: manual > auto
        for (const id of [pair.main_id, pair.similar_id]) {
          const existing = fragmentedFeatures.get(id)
          if (!existing || (existing === 'auto' && pairSource === 'manual')) {
            fragmentedFeatures.set(id, pairSource)
          }
        }
      } else if (pairState === 'rejected') {
        for (const id of [pair.main_id, pair.similar_id]) {
          const existing = monosematicFeatures.get(id)
          if (!existing || (existing === 'auto' && pairSource === 'manual')) {
            monosematicFeatures.set(id, pairSource)
          }
        }
      }
    }

    // Count with priority: fragmented > monosemantic > unsure
    // Features with NO pairs are treated as monosemantic (no similar features = not fragmented)
    let fragmented = 0, monosemantic = 0, unsure = 0
    let fragmentedManual = 0, fragmentedAuto = 0, monosematicManual = 0, monosematicAuto = 0

    for (const featureId of filteredFeatureIds) {
      if (fragmentedFeatures.has(featureId)) {
        fragmented++
        if (fragmentedFeatures.get(featureId) === 'manual') fragmentedManual++
        else fragmentedAuto++
      } else if (monosematicFeatures.has(featureId)) {
        monosemantic++
        if (monosematicFeatures.get(featureId) === 'manual') monosematicManual++
        else monosematicAuto++
      } else if (!featuresWithPairs.has(featureId)) {
        // Feature has no pairs in the filtered set - treat as monosemantic (auto)
        monosemantic++
        monosematicAuto++
      } else {
        unsure++
      }
    }

    return {
      fragmented,
      monosemantic,
      unsure,
      total: filteredFeatureIds.size,
      fragmentedManual,
      fragmentedAuto,
      monosematicManual,
      monosematicAuto
    }
  },
  // ============================================================================
  // PAIR SIMILARITY SORT ACTION
  // ============================================================================

  sortPairsBySimilarity: async (allPairKeys: string[]) => {
    const state = get()
    const { pairSelectionStates, pairSelectionSources } = state

    console.log('[Store.sortPairsBySimilarity] Starting pair similarity sort:', {
      selectionStatesSize: pairSelectionStates.size,
      allPairKeysCount: allPairKeys.length
    })

    // Validate: need at least 1 selected or rejected pair
    if (pairSelectionStates.size < 1) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  No pairs selected for similarity sort')
      return
    }

    if (!allPairKeys || allPairKeys.length === 0) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  No pair keys available')
      return
    }

    // Extract selected and rejected pair keys (ONLY manually labeled pairs)
    const selectedPairKeys: string[] = []
    const rejectedPairKeys: string[] = []

    pairSelectionStates.forEach((selectionState: string, pairKey: string) => {
      const source = pairSelectionSources.get(pairKey)
      // Only use manually labeled pairs for similarity sorting
      if (source === 'manual') {
        if (selectionState === 'selected') {
          selectedPairKeys.push(pairKey)
        } else if (selectionState === 'rejected') {
          rejectedPairKeys.push(pairKey)
        }
      }
    })

    console.log('[Store.sortPairsBySimilarity] Selection counts (manual only):', {
      selected: selectedPairKeys.length,
      rejected: rejectedPairKeys.length
    })

    // Need at least one of each for meaningful sort
    if (selectedPairKeys.length === 0 && rejectedPairKeys.length === 0) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  Need at least one selected or rejected pair')
      return
    }

    console.log('[Store.sortPairsBySimilarity] Total pairs:', allPairKeys.length)

    try {
      set({ isPairSimilaritySortLoading: true })

      console.log('[Store.sortPairsBySimilarity] Calling API:', {
        selectedPairKeys: selectedPairKeys.length,
        rejectedPairKeys: rejectedPairKeys.length,
        totalPairs: allPairKeys.length
      })

      // Call API
      const response = await api.getPairSimilaritySort(
        selectedPairKeys,
        rejectedPairKeys,
        allPairKeys
      )

      console.log('[Store.sortPairsBySimilarity] API response:', {
        sortedPairsCount: response.sorted_pairs.length,
        totalPairs: response.total_pairs,
        weightsCount: response.weights_used.length
      })

      // Convert to Map for easy lookup
      const scoresMap = new Map<string, number>()
      response.sorted_pairs.forEach((ps) => {
        scoresMap.set(ps.pair_key, ps.score)
      })

      // Debug: Log sample of stored keys
      const sampleKeys = Array.from(scoresMap.keys()).slice(0, 5)
      console.log('[Store.sortPairsBySimilarity] Sample stored keys:', sampleKeys)

      // Generate selection signature to track this sort state
      // Format: "selected:[keys]|rejected:[keys]"
      const selectedSig = selectedPairKeys.sort().join(',')
      const rejectedSig = rejectedPairKeys.sort().join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(pairSelectionStates)

      // Store scores and set sort mode
      set({
        pairSimilarityScores: scoresMap,
        tableSortBy: 'pair_similarity',
        tableSortDirection: 'desc',
        isPairSimilaritySortLoading: false,
        lastPairSortedSelectionSignature: selectionSignature,
        pairSortedBySelectionStates: frozenSelectionStates
      })

      console.log('[Store.sortPairsBySimilarity] ✅ Pair similarity sort complete:', {
        scoresMapSize: scoresMap.size,
        sortBy: 'pair_similarity',
        selectionSignature
      })

    } catch (error) {
      console.error('[Store.sortPairsBySimilarity] ❌ Failed to calculate pair similarity sort:', error)
      set({ isPairSimilaritySortLoading: false })
    }
  },

  // ============================================================================
  // DISTRIBUTED PAIR FETCHING
  // ============================================================================

  /**
   * Fetch ALL cluster-based pairs for selected features (Simplified Flow).
   *
   * No sampling - returns ALL pairs from ALL clusters.
   * Frontend handles display sampling via random selection.
   *
   * @param featureIds - Feature IDs to cluster (from Sankey segment)
   * @param threshold - Clustering threshold (from Sankey)
   */
  fetchAllClusterPairs: async (featureIds: number[], threshold: number) => {
    if (featureIds.length === 0) {
      console.warn('[Store.fetchAllClusterPairs] No features provided')
      return
    }

    try {
      set({ isLoadingDistributedPairs: true })

      console.log('[Store.fetchAllClusterPairs] Fetching ALL pairs (simplified flow):', {
        featureCount: featureIds.length,
        threshold: threshold
      })

      // Call simplified API - returns ALL pairs (no backend sampling)
      const response = await api.getAllClusterPairs(featureIds, threshold)

      console.log('[Store.fetchAllClusterPairs] ✅ Received ALL pairs:', {
        totalPairs: response.total_pairs,
        totalClusters: response.total_clusters,
        thresholdUsed: response.threshold_used
      })

      // Store ALL pair data - frontend will sample for display
      set({
        allClusterPairs: response.pairs,              // NEW: All pair objects
        clusterGroups: response.clusters.map(c => ({  // Convert to old format for compatibility
          cluster_id: c.cluster_id,
          feature_ids: c.feature_ids
        })),
        featureToClusterMap: response.feature_to_cluster,
        totalClusters: response.total_clusters,
        isLoadingDistributedPairs: false
      })

    } catch (error) {
      console.error('[Store.fetchAllClusterPairs] ❌ Failed to fetch pairs:', error)
      set({
        allClusterPairs: null,
        clusterGroups: null,
        isLoadingDistributedPairs: false
      })
    }
  },

  /**
   * Clear cluster groups
   */
  clearDistributedPairs: () => {
    set({ clusterGroups: null })
    console.log('[Store.clearDistributedPairs] Cluster groups cleared')
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (pair mode)
  // ============================================================================

  /**
   * Fetch similarity histogram data for pairs
   * This can be called independently without showing the popover
   *
   * @param selectedFeatureIds - Optional set of feature IDs from selected segment (e.g., from Sankey selection)
   *                            If provided, fetches ALL cluster-based pairs for these features.
   *                            If not provided, falls back to all pairs from tableData (global view).
   * @param threshold - Optional clustering threshold (0-1). If provided, uses this for hierarchical clustering.
   *                   If not provided, defaults to 0.5. Should match Sankey segment threshold.
   */
  fetchSimilarityHistogram: async (selectedFeatureIds?: Set<number>, threshold?: number) => {
    const { pairSelectionStates } = get()
    console.log('[fetchSimilarityHistogram] Called with features:', selectedFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5)

    try {
      // Extract selected and rejected pair keys
      const selectedPairKeys: string[] = []
      const rejectedPairKeys: string[] = []

      pairSelectionStates.forEach((state: string | null, pairKey: string) => {
        if (state === 'selected') selectedPairKeys.push(pairKey)
        else if (state === 'rejected') rejectedPairKeys.push(pairKey)
      })

      // SIMPLIFIED FLOW: Use feature_ids + threshold (backend generates pairs via clustering)
      if (selectedFeatureIds && selectedFeatureIds.size > 0 && threshold !== undefined) {
        console.log(`[Store.fetchSimilarityHistogram] [SIMPLIFIED FLOW] Using feature_ids + threshold:`, {
          featureCount: selectedFeatureIds.size,
          threshold: threshold
        })

        // Need at least 1 selected and 1 rejected for meaningful histogram
        if (selectedPairKeys.length === 0 || rejectedPairKeys.length === 0) {
          console.warn('[Store.fetchSimilarityHistogram] Need at least 1 selected and 1 rejected pair')
          return null
        }

        // Call simplified API - backend generates pairs via clustering
        const histogramData = await api.getPairSimilarityScoreHistogram(
          selectedPairKeys,
          rejectedPairKeys,
          { featureIds: Array.from(selectedFeatureIds), threshold: threshold }  // Simplified flow
        )

        // Get current state to preserve user-adjusted thresholds
        const currentState = get().tagAutomaticState

        // Calculate dynamic thresholds ONLY if no existing thresholds
        // This preserves user-adjusted thresholds when refetching histogram
        const { statistics } = histogramData
        const maxAbsValue = Math.max(
          Math.abs(statistics.min || 0),
          Math.abs(statistics.max || 0)
        )
        const defaultSelectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
        const defaultRejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

        // Preserve existing thresholds if they exist, otherwise use calculated defaults
        const selectThreshold = currentState?.selectThreshold ?? defaultSelectThreshold
        const rejectThreshold = currentState?.rejectThreshold ?? defaultRejectThreshold

        // Always update/create tagAutomaticState, preserving user thresholds
        if (currentState) {
          set({
            tagAutomaticState: {
              ...currentState,
              histogramData
              // Note: NOT overwriting selectThreshold/rejectThreshold - they're preserved from currentState
            }
          })
        } else {
          set({
            tagAutomaticState: {
              visible: false,
              minimized: false,
              mode: 'pair',
              position: { x: 0, y: 0 },
              histogramData,
              selectThreshold,
              rejectThreshold,
              tagLabel: 'Fragmented',
              isLoading: false
            }
          })
        }

        return { histogramData, selectThreshold, rejectThreshold }

      } else {
        // LEGACY FALLBACK: Explicit pair keys (should not be used in simplified flow)
        console.warn('[Store.fetchSimilarityHistogram] [LEGACY FALLBACK] No feature_ids/threshold provided, cannot generate histogram')
        return null
      }

    } catch (error) {
      console.error('[Store.fetchSimilarityHistogram] ❌ Failed to fetch histogram:', error)
      return null
    }
  },

  showTagAutomaticPopover: async (
    mode: 'feature' | 'pair' | 'cause',
    position: { x: number; y: number },
    tagLabel: string,
    selectedFeatureIds?: Set<number>,  // Optional: segment-specific feature IDs from FeatureSplitView
    threshold?: number  // Optional: clustering threshold from Sankey segment
  ) => {
    // Only handle pair mode in this file
    if (mode !== 'pair') {
      console.warn('[FeatureSplitting.showTagAutomaticPopover] Wrong mode:', mode)
      return
    }

    console.log('[FeatureSplitting.showTagAutomaticPopover] Received features:', selectedFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5, ', mode:', mode, ', tagLabel:', tagLabel)

    try {
      // Set loading state
      set({
        tagAutomaticState: {
          visible: true,
          minimized: false,
          mode,
          position,
          histogramData: null,
          selectThreshold: 0.1,
          rejectThreshold: -0.1,
          tagLabel,
          isLoading: true
        }
      })

      // Fetch histogram data using the extracted function
      // Pass segment-specific feature IDs if provided (from FeatureSplitView)
      // This will fetch ALL cluster-based pairs for those features
      // Also pass threshold to ensure clustering matches Sankey segment threshold
      const result = await get().fetchSimilarityHistogram(selectedFeatureIds, threshold)

      if (!result) {
        console.warn('[Store.showTagAutomaticPopover] No histogram data available')
        set({ tagAutomaticState: null })
        return
      }

      const { histogramData, selectThreshold, rejectThreshold } = result

      // Update state with histogram data
      set({
        tagAutomaticState: {
          visible: true,
          minimized: false,
          mode,
          position,
          histogramData,
          selectThreshold,
          rejectThreshold,
          tagLabel,
          isLoading: false
        }
      })

    } catch (error) {
      console.error('[Store.showTagAutomaticPopover] ❌ Failed to fetch histogram:', error)
      set({ tagAutomaticState: null })
    }
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

    console.log('[FeatureSplitting.updateBothSimilarityThresholds] Updating thresholds:', { selectThreshold, rejectThreshold, hadState: !!tagAutomaticState })

    // If tagAutomaticState doesn't exist, create a minimal one
    if (!tagAutomaticState) {
      set({
        tagAutomaticState: {
          visible: false,
          minimized: false,
          mode: 'pair',
          position: { x: 0, y: 0 },
          histogramData: null,
          selectThreshold,
          rejectThreshold,
          tagLabel: 'Fragmented',
          isLoading: false
        }
      })
      return
    }

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        selectThreshold,
        rejectThreshold
      }
    })
  },

  applySimilarityTags: () => {
    const { tagAutomaticState, pairSelectionStates, pairSelectionSources } = get()

    if (!tagAutomaticState || !tagAutomaticState.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, selectThreshold, rejectThreshold, histogramData } = tagAutomaticState

    // Only handle pair mode in this file
    if (mode !== 'pair') {
      console.warn('[FeatureSplitting.applySimilarityTags] Wrong mode:', mode)
      return
    }

    const scores = histogramData.scores

    console.log(`[Store.applySimilarityTags] Applying ${mode} tags with thresholds:`, {
      select: selectThreshold,
      reject: rejectThreshold
    })

    // Apply tags to pairs (dual thresholds: auto-select and auto-reject)
    const newPairSelectionStates = new Map(pairSelectionStates)
    const newPairSelectionSources = new Map(pairSelectionSources)
    let selectedCount = 0
    let rejectedCount = 0
    let untaggedCount = 0

    Object.entries(scores).forEach(([pairKey, score]) => {
      // Skip if already manually tagged
      if (pairSelectionStates.has(pairKey)) {
        return
      }

      // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
      // Note: source is 'manual' because clicking "Apply Tags" means user has confirmed these tags
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          // Blue zone: auto-select (confirmed by user clicking Apply Tags)
          newPairSelectionStates.set(pairKey, 'selected')
          newPairSelectionSources.set(pairKey, 'manual')
          selectedCount++
        } else if (score <= rejectThreshold) {
          // Light red zone: auto-reject (confirmed by user clicking Apply Tags)
          newPairSelectionStates.set(pairKey, 'rejected')
          newPairSelectionSources.set(pairKey, 'manual')
          rejectedCount++
        } else {
          // Middle zone: leave untagged
          untaggedCount++
        }
      }
    })

    console.log('[Store.applySimilarityTags] Pair tags applied:', {
      selected: selectedCount,
      rejected: rejectedCount,
      untagged: untaggedCount,
      preserved: pairSelectionStates.size
    })

    set({
      pairSelectionStates: newPairSelectionStates,
      pairSelectionSources: newPairSelectionSources
    })

    // Preserve thresholds but clear histogram data (will be refetched with updated selections)
    // Don't set tagAutomaticState to null - we want to preserve the user-adjusted thresholds
    // The histogram will be refetched automatically when selection counts change
    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        histogramData: null  // Clear histogram to trigger refetch
      }
    })
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
    const { tagAutomaticState, tableData } = get()
    if (!tagAutomaticState) {
      console.warn('[Store.showThresholdsOnTable] No popover state available')
      return
    }

    const { mode, selectThreshold, rejectThreshold } = tagAutomaticState

    // Only handle pair mode in this file
    if (mode !== 'pair') {
      console.warn('[FeatureSplitting.showThresholdsOnTable] Wrong mode:', mode)
      return
    }

    console.log('[Store.showThresholdsOnTable] Showing thresholds on table:', {
      mode,
      selectThreshold,
      rejectThreshold
    })

    try {
      // Extract all pair keys from table data
      const allPairKeys: string[] = []
      if (tableData && tableData.features) {
        tableData.features.forEach((feature: any) => {
          if (feature.decoder_similarity && Array.isArray(feature.decoder_similarity)) {
            feature.decoder_similarity.slice(0, 4).forEach((similarItem: any) => {
              const mainId = feature.feature_id
              const similarId = similarItem.feature_id
              // Use canonical format (smaller ID first)
              const pairKey = mainId < similarId
                ? `${mainId}-${similarId}`
                : `${similarId}-${mainId}`
              if (!allPairKeys.includes(pairKey)) {
                allPairKeys.push(pairKey)
              }
            })
          }
        })
      }
      await get().sortPairsBySimilarity(allPairKeys)

      // Step 2: Calculate preview sets (which items would be auto-tagged)
      const { pairSelectionStates, pairSimilarityScores } = get()
      const previewAutoSelected = new Set<number | string>()
      const previewAutoRejected = new Set<number | string>()

      // Check each pair with a similarity score
      pairSimilarityScores.forEach((score: any, pairKey: any) => {
        const isAlreadyTagged = pairSelectionStates.has(pairKey)
        if (!isAlreadyTagged) {
          if (score >= selectThreshold) {
            previewAutoSelected.add(pairKey)
          } else if (score <= rejectThreshold) {
            previewAutoRejected.add(pairKey)
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

      console.log('[Store.showThresholdsOnTable] Thresholds displayed for pairs')

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
