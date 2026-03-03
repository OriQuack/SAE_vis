import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore, type CommitCounts } from '../store/index'
import type { FeatureTableRow, FlipTrackingInfo } from '../types'
import * as api from '../api'
import FeatureSplitPairViewer from './FeatureSplitPairViewer'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import StageAccordionList from './StageAccordionList'
import { TagBadge, DisagreementIndicator } from './Indicators'
import { useSortableList, type ActiveStage, type BootstrapMode } from '../lib/tagging-hooks/useSortableList'
import { useCommitHistory, createPairCommitHistoryOptions, type DisplayCommit, isUserConfirmed, useMainListScroll } from '../lib/tagging-hooks'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { logAction, createDebouncedLogger } from '../lib/action-logger'
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

  // Show only QBC disagreement items toggle
  const [showDisagreementOnly, setShowDisagreementOnly] = useState(false)

  // Store selected pair key directly to preserve highlight across mode switches
  const [selectedPairKeyState, setSelectedPairKeyState] = useState<string | null>(null)

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
      return stage1FinalCommit.featureIds
    }

    // These dependencies trigger recalculation when Sankey selection changes
    void sankeyStructure
    void selectedSegment
    void tableSelectedNodeIds
    const features = getSelectedNodeFeatures()
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage1, stage1FinalCommit])

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

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<string, 'selected' | 'rejected'>; sources: Map<string, 'click' | 'threshold' | 'predicted'>; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }>) => {
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
    getFlipTracking: () => useVisualizationStore.getState().tagAutomaticState?.flipTracking ?? null,
    restoreFlipTracking: (ft) => {
      const state = useVisualizationStore.getState()
      if (state.tagAutomaticState) {
        useVisualizationStore.setState({
          tagAutomaticState: { ...state.tagAutomaticState, flipTracking: ft }
        })
      }
    },
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
              tagLabel: 'Incoherent Splitting',
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
        return
      }

      try {
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
    defaultLabel: 'Decoder Similarity',
    defaultDirection: 'desc',
    templateMode: 'decisionMargin',
    templateDirection: 'asc',
    initialMode: 'diversity',
    initialDirection: 'asc'
  })

  // Independent stage state (decoupled from sort mode)
  const [activeStage, setActiveStage] = useState<ActiveStage>('bootstrap')

  // Derive bootstrapMode from sortMode (for StageAccordionList display)
  const bootstrapMode: BootstrapMode = sortMode === 'diversity' ? 'diversity' : 'byScore'

  // Auto-enable filters when entering Apply phase, reset when leaving
  const setWorkflowActiveStage = useVisualizationStore(state => state.setWorkflowActiveStage)
  useEffect(() => {
    setWorkflowActiveStage(activeStage)
    if (activeStage === 'apply') {
      setHideTagged(true)
    } else {
      setHideTagged(false)
    }
  }, [activeStage, setWorkflowActiveStage])

  // Handlers for stage changes
  const handleStageChange = useCallback((stage: ActiveStage) => {
    logAction('stage1', 'stage_change', { stage })
    setActiveStage(stage)
    if (stage === 'learn') {
      setSortMode('decisionMargin')
      setSortDirection('asc')
    } else if (stage === 'apply') {
      setSortMode('decisionMargin')
      setSortDirection('desc')
    }
    setCurrentPairIndex(0)
    setSelectedPairKeyState(null)
  }, [setSortMode, setSortDirection])

  // Bootstrap option cycling handler
  const handleBootstrapOptionChange = useCallback((mode: BootstrapMode) => {
    logAction('stage1', 'bootstrap_mode', { mode })
    if (mode === 'diversity') {
      setSortMode('diversity')
    } else {
      setSortMode('default')
      // Set default direction for Similarity: desc (highest similarity first)
      setSortDirection('desc')
    }
    setCurrentPairIndex(0)
  }, [setSortMode, setSortDirection])

  // Memoized QBC disagreement lookup - flags only when SVM loses the majority vote (both RF+MLP disagree)
  const disagreementLookup = useMemo(() => {
    const lookup = new Map<string, { isDisagreement: boolean; tooltipText: string }>()
    const votes = tagAutomaticState?.committeeVotes
    if (!votes) return lookup
    votes.forEach((info, key) => {
      if (info.rf_prediction !== info.svm_prediction && info.mlp_prediction !== info.svm_prediction) {
        const majorityLabel = info.rf_prediction === 1 ? 'Selected' : 'Rejected'
        lookup.set(key, {
          isDisagreement: true,
          tooltipText: `SVM: ${info.svm_prediction === 1 ? 'Selected' : 'Rejected'}\nMajority (RF+MLP): ${majorityLabel}\nEntropy: ${info.vote_entropy.toFixed(3)}`
        })
      }
    })
    return lookup
  }, [tagAutomaticState?.committeeVotes])

  const disagreementKeys = useMemo(() => new Set(disagreementLookup.keys()), [disagreementLookup])

  // Filter pairs based on hideTagged, showDisagreementOnly, and Apply-phase thresholds
  const displayPairList = useMemo(() => {
    return pairList.filter(pair => {
      if (hideTagged && pairSelectionStates.has(pair.pairKey)) return false
      if (showDisagreementOnly && !disagreementKeys.has(pair.pairKey)) return false
      // In Apply phase, only show items past thresholds
      if (activeStage === 'apply' && tagAutomaticState?.histogramData) {
        const score = pairSimilarityScores.get(pair.pairKey)
        if (score === undefined) return false
        const reject = tagAutomaticState.rejectThreshold ?? -0.8
        const select = tagAutomaticState.selectThreshold ?? 0.8
        if (score >= reject && score < select) return false
      }
      return true
    })
  }, [pairList, hideTagged, pairSelectionStates, showDisagreementOnly, disagreementKeys,
      activeStage, tagAutomaticState?.histogramData, tagAutomaticState?.rejectThreshold, tagAutomaticState?.selectThreshold, pairSimilarityScores])

  // Extract pair keys from displayPairList for scroll hook
  const sortedFilteredPairKeys = useMemo(() => {
    return displayPairList.map(p => p.pairKey)
  }, [displayPairList])

  // Main list scroll hook - scroll to item when clicked in subviews
  const { scrollTargetIndex } = useMainListScroll({
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
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged])

  // Reset to first item when sort mode or direction changes
  // This ensures the selection indicator points to a valid item after re-sorting
  const prevSortRef = useRef({ sortMode, sortDirection })
  useEffect(() => {
    if (prevSortRef.current.sortMode !== sortMode || prevSortRef.current.sortDirection !== sortDirection) {
      setCurrentPairIndex(0)
      prevSortRef.current = { sortMode, sortDirection }
    }
  }, [sortMode, sortDirection])

  // Pre-fetch activating examples for visible pairs
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
        return
      }

      sortPairsBySimilarity(allPairKeys)
    }
  }, [pairList, rawPairList, pairSelectionStates, pairSelectionSources, lastPairSortedSelectionSignature, isPairSimilaritySortLoading, sortPairsBySimilarity])

  // ============================================================================
  // PREVIEW KEYS - Items past threshold handles that will be auto-tagged
  // ============================================================================

  const previewRejectKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!tagAutomaticState?.histogramData || activeStage !== 'apply') return keys
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8
    rawPairList.forEach(p => {
      const score = pairSimilarityScores.get(p.pairKey)
      if (score !== undefined && score < rejectThreshold) keys.add(p.pairKey)
    })
    return keys
  }, [rawPairList, pairSimilarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.rejectThreshold, activeStage])

  const previewSelectKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!tagAutomaticState?.histogramData || activeStage !== 'apply') return keys
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    rawPairList.forEach(p => {
      const score = pairSimilarityScores.get(p.pairKey)
      if (score !== undefined && score >= selectThreshold) keys.add(p.pairKey)
    })
    return keys
  }, [rawPairList, pairSimilarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.selectThreshold, activeStage])

  // Get tag color for header badge
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Incoherent Splitting') || '#F0E442'

  // Compute selected pair key - prefer stored state, fallback to index-based
  const selectedPairKey = useMemo(() => {
    if (selectedPairKeyState !== null) {
      return selectedPairKeyState
    }
    const pair = displayPairList[currentPairIndex]
    return pair?.pairKey ?? null
  }, [selectedPairKeyState, displayPairList, currentPairIndex])

  // Sync currentPairIndex when lists change (after mode switch)
  useEffect(() => {
    if (selectedPairKeyState === null) return
    const newIndex = displayPairList.findIndex(p => p.pairKey === selectedPairKeyState)
    if (newIndex !== -1 && newIndex !== currentPairIndex) {
      setCurrentPairIndex(newIndex)
    }
  }, [selectedPairKeyState, displayPairList, currentPairIndex])

  // Compute highlight index for main list
  const mainListHighlightIndex = useMemo(() => {
    if (selectedPairKey === null) return -1
    return displayPairList.findIndex(p => p.pairKey === selectedPairKey)
  }, [selectedPairKey, displayPairList])

  // Effect: Auto-switch from diversity mode when selected pair is not visible
  useEffect(() => {
    if (selectedPairKey === null || sortMode !== 'diversity') return
    if (mainListHighlightIndex === -1) {
      setSortMode('decisionMargin')
      setSortDirection('asc')
    }
  }, [selectedPairKey, sortMode, mainListHighlightIndex, setSortMode, setSortDirection])

  // Fetch activating examples for current pair when it changes
  useEffect(() => {
    const currentPair = displayPairList[currentPairIndex]
    if (currentPair) {
      fetchActivationExamples([currentPair.mainFeatureId, currentPair.similarFeatureId])
    }
  }, [displayPairList, currentPairIndex, fetchActivationExamples])

  // Track visited representative pairs for smart pulsing
  useEffect(() => {
    if (sortMode === 'diversity' && displayPairList.length > 0) {
      const pair = displayPairList[currentPairIndex]
      if (pair && diversityPairIds.has(pair.pairKey)) {
        setVisitedRepIds(prev => {
          if (prev.has(pair.pairKey)) return prev
          return new Set([...prev, pair.pairKey])
        })
      }
    }
  }, [currentPairIndex, displayPairList, diversityPairIds, sortMode])

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
  // ACTION LOGGING — useEffect-based observers
  // ============================================================================

  // #11 Threshold drag (debounced) — only fires on user drag, not on initial load
  const hasRenderedRef = useRef(false)
  const logThresholdDrag = useMemo(() => createDebouncedLogger('stage1', 'threshold_drag', 800), [])
  useEffect(() => {
    if (!hasRenderedRef.current) { hasRenderedRef.current = true; return }
    logThresholdDrag({ selectThreshold: tagAutomaticState?.selectThreshold, rejectThreshold: tagAutomaticState?.rejectThreshold })
  }, [tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold, logThresholdDrag])

  // ============================================================================
  // CLICK HANDLERS
  // ============================================================================

  // All Pairs list click handler
  const handleAllPairsListClick = useCallback((index: number) => {
    if (index >= 0 && index < displayPairList.length) {
      const pair = displayPairList[index]
      if (pair) {
        logAction('stage1', 'pair_click', { pairKey: pair.pairKey, index })
        setSelectedPairKeyState(pair.pairKey)
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
      setCurrentPairIndex(index)
    }
  }, [displayPairList, fetchActivationExamples])

  // ============================================================================
  // NAVIGATION HANDLERS - Work with active list
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    logAction('stage1', 'navigate_previous', {})
    setSelectedPairKeyState(null)
    setCurrentPairIndex(prev => Math.max(0, prev - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setSelectedPairKeyState(null)
    setCurrentPairIndex(prev => Math.min(displayPairList.length - 1, prev + 1))
  }, [displayPairList.length])

  // ============================================================================
  // APPLY TAGS HANDLER
  // ============================================================================

  // Handle Apply Tags button click
  const handleApplyTags = useCallback(() => {
    const selectTh = tagAutomaticState?.selectThreshold
    const rejectTh = tagAutomaticState?.rejectThreshold
    logAction('stage1', 'apply_tags', {
      selectThreshold: selectTh,
      rejectThreshold: rejectTh,
      previewSelectCount: previewSelectKeys.size,
      previewRejectCount: previewRejectKeys.size,
    })

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Apply auto-tags (effect will sync to NEW commit)
    applySimilarityTags()

    // 3. Switch to decision margin sort mode
    setSortMode('decisionMargin')

    // 4. Reset to first page/pair
    setCurrentPairIndex(0)
  }, [createCommit, applySimilarityTags, setSortMode, tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold, previewSelectKeys, previewRejectKeys])

  // handleCommitClick is provided by the hook

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  // Check if all pairs are tagged (no unsure remaining) - enables Move to Next Stage button
  const allPairsTagged = useMemo(() => {
    if (rawPairList.length === 0) return false
    return rawPairList.every(pair => pairSelectionStates.has(pair.pairKey))
  }, [rawPairList, pairSelectionStates])

  // Handle Tag All - Option 1: Tag all unsure as Monosemantic
  const handleTagAllMonosemantic = useCallback(() => {
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

    // 3. Log and apply the new states to store (effect will sync to current commit)
    logAction('stage1', 'tag_all_monosemantic', { count: taggedCount, totalPairs: pairList.length })
    restorePairSelectionStates(newStates, newSources)
  }, [pairList, pairSelectionStates, pairSelectionSources, restorePairSelectionStates, createCommit])

  // Handle Tag All - Option 2: Use SVM decision boundary (score >= 0 → Fragmented, score < 0 → Monosemantic)
  const handleTagAllByBoundary = useCallback(() => {
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

    // 3. Log and apply the new states to store (effect will sync to current commit)
    logAction('stage1', 'tag_all_by_boundary', { fragmentedCount: selectedCount, monosemanticCount: rejectedCount })
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
      tagName = 'Incoherent Splitting'
    } else if (selectionState === 'rejected') {
      tagName = 'Monosemantic'
    } else if (inPreviewSelect) {
      tagName = 'Incoherent Splitting'
    } else if (inPreviewReject) {
      tagName = 'Monosemantic'
    }

    // Format pair ID as string for TagBadge
    const pairIdString = `${pair.mainFeatureId}-${pair.similarFeatureId}`

    // Show stripe for: already auto-tagged OR in preview threshold regions
    const isAutoOrPreview = isAutoSource || inPreviewReject || inPreviewSelect

    const disagreementInfo = activeStage === 'apply' && !isUserConfirmed(pairSelectionSources.get(pair.pairKey)) ? disagreementLookup.get(pair.pairKey) : undefined

    return (
      <>
        {disagreementInfo && (
          <DisagreementIndicator
            isDisagreement={disagreementInfo.isDisagreement}
            tooltipText={disagreementInfo.tooltipText}
          />
        )}
        <TagBadge
          featureId={pairIdString}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
          onClick={() => handleAllPairsListClick(index)}
          fullWidth={true}
          isPair={true}
          isAuto={isAutoOrPreview}
        />
      </>
    )
  }, [pairSelectionStates, pairSelectionSources, previewRejectKeys, previewSelectKeys, handleAllPairsListClick, disagreementLookup, activeStage])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Compute loading state for content dim effect
  const isViewLoading = isLoadingDistributedPairs || isDraggingThreshold

  return (
    <div className={`feature-split-view ${className}`}>
      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Feature Splitting Detection</span>
        <span className="view-description">
          Compare activating examples of two features and identify{' '}
          <span
            className="view-tag-badge"
            style={{ backgroundColor: fragmentedColor }}
          >
            Incoherent Splitting
          </span>
          {' '}pair that represents the same concept.
        </span>
      </div>

      {/* Body: Main column + Next Stage column */}
      <div className="feature-split-view__body">
        {/* Main column: Content rows */}
        <div className="feature-split-view__main">
          {/* Content: 2 rows */}
          <div className={`feature-split-view__content ${isViewLoading ? 'content-loading' : ''}`}>
          {/* Top row: StageAccordionList + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
            <StageAccordionList
              variant="allPairs"
              activeStage={activeStage}
              onStageChange={handleStageChange}
              bootstrapMode={bootstrapMode}
              bootstrapDirection={sortDirection}
              onBootstrapModeChange={handleBootstrapOptionChange}
              onBootstrapOptionChange={handleBootstrapOptionChange}
              hasDiversityIds={diversityPairIds.size > 0}
              learnDisabled={!tagAutomaticState?.histogramData}
              applyDisabled={!tagAutomaticState?.histogramData}
              shouldPulseLearn={hasVisitedMostReps}
              shouldPulseApply={isFlipRateStable}
              diversityLabel={`Most Critical ${diversityPairIds.size}`}
              byScoreLabel="Decoder Similarity"
              hideTagged={hideTagged}
              onHideTaggedChange={(v: boolean) => { logAction('stage1', 'hide_tagged', { enabled: v }); setHideTagged(v) }}
              showDisagreementOnly={showDisagreementOnly}
              onShowDisagreementOnlyChange={(v: boolean) => { logAction('stage1', 'show_disagreement', { enabled: v }); setShowDisagreementOnly(v) }}
              hasDisagreementData={tagAutomaticState?.committeeVotes != null && tagAutomaticState.committeeVotes.size > 0}
              badges={[{
                label: showDisagreementOnly
                  ? 'Disagreement Pairs'
                  : sortMode === 'diversity'
                    ? 'Most Critical Pairs'
                    : hideTagged
                      ? 'Unlabeled Pairs'
                      : 'All Pairs',
                count: displayPairList.length
              }]}
              columnHeader={columnHeaderProps}
              items={displayPairList}
              renderItem={renderPairItem}
              sortConfig={{ getDisplayScore }}
              currentIndex={mainListHighlightIndex}
              isActive={true}
              scrollTargetIndex={scrollTargetIndex}
            />
          <FeatureSplitPairViewer
            currentPairIndex={currentPairIndex}
            pairList={displayPairList}
            onNavigatePrevious={handleNavigatePrevious}
            onNavigateNext={handleNavigateNext}
            activeListSource="all"
            sortMode={sortMode}
            isLoading={isPairSimilaritySortLoading}
            isTemplateSort={isTemplateSort}
            onResetToFirstPair={() => {
              setSelectedPairKeyState(null)
              setCurrentPairIndex(0)
            }}
            hideTagged={hideTagged}
            onClearStoredSelection={() => setSelectedPairKeyState(null)}
          />
        </div>

        {/* Bottom row: Histogram + Batch Tagging */}
        <ThresholdTaggingPanel
          mode="pair"
          tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
          leftListLabel="Monosemantic"
          rightListLabel="Incoherent Splitting"
          histogramProps={{
            availablePairs: rawPairList,
            filteredFeatureIds: selectedFeatureIds || undefined,
            threshold: clusteringThreshold,
            focusedItemId: selectedPairKey
          }}
          onApplyTags={handleApplyTags}
          onTagAll={handleTagAll}
          activeStage={activeStage}
        />
          </div>
        </div>

        {/* Right column: Next Stage - spans full height including StatusPanel */}
        <div className="next-stage-column">
          <button
            className="action-button action-button--next"
            onClick={() => { logAction('stage1', 'move_to_next_stage', {}); moveToNextStep() }}
            disabled={!allPairsTagged}
            title={allPairsTagged ? 'Proceed to Stage 2: Quality' : `Label all pairs first (${pairSelectionStates.size}/${rawPairList.length})`}
          >
            Move to Stage 2 Quality ↑
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitView)
