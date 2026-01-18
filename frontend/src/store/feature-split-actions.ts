import * as api from '../api'
import { FLIP_HISTORY_WINDOW_SIZE } from '../components/ConvergenceIndicator'
import { isUserConfirmed } from '../lib/tagging-hooks/useCommitHistory'

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

    // Track features by state (with source for user-confirmed/predicted distinction)
    const fragmentedFeatures = new Map<number, 'click' | 'threshold' | 'predicted'>()
    const monosematicFeatures = new Map<number, 'click' | 'threshold' | 'predicted'>()

    for (const pair of allClusterPairs) {
      if (!filteredFeatureIds.has(pair.main_id) || !filteredFeatureIds.has(pair.similar_id)) continue

      const pairState = pairSelectionStates.get(pair.pair_key)
      const pairSource = pairSelectionSources.get(pair.pair_key) || 'click'

      if (pairState === 'selected') {
        // Update with priority: user-confirmed > predicted
        for (const id of [pair.main_id, pair.similar_id]) {
          const existing = fragmentedFeatures.get(id)
          if (!existing || (!isUserConfirmed(existing) && isUserConfirmed(pairSource))) {
            fragmentedFeatures.set(id, pairSource)
          }
        }
      } else if (pairState === 'rejected') {
        for (const id of [pair.main_id, pair.similar_id]) {
          const existing = monosematicFeatures.get(id)
          if (!existing || (!isUserConfirmed(existing) && isUserConfirmed(pairSource))) {
            monosematicFeatures.set(id, pairSource)
          }
        }
      }
    }

    // Count with priority: fragmented > monosemantic > unsure
    let fragmented = 0, monosemantic = 0, unsure = 0
    let fragmentedManual = 0, fragmentedAuto = 0, monosematicManual = 0, monosematicAuto = 0

    for (const featureId of filteredFeatureIds) {
      if (fragmentedFeatures.has(featureId)) {
        fragmented++
        if (isUserConfirmed(fragmentedFeatures.get(featureId))) fragmentedManual++
        else fragmentedAuto++
      } else if (monosematicFeatures.has(featureId)) {
        monosemantic++
        if (isUserConfirmed(monosematicFeatures.get(featureId))) monosematicManual++
        else monosematicAuto++
      } else {
        // Feature has no pairs OR untagged pairs - treat as unsure
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

    // Extract selected and rejected pair items with sources (ONLY manually labeled pairs)
    const selectedItems: { key: string; source: 'click' | 'threshold' }[] = []
    const rejectedItems: { key: string; source: 'click' | 'threshold' }[] = []

    pairSelectionStates.forEach((selectionState: string, pairKey: string) => {
      const source = pairSelectionSources.get(pairKey)
      // Only use user-confirmed pairs (click or threshold) for similarity sorting
      if (isUserConfirmed(source)) {
        const weightedSource = source === 'click' ? 'click' : 'threshold' as const
        if (selectionState === 'selected') {
          selectedItems.push({ key: pairKey, source: weightedSource })
        } else if (selectionState === 'rejected') {
          rejectedItems.push({ key: pairKey, source: weightedSource })
        }
      }
    })

    console.log('[Store.sortPairsBySimilarity] Selection counts (manual only):', {
      selected: selectedItems.length,
      rejected: rejectedItems.length
    })

    // Need at least one of each for meaningful sort
    if (selectedItems.length === 0 && rejectedItems.length === 0) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  Need at least one selected or rejected pair')
      return
    }

    console.log('[Store.sortPairsBySimilarity] Total pairs:', allPairKeys.length)

    try {
      set({ isPairSimilaritySortLoading: true })

      console.log('[Store.sortPairsBySimilarity] Calling API:', {
        selectedItems: selectedItems.length,
        rejectedItems: rejectedItems.length,
        totalPairs: allPairKeys.length
      })

      // Call API
      const response = await api.getPairSimilaritySort(
        selectedItems,
        rejectedItems,
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
      const selectedSig = selectedItems.map(i => i.key).sort().join(',')
      const rejectedSig = rejectedItems.map(i => i.key).sort().join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(pairSelectionStates)

      // Store scores and set sort mode
      set({
        pairSimilarityScores: scoresMap,
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
    const { pairSelectionStates, pairSelectionSources, allClusterPairs, pendingBatchOperation } = get()
    console.log('[fetchSimilarityHistogram] Called with features:', selectedFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5, ', availablePairs:', allClusterPairs?.length || 0)

    try {
      // Extract selected and rejected pair items with sources
      // IMPORTANT: Only include pairs that exist in allClusterPairs to avoid using stale
      // selection data from previous sessions with different clustering thresholds
      const selectedItems: { key: string; source: 'click' | 'threshold' }[] = []
      const rejectedItems: { key: string; source: 'click' | 'threshold' }[] = []

      // Create a set of available pair keys for efficient lookup
      // Note: allClusterPairs uses snake_case from API (pair_key), not camelCase
      const availablePairKeys = allClusterPairs
        ? new Set(allClusterPairs.map((p: { pair_key: string }) => p.pair_key))
        : null

      pairSelectionStates.forEach((state: string | null, pairKey: string) => {
        // Only include pairs that exist in the current cluster pairs list
        if (availablePairKeys && !availablePairKeys.has(pairKey)) return

        // Only include user-confirmed selections (click or threshold) for SVM training
        const source = pairSelectionSources.get(pairKey)
        if (!isUserConfirmed(source)) return

        const weightedSource = source === 'click' ? 'click' : 'threshold' as const
        if (state === 'selected') selectedItems.push({ key: pairKey, source: weightedSource })
        else if (state === 'rejected') rejectedItems.push({ key: pairKey, source: weightedSource })
      })

      // SIMPLIFIED FLOW: Use feature_ids + threshold (backend generates pairs via clustering)
      if (selectedFeatureIds && selectedFeatureIds.size > 0 && threshold !== undefined) {
        console.log(`[Store.fetchSimilarityHistogram] [SIMPLIFIED FLOW] Using feature_ids + threshold:`, {
          featureCount: selectedFeatureIds.size,
          threshold: threshold
        })

        // Need at least 1 selected and 1 rejected for meaningful histogram
        if (selectedItems.length === 0 || rejectedItems.length === 0) {
          console.warn('[Store.fetchSimilarityHistogram] Need at least 1 selected and 1 rejected pair')
          return null
        }

        // Call simplified API - backend generates pairs via clustering
        const histogramData = await api.getPairSimilarityScoreHistogram(
          selectedItems,
          rejectedItems,
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

        // Build current predictions from new scores
        // Use decision boundary (score >= 0) not user thresholds, to track actual SVM prediction changes
        const currentPredictions = new Map<string, 'selected' | 'rejected'>()
        Object.entries(histogramData.scores).forEach(([pairKey, score]) => {
          if (typeof score === 'number') {
            // Track based on SVM decision boundary, not user thresholds
            if (score >= 0) {
              currentPredictions.set(pairKey, 'selected')
            } else {
              currentPredictions.set(pairKey, 'rejected')
            }
          }
        })

        // Calculate flip tracking update
        const existingFlipTracking = currentState?.flipTracking
        let updatedFlipTracking: {
          flipHistory: Array<{ flipRate: number; isBatch: boolean; iteration: number; predictionCounts: Record<string, number>; flipTransitions: Record<string, number> }>
          totalIterations: number
          flippedBins: Set<number>
          previousPredictions: Map<string, 'selected' | 'rejected'>
        }

        if (existingFlipTracking && existingFlipTracking.previousPredictions.size > 0) {
          // Calculate flips compared to previous predictions
          let flips = 0
          let total = 0
          currentPredictions.forEach((curr, key) => {
            const prev = existingFlipTracking.previousPredictions.get(key)
            if (prev) {
              total++
              if (prev !== curr) flips++
            }
          })
          const flipRate = total > 0 ? flips / total : 0
          const newIteration = existingFlipTracking.totalIterations + 1

          // Count predictions by category
          const predictionCounts: Record<string, number> = { selected: 0, rejected: 0 }
          currentPredictions.forEach((prediction) => {
            predictionCounts[prediction] = (predictionCounts[prediction] || 0) + 1
          })

          // Count flip transitions (previous → current)
          const flipTransitions: Record<string, number> = {}
          currentPredictions.forEach((curr, key) => {
            const prev = existingFlipTracking.previousPredictions.get(key)
            if (prev && prev !== curr) {
              const transitionKey = `${prev}→${curr}`
              flipTransitions[transitionKey] = (flipTransitions[transitionKey] || 0) + 1
            }
          })

          // Use pendingBatchOperation flag to determine isBatch
          updatedFlipTracking = {
            flipHistory: [...existingFlipTracking.flipHistory, { flipRate, isBatch: pendingBatchOperation, iteration: newIteration, predictionCounts, flipTransitions }].slice(-FLIP_HISTORY_WINDOW_SIZE),
            totalIterations: newIteration,
            flippedBins: new Set<number>(),
            previousPredictions: currentPredictions
          }

          console.log('[fetchSimilarityHistogram] Flip tracking updated:', {
            flipRate: (flipRate * 100).toFixed(1) + '%',
            flips,
            total,
            historyLength: updatedFlipTracking.flipHistory.length
          })
        } else {
          // First time - initialize with iteration 0 entry (stacked bar only, no line point)
          const predictionCounts: Record<string, number> = { selected: 0, rejected: 0 }
          currentPredictions.forEach((prediction) => {
            predictionCounts[prediction] = (predictionCounts[prediction] || 0) + 1
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
            previousPredictions: currentPredictions
          }
        }

        // Extract committee votes from histogram response
        let committeeVotes: Map<string, { svm_prediction: 0 | 1; rf_prediction: 0 | 1; mlp_prediction: 0 | 1; vote_entropy: number }> | null = null

        if (histogramData?.committee_votes) {
          committeeVotes = new Map(
            Object.entries(histogramData.committee_votes).map(([id, info]: [string, any]) => [
              id,
              {
                svm_prediction: info.svm_prediction,
                rf_prediction: info.rf_prediction,
                mlp_prediction: info.mlp_prediction,
                vote_entropy: info.vote_entropy
              }
            ])
          )
        }

        // Always update/create tagAutomaticState with updated flip tracking
        // Clear the batch flag after processing
        if (currentState) {
          set({
            pendingBatchOperation: false,
            tagAutomaticState: {
              ...currentState,
              histogramData,
              flipTracking: updatedFlipTracking,
              committeeVotes
            }
          })
        } else {
          set({
            pendingBatchOperation: false,
            tagAutomaticState: {
              visible: false,
              minimized: false,
              mode: 'pair',
              position: { x: 0, y: 0 },
              histogramData,
              selectThreshold,
              rejectThreshold,
              tagLabel: 'Fragmented',
              isLoading: false,
              flipTracking: updatedFlipTracking,
              committeeVotes
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
          isLoading: true,
          flipTracking: null
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
      // Initialize flipTracking with empty history and current predictions
      const currentState = get().tagAutomaticState
      const existingFlipTracking = currentState?.flipTracking

      // Build initial predictions map based on decision boundary (score >= 0) for flip tracking
      const initialPredictions = new Map<string, 'selected' | 'rejected'>()
      let selectedCount = 0
      let rejectedCount = 0
      if (histogramData.scores) {
        Object.entries(histogramData.scores).forEach(([pairKey, score]) => {
          if (typeof score === 'number') {
            // Use decision boundary for consistent flip tracking
            if (score >= 0) {
              initialPredictions.set(pairKey, 'selected')
              selectedCount++
            } else {
              initialPredictions.set(pairKey, 'rejected')
              rejectedCount++
            }
          }
        })
      }

      // Initialize flipHistory with iteration 0 entry (shows stacked bar only, no line point yet)
      // Check length explicitly since empty array is truthy
      const hasExistingHistory = existingFlipTracking?.flipHistory && existingFlipTracking.flipHistory.length > 0
      const initialFlipHistory = hasExistingHistory
        ? existingFlipTracking.flipHistory
        : [{
            flipRate: 0,
            isBatch: false,
            iteration: 0,
            predictionCounts: { selected: selectedCount, rejected: rejectedCount },
            flipTransitions: {}
          }]

      // Extract committee votes from histogram response
      let committeeVotes: Map<string, { svm_prediction: 0 | 1; rf_prediction: 0 | 1; mlp_prediction: 0 | 1; vote_entropy: number }> | null = null

      if (histogramData?.committee_votes) {
        committeeVotes = new Map(
          Object.entries(histogramData.committee_votes).map(([id, info]: [string, any]) => [
            id,
            {
              svm_prediction: info.svm_prediction,
              rf_prediction: info.rf_prediction,
              mlp_prediction: info.mlp_prediction,
              vote_entropy: info.vote_entropy
            }
          ])
        )
      }

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
          isLoading: false,
          flipTracking: {
            flipHistory: initialFlipHistory,
            totalIterations: hasExistingHistory ? existingFlipTracking.totalIterations : 0,
            flippedBins: hasExistingHistory ? existingFlipTracking.flippedBins : new Set<number>(),
            previousPredictions: hasExistingHistory ? existingFlipTracking.previousPredictions : initialPredictions
          },
          committeeVotes
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
          isLoading: false,
          flipTracking: null,
          committeeVotes: null
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

    const { mode, selectThreshold, rejectThreshold, histogramData, flipTracking } = tagAutomaticState

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

    // ============================================================================
    // FLIP RATE CALCULATION - Before applying tags
    // ============================================================================
    let flips = 0
    let totalEligible = 0
    const flippedBins = new Set<number>()
    const newPredictions = new Map<string, 'selected' | 'rejected'>()
    const previousPredictions = flipTracking?.previousPredictions || new Map()

    // Calculate current predictions and detect flips
    // Use decision boundary (score >= 0) for consistent flip tracking
    Object.entries(scores).forEach(([pairKey, score]) => {
      if (pairSelectionStates.has(pairKey)) return // Skip already tagged

      if (typeof score === 'number') {
        // Track based on SVM decision boundary, not user thresholds
        const currPred: 'selected' | 'rejected' = score >= 0 ? 'selected' : 'rejected'
        newPredictions.set(pairKey, currPred)
        totalEligible++

        // Check for flip
        const prevPred = previousPredictions.get(pairKey)
        if (prevPred && prevPred !== currPred) {
          flips++
          // Calculate bin index (approximate based on histogram)
          const binCount = histogramData.histogram?.counts?.length || 20
          const { min, max } = histogramData.statistics
          const range = max - min
          if (range > 0) {
            const binIndex = Math.floor(((score - min) / range) * (binCount - 1))
            flippedBins.add(Math.max(0, Math.min(binIndex, binCount - 1)))
          }
        }
      }
    })

    const flipRate = totalEligible > 0 ? flips / totalEligible : 0

    console.log('[Store.applySimilarityTags] Flip tracking (batch pending):', {
      flipRate: (flipRate * 100).toFixed(1) + '%',
      flips,
      totalEligible
    })

    // ============================================================================
    // APPLY TAGS
    // ============================================================================
    const newPairSelectionStates = new Map(pairSelectionStates)
    const newPairSelectionSources = new Map(pairSelectionSources)
    let selectedCount = 0
    let rejectedCount = 0
    let untaggedCount = 0

    Object.entries(scores).forEach(([pairKey, score]) => {
      // Skip if already tagged
      if (pairSelectionStates.has(pairKey)) {
        return
      }

      // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
      // Note: source is 'threshold' because user clicked "Apply Tags" to confirm batch threshold-based tags
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          // Blue zone: auto-select (confirmed by user clicking Apply Tags)
          newPairSelectionStates.set(pairKey, 'selected')
          newPairSelectionSources.set(pairKey, 'threshold')
          selectedCount++
        } else if (score <= rejectThreshold) {
          // Light red zone: auto-reject (confirmed by user clicking Apply Tags)
          newPairSelectionStates.set(pairKey, 'rejected')
          newPairSelectionSources.set(pairKey, 'threshold')
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

    // Set batch flag - histogram update will add flip history entry with isBatch: true
    set({
      pendingBatchOperation: true,
      pairSelectionStates: newPairSelectionStates,
      pairSelectionSources: newPairSelectionSources,
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
   * Clear histogram data from tagAutomaticState while preserving thresholds
   * Used when selection count drops below minimum required for histogram
   */
  clearTagAutomaticHistogram: () => {
    const { tagAutomaticState } = get()
    if (tagAutomaticState) {
      set({
        tagAutomaticState: {
          ...tagAutomaticState,
          histogramData: null
        }
      })
      console.log('[Store.clearTagAutomaticHistogram] Histogram data cleared')
    }
  }
})
