import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import * as api from '../api'
import { useSortableList } from '../lib/tagging-hooks/useSortableList'
import UMAPScatter from './UMAPScatter'
import { ScrollableItemList } from './ScrollableItemList'
import { TagBadge, TagButton } from './Indicators'
import ActivationExample from './ActivationExamplePanel'
import { HighlightedExplanation } from './ExplanationPanel'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import { SEMANTIC_SIMILARITY_COLORS } from '../lib/color-utils'
import type { CauseCategory } from '../lib/umap-utils'
import { useCommitHistory, createCauseCommitHistoryOptions, type DisplayCommit } from '../lib/tagging-hooks'
import { CauseMetricParallelCoords } from './ParallelCoordinates'
import {
  calculateCauseMetricScores,
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'
import StatusPanel from './StatusPanel'
import CauseMarginHistogram from './CauseMarginHistogram'
import { ThresholdHandleIcon } from './ThresholdHandles'
import { useResizeObserver } from '../lib/utils'
import '../styles/CauseView.css'

// ============================================================================
// CAUSE VIEW - Root cause analysis workflow (Stage 3)
// ============================================================================
// Layout: [Content: UMAP + Selected Features List + Right Panel]

// Initial unsure boundary percentage (Low 1% of features by decision margin)
const INITIAL_UNSURE_PERCENTAGE = 1

// Minimum manual tags required per cause category before SVM training
const MIN_TAGS_PER_CATEGORY = 2

// Cause categories for SVM training (excludes well-explained)
const CAUSE_CATEGORIES = ['noisy-activation', 'missed-N-gram', 'missed-context']

// Commit history types
export interface CauseCommitCounts {
  noisyActivation: number
  missedNgram: number
  missedContext: number
  wellExplained: number
  unsure: number
  total: number
}

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

  // Stage 3 revisiting state
  const isRevisitingStage3 = useVisualizationStore(state => state.isRevisitingStage3)
  const stage3FinalCommit = useVisualizationStore(state => state.stage3FinalCommit)
  const setStage3FinalCommit = useVisualizationStore(state => state.setStage3FinalCommit)
  const restoreCauseSelectionStates = useVisualizationStore(state => state.restoreCauseSelectionStates)
  // Full commit history for restoration
  const stage3CommitHistory = useVisualizationStore(state => state.stage3CommitHistory)
  const stage3CommitData = useVisualizationStore(state => state.stage3CommitData)
  const stage3CurrentCommitIndex = useVisualizationStore(state => state.stage3CurrentCommitIndex)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeMetricScores = useVisualizationStore(state => state.causeMetricScores)

  // Stage 2 selection states (for well-explained background lines)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)

  // Table data and activation examples for feature detail view
  const tableData = useVisualizationStore(state => state.tableData)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Cause category selection action
  const setCauseCategory = useVisualizationStore(state => state.setCauseCategory)
  const setCauseCategoriesBatch = useVisualizationStore(state => state.setCauseCategoriesBatch)
  const initializeCauseMetricScores = useVisualizationStore(state => state.initializeCauseMetricScores)

  // SVM decision margins for auto-tagging by decision boundary
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)
  const fetchCauseClassification = useVisualizationStore(state => state.fetchCauseClassification)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const umapLoading = useVisualizationStore(state => state.umapLoading)

  // Stage navigation
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Shared margin threshold from store (used by UMAPScatter and SelectionPanel)
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)
  const setCauseMarginThreshold = useVisualizationStore(state => state.setCauseMarginThreshold)

  // Local state for feature detail view
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  const [currentSelectedIndex, setCurrentSelectedIndex] = useState(0)
  const [activeListSource, setActiveListSource] = useState<'all' | 'selected'>('selected')
  const [_targetPercentage, setTargetPercentage] = useState(INITIAL_UNSURE_PERCENTAGE)
  // Sort by specific tag (only used in Top mode / Most Confident First)
  const [filterByTag, setFilterByTag] = useState<CauseCategory | null>(null)
  // Track if user has ever clicked "Most Confident First" - hides placeholder permanently
  const [hasEverBeenTopMode, setHasEverBeenTopMode] = useState(false)
  // Hide tagged items toggle (default: true - hide already tagged features)
  const [hideTagged, setHideTagged] = useState(true)
  // Diversity sort: IDs of diverse features (cluster medoids) to show first
  const [diversityFeatureIds, setDiversityFeatureIds] = useState<Set<number>>(new Set())

  // Right panel container width (for ActivationExample)
  const { ref: rightPanelRef, size: rightPanelSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 600,
    defaultHeight: 400,
    debounceMs: 16,
    debugId: 'cause-view-right-panel'
  })
  const containerWidth = rightPanelSize.width - 16  // Account for padding

  const hasAutoTaggedRef = useRef(false)

  // Filter state: which categories to show (shared with UMAPScatter)
  // Initially show only 'unsure' - user starts by reviewing uncertain features
  type FilterCategory = CauseCategory | 'unsure'
  const [visibleCategories, setVisibleCategories] = useState<Set<FilterCategory>>(
    new Set(['unsure'])
  )

  // Mark as already auto-tagged when revisiting (prevents re-initialization)
  useEffect(() => {
    if (isRevisitingStage3) {
      hasAutoTaggedRef.current = true
    }
  }, [isRevisitingStage3])

  // Reset to first feature when hideTagged changes (to avoid index out of bounds)
  const prevHideTaggedRef = useRef(hideTagged)
  useEffect(() => {
    if (prevHideTaggedRef.current !== hideTagged) {
      setCurrentFeatureIndex(0)
      setCurrentSelectedIndex(0)
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged])

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = isRevisitingStage3 && stage3FinalCommit?.featureIds
    ? stage3FinalCommit.featureIds
    : getSelectedNodeFeatures()

  // Fetch diversity IDs (cluster medoids) for diversity sort mode
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
          8  // num suggestions
        )
        setDiversityFeatureIds(new Set(response.suggestions.map(s => parseInt(s.id, 10))))
      } catch (error) {
        console.error('[CauseView] Failed to fetch diversity IDs:', error)
        setDiversityFeatureIds(new Set())
      }
    }
    fetchDiversityIds()
  }, [selectedFeatureIds])

  // Helper type for effective category
  type EffectiveCategory = CauseCategory | 'unsure'

  // Check if we can train SVM (need MIN_TAGS_PER_CATEGORY per cause category)
  const { canTrainSVM, manualTagCountsByCategory } = useMemo(() => {
    const counts: Record<string, number> = {
      'noisy-activation': 0,
      'missed-N-gram': 0,
      'missed-context': 0
    }

    causeSelectionStates.forEach((category, featureId) => {
      if (causeSelectionSources.get(featureId) === 'manual' && counts[category] !== undefined) {
        counts[category]++
      }
    })

    const canTrain = CAUSE_CATEGORIES.every(cat => counts[cat] >= MIN_TAGS_PER_CATEGORY)
    return { canTrainSVM: canTrain, manualTagCountsByCategory: counts }
  }, [causeSelectionStates, causeSelectionSources])

  // Get effective category for a feature - delegates to utility function
  const getEffectiveCategory = useCallback((featureId: number): EffectiveCategory => {
    return getEffectiveCategoryUtil(
      featureId,
      causeSelectionStates as Map<number, CauseCategory>,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold
    )
  }, [causeSelectionStates, causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold])

  // ============================================================================
  // METRIC SCORE INITIALIZATION - Calculate scores when entering Stage 3
  // ============================================================================
  useEffect(() => {
    // Skip if revisiting (will restore from commit) or already initialized
    if (isRevisitingStage3 || hasAutoTaggedRef.current) return

    // Wait for all required data
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return
    if (!tableData?.features) return

    // Calculate metric scores only (features start as unsure)
    initializeCauseMetricScores(selectedFeatureIds)
    hasAutoTaggedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions have stable references
  }, [isRevisitingStage3, selectedFeatureIds, tableData, activationExamples])

  // ============================================================================
  // AUTO-TRIGGER SVM CLASSIFICATION - Train with anchor points on entry
  // ============================================================================
  // Ref to track if classification has been triggered (prevents duplicate calls)
  const hasTriggeredClassificationRef = useRef(false)

  useEffect(() => {
    // Skip if revisiting (will restore from commit) or already triggered
    if (isRevisitingStage3 || hasTriggeredClassificationRef.current) {
      return
    }

    // Wait for metric scores to be initialized first
    if (!hasAutoTaggedRef.current) {
      return
    }

    // Wait for required data
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) {
      return
    }

    // Don't trigger if already loading
    if (causeClassificationLoading) {
      return
    }

    hasTriggeredClassificationRef.current = true

    // Trigger classification with empty selections (backend uses anchors as baseline)
    fetchCauseClassification(Array.from(selectedFeatureIds), {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions have stable references, causeClassificationLoading removed to prevent infinite loop
  }, [isRevisitingStage3, selectedFeatureIds])

  // ============================================================================
  // AUTO-ADJUST UNSURE BOUNDARY - Set threshold to show Low INITIAL_UNSURE_PERCENTAGE%
  // ============================================================================
  const hasAutoAdjustedBoundaryRef = useRef(false)

  useEffect(() => {
    // Guard: Only run once, after classification completes
    if (hasAutoAdjustedBoundaryRef.current) return
    if (isRevisitingStage3) return
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) return
    if (causeClassificationLoading) return
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return

    hasAutoAdjustedBoundaryRef.current = true

    // Collect all margins for non-manually-tagged features
    const margins: number[] = []
    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') return  // Skip manually tagged

      const categoryScores = causeCategoryDecisionMargins.get(featureId)
      if (!categoryScores) {
        margins.push(0)  // No scores = treat as margin 0 (most unsure)
        return
      }

      const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
      margins.push(margin)
    })

    // Sort margins ascending (lowest = most unsure)
    margins.sort((a, b) => a - b)

    // Calculate target index for INITIAL_UNSURE_PERCENTAGE% of features
    const targetCount = Math.max(1, Math.ceil(margins.length * INITIAL_UNSURE_PERCENTAGE / 100))
    const targetIndex = Math.min(targetCount - 1, margins.length - 1)

    if (margins.length > targetCount && targetIndex + 1 < margins.length) {
      // Set threshold between target feature and next one
      const targetMargin = margins[targetIndex]
      const nextMargin = margins[targetIndex + 1]
      const newThreshold = (targetMargin + nextMargin) / 2
      setCauseMarginThreshold(newThreshold)
    } else {
      // Fewer features than target - set threshold to include all
      const maxMargin = margins[margins.length - 1] || 0
      setCauseMarginThreshold(maxMargin + 0.01)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once after classification, dependencies are stable
  }, [isRevisitingStage3, causeCategoryDecisionMargins, causeClassificationLoading, selectedFeatureIds])

  // Memoize sorted margins for threshold calculations when switching modes
  const sortedMargins = useMemo(() => {
    if (!selectedFeatureIds || !causeCategoryDecisionMargins) return []

    const margins: number[] = []
    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') return  // Skip manually tagged

      const categoryScores = causeCategoryDecisionMargins.get(featureId)
      if (!categoryScores) {
        margins.push(0)
        return
      }
      const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
      margins.push(margin)
    })

    return margins.sort((a, b) => a - b)
  }, [selectedFeatureIds, causeCategoryDecisionMargins, causeSelectionSources])

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
    // NOTE: causeSelectionStates/Sources intentionally excluded to prevent cascade
    // This effect only initializes stage3FinalCommit ONCE (!stage3FinalCommit check)
    // After initialization, Map changes are handled by useCommitHistory sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevisitingStage3, stage3FinalCommit, selectedFeatureIds])


  // Get tag color for header badge (Need Revision - parent tag from Stage 2)
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af'

  // Create decision margin lookup map from SVM classification results
  // Decision margin = min absolute distance to any category boundary
  const decisionMarginMap = useMemo(() => {
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) {
      return new Map<number, number>()
    }
    const map = new Map<number, number>()
    causeCategoryDecisionMargins.forEach((categoryScores, featureId) => {
      // Compute margin as min absolute value of all category scores
      const scores = Object.values(categoryScores)
      if (scores.length > 0) {
        const margin = Math.min(...scores.map(s => Math.abs(s)))
        map.set(featureId, margin)
      }
    })
    return map
  }, [causeCategoryDecisionMargins])

  // Build feature items for useSortableList hook
  const causeFeatureItems = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return []
    return Array.from(selectedFeatureIds).map(featureId => ({ featureId }))
  }, [selectedFeatureIds])

  // Use shared sorting hook for consistent behavior across views
  const {
    sortMode,
    setSortMode,
    sortDirection: selectedSortDirection,
    setSortDirection: setSelectedSortDirection,
    sortedItems: sortedFeatureItems,
    columnHeaderProps,
    isTemplateSort
  } = useSortableList({
    items: causeFeatureItems,
    getItemKey: (item) => item.featureId,
    getDefaultScore: (item) => item.featureId,  // Default sort by feature ID
    decisionMarginScores: decisionMarginMap,
    diversityIds: diversityFeatureIds,
    defaultLabel: 'Feature ID',
    initialMode: 'diversity',
    templateMode: 'decisionMargin',
    templateDirection: 'asc'
  })

  // Determine if we're in "Top" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && selectedSortDirection === 'desc'

  // Track when user first enters Top mode (to hide batch tagging placeholder permanently)
  useEffect(() => {
    if (isTopMode && !hasEverBeenTopMode) {
      setHasEverBeenTopMode(true)
    }
  }, [isTopMode, hasEverBeenTopMode])

  // Reset filterByTag when leaving Top mode
  useEffect(() => {
    if (!isTopMode && filterByTag !== null) {
      setFilterByTag(null)
    }
  }, [isTopMode, filterByTag])

  // Check if feature is visible based on mode and threshold - delegates to utility function
  const isVisibleInCurrentMode = useCallback((featureId: number): boolean => {
    return isFeatureVisibleInMode(
      featureId,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold,
      isTopMode
    )
  }, [causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold, isTopMode])

  // Track previous isTopMode to detect mode switches
  const prevIsTopModeRef = useRef(isTopMode)

  // Recalculate threshold when switching between Low/Top modes to maintain same percentage
  useEffect(() => {
    // Only trigger on mode switch (not initial render)
    if (prevIsTopModeRef.current === isTopMode) return
    prevIsTopModeRef.current = isTopMode

    if (sortedMargins.length === 0) return

    // Calculate threshold to maintain same percentage from opposite end
    const targetCount = Math.max(1, Math.ceil(sortedMargins.length * _targetPercentage / 100))

    if (isTopMode) {
      // Top X%: threshold at (100 - X) percentile so X% of features are ABOVE
      const targetIndex = Math.max(0, sortedMargins.length - targetCount)
      const newThreshold = targetIndex > 0
        ? (sortedMargins[targetIndex - 1] + sortedMargins[targetIndex]) / 2
        : sortedMargins[0] - 0.01
      setCauseMarginThreshold(newThreshold)
    } else {
      // Low X%: threshold at X percentile so X% of features are BELOW
      const targetIndex = Math.min(targetCount - 1, sortedMargins.length - 1)
      const newThreshold = targetIndex + 1 < sortedMargins.length
        ? (sortedMargins[targetIndex] + sortedMargins[targetIndex + 1]) / 2
        : sortedMargins[sortedMargins.length - 1] + 0.01
      setCauseMarginThreshold(newThreshold)
    }
  }, [isTopMode, sortedMargins, _targetPercentage, setCauseMarginThreshold])

  // All features filtered by visibility (mode-based) and category filter
  // When hideTagged=true, excludes manually tagged features (they're already done)
  const filteredFeatureIds = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return []
    return Array.from(selectedFeatureIds).filter(featureId => {
      // Optionally exclude manually tagged features from the list
      if (hideTagged && causeSelectionSources.get(featureId) === 'manual') return false
      // First check mode-based visibility (threshold)
      if (!isVisibleInCurrentMode(featureId)) return false
      // In Top mode, apply tag filter if set
      if (isTopMode) {
        if (filterByTag) {
          const predicted = causeSelectionStates.get(featureId)
          return predicted === filterByTag
        }
        return true
      }
      // In Low mode, apply category filter (typically filtering 'unsure')
      const effectiveCategory = getEffectiveCategory(featureId)
      return visibleCategories.has(effectiveCategory)
    })
  }, [selectedFeatureIds, isVisibleInCurrentMode, getEffectiveCategory, visibleCategories, isTopMode, filterByTag, causeSelectionStates, causeSelectionSources, hideTagged])

  // Apply visibility filters AFTER sorting (except diversity mode which bypasses all filters)
  const sortedFilteredFeatureList = useMemo(() => {
    if (sortMode === 'diversity') {
      // Diversity mode: hook already filtered to medoids, no additional filtering
      return sortedFeatureItems.map(item => item.featureId)
    }

    // Other modes: apply visibility filters
    return sortedFeatureItems
      .map(item => item.featureId)
      .filter(featureId => {
        if (hideTagged && causeSelectionSources.get(featureId) === 'manual') return false
        if (!isVisibleInCurrentMode(featureId)) return false
        if (isTopMode) {
          if (filterByTag) {
            return causeSelectionStates.get(featureId) === filterByTag
          }
          return true
        }
        return visibleCategories.has(getEffectiveCategory(featureId))
      })
  }, [sortMode, sortedFeatureItems, hideTagged, causeSelectionSources, isVisibleInCurrentMode, isTopMode, filterByTag, causeSelectionStates, visibleCategories, getEffectiveCategory])

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

  // Filtered feature list based on visible categories (for detail panel navigation)
  const filteredFeatureList = useMemo(() => {
    return featureListWithMetadata.filter(item => {
      const effectiveCategory = getEffectiveCategory(item.featureId)
      return visibleCategories.has(effectiveCategory)
    })
  }, [featureListWithMetadata, getEffectiveCategory, visibleCategories])

  // Check if all features are manually tagged (for enabling next stage button)
  const allTagged = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return false
    for (const featureId of selectedFeatureIds) {
      if (causeSelectionSources.get(featureId) !== 'manual') return false
    }
    return true
  }, [selectedFeatureIds, causeSelectionSources])

  // Compute metric scores for Stage 2 "Well-Explained" features (for parallel coords background)
  const wellExplainedScores = useMemo(() => {
    const map = new Map<number, ReturnType<typeof calculateCauseMetricScores>>()
    if (!tableData?.features) return map

    // Build feature lookup for score calculation
    const featureMap = new Map<number, FeatureTableRow>(
      tableData.features.map((f: FeatureTableRow) => [f.feature_id, f])
    )

    featureSelectionStates.forEach((state, featureId) => {
      if (state === 'selected') {  // Well-Explained in Stage 2
        const row = featureMap.get(featureId)
        const activation = activationExamples[featureId] ?? null
        if (row) {
          const scores = calculateCauseMetricScores(row, activation)
          map.set(featureId, scores)
        }
      }
    })
    return map
  }, [featureSelectionStates, tableData, activationExamples])

  // Reset feature index when filtered list changes
  useEffect(() => {
    if (currentFeatureIndex >= filteredFeatureList.length && filteredFeatureList.length > 0) {
      setCurrentFeatureIndex(filteredFeatureList.length - 1)
    } else if (filteredFeatureList.length === 0) {
      setCurrentFeatureIndex(0)
    }
  }, [filteredFeatureList.length, currentFeatureIndex])

  // Reset selected index when visible categories change (auto-select first feature)
  useEffect(() => {
    setCurrentSelectedIndex(0)
  }, [visibleCategories])

  // Track previous canTrainSVM value to detect transition
  const prevCanTrainSVMRef = useRef(canTrainSVM)

  // Reset selected index to first element when canTrainSVM becomes true
  // This is needed because the list updates (SVM predictions) after the threshold is met
  useEffect(() => {
    if (canTrainSVM && !prevCanTrainSVMRef.current) {
      // Transition from false -> true: reset to first element
      setCurrentSelectedIndex(0)
    }
    prevCanTrainSVMRef.current = canTrainSVM
  }, [canTrainSVM])


  // Get selected feature data for right panel (based on which list is active)
  // Uses filtered lists to respect category filter
  const selectedFeatureData = useMemo(() => {
    if (activeListSource === 'all') {
      const feature = filteredFeatureList[currentFeatureIndex]
      if (!feature) return null
      return {
        featureId: feature.featureId,
        row: feature.row,
        activation: activationExamples[feature.featureId] || null
      }
    } else {
      // activeListSource === 'selected' - uses sortedFilteredFeatureList
      const featureId = sortedFilteredFeatureList[currentSelectedIndex]
      if (featureId === undefined) return null
      const feature = featureListWithMetadata.find(f => f.featureId === featureId)
      if (!feature) return null
      return {
        featureId: feature.featureId,
        row: feature.row,
        activation: activationExamples[feature.featureId] || null
      }
    }
  }, [activeListSource, filteredFeatureList, currentFeatureIndex, sortedFilteredFeatureList, currentSelectedIndex, featureListWithMetadata, activationExamples])

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
    setCurrentSelectedIndex(index)
    setActiveListSource('selected')
  }, [])

  // Handle click on a point in UMAP scatter
  const handleUMAPFeatureSelect = useCallback((featureId: number) => {
    // Find the feature in sortedFilteredFeatureList
    const index = sortedFilteredFeatureList.indexOf(featureId)
    if (index !== -1) {
      setCurrentSelectedIndex(index)
      setActiveListSource('selected')
    } else {
      // Feature not in selected list - try finding in all features list
      const allIndex = filteredFeatureList.findIndex(f => f.featureId === featureId)
      if (allIndex !== -1) {
        setCurrentFeatureIndex(allIndex)
        setActiveListSource('all')
      }
    }
  }, [sortedFilteredFeatureList, filteredFeatureList])

  // ============================================================================
  // COMMIT HISTORY HELPERS
  // ============================================================================

  // Helper function to compute cause counts using effective categories
  const getCauseCounts = useCallback((): CauseCommitCounts => {
    let noisyActivation = 0, missedNgram = 0, missedContext = 0, wellExplained = 0, unsure = 0

    featureListWithMetadata.forEach((f: typeof featureListWithMetadata[0]) => {
      const effectiveCategory = getEffectiveCategory(f.featureId)
      if (effectiveCategory === 'noisy-activation') noisyActivation++
      else if (effectiveCategory === 'missed-N-gram') missedNgram++
      else if (effectiveCategory === 'missed-context') missedContext++
      else if (effectiveCategory === 'well-explained') wellExplained++
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
  }, [featureListWithMetadata, getEffectiveCategory])

  // ============================================================================
  // COMMIT HISTORY - Using centralized hook with storeSync
  // ============================================================================

  // Store sync setters (inline functions that use setState)
  const setStoreCommitHistory = useCallback((commits: DisplayCommit<CauseCommitCounts>[]) => {
    useVisualizationStore.setState({ stage3CommitHistory: commits })
  }, [])

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<number, CauseCategory>; sources: Map<number, 'manual' | 'auto'>; featureIds?: Set<number> }>) => {
    useVisualizationStore.setState({ stage3CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage3CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<number, CauseCategory>; sources: Map<number, 'manual' | 'auto'>; featureIds: Set<number>; counts: CauseCommitCounts }) => {
    setStage3FinalCommit({
      causeSelectionStates: new Map(data.states),
      causeSelectionSources: new Map(data.sources),
      featureIds: data.featureIds,
      counts: data.counts
    })
  }, [setStage3FinalCommit])

  // Memoize storeSync to prevent infinite loops (object reference stability)
  const storeSync = useMemo(() => ({
    isRevisiting: isRevisitingStage3,
    stageCommitHistory: stage3CommitHistory,
    stageCommitData: stage3CommitData,
    stageCurrentCommitIndex: stage3CurrentCommitIndex,
    setStoreCommitHistory,
    setStoreCommitData,
    setStoreCurrentCommitIndex,
    setFinalCommit: setFinalCommitFromHook
  }), [isRevisitingStage3, stage3CommitHistory, stage3CommitData, stage3CurrentCommitIndex, setStoreCommitHistory, setStoreCommitData, setStoreCurrentCommitIndex, setFinalCommitFromHook])

  // Use the commit history hook with store sync
  const { createCommit } = useCommitHistory<Map<number, CauseCategory>, Map<number, 'manual' | 'auto'>, CauseCommitCounts>({
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
    // Store sync - handles all store synchronization automatically
    storeSync,
    selectionStates: causeSelectionStates,
    selectionSources: causeSelectionSources
  })

  // ============================================================================
  // NAVIGATION HANDLERS - Navigate through brushed/selected features
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentSelectedIndex(i => Math.max(0, i - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentSelectedIndex(i => Math.min(sortedFilteredFeatureList.length - 1, i + 1))
  }, [sortedFilteredFeatureList.length])

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's effective category (considering margin threshold and well-explained segment)
  const currentCauseCategory = useMemo(() => {
    if (!selectedFeatureData) return null
    return getEffectiveCategory(selectedFeatureData.featureId)
  }, [selectedFeatureData, getEffectiveCategory])

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
  }, [selectedFeatureData, currentCauseCategory, currentCauseSource, setCauseCategory])

  // Handle Unsure click - clear cause category
  const handleUnsureClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    // Clear the cause category to null (unsure)
    setCauseCategory(featureId, null)
  }, [selectedFeatureData, setCauseCategory])

  // ============================================================================
  // SELECTED TAGGING HANDLERS
  // ============================================================================

  // Tag ALL confident features (all three categories at once)
  const handleTagAllConfident = useCallback(() => {
    console.log('[CauseView] Tag All Confident Features')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Apply tags to all filtered features that aren't manually tagged
    filteredFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features - preserve user's explicit choices
      if (source === 'manual') return
      // Tag features with their predicted category
      const predictedCategory = causeSelectionStates.get(featureId)
      if (predictedCategory === 'missed-N-gram' || predictedCategory === 'missed-context' || predictedCategory === 'noisy-activation') {
        setCauseCategory(featureId, predictedCategory, false)
      }
    })
  }, [filteredFeatureIds, causeSelectionSources, causeSelectionStates, setCauseCategory, createCommit])

  // Tag confident features that are predicted as the specified category
  // Only confirms features already predicted as that category (doesn't retag other categories)
  const handleTagSelectedAs = useCallback((category: 'noisy-activation' | 'missed-context' | 'missed-N-gram') => {
    console.log('[CauseView] Confirm Confident Features As:', category)

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Apply tags only to features that are already predicted as this category
    filteredFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features - preserve user's explicit choices
      if (source === 'manual') return
      // Only tag features that match the target category
      const predictedCategory = causeSelectionStates.get(featureId)
      if (predictedCategory !== category) return
      setCauseCategory(featureId, category, false)
    })
  }, [filteredFeatureIds, causeSelectionSources, causeSelectionStates, setCauseCategory, createCommit])

  // Tag remaining untagged features by decision boundary (highest margin category)
  // Note: SVM only predicts cause categories (pattern miss, context miss, noisy activation)
  // Well-Explained is tagged individually, not by SVM batch tagging
  const handleTagRemainingByBoundary = useCallback(() => {
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) return
    if (!selectedFeatureIds) return

    console.log('[CauseView] Tag Remaining By Boundary clicked')

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Collect all updates in a batch map (only cause categories, not well-explained)
    const batchUpdates = new Map<number, 'noisy-activation' | 'missed-N-gram' | 'missed-context'>()

    // SVM cause categories (excludes well-explained)
    const svmCategories = ['noisy-activation', 'missed-N-gram', 'missed-context']

    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features
      if (source === 'manual') return

      const categoryMargins = causeCategoryDecisionMargins.get(featureId)
      if (!categoryMargins) return

      // Find category with highest margin among SVM categories only
      const entries = Object.entries(categoryMargins).filter(([cat]) => svmCategories.includes(cat))
      if (entries.length === 0) return

      const [bestCategory] = entries.reduce((best, curr) =>
        curr[1] > best[1] ? curr : best
      )
      batchUpdates.set(featureId, bestCategory as 'noisy-activation' | 'missed-N-gram' | 'missed-context')
    })

    // 3. Apply all updates in a single state change
    // isActualManual=false because this is a batch operation (decision boundary)
    if (batchUpdates.size > 0) {
      setCauseCategoriesBatch(batchUpdates, false)
    }
    // Effect will sync changes to current commit
  }, [causeCategoryDecisionMargins, selectedFeatureIds, causeSelectionSources, setCauseCategoriesBatch, createCommit])

  // Handle next stage navigation (Stage 3 -> Stage 4)
  const handleNextStage = useCallback(() => {
    moveToNextStep()
  }, [moveToNextStep])

  // Count how many remaining features will be tagged to each category by decision boundary
  // Note: SVM only predicts cause categories (excludes well-explained)
  const boundaryTagCounts = useMemo(() => {
    const counts = {
      'noisy-activation': 0,
      'missed-context': 0,
      'missed-N-gram': 0
    }

    if (!causeCategoryDecisionMargins || !selectedFeatureIds) return counts

    // SVM cause categories (excludes well-explained)
    const svmCategories = ['noisy-activation', 'missed-N-gram', 'missed-context']

    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features
      if (source === 'manual') return

      const categoryMargins = causeCategoryDecisionMargins.get(featureId)
      if (!categoryMargins) return

      // Find category with highest margin among SVM categories only
      const entries = Object.entries(categoryMargins).filter(([cat]) => svmCategories.includes(cat))
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

  // Compute composition of remaining features (non-manually-tagged) by current effective category
  // Used for "Tag All Remaining by SVM" button legend
  // Note: Excludes well-explained (they are tagged individually, not by SVM batch tagging)
  const remainingComposition = useMemo(() => {
    let patternMiss = 0, contextMiss = 0, noisyActivation = 0, unsure = 0

    if (!selectedFeatureIds) return { patternMiss, contextMiss, noisyActivation, unsure, total: 0 }

    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features - they won't be re-tagged
      if (source === 'manual') return
      // Skip well-explained features - they are tagged individually, not by SVM batch tagging
      const effectiveCategory = getEffectiveCategory(featureId)
      if (effectiveCategory === 'well-explained') return

      switch (effectiveCategory) {
        case 'missed-N-gram': patternMiss++; break
        case 'missed-context': contextMiss++; break
        case 'noisy-activation': noisyActivation++; break
        default: unsure++
      }
    })

    const total = patternMiss + contextMiss + noisyActivation + unsure
    return { patternMiss, contextMiss, noisyActivation, unsure, total }
  }, [selectedFeatureIds, causeSelectionSources, getEffectiveCategory])

  // Compute batch tagging composition based on filtered features (for "Tag Confident Features as")
  // Uses filteredFeatureIds which respects the current filterByTag setting
  const filteredBatchComposition = useMemo(() => {
    let patternMiss = 0, contextMiss = 0, noisyActivation = 0
    let manualCount = 0

    filteredFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip manually tagged features - they won't be re-tagged
      if (source === 'manual') {
        manualCount++
        return
      }
      const category = causeSelectionStates.get(featureId)
      switch (category) {
        case 'missed-N-gram': patternMiss++; break
        case 'missed-context': contextMiss++; break
        case 'noisy-activation': noisyActivation++; break
      }
    })

    const taggableCount = patternMiss + contextMiss + noisyActivation
    return { patternMiss, contextMiss, noisyActivation, manualCount, taggableCount }
  }, [filteredFeatureIds, causeSelectionSources, causeSelectionStates])

  // Memoize featureIds array to prevent unnecessary UMAPScatter re-renders
  // Array.from creates a new array reference on every call, so we memoize it
  // Always pass ALL features - filtering is done inside UMAPScatter via filterByTag prop
  const stableFeatureIds = useMemo(() => {
    return selectedFeatureIds ? Array.from(selectedFeatureIds) : []
  }, [selectedFeatureIds])

  // Get colors for each cause category
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#9ca3af'
  const wellExplainedColor = getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#9ca3af'
  const unsureColor = UNSURE_GRAY

  // Get display score for sortConfig (decision margin or undefined for diversity)
  const getDisplayScore = useCallback((featureId: number) => {
    // No score display for diversity mode (items are just medoids)
    if (sortMode === 'diversity') return undefined
    return decisionMarginMap.get(featureId)
  }, [decisionMarginMap, sortMode])

  // Render feature item for selected ScrollableItemList
  const renderBottomRowFeatureItem = useCallback((featureId: number, index: number) => {
    const causeSource = causeSelectionSources.get(featureId)

    // In diversity mode, show all features as "Unsure" (initial exploration)
    // Exception: manually tagged features should still show their tag
    let tagName: string
    let isAuto = false

    if (sortMode === 'diversity') {
      // Diversity mode: show manual tags, otherwise unsure
      if (causeSource === 'manual') {
        const manualCategory = causeSelectionStates.get(featureId)
        tagName = manualCategory ? (CAUSE_TAG_NAMES[manualCategory] || 'Unsure') : 'Unsure'
      } else {
        tagName = 'Unsure'
      }
    } else {
      // Other modes: use effective category (includes SVM predictions)
      const effectiveCategory = getEffectiveCategory(featureId)
      tagName = effectiveCategory === 'unsure'
        ? 'Unsure'
        : CAUSE_TAG_NAMES[effectiveCategory] || 'Unsure'

      // Stripe pattern only in Top mode for non-manual features (above-threshold candidates)
      // Low mode: no stripe (unsure features, no auto-tagging shown)
      // Top mode: stripe for candidates (above threshold, showing predicted category)
      isAuto = isTopMode && causeSource !== 'manual' && effectiveCategory !== 'unsure'
    }

    return (
      <TagBadge
        featureId={featureId}
        tagName={tagName}
        tagCategoryId={TAG_CATEGORY_CAUSE}
        onClick={() => handleSelectedListClick(index)}
        fullWidth={true}
        isAuto={isAuto}
      />
    )
  }, [sortMode, getEffectiveCategory, causeSelectionStates, causeSelectionSources, isTopMode, handleSelectedListClick])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Block UI ONLY for initial load (first time classification + UMAP)
  // After initial load, show loading overlay instead of unmounting everything
  const isInitialLoad = (causeCategoryDecisionMargins.size === 0 && !isRevisitingStage3) || umapLoading

  if (isInitialLoad) {
    return (
      <div className={`cause-view cause-view--loading ${className}`}>
        <div className="cause-view__loading-overlay">
          <div className="spinner" />
          <span>{umapLoading ? 'Loading UMAP projection...' : 'Initializing cause analysis...'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`cause-view ${className} ${causeClassificationLoading ? 'cause-view--svm-loading' : ''}`}>

      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Cause Analysis</span>
        <span className="view-description">
          Identify root cause for features that{' '}
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
        {/* Main column: StatusPanel (with filter in Top mode) + Content */}
        <div className="cause-view__main">
          {/* Status panel - sorting controls + filter (in Top mode) */}
          <StatusPanel
            sortMode={sortMode}
            sortDirection={selectedSortDirection}
            onSortModeChange={setSortMode}
            onSortDirectionChange={setSelectedSortDirection}
            hasDiversityIds={diversityFeatureIds.size > 0}
            isTemplateSort={isTemplateSort}
            filterOptions={[
              { value: 'missed-N-gram', label: 'Pattern Miss', color: missedNgramColor },
              { value: 'missed-context', label: 'Context Miss', color: missedContextColor },
              { value: 'noisy-activation', label: 'Noisy Activation', color: noisyActivationColor }
            ]}
            filterValue={filterByTag}
            onFilterChange={(value) => setFilterByTag(value as CauseCategory | null)}
            filterDisabled={!isTopMode}
            decisionMarginDisabled={!canTrainSVM}
            hideTagged={hideTagged}
            onHideTaggedChange={setHideTagged}
          />

          {/* Main content: Top row + Bottom action bar */}
          <div className="cause-view__content">
          {/* Top row: Left column (top panel + UMAP) + Right panel */}
          <div className="cause-view__row-top">
            {/* Left column - histogram/list on top, UMAP below */}
            <div className="cause-view__left-column">
              {/* Top panel - histogram + scrollable list side by side, NO padding/margin */}
              <div className="cause-view__top-panel">
                {/* Histogram section with header */}
                <div className="cause-view__histogram-section">
                  <div className="cause-view__header-row">
                    <h4 className="subheader">Unsure Boundary</h4>
                    <span className="subheader__value">
                      {sortMode === 'decisionMargin' && selectedSortDirection === 'desc' ? 'Top' : 'Low'} {_targetPercentage}%
                    </span>
                  </div>
                  <CauseMarginHistogram
                    featureIds={selectedFeatureIds || new Set()}
                    causeCategoryDecisionMargins={causeCategoryDecisionMargins}
                    causeSelectionStates={causeSelectionStates as Map<number, CauseCategory>}
                    causeSelectionSources={causeSelectionSources}
                    threshold={causeMarginThreshold}
                    onThresholdChange={setCauseMarginThreshold}
                    height={190}
                    sortMode={sortMode}
                    sortDirection={selectedSortDirection}
                    onPercentageChange={setTargetPercentage}
                    canTrainSVM={canTrainSVM}
                    manualTagCountsByCategory={manualTagCountsByCategory}
                  />
                </div>
                <ScrollableItemList
                  className="cause-view__top-list"
                  variant="causeBrushed"
                  badges={[{ label: 'Features', count: sortedFilteredFeatureList.length }]}
                  columnHeader={columnHeaderProps}
                  items={sortedFilteredFeatureList}
                  renderItem={renderBottomRowFeatureItem}
                  sortConfig={{ getDisplayScore }}
                  currentIndex={activeListSource === 'selected' ? currentSelectedIndex : -1}
                  isActive={activeListSource === 'selected'}
                  emptyMessage="Select a cell with features"
                  disableAutoScroll={true}
                />
              </div>

              {/* UMAP wrapper - fills remaining vertical space */}
              <div className="cause-view__umap-wrapper">
                <UMAPScatter
                  featureIds={stableFeatureIds}
                  className="cause-view__umap"
                  selectedFeatureId={selectedFeatureData?.featureId ?? null}
                  visibleCategories={visibleCategories}
                  onVisibleCategoriesChange={setVisibleCategories}
                  onFeatureSelect={handleUMAPFeatureSelect}
                  sortMode={sortMode}
                  sortDirection={selectedSortDirection}
                  filterByTag={isTopMode ? filterByTag : null}
                />
              </div>
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

                    {/* Parallel Coordinates - between activation and explanation */}
                    <div className="cause-view__metrics-header">
                      <h4 className="subheader">Metrics</h4>
                      <div className="cause-view__metrics-legend">
                        <div className="legend-item">
                          <svg width="24" height="12">
                            <line x1="0" y1="6" x2="24" y2="6" stroke={wellExplainedColor} strokeWidth="1" opacity="0.4" />
                          </svg>
                          <span className="legend-label">Well-Explained ({wellExplainedScores.size})</span>
                        </div>
                        <div className="legend-item">
                          <svg width="24" height="12">
                            <line x1="0" y1="6" x2="24" y2="6" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx="12" cy="6" r="3" fill="#000" stroke="white" strokeWidth="1" />
                          </svg>
                          <span className="legend-label">Current Feature</span>
                        </div>
                        <div className="legend-item">
                          <svg width="24" height="12">
                            <line x1="0" y1="6" x2="24" y2="6" stroke="#B22222" strokeWidth="1.5" strokeDasharray="4 3" />
                          </svg>
                          <span className="legend-label">Random (0.5)</span>
                        </div>
                      </div>
                    </div>
                    <div className="cause-view__metrics-container">
                      <CauseMetricParallelCoords
                        wellExplainedScores={wellExplainedScores}
                        currentScores={causeMetricScores.get(selectedFeatureData.featureId) ?? null}
                      />
                    </div>

                    {/* Best Explanation Header */}
                    <div className="cause-view__explanation-header">
                      <span className="subheader subheader--with-value">
                        Best Explanation
                        <span className="subheader__label">Quality Score:</span>
                        <span className="subheader__value">
                          {bestExplanation?.qualityScore !== undefined ? bestExplanation.qualityScore.toFixed(3) : 'N/A'}
                        </span>
                      </span>
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
                                  hasNoActivations={!selectedFeatureData?.activation?.quantile_examples?.length}
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

                    {/* Floating control panel at bottom */}
                    <div className="cause-view__floating-controls">
                      {/* Previous button */}
                      <button
                        className="nav__button"
                        onClick={handleNavigatePrevious}
                        disabled={currentSelectedIndex === 0 || sortedFilteredFeatureList.length === 0}
                      >
                        ← Prev
                      </button>

                      {/* Selection buttons - all features must have a tag */}
                      <TagButton
                        label="Unsure"
                        variant="unsure"
                        color={unsureColor}
                        isSelected={currentCauseCategory === 'unsure'}
                        onClick={handleUnsureClick}
                      />
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
                        disabled={currentSelectedIndex >= sortedFilteredFeatureList.length - 1 || sortedFilteredFeatureList.length === 0}
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
                <h4 className="subheader">Batch Tagging</h4>
                {/* Show placeholder only if user has never clicked "Most Confident First" */}
                {!isTopMode && !hasEverBeenTopMode ? (
                  // Substage 2: Need to switch to "Most Confident First" mode
                  <div className="cause-view__batch-placeholder">
                    <div className="cause-view__batch-placeholder-content">
                      <div className="cause-view__batch-placeholder-instruction">
                        <span className="cause-view__batch-placeholder-number">2</span>
                        Click "Most Confident First" to enable batch tagging
                      </div>
                    </div>
                  </div>
                ) : (
                  // Batch tagging available - show buttons
                  <>
                {/* Legend for swatch patterns */}
                <div className="cause-view__swatch-legend">
                  <div className="cause-view__swatch-legend-item">
                    <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': '#000000' } as React.CSSProperties} />
                    <span className="cause-view__swatch-legend-label">Preview</span>
                  </div>
                  <div className="cause-view__swatch-legend-item">
                    <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                    <span className="cause-view__swatch-legend-label">Pattern Miss</span>
                  </div>
                  <div className="cause-view__swatch-legend-item">
                    <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                    <span className="cause-view__swatch-legend-label">Context Miss</span>
                  </div>
                  <div className="cause-view__swatch-legend-item">
                    <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                    <span className="cause-view__swatch-legend-label">Noisy Activation</span>
                  </div>
                  <div className="cause-view__swatch-legend-item">
                    <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                    <span className="cause-view__swatch-legend-label">Unsure</span>
                  </div>
                </div>
                {/* Row 1: Tag Confident Features as specific categories */}
                <div className="cause-view__action-section">
                  <div className="cause-view__action-row">
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--with-icon"
                        onClick={() => handleTagSelectedAs('missed-N-gram')}
                        disabled={!canTrainSVM || !isTopMode || (filterByTag !== null && filterByTag !== 'missed-N-gram') || filteredBatchComposition.patternMiss === 0}
                        title="Confirm all Pattern Miss predictions"
                      >
                        <ThresholdHandleIcon
                          className="batch-button-icon"
                          orientation="horizontal"
                        />
                        <span className="batch-button-text">Confirm Confident<br />Pattern Miss</span>
                      </button>
                      <div className="action-button__legend">
                        {isTopMode ? (
                          filteredBatchComposition.patternMiss > 0 ? (
                            <>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedNgramColor } as React.CSSProperties} />
                                <span className="action-button__legend-count">{filteredBatchComposition.patternMiss}</span>
                              </span>
                              <span className="action-button__legend-arrow">→</span>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                                <span className="action-button__legend-count">{filteredBatchComposition.patternMiss}</span>
                              </span>
                            </>
                          ) : <span>&nbsp;</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    </div>
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--with-icon"
                        onClick={() => handleTagSelectedAs('missed-context')}
                        disabled={!canTrainSVM || !isTopMode || (filterByTag !== null && filterByTag !== 'missed-context') || filteredBatchComposition.contextMiss === 0}
                        title="Confirm all Context Miss predictions"
                      >
                        <ThresholdHandleIcon
                          className="batch-button-icon"
                          orientation="horizontal"
                        />
                        <span className="batch-button-text">Confirm Confident<br />Context Miss</span>
                      </button>
                      <div className="action-button__legend">
                        {isTopMode ? (
                          filteredBatchComposition.contextMiss > 0 ? (
                            <>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedContextColor } as React.CSSProperties} />
                                <span className="action-button__legend-count">{filteredBatchComposition.contextMiss}</span>
                              </span>
                              <span className="action-button__legend-arrow">→</span>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                                <span className="action-button__legend-count">{filteredBatchComposition.contextMiss}</span>
                              </span>
                            </>
                          ) : <span>&nbsp;</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    </div>
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--with-icon"
                        onClick={() => handleTagSelectedAs('noisy-activation')}
                        disabled={!canTrainSVM || !isTopMode || (filterByTag !== null && filterByTag !== 'noisy-activation') || filteredBatchComposition.noisyActivation === 0}
                        title="Confirm all Noisy Activation predictions"
                      >
                        <ThresholdHandleIcon
                          className="batch-button-icon"
                          orientation="horizontal"
                        />
                        <span className="batch-button-text">Confirm Confident<br />Noisy Activation</span>
                      </button>
                      <div className="action-button__legend">
                        {isTopMode ? (
                          filteredBatchComposition.noisyActivation > 0 ? (
                            <>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': noisyActivationColor } as React.CSSProperties} />
                                <span className="action-button__legend-count">{filteredBatchComposition.noisyActivation}</span>
                              </span>
                              <span className="action-button__legend-arrow">→</span>
                              <span className="action-button__legend-item">
                                <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                                <span className="action-button__legend-count">{filteredBatchComposition.noisyActivation}</span>
                              </span>
                            </>
                          ) : <span>&nbsp;</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Decision Boundary buttons */}
                <div className="cause-view__action-section">
                  <div className="cause-view__action-row">
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--with-icon"
                        onClick={handleTagAllConfident}
                        disabled={!canTrainSVM || !isTopMode || filterByTag !== null || filteredBatchComposition.taggableCount === 0}
                        title="Confirm all confident predictions"
                      >
                        <ThresholdHandleIcon
                          className="batch-button-icon"
                          orientation="horizontal"
                        />
                        <span className="batch-button-text">Confirm Confident by<br />Decision Boundary</span>
                      </button>
                      <div className="action-button__legend">
                        {isTopMode && filterByTag === null ? (
                          filteredBatchComposition.taggableCount > 0 ? (
                            <>
                              {filteredBatchComposition.patternMiss > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedNgramColor } as React.CSSProperties} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.patternMiss}</span>
                                </span>
                              )}
                              {filteredBatchComposition.contextMiss > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedContextColor } as React.CSSProperties} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.contextMiss}</span>
                                </span>
                              )}
                              {filteredBatchComposition.noisyActivation > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': noisyActivationColor } as React.CSSProperties} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.noisyActivation}</span>
                                </span>
                              )}
                              <span className="action-button__legend-arrow">→</span>
                              {filteredBatchComposition.patternMiss > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.patternMiss}</span>
                                </span>
                              )}
                              {filteredBatchComposition.contextMiss > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.contextMiss}</span>
                                </span>
                              )}
                              {filteredBatchComposition.noisyActivation > 0 && (
                                <span className="action-button__legend-item">
                                  <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                                  <span className="action-button__legend-count">{filteredBatchComposition.noisyActivation}</span>
                                </span>
                              )}
                            </>
                          ) : <span>&nbsp;</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                    </div>
                    <div className="action-button-item">
                      <button
                        className="action-button action-button--with-icon"
                        onClick={handleTagRemainingByBoundary}
                        disabled={!canTrainSVM || remainingComposition.total === 0 || !causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0}
                        title="Auto-tag remaining features using SVM decision boundary"
                      >
                        <svg className="batch-button-icon" width="24" height="20" viewBox="0 0 20 16">
                          {/* Three separate rectangles for the three cause categories */}
                          <rect x="0" y="0" width="5.5" height="16" rx="2" fill={missedNgramColor} stroke="#fff" strokeWidth="1"/>
                          <rect x="7.25" y="0" width="5.5" height="16" rx="2" fill={missedContextColor} stroke="#fff" strokeWidth="1"/>
                          <rect x="14.5" y="0" width="5.5" height="16" rx="2" fill={noisyActivationColor} stroke="#fff" strokeWidth="1"/>
                        </svg>
                        <span className="batch-button-text">Tag All Unsure by<br />Decision Boundary</span>
                      </button>
                      <div className="action-button__legend">
                        {/* Current composition (input) - Order: Pattern Miss, Context Miss, Noisy Activation, Unsure */}
                        {/* Note: Well-Explained handled by individual tagging, not SVM auto-tagging */}
                        {remainingComposition.patternMiss > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedNgramColor } as React.CSSProperties} />
                            <span className="action-button__legend-count">{remainingComposition.patternMiss}</span>
                          </span>
                        )}
                        {remainingComposition.contextMiss > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': missedContextColor } as React.CSSProperties} />
                            <span className="action-button__legend-count">{remainingComposition.contextMiss}</span>
                          </span>
                        )}
                        {remainingComposition.noisyActivation > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': noisyActivationColor } as React.CSSProperties} />
                            <span className="action-button__legend-count">{remainingComposition.noisyActivation}</span>
                          </span>
                        )}
                        {remainingComposition.unsure > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                            <span className="action-button__legend-count">{remainingComposition.unsure}</span>
                          </span>
                        )}
                        {/* Arrow */}
                        <span className="action-button__legend-arrow">→</span>
                        {/* Output composition (by SVM prediction) - Order: Pattern Miss, Context Miss, Noisy Activation */}
                        {/* Note: Well-Explained is tagged individually, not by SVM batch prediction */}
                        {boundaryTagCounts['missed-N-gram'] > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch" style={{ backgroundColor: missedNgramColor }} />
                            <span className="action-button__legend-count">{boundaryTagCounts['missed-N-gram']}</span>
                          </span>
                        )}
                        {boundaryTagCounts['missed-context'] > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch" style={{ backgroundColor: missedContextColor }} />
                            <span className="action-button__legend-count">{boundaryTagCounts['missed-context']}</span>
                          </span>
                        )}
                        {boundaryTagCounts['noisy-activation'] > 0 && (
                          <span className="action-button__legend-item">
                            <span className="action-button__legend-swatch" style={{ backgroundColor: noisyActivationColor }} />
                            <span className="action-button__legend-count">{boundaryTagCounts['noisy-activation']}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  </>
                )}
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
