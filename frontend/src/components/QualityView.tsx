import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import { ScrollableItemList } from './ScrollableItemList'
import { TagBadge } from './TableIndicators'
import { isBimodalScore } from '../lib/bimodality-utils'
import { useSortableList } from '../lib/tagging-hooks/useSortableList'
import ActivationExample from './ActivationExample'
import { HighlightedExplanation } from './TableExplanation'
import { TAG_CATEGORY_QUALITY, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-utils'
import { SEMANTIC_SIMILARITY_COLORS } from '../lib/color-utils'
import ExplainerComparisonGrid from './ExplainerComparisonGrid'
import '../styles/QualityView.css'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// QUALITY VIEW - Organized layout for quality assessment workflow (Stage 2)
// ============================================================================
// Layout: [SelectionPanel bar] | [Top: placeholder] | [Bottom: ThresholdTaggingPanel]

// Commit history types
type SelectionState = 'selected' | 'rejected'
type SelectionSource = 'manual' | 'auto'

export interface QualityTagCommit {
  id: number
  type: 'initial' | 'apply' | 'tagAll'
  featureSelectionStates: Map<number, SelectionState>
  featureSelectionSources: Map<number, SelectionSource>
}

// Maximum number of commits to keep (oldest auto-removed)
const MAX_COMMITS = 10

interface QualityViewProps {
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void
}

const QualityView: React.FC<QualityViewProps> = ({
  className = '',
  onCategoryRefsReady
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

  // Local state
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  const [activeListSource, setActiveListSource] = useState<'all' | 'reject' | 'select'>('all')
  const [autoAdvance] = useState(true)  // Auto-advance to next feature after tagging

  // Top row feature list state - currentPage derived from currentFeatureIndex
  const ITEMS_PER_PAGE = 10
  const currentPage = Math.floor(currentFeatureIndex / ITEMS_PER_PAGE)

  // Right panel container width state (for ActivationExample)
  const [containerWidth, setContainerWidth] = useState(600)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // COMMIT HISTORY STATE - Save and restore tagging state snapshots
  // ============================================================================
  const [tagCommitHistory, setTagCommitHistory] = useState<QualityTagCommit[]>([
    { id: 0, type: 'initial', featureSelectionStates: new Map(), featureSelectionSources: new Map() }
  ])
  const [currentCommitIndex, setCurrentCommitIndex] = useState(0)

  // Dependencies for selectedFeatureIds
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps
    const features = getSelectedNodeFeatures()
    console.log('[QualityView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds])

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

  // Use sortable list hook for sorting logic
  const {
    setSortMode,
    sortedItems: sortedFeatures,
    columnHeaderProps,
    getDisplayScore
  } = useSortableList({
    items: featureList,
    getItemKey: (f: typeof featureList[0]) => f.featureId,
    getDefaultScore: (f: typeof featureList[0]) => f.qualityScore,
    decisionMarginScores: similarityScores,
    defaultLabel: 'Quality score',
    defaultDirection: 'asc'
  })

  // Pagination for the top row list
  const totalPages = Math.max(1, Math.ceil(sortedFeatures.length / ITEMS_PER_PAGE))
  const currentPageFeatures = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE
    return sortedFeatures.slice(start, start + ITEMS_PER_PAGE)
  }, [sortedFeatures, currentPage, ITEMS_PER_PAGE])

  // Reset to valid index when features change
  useEffect(() => {
    if (currentFeatureIndex >= sortedFeatures.length && sortedFeatures.length > 0) {
      setCurrentFeatureIndex(sortedFeatures.length - 1)
    }
  }, [sortedFeatures.length, currentFeatureIndex])

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

    const hasRequiredSelections = currentSelectedIds.length >= 1 && currentRejectedIds.length >= 1

    // Compute current signature to detect if scores are stale
    const currentSignature = `selected:${currentSelectedIds.sort((a, b) => a - b).join(',')}|rejected:${currentRejectedIds.sort((a, b) => a - b).join(',')}`
    const scoresAreStale = lastSortedSelectionSignature !== currentSignature

    // Need to compute scores if: (1) empty OR (2) selection signature changed
    const needsScores = (similarityScores.size === 0 || scoresAreStale) && featureList.length > 0

    if (hasRequiredSelections && needsScores) {
      console.log('[QualityView] Computing similarity scores for', featureList.length, 'features (stale:', scoresAreStale, ')')
      sortBySimilarity()
    }
  }, [featureList, featureSelectionStates, featureSelectionSources, similarityScores.size, lastSortedSelectionSignature, sortBySimilarity])

  // When threshold dragging starts, switch to 'all' list
  useEffect(() => {
    if (isDraggingThreshold && (activeListSource === 'reject' || activeListSource === 'select')) {
      console.log('[QualityView] Threshold drag started, switching from', activeListSource, 'to all list')
      setActiveListSource('all')
      setCurrentFeatureIndex(0)
    }
  }, [isDraggingThreshold, activeListSource])

  // Track right panel width for ActivationExample
  useEffect(() => {
    if (!rightPanelRef.current) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width || 600
      setContainerWidth(width - 16) // Account for padding
    })
    observer.observe(rightPanelRef.current)
    return () => observer.disconnect()
  }, [])

  // ============================================================================
  // SELECTED FEATURE DATA (for right panel)
  // ============================================================================

  // Get the currently selected feature's data
  const selectedFeatureData = useMemo(() => {
    const feature = sortedFeatures[currentFeatureIndex]
    if (!feature) return null

    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [sortedFeatures, currentFeatureIndex, activationExamples])

  // Get all explainer explanations with highlighted segments
  // Keep all explainers (even if missing data) to maintain index alignment with triangleYPositions
  const allExplainerExplanations = useMemo(() => {
    if (!selectedFeatureData?.row || !tableData?.explainer_ids) return []

    return tableData.explainer_ids.map((explainerId: string, index: number) => {
      const explainerData = selectedFeatureData.row?.explainers?.[explainerId]
      return {
        explainerId,
        index,  // Keep original index for triangle alignment
        highlightedExplanation: explainerData?.highlighted_explanation ?? null,
        explanationText: explainerData?.explanation_text ?? null
      }
    })
  }, [selectedFeatureData, tableData?.explainer_ids])

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

  // Get tag colors for header badge and buttons
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#4CAF50'
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
    setActiveListSource('all')
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentFeatureIndex(i => Math.min(sortedFeatures.length - 1, i + 1))
    setActiveListSource('all')
  }, [sortedFeatures.length])

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
      // Toggle off: selected → rejected → null
      toggleFeatureSelection(featureId)
      toggleFeatureSelection(featureId)
    } else {
      // Set to selected
      if (currentSelectionState === null) {
        toggleFeatureSelection(featureId)
      } else if (currentSelectionState === 'rejected') {
        // rejected → null → selected
        toggleFeatureSelection(featureId)
        toggleFeatureSelection(featureId)
      }
      // Auto-advance to next feature
      if (autoAdvance && currentFeatureIndex < sortedFeatures.length - 1) {
        setTimeout(() => handleNavigateNext(), 150)
      }
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, autoAdvance, currentFeatureIndex, sortedFeatures.length, handleNavigateNext])

  // Handle Need Revision click (rejected)
  const handleNeedRevisionClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    if (currentSelectionState === 'rejected') {
      // Toggle off: rejected → null
      toggleFeatureSelection(featureId)
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
      // Auto-advance to next feature
      if (autoAdvance && currentFeatureIndex < sortedFeatures.length - 1) {
        setTimeout(() => handleNavigateNext(), 150)
      }
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, autoAdvance, currentFeatureIndex, sortedFeatures.length, handleNavigateNext])

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
    // Auto-advance to next feature
    if (autoAdvance && currentFeatureIndex < sortedFeatures.length - 1) {
      setTimeout(() => handleNavigateNext(), 150)
    }
  }, [selectedFeatureData, currentSelectionState, toggleFeatureSelection, autoAdvance, currentFeatureIndex, sortedFeatures.length, handleNavigateNext])

  // ============================================================================
  // CLICK HANDLERS
  // ============================================================================

  // Handle click on feature in top row list
  const handleFeatureListClick = useCallback((index: number) => {
    const globalIndex = currentPage * ITEMS_PER_PAGE + index
    setCurrentFeatureIndex(globalIndex)
    setActiveListSource('all')
  }, [currentPage, ITEMS_PER_PAGE])

  // Render feature item for the ScrollableItemList
  // Score display is handled by ScrollableItemList's sortConfig
  const renderFeatureItem = useCallback((feature: typeof featureList[0], index: number) => {
    const selectionState = featureSelectionStates.get(feature.featureId)

    // Determine tag name based on selection state
    let tagName = 'Unsure'
    if (selectionState === 'selected') {
      tagName = 'Well-Explained'
    } else if (selectionState === 'rejected') {
      tagName = 'Need Revision'
    }

    return (
      <TagBadge
        featureId={feature.featureId}
        tagName={tagName}
        tagCategoryId={TAG_CATEGORY_QUALITY}
        onClick={() => handleFeatureListClick(index)}
        fullWidth={true}
      />
    )
  }, [featureSelectionStates, handleFeatureListClick])

  const handleBoundaryListClick = useCallback((listType: 'left' | 'right', index: number) => {
    const items = listType === 'left' ? boundaryItems.rejectBelow : boundaryItems.selectAbove
    if (index >= 0 && index < items.length) {
      setActiveListSource(listType === 'left' ? 'reject' : 'select')
      setCurrentFeatureIndex(index)
    }
  }, [boundaryItems.rejectBelow, boundaryItems.selectAbove])

  // ============================================================================
  // APPLY TAGS HANDLER
  // ============================================================================

  const handleApplyTags = useCallback(() => {
    // 1. Save current state to current commit before applying new tags
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    // 2. Apply auto-tags based on current thresholds
    applySimilarityTags()

    // 3. Create a new commit with the updated state
    setTimeout(() => {
      const store = useVisualizationStore.getState()
      const newCommit: QualityTagCommit = {
        id: tagCommitHistory.length,
        type: 'apply',
        featureSelectionStates: new Map(store.featureSelectionStates),
        featureSelectionSources: new Map(store.featureSelectionSources)
      }

      setTagCommitHistory(prev => {
        let newHistory = [...prev, newCommit]
        if (newHistory.length > MAX_COMMITS) {
          newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
        }
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))

      console.log('[QualityView] Created new commit, history length:', tagCommitHistory.length + 1)
    }, 0)

    // 4. Switch to decision margin sort and reset
    setSortMode('decisionMargin')
    setCurrentFeatureIndex(0)
    setActiveListSource('all')
  }, [applySimilarityTags, featureSelectionStates, featureSelectionSources, currentCommitIndex, tagCommitHistory.length, setSortMode])

  // Handle commit circle click - restore state from that commit
  const handleCommitClick = useCallback((commitIndex: number) => {
    if (commitIndex < 0 || commitIndex >= tagCommitHistory.length) return
    if (commitIndex === currentCommitIndex) return

    // Save current state to current commit before switching
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    // Restore the clicked commit's state
    const targetCommit = tagCommitHistory[commitIndex]
    restoreFeatureSelectionStates(targetCommit.featureSelectionStates, targetCommit.featureSelectionSources)

    setCurrentCommitIndex(commitIndex)

    console.log('[QualityView] Restored commit', commitIndex, 'with', targetCommit.featureSelectionStates.size, 'features')
  }, [tagCommitHistory, currentCommitIndex, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates])

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

    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

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

    restoreFeatureSelectionStates(newStates, newSources)

    const newCommit: QualityTagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      featureSelectionStates: new Map(newStates),
      featureSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))
  }, [featureList, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates, currentCommitIndex, tagCommitHistory.length])

  // Handle Tag All - By Decision Boundary
  const handleTagAllByBoundary = useCallback(() => {
    console.log('[TagAll] By Decision Boundary (score=0) option clicked')

    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

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

    restoreFeatureSelectionStates(newStates, newSources)

    const newCommit: QualityTagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      featureSelectionStates: new Map(newStates),
      featureSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))
  }, [featureList, featureSelectionStates, featureSelectionSources, similarityScores, restoreFeatureSelectionStates, currentCommitIndex, tagCommitHistory.length])

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
      <div className="quality-view__header">
        <h3 className="quality-view__title">Quality Assessment</h3>
        <p className="quality-view__description">
          Validate features for{' '}
          <span
            className="quality-view__tag-badge"
            style={{ backgroundColor: wellExplainedColor }}
          >
            Well-Explained
          </span>
        </p>
      </div>

      {/* Body: SelectionPanel + Content area */}
      <div className="quality-view__body">
        {/* Left column: SelectionPanel vertical bar */}
        <SelectionPanel
          mode="feature"
          tagLabel="Quality"
          onCategoryRefsReady={onCategoryRefsReady}
          filteredFeatureIds={selectedFeatureIds || undefined}
          commitHistory={tagCommitHistory}
          currentCommitIndex={currentCommitIndex}
          onCommitClick={handleCommitClick}
        />

        {/* Right column: 2 rows */}
        <div className="quality-view__content">
          {/* Top row: Feature list + empty right panel */}
          <div className="quality-view__row-top">
            <ScrollableItemList
              width={240}
              height={390}
              badges={[{ label: 'Features', count: sortedFeatures.length }]}
              columnHeader={columnHeaderProps}
              items={currentPageFeatures}
              renderItem={renderFeatureItem}
              sortConfig={{ getDisplayScore }}
              currentIndex={activeListSource === 'all' ? currentFeatureIndex % ITEMS_PER_PAGE : -1}
              isActive={activeListSource === 'all'}
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
                        <span className="legend-label">Within-Feature Pattern</span>
                      </div>
                    </div>
                    {/* Separator */}
                    <div className="quality-view__legend-separator" />
                    {/* Explanation highlight legend */}
                    <div className="quality-view__legend">
                      <span className="legend-label">Semantic similarity:</span>
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
                        <span className="legend-label">≥0.50</span>
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

                  {/* Explanation Row - Left grid + Explanations */}
                  <div className="quality-view__explanation-row">
                    {/* Left: Explainer comparison grid */}
                    <div className="quality-view__explanation-left">
                      <ExplainerComparisonGrid
                        cellGap={2}
                        explainerIds={tableData?.explainer_ids || []}
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
                    <button
                      className={`selection__button selection__button--unsure ${currentSelectionState === null ? 'selected' : ''}`}
                      onClick={handleUnsureClick}
                      style={{ '--tag-color': unsureColor } as React.CSSProperties}
                    >
                      Unsure
                    </button>
                    <button
                      className={`selection__button selection__button--need-revision ${currentSelectionState === 'rejected' ? 'selected' : ''}`}
                      onClick={handleNeedRevisionClick}
                      style={{ '--tag-color': needRevisionColor } as React.CSSProperties}
                    >
                      Need Revision
                    </button>
                    <button
                      className={`selection__button selection__button--well-explained ${currentSelectionState === 'selected' ? 'selected' : ''}`}
                      onClick={handleWellExplainedClick}
                      style={{ '--tag-color': wellExplainedColor } as React.CSSProperties}
                    >
                      Well-Explained
                    </button>

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
            onNextStage={moveToNextStep}
            onListItemClick={handleBoundaryListClick}
            activeListSource={activeListSource}
            currentIndex={currentFeatureIndex}
            isBimodal={isBimodal}
            allTagged={allFeaturesTagged}
            nextStageName="Root Cause"
            nextStageNumber={3}
          />
        </div>
      </div>
    </div>
  )
}

export default React.memo(QualityView)
