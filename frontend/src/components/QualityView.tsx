import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, ConsensusResponse } from '../types'
import * as api from '../api'
import { getFeatureConsensus } from '../api'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import StageAccordionList from './StageAccordionList'
import { TagBadge, TagButton, DisagreementIndicator } from './Indicators'
import { useSortableList, type ActiveStage, type BootstrapMode } from '../lib/tagging-hooks/useSortableList'
import { useCommitHistory, createFeatureCommitHistoryOptions, type DisplayCommit, useTaggingNavigation, isUserConfirmed, useMainListScroll } from '../lib/tagging-hooks'
import ActivationExample from './ActivationExamplePanel'
import { TAG_CATEGORY_QUALITY, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import ConsensusSection from './ConsensusSection'
import { useResizeObserver } from '../lib/utils'
import '../styles/QualityView.css'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// QUALITY VIEW - Organized layout for quality assessment workflow (Stage 2)
// ============================================================================
// Layout: [Top: feature list + right panel] | [Bottom: ThresholdTaggingPanel]

// Segment text into highlighted and non-highlighted parts based on phrase matches
function segmentTextByPhrases(text: string, phrases: string[]): Array<{ text: string; highlight: boolean }> {
  if (!text || phrases.length === 0) return [{ text, highlight: false }]

  const lower = text.toLowerCase()

  // Find all phrase occurrences as intervals
  const intervals: Array<[number, number]> = []
  for (const phrase of phrases) {
    const phraseLower = phrase.toLowerCase()
    let startIdx = 0
    while (startIdx < lower.length) {
      const found = lower.indexOf(phraseLower, startIdx)
      if (found === -1) break
      intervals.push([found, found + phraseLower.length])
      startIdx = found + 1
    }
  }

  if (intervals.length === 0) return [{ text, highlight: false }]

  // Sort by start, then merge overlapping
  intervals.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [intervals[0]]
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1]
    if (intervals[i][0] <= prev[1]) {
      prev[1] = Math.max(prev[1], intervals[i][1])
    } else {
      merged.push(intervals[i])
    }
  }

  // Build segments
  const segments: Array<{ text: string; highlight: boolean }> = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), highlight: false })
    }
    segments.push({ text: text.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlight: false })
  }
  return segments
}

// Counts stored at commit time for hover preview
export interface QualityCommitCounts {
  wellExplained: number
  needRevision: number
  unsure: number
  total: number
}

interface QualityViewProps {
  className?: string
}

