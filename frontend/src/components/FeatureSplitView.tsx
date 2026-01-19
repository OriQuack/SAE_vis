import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore, type CommitCounts } from '../store/index'
import type { FeatureTableRow } from '../types'
import * as api from '../api'
import FeatureSplitPairViewer from './FeatureSplitPairViewer'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import StageAccordionList from './StageAccordionList'
import { TagBadge } from './Indicators'
import { isBimodalScore } from '../lib/modality-utils'
import { useSortableList, sortConfigToStage, stageToSortConfig, type ActiveStage, type BootstrapMode } from '../lib/tagging-hooks/useSortableList'
import { useCommitHistory, createPairCommitHistoryOptions, type DisplayCommit, isUserConfirmed, useMainListScroll } from '../lib/tagging-hooks'
import { useListNavigation } from '../lib/tagging-hooks'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import '../styles/FeatureSplitView.css'

// ============================================================================
// FEATURE SPLIT VIEW - Organized layout for feature splitting workflow
// ============================================================================
// Layout: [Top: pair list + viewer] | [Bottom: left boundary + histogram + right boundary]


interface FeatureSplitViewProps {
  className?: string
}

const FeatureSplitView: React.FC<FeatureSplitViewProps> = ({
  className = ''
}) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const clusterGroups = useVisualizationStore(state => state.clusterGroups)
  const allClusterPairs = useVisualizationStore(state => state.allClusterPairs)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchAllClusterPairs = useVisualizationStore(state => (state as any).fetchAllClusterPairs)
  const clearDistributedPairs = useVisualizationStore(state => (state as any).clearDistributedPairs)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const isDraggingThreshold = useVisualizationStore(state => state.isDraggingThreshold)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const lastPairSortedSelectionSignature = useVisualizationStore(state => state.lastPairSortedSelectionSignature)
  const isPairSimilaritySortLoading = useVisualizationStore(state => state.isPairSimilaritySortLoading)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const restorePairSelectionStates = useVisualizationStore(state => state.restorePairSelectionStates)
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Stage 1 revisiting state
  const isRevisitingStage1 = useVisualizationStore(state => state.isRevisitingStage1)
  const stage1FinalCommit = useVisualizationStore(state => state.stage1FinalCommit)
  const setStage1FinalCommit = useVisualizationStore(state => state.setStage1FinalCommit)
  // Full commit history for restoration
  const stage1CommitHistory = useVisualizationStore(state => state.stage1CommitHistory)
  const stage1CommitData = useVisualizationStore(state => state.stage1CommitData)
  const stage1CurrentCommitIndex = useVisualizationStore(state => state.stage1CurrentCommitIndex)

  // Local state for navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)

  // Hide tagged items toggle
  const [hideTagged, setHideTagged] = useState(false)

  // Store selected pair key directly to preserve highlight across mode switches
  const [selectedPairKeyState, setSelectedPairKeyState] = useState<string | null>(null)

  // Track if SVM has been trained (for conditional UI labels)
  const svmTrainingStarted = pairSimilarityScores.size > 0

  // Diversity sort: IDs of diverse pairs (Kennard-Stone samples) to show first
  // Cached in store to prevent refetch on view navigation
  const diversityPairIds = useVisualizationStore(state => state.stage1DiversityPairIds)
  const stage1DiversitySignature = useVisualizationStore(state => state.stage1DiversitySignature)
  const setStage1DiversityCache = useVisualizationStore(state => state.setStage1DiversityCache)

  // Track visited representative pairs for smart pulsing
  const [visitedRepIds, setVisitedRepIds] = useState<Set<string>>(new Set())

  // Store getter for counts calculation
  const getFeatureSplittingCounts = useVisualizationStore(state => state.getFeatureSplittingCounts)

  // Dependencies for selectedFeatureIds - ensure it updates when Sankey selection changes
  // MUST be defined before useCommitHistory which references selectedFeatureIds
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  // When revisiting Stage 1, use the stored feature IDs from the saved commit
  const selectedFeatureIds = useMemo(() => {
    // If revisiting Stage 1 and we have stored feature IDs, use those
    if (isRevisitingStage1 && stage1FinalCommit?.featureIds) {
      console.log('[FeatureSplitView] Using stored Stage 1 feature IDs:', stage1FinalCommit.featureIds.size)
      return stage1FinalCommit.featureIds
    }

    // These dependencies are necessary to trigger recalculation when Sankey selection changes
    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps  // Consume the variable to avoid unused-vars warning
    const features = getSelectedNodeFeatures()
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage1, stage1FinalCommit])

  // ============================================================================
  // LIST NAVIGATION - Using centralized hook
  // ============================================================================
  const resetPairIndex = useCallback(() => setCurrentPairIndex(0), [])
  const { activeListSource, setActiveListSource } = useListNavigation({
    isDraggingThreshold,
    onReset: resetPairIndex
  })

  // ============================================================================
  // COMMIT HISTORY - Using centralized hook with storeSync
  // ============================================================================

  // Calculate counts for commit storage
  const calculateCommitCounts = useCallback((): CommitCounts => {
    const c = getFeatureSplittingCounts()
    return {
      fragmented: c.fragmentedManual + c.fragmentedAuto,
      monosemantic: c.monosematicManual + c.monosematicAuto,
      unsure: c.unsure,
      total: c.total
    }
  }, [getFeatureSplittingCounts])

  // Extract clustering threshold from Sankey structure
  // MOVED UP: Needed by setFinalCommitFromHook and onCommitCreated
  const clusterThreshold = useMemo(() => {
    if (!sankeyStructure) return 0.5

    const stage1Segment = sankeyStructure.nodes.find(n => n.id === 'stage1_segment')
    if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
      // Sankey threshold is already a similarity value, use it directly
      return stage1Segment.threshold
    }
    return 0.5
  }, [sankeyStructure])

  // Convert Sankey threshold to clustering distance threshold
  // Sankey threshold is similarity-based (lower = less similar)
  // Clustering threshold is distance-based (higher = more dissimilar allowed)
  // Inversion: similarity 0.4 → distance 0.6 (looser clustering)
  const clusteringThreshold = useMemo(() => {
    return 1 - clusterThreshold
  }, [clusterThreshold])

  // Store sync setters (inline functions that use setState)
  const setStoreCommitHistory = useCallback((commits: DisplayCommit<CommitCounts>[]) => {
    useVisualizationStore.setState({ stage1CommitHistory: commits })
  }, [])

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<string, 'selected' | 'rejected'>; sources: Map<string, 'click' | 'threshold' | 'predicted'>; featureIds?: Set<number> }>) => {
    useVisualizationStore.setState({ stage1CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage1CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<string, 'selected' | 'rejected'>; sources: Map<string, 'click' | 'threshold' | 'predicted'>; featureIds: Set<number>; counts: CommitCounts }) => {
    // Get current state to preserve histogram and cluster pairs
    const state = useVisualizationStore.getState()
    const currentTagState = state.tagAutomaticState
    const existingCommit = state.stage1FinalCommit

    // When revisiting Stage 1, preserve existing clusterPairsState and histogramState
    // because they may have been cleared in the store during Stage 2
    const isRevisiting = state.isRevisitingStage1

    // Determine histogram state: use current if available, otherwise preserve existing when revisiting
    const histogramState = (currentTagState && currentTagState.mode === 'pair' && currentTagState.histogramData)
      ? {
          histogramData: currentTagState.histogramData,
          selectThreshold: currentTagState.selectThreshold,
          rejectThreshold: currentTagState.rejectThreshold,
          flipTracking: currentTagState.flipTracking ?? null
        }
      : (isRevisiting ? existingCommit?.histogramState : undefined)

    // Determine cluster pairs state: use current if available, otherwise preserve existing when revisiting
    const clusterPairsState = (state.allClusterPairs && state.clusterGroups)
      ? {
          allClusterPairs: state.allClusterPairs,
          clusterGroups: state.clusterGroups,
          clusteringThreshold: clusteringThreshold
        }
      : (isRevisiting ? existingCommit?.clusterPairsState : undefined)

    setStage1FinalCommit({
      pairSelectionStates: new Map(data.states),
      pairSelectionSources: new Map(data.sources),
      featureIds: data.featureIds,
      counts: data.counts,
      histogramState,
      clusterPairsState
    })
  }, [setStage1FinalCommit, clusteringThreshold])

  // Memoize storeSync to prevent infinite loops (object reference stability)
  const storeSync = useMemo(() => ({
    isRevisiting: isRevisitingStage1,
    stageCommitHistory: stage1CommitHistory,
    stageCommitData: stage1CommitData,
    stageCurrentCommitIndex: stage1CurrentCommitIndex,
    setStoreCommitHistory,
    setStoreCommitData,
    setStoreCurrentCommitIndex,
    setFinalCommit: setFinalCommitFromHook
  }), [isRevisitingStage1, stage1CommitHistory, stage1CommitData, stage1CurrentCommitIndex, setStoreCommitHistory, setStoreCommitData, setStoreCurrentCommitIndex, setFinalCommitFromHook])

  // Use the commit history hook with store sync
  const { createCommit } = useCommitHistory<Map<string, 'selected' | 'rejected'>, Map<string, 'click' | 'threshold' | 'predicted'>, CommitCounts>({
    ...createPairCommitHistoryOptions(
      () => pairSelectionStates,
      () => pairSelectionSources,
      restorePairSelectionStates
    ),
    calculateCounts: calculateCommitCounts,
    getFeatureIds: () => selectedFeatureIds,
    onCommitCreated: (commit) => {
      // Get current state to preserve histogram and cluster pairs
      const state = useVisualizationStore.getState()
      const currentTagState = state.tagAutomaticState
      const existingCommit = state.stage1FinalCommit
      const isRevisiting = state.isRevisitingStage1

      // Determine histogram state: use current if available, otherwise preserve existing when revisiting
      const histogramState = (currentTagState && currentTagState.mode === 'pair' && currentTagState.histogramData)
        ? {
            histogramData: currentTagState.histogramData,
            selectThreshold: currentTagState.selectThreshold,
            rejectThreshold: currentTagState.rejectThreshold,
            flipTracking: currentTagState.flipTracking ?? null
          }
        : (isRevisiting ? existingCommit?.histogramState : undefined)

      // Determine cluster pairs state: use current if available, otherwise preserve existing when revisiting
      const clusterPairsState = (state.allClusterPairs && state.clusterGroups)
        ? {
            allClusterPairs: state.allClusterPairs,
            clusterGroups: state.clusterGroups,
            clusteringThreshold: clusteringThreshold
          }
        : (isRevisiting ? existingCommit?.clusterPairsState : undefined)

      // Save to global store for Stage 1 revisit
      setStage1FinalCommit({
        pairSelectionStates: new Map(commit.states),
        pairSelectionSources: new Map(commit.sources),
        featureIds: commit.featureIds || new Set(),
        counts: commit.counts || { fragmented: 0, monosemantic: 0, unsure: 0, total: 0 },
        histogramState,
        clusterPairsState
      })
    },
    // Store sync - handles all store synchronization automatically
    storeSync,
    selectionStates: pairSelectionStates,
    selectionSources: pairSelectionSources
  })

  // Filter tableData to only include selected features
  const filteredTableData = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) {
      return null
    }

    const filteredFeatures = tableData.features.filter((row: FeatureTableRow) => selectedFeatureIds.has(row.feature_id))

    return {
      rows: filteredFeatures
    }
  }, [tableData, selectedFeatureIds])

  // Clear cluster groups when threshold or selected features change
  // Skip clearing when revisiting Stage 1 - we want to preserve restored data
  useEffect(() => {
    // Read stage1FinalCommit directly from store to avoid triggering on commit save
    const currentCommit = useVisualizationStore.getState().stage1FinalCommit

    // Skip clearing when revisiting Stage 1 with saved cluster pairs state
    if (isRevisitingStage1 && currentCommit?.clusterPairsState) {
      return
    }
    if (clusterGroups) {
      clearDistributedPairs()
    }
    // NOTE: clearDistributedPairs and clusterGroups NOT in dependencies to avoid triggering on clear
    // NOTE: stage1FinalCommit is read directly from store to avoid triggering on commit save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterThreshold, selectedFeatureIds, isRevisitingStage1])

  // Initialize stage1FinalCommit with initial state when first entering Stage 1
  // This ensures we can restore even if user does nothing and moves to Stage 2
  useEffect(() => {
    // Only initialize when: not revisiting, no saved commit yet, and we have features
    if (!isRevisitingStage1 && !stage1FinalCommit && selectedFeatureIds && selectedFeatureIds.size > 0) {
      console.log('[FeatureSplitView] Initializing Stage 1 commit with initial state:', selectedFeatureIds.size, 'features')
      setStage1FinalCommit({
        pairSelectionStates: new Map(),
        pairSelectionSources: new Map(),
        featureIds: new Set(selectedFeatureIds),
        counts: { fragmented: 0, monosemantic: 0, unsure: selectedFeatureIds.size, total: selectedFeatureIds.size }
      })
    }
  }, [isRevisitingStage1, stage1FinalCommit, selectedFeatureIds, setStage1FinalCommit])

  // Restore cluster pairs and histogram state when revisiting Stage 1
  useEffect(() => {
    if (isRevisitingStage1 && stage1FinalCommit) {
      // Restore cluster pairs FIRST (before histogram, so counts are correct)
      if (stage1FinalCommit.clusterPairsState) {
        const { allClusterPairs, clusterGroups } = stage1FinalCommit.clusterPairsState
        useVisualizationStore.setState({
          allClusterPairs,
          clusterGroups
        })
      }

      // Restore histogram state (including flipTracking for convergence indicator)
      if (stage1FinalCommit.histogramState) {
        const { histogramData, selectThreshold, rejectThreshold, flipTracking } = stage1FinalCommit.histogramState
        console.log('[FeatureSplitView] 🔄 Restoring histogram state from stage1FinalCommit:', {
          hasHistogramData: !!histogramData,
          selectThreshold,
          rejectThreshold,
          flipTracking,
          flipHistoryLength: flipTracking?.flipHistory?.length
        })
        if (histogramData) {
          useVisualizationStore.setState({
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
              flipTracking: flipTracking ?? null,
              committeeVotes: null
            }
          })
        }
      }
    }
  }, [isRevisitingStage1, stage1FinalCommit])

  // Fetch ALL cluster pairs when features change or when groups are cleared (Simplified Flow)
  // Skip if revisiting with saved cluster pairs state
  useEffect(() => {
    // Read stage1FinalCommit directly from store to avoid triggering on commit save
    const currentCommit = useVisualizationStore.getState().stage1FinalCommit

    // Skip fetch when revisiting Stage 1 - cluster pairs are restored from commit
    if (isRevisitingStage1 && currentCommit?.clusterPairsState) {
      return
    }

    if (selectedFeatureIds && selectedFeatureIds.size > 0 && !clusterGroups && !isLoadingDistributedPairs) {
      const featureIdsArray = Array.from(selectedFeatureIds)
      fetchAllClusterPairs(featureIdsArray, clusteringThreshold)
    }
    // NOTE: clusterGroups IS in dependencies to fetch after clearing
    // NOTE: isLoadingDistributedPairs NOT in dependencies to avoid infinite loop
    // NOTE: clusterThreshold IS in dependencies to refetch when threshold changes
    // NOTE: stage1FinalCommit is read directly from store to avoid triggering on commit save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeatureIds, clusterGroups, clusterThreshold, clusteringThreshold, fetchAllClusterPairs, isRevisitingStage1])

  // Clear cluster groups on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Build raw pair list from ALL cluster pairs (no sorting - sorting handled by hook)
  const rawPairList = useMemo(() => {
    if (!filteredTableData || !selectedFeatureIds || !allClusterPairs || allClusterPairs.length === 0) {
      return []
    }

    // Build row map for metadata lookup
    const rowMap = new Map<number, FeatureTableRow>()
    filteredTableData.rows.forEach((row: FeatureTableRow) => {
      rowMap.set(row.feature_id, row)
    })

    // Convert ALL cluster pairs to pair objects with full metadata
    return allClusterPairs
      .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
      .map(p => {
        const mainRow = rowMap.get(p.main_id) || null
        const similarRow = rowMap.get(p.similar_id) || null

        // Try to find decoder similarity if available
        let decoderSimilarity: number | null = null
        if (mainRow?.decoder_similarity) {
          const similarData = mainRow.decoder_similarity.find(d => d.feature_id === p.similar_id)
          if (similarData) {
            decoderSimilarity = similarData.cosine_similarity
          }
        }

        return {
          mainFeatureId: p.main_id,
          similarFeatureId: p.similar_id,
          pairKey: p.pair_key,
          clusterId: p.cluster_id,
          row: mainRow,
          similarRow: similarRow,
          decoderSimilarity
        }
      })
  }, [filteredTableData, allClusterPairs, selectedFeatureIds])

  // Fetch diversity pair IDs (cluster medoids) for diversity sort
  // Uses store cache to prevent refetch when navigating between views
  useEffect(() => {
    const fetchDiversityIds = async () => {
      if (!selectedFeatureIds || selectedFeatureIds.size < 6) {
        if (diversityPairIds.size > 0) {
          setStage1DiversityCache(new Set(), '')
        }
        return
      }

      // Compute cache signature: "featureCount:threshold"
      const signature = `${selectedFeatureIds.size}:${clusteringThreshold.toFixed(3)}`

      // Check if cache is valid
      if (stage1DiversitySignature === signature && diversityPairIds.size > 0) {
        console.log('[FeatureSplitView] Using cached diversity IDs:', diversityPairIds.size)
        return
      }

      try {
        console.log('[FeatureSplitView] Fetching diversity IDs (signature:', signature, ')')
        const response = await api.getColdStartSuggestions(
          'pair',
          Array.from(selectedFeatureIds),
          20,  // Get 20 diverse pairs via Kennard-Stone
          clusteringThreshold
        )
        const newIds = new Set(response.suggestions.map(s => s.id))
        setStage1DiversityCache(newIds, signature)
      } catch (error) {
        console.error('[FeatureSplitView] Failed to fetch diversity IDs:', error)
        setStage1DiversityCache(new Set(), '')
      }
    }

    fetchDiversityIds()
  }, [selectedFeatureIds, clusteringThreshold, stage1DiversitySignature, diversityPairIds.size, setStage1DiversityCache])

  // Use sortable list hook for sorting logic
  // Initial: diversity mode (show medoids first) - helps users tag diverse samples
  // Template: decisionMargin mode + ascending (least confident first) - used when SVM is trained
  const {
    sortMode,
    setSortMode,
    sortDirection,
    setSortDirection,
    sortedItems: pairList,
    columnHeaderProps,
    getDisplayScore,
    isTemplateSort
  } = useSortableList({
    items: rawPairList,
    getItemKey: (p: typeof rawPairList[0]) => p.pairKey,
    getDefaultScore: (p: typeof rawPairList[0]) => p.decoderSimilarity,
    decisionMarginScores: pairSimilarityScores,
    diversityIds: diversityPairIds,
    defaultLabel: 'Decoder sim',
    defaultDirection: 'desc',
    templateMode: 'decisionMargin',
    templateDirection: 'asc',
    initialMode: 'diversity',
    initialDirection: 'asc'
  })

  // Derive stage state from sort mode/direction (for StageAccordionList)
  const { activeStage, bootstrapMode, bootstrapDirection } = useMemo(() => {
    return sortConfigToStage(sortMode, sortDirection)
  }, [sortMode, sortDirection])

  // Handlers for stage changes (StageAccordionList callbacks)
  const handleStageChange = useCallback((stage: ActiveStage) => {
    const { sortMode: newMode, sortDirection: newDir } = stageToSortConfig(stage, bootstrapMode, bootstrapDirection)
    setSortMode(newMode)
    setSortDirection(newDir)
    setCurrentPairIndex(0)
    setActiveListSource('all')
    setSelectedPairKeyState(null)  // Reset stored state on manual stage change
  }, [bootstrapMode, bootstrapDirection, setSortMode, setSortDirection, setActiveListSource])

  const handleBootstrapModeChange = useCallback((mode: BootstrapMode) => {
    const { sortMode: newMode, sortDirection: newDir } = stageToSortConfig('bootstrap', mode, bootstrapDirection)
    setSortMode(newMode)
    setSortDirection(newDir)
    setCurrentPairIndex(0)
    setActiveListSource('all')
  }, [bootstrapDirection, setSortMode, setSortDirection, setActiveListSource])

  const handleBootstrapDirectionChange = useCallback((direction: 'asc' | 'desc') => {
    if (bootstrapMode === 'byScore') {
      setSortDirection(direction)
      setCurrentPairIndex(0)
      setActiveListSource('all')
    }
  }, [bootstrapMode, setSortDirection, setActiveListSource])

  // Combined handler for bootstrap option cycling - receives both mode and direction together
  const handleBootstrapOptionChange = useCallback((mode: BootstrapMode, direction?: 'asc' | 'desc') => {
    if (mode === 'diversity') {
      setSortMode('diversity')
    } else {
      setSortMode('default')
      if (direction) setSortDirection(direction)
    }
    setCurrentPairIndex(0)
    setActiveListSource('all')
  }, [setSortMode, setSortDirection, setActiveListSource])

  // Filter pairs based on hideTagged toggle
  const displayPairList = useMemo(() => {
    if (!hideTagged) return pairList
    return pairList.filter(pair => !pairSelectionStates.has(pair.pairKey))
  }, [pairList, hideTagged, pairSelectionStates])

  // Extract pair keys from displayPairList for scroll hook
  const sortedFilteredPairKeys = useMemo(() => {
    return displayPairList.map(p => p.pairKey)
  }, [displayPairList])

  // Main list scroll hook - scroll to item when clicked in subviews
  const { scrollTargetIndex, scrollToItemInMainList } = useMainListScroll({
    sortedFilteredList: sortedFilteredPairKeys,
    sortMode,
    setSortMode,
    setSortDirection: setSortDirection,
  })

  // Reset to first pair when hideTagged changes (to avoid index out of bounds)
  const prevHideTaggedRef = useRef(hideTagged)
  useEffect(() => {
    if (prevHideTaggedRef.current !== hideTagged) {
      setCurrentPairIndex(0)
      setActiveListSource('all')
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged, setActiveListSource])

  // Reset to first item when sort mode or direction changes
  // This ensures the selection indicator points to a valid item after re-sorting
  const prevSortRef = useRef({ sortMode, sortDirection })
  useEffect(() => {
    if (prevSortRef.current.sortMode !== sortMode || prevSortRef.current.sortDirection !== sortDirection) {
      setCurrentPairIndex(0)
      setActiveListSource('all')
      prevSortRef.current = { sortMode, sortDirection }
    }
  }, [sortMode, sortDirection, setActiveListSource])

  // Pre-fetch activation examples for visible pairs
  useEffect(() => {
    if (displayPairList.length === 0) return

    // Fetch for current pair and a few nearby pairs for smoother navigation
    const startIdx = Math.max(0, currentPairIndex - 2)
    const endIdx = Math.min(displayPairList.length, currentPairIndex + 5)
    const nearbyPairs = displayPairList.slice(startIdx, endIdx)

    const featureIds = new Set<number>()
    nearbyPairs.forEach(pair => {
      featureIds.add(pair.mainFeatureId)
      featureIds.add(pair.similarFeatureId)
    })

    fetchActivationExamples(Array.from(featureIds))
  }, [displayPairList, currentPairIndex, fetchActivationExamples])

  // Auto-populate similarity scores when pair list is ready or selection states change
  useEffect(() => {
    // Skip if already loading to prevent duplicate API calls
    if (isPairSimilaritySortLoading) {
      return
    }

    // Extract user-confirmed selections to compute signature
    const currentSelectedKeys: string[] = []
    const currentRejectedKeys: string[] = []
    pairSelectionStates.forEach((state, pairKey) => {
      const source = pairSelectionSources.get(pairKey)
      if (isUserConfirmed(source)) {
        if (state === 'selected') currentSelectedKeys.push(pairKey)
        else if (state === 'rejected') currentRejectedKeys.push(pairKey)
      }
    })

    const hasRequiredSelections = currentSelectedKeys.length >= 3 && currentRejectedKeys.length >= 3

    // Compute current signature to detect if scores are stale
    const currentSignature = `selected:${currentSelectedKeys.sort().join(',')}|rejected:${currentRejectedKeys.sort().join(',')}`
    const scoresAreStale = lastPairSortedSelectionSignature !== currentSignature

    // Only compute scores if signature changed (not just because scores are empty)
    // This prevents infinite loop when API returns 0 scores - we don't want to retry
    const needsScores = scoresAreStale && pairList.length > 0

    if (hasRequiredSelections && needsScores) {
      const allPairKeys = rawPairList.map(p => p.pairKey)

      // Skip if all pairs are already tagged - no point in re-computing similarity
      if (pairSelectionStates.size >= allPairKeys.length) {
        console.log('[FeatureSplitView] Skipping similarity sort - all', allPairKeys.length, 'pairs already tagged')
        return
      }

      console.log('[FeatureSplitView] Computing similarity scores for', allPairKeys.length, 'pairs (stale:', scoresAreStale, ')')
      sortPairsBySimilarity(allPairKeys)
    }
  }, [pairList, rawPairList, pairSelectionStates, pairSelectionSources, lastPairSortedSelectionSignature, isPairSimilaritySortLoading, sortPairsBySimilarity])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  // Boundary items type (same as pairList for FeatureSplitPairViewer compatibility)
  type PairWithMetadata = {
    mainFeatureId: number
    similarFeatureId: number
    pairKey: string
    clusterId: number
    row: FeatureTableRow | null
    similarRow: FeatureTableRow | null
    decoderSimilarity: number | null
  }

  // Keep previous boundary items during histogram reload to prevent double updates
  const prevBoundaryItemsRef = useRef<{ rejectBelow: PairWithMetadata[], selectAbove: PairWithMetadata[] }>({ rejectBelow: [], selectAbove: [] })

  const boundaryItems = useMemo(() => {
    // Don't show anything until histogram is actually fetched
    // histogramData is null before first fetch and during reload
    if (!tagAutomaticState?.histogramData) {
      // During reload (after initial fetch), return previous values to prevent flicker
      if (prevBoundaryItemsRef.current.rejectBelow.length > 0 || prevBoundaryItemsRef.current.selectAbove.length > 0) {
        return prevBoundaryItemsRef.current
      }
      // Before first fetch, return empty lists
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

    // Extract threshold values inside useMemo for proper React reactivity
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? 0.3

    // Build ALL pairs from allClusterPairs with FULL metadata for FeatureSplitPairViewer
    let allPairs: PairWithMetadata[] = []

    if (allClusterPairs && filteredTableData?.rows && selectedFeatureIds) {
      // Build row map
      const rowMap = new Map<number, FeatureTableRow>()
      filteredTableData.rows.forEach((row: FeatureTableRow) => {
        rowMap.set(row.feature_id, row)
      })

      // Convert all cluster pairs to pair objects with full metadata
      allPairs = allClusterPairs
        .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
        .map(p => {
          const mainRow = rowMap.get(p.main_id) || null
          const similarRow = rowMap.get(p.similar_id) || null

          // Try to find decoder similarity if available
          let decoderSimilarity: number | null = null
          if (mainRow?.decoder_similarity) {
            const similarData = mainRow.decoder_similarity.find(d => d.feature_id === p.similar_id)
            if (similarData) {
              decoderSimilarity = similarData.cosine_similarity
            }
          }

          return {
            mainFeatureId: p.main_id,
            similarFeatureId: p.similar_id,
            pairKey: p.pair_key,
            clusterId: p.cluster_id,
            row: mainRow,
            similarRow: similarRow,
            decoderSimilarity
          }
        })
    } else if (rawPairList.length > 0) {
      // Fallback: use raw pairs (not filtered by diversity mode)
      allPairs = rawPairList
    }

    if (allPairs.length === 0) {
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

    // Use threshold values from above
    const thresholds = {
      select: selectThreshold,
      reject: rejectThreshold
    }

    // Filter pairs that have SVM similarity scores (from pairSimilarityScores Map)
    const pairsWithScores = allPairs.filter(pair => pairSimilarityScores.has(pair.pairKey))

    if (pairsWithScores.length === 0) {
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

    // REJECT THRESHOLD - Below reject: all pairs < rejectThreshold, sorted descending (highest first), closest to threshold
    const rejectBelow = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! < thresholds.reject)
      .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!) // Descending: closest to threshold first

    // SELECT THRESHOLD - Above select: all pairs >= selectThreshold, sorted ascending (lowest first), closest to threshold
    const selectAbove = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= thresholds.select)
      .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!) // Ascending: closest to threshold first

    const result = { rejectBelow, selectAbove }
    // Store in ref for use during histogram reload
    prevBoundaryItemsRef.current = result
    return result
  }, [rawPairList, tagAutomaticState, pairSimilarityScores, allClusterPairs, filteredTableData, selectedFeatureIds])

  // Create Sets of preview pair keys (items in threshold regions that will be auto-tagged)
  // Separate sets to know which direction they'll be tagged
  const previewRejectKeys = useMemo(() => {
    const keys = new Set<string>()
    boundaryItems.rejectBelow.forEach(p => keys.add(p.pairKey))
    return keys
  }, [boundaryItems.rejectBelow])

  const previewSelectKeys = useMemo(() => {
    const keys = new Set<string>()
    boundaryItems.selectAbove.forEach(p => keys.add(p.pairKey))
    return keys
  }, [boundaryItems.selectAbove])

  // Get tag color for header badge
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'

  // ============================================================================
  // ACTIVE PAIR LIST - Determines which list the viewer shows
  // ============================================================================

  // Active pair list depends on which list is selected
  const activePairList = useMemo(() => {
    switch (activeListSource) {
      case 'reject':
        return boundaryItems.rejectBelow
      case 'select':
        return boundaryItems.selectAbove
      default:
        return displayPairList
    }
  }, [activeListSource, displayPairList, boundaryItems])

  // Compute selected pair key - prefer stored state, fallback to index-based
  // This is the source of truth for which pair is selected
  const selectedPairKey = useMemo(() => {
    // Prefer stored state when available (survives mode switches)
    if (selectedPairKeyState !== null) {
      return selectedPairKeyState
    }
    // Fallback to index-based selection
    const pair = activePairList[currentPairIndex]
    return pair?.pairKey ?? null
  }, [selectedPairKeyState, activePairList, currentPairIndex])

  // Sync currentPairIndex when lists change (after mode switch)
  // This keeps the index pointing to the stored selected item
  useEffect(() => {
    if (selectedPairKeyState === null) return

    // Find the stored item in the current active list
    const newIndex = activePairList.findIndex(p => p.pairKey === selectedPairKeyState)
    if (newIndex !== -1 && newIndex !== currentPairIndex) {
      setCurrentPairIndex(newIndex)
    }
  }, [selectedPairKeyState, activePairList, currentPairIndex])

  // Compute highlight index for main list (always show where selected pair is)
  const mainListHighlightIndex = useMemo(() => {
    if (selectedPairKey === null) return -1
    return displayPairList.findIndex(p => p.pairKey === selectedPairKey)
  }, [selectedPairKey, displayPairList])

  // Compute highlight index for left boundary list (reject/Monosemantic)
  const leftBoundaryHighlightIndex = useMemo(() => {
    if (selectedPairKey === null) return -1
    return boundaryItems.rejectBelow.findIndex(p => p.pairKey === selectedPairKey)
  }, [selectedPairKey, boundaryItems.rejectBelow])

  // Compute highlight index for right boundary list (select/Fragmented)
  const rightBoundaryHighlightIndex = useMemo(() => {
    if (selectedPairKey === null) return -1
    return boundaryItems.selectAbove.findIndex(p => p.pairKey === selectedPairKey)
  }, [selectedPairKey, boundaryItems.selectAbove])

  // Effect: Auto-switch from diversity mode when selected pair is not visible in main list
  // This ensures the highlight always appears when a pair is selected from subviews
  useEffect(() => {
    if (selectedPairKey === null || sortMode !== 'diversity') return

    const indexInMainList = mainListHighlightIndex
    if (indexInMainList === -1) {
      // Selected pair not visible in medoids list, switch to Learn mode
      setSortMode('decisionMargin')
      setSortDirection('asc')
    }
  }, [selectedPairKey, sortMode, mainListHighlightIndex, setSortMode, setSortDirection])

  // Fetch activation examples for current pair when it changes
  useEffect(() => {
    const currentPair = activePairList[currentPairIndex]
    if (currentPair) {
      fetchActivationExamples([currentPair.mainFeatureId, currentPair.similarFeatureId])
    }
  }, [activePairList, currentPairIndex, fetchActivationExamples])

  // Track visited representative pairs for smart pulsing
  useEffect(() => {
    if (bootstrapMode === 'diversity' && activePairList.length > 0) {
      const pair = activePairList[currentPairIndex]
      if (pair && diversityPairIds.has(pair.pairKey)) {
        setVisitedRepIds(prev => {
          if (prev.has(pair.pairKey)) return prev
          return new Set([...prev, pair.pairKey])
        })
      }
    }
  }, [currentPairIndex, activePairList, diversityPairIds, bootstrapMode])

  // Calculate if most reps visited (>80%)
  const hasVisitedMostReps = useMemo(() => {
    return diversityPairIds.size > 0 && visitedRepIds.size >= diversityPairIds.size
  }, [diversityPairIds, visitedRepIds])

  // Check if flip rate stable (last 5 iterations all < 3%)
  const isFlipRateStable = useMemo(() => {
    const history = tagAutomaticState?.flipTracking?.flipHistory
    if (!history || history.length < 5) return false
    const last5 = history.slice(-5)
    return last5.every(h => h.flipRate < 0.03)
  }, [tagAutomaticState?.flipTracking?.flipHistory])

  // ============================================================================
  // CLICK HANDLERS FOR ALL THREE LISTS
  // ============================================================================

  // All Pairs list click handler
  const handleAllPairsListClick = useCallback((index: number) => {
    if (index >= 0 && index < displayPairList.length) {
      // Set pair key first (survives mode switches)
      const pair = displayPairList[index]
      if (pair) {
        setSelectedPairKeyState(pair.pairKey)
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
      setActiveListSource('all')
      setCurrentPairIndex(index)
    }
  }, [displayPairList, fetchActivationExamples, setActiveListSource])

  // Unified boundary list click handler (for ThresholdTaggingPanel)
  const handleBoundaryListClick = useCallback((listType: 'left' | 'right', index: number) => {
    const items = listType === 'left' ? boundaryItems.rejectBelow : boundaryItems.selectAbove
    if (index >= 0 && index < items.length) {
      const pair = items[index]
      // Set pair key first (survives mode switches)
      setSelectedPairKeyState(pair.pairKey)
      setActiveListSource(listType === 'left' ? 'reject' : 'select')
      setCurrentPairIndex(index)
      scrollToItemInMainList(pair.pairKey)
      // Pre-fetch activation examples for clicked pair
      if (pair) {
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
    }
  }, [boundaryItems.rejectBelow, boundaryItems.selectAbove, fetchActivationExamples, setActiveListSource, scrollToItemInMainList])

  // ============================================================================
  // NAVIGATION HANDLERS - Work with active list
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setSelectedPairKeyState(null)  // Clear stored state to allow normal navigation
    setCurrentPairIndex(prev => Math.max(0, prev - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setSelectedPairKeyState(null)  // Clear stored state to allow normal navigation
    setCurrentPairIndex(prev => Math.min(activePairList.length - 1, prev + 1))
  }, [activePairList.length])

  // ============================================================================
  // APPLY TAGS HANDLER
  // ============================================================================

  // Handle Apply Tags button click
  const handleApplyTags = useCallback(() => {
    console.log('[FeatureSplitView] Apply Tags clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Apply auto-tags (effect will sync to NEW commit)
    applySimilarityTags()

    // 3. Switch to decision margin sort mode
    setSortMode('decisionMargin')

    // 4. Reset to first page/pair
    setCurrentPairIndex(0)
    setActiveListSource('all')
  }, [createCommit, applySimilarityTags, setSortMode, setActiveListSource])

  // handleCommitClick is provided by the hook

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  // Check if histogram is bimodal (enables Tag All button)
  // Uses score >= 0.5 (Level 4: Likely Bimodal or higher)
  const isBimodal = useMemo(() => {
    return isBimodalScore(tagAutomaticState?.histogramData?.bimodality)
  }, [tagAutomaticState?.histogramData?.bimodality])

  // Check if all pairs are tagged (no unsure remaining) - enables Move to Next Stage button
  const allPairsTagged = useMemo(() => {
    if (pairList.length === 0) return false
    return pairList.every(pair => pairSelectionStates.has(pair.pairKey))
  }, [pairList, pairSelectionStates])

  // Handle Tag All - Option 1: Tag all unsure as Monosemantic
  const handleTagAllMonosemantic = useCallback(() => {
    console.log('[TagAll] Monosemantic option clicked')
    console.log('[TagAll] pairList length:', pairList.length)
    console.log('[TagAll] current pairSelectionStates size:', pairSelectionStates.size)

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Build new states with all untagged pairs as rejected (Monosemantic)
    const newStates = new Map(pairSelectionStates)
    const newSources = new Map(pairSelectionSources)

    let taggedCount = 0
    pairList.forEach(pair => {
      if (!newStates.has(pair.pairKey)) {
        newStates.set(pair.pairKey, 'rejected')
        newSources.set(pair.pairKey, 'click')
        taggedCount++
      }
    })

    console.log('[TagAll] Tagged', taggedCount, 'pairs as Monosemantic')

    // 3. Apply the new states to store (effect will sync to current commit)
    restorePairSelectionStates(newStates, newSources)
  }, [pairList, pairSelectionStates, pairSelectionSources, restorePairSelectionStates, createCommit])

  // Handle Tag All - Option 2: Use SVM decision boundary (score >= 0 → Fragmented, score < 0 → Monosemantic)
  const handleTagAllByBoundary = useCallback(() => {
    console.log('[TagAll] By Decision Boundary (score=0) option clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Build new states using SVM decision boundary
    const newStates = new Map(pairSelectionStates)
    const newSources = new Map(pairSelectionSources)

    let selectedCount = 0
    let rejectedCount = 0

    // Tag all pairs using SVM similarity scores with threshold 0
    // score >= 0 → Fragmented (selected), score < 0 → Monosemantic (rejected)
    pairList.forEach(pair => {
      // Skip if already tagged
      if (newStates.has(pair.pairKey)) return

      const score = pairSimilarityScores.get(pair.pairKey)
      if (score !== undefined) {
        if (score >= 0) {
          newStates.set(pair.pairKey, 'selected')
          newSources.set(pair.pairKey, 'click')
          selectedCount++
        } else {
          newStates.set(pair.pairKey, 'rejected')
          newSources.set(pair.pairKey, 'click')
          rejectedCount++
        }
      } else {
        // No score available - default to Monosemantic (conservative)
        newStates.set(pair.pairKey, 'rejected')
        newSources.set(pair.pairKey, 'click')
        rejectedCount++
      }
    })

    console.log('[TagAll] By Decision Boundary results:', {
      fragmentedAboveZero: selectedCount,
      monosemanticBelowZero: rejectedCount,
      totalNewStates: newStates.size
    })

    // 3. Apply the new states to store (effect will sync to current commit)
    restorePairSelectionStates(newStates, newSources)
  }, [pairList, pairSelectionStates, pairSelectionSources, pairSimilarityScores, restorePairSelectionStates, createCommit])

  // Unified Tag All handler for ThresholdTaggingPanel
  const handleTagAll = useCallback((method: 'left' | 'byBoundary') => {
    if (method === 'left') {
      handleTagAllMonosemantic()
    } else {
      handleTagAllByBoundary()
    }
  }, [handleTagAllMonosemantic, handleTagAllByBoundary])

  // Render function for pair items in ScrollableItemList
  const renderPairItem = useCallback((pair: typeof rawPairList[0], index: number) => {
    const selectionState = pairSelectionStates.get(pair.pairKey) || null
    const isAutoSource = pairSelectionSources.get(pair.pairKey) === 'predicted'
    const inPreviewReject = previewRejectKeys?.has(pair.pairKey)
    const inPreviewSelect = previewSelectKeys?.has(pair.pairKey)

    // Determine tag name based on selection state OR preview state
    let tagName = 'Unsure'
    if (selectionState === 'selected') {
      tagName = 'Fragmented'
    } else if (selectionState === 'rejected') {
      tagName = 'Monosemantic'
    } else if (inPreviewSelect) {
      tagName = 'Fragmented'
    } else if (inPreviewReject) {
      tagName = 'Monosemantic'
    }

    // Format pair ID as string for TagBadge
    const pairIdString = `${pair.mainFeatureId}-${pair.similarFeatureId}`

    // Show stripe for: already auto-tagged OR in preview threshold regions
    const isAutoOrPreview = isAutoSource || inPreviewReject || inPreviewSelect

    return (
      <TagBadge
        featureId={pairIdString}
        tagName={tagName}
        tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
        onClick={() => handleAllPairsListClick(index)}
        fullWidth={true}
        isPair={true}
        isAuto={isAutoOrPreview}
      />
    )
  }, [pairSelectionStates, pairSelectionSources, previewRejectKeys, previewSelectKeys, handleAllPairsListClick])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`feature-split-view ${className}`}>
      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Feature Splitting Detection</span>
        <span className="view-description">
          Compare activation examples of two features and identify{' '}
          <span
            className="view-tag-badge"
            style={{ backgroundColor: fragmentedColor }}
          >
            Fragmented
          </span>
          {' '}pair that represents the same concept.
        </span>
      </div>

      {/* Body: Main column + Next Stage column */}
      <div className="feature-split-view__body">
        {/* Main column: Content rows */}
        <div className="feature-split-view__main">
          {/* Content: 2 rows */}
          <div className="feature-split-view__content">
          {/* Top row: StageAccordionList + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
            <StageAccordionList
              variant="allPairs"
              activeStage={activeStage}
              onStageChange={handleStageChange}
              bootstrapMode={bootstrapMode}
              bootstrapDirection={bootstrapDirection}
              onBootstrapModeChange={handleBootstrapModeChange}
              onBootstrapDirectionChange={handleBootstrapDirectionChange}
              onBootstrapOptionChange={handleBootstrapOptionChange}
              hasDiversityIds={diversityPairIds.size > 0}
              learnDisabled={!tagAutomaticState?.histogramData}
              applyDisabled={!tagAutomaticState?.histogramData}
              shouldPulseLearn={hasVisitedMostReps}
              shouldPulseApply={isFlipRateStable}
              diversityLabel={`Most Critical ${diversityPairIds.size}`}
              byScoreAscLabel="Least Similar First"
              byScoreDescLabel="Most Similar First"
              hideTagged={hideTagged}
              onHideTaggedChange={setHideTagged}
              badges={[{
                label: diversityPairIds.size > 0 && !svmTrainingStarted
                  ? 'Most Critical Pairs'
                  : hideTagged
                    ? 'Untagged Pairs'
                    : 'All Pairs',
                count: displayPairList.length
              }]}
              columnHeader={columnHeaderProps}
              items={displayPairList}
              renderItem={renderPairItem}
              sortConfig={{ getDisplayScore }}
              currentIndex={mainListHighlightIndex}
              isActive={activeListSource === 'all'}
              scrollTargetIndex={scrollTargetIndex}
            />
          <FeatureSplitPairViewer
            currentPairIndex={currentPairIndex}
            pairList={activePairList}
            onNavigatePrevious={handleNavigatePrevious}
            onNavigateNext={handleNavigateNext}
            activeListSource={activeListSource}
            sortMode={sortMode}
            isLoading={isPairSimilaritySortLoading}
            isTemplateSort={isTemplateSort}
            onResetToFirstPair={() => {
              setSelectedPairKeyState(null)  // Clear stored state to allow normal navigation
              setCurrentPairIndex(0)
              setActiveListSource('all')
            }}
            hideTagged={hideTagged}
          />
        </div>

        {/* Bottom row: Histogram + Apply Tags button + Monosemantic list + Fragmented list */}
        <ThresholdTaggingPanel
          mode="pair"
          tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
          leftItems={boundaryItems.rejectBelow}
          rightItems={boundaryItems.selectAbove}
          leftListLabel="Monosemantic"
          rightListLabel="Fragmented"
          histogramProps={{
            availablePairs: rawPairList,
            filteredFeatureIds: selectedFeatureIds || undefined,
            threshold: clusteringThreshold
          }}
          onApplyTags={handleApplyTags}
          onTagAll={handleTagAll}
          onListItemClick={handleBoundaryListClick}
          activeListSource={activeListSource}
          currentIndex={currentPairIndex}
          leftHighlightIndex={leftBoundaryHighlightIndex}
          rightHighlightIndex={rightBoundaryHighlightIndex}
          isBimodal={isBimodal}
          isTemplateSort={isTemplateSort}
          sortDirection={sortMode === 'decisionMargin' ? sortDirection : 'asc'}
        />
          </div>
        </div>

        {/* Right column: Next Stage - spans full height including StatusPanel */}
        <div className="next-stage-column">
          <button
            className="action-button action-button--next"
            onClick={moveToNextStep}
            disabled={!allPairsTagged}
            title={allPairsTagged ? 'Proceed to Stage 2: Quality' : `Tag all pairs first (${pairSelectionStates.size}/${pairList.length})`}
          >
            Move to Stage 2 Quality ↑
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitView)
