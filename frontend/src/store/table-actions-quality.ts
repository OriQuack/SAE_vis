import * as api from '../api'

// ============================================================================
// QUALITY STAGE ACTIONS (features)
// ============================================================================

/**
 * Factory function to create quality (feature) actions for the store
 */
export const createQualityActions = (set: any, get: any) => ({
  // ============================================================================
  // FEATURE SIMILARITY SORT ACTION
  // ============================================================================

  sortBySimilarity: async () => {
    const state = get()
    const { featureSelectionStates, featureSelectionSources, tableData } = state

    console.log('[Store.sortBySimilarity] Starting similarity sort:', {
      selectionStatesSize: featureSelectionStates.size,
      hasTableData: !!tableData
    })

    // Validate: need at least 1 selected or rejected feature
    if (featureSelectionStates.size < 1) {
      console.warn('[Store.sortBySimilarity] ⚠️  No features selected for similarity sort')
      return
    }

    if (!tableData?.features) {
      console.warn('[Store.sortBySimilarity] ⚠️  No table data available')
      return
    }

    // Extract selected and rejected IDs (ONLY manually labeled features)
    const selectedIds: number[] = []
    const rejectedIds: number[] = []

    featureSelectionStates.forEach((selectionState: string, featureId: number) => {
      const source = featureSelectionSources.get(featureId)
      // Only use manually labeled features for similarity sorting
      if (source === 'manual') {
        if (selectionState === 'selected') {
          selectedIds.push(featureId)
        } else if (selectionState === 'rejected') {
          rejectedIds.push(featureId)
        }
      }
    })

    console.log('[Store.sortBySimilarity] Selection counts (manual only):', {
      selected: selectedIds.length,
      rejected: rejectedIds.length
    })

    // Need at least one of each for meaningful sort
    if (selectedIds.length === 0 && rejectedIds.length === 0) {
      console.warn('[Store.sortBySimilarity] ⚠️  Need at least one selected or rejected feature')
      return
    }

    // Get all feature IDs from table data
    const allFeatureIds = tableData.features.map((f: any) => f.feature_id)

    try {
      set({ isSimilaritySortLoading: true })

      console.log('[Store.sortBySimilarity] Calling API:', {
        selectedIds: selectedIds.length,
        rejectedIds: rejectedIds.length,
        totalFeatures: allFeatureIds.length
      })

      // Call API
      const response = await api.getSimilaritySort(
        selectedIds,
        rejectedIds,
        allFeatureIds
      )

      console.log('[Store.sortBySimilarity] API response:', {
        sortedFeaturesCount: response.sorted_features.length,
        totalFeatures: response.total_features,
        weightsCount: response.weights_used.length
      })

      // Convert to Map for easy lookup
      const scoresMap = new Map<number, number>()
      response.sorted_features.forEach((fs) => {
        scoresMap.set(fs.feature_id, fs.score)
      })

      // Generate selection signature to track this sort state
      // Format: "selected:[ids]|rejected:[ids]"
      const selectedSig = selectedIds.sort((a, b) => a - b).join(',')
      const rejectedSig = rejectedIds.sort((a, b) => a - b).join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(featureSelectionStates)

      // Store scores and set sort mode
      set({
        similarityScores: scoresMap,
        tableSortBy: 'similarity',
        tableSortDirection: 'desc',
        isSimilaritySortLoading: false,
        lastSortedSelectionSignature: selectionSignature,
        sortedBySelectionStates: frozenSelectionStates
      })

      console.log('[Store.sortBySimilarity] ✅ Similarity sort complete:', {
        scoresMapSize: scoresMap.size,
        sortBy: 'similarity',
        selectionSignature
      })

    } catch (error) {
      console.error('[Store.sortBySimilarity] ❌ Failed to calculate similarity sort:', error)
      set({ isSimilaritySortLoading: false })
    }
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (feature mode)
  // ============================================================================

  showSimilarityTaggingPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string) => {
    // Only handle feature mode in this file
    if (mode !== 'feature') {
      console.warn('[Quality.showSimilarityTaggingPopover] Wrong mode:', mode)
      return
    }

    console.log(`[Store.showSimilarityTaggingPopover] Opening ${mode} tagging popover with label: ${tagLabel}`)

    const { featureSelectionStates, tableData } = get()

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

      // Extract selected and rejected feature IDs
      const selectedIds: number[] = []
      const rejectedIds: number[] = []
      const allFeatureIds: number[] = []

      featureSelectionStates.forEach((state: string | null, featureId: number) => {
        if (state === 'selected') selectedIds.push(featureId)
        else if (state === 'rejected') rejectedIds.push(featureId)
      })

      // Get all feature IDs from table data
      if (tableData && tableData.features) {
        tableData.features.forEach((feature: any) => {
          allFeatureIds.push(feature.feature_id)
        })
      }

      console.log('[Store.showSimilarityTaggingPopover] Fetching feature histogram:', {
        selected: selectedIds.length,
        rejected: rejectedIds.length,
        total: allFeatureIds.length
      })

      // Fetch histogram data
      const histogramData = await api.getSimilarityScoreHistogram(
        selectedIds,
        rejectedIds,
        allFeatureIds
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
    const { similarityTaggingPopover, featureSelectionStates, featureSelectionSources } = get()

    if (!similarityTaggingPopover || !similarityTaggingPopover.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, selectThreshold, rejectThreshold, histogramData } = similarityTaggingPopover

    // Only handle feature mode in this file
    if (mode !== 'feature') {
      console.warn('[Quality.applySimilarityTags] Wrong mode:', mode)
      return
    }

    const scores = histogramData.scores

    console.log(`[Store.applySimilarityTags] Applying ${mode} tags with thresholds:`, {
      select: selectThreshold,
      reject: rejectThreshold
    })

    // Apply tags to features (dual thresholds: auto-select and auto-reject)
    const newSelectionStates = new Map(featureSelectionStates)
    const newSelectionSources = new Map(featureSelectionSources)
    let selectedCount = 0
    let rejectedCount = 0
    let untaggedCount = 0

    Object.entries(scores).forEach(([idStr, score]) => {
      const featureId = parseInt(idStr, 10)

      // Skip if already manually tagged
      if (featureSelectionStates.has(featureId)) {
        return
      }

      // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          // Blue zone: auto-select
          newSelectionStates.set(featureId, 'selected')
          newSelectionSources.set(featureId, 'auto')
          selectedCount++
        } else if (score <= rejectThreshold) {
          // Light red zone: auto-reject
          newSelectionStates.set(featureId, 'rejected')
          newSelectionSources.set(featureId, 'auto')
          rejectedCount++
        } else {
          // Middle zone: leave untagged
          untaggedCount++
        }
      }
    })

    console.log('[Store.applySimilarityTags] Feature tags applied:', {
      selected: selectedCount,
      rejected: rejectedCount,
      untagged: untaggedCount,
      preserved: featureSelectionStates.size
    })

    set({
      featureSelectionStates: newSelectionStates,
      featureSelectionSources: newSelectionSources
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
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) {
      console.warn('[Store.showThresholdsOnTable] No popover state available')
      return
    }

    const { mode, selectThreshold, rejectThreshold } = similarityTaggingPopover

    // Only handle feature mode in this file
    if (mode !== 'feature') {
      console.warn('[Quality.showThresholdsOnTable] Wrong mode:', mode)
      return
    }

    console.log('[Store.showThresholdsOnTable] Showing thresholds on table:', {
      mode,
      selectThreshold,
      rejectThreshold
    })

    try {
      // Step 1: Trigger similarity sort
      await get().sortBySimilarity()

      // Step 2: Calculate preview sets (which items would be auto-tagged)
      const { featureSelectionStates, similarityScores } = get()
      const previewAutoSelected = new Set<number | string>()
      const previewAutoRejected = new Set<number | string>()

      // Check each feature with a similarity score
      similarityScores.forEach((score: any, featureId: any) => {
        const isAlreadyTagged = featureSelectionStates.has(featureId)
        if (!isAlreadyTagged) {
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

      console.log('[Store.showThresholdsOnTable] Thresholds displayed for features')

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
