import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import * as api from '../api'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import { ScrollableItemList } from './ScrollableItemList'
import { TagBadge, TagButton } from './Indicators'
import { isBimodalScore } from '../lib/modality-utils'
import { useSortableList } from '../lib/tagging-hooks/useSortableList'
import { useCommitHistory, createFeatureCommitHistoryOptions, type DisplayCommit, useListNavigation, useTaggingNavigation } from '../lib/tagging-hooks'
import ActivationExample from './ActivationExamplePanel'
import { HighlightedExplanation } from './ExplanationPanel'
import { TAG_CATEGORY_QUALITY, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import { SEMANTIC_SIMILARITY_COLORS } from '../lib/color-utils'
import ExplainerComparisonGrid from './ExplainerComparisonGrid'
import StatusPanel from './StatusPanel'
import { useResizeObserver } from '../lib/utils'
import '../styles/QualityView.css'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// QUALITY VIEW - Organized layout for quality assessment workflow (Stage 2)
// ============================================================================
// Layout: [Top: feature list + right panel] | [Bottom: ThresholdTaggingPanel]

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

  // Hide tagged items toggle (start false in representative mode, enable after SVM training)
  const [hideTagged, setHideTagged] = useState(false)

  // Diversity sort: IDs of diverse features (Kennard-Stone samples) to show first
  const [diversityFeatureIds, setDiversityFeatureIds] = useState<Set<number>>(new Set())

  // Auto-enable hideTagged once when SVM training starts
  const hasAutoEnabledHideTagged = useRef(false)
  const svmTrainingStarted = similarityScores.size > 0
  useEffect(() => {
    if (svmTrainingStarted && !hasAutoEnabledHideTagged.current) {
      hasAutoEnabledHideTagged.current = true
      setHideTagged(true)
    }
  }, [svmTrainingStarted])

  // List navigation hook - handles switching between all/reject/select lists
  const resetFeatureIndex = useCallback(() => setCurrentFeatureIndex(0), [])
  const { activeListSource, setActiveListSource } = useListNavigation({
    isDraggingThreshold,
    onReset: resetFeatureIndex
  })

  // Top row feature list state - currentPage derived from currentFeatureIndex
  const ITEMS_PER_PAGE = 10
  const currentPage = Math.floor(currentFeatureIndex / ITEMS_PER_PAGE)

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
  useEffect(() => {
    const fetchDiversityIds = async () => {
      if (!selectedFeatureIds || selectedFeatureIds.size < 6) {
        setDiversityFeatureIds(new Set())
        return
      }

      try {
        const response = await api.getColdStartSuggestions(
          'feature',
          Array.from(selectedFeatureIds),
          20  // Get 20 diverse features via Kennard-Stone
        )
        setDiversityFeatureIds(new Set(response.suggestions.map(s => parseInt(s.id, 10))))
      } catch (error) {
        console.error('[QualityView] Failed to fetch diversity IDs:', error)
        setDiversityFeatureIds(new Set())
      }
    }

    fetchDiversityIds()
  }, [selectedFeatureIds])

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
    getDisplayScore,
    isTemplateSort
  } = useSortableList({
    items: featureList,
    getItemKey: (f: typeof featureList[0]) => f.featureId,
    getDefaultScore: (f: typeof featureList[0]) => f.qualityScore,
    decisionMarginScores: similarityScores,
    diversityIds: diversityFeatureIds,
    defaultLabel: 'Quality score',
    defaultDirection: 'asc',
    templateMode: 'decisionMargin',
    templateDirection: 'asc',
    initialMode: 'diversity',
    initialDirection: 'asc'
  })

  // Filter features based on hideTagged toggle
  const displayFeatures = useMemo(() => {
    if (!hideTagged) return sortedFeatures
    return sortedFeatures.filter(f => !featureSelectionStates.has(f.featureId))
  }, [sortedFeatures, hideTagged, featureSelectionStates])

  // Reset to first feature when hideTagged changes (to avoid index out of bounds)
  const prevHideTaggedRef = useRef(hideTagged)
  useEffect(() => {
    if (prevHideTaggedRef.current !== hideTagged) {
      setCurrentFeatureIndex(0)
      setActiveListSource('all')
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged, setActiveListSource])

  // Track if we've auto-switched to decision margin mode for this session
  const hasAutoSwitchedToDecisionMarginRef = useRef(false)

  // Auto-switch to Decision Margin sort when histogram first becomes available
  // Only switch if histogram is for feature mode (Stage 2), not pair mode (Stage 1)
  // This prevents race condition where pair mode histogram from Stage 1 arrives late
  useEffect(() => {
    if (tagAutomaticState?.histogramData &&
        tagAutomaticState?.mode === 'feature' &&
        !hasAutoSwitchedToDecisionMarginRef.current) {
      hasAutoSwitchedToDecisionMarginRef.current = true
      setSortMode('decisionMargin')
      setSortDirection('asc')
      setCurrentFeatureIndex(0)
      setActiveListSource('all')
    }
  }, [tagAutomaticState?.histogramData, tagAutomaticState?.mode, setSortMode, setSortDirection, setActiveListSource])

  // Reset to first item when sort mode or direction changes
  // This ensures the selection indicator points to a valid item after re-sorting
  const prevSortRef = useRef({ sortMode, sortDirection })
  useEffect(() => {
    if (prevSortRef.current.sortMode !== sortMode || prevSortRef.current.sortDirection !== sortDirection) {
      setCurrentFeatureIndex(0)
      setActiveListSource('all')
      prevSortRef.current = { sortMode, sortDirection }
    }
  }, [sortMode, sortDirection, setActiveListSource])

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

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'manual' | 'auto'>; featureIds?: Set<number> }>) => {
    useVisualizationStore.setState({ stage2CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage2CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<number, 'selected' | 'rejected'>; sources: Map<number, 'manual' | 'auto'>; featureIds: Set<number>; counts: QualityCommitCounts }) => {
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
  const { createCommit } = useCommitHistory<Map<number, 'selected' | 'rejected'>, Map<number, 'manual' | 'auto'>, QualityCommitCounts>({
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

  // Pagination for the top row list (use displayFeatures for filtered view)
  const totalPages = Math.max(1, Math.ceil(displayFeatures.length / ITEMS_PER_PAGE))
  const currentPageFeatures = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE
    return displayFeatures.slice(start, start + ITEMS_PER_PAGE)
  }, [displayFeatures, currentPage, ITEMS_PER_PAGE])

  // Reset to valid index when features change
  useEffect(() => {
    if (currentFeatureIndex >= displayFeatures.length && displayFeatures.length > 0) {
      setCurrentFeatureIndex(displayFeatures.length - 1)
    }
  }, [displayFeatures.length, currentFeatureIndex])

  // Auto-populate similarity scores when feature list is ready or selection states change
  useEffect(() => {
    // Extract manual selections to compute signature
    const currentSelectedIds: number[] = []
    const currentRejectedIds: number[] = []
    featureSelectionStates.forEach((state, featureId) => {
      const source = featureSelectionSources.get(featureId)
      if (source === 'manual') {
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


  // ============================================================================
  // SELECTED FEATURE DATA (for right panel)
  // ============================================================================

  // Get the currently selected feature's data (use displayFeatures for filtered view)
  const selectedFeatureData = useMemo(() => {
    const feature = displayFeatures[currentFeatureIndex]
    if (!feature) return null

    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [displayFeatures, currentFeatureIndex, activationExamples])

  // Compute pairwise similarities for ExplainerComparisonGrid
  const pairwiseSimilarities = useMemo(() => {
    if (!selectedFeatureData?.row || !tableData?.explainer_ids) return undefined

    const similarities = new Map<string, number>()
    const explainerIds = tableData.explainer_ids

    for (const explainerId of explainerIds) {
      const explainerData = selectedFeatureData.row.explainers?.[explainerId]
      const semSim = explainerData?.semantic_similarity

      if (semSim) {
        for (const [otherExplainerId, similarity] of Object.entries(semSim)) {
          if (typeof similarity === 'number') {
            const key = `${explainerId}:${otherExplainerId}`
            similarities.set(key, similarity)
          }
        }
      }
    }

    return similarities
  }, [selectedFeatureData, tableData?.explainer_ids])

  // Compute quality scores for ExplainerComparisonGrid bar graphs
  const qualityScores = useMemo(() => {
    if (!selectedFeatureData?.row || !tableData?.explainer_ids) return undefined

    const scores = new Map<string, number>()

    for (const explainerId of tableData.explainer_ids) {
      const explainerData = selectedFeatureData.row.explainers?.[explainerId]
      const score = explainerData?.quality_score
      if (score !== null && score !== undefined) {
        scores.set(explainerId, score)
      }
    }

    return scores
  }, [selectedFeatureData, tableData?.explainer_ids])

  // Sort explainer IDs by quality score (highest first)
  const sortedExplainerIds = useMemo(() => {
    if (!tableData?.explainer_ids || !qualityScores) return tableData?.explainer_ids || []

    return [...tableData.explainer_ids].sort((a, b) => {
      const scoreA = qualityScores.get(a) ?? 0
      const scoreB = qualityScores.get(b) ?? 0
      return scoreB - scoreA  // Descending order (highest first)
    })
  }, [tableData?.explainer_ids, qualityScores])

  // Get all explainer explanations with highlighted segments, sorted by quality score
  const allExplainerExplanations = useMemo(() => {
    if (!selectedFeatureData?.row || !sortedExplainerIds || sortedExplainerIds.length === 0) return []

    return sortedExplainerIds.map((explainerId: string, sortedIndex: number) => {
      const explainerData = selectedFeatureData.row?.explainers?.[explainerId]
      return {
        explainerId,
        index: sortedIndex,  // Use sorted index for triangle alignment
        highlightedExplanation: explainerData?.highlighted_explanation ?? null,
        explanationText: explainerData?.explanation_text ?? null
      }
    })
  }, [selectedFeatureData, sortedExplainerIds])

  // Compute average quality score for header display
  const averageQualityScore = useMemo(() => {
    if (!qualityScores || qualityScores.size === 0) return null
    let total = 0
    for (const score of qualityScores.values()) {
      total += score
    }
    return total / qualityScores.size
  }, [qualityScores])

  // Calculate triangle Y positions as percentages (matching ExplainerComparisonGrid layout)
  // These values are derived from the grid's viewBox (100) and cell positioning
  const triangleYPositions = useMemo(() => {
    // From ExplainerComparisonGrid: viewBox height = 100, triangleSize = 32, cellGap = 1.5
    const VIEWBOX_HEIGHT = 100
    const triangleSize = VIEWBOX_HEIGHT * 0.32
    const cellSize = triangleSize / 2
    const cellSpan = cellSize / Math.sqrt(2)
    const cellGap = 1.5
    const triangleVerticalOffset = cellSpan * 2 + cellGap * 2
    const topMargin = 5
    const vy = topMargin + triangleVerticalOffset + cellSpan

    // Triangle center Y positions (as percentages of viewBox height)
    return [
      (vy - triangleVerticalOffset) / VIEWBOX_HEIGHT * 100,  // Triangle 0 (top)
      vy / VIEWBOX_HEIGHT * 100,                              // Triangle 2 (middle)
      (vy + triangleVerticalOffset) / VIEWBOX_HEIGHT * 100,  // Triangle 5 (bottom)
    ]
  }, [])

  // Compute which explainers have valid explanations (for grid cell visibility)
  const hasExplanation = useMemo(() => {
    return allExplainerExplanations.map((item: { highlightedExplanation: { segments: unknown[] } | null; explanationText: string | null }) =>
      !!(item.highlightedExplanation?.segments || item.explanationText)
    )
  }, [allExplainerExplanations])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  type FeatureWithMetadata = {
    featureId: number
    qualityScore: number
    row: FeatureTableRow | null
  }

  // Keep previous boundary items during histogram reload
  const prevBoundaryItemsRef = useRef<{ rejectBelow: FeatureWithMetadata[], selectAbove: FeatureWithMetadata[] }>({ rejectBelow: [], selectAbove: [] })

  const boundaryItems = useMemo(() => {
    if (!tagAutomaticState?.histogramData) {
      if (prevBoundaryItemsRef.current.rejectBelow.length > 0 || prevBoundaryItemsRef.current.selectAbove.length > 0) {
        return prevBoundaryItemsRef.current
      }
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8

    if (featureList.length === 0) {
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    // Filter features that have SVM similarity scores
    const featuresWithScores = featureList.filter((f: FeatureWithMetadata) => similarityScores.has(f.featureId))

    if (featuresWithScores.length === 0) {
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    // REJECT THRESHOLD - Below reject: features < rejectThreshold, sorted descending (closest to threshold first)
    const rejectBelow = featuresWithScores
      .filter((f: FeatureWithMetadata) => similarityScores.get(f.featureId)! < rejectThreshold)
      .sort((a: FeatureWithMetadata, b: FeatureWithMetadata) => similarityScores.get(b.featureId)! - similarityScores.get(a.featureId)!)

    // SELECT THRESHOLD - Above select: features >= selectThreshold, sorted ascending (closest to threshold first)
    const selectAbove = featuresWithScores
      .filter((f: FeatureWithMetadata) => similarityScores.get(f.featureId)! >= selectThreshold)
      .sort((a: FeatureWithMetadata, b: FeatureWithMetadata) => similarityScores.get(a.featureId)! - similarityScores.get(b.featureId)!)

    const result = { rejectBelow, selectAbove }
    prevBoundaryItemsRef.current = result
    return result
  }, [featureList, tagAutomaticState, similarityScores])

  // Create Sets of preview feature IDs (items in threshold regions that will be auto-tagged)
  // Separate sets to know which direction they'll be tagged
  const previewRejectIds = useMemo(() => {
    const ids = new Set<number>()
    boundaryItems.rejectBelow.forEach((f: FeatureWithMetadata) => ids.add(f.featureId))
    return ids
  }, [boundaryItems.rejectBelow])

  const previewSelectIds = useMemo(() => {
    const ids = new Set<number>()
    boundaryItems.selectAbove.forEach((f: FeatureWithMetadata) => ids.add(f.featureId))
    return ids
  }, [boundaryItems.selectAbove])

  // Get tag colors for header badge and buttons
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#4CAF50'
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
    // Note: Do NOT reset activeListSource here (matches FeatureSplitView behavior)
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentFeatureIndex(i => Math.min(displayFeatures.length - 1, i + 1))
    // Note: Do NOT reset activeListSource here (matches FeatureSplitView behavior)
  }, [displayFeatures.length])

  // Reset to first feature in 'all' list (used after tagging in decision margin mode)
  const handleResetToFirst = useCallback(() => {
    setCurrentFeatureIndex(0)
    setActiveListSource('all')
  }, [setActiveListSource])

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
    const globalIndex = currentPage * ITEMS_PER_PAGE + index
    setCurrentFeatureIndex(globalIndex)
    setActiveListSource('all')
  }, [currentPage, ITEMS_PER_PAGE, setActiveListSource])

  // Render feature item for the ScrollableItemList
  // Score display is handled by ScrollableItemList's sortConfig
  const renderFeatureItem = useCallback((feature: typeof featureList[0], index: number) => {
    const selectionState = featureSelectionStates.get(feature.featureId)
    const isAutoSource = featureSelectionSources.get(feature.featureId) === 'auto'
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

    return (
      <TagBadge
        featureId={feature.featureId}
        tagName={tagName}
        tagCategoryId={TAG_CATEGORY_QUALITY}
        onClick={() => handleFeatureListClick(index)}
        fullWidth={true}
        isAuto={isAutoOrPreview}
      />
    )
  }, [featureSelectionStates, featureSelectionSources, previewRejectIds, previewSelectIds, handleFeatureListClick])

  const handleBoundaryListClick = useCallback((listType: 'left' | 'right', index: number) => {
    const items = listType === 'left' ? boundaryItems.rejectBelow : boundaryItems.selectAbove
    if (index >= 0 && index < items.length) {
      setActiveListSource(listType === 'left' ? 'reject' : 'select')
      setCurrentFeatureIndex(index)
    }
  }, [boundaryItems.rejectBelow, boundaryItems.selectAbove, setActiveListSource])

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
    setActiveListSource('all')
  }, [createCommit, applySimilarityTags, setSortMode, setActiveListSource])

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  const isBimodal = useMemo(() => {
    return isBimodalScore(tagAutomaticState?.histogramData?.bimodality)
  }, [tagAutomaticState?.histogramData?.bimodality])

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
        newSources.set(f.featureId, 'manual')
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
          newSources.set(f.featureId, 'manual')
          selectedCount++
        } else {
          newStates.set(f.featureId, 'rejected')
          newSources.set(f.featureId, 'manual')
          rejectedCount++
        }
      } else {
        newStates.set(f.featureId, 'rejected')
        newSources.set(f.featureId, 'manual')
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
        {/* Main column: StatusPanel + Content rows */}
        <div className="quality-view__main">
          {/* Status panel - sorting controls */}
          <StatusPanel
            sortMode={sortMode}
            sortDirection={sortDirection}
            onSortModeChange={setSortMode}
            onSortDirectionChange={setSortDirection}
            hasDiversityIds={diversityFeatureIds.size > 0}
            defaultAscLabel="Lowest Quality First"
            defaultDescLabel="Highest Quality First"
            isTemplateSort={isTemplateSort}
            decisionMarginDisabled={!tagAutomaticState?.histogramData}
            hideTagged={hideTagged}
            onHideTaggedChange={setHideTagged}
          />

          {/* Content: 2 rows */}
          <div className="quality-view__content">
          {/* Top row: Feature list + right panel */}
          <div className="quality-view__row-top">
            <ScrollableItemList
              variant="features"
              badges={[{
                label: diversityFeatureIds.size > 0 && !svmTrainingStarted
                  ? 'Representative Features'
                  : hideTagged
                    ? 'Untagged Features'
                    : 'All Features',
                count: displayFeatures.length
              }]}
              columnHeader={columnHeaderProps}
              items={currentPageFeatures}
              renderItem={renderFeatureItem}
              sortConfig={{ getDisplayScore }}
              currentIndex={activeListSource === 'all' ? currentFeatureIndex % ITEMS_PER_PAGE : -1}
              isActive={activeListSource === 'all'}
              isTemplateSort={isTemplateSort}
              pageNavigation={{
                currentPage,
                totalPages,
                onPreviousPage: () => {
                  if (currentPage > 0) {
                    setCurrentFeatureIndex((currentPage - 1) * ITEMS_PER_PAGE)
                  }
                },
                onNextPage: () => {
                  if (currentPage < totalPages - 1) {
                    setCurrentFeatureIndex((currentPage + 1) * ITEMS_PER_PAGE)
                  }
                }
              }}
            />
            {/* Right panel - activation examples and explanations */}
            <div className="quality-view__right-panel" ref={rightPanelRef}>
              {selectedFeatureData ? (
                <>
                  {/* Header row - Feature ID and Legends */}
                  <div className="quality-view__header-row">
                    <h4 className="subheader">Activation Examples</h4>
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
                        <span className="legend-sample legend-sample--intra">token</span>:
                        <span className="legend-label">Feature-Specific Pattern</span>
                      </div>
                    </div>
                  </div>

                  {/* Activation Examples Section */}
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
                        <div className="quality-view__loading">Loading activation examples...</div>
                      )}
                    </div>
                  </div>

                  {/* Explanation Header - Subheader and legend outside container */}
                  <div className="quality-view__explanation-header">
                    <span className="subheader subheader--with-value">
                      Explanations
                      <span className="subheader__label">Avg. Quality Score:</span>
                      <span className="subheader__value">
                        {averageQualityScore !== null ? averageQualityScore.toFixed(3) : 'N/A'}
                      </span>
                    </span>
                    {/* Semantic similarity legend - shapes and colors */}
                    <div className="quality-view__explanation-legend">
                      <span className="legend-group-label">Semantic Similarity:</span>
                      {/* Shape legend - granularity */}
                      <div className="legend-item">
                        <svg width="18" height="18" viewBox="0 0 18 18" style={{ verticalAlign: 'middle' }}>
                          <polygon points="9,1 17,9 9,17 1,9" fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1" />
                        </svg>
                        <span className="legend-label">Explanation-wise</span>
                      </div>
                      <div className="legend-item">
                        <span
                          className="legend-swatch-rect"
                          style={{ backgroundColor: '#e5e7eb', border: '1px solid #d1d5db' }}
                        />
                        <span className="legend-label">Phrase-wise</span>
                      </div>
                      <span className="legend-separator">|</span>
                      {/* Color scale legend */}
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.HIGH }} />
                        <span className="legend-label">≥0.85</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.MEDIUM }} />
                        <span className="legend-label">≥0.70</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.LOW }} />
                        <span className="legend-label">≥0.60</span>
                      </div>
                    </div>
                  </div>

                  {/* Explanation Row - Left grid + Explanations */}
                  <div className="quality-view__explanation-row">
                    {/* Left: Explainer comparison grid */}
                    <div className="quality-view__explanation-left">
                      <ExplainerComparisonGrid
                        cellGap={2}
                        explainerIds={sortedExplainerIds}
                        pairwiseSimilarities={pairwiseSimilarities}
                        qualityScores={qualityScores}
                        hasExplanation={hasExplanation}
                        onPairClick={(exp1, exp2) => {
                          console.log('Clicked pair:', exp1, exp2)
                        }}
                      />
                    </div>

                    {/* Explanation Section - All 3 Explainers (aligned with grid triangles) */}
                    <div className="quality-view__explanation-section">
                      <div className="quality-view__explanation-content">
                        {allExplainerExplanations.length > 0 ? (
                          allExplainerExplanations.map(({ explainerId, index, highlightedExplanation, explanationText }: {
                            explainerId: string
                            index: number
                            highlightedExplanation: { segments: Array<{ text: string; highlight: boolean }> } | null
                            explanationText: string | null
                          }) => (
                            <div
                              key={explainerId}
                              className="quality-view__explainer-block"
                              style={{ top: `${triangleYPositions[index]}%` }}
                            >
                              <span
                                className={`quality-view__explainer-name quality-view__explainer-name--${explainerId}`}
                              >
                                {getExplainerDisplayName(explainerId)}
                              </span>
                              <span className="quality-view__explainer-text">
                                {highlightedExplanation?.segments ? (
                                  <HighlightedExplanation
                                    segments={highlightedExplanation.segments}
                                    truncated={false}
                                    hasNoActivations={!selectedFeatureData?.activation?.quantile_examples?.length}
                                  />
                                ) : (
                                  <span className="quality-view__no-explanation">
                                    {explanationText || 'No explanation available'}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="quality-view__no-explanation">No explanations available</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Floating control panel at bottom */}
                  <div className="quality-view__floating-controls">
                    {/* Previous button */}
                    <button
                      className="nav__button"
                      onClick={handleNavigatePrevious}
                      disabled={currentFeatureIndex === 0}
                    >
                      ← Prev
                    </button>

                    {/* Selection buttons */}
                    <TagButton
                      label="Unsure"
                      variant="unsure"
                      color={unsureColor}
                      isSelected={currentSelectionState === null}
                      onClick={handleUnsureClick}
                    />
                    <TagButton
                      label="Need Revision"
                      variant="need-revision"
                      color={needRevisionColor}
                      isSelected={currentSelectionState === 'rejected'}
                      onClick={handleNeedRevisionClick}
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
            leftFeatures={boundaryItems.rejectBelow}
            rightFeatures={boundaryItems.selectAbove}
            leftListLabel="Need Revision"
            rightListLabel="Well-Explained"
            histogramProps={{
              filteredFeatureIds: selectedFeatureIds || undefined
            }}
            onApplyTags={handleApplyTags}
            onTagAll={handleTagAll}
            onListItemClick={handleBoundaryListClick}
            activeListSource={activeListSource}
            currentIndex={currentFeatureIndex}
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