const QualityView: React.FC<QualityViewProps> = ({
  className = ''
}) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const isDraggingThreshold = useVisualizationStore(state => state.isDraggingThreshold)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const lastSortedSelectionSignature = useVisualizationStore(state => state.lastSortedSelectionSignature)
  const sortBySimilarity = useVisualizationStore(state => state.sortBySimilarity)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const restoreFeatureSelectionStates = useVisualizationStore(state => state.restoreFeatureSelectionStates)
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const toggleFeatureSelection = useVisualizationStore(state => state.toggleFeatureSelection)

  // Stage 2 revisiting state
  const isRevisitingStage2 = useVisualizationStore(state => state.isRevisitingStage2)
  const stage2FinalCommit = useVisualizationStore(state => state.stage2FinalCommit)
  const setStage2FinalCommit = useVisualizationStore(state => state.setStage2FinalCommit)
  // Full commit history for restoration
  const stage2CommitHistory = useVisualizationStore(state => state.stage2CommitHistory)
  const stage2CommitData = useVisualizationStore(state => state.stage2CommitData)
  const stage2CurrentCommitIndex = useVisualizationStore(state => state.stage2CurrentCommitIndex)

  // Local state
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)

  // Hide tagged items toggle
  const [hideTagged, setHideTagged] = useState(false)

  // Show only QBC disagreement items toggle
  const [showDisagreementOnly, setShowDisagreementOnly] = useState(false)

  // Store selected feature ID directly to preserve highlight across mode switches
  const [selectedFeatureIdState, setSelectedFeatureIdState] = useState<number | null>(null)

  // Consensus data for selected feature
  const [consensus, setConsensus] = useState<ConsensusResponse | null>(null)

  // Phrases to highlight in explanation text (from consensus pill hover)
  const [highlightPhrases, setHighlightPhrases] = useState<string[] | null>(null)

  // Track if SVM has been trained (for conditional UI labels)
  const svmTrainingStarted = similarityScores.size > 0

  // Diversity sort: IDs of diverse features (Kennard-Stone samples) to show first
  // Cached in store to prevent refetch on view navigation
  const diversityFeatureIds = useVisualizationStore(state => state.stage2DiversityFeatureIds)
  const stage2DiversitySignature = useVisualizationStore(state => state.stage2DiversitySignature)
  const setStage2DiversityCache = useVisualizationStore(state => state.setStage2DiversityCache)

  // Track visited representative features for smart pulsing
  const [visitedRepIds, setVisitedRepIds] = useState<Set<number>>(new Set())

  // Active list source is always 'all' (boundary lists removed)
  const activeListSource = 'all' as const

  // Right panel container width (for ActivationExample)
  const { ref: rightPanelRef, size: rightPanelSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 600,
    defaultHeight: 400,
    debounceMs: 16,
    debugId: 'quality-view-right-panel'
  })
  const containerWidth = rightPanelSize.width - 16  // Account for padding

  // Dependencies for selectedFeatureIds
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    // If revisiting Stage 2 and we have stored feature IDs, use those
    if (isRevisitingStage2 && stage2FinalCommit?.featureIds) {
      return stage2FinalCommit.featureIds
    }

    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps
    const features = getSelectedNodeFeatures()
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage2, stage2FinalCommit])

  // Initialize stage2FinalCommit with initial state when first entering Stage 2
  // This ensures we can restore even if user does nothing and moves to Stage 3
  useEffect(() => {
    // Only initialize when: not revisiting, no saved commit yet, and we have features
    if (!isRevisitingStage2 && !stage2FinalCommit && selectedFeatureIds && selectedFeatureIds.size > 0) {
      setStage2FinalCommit({
        featureSelectionStates: new Map(),
        featureSelectionSources: new Map(),
        featureIds: new Set(selectedFeatureIds),
        counts: { wellExplained: 0, needRevision: 0, unsure: selectedFeatureIds.size, total: selectedFeatureIds.size }
      })
    }
  }, [isRevisitingStage2, stage2FinalCommit, selectedFeatureIds, setStage2FinalCommit])

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

  // Build feature list with metadata
  const featureList = useMemo(() => {
    if (!filteredTableData?.rows) return []

    const explainerIds = tableData?.explainer_ids || []

    return filteredTableData.rows.map((row: FeatureTableRow) => {
      // Compute average quality score across all explainers
      let totalScore = 0
      let count = 0
      for (const explainerId of explainerIds) {
        const score = row.explainers?.[explainerId]?.quality_score
        if (score !== null && score !== undefined) {
          totalScore += score
          count++
        }
      }
      const avgQualityScore = count > 0 ? totalScore / count : 0

      return {
        featureId: row.feature_id,
        qualityScore: avgQualityScore,
        row
      }
    })
  }, [filteredTableData, tableData?.explainer_ids])

  // Fetch diversity feature IDs (cluster medoids) for diversity sort
  // Uses store cache to prevent refetch when navigating between views
  useEffect(() => {
    const fetchDiversityIds = async () => {
      if (!selectedFeatureIds || selectedFeatureIds.size < 6) {
        if (diversityFeatureIds.size > 0) {
          setStage2DiversityCache(new Set(), '')
        }
        return
      }

      // Compute cache signature: "featureCount" (no threshold for Stage 2)
      const signature = `${selectedFeatureIds.size}`

      // Check if cache is valid
      if (stage2DiversitySignature === signature && diversityFeatureIds.size > 0) {
        console.log('[QualityView] Using cached diversity IDs:', diversityFeatureIds.size)
        return
      }

      try {
        console.log('[QualityView] Fetching diversity IDs (signature:', signature, ')')
        const response = await api.getColdStartSuggestions(
          'feature',
          Array.from(selectedFeatureIds),
          20  // Get 20 diverse features via Kennard-Stone
        )
        const newIds = new Set(response.suggestions.map(s => parseInt(s.id, 10)))
        setStage2DiversityCache(newIds, signature)
      } catch (error) {
        console.error('[QualityView] Failed to fetch diversity IDs:', error)
        setStage2DiversityCache(new Set(), '')
      }
    }

    fetchDiversityIds()
  }, [selectedFeatureIds, stage2DiversitySignature, diversityFeatureIds.size, setStage2DiversityCache])

  // Use sortable list hook for sorting logic
  // Initial: diversity mode (show medoids first) - helps users tag diverse samples
  // Template: decisionMargin mode + ascending (least confident first) - used when SVM is trained
  const {
    sortMode,
    setSortMode,
    sortDirection,
    setSortDirection,
    sortedItems: sortedFeatures,
    columnHeaderProps,
    getDisplayScore
  } = useSortableList({
    items: featureList,
    getItemKey: (f: typeof featureList[0]) => f.featureId,
    getDefaultScore: (f: typeof featureList[0]) => f.qualityScore,
    decisionMarginScores: similarityScores,
    diversityIds: diversityFeatureIds,
    defaultLabel: 'Quality Score',
    defaultDirection: 'asc',
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
  useEffect(() => {
    if (activeStage === 'apply') {
      setHideTagged(true)
      setShowDisagreementOnly(true)
    } else {
      setHideTagged(false)
      setShowDisagreementOnly(false)
    }
  }, [activeStage])

  // Handlers for stage changes
  const handleStageChange = useCallback((stage: ActiveStage) => {
    setActiveStage(stage)
    if (stage === 'learn') {
      setSortMode('decisionMargin')
      setSortDirection('asc')
    } else if (stage === 'apply') {
      setSortMode('decisionMargin')
      setSortDirection('desc')
    }
    setCurrentFeatureIndex(0)
    setSelectedFeatureIdState(null)
  }, [setSortMode, setSortDirection])

  // Bootstrap option cycling handler
  const handleBootstrapOptionChange = useCallback((mode: BootstrapMode) => {
    if (mode === 'diversity') {
      setSortMode('diversity')
    } else {
      setSortMode('default')
      setSortDirection('asc')
    }
    setCurrentFeatureIndex(0)
  }, [setSortMode, setSortDirection])

  const handleBootstrapModeChange = handleBootstrapOptionChange

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

  const disagreementIds = useMemo(() => new Set(disagreementLookup.keys()), [disagreementLookup])

  // Filter features based on hideTagged and showDisagreementOnly toggles
  const displayFeatures = useMemo(() => {
    return sortedFeatures.filter(f => {
      if (hideTagged && featureSelectionStates.has(f.featureId)) return false
      if (showDisagreementOnly && !disagreementIds.has(String(f.featureId))) return false
      return true
    })
  }, [sortedFeatures, hideTagged, featureSelectionStates, showDisagreementOnly, disagreementIds])

  // Extract feature IDs from displayFeatures for scroll hook
  const sortedFilteredFeatureIds = useMemo(() => {
    return displayFeatures.map(f => f.featureId)
  }, [displayFeatures])

  // Main list scroll hook - scroll to item when clicked in subviews
  const { scrollTargetIndex } = useMainListScroll({
    sortedFilteredList: sortedFilteredFeatureIds,
    sortMode,
    setSortMode,
    setSortDirection: setSortDirection,
  })

  // Reset to first feature when hideTagged changes (to avoid index out of bounds)
  const prevHideTaggedRef = useRef(hideTagged)
  useEffect(() => {
    if (prevHideTaggedRef.current !== hideTagged) {
      setCurrentFeatureIndex(0)
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged])

  // Reset to first item when sort mode or direction changes
  // This ensures the selection indicator points to a valid item after re-sorting
  const prevSortRef = useRef({ sortMode, sortDirection })
  useEffect(() => {
    if (prevSortRef.current.sortMode !== sortMode || prevSortRef.current.sortDirection !== sortDirection) {
      setCurrentFeatureIndex(0)
      prevSortRef.current = { sortMode, sortDirection }
    }
  }, [sortMode, sortDirection])

  // Helper function to compute quality counts from featureSelectionStates
  const getQualityCounts = useCallback((): QualityCommitCounts => {
    let wellExplained = 0, needRevision = 0, unsure = 0

    featureList.forEach((f: typeof featureList[0]) => {
      const state = featureSelectionStates.get(f.featureId)
      if (state === 'selected') wellExplained++
      else if (state === 'rejected') needRevision++
      else unsure++
    })

    return {
      wellExplained,
      needRevision,
      unsure,
      total: featureList.length
    }
  }, [featureList, featureSelectionStates])

  // ============================================================================
  // COMMIT HISTORY - Using centralized hook with storeSync
  // ============================================================================

  // Store sync setters (inline functions that use setState)
  const setStoreCommitHistory = useCallback((commits: DisplayCommit<QualityCommitCounts>[]) => {
    useVisualizationStore.setState({ stage2CommitHistory: commits })
  }, [])

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds?: Set<number> }>) => {
    useVisualizationStore.setState({ stage2CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage2CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds: Set<number>; counts: QualityCommitCounts }) => {
    setStage2FinalCommit({
      featureSelectionStates: new Map(data.states),
      featureSelectionSources: new Map(data.sources),
      featureIds: data.featureIds,
      counts: data.counts
    })
  }, [setStage2FinalCommit])

  // Memoize storeSync to prevent infinite loops (object reference stability)
  const storeSync = useMemo(() => ({
    isRevisiting: isRevisitingStage2,
    stageCommitHistory: stage2CommitHistory,
    stageCommitData: stage2CommitData,
    stageCurrentCommitIndex: stage2CurrentCommitIndex,
    setStoreCommitHistory,
    setStoreCommitData,
    setStoreCurrentCommitIndex,
    setFinalCommit: setFinalCommitFromHook
  }), [isRevisitingStage2, stage2CommitHistory, stage2CommitData, stage2CurrentCommitIndex, setStoreCommitHistory, setStoreCommitData, setStoreCurrentCommitIndex, setFinalCommitFromHook])

  // Use the commit history hook with store sync
  const { createCommit } = useCommitHistory<Map<number, 'selected' | 'rejected'>, Map<number, 'click' | 'threshold' | 'predicted'>, QualityCommitCounts>({
    ...createFeatureCommitHistoryOptions(
      () => featureSelectionStates,
      () => featureSelectionSources,
      restoreFeatureSelectionStates
    ),
    calculateCounts: getQualityCounts,
    getFeatureIds: () => selectedFeatureIds,
    onCommitCreated: (commit) => {
      // Save to global store for Stage 2 revisit
      setStage2FinalCommit({
        featureSelectionStates: new Map(commit.states),
        featureSelectionSources: new Map(commit.sources),
        featureIds: commit.featureIds || new Set(),
        counts: commit.counts || { wellExplained: 0, needRevision: 0, unsure: 0, total: 0 }
      })
    },
    // Store sync - handles all store synchronization automatically
    storeSync,
    selectionStates: featureSelectionStates,
    selectionSources: featureSelectionSources
  })

  // Reset to valid index when features change
  useEffect(() => {
    if (currentFeatureIndex >= displayFeatures.length && displayFeatures.length > 0) {
      setCurrentFeatureIndex(displayFeatures.length - 1)
    }
  }, [displayFeatures.length, currentFeatureIndex])

  // Auto-populate similarity scores when feature list is ready or selection states change
  useEffect(() => {
    // Extract user-confirmed selections to compute signature
    const currentSelectedIds: number[] = []
    const currentRejectedIds: number[] = []
    featureSelectionStates.forEach((state, featureId) => {
      const source = featureSelectionSources.get(featureId)
      if (isUserConfirmed(source)) {
        if (state === 'selected') currentSelectedIds.push(featureId)
        else if (state === 'rejected') currentRejectedIds.push(featureId)
      }
    })

    const hasRequiredSelections = currentSelectedIds.length >= 3 && currentRejectedIds.length >= 3

    // Compute current signature to detect if scores are stale
    const currentSignature = `selected:${currentSelectedIds.sort((a, b) => a - b).join(',')}|rejected:${currentRejectedIds.sort((a, b) => a - b).join(',')}`
    const scoresAreStale = lastSortedSelectionSignature !== currentSignature

    // Only compute scores if signature changed (not just because scores are empty)
    // This prevents infinite loop when API returns 0 scores - we don't want to retry
    const needsScores = scoresAreStale && featureList.length > 0

    if (hasRequiredSelections && needsScores) {
      // Skip if all features are already tagged - no point in re-computing similarity
      if (featureSelectionStates.size >= featureList.length) {
        console.log('[QualityView] Skipping similarity sort - all', featureList.length, 'features already tagged')
        return
      }

      sortBySimilarity()
    }
  }, [featureList, featureSelectionStates, featureSelectionSources, lastSortedSelectionSignature, sortBySimilarity])


  // Track visited representative features for smart pulsing
  useEffect(() => {
    if (sortMode === 'diversity' && displayFeatures.length > 0) {
      const feature = displayFeatures[currentFeatureIndex]
      if (feature && diversityFeatureIds.has(feature.featureId)) {
        setVisitedRepIds(prev => {
          if (prev.has(feature.featureId)) return prev
          return new Set([...prev, feature.featureId])
        })
      }
    }
  }, [currentFeatureIndex, displayFeatures, diversityFeatureIds, sortMode])

  // Calculate if most reps visited (>80%)
  const hasVisitedMostReps = useMemo(() => {
    return diversityFeatureIds.size > 0 && visitedRepIds.size >= diversityFeatureIds.size * 0.8
  }, [diversityFeatureIds, visitedRepIds])

  // Check if flip rate stable (last 5 iterations all < 3%)
  const isFlipRateStable = useMemo(() => {
    const history = tagAutomaticState?.flipTracking?.flipHistory
    if (!history || history.length < 5) return false
    const last5 = history.slice(-5)
    return last5.every(h => h.flipRate < 0.03)
  }, [tagAutomaticState?.flipTracking?.flipHistory])


  // ============================================================================
  // PREVIEW KEYS - Items past threshold handles that will be auto-tagged
  // ============================================================================

  const previewRejectIds = useMemo(() => {
    const ids = new Set<number>()
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8
    if (!tagAutomaticState?.histogramData) return ids
    featureList.forEach((f: { featureId: number }) => {
      const score = similarityScores.get(f.featureId)
      if (score !== undefined && score < rejectThreshold) ids.add(f.featureId)
    })
    return ids
  }, [featureList, similarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.rejectThreshold])

  const previewSelectIds = useMemo(() => {
    const ids = new Set<number>()
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    if (!tagAutomaticState?.histogramData) return ids
    featureList.forEach((f: { featureId: number }) => {
      const score = similarityScores.get(f.featureId)
      if (score !== undefined && score >= selectThreshold) ids.add(f.featureId)
    })
    return ids
  }, [featureList, similarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.selectThreshold])

  // ============================================================================
  // SELECTED FEATURE DATA (for right panel)
  // ============================================================================

  // Compute selected feature ID - prefer stored state, fallback to index-based
  const selectedFeatureId = useMemo(() => {
    if (selectedFeatureIdState !== null) {
      return selectedFeatureIdState
    }
    const item = displayFeatures[currentFeatureIndex]
    if (!item) return null
    return item.featureId
  }, [selectedFeatureIdState, displayFeatures, currentFeatureIndex])

  // Sync currentFeatureIndex when lists change (after mode switch)
  useEffect(() => {
    if (selectedFeatureIdState === null) return
    const newIndex = displayFeatures.findIndex(item => item.featureId === selectedFeatureIdState)
    if (newIndex !== -1 && newIndex !== currentFeatureIndex) {
      setCurrentFeatureIndex(newIndex)
    }
  }, [selectedFeatureIdState, displayFeatures, currentFeatureIndex])

  // Fetch consensus data when selected feature changes
  useEffect(() => {
    if (selectedFeatureId === null) {
      setConsensus(null)
      return
    }

    getFeatureConsensus(selectedFeatureId)
      .then(setConsensus)
      .catch(() => setConsensus(null))
  }, [selectedFeatureId])

  // Compute highlight index for main list
  const mainListHighlightIndex = useMemo(() => {
    if (selectedFeatureId === null) return -1
    return displayFeatures.findIndex(f => f.featureId === selectedFeatureId)
  }, [selectedFeatureId, displayFeatures])

  // Effect: Auto-switch from diversity mode when selected feature is not visible
  useEffect(() => {
    if (selectedFeatureId === null || sortMode !== 'diversity') return
    if (mainListHighlightIndex === -1) {
      setSortMode('decisionMargin')
      setSortDirection('asc')
    }
  }, [selectedFeatureId, sortMode, mainListHighlightIndex, setSortMode, setSortDirection])

  // Get the currently selected feature's data
  const selectedFeatureData = useMemo(() => {
    if (selectedFeatureId === null) return null
    const feature = displayFeatures.find(f => f.featureId === selectedFeatureId)
      || sortedFeatures.find(f => f.featureId === selectedFeatureId)
    if (!feature) return null

    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [selectedFeatureId, displayFeatures, sortedFeatures, activationExamples])

  // Get tag colors for header badge and buttons
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#4CAF50'
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
    // Note: Do NOT reset activeListSource here (matches FeatureSplitView behavior)
  }, [])

  const handleNavigateNext = useCallback(() => {
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.min(displayFeatures.length - 1, i + 1))
    // Note: Do NOT reset activeListSource here (matches FeatureSplitView behavior)
  }, [displayFeatures.length])

  // Reset to first feature in 'all' list (used after tagging in decision margin mode)
  const handleResetToFirst = useCallback(() => {
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(0)
  }, [])

  // Post-tagging navigation hook - centralized logic matching FeatureSplitView
  const { handlePostTagNavigation, handlePostUnsureNavigation } = useTaggingNavigation({
    activeListSource,
    sortMode,
    currentIndex: currentFeatureIndex,
    listLength: displayFeatures.length,
    onNavigateNext: handleNavigateNext,
    onResetToFirst: handleResetToFirst,
    isHistogramReady: !!tagAutomaticState?.histogramData,
    hideTagged
  })

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's selection state
  const currentSelectionState = useMemo(() => {
    if (!selectedFeatureData) return null
    return featureSelectionStates.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, featureSelectionStates])

  // Handle Well-Explained click (selected)
  const handleWellExplainedClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    if (currentSelectionState === 'selected') {
      // Already selected: keep tag and navigate
      handlePostTagNavigation()
    } else {
      // Set to selected
      if (currentSelectionState === null) {
        toggleFeatureSelection(featureId)
      } else if (currentSelectionState === 'rejected') {
        // rejected → null → selected
        toggleFeatureSelection(featureId)
        toggleFeatureSelection(featureId)
      }
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostTagNavigation])

  // Handle Need Revision click (rejected)
  const handleNeedRevisionClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    if (currentSelectionState === 'rejected') {
      // Already rejected: keep tag and navigate
      handlePostTagNavigation()
    } else {
      // Set to rejected
      if (currentSelectionState === null) {
        // null → selected → rejected
        toggleFeatureSelection(featureId)
        toggleFeatureSelection(featureId)
      } else if (currentSelectionState === 'selected') {
        // selected → rejected
        toggleFeatureSelection(featureId)
      }
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostTagNavigation])

  // Handle Unsure click (clear selection)
  const handleUnsureClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    if (currentSelectionState === 'selected') {
      // selected → rejected → null
      toggleFeatureSelection(featureId)
      toggleFeatureSelection(featureId)
    } else if (currentSelectionState === 'rejected') {
      // rejected → null
      toggleFeatureSelection(featureId)
    }
    // Use centralized navigation logic (always advances for unsure)
    handlePostUnsureNavigation()
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostUnsureNavigation])

  // ============================================================================
  // CLICK HANDLERS
  // ============================================================================

  // Handle click on feature in top row list
  const handleFeatureListClick = useCallback((index: number) => {
    // Set feature ID first (survives mode switches)
    const feature = displayFeatures[index]
    if (feature) {
      setSelectedFeatureIdState(feature.featureId)
    }
    setCurrentFeatureIndex(index)
  }, [displayFeatures])

  // Render feature item for the ScrollableItemList
  // Score display is handled by ScrollableItemList's sortConfig
  const renderFeatureItem = useCallback((feature: typeof featureList[0], index: number) => {
    const selectionState = featureSelectionStates.get(feature.featureId)
    const isAutoSource = featureSelectionSources.get(feature.featureId) === 'predicted'
    const inPreviewReject = previewRejectIds.has(feature.featureId)
    const inPreviewSelect = previewSelectIds.has(feature.featureId)

    // Determine tag name based on selection state OR preview state
    let tagName = 'Unsure'
    if (selectionState === 'selected') {
      tagName = 'Well-Explained'
    } else if (selectionState === 'rejected') {
      tagName = 'Need Revision'
    } else if (inPreviewSelect) {
      // Preview: will be selected → Well-Explained
      tagName = 'Well-Explained'
    } else if (inPreviewReject) {
      // Preview: will be rejected → Need Revision
      tagName = 'Need Revision'
    }

    // Show stripe for: already auto-tagged OR in preview threshold regions
    const isAutoOrPreview = isAutoSource || inPreviewReject || inPreviewSelect

    const disagreementInfo = activeStage === 'apply' && !isUserConfirmed(featureSelectionSources.get(feature.featureId)) ? disagreementLookup.get(String(feature.featureId)) : undefined

    return (
      <>
        {disagreementInfo && (
          <DisagreementIndicator
            isDisagreement={disagreementInfo.isDisagreement}
            tooltipText={disagreementInfo.tooltipText}
          />
        )}
        <TagBadge
          featureId={feature.featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_QUALITY}
          onClick={() => handleFeatureListClick(index)}
          fullWidth={true}
          isAuto={isAutoOrPreview}
        />
      </>
    )
  }, [featureSelectionStates, featureSelectionSources, previewRejectIds, previewSelectIds, handleFeatureListClick, disagreementLookup, activeStage])

  // ============================================================================
  // APPLY TAGS HANDLER
  // ============================================================================

  const handleApplyTags = useCallback(() => {
    console.log('[QualityView] Apply Tags clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Apply auto-tags (effect will sync to NEW commit)
    applySimilarityTags()

    // 3. Switch to decision margin sort and reset
    setSortMode('decisionMargin')
    setCurrentFeatureIndex(0)
  }, [createCommit, applySimilarityTags, setSortMode])

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  // Check if all features are tagged
  const allFeaturesTagged = useMemo(() => {
    if (featureList.length === 0) return false
    return featureList.every((f: { featureId: number }) => featureSelectionStates.has(f.featureId))
  }, [featureList, featureSelectionStates])

  // Handle Tag All - Tag all unsure as Need Revision (rejected)
  const handleTagAllNeedRevision = useCallback(() => {
    console.log('[TagAll] Need Revision option clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Build new states with all untagged features as rejected (Need Revision)
    const newStates = new Map(featureSelectionStates)
    const newSources = new Map(featureSelectionSources)

    let taggedCount = 0
    featureList.forEach((f: { featureId: number }) => {
      if (!newStates.has(f.featureId)) {
        newStates.set(f.featureId, 'rejected')
        newSources.set(f.featureId, 'click')
        taggedCount++
      }
    })

    console.log('[TagAll] Tagged', taggedCount, 'features as Need Revision')

    // 3. Apply the new states to store (effect will sync to current commit)
    restoreFeatureSelectionStates(newStates, newSources)
  }, [featureList, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates, createCommit])

  // Handle Tag All - By Decision Boundary
  const handleTagAllByBoundary = useCallback(() => {
    console.log('[TagAll] By Decision Boundary (score=0) option clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Build new states using SVM decision boundary
    const newStates = new Map(featureSelectionStates)
    const newSources = new Map(featureSelectionSources)

    let selectedCount = 0
    let rejectedCount = 0

    featureList.forEach((f: { featureId: number }) => {
      if (newStates.has(f.featureId)) return

      const score = similarityScores.get(f.featureId)
      if (score !== undefined) {
        if (score >= 0) {
          newStates.set(f.featureId, 'selected')
          newSources.set(f.featureId, 'click')
          selectedCount++
        } else {
          newStates.set(f.featureId, 'rejected')
          newSources.set(f.featureId, 'click')
          rejectedCount++
        }
      } else {
        newStates.set(f.featureId, 'rejected')
        newSources.set(f.featureId, 'click')
        rejectedCount++
      }
    })

    console.log('[TagAll] By Decision Boundary results:', {
      wellExplainedAboveZero: selectedCount,
      needRevisionBelowZero: rejectedCount
    })

    // 3. Apply the new states to store (effect will sync to current commit)
    restoreFeatureSelectionStates(newStates, newSources)
  }, [featureList, featureSelectionStates, featureSelectionSources, similarityScores, restoreFeatureSelectionStates, createCommit])

  // Unified Tag All handler
  const handleTagAll = useCallback((method: 'left' | 'byBoundary') => {
    if (method === 'left') {
      handleTagAllNeedRevision()
    } else {
      handleTagAllByBoundary()
    }
  }, [handleTagAllNeedRevision, handleTagAllByBoundary])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Compute loading state for content dim effect
  const isViewLoading = isDraggingThreshold

  return (
    <div className={`quality-view ${className}`}>
      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Quality Assessment</span>
        <span className="view-description">
          Validate features for{' '}
          <span
            className="view-tag-badge"
            style={{ backgroundColor: wellExplainedColor }}
          >
            Well-Explained
          </span>
        </span>
      </div>

      {/* Body: Main column + Next Stage column */}
      <div className="quality-view__body">
        {/* Main column: Content rows */}
        <div className="quality-view__main">
          {/* Content: 2 rows */}
          <div className={`quality-view__content ${isViewLoading ? 'content-loading' : ''}`}>
          {/* Top row: StageAccordionList + right panel */}
          <div className="quality-view__row-top">
            <StageAccordionList
              variant="features"
              activeStage={activeStage}
              onStageChange={handleStageChange}
              bootstrapMode={bootstrapMode}
              bootstrapDirection={sortDirection}
              onBootstrapModeChange={handleBootstrapModeChange}
              onBootstrapOptionChange={handleBootstrapOptionChange}
              hasDiversityIds={diversityFeatureIds.size > 0}
              learnDisabled={!tagAutomaticState?.histogramData}
              applyDisabled={!tagAutomaticState?.histogramData}
              shouldPulseLearn={hasVisitedMostReps}
              shouldPulseApply={isFlipRateStable}
              diversityLabel={`Most Critical ${diversityFeatureIds.size}`}
              byScoreLabel="Quality Score"
              hideTagged={hideTagged}
              onHideTaggedChange={setHideTagged}
              showDisagreementOnly={showDisagreementOnly}
              onShowDisagreementOnlyChange={setShowDisagreementOnly}
              hasDisagreementData={tagAutomaticState?.committeeVotes != null && tagAutomaticState.committeeVotes.size > 0}
              badges={[{
                label: showDisagreementOnly
                  ? 'Disagreement Features'
                  : sortMode === 'diversity'
                    ? 'Most Critical Features'
                    : hideTagged
                      ? 'Untagged Features'
                      : 'All Features',
                count: displayFeatures.length
              }]}
              columnHeader={columnHeaderProps}
              items={displayFeatures}
              renderItem={renderFeatureItem}
              sortConfig={{ getDisplayScore }}
              currentIndex={mainListHighlightIndex}
              isActive={activeListSource === 'all'}
              scrollTargetIndex={scrollTargetIndex}
            />
            {/* Right panel - activating examples and explanations */}
            <div className="quality-view__right-panel" ref={rightPanelRef}>
              {selectedFeatureData ? (
                <>
                  {/* Header row - Feature ID and Legends */}
                  <div className="quality-view__header-row">
                    <h4 className="subheader">activating examples</h4>
                    <span className="panel-header__id">#{selectedFeatureData.featureId}</span>
                    {/* Spacer to push legends to the right */}
                    <div style={{ flex: 1 }} />
                    {/* Activation legend */}
                    <div className="quality-view__legend">
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--activation">token</span>:
                        <span className="legend-label">Activation Strength</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--intra">n-gram</span>:
                        <span className="legend-label">Feature-Specific Pattern</span>
                      </div>
                    </div>
                  </div>

                  {/* activating examples Section */}
                  <div className="quality-view__activation-section">
                    <div className="quality-view__activation-examples">
                      {selectedFeatureData.activation ? (
                        <ActivationExample
                          examples={selectedFeatureData.activation}
                          containerWidth={containerWidth}
                          numQuantiles={4}
                          examplesPerQuantile={[2, 2, 2, 2]}
                          disableHover={true}
                        />
                      ) : (
                        <div className="quality-view__loading">Loading activating examples...</div>
                      )}
                    </div>
                  </div>

                  {/* Consensus Section - Clustered explanation phrases */}
                  <div className="quality-view__consensus-header">
                    <span className="subheader">Consensus</span>
                    {/* Cluster/Outlier legend */}
                    <div className="quality-view__consensus-legend">
                      <div className="legend-item">
                        <span className="legend-dot legend-dot--filled" />
                        <span className="legend-label">Cluster</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-dot legend-dot--hollow" />
                        <span className="legend-label">Outlier</span>
                      </div>
                    </div>
                  </div>
                  <ConsensusSection consensus={consensus} onPhraseHover={setHighlightPhrases} />

                  {/* Explanation Header */}
                  <div className="quality-view__explanation-header">
                    <span className="subheader">Explanations</span>
                  </div>

                  {/* Explanation Section - All Explainers (plain text) */}
                  <div className="quality-view__explanation-row">
                    <div className="quality-view__explanation-section">
                      <div className="quality-view__explanation-content">
                        {tableData?.explainer_ids && tableData.explainer_ids.length > 0 ? (
                          tableData.explainer_ids.map((explainerId: string) => {
                            const explanationText = selectedFeatureData?.row?.explainers?.[explainerId]?.explanation_text
                            return (
                              <div
                                key={explainerId}
                                className="quality-view__explainer-block"
                              >
                                <span
                                  className={`quality-view__explainer-name quality-view__explainer-name--${explainerId}`}
                                >
                                  {getExplainerDisplayName(explainerId)}
                                </span>
                                <span className="quality-view__explainer-text">
                                  {!explanationText ? (
                                    <span className="quality-view__no-explanation">No explanation available</span>
                                  ) : !highlightPhrases ? (
                                    explanationText
                                  ) : (
                                    segmentTextByPhrases(explanationText, highlightPhrases).map((seg, i) =>
                                      seg.highlight
                                        ? <mark key={i} className="quality-view__phrase-highlight">{seg.text}</mark>
                                        : <span key={i}>{seg.text}</span>
                                    )
                                  )}
                                </span>
                              </div>
                            )
                          })
                        ) : (
                          <span className="quality-view__no-explanation">No explanations available</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Floating control panel at bottom */}
                  <div className="floating-controls">
                    {/* Previous button */}
                    <button
                      className="nav__button"
                      onClick={handleNavigatePrevious}
                      disabled={currentFeatureIndex === 0}
                    >
                      ← Prev
                    </button>

                    {/* Selection buttons - Need Revision | Unsure | Well-Explained */}
                    <TagButton
                      label="Need Revision"
                      variant="need-revision"
                      color={needRevisionColor}
                      isSelected={currentSelectionState === 'rejected'}
                      onClick={handleNeedRevisionClick}
                    />
                    <TagButton
                      label="Unsure"
                      variant="unsure"
                      color={unsureColor}
                      isSelected={currentSelectionState === null}
                      onClick={handleUnsureClick}
                    />
                    <TagButton
                      label="Well-Explained"
                      variant="well-explained"
                      color={wellExplainedColor}
                      isSelected={currentSelectionState === 'selected'}
                      onClick={handleWellExplainedClick}
                    />

                    {/* Next button */}
                    <button
                      className="nav__button"
                      onClick={handleNavigateNext}
                      disabled={currentFeatureIndex >= sortedFeatures.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                </>
              ) : (
                <span className="quality-view__placeholder-text">Select a feature to view details</span>
              )}
            </div>
          </div>

          {/* Bottom row: ThresholdTaggingPanel */}
          <ThresholdTaggingPanel
            mode="feature"
            tagCategoryId={TAG_CATEGORY_QUALITY}
            leftListLabel="Need Revision"
            rightListLabel="Well-Explained"
            histogramProps={{
              filteredFeatureIds: selectedFeatureIds || undefined
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
            onClick={moveToNextStep}
            disabled={!allFeaturesTagged}
            title={allFeaturesTagged ? 'Proceed to Stage 3: Root Cause' : `Tag all features first (${featureSelectionStates.size}/${featureList.length})`}
          >
            Move to Stage 3 Root Cause ↑
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(QualityView)
