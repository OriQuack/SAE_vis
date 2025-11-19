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
   * Fetch evenly distributed features for pair viewer
   * Uses K-Means clustering in 9D metric space to select n distributed features
   */
  fetchDistributedPairs: async (n: number = 30) => {
    const { tableData } = get()

    console.log('[Store.fetchDistributedPairs] Starting distributed pair fetch:', { n })

    if (!tableData?.rows) {
      console.warn('[Store.fetchDistributedPairs] ⚠️  No table data available')
      return
    }

    try {
      set({ isLoadingDistributedPairs: true })

      // Extract all feature IDs from table data
      const featureIds = tableData.rows.map((row: any) => row.feature_id)

      console.log('[Store.fetchDistributedPairs] Calling API:', {
        totalFeatures: featureIds.length,
        requestedN: n
      })

      // Call API to get distributed features
      const response = await api.getDistributedFeatures(featureIds, n)

      console.log('[Store.fetchDistributedPairs] API response:', {
        selectedCount: response.selected_features.length,
        totalAvailable: response.total_available,
        method: response.method_used
      })

      set({
        distributedPairFeatureIds: response.selected_features,
        isLoadingDistributedPairs: false
      })

      console.log('[Store.fetchDistributedPairs] ✅ Distributed pairs loaded successfully')

    } catch (error) {
      console.error('[Store.fetchDistributedPairs] ❌ Failed to fetch distributed features:', error)
      set({
        distributedPairFeatureIds: null,
        isLoadingDistributedPairs: false
      })
    }
  },

  /**
   * Clear distributed pairs
   */
  clearDistributedPairs: () => {
    set({ distributedPairFeatureIds: null })
    console.log('[Store.clearDistributedPairs] Distributed pairs cleared')
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (pair mode)
  // ============================================================================

  showSimilarityTaggingPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string) => {
    // Only handle pair mode in this file
    if (mode !== 'pair') {
      console.warn('[FeatureSplitting.showSimilarityTaggingPopover] Wrong mode:', mode)
      return
    }

    console.log(`[Store.showSimilarityTaggingPopover] Opening ${mode} tagging popover with label: ${tagLabel}`)

    const { pairSelectionStates, tableData } = get()

    try {
      // Set loading state
      set({
        similarityTaggingPopover: {
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

      // Extract selected and rejected pair keys
      const selectedPairKeys: string[] = []
      const rejectedPairKeys: string[] = []
      const allPairKeys: string[] = []

      pairSelectionStates.forEach((state: string | null, pairKey: string) => {
        if (state === 'selected') selectedPairKeys.push(pairKey)
        else if (state === 'rejected') rejectedPairKeys.push(pairKey)
      })

      // Get all pair keys from current table view
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

      console.log('[Store.showSimilarityTaggingPopover] Fetching pair histogram:', {
        selected: selectedPairKeys.length,
        rejected: rejectedPairKeys.length,
        total: allPairKeys.length
      })

      // Fetch histogram data
      const histogramData = await api.getPairSimilarityScoreHistogram(
        selectedPairKeys,
        rejectedPairKeys,
        allPairKeys
      )

      // Calculate dynamic thresholds based on data range
      // Use 1/2 of max value for initial select threshold (positive)
      // Use -1/2 of max value for initial reject threshold (negative)
      const { statistics } = histogramData
      const maxAbsValue = Math.max(
        Math.abs(statistics.min || 0),
        Math.abs(statistics.max || 0)
      )
      // Default to 0.2 if data has no range or invalid values
      const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
      const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

      // Update state with histogram data
      // Initialize with dual thresholds for auto-selecting and auto-rejecting
      set({
        similarityTaggingPopover: {
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
      console.error('[Store.showSimilarityTaggingPopover] ❌ Failed to fetch histogram:', error)
      set({ similarityTaggingPopover: null })
    }
  },

  hideSimilarityTaggingPopover: () => {
    console.log('[Store.hideSimilarityTaggingPopover] Closing tagging popover')
    set({ similarityTaggingPopover: null })
  },

  updateSimilarityThresholds: (selectThreshold: number) => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        selectThreshold
      }
    })
  },

  updateBothSimilarityThresholds: (selectThreshold: number, rejectThreshold: number) => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        selectThreshold,
        rejectThreshold
      }
    })
  },

  applySimilarityTags: () => {
    const { similarityTaggingPopover, pairSelectionStates, pairSelectionSources } = get()

    if (!similarityTaggingPopover || !similarityTaggingPopover.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, selectThreshold, rejectThreshold, histogramData } = similarityTaggingPopover

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
    set({ similarityTaggingPopover: null })
  },

  minimizeSimilarityTaggingPopover: () => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        minimized: true
      }
    })
    console.log('[Store.minimizeSimilarityTaggingPopover] Popover minimized')
  },

  restoreSimilarityTaggingPopover: () => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        minimized: false
      }
    })
    console.log('[Store.restoreSimilarityTaggingPopover] Popover restored')
  },

  /**
   * Show thresholds on table - sorts by similarity and shows threshold lines
   */
  showThresholdsOnTable: async () => {
    const { similarityTaggingPopover, tableData } = get()
    if (!similarityTaggingPopover) {
      console.warn('[Store.showThresholdsOnTable] No popover state available')
      return
    }

    const { mode, selectThreshold, rejectThreshold } = similarityTaggingPopover

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
