import * as api from '../api'

// ============================================================================
// FEATURE SPLITTING STAGE ACTIONS (pairs)
// ============================================================================

/**
 * Factory function to create feature splitting (pair) actions for the store
 */
export const createFeatureSplittingActions = (set: any, get: any) => ({
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
   * Fetch cluster groups for pair viewer
   * Uses hierarchical clustering to select n clusters (each with 2+ features)
   * @param n - Number of clusters to fetch (default 10)
   * @param filterFeatureIds - Optional set of feature IDs to sample from (if not provided, uses all tableData features)
   */
  fetchDistributedPairs: async (n: number = 10, filterFeatureIds?: Set<number>) => {
    const { tableData, leftPanel } = get()

    console.log('[Store.fetchDistributedPairs] Starting cluster fetch:', { n, hasFilter: !!filterFeatureIds, filterSize: filterFeatureIds?.size })

    if (!tableData?.features) {
      console.warn('[Store.fetchDistributedPairs] ⚠️  No table data available')
      return
    }

    try {
      set({ isLoadingDistributedPairs: true })

      // Extract feature IDs - either from filter or all table data
      let featureIds: number[]
      if (filterFeatureIds && filterFeatureIds.size > 0) {
        featureIds = Array.from(filterFeatureIds)
      } else {
        featureIds = tableData.features.map((row: any) => row.feature_id)
      }

      // Get stage 1 threshold from Sankey structure
      // The threshold is already a similarity value (higher = more similar), use it directly
      // Default to 0.5 if no Sankey structure exists yet
      let threshold = 0.5
      if (leftPanel?.sankeyStructure) {
        const stage1Segment = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === 'stage1_segment')
        if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
          threshold = stage1Segment.threshold
        }
      }

      console.log('[Store.fetchDistributedPairs] Calling API:', {
        totalFeatures: featureIds.length,
        requestedClusters: n,
        threshold: threshold,
        source: leftPanel?.sankeyStructure ? 'stage1_segment' : 'default'
      })

      // Call API to get cluster groups using hierarchical clustering
      const response = await api.getClusterCandidates(featureIds, n, threshold)

      console.log('[Store.fetchDistributedPairs] API response:', {
        clusterCount: response.cluster_groups.length,
        totalClusters: response.total_clusters,
        thresholdUsed: response.threshold_used
      })

      set({
        clusterGroups: response.cluster_groups,
        featureToClusterMap: response.feature_to_cluster,
        totalClusters: response.total_clusters,
        isLoadingDistributedPairs: false
      })

      console.log('[Store.fetchDistributedPairs] ✅ Cluster groups loaded successfully')

    } catch (error) {
      console.error('[Store.fetchDistributedPairs] ❌ Failed to fetch cluster groups:', error)
      set({
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
    const { pairSelectionStates, tableData } = get()
    console.log('[fetchSimilarityHistogram] Called with features:', selectedFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5)

    try {
      // Extract selected and rejected pair keys
      const selectedPairKeys: string[] = []
      const rejectedPairKeys: string[] = []
      let allPairKeys: string[] = []

      pairSelectionStates.forEach((state: string | null, pairKey: string) => {
        if (state === 'selected') selectedPairKeys.push(pairKey)
        else if (state === 'rejected') rejectedPairKeys.push(pairKey)
      })

      // SEGMENT-SPECIFIC MODE: Fetch ALL cluster-based pairs for selected features
      if (selectedFeatureIds && selectedFeatureIds.size > 0) {
        const clusterThreshold = threshold ?? 0.5
        console.log(`[Store.fetchSimilarityHistogram] Fetching ALL cluster pairs for ${selectedFeatureIds.size} features at threshold ${clusterThreshold}`)
        const featureArray = Array.from(selectedFeatureIds)
        allPairKeys = await api.getSegmentClusterPairs(featureArray, clusterThreshold)
        console.log(`[Store.fetchSimilarityHistogram] Got ${allPairKeys.length} cluster-based pairs from segment`)
      } else {
        // GLOBAL MODE (FALLBACK): Get all pair keys from current table view
        // This would need to be passed from the component or computed from tableData
        // For now, use the pairs that have been displayed
        pairSelectionStates.forEach((_: string | null, pairKey: string) => {
          allPairKeys.push(pairKey)
        })

        // Also add pairs that exist in table but not yet selected
        if (tableData && tableData.features) {
          tableData.features.forEach((feature: any) => {
            if (feature.decoder_similarity && Array.isArray(feature.decoder_similarity)) {
              feature.decoder_similarity.slice(0, 4).forEach((similarItem: any) => {
                const pairKey = `${feature.feature_id}-${similarItem.feature_id}`
                if (!allPairKeys.includes(pairKey)) {
                  allPairKeys.push(pairKey)
                }
              })
            }
          })
        }
        console.log('[Store.fetchSimilarityHistogram] Using global pairs (fallback):', allPairKeys.length)
      }

      console.log('[Store.fetchSimilarityHistogram] Fetching pair histogram:', {
        selected: selectedPairKeys.length,
        rejected: rejectedPairKeys.length,
        total: allPairKeys.length
      })

      // Need at least 1 selected and 1 rejected for meaningful histogram
      if (selectedPairKeys.length === 0 || rejectedPairKeys.length === 0) {
        console.warn('[Store.fetchSimilarityHistogram] Need at least 1 selected and 1 rejected pair')
        return null
      }

      // Fetch histogram data
      const histogramData = await api.getPairSimilarityScoreHistogram(
        selectedPairKeys,
        rejectedPairKeys,
        allPairKeys
      )

      // Calculate dynamic thresholds based on data range
      const { statistics } = histogramData
      const maxAbsValue = Math.max(
        Math.abs(statistics.min || 0),
        Math.abs(statistics.max || 0)
      )
      const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
      const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

      // Always update/create tagAutomaticState for real-time preview in SelectionPanel
      const currentState = get().tagAutomaticState
      if (currentState) {
        // Update existing state - preserve thresholds if user has already modified them
        set({
          tagAutomaticState: {
            ...currentState,
            histogramData
            // Don't overwrite selectThreshold/rejectThreshold - user may have dragged them
          }
        })
      } else {
        // Create minimal state if doesn't exist (for TagAutomaticPanel → SelectionPanel communication)
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

      return {
        histogramData,
        selectThreshold,
        rejectThreshold
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
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          // Blue zone: auto-select
          newPairSelectionStates.set(pairKey, 'selected')
          newPairSelectionSources.set(pairKey, 'auto')
          selectedCount++
        } else if (score <= rejectThreshold) {
          // Light red zone: auto-reject
          newPairSelectionStates.set(pairKey, 'rejected')
          newPairSelectionSources.set(pairKey, 'auto')
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
