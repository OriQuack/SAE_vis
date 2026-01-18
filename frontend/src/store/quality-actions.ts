import * as api from '../api'
import { FLIP_HISTORY_WINDOW_SIZE } from '../components/ConvergenceIndicator'
import { isUserConfirmed } from '../lib/tagging-hooks/useCommitHistory'

// ============================================================================
// QUALITY STAGE ACTIONS (features)
// ============================================================================

/**
 * Factory function to create quality (feature) actions for the store
 */
export const createQualityActions = (set: any, get: any) => ({
  // ============================================================================
  // QUALITY COUNTS GETTER
  // ============================================================================

  /**
   * Get feature counts from feature selection states
   * Returns: { wellExplained, needRevision, unsure, total, wellExplainedManual, wellExplainedAuto, needRevisionManual, needRevisionAuto }
   * Used by TagStagePanel and SelectionPanel for consistent counts
   */
  getQualityCounts: () => {
    const state = get()
    const { featureSelectionStates, featureSelectionSources } = state
    const filteredFeatureIds = state.getSelectedNodeFeatures()

    if (!filteredFeatureIds || filteredFeatureIds.size === 0) {
      return { wellExplained: 0, needRevision: 0, unsure: 0, total: 0, wellExplainedManual: 0, wellExplainedAuto: 0, needRevisionManual: 0, needRevisionAuto: 0 }
    }

    let wellExplained = 0, needRevision = 0, unsure = 0
    let wellExplainedManual = 0, wellExplainedAuto = 0, needRevisionManual = 0, needRevisionAuto = 0

    for (const featureId of filteredFeatureIds) {
      const selectionState = featureSelectionStates.get(featureId)
      const source = featureSelectionSources.get(featureId) || 'click'

      if (selectionState === 'selected') {
        wellExplained++
        if (isUserConfirmed(source)) wellExplainedManual++
        else wellExplainedAuto++
      } else if (selectionState === 'rejected') {
        needRevision++
        if (isUserConfirmed(source)) needRevisionManual++
        else needRevisionAuto++
      } else {
        unsure++
      }
    }

    return {
      wellExplained,
      needRevision,
      unsure,
      total: filteredFeatureIds.size,
      wellExplainedManual,
      wellExplainedAuto,
      needRevisionManual,
      needRevisionAuto
    }
  },

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

    // Extract selected and rejected items with sources (ONLY manually labeled features)
    const selectedItems: { id: number; source: 'click' | 'threshold' }[] = []
    const rejectedItems: { id: number; source: 'click' | 'threshold' }[] = []

    featureSelectionStates.forEach((selectionState: string, featureId: number) => {
      const source = featureSelectionSources.get(featureId)
      // Only use user-confirmed features (click or threshold) for similarity sorting
      if (isUserConfirmed(source)) {
        const weightedSource = source === 'click' ? 'click' : 'threshold' as const
        if (selectionState === 'selected') {
          selectedItems.push({ id: featureId, source: weightedSource })
        } else if (selectionState === 'rejected') {
          rejectedItems.push({ id: featureId, source: weightedSource })
        }
      }
    })

    console.log('[Store.sortBySimilarity] Selection counts (manual only):', {
      selected: selectedItems.length,
      rejected: rejectedItems.length
    })

    // Need at least one of each for meaningful sort
    if (selectedItems.length === 0 && rejectedItems.length === 0) {
      console.warn('[Store.sortBySimilarity] ⚠️  Need at least one selected or rejected feature')
      return
    }

    // Get feature IDs from selected Sankey node (not all table data)
    // This matches how DecisionMarginHistogram filters features for the histogram API call
    const selectedNodeFeatures = state.getSelectedNodeFeatures()
    const allFeatureIds = selectedNodeFeatures && selectedNodeFeatures.size > 0
      ? Array.from(selectedNodeFeatures)
      : tableData.features.map((f: any) => f.feature_id)

    try {
      set({ isSimilaritySortLoading: true })

      console.log('[Store.sortBySimilarity] Calling API:', {
        selectedItems: selectedItems.length,
        rejectedItems: rejectedItems.length,
        totalFeatures: allFeatureIds.length
      })

      // Call API
      const response = await api.getSimilaritySort(
        selectedItems,
        rejectedItems,
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
      const selectedSig = selectedItems.map(i => i.id).sort((a, b) => a - b).join(',')
      const rejectedSig = rejectedItems.map(i => i.id).sort((a, b) => a - b).join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(featureSelectionStates)

      // Store scores and set sort mode
      set({
        similarityScores: scoresMap,
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

  showTagAutomaticPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string, _selectedFeatureIds?: Set<number>, _threshold?: number) => {
    // Only handle feature mode in this file
    if (mode !== 'feature') {
      console.warn('[Quality.showTagAutomaticPopover] Wrong mode:', mode)
      return
    }

    console.log(`[Store.showTagAutomaticPopover] Opening ${mode} tagging popover with label: ${tagLabel}`)

    const { featureSelectionStates, tableData } = get()

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

      // Extract selected and rejected feature items with sources
      const selectedItems: { id: number; source: 'click' | 'threshold' }[] = []
      const rejectedItems: { id: number; source: 'click' | 'threshold' }[] = []
      const allFeatureIds: number[] = []

      const { featureSelectionSources } = get()

      featureSelectionStates.forEach((state: string | null, featureId: number) => {
        const source = featureSelectionSources.get(featureId)
        // Only use user-confirmed features for SVM training
        if (isUserConfirmed(source)) {
          const weightedSource = source === 'click' ? 'click' : 'threshold' as const
          if (state === 'selected') selectedItems.push({ id: featureId, source: weightedSource })
          else if (state === 'rejected') rejectedItems.push({ id: featureId, source: weightedSource })
        }
      })

      // Get all feature IDs from table data
      if (tableData && tableData.features) {
        tableData.features.forEach((feature: any) => {
          allFeatureIds.push(feature.feature_id)
        })
      }

      console.log('[Store.showTagAutomaticPopover] Fetching feature histogram:', {
        selected: selectedItems.length,
        rejected: rejectedItems.length,
        total: allFeatureIds.length
      })

      // Fetch histogram data
      const histogramData = await api.getSimilarityScoreHistogram(
        selectedItems,
        rejectedItems,
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
      // Initialize flipTracking with empty history and current predictions
      const currentState = get()
      const existingFlipTracking = currentState.tagAutomaticState?.flipTracking

      // Build initial predictions map based on SVM decision boundary (score >= 0)
      // Use decision boundary not thresholds to track actual prediction changes
      const initialPredictions = new Map<number, 'selected' | 'rejected'>()
      let selectedCount = 0
      let rejectedCount = 0
      Object.entries(histogramData.scores).forEach(([idStr, score]) => {
        const featureId = parseInt(idStr, 10)
        if (typeof score === 'number') {
          if (score >= 0) {
            initialPredictions.set(featureId, 'selected')
            selectedCount++
          } else {
            initialPredictions.set(featureId, 'rejected')
            rejectedCount++
          }
        }
      })

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
          }
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
    if (!tagAutomaticState) return

    set({
      tagAutomaticState: {
        ...tagAutomaticState,
        selectThreshold,
        rejectThreshold
      }
    })
  },

  /**
   * Set histogram data for feature mode (called by DecisionMarginHistogram)
   * Creates tagAutomaticState if it doesn't exist
   * Also updates flip tracking to show Decision Stability indicator
   */
  setTagAutomaticHistogramData: (histogramData: any, selectThreshold: number, rejectThreshold: number) => {
    const { tagAutomaticState, pendingBatchOperation } = get()

    // Build current predictions from new scores
    // Use decision boundary (score >= 0) not user thresholds, to track actual SVM prediction changes
    const currentPredictions = new Map<number, 'selected' | 'rejected'>()
    if (histogramData?.scores) {
      Object.entries(histogramData.scores).forEach(([idStr, score]) => {
        const featureId = parseInt(idStr, 10)
        if (typeof score === 'number') {
          // Track based on SVM decision boundary, not user thresholds
          if (score >= 0) {
            currentPredictions.set(featureId, 'selected')
          } else {
            currentPredictions.set(featureId, 'rejected')
          }
        }
      })
    }

    // Calculate flip tracking update
    const existingFlipTracking = tagAutomaticState?.flipTracking
    let updatedFlipTracking: {
      flipHistory: Array<{ flipRate: number; isBatch: boolean; iteration: number; predictionCounts: Record<string, number>; flipTransitions: Record<string, number> }>
      totalIterations: number
      flippedBins: Set<number>
      previousPredictions: Map<number, 'selected' | 'rejected'>
    }

    if (existingFlipTracking && existingFlipTracking.previousPredictions.size > 0) {
      // Calculate flips compared to previous predictions
      let flips = 0
      let total = 0
      currentPredictions.forEach((curr, featureId) => {
        const prev = existingFlipTracking.previousPredictions.get(featureId)
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
      currentPredictions.forEach((curr, featureId) => {
        const prev = existingFlipTracking.previousPredictions.get(featureId)
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

    set({
      pendingBatchOperation: false,  // Clear the batch flag
      tagAutomaticState: {
        visible: tagAutomaticState?.visible ?? false,
        minimized: tagAutomaticState?.minimized ?? false,
        mode: 'feature' as const,
        position: tagAutomaticState?.position ?? { x: 0, y: 0 },
        histogramData,
        selectThreshold,
        rejectThreshold,
        tagLabel: tagAutomaticState?.tagLabel ?? 'Well-Explained',
        isLoading: false,
        flipTracking: updatedFlipTracking
      }
    })
  },

  applySimilarityTags: () => {
    const { tagAutomaticState, featureSelectionStates, featureSelectionSources } = get()

    if (!tagAutomaticState || !tagAutomaticState.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, selectThreshold, rejectThreshold, histogramData, flipTracking } = tagAutomaticState

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

    // ============================================================================
    // FLIP RATE CALCULATION - Before applying tags
    // ============================================================================
    let flips = 0
    let totalEligible = 0
    const flippedBins = new Set<number>()
    const newPredictions = new Map<number, 'selected' | 'rejected'>()
    const previousPredictions = flipTracking?.previousPredictions || new Map()

    // Calculate current predictions and detect flips
    // Use decision boundary (score >= 0) for consistent flip tracking
    Object.entries(scores).forEach(([idStr, score]) => {
      const featureId = parseInt(idStr, 10)
      if (featureSelectionStates.has(featureId)) return // Skip already tagged

      if (typeof score === 'number') {
        // Track based on SVM decision boundary, not user thresholds
        const currPred: 'selected' | 'rejected' = score >= 0 ? 'selected' : 'rejected'
        newPredictions.set(featureId, currPred)
        totalEligible++

        // Check for flip
        const prevPred = previousPredictions.get(featureId)
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
    const newSelectionStates = new Map(featureSelectionStates)
    const newSelectionSources = new Map(featureSelectionSources)
    let selectedCount = 0
    let rejectedCount = 0
    let untaggedCount = 0

    Object.entries(scores).forEach(([idStr, score]) => {
      const featureId = parseInt(idStr, 10)

      // Skip if already tagged
      if (featureSelectionStates.has(featureId)) {
        return
      }

      // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
      // Note: source is 'threshold' because user clicked "Apply Tags" to confirm batch threshold-based tags
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          // Blue zone: auto-select (confirmed by user clicking Apply Tags)
          newSelectionStates.set(featureId, 'selected')
          newSelectionSources.set(featureId, 'threshold')
          selectedCount++
        } else if (score <= rejectThreshold) {
          // Light red zone: auto-reject (confirmed by user clicking Apply Tags)
          newSelectionStates.set(featureId, 'rejected')
          newSelectionSources.set(featureId, 'threshold')
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

    // Set batch flag - histogram update will add flip history entry with isBatch: true
    set({
      pendingBatchOperation: true,
      featureSelectionStates: newSelectionStates,
      featureSelectionSources: newSelectionSources,
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
  }
})
