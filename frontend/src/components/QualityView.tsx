import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, ConsensusResponse, FlipTrackingInfo } from '../types'
import * as api from '../api'
import { getFeatureConsensus } from '../api'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import StageAccordionList from './StageAccordionList'
import { TagBadge, TagButton, DisagreementIndicator } from './Indicators'
import { useSortableList, type ActiveStage, type BootstrapMode, type SortMode } from '../lib/tagging-hooks/useSortableList'
import { useCommitHistory, createFeatureCommitHistoryOptions, type DisplayCommit, useTaggingNavigation, isUserConfirmed, useMainListScroll } from '../lib/tagging-hooks'
import ActivationExample from './ActivationExamplePanel'
import { TAG_CATEGORY_QUALITY, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { scoreToColor, textColorForBackground } from '../lib/color-utils'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import ConsensusSection, { ConsensusLegend, type PhraseHighlightData } from './ConsensusSection'
import { ExplanationWithPopover } from './ExplanationPanel'
import CrossMetricConsensus, { CrossMetricLegend } from './CrossMetricConsensus'
import { useResizeObserver } from '../lib/utils'
import { logAction, createDebouncedLogger } from '../lib/action-logger'
import '../styles/QualityView.css'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// QUALITY VIEW - Organized layout for quality assessment workflow (Stage 2)
// ============================================================================
// Layout: [Top: feature list + right panel] | [Bottom: ThresholdTaggingPanel]

// Segment text into highlighted and non-highlighted parts using character offsets
function segmentTextByOffsets(
  text: string,
  phraseData: PhraseHighlightData[],
  explainerId: string,
): Array<{ text: string; highlight: boolean }> {
  if (!text || phraseData.length === 0) return [{ text, highlight: false }]

  // Filter to phrases for this explainer and collect valid intervals
  const intervals: Array<[number, number]> = []
  for (const p of phraseData) {
    if (p.explainer !== explainerId) continue

    // Prefer char_offsets list (multi-range, from updated pipeline)
    if (p.offsets && p.offsets.length > 0) {
      for (const o of p.offsets) {
        const start = Math.max(0, o.start)
        const end = Math.min(text.length, o.end)
        if (start < end) intervals.push([start, end])
      }
      continue
    }

    // Legacy: single start_char/end_char
    if (p.start_char === 0 && p.end_char === 0) continue  // no offset data
    const start = Math.max(0, p.start_char)
    const end = Math.min(text.length, p.end_char)
    if (start >= end) continue

    // Validate: if offset span is much wider than phrase text, it's over-spanning
    if (end - start <= p.text.length + 5) {
      intervals.push([start, end])
    } else {
      // Over-spanning non-contiguous phrase: fall back to substring search
      const idx = text.indexOf(p.text)
      if (idx >= 0) {
        intervals.push([idx, idx + p.text.length])
      }
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
  const lastClickTagAction = useVisualizationStore(state => state.lastClickTagAction)
  const setLastClickTagAction = useVisualizationStore(state => state.setLastClickTagAction)
  const undoLastClickTag = useVisualizationStore(state => state.undoLastClickTag)

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

  // Track reviewed items (any tag action including unsure) for popover trigger
  const [reviewedFeatureIds, setReviewedFeatureIds] = useState<Set<number>>(() => new Set())

  // Store selected feature ID directly to preserve highlight across mode switches
  const [selectedFeatureIdState, setSelectedFeatureIdState] = useState<number | null>(null)

  // Consensus data for selected feature
  const [consensus, setConsensus] = useState<ConsensusResponse | null>(null)
  const consensusCacheRef = useRef<Map<number, ConsensusResponse>>(new Map())

  // Phrases to highlight in explanation text (from consensus pill hover)
  const [highlightPhrases, setHighlightPhrases] = useState<PhraseHighlightData[] | null>(null)

  // Diversity sort: IDs of diverse features (Kennard-Stone samples) to show first
  // Cached in store to prevent refetch on view navigation
  const diversityFeatureIds = useVisualizationStore(state => state.stage2DiversityFeatureIds)
  const stage2DiversitySignature = useVisualizationStore(state => state.stage2DiversitySignature)
  const setStage2DiversityCache = useVisualizationStore(state => state.setStage2DiversityCache)


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

    void sankeyStructure
    void selectedSegment
    void tableSelectedNodeIds
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
        return
      }

      try {
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
    defaultLabel: 'Avg. Metric Score',
    defaultDirection: 'asc',
    templateMode: 'decisionMargin',
    templateDirection: 'asc',
    initialMode: 'diversity',
    initialDirection: 'asc'
  })

  // Independent stage state (decoupled from sort mode) - restore from store when revisiting
  const [activeStage, setActiveStage] = useState<ActiveStage>(stage2FinalCommit?.workflowActiveStage ?? 'bootstrap')

  // Derive bootstrapMode from sortMode (for StageAccordionList display)
  const bootstrapMode: BootstrapMode = sortMode === 'diversity' ? 'diversity' : 'byScore'

  // Auto-enable filters when entering Apply phase, reset when leaving
  const setWorkflowActiveStage = useVisualizationStore(state => state.setWorkflowActiveStage)
  useEffect(() => {
    setWorkflowActiveStage(activeStage)
  }, [activeStage, setWorkflowActiveStage])

  // Save/restore bootstrap sort config when transitioning between stages
  const lastBootstrapSortRef = useRef<{ mode: SortMode; direction: 'asc' | 'desc' }>({ mode: 'diversity', direction: 'asc' })

  // Handlers for stage changes
  const handleStageChange = useCallback((stage: ActiveStage) => {
    logAction('stage2', 'stage_change', { stage })
    if (activeStage === 'bootstrap') {
      lastBootstrapSortRef.current = { mode: sortMode, direction: sortDirection }
    }
    setActiveStage(stage)
    if (stage === 'bootstrap') {
      setSortMode(lastBootstrapSortRef.current.mode)
      setSortDirection(lastBootstrapSortRef.current.direction)
    } else if (stage === 'learn') {
      setSortMode('decisionMargin')
      setSortDirection('asc')
    } else if (stage === 'apply') {
      setSortMode('decisionMargin')
      setSortDirection('desc')
    }
    setHideTagged(stage === 'apply')
    setCurrentFeatureIndex(0)
    setSelectedFeatureIdState(null)
  }, [activeStage, sortMode, sortDirection, setSortMode, setSortDirection, setHideTagged])

  // Bootstrap option cycling handler
  const handleBootstrapOptionChange = useCallback((mode: BootstrapMode) => {
    logAction('stage2', 'bootstrap_mode', { mode })
    if (mode === 'diversity') {
      setSortMode('diversity')
    } else {
      setSortMode('default')
      setSortDirection('asc')
    }
    setCurrentFeatureIndex(0)
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
          tooltipText: `SVM: ${info.svm_prediction === 1 ? 'Selected' : 'Rejected'}\nMajority (RF+MLP): ${majorityLabel}`
        })
      }
    })
    return lookup
  }, [tagAutomaticState?.committeeVotes])

  const disagreementIds = useMemo(() => new Set(disagreementLookup.keys()), [disagreementLookup])

  // Filter features based on hideTagged, showDisagreementOnly, and Apply-phase thresholds
  const displayFeatures = useMemo(() => {
    return sortedFeatures.filter(f => {
      if (hideTagged && featureSelectionStates.has(f.featureId)) return false
      if (showDisagreementOnly && !disagreementIds.has(String(f.featureId))) return false
      // In Apply phase, only show items past thresholds
      if (activeStage === 'apply' && tagAutomaticState?.histogramData) {
        if (featureSelectionStates.has(f.featureId)) return true
        const score = similarityScores.get(f.featureId)
        if (score === undefined) return false
        const reject = tagAutomaticState.rejectThreshold ?? -0.8
        const select = tagAutomaticState.selectThreshold ?? 0.8
        if (score >= reject && score < select) return false
      }
      return true
    })
  }, [sortedFeatures, hideTagged, featureSelectionStates, showDisagreementOnly, disagreementIds,
      activeStage, tagAutomaticState?.histogramData, tagAutomaticState?.rejectThreshold, tagAutomaticState?.selectThreshold, similarityScores])

  const allFeaturesLabeled = useMemo(() => {
    return featureList.length > 0 && featureSelectionStates.size >= featureList.length
  }, [featureList.length, featureSelectionStates.size])

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

  // ============================================================================
  // ACTION LOGGING (useEffect-based)
  // ============================================================================

  // #14 Threshold drag (debounced) — only fires on user drag, not on initial load
  const hasRenderedRef = useRef(false)
  const logThresholdDrag = useMemo(() => createDebouncedLogger('stage2', 'threshold_drag', 800), [])
  useEffect(() => {
    if (!hasRenderedRef.current) { hasRenderedRef.current = true; return }
    logThresholdDrag({ selectThreshold: tagAutomaticState?.selectThreshold, rejectThreshold: tagAutomaticState?.rejectThreshold })
  }, [tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold, logThresholdDrag])

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

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }>) => {
    useVisualizationStore.setState({ stage2CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage2CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds: Set<number>; counts: QualityCommitCounts }) => {
    const state = useVisualizationStore.getState()
    const currentTagState = state.tagAutomaticState
    const existingCommit = state.stage2FinalCommit

    const histogramState = (currentTagState && currentTagState.mode === 'feature' && currentTagState.histogramData)
      ? {
          histogramData: currentTagState.histogramData,
          selectThreshold: currentTagState.selectThreshold,
          rejectThreshold: currentTagState.rejectThreshold,
          flipTracking: currentTagState.flipTracking ?? null,
          committeeVotes: currentTagState.committeeVotes
        }
      : existingCommit?.histogramState

    setStage2FinalCommit({
      featureSelectionStates: new Map(data.states),
      featureSelectionSources: new Map(data.sources),
      featureIds: data.featureIds,
      counts: data.counts,
      histogramState,
      workflowActiveStage: existingCommit?.workflowActiveStage
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
      // Get current state to preserve histogram
      const state = useVisualizationStore.getState()
      const currentTagState = state.tagAutomaticState
      const existingCommit = state.stage2FinalCommit

      const histogramState = (currentTagState && currentTagState.mode === 'feature' && currentTagState.histogramData)
        ? {
            histogramData: currentTagState.histogramData,
            selectThreshold: currentTagState.selectThreshold,
            rejectThreshold: currentTagState.rejectThreshold,
            flipTracking: currentTagState.flipTracking ?? null,
            committeeVotes: currentTagState.committeeVotes
          }
        : existingCommit?.histogramState

      // Save to global store for Stage 2 revisit
      setStage2FinalCommit({
        featureSelectionStates: new Map(commit.states),
        featureSelectionSources: new Map(commit.sources),
        featureIds: commit.featureIds || new Set(),
        counts: commit.counts || { wellExplained: 0, needRevision: 0, unsure: 0, total: 0 },
        histogramState,
        workflowActiveStage: existingCommit?.workflowActiveStage
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
        return
      }

      sortBySimilarity()
    }
  }, [featureList, featureSelectionStates, featureSelectionSources, lastSortedSelectionSignature, sortBySimilarity])


  // Check if flip rate stable (last 5 iterations all < 3%)
  const isFlipRateStable = useMemo(() => {
    const history = tagAutomaticState?.flipTracking?.flipHistory
    if (!history || history.length < 5) return false
    const last5 = history.slice(-5)
    return last5.every(h => h.flipRate < 0.03)
  }, [tagAutomaticState?.flipTracking?.flipHistory])

  // Stability popover dismissal state — reset when condition goes away
  const [stabilityPopoverDismissed, setStabilityPopoverDismissed] = useState(false)
  useEffect(() => {
    if (!isFlipRateStable) setStabilityPopoverDismissed(false)
  }, [isFlipRateStable])


  // ============================================================================
  // PREVIEW KEYS - Items past threshold handles that will be auto-tagged
  // ============================================================================

  const previewRejectIds = useMemo(() => {
    const ids = new Set<number>()
    if (!tagAutomaticState?.histogramData || activeStage !== 'apply') return ids
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8
    featureList.forEach((f: { featureId: number }) => {
      const score = similarityScores.get(f.featureId)
      if (score !== undefined && score < rejectThreshold) ids.add(f.featureId)
    })
    return ids
  }, [featureList, similarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.rejectThreshold, activeStage])

  const previewSelectIds = useMemo(() => {
    const ids = new Set<number>()
    if (!tagAutomaticState?.histogramData || activeStage !== 'apply') return ids
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    featureList.forEach((f: { featureId: number }) => {
      const score = similarityScores.get(f.featureId)
      if (score !== undefined && score >= selectThreshold) ids.add(f.featureId)
    })
    return ids
  }, [featureList, similarityScores, tagAutomaticState?.histogramData, tagAutomaticState?.selectThreshold, activeStage])

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

  // Fetch consensus data when selected feature changes (with client-side cache)
  useEffect(() => {
    if (selectedFeatureId === null) {
      setConsensus(null)
      return
    }

    const cached = consensusCacheRef.current.get(selectedFeatureId)
    if (cached) {
      setConsensus(cached)
      return
    }

    setConsensus(null)
    getFeatureConsensus(selectedFeatureId)
      .then(data => {
        consensusCacheRef.current.set(selectedFeatureId, data)
        setConsensus(data)
      })
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

  // Show learn popover when all bootstrap items are labeled
  const lastRepReviewed = activeStage === 'bootstrap' && displayFeatures.length > 0 && reviewedFeatureIds.has(displayFeatures[displayFeatures.length - 1].featureId)

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
    logAction('stage2', 'navigate_previous', {})
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.min(displayFeatures.length - 1, i + 1))
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
    hideTagged,
    onClearStoredSelection: () => setSelectedFeatureIdState(null)
  })

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's selection state
  const currentSelectionState = useMemo(() => {
    if (!selectedFeatureData) return null
    return featureSelectionStates.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, featureSelectionStates])

  // Preview state: show stripe when item is in threshold region but not yet applied
  const currentPreviewState = useMemo(() => {
    if (!selectedFeatureData || currentSelectionState !== null) return null
    if (previewSelectIds.has(selectedFeatureData.featureId)) return 'selected' as const
    if (previewRejectIds.has(selectedFeatureData.featureId)) return 'rejected' as const
    return null
  }, [selectedFeatureData, currentSelectionState, previewSelectIds, previewRejectIds])

  // Mark item as reviewed (for popover trigger)
  const markReviewed = useCallback((featureId: number) => {
    setReviewedFeatureIds(prev => prev.has(featureId) ? prev : new Set(prev).add(featureId))
  }, [])

  // Handle Well-Explained click (selected)
  const handleWellExplainedClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)
    const previousTag = currentSelectionState === 'selected' ? 'Well-Explained' : currentSelectionState === 'rejected' ? 'Need Revision' : 'Unsure'
    logAction('stage2', 'manual_tag', { tag: 'Well-Explained', previousTag, featureId })

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
      setLastClickTagAction({ stage: 'feature', featureId })
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostTagNavigation, setLastClickTagAction, markReviewed])

  // Handle Need Revision click (rejected)
  const handleNeedRevisionClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)
    const previousTag = currentSelectionState === 'selected' ? 'Well-Explained' : currentSelectionState === 'rejected' ? 'Need Revision' : 'Unsure'
    logAction('stage2', 'manual_tag', { tag: 'Need Revision', previousTag, featureId })

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
      setLastClickTagAction({ stage: 'feature', featureId })
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostTagNavigation, setLastClickTagAction, markReviewed])

  // Handle Unsure click (clear selection)
  const handleUnsureClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)
    const previousTag = currentSelectionState === 'selected' ? 'Well-Explained' : currentSelectionState === 'rejected' ? 'Need Revision' : 'Unsure'
    logAction('stage2', 'manual_tag', { tag: 'Unsure', previousTag, featureId })

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
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, handlePostUnsureNavigation, markReviewed])

  // ============================================================================
  // CLICK HANDLERS
  // ============================================================================

  // Handle click on feature in top row list
  const handleFeatureListClick = useCallback((index: number) => {
    // Set feature ID first (survives mode switches)
    const feature = displayFeatures[index]
    if (feature) {
      logAction('stage2', 'feature_click', { featureId: feature.featureId, index })
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
    const selectTh = tagAutomaticState?.selectThreshold
    const rejectTh = tagAutomaticState?.rejectThreshold
    logAction('stage2', 'apply_tags', {
      selectThreshold: selectTh,
      rejectThreshold: rejectTh,
      previewSelectCount: previewSelectIds.size,
      previewRejectCount: previewRejectIds.size,
    })

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Apply auto-tags (effect will sync to NEW commit)
    applySimilarityTags()

    // 3. Switch to decision margin sort and reset
    setSortMode('decisionMargin')
    setCurrentFeatureIndex(0)
  }, [createCommit, applySimilarityTags, setSortMode, tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold, previewSelectIds, previewRejectIds])

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

    // 3. Log and apply the new states to store (effect will sync to current commit)
    logAction('stage2', 'tag_all_need_revision', { count: taggedCount, totalFeatures: featureList.length })
    restoreFeatureSelectionStates(newStates, newSources)
  }, [featureList, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates, createCommit])

  // Handle Tag All - By Decision Boundary
  const handleTagAllByBoundary = useCallback(() => {
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

    // 3. Log and apply the new states to store (effect will sync to current commit)
    logAction('stage2', 'tag_all_by_boundary', { wellExplainedCount: selectedCount, needRevisionCount: rejectedCount })
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
        <span className="view-title">Explanation Adequacy</span>
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
              onBootstrapModeChange={handleBootstrapOptionChange}
              onBootstrapOptionChange={handleBootstrapOptionChange}
              hasDiversityIds={diversityFeatureIds.size > 0}
              learnDisabled={!tagAutomaticState?.histogramData}
              applyDisabled={!tagAutomaticState?.histogramData}
              showLearnPopover={lastRepReviewed}
              diversityLabel={`Most Critical ${diversityFeatureIds.size}`}
              byScoreLabel="Avg. Metric Score"
              hideTagged={hideTagged}
              onHideTaggedChange={(v: boolean) => { logAction('stage2', 'hide_tagged', { enabled: v }); setHideTagged(v) }}
              allItemsLabeled={allFeaturesLabeled}
              showDisagreementOnly={showDisagreementOnly}
              onShowDisagreementOnlyChange={(v: boolean) => { logAction('stage2', 'show_disagreement', { enabled: v }); setShowDisagreementOnly(v) }}
              hasDisagreementData={tagAutomaticState?.committeeVotes != null && tagAutomaticState.committeeVotes.size > 0}
              badges={[{
                label: activeStage === 'apply'
                  ? (showDisagreementOnly
                      ? 'Thresholded Disagr. Features'
                      : hideTagged
                        ? 'Thresholded Unlabeled Features'
                        : 'Thresholded Features')
                  : showDisagreementOnly
                    ? 'Disagr. Features'
                    : sortMode === 'diversity'
                      ? 'Most Critical Features'
                      : hideTagged
                        ? 'Unlabeled Features'
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
                    <h4 className="subheader" title="Background opacity shows activation strength. Blue-bordered tokens mark recurring patterns.">Activating Examples <span className="instruction-subheader">of</span> <span className="panel-header__id">#{selectedFeatureData.featureId}</span></h4>
                    {/* Spacer to push legends to the right */}
                    <div style={{ flex: 1 }} />
                    {/* Activation legend */}
                    <div className="legend-group">
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--activation">token</span>:
                        <span className="legend-label">Activation Strength</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--intra">token</span>:
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
                    <span className="subheader">Explainer Consensus</span>
                    <div style={{ flex: 1 }} />
                    <ConsensusLegend />
                  </div>
                  <ConsensusSection consensus={consensus} onPhraseHover={setHighlightPhrases} />

                  {/* Explanation Header */}
                  <div className="quality-view__explanation-header">
                    <span className="subheader">Metric Consensus</span>
                    <div className="legend-separator" />
                    <span className="subheader">Explanations</span>
                    <div style={{ flex: 1 }} />
                    <CrossMetricLegend />
                  </div>

                  {/* Explanation Section - All Explainers (plain text) */}
                  <div className="quality-view__explanation-row">
                    <div className="cross-metric-column">
                      <CrossMetricConsensus
                        explainerIds={tableData?.explainer_ids || []}
                        featureRow={selectedFeatureData?.row || null}
                      />
                    </div>
                    <div className="quality-view__explanation-section">
                      <div className="quality-view__explanation-content">
                        {tableData?.explainer_ids && tableData.explainer_ids.length > 0 ? (
                          tableData.explainer_ids.map((explainerId: string) => {
                            const explanationText = selectedFeatureData?.row?.explainers?.[explainerId]?.explanation_text?.trim()
                            const qualityScore = selectedFeatureData?.row?.explainers?.[explainerId]?.quality_score
                            const isHighlighted = highlightPhrases?.some(p => p.explainer === explainerId)
                            const badgeStyle: React.CSSProperties | undefined =
                              qualityScore != null
                                ? (() => { const bg = scoreToColor(qualityScore); return { backgroundColor: bg, color: textColorForBackground(bg) } })()
                                : undefined
                            return (
                              <div
                                key={explainerId}
                                className="quality-view__explainer-block"
                              >
                                <span
                                  className={`quality-view__explainer-name quality-view__explainer-name--${explainerId}${
                                    isHighlighted ? ' quality-view__explainer-name--highlighted' : ''
                                  }`}
                                  style={badgeStyle}
                                >
                                  {getExplainerDisplayName(explainerId)}
                                </span>
                                {!explanationText ? (
                                  <span className="quality-view__explainer-text">
                                    <span className="quality-view__no-explanation">No explanation available</span>
                                  </span>
                                ) : (
                                  <ExplanationWithPopover
                                    text={explanationText}
                                    className="quality-view__explainer-text"
                                  >
                                    {highlightPhrases ? (
                                      segmentTextByOffsets(explanationText, highlightPhrases, explainerId).map((seg, i) =>
                                        seg.highlight
                                          ? <mark key={i} className="quality-view__phrase-highlight">{seg.text}</mark>
                                          : <span key={i}>{seg.text}</span>
                                      )
                                    ) : undefined}
                                  </ExplanationWithPopover>
                                )}
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

                    {/* Selection buttons - Need Revision | Well-Explained */}
                    <TagButton
                      label="Need Revision"
                      variant="need-revision"
                      color={needRevisionColor}
                      isSelected={currentSelectionState === 'rejected' || currentPreviewState === 'rejected'}
                      isAuto={currentPreviewState === 'rejected'}
                      onClick={handleNeedRevisionClick}
                    />
                    <TagButton
                      label="Well-Explained"
                      variant="well-explained"
                      color={wellExplainedColor}
                      isSelected={currentSelectionState === 'selected' || currentPreviewState === 'selected'}
                      isAuto={currentPreviewState === 'selected'}
                      onClick={handleWellExplainedClick}
                    />

                    {/* Next button */}
                    <button
                      className="nav__button"
                      onClick={() => { logAction('stage2', 'navigate_next', {}); handleNavigateNext() }}
                      disabled={currentFeatureIndex >= displayFeatures.length - 1}
                    >
                      Next →
                    </button>

                    {/* Secondary actions: Undo + Unsure */}
                    <div className="floating-controls__secondary">
                      <button
                        className="nav__button nav__button--undo"
                        onClick={() => {
                          const featureId = lastClickTagAction?.featureId
                          undoLastClickTag()
                          if (featureId != null) setSelectedFeatureIdState(featureId)
                        }}
                        disabled={!lastClickTagAction}
                        title="Undo last tag"
                      >
                        ↩ Undo
                      </button>
                      <TagButton
                        label="Unsure"
                        variant="unsure"
                        color={unsureColor}
                        isSelected={currentSelectionState === null}
                        onClick={handleUnsureClick}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="quality-view__placeholder-text">
                  <span>No features to display</span>
                  {(() => {
                    const hints: string[] = []
                    if (showDisagreementOnly) hints.push('uncheck "Disagreement Only"')
                    if (activeStage === 'apply' && !allFeaturesLabeled) hints.push('adjust the threshold range')
                    if (hideTagged && (activeStage !== 'apply' || allFeaturesLabeled)) hints.push('uncheck "Hide Labeled" to review labeled features')
                    if (hints.length === 0) return null
                    const text = hints[0].charAt(0).toUpperCase() + hints[0].slice(1)
                      + (hints.length > 1 ? ', or ' + hints.slice(1).join(', or ') : '')
                    return <span className="empty-state-subtext">{text}</span>
                  })()}
                </div>
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
              filteredFeatureIds: selectedFeatureIds || undefined,
              focusedItemId: selectedFeatureId != null ? String(selectedFeatureId) : null
            }}
            onApplyTags={handleApplyTags}
            onTagAll={handleTagAll}
            activeStage={activeStage}
            showStabilityPopover={isFlipRateStable && !stabilityPopoverDismissed}
            onDismissStabilityPopover={() => setStabilityPopoverDismissed(true)}
          />
          </div>
        </div>

        {/* Right column: Next Stage - spans full height including StatusPanel */}
        <div className="next-stage-column">
          <button
            className="action-button action-button--next"
            onClick={() => { logAction('stage2', 'move_to_next_stage', {}); moveToNextStep() }}
            disabled={!allFeaturesTagged}
            title={allFeaturesTagged ? 'Proceed to Stage 3: Root Cause' : `Label all features first (${featureSelectionStates.size}/${featureList.length})`}
          >
            Move to Stage 3 Root Cause ↑
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(QualityView)
