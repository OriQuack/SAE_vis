import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import UMAPScatter from './UMAPScatter'
import { ScrollableItemList } from './ScrollableItemList'
import { TagBadge, TagButton, CauseMetricBars } from './Indicators'
import ActivationExample from './ActivationExamplePanel'
import { HighlightedExplanation } from './ExplanationPanel'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import { SEMANTIC_SIMILARITY_COLORS } from '../lib/color-utils'
import type { CauseCategory } from '../lib/umap-utils'
import { useCommitHistory, createCauseCommitHistoryOptions, type Commit } from '../lib/tagging-hooks'
import { CauseMetricBarsDetail } from './CauseMetricBarsDetail'
import '../styles/CauseView.css'

// ============================================================================
// CAUSE VIEW - Root cause analysis workflow (Stage 3)
// ============================================================================
// Layout: [Content: UMAP + Selected Features List + Right Panel]

// Commit history types
export interface CauseCommitCounts {
  noisyActivation: number
  missedNgram: number
  missedContext: number
  wellExplained: number
  unsure: number
  total: number
}

// Local type alias for cause commit with CauseCommitCounts
type CauseCommit = Commit<Map<number, CauseCategory>, Map<number, 'manual' | 'auto'>, CauseCommitCounts>

// Map CauseCategory to display tag names
const CAUSE_TAG_NAMES: Record<CauseCategory, string> = {
  'noisy-activation': 'Noisy Activation',
  'missed-N-gram': 'Pattern Miss',
  'missed-context': 'Context Miss',
  'well-explained': 'Well-Explained'
}


interface CauseViewProps {
  className?: string
}

const CauseView: React.FC<CauseViewProps> = ({
  className = ''
}) => {
  // Store state
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)

  // Dependencies for selectedFeatureIds
  const sankeyStructure = useVisualizationStore(state => state.leftPanel?.sankeyStructure)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Stage 3 revisiting state
  const isRevisitingStage3 = useVisualizationStore(state => state.isRevisitingStage3)
  const stage3FinalCommit = useVisualizationStore(state => state.stage3FinalCommit)
  const setStage3FinalCommit = useVisualizationStore(state => state.setStage3FinalCommit)
  const restoreCauseSelectionStates = useVisualizationStore(state => state.restoreCauseSelectionStates)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeMetricScores = useVisualizationStore(state => state.causeMetricScores)


  // UMAP selected features and projection data
  const umapBrushedFeatureIds = useVisualizationStore(state => state.umapBrushedFeatureIds)
  const umapProjection = useVisualizationStore(state => state.umapProjection)

  // Table data and activation examples for feature detail view
  const tableData = useVisualizationStore(state => state.tableData)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Cause category selection action
  const setCauseCategory = useVisualizationStore(state => state.setCauseCategory)
  const initializeCauseMetricScores = useVisualizationStore(state => state.initializeCauseMetricScores)

  // SVM decision margins for auto-tagging by decision boundary
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)

  // Local state for feature detail view
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  const [currentSelectedIndex, setCurrentSelectedIndex] = useState(0)
  const [activeListSource, setActiveListSource] = useState<'all' | 'selected'>('selected')
  const [selectedSortDirection, setSelectedSortDirection] = useState<'asc' | 'desc'>('asc')
  const [containerWidth, setContainerWidth] = useState(600)
  const [selectedPage, setSelectedPage] = useState(0)

  // Pagination for selected features list
  const ITEMS_PER_PAGE = 5
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const hasAutoTaggedRef = useRef(false)

  // ============================================================================
  // COMMIT HISTORY - Using centralized hook
  // ============================================================================
  // Build initial commit for revisiting (if applicable)
  const initialCommitForRevisit = useMemo((): CauseCommit | null => {
    if (isRevisitingStage3 && stage3FinalCommit) {
      console.log('[CauseView] Building initial commit for revisit')
      // Mark as already auto-tagged since we're restoring
      hasAutoTaggedRef.current = true
      return {
        id: 1,
        type: 'tagAll',
        states: new Map(stage3FinalCommit.causeSelectionStates),
        sources: new Map(stage3FinalCommit.causeSelectionSources),
        counts: stage3FinalCommit.counts || { noisyActivation: 0, missedNgram: 0, missedContext: 0, wellExplained: 0, unsure: 0, total: 0 },
        featureIds: stage3FinalCommit.featureIds ? new Set(stage3FinalCommit.featureIds) : undefined
      }
    }
    return null
  }, [isRevisitingStage3, stage3FinalCommit])

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    // If revisiting Stage 3 and we have stored feature IDs, use those
    if (isRevisitingStage3 && stage3FinalCommit?.featureIds) {
      console.log('[CauseView] Using stored Stage 3 feature IDs:', stage3FinalCommit.featureIds.size)
      return stage3FinalCommit.featureIds
    }

    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps
    const features = getSelectedNodeFeatures()
    console.log('[CauseView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage3, stage3FinalCommit])

  // ============================================================================
  // METRIC SCORE INITIALIZATION - Calculate scores when entering Stage 3
  // ============================================================================
  useEffect(() => {
    // Skip if revisiting (will restore from commit) or already initialized
    if (isRevisitingStage3 || hasAutoTaggedRef.current) return

    // Wait for all required data
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return
    if (!tableData?.features) return

    console.log('[CauseView] Initializing metric scores for', selectedFeatureIds.size, 'features (no auto-tagging)')

    // Calculate metric scores only (features start as unsure)
    initializeCauseMetricScores(selectedFeatureIds)
    hasAutoTaggedRef.current = true
  }, [isRevisitingStage3, selectedFeatureIds, tableData, activationExamples, initializeCauseMetricScores])

  // Initialize stage3FinalCommit with initial state when first entering Stage 3
  // This ensures we can restore even if user does nothing and moves to Stage 4
  // Wait for metric scores to be calculated before creating the commit
  useEffect(() => {
    // Only initialize when: not revisiting, no saved commit yet, features exist, and scores are calculated
    if (!isRevisitingStage3 && !stage3FinalCommit && selectedFeatureIds && selectedFeatureIds.size > 0 && hasAutoTaggedRef.current) {
      // Calculate counts - all features start as unsure (no auto-tagging)
      let noisyActivation = 0
      let missedContext = 0
      let missedNgram = 0
      let wellExplained = 0
      let unsure = 0

      for (const featureId of selectedFeatureIds) {
        const category = causeSelectionStates.get(featureId)
        if (category === 'noisy-activation') noisyActivation++
        else if (category === 'missed-context') missedContext++
        else if (category === 'missed-N-gram') missedNgram++
        else if (category === 'well-explained') wellExplained++
        else unsure++
      }

      console.log('[CauseView] Initializing Stage 3 commit (all features start as unsure):', {
        total: selectedFeatureIds.size,
        noisyActivation,
        missedContext,
        missedNgram,
        wellExplained,
        unsure
      })

      setStage3FinalCommit({
        causeSelectionStates: new Map(causeSelectionStates),
        causeSelectionSources: new Map(causeSelectionSources),
        featureIds: new Set(selectedFeatureIds),
        counts: {
          noisyActivation,
          missedNgram,
          missedContext,
          wellExplained,
          unsure,
          total: selectedFeatureIds.size
        }
      })
    }
  }, [isRevisitingStage3, stage3FinalCommit, selectedFeatureIds, setStage3FinalCommit, causeSelectionStates, causeSelectionSources])


  // Get tag color for header badge (Need Revision - parent tag from Stage 2)
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af'

  // Convert selected feature IDs to array for ScrollableItemList
  const selectedFeatureList = useMemo(() => {
    return Array.from(umapBrushedFeatureIds)
  }, [umapBrushedFeatureIds])

  // Create Margin lookup map from UMAP projection data
  const decisionMarginMap = useMemo(() => {
    if (!umapProjection) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const point of umapProjection) {
      // Check for both null and undefined since API can return null
      if (point.decision_margin != null) {
        map.set(point.feature_id, point.decision_margin)
      }
    }
    return map
  }, [umapProjection])

  // Sort selected features by decision margin
  const sortedSelectedFeatureList = useMemo(() => {
    if (decisionMarginMap.size === 0) return selectedFeatureList
    return [...selectedFeatureList].sort((a, b) => {
      const marginA = decisionMarginMap.get(a) ?? 0
      const marginB = decisionMarginMap.get(b) ?? 0
      return selectedSortDirection === 'asc' ? marginA - marginB : marginB - marginA
    })
  }, [selectedFeatureList, decisionMarginMap, selectedSortDirection])

  // Pagination for selected features list
  const selectedTotalPages = Math.ceil(sortedSelectedFeatureList.length / ITEMS_PER_PAGE)
  const paginatedSelectedFeatureList = useMemo(() => {
    return sortedSelectedFeatureList.slice(
      selectedPage * ITEMS_PER_PAGE,
      (selectedPage + 1) * ITEMS_PER_PAGE
    )
  }, [sortedSelectedFeatureList, selectedPage])

  // Build feature list with metadata for the top row detail view (ALL features from segment)
  const featureListWithMetadata = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) return []

    const featureMap = new Map<number, FeatureTableRow>()
    tableData.features.forEach((row: FeatureTableRow) => {
      featureMap.set(row.feature_id, row)
    })

    return Array.from(selectedFeatureIds)
      .map(featureId => ({
        featureId,
        row: featureMap.get(featureId) || null
      }))
      .filter(item => item.row !== null)
  }, [tableData, selectedFeatureIds])

  // Check if all features are manually tagged (for enabling next stage button)
  const allTagged = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return false
    for (const featureId of selectedFeatureIds) {
      if (causeSelectionSources.get(featureId) !== 'manual') return false
    }
    return true
  }, [selectedFeatureIds, causeSelectionSources])

  // Reset feature index when selected list changes
  useEffect(() => {
    if (currentFeatureIndex >= featureListWithMetadata.length && featureListWithMetadata.length > 0) {
      setCurrentFeatureIndex(featureListWithMetadata.length - 1)
    } else if (featureListWithMetadata.length === 0) {
      setCurrentFeatureIndex(0)
    }
  }, [featureListWithMetadata.length, currentFeatureIndex])

  // Reset selected index when brushed features change (auto-select first feature)
  useEffect(() => {
    setCurrentSelectedIndex(0)
    setSelectedPage(0)
  }, [umapBrushedFeatureIds])

  // Track right panel width for ActivationExample
  useEffect(() => {
    if (!rightPanelRef.current) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width || 600
      setContainerWidth(width - 16)
    })
    observer.observe(rightPanelRef.current)
    return () => observer.disconnect()
  }, [])

  // Get selected feature data for right panel (based on which list is active)
  const selectedFeatureData = useMemo(() => {
    if (activeListSource === 'all') {
      const feature = featureListWithMetadata[currentFeatureIndex]
      if (!feature) return null
      return {
        featureId: feature.featureId,
        row: feature.row,
        activation: activationExamples[feature.featureId] || null
      }
    } else {
      // activeListSource === 'selected'
      const featureId = sortedSelectedFeatureList[currentSelectedIndex]
      if (featureId === undefined) return null
      const feature = featureListWithMetadata.find(f => f.featureId === featureId)
      if (!feature) return null
      return {
        featureId: feature.featureId,
        row: feature.row,
        activation: activationExamples[feature.featureId] || null
      }
    }
  }, [activeListSource, featureListWithMetadata, currentFeatureIndex, sortedSelectedFeatureList, currentSelectedIndex, activationExamples])

  // Find the best explanation (max quality score)
  const bestExplanation = useMemo(() => {
    if (!selectedFeatureData?.row || !tableData?.explainer_ids) return null

    let bestExplainerId: string | null = null
    let bestScore = -Infinity
    let bestData: {
      highlightedExplanation: { segments: Array<{ text: string; highlight: boolean }> } | null
      explanationText: string | null
      qualityScore: number
    } | null = null

    for (const explainerId of tableData.explainer_ids) {
      const explainerData = selectedFeatureData.row?.explainers?.[explainerId]
      const score = explainerData?.quality_score
      if (score !== null && score !== undefined && score > bestScore) {
        bestScore = score
        bestExplainerId = explainerId
        bestData = {
          highlightedExplanation: explainerData?.highlighted_explanation ?? null,
          explanationText: explainerData?.explanation_text ?? null,
          qualityScore: score
        }
      }
    }

    if (!bestExplainerId || !bestData) return null

    return {
      explainerId: bestExplainerId,
      ...bestData
    }
  }, [selectedFeatureData, tableData?.explainer_ids])

  // Handle click on feature in selected list (UMAP selection)
  const handleSelectedListClick = useCallback((index: number) => {
    const globalIndex = selectedPage * ITEMS_PER_PAGE + index
    setCurrentSelectedIndex(globalIndex)
    setActiveListSource('selected')
  }, [selectedPage])

  // Toggle sort direction for selected features list
  const toggleSelectedSortDirection = useCallback(() => {
    setSelectedSortDirection(dir => dir === 'asc' ? 'desc' : 'asc')
  }, [])

  // ============================================================================
  // COMMIT HISTORY HELPERS
  // ============================================================================

  // Helper function to compute cause counts from causeSelectionStates
  const getCauseCounts = useCallback((): CauseCommitCounts => {
    let noisyActivation = 0, missedNgram = 0, missedContext = 0, wellExplained = 0, unsure = 0

    featureListWithMetadata.forEach((f: typeof featureListWithMetadata[0]) => {
      const category = causeSelectionStates.get(f.featureId)
      if (category === 'noisy-activation') noisyActivation++
      else if (category === 'missed-N-gram') missedNgram++
      else if (category === 'missed-context') missedContext++
      else if (category === 'well-explained') wellExplained++
      else unsure++
    })

    return {
      noisyActivation,
      missedNgram,
      missedContext,
      wellExplained,
      unsure,
      total: featureListWithMetadata.length
    }
  }, [featureListWithMetadata, causeSelectionStates])

  // Use the commit history hook
  const {
    commits: tagCommitHistory,
    currentCommitIndex,
    saveCurrentState,
    createCommit
  } = useCommitHistory<Map<number, CauseCategory>, Map<number, 'manual' | 'auto'>, CauseCommitCounts>({
    ...createCauseCommitHistoryOptions(
      () => causeSelectionStates,
      () => causeSelectionSources,
      restoreCauseSelectionStates
    ),
    calculateCounts: getCauseCounts,
    getFeatureIds: () => selectedFeatureIds,
    onCommitCreated: (commit) => {
      // Save to global store for Stage 3 revisit
      setStage3FinalCommit({
        causeSelectionStates: new Map(commit.states),
        causeSelectionSources: new Map(commit.sources),
        featureIds: commit.featureIds || new Set(),
        counts: commit.counts || { noisyActivation: 0, missedNgram: 0, missedContext: 0, wellExplained: 0, unsure: 0, total: 0 }
      })
    },
    initialCommit: initialCommitForRevisit
  })

  // Sync local commit history to global store for SelectionPanel display in App.tsx
  useEffect(() => {
    // Sync commits to store (convert to display format)
    const displayCommits = tagCommitHistory.map(c => ({
      id: c.id,
      type: c.type,
      counts: c.counts
    }))
    // Update store with current commit history
    useVisualizationStore.setState({
      stage3CommitHistory: displayCommits,
      stage3CurrentCommitIndex: currentCommitIndex
    })
  }, [tagCommitHistory, currentCommitIndex])

  // ============================================================================
  // NAVIGATION HANDLERS - Navigate through brushed/selected features
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentSelectedIndex(i => {
      const newIndex = Math.max(0, i - 1)
      // Update page if needed
      const newPage = Math.floor(newIndex / ITEMS_PER_PAGE)
      if (newPage !== selectedPage) {
        setSelectedPage(newPage)
      }
      return newIndex
    })
  }, [selectedPage])

  const handleNavigateNext = useCallback(() => {
    setCurrentSelectedIndex(i => {
      const newIndex = Math.min(sortedSelectedFeatureList.length - 1, i + 1)
      // Update page if needed
      const newPage = Math.floor(newIndex / ITEMS_PER_PAGE)
      if (newPage !== selectedPage) {
        setSelectedPage(newPage)
      }
      return newIndex
    })
  }, [sortedSelectedFeatureList.length, selectedPage])

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's cause selection state and source
  const currentCauseCategory = useMemo(() => {
    if (!selectedFeatureData) return null
    return causeSelectionStates.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, causeSelectionStates])

  const currentCauseSource = useMemo(() => {
    if (!selectedFeatureData) return null
    return causeSelectionSources.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, causeSelectionSources])

  // Handle tag button click - toggle category on/off
  // Clicking same category: if manual, clear to unsure; if auto, confirm as manual
  // Clicking different category: set new category as manual
  const handleTagClick = useCallback((category: CauseCategory) => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    const isSameCategory = currentCauseCategory === category
    const isAutoTagged = currentCauseSource === 'auto'

    if (isSameCategory && !isAutoTagged) {
      // Already manually selected same category - toggle off to unsure
      setCauseCategory(featureId, null)
      return
    }

    // Either confirming auto tag or changing category - update with manual source
    setCauseCategory(featureId, category)

    // Auto-advance to next feature in selected list (only when tagging, not untagging)
    if (currentSelectedIndex < sortedSelectedFeatureList.length - 1) {
      setTimeout(() => handleNavigateNext(), 150)
    }
  }, [selectedFeatureData, currentCauseCategory, currentCauseSource, setCauseCategory, currentSelectedIndex, sortedSelectedFeatureList.length, handleNavigateNext])

  // ============================================================================
  // SELECTED TAGGING HANDLERS
  // ============================================================================

  // Tag all selected features with a specific cause category
  const handleTagSelectedAs = useCallback((category: 'noisy-activation' | 'missed-context' | 'missed-N-gram') => {
    // 1. Save current state to current commit before applying new tags
    saveCurrentState()

    // 2. Apply tags to all selected features
    umapBrushedFeatureIds.forEach(featureId => {
      setCauseCategory(featureId, category)
    })

    // 3. Create new commit after tags are applied (hook handles onCommitCreated callback)
    setTimeout(() => {
      createCommit('tagAll')
      console.log('[CauseView] Created new commit after tagging selected as', category)
    }, 0)
  }, [umapBrushedFeatureIds, setCauseCategory, saveCurrentState, createCommit])

  // Tag remaining untagged features by decision boundary (highest margin category)
  const handleTagRemainingByBoundary = useCallback(() => {
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) return
    if (!selectedFeatureIds) return

    // 1. Save current state to current commit before applying new tags
    saveCurrentState()

    // 2. For each feature in selectedFeatureIds, if not manually tagged, assign highest margin category
    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features
      if (source === 'manual') return

      const categoryMargins = causeCategoryDecisionMargins.get(featureId)
      if (!categoryMargins) return

      // Find category with highest margin
      const entries = Object.entries(categoryMargins)
      if (entries.length === 0) return

      const [bestCategory] = entries.reduce((best, curr) =>
        curr[1] > best[1] ? curr : best
      )
      setCauseCategory(featureId, bestCategory as CauseCategory)
    })

    // 3. Create new commit after tags are applied (hook handles onCommitCreated callback)
    setTimeout(() => {
      createCommit('apply')
      console.log('[CauseView] Created new commit after tagging by decision boundary')
    }, 0)
  }, [causeCategoryDecisionMargins, selectedFeatureIds, causeSelectionSources, setCauseCategory, saveCurrentState, createCommit])

  // Handle next stage navigation (placeholder for Stage 4)
  const handleNextStage = useCallback(() => {
    console.log('[CauseView] Next stage clicked - Stage 4 not yet implemented')
    // TODO: Implement Stage 4 navigation
  }, [])

  // Count how many remaining features will be tagged to each category by decision boundary
  const boundaryTagCounts = useMemo(() => {
    const counts = {
      'noisy-activation': 0,
      'missed-context': 0,
      'missed-N-gram': 0,
      'well-explained': 0
    }

    if (!causeCategoryDecisionMargins || !selectedFeatureIds) return counts

    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features
      if (source === 'manual') return

      const categoryMargins = causeCategoryDecisionMargins.get(featureId)
      if (!categoryMargins) return

      // Find category with highest margin
      const entries = Object.entries(categoryMargins)
      if (entries.length === 0) return

      const [bestCategory] = entries.reduce((best, curr) =>
        curr[1] > best[1] ? curr : best
      )

      if (bestCategory in counts) {
        counts[bestCategory as keyof typeof counts]++
      }
    })

    return counts
  }, [causeCategoryDecisionMargins, selectedFeatureIds, causeSelectionSources])

  // Get colors for each cause category
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#9ca3af'
  const wellExplainedColor = getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#9ca3af'

  // Render feature item for selected ScrollableItemList (with click handler and CauseMetricBars)
  const renderBottomRowFeatureItem = useCallback((featureId: number, index: number) => {
    const causeCategory = causeSelectionStates.get(featureId)
    const causeSource = causeSelectionSources.get(featureId)
    const decisionMargin = decisionMarginMap.get(featureId)
    const scores = causeMetricScores.get(featureId)

    // All features must have a tag - use category name or default to Unsure
    const tagName = causeCategory ? CAUSE_TAG_NAMES[causeCategory] : 'Unsure'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
        <TagBadge
          featureId={featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_CAUSE}
          onClick={() => handleSelectedListClick(index)}
          fullWidth={true}
          isAuto={causeSource === 'auto'}
        />
        <CauseMetricBars scores={scores ?? null} selectedCategory={causeCategory} />
        {decisionMargin != null && (
          <span className="pair-similarity-score">{decisionMargin.toFixed(2)}</span>
        )}
      </div>
    )
  }, [causeSelectionStates, causeSelectionSources, handleSelectedListClick, decisionMarginMap, causeMetricScores])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`cause-view ${className}`}>
      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Cause Analysis</span>
        <span className="view-description">
          Determine root cause for features that{' '}
          <span
            className="view-tag-badge"
            style={{ backgroundColor: needRevisionColor }}
          >
            Need Revision
          </span>
        </span>
      </div>

      {/* Body: Content area */}
      <div className="cause-view__body">
        {/* Main content: Top row + Bottom action bar */}
        <div className="cause-view__content">
          {/* Top row: UMAP + Selected list overlay + Detail panel */}
          <div className="cause-view__row-top">
            {/* UMAP wrapper - contains scatter and overlay */}
            <div className="cause-view__umap-wrapper">
              <UMAPScatter
                featureIds={selectedFeatureIds ? Array.from(selectedFeatureIds) : []}
                className="cause-view__umap"
                selectedFeatureId={selectedFeatureData?.featureId ?? null}
              />

              {/* Selected list - positioned inside UMAP wrapper */}
              <ScrollableItemList
                className="cause-view__selected-overlay"
                variant="causeBrushed"
                badges={[{ label: 'Selected', count: sortedSelectedFeatureList.length }]}
                columnHeader={{
                  label: 'Decision Margin',
                  sortDirection: selectedSortDirection,
                  onClick: toggleSelectedSortDirection
                }}
                items={paginatedSelectedFeatureList}
                renderItem={renderBottomRowFeatureItem}
                currentIndex={activeListSource === 'selected' ? currentSelectedIndex % ITEMS_PER_PAGE : -1}
                isActive={activeListSource === 'selected'}
                emptyMessage="Brush to select"
                pageNavigation={{
                  currentPage: selectedPage,
                  totalPages: selectedTotalPages,
                  onPreviousPage: () => {
                    if (selectedPage > 0) {
                      setSelectedPage(selectedPage - 1)
                      setCurrentSelectedIndex((selectedPage - 1) * ITEMS_PER_PAGE)
                    }
                  },
                  onNextPage: () => {
                    if (selectedPage < selectedTotalPages - 1) {
                      setSelectedPage(selectedPage + 1)
                      setCurrentSelectedIndex((selectedPage + 1) * ITEMS_PER_PAGE)
                    }
                  }
                }}
              />
            </div>

            {/* Right: Activation examples, explanations, and action buttons */}
            <div className="cause-view__right-panel" ref={rightPanelRef}>
              {/* Feature detail section */}
              <div className="cause-view__detail-section">
                {selectedFeatureData ? (
                  <>
                    {/* Header row */}
                    <div className="cause-view__header-row">
                      <h4 className="subheader">Activation Examples</h4>
                      <span className="panel-header__id">#{selectedFeatureData.featureId}</span>
                    </div>
                    {/* Activation legend */}
                    <div className="cause-view__legend">
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--activation">token</span>:
                        <span className="legend-label">Activation Strength</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--intra">token</span>:
                        <span className="legend-label">Feature-Specific Pattern</span>
                      </div>
                    </div>

                    {/* Activation Examples Section */}
                    <div className="cause-view__activation-section">
                      <div className="cause-view__activation-examples">
                        {selectedFeatureData.activation ? (
                          <ActivationExample
                            examples={selectedFeatureData.activation}
                            containerWidth={containerWidth}
                            numQuantiles={4}
                            examplesPerQuantile={[2, 2, 2, 2]}
                            disableHover={true}
                          />
                        ) : (
                          <div className="cause-view__loading">Loading activation examples...</div>
                        )}
                      </div>
                    </div>

                    {/* Best Explanation Header */}
                    <div className="cause-view__explanation-header">
                      <h4 className="subheader">Best Explanation</h4>
                    </div>
                    {/* Semantic similarity legend */}
                    <div className="cause-view__explanation-legend">
                      <span className="legend-group-label">Common Phrase Semantic Similarity:</span>
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

                    {/* Explanation Section */}
                    <div className="cause-view__explanation-section">
                      <div className="cause-view__explanation-content">
                        {bestExplanation ? (
                          <div className="cause-view__explainer-block">
                            {/* Explainer symbol */}
                            {bestExplanation.explainerId === 'llama' && (
                              <svg width="16" height="16" viewBox="0 0 14 14" className="cause-view__explainer-symbol">
                                <rect x="3" y="3" width="8" height="8" fill="#3b82f6"/>
                              </svg>
                            )}
                            {bestExplanation.explainerId === 'gemini' && (
                              <svg width="16" height="16" viewBox="0 0 14 14" className="cause-view__explainer-symbol">
                                <polygon points="7,0.5 13,7 7,13.5 1,7" fill="#3b82f6"/>
                              </svg>
                            )}
                            {bestExplanation.explainerId === 'openai' && (
                              <svg width="16" height="16" viewBox="0 0 14 14" className="cause-view__explainer-symbol">
                                <polygon points="7,1 13,12 1,12" fill="#3b82f6"/>
                              </svg>
                            )}
                            <span
                              className={`cause-view__explainer-name cause-view__explainer-name--${bestExplanation.explainerId}`}
                            >
                              {getExplainerDisplayName(bestExplanation.explainerId)}
                            </span>
                            <span className="cause-view__explainer-text">
                              {bestExplanation.highlightedExplanation?.segments ? (
                                <HighlightedExplanation
                                  segments={bestExplanation.highlightedExplanation.segments}
                                  truncated={false}
                                />
                              ) : (
                                <span className="cause-view__no-explanation">
                                  {bestExplanation.explanationText || 'No explanation available'}
                                </span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="cause-view__no-explanation">No explanations available</span>
                        )}
                      </div>
                    </div>

                    {/* Cause Metric Bars Detail - below explanation */}
                    <div className="cause-view__metrics-container">
                      <CauseMetricBarsDetail
                        scores={causeMetricScores.get(selectedFeatureData.featureId) ?? null}
                        qualityScore={bestExplanation?.qualityScore}
                      />
                    </div>

                    {/* Floating control panel at bottom */}
                    <div className="cause-view__floating-controls">
                      {/* Previous button */}
                      <button
                        className="nav__button"
                        onClick={handleNavigatePrevious}
                        disabled={currentSelectedIndex === 0 || sortedSelectedFeatureList.length === 0}
                      >
                        ← Prev
                      </button>

                      {/* Selection buttons - all features must have a tag */}
                      <TagButton
                        label="Pattern Miss"
                        variant="missed-N-gram"
                        color={missedNgramColor}
                        isSelected={currentCauseCategory === 'missed-N-gram'}
                        onClick={() => handleTagClick('missed-N-gram')}
                      />
                      <TagButton
                        label="Context Miss"
                        variant="missed-context"
                        color={missedContextColor}
                        isSelected={currentCauseCategory === 'missed-context'}
                        onClick={() => handleTagClick('missed-context')}
                      />
                      <TagButton
                        label="Noisy Activation"
                        variant="noisy-activation"
                        color={noisyActivationColor}
                        isSelected={currentCauseCategory === 'noisy-activation'}
                        onClick={() => handleTagClick('noisy-activation')}
                      />
                      <TagButton
                        label="Well-Explained"
                        variant="well-explained"
                        color={wellExplainedColor}
                        isSelected={currentCauseCategory === 'well-explained'}
                        onClick={() => handleTagClick('well-explained')}
                      />

                      {/* Next button */}
                      <button
                        className="nav__button"
                        onClick={handleNavigateNext}
                        disabled={currentSelectedIndex >= sortedSelectedFeatureList.length - 1 || sortedSelectedFeatureList.length === 0}
                      >
                        Next →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="cause-view__placeholder">
                    <span className="cause-view__placeholder-text">
                      Select a feature from the list to view details
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons section - always visible below detail */}
              <div className="cause-view__action-buttons">
                {/* Row 1: Tag Selected Cell */}
                <div className="cause-view__action-section">
                  <span className="cause-view__action-header">Tag Remaining in Selected Cell as</span>
                  <div className="cause-view__action-row">
                    <div className="action-button-item">
                      <button
                        className="action-button"
                        onClick={() => handleTagSelectedAs('missed-N-gram')}
                        disabled={umapBrushedFeatureIds.size === 0}
                        title="Tag all selected features as Pattern Miss"
                      >
                        Pattern Miss
                      </button>
                      <div className="action-button__legend">
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                        <span className="action-button__legend-arrow">→</span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                      </div>
                    </div>
                    <div className="action-button-item">
                      <button
                        className="action-button"
                        onClick={() => handleTagSelectedAs('missed-context')}
                        disabled={umapBrushedFeatureIds.size === 0}
                        title="Tag all selected features as Context Miss"
                      >
                        Context Miss
                      </button>
                      <div className="action-button__legend">
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                        <span className="action-button__legend-arrow">→</span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                      </div>
                    </div>
                    <div className="action-button-item">
                      <button
                        className="action-button"
                        onClick={() => handleTagSelectedAs('noisy-activation')}
                        disabled={umapBrushedFeatureIds.size === 0}
                        title="Tag all selected features as Noisy Activation"
                      >
                        Noisy Activation
                      </button>
                      <div className="action-button__legend">
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                        <span className="action-button__legend-arrow">→</span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                          <span className="action-button__legend-count">{umapBrushedFeatureIds.size}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Tag All Remaining */}
                <div className="cause-view__action-section">
                  <span className="cause-view__action-header">Tag All Remaining</span>
                  <div className="cause-view__action-row">
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--primary"
                        onClick={handleTagRemainingByBoundary}
                        disabled={!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0}
                        title="Auto-tag remaining features using SVM decision boundary"
                      >
                        By SVM Boundary
                      </button>
                      <div className="action-button__legend">
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                          <span className="action-button__legend-count">{(selectedFeatureIds?.size || 0) - causeSelectionStates.size}</span>
                        </span>
                        <span className="action-button__legend-arrow">→</span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                          <span className="action-button__legend-count">{boundaryTagCounts['noisy-activation']}</span>
                        </span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                          <span className="action-button__legend-count">{boundaryTagCounts['missed-N-gram']}</span>
                        </span>
                        <span className="action-button__legend-item">
                          <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                          <span className="action-button__legend-count">{boundaryTagCounts['missed-context']}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Next Stage */}
        <div className="next-stage-column">
          <button
            className="action-button action-button--next"
            onClick={handleNextStage}
            disabled={!allTagged}
            title={allTagged ? 'Proceed to Stage 4' : `Tag all features first (${causeSelectionStates.size}/${selectedFeatureIds?.size || 0})`}
          >
            Move to Stage 4 Summary ↑
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseView)
