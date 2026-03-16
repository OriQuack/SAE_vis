import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, FlipTrackingInfo } from '../types'
import * as api from '../api'
import { useSortableList, type ActiveStage, type BootstrapMode, type SortMode } from '../lib/tagging-hooks/useSortableList'
import StageAccordionList from './StageAccordionList'
import { TagBadge, TagButton, DisagreementIndicator } from './Indicators'
import ActivationExample from './ActivationExamplePanel'
import ConsensusSection, { ConsensusLegend } from './ConsensusSection'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE, UNSURE_GRAY, PANEL_LEFT } from '../lib/constants'
import { t, getTagTooltip } from '../lib/i18n'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import { useCommitHistory, createCauseCommitHistoryOptions, type DisplayCommit, isUserConfirmed, useMainListScroll, useTaggingNavigation } from '../lib/tagging-hooks'
import {
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'
import { useResizeObserver } from '../lib/utils'
import { logAction, createDebouncedLogger } from '../lib/action-logger'
import ExportResultsPopup from './ExportResultsPopup'
import LabelingGuidePopup from './LabelingGuidePopup'
import { buildExportData, downloadExportJson } from '../lib/export-utils'
import '../styles/CauseView.css'

// ============================================================================
// CAUSE VIEW - Root cause analysis workflow (Stage 3)
// ============================================================================
// Layout: [Content: UMAP + Selected Features List + Right Panel]

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
  'missed-N-gram': 'Missed Syntax',
  'missed-context': 'Missed Context',
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


  // Stage 2 selection states (for well-explained background lines)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)

  // Table data and activating examples for feature detail view
  const tableData = useVisualizationStore(state => state.tableData)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Cause category selection action
  const setCauseCategory = useVisualizationStore(state => state.setCauseCategory)
  const setCauseCategoriesBatch = useVisualizationStore(state => state.setCauseCategoriesBatch)
  const initializeCauseMetricScores = useVisualizationStore(state => state.initializeCauseMetricScores)
  const lastClickTagAction = useVisualizationStore(state => state.lastClickTagAction)
  const setLastClickTagAction = useVisualizationStore(state => state.setLastClickTagAction)
  const undoLastClickTag = useVisualizationStore(state => state.undoLastClickTag)

  // SVM decision margins for auto-tagging by decision boundary
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)
  const causeDecisionMargins = useVisualizationStore(state => state.causeDecisionMargins)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const causeFlipTracking = useVisualizationStore(state => state.causeFlipTracking)
  const causeCommitteeVotes = useVisualizationStore(state => state.causeCommitteeVotes)

  // Stage navigation - activateStage4 splits Sankey into cause terminal nodes
  const activateStage4 = useVisualizationStore(state => state.activateStage4)

  // Export state
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const stage1FinalCommit = useVisualizationStore(state => state.stage1FinalCommit)
  const stage2FinalCommit = useVisualizationStore(state => state.stage2FinalCommit)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)

  // Shared margin threshold from store (used by UMAPScatter and SelectionPanel)
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)
  const setCauseMarginThreshold = useVisualizationStore(state => state.setCauseMarginThreshold)

  // Local state for feature detail view
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  // Hide tagged items toggle
  const [hideTagged, setHideTagged] = useState(false)
  // Show only QBC disagreement features toggle
  const [showDisagreementOnly, setShowDisagreementOnly] = useState(false)

  // Track reviewed items (any tag action including unsure) for popover trigger
  const [reviewedFeatureIds, setReviewedFeatureIds] = useState<Set<number>>(() => new Set())
  // Store selected feature ID directly to preserve highlight across mode switches
  const [selectedFeatureIdState, setSelectedFeatureIdState] = useState<number | null>(null)
  // Freeze detail panel on tagged feature while SVM retrains (prevents double UI change)
  const [frozenFeatureId, setFrozenFeatureId] = useState<number | null>(null)
  // Loading overlay for batch tagging (persists until SVM classification completes)
  const [batchLoadingOverlay, setBatchLoadingOverlay] = useState(false)
  const prevClassificationLoadingRef = useRef(false)

  // Consensus data from preloaded store (lookup happens after selectedFeatureId is defined below)
  const consensusData = useVisualizationStore(state => state.consensusData)

  // Diversity sort: IDs of diverse features (Kennard-Stone samples) to show first
  // Cached in store to prevent refetch on view navigation
  const diversityFeatureIds = useVisualizationStore(state => state.stage3DiversityFeatureIds)
  const stage3DiversitySignature = useVisualizationStore(state => state.stage3DiversitySignature)
  const setStage3DiversityCache = useVisualizationStore(state => state.setStage3DiversityCache)


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
  const [visibleCategories] = useState<Set<FilterCategory>>(
    new Set(['unsure'])
  )

  // Export popup state
  const [showExportPopup, setShowExportPopup] = useState(false)
  const [exportFileName, setExportFileName] = useState('')

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
      prevHideTaggedRef.current = hideTagged
    }
  }, [hideTagged])

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = isRevisitingStage3 && stage3FinalCommit?.featureIds
    ? stage3FinalCommit.featureIds
    : getSelectedNodeFeatures()

  // Fetch diversity IDs (cluster medoids) for diversity sort mode
  // Uses store cache to prevent refetch when navigating between views
  useEffect(() => {
    const fetchDiversityIds = async () => {
      if (!selectedFeatureIds || selectedFeatureIds.size < 6) {
        if (diversityFeatureIds.size > 0) {
          setStage3DiversityCache(new Set(), '')
        }
        return
      }

      // Compute cache signature: "featureCount" (no threshold for Stage 3)
      const signature = `${selectedFeatureIds.size}`

      // Check if cache is valid
      if (stage3DiversitySignature === signature && diversityFeatureIds.size > 0) {
        return
      }

      try {
        const response = await api.getColdStartSuggestions(
          'feature',
          Array.from(selectedFeatureIds),
          30,  // Get 30 diverse features via Typiclust
          undefined,
          undefined,
          'typiclust'
        )
        const newIds = new Set(response.suggestions.map(s => parseInt(s.id, 10)))
        setStage3DiversityCache(newIds, signature)
      } catch (error) {
        console.error('[CauseView] Failed to fetch diversity IDs:', error)
        setStage3DiversityCache(new Set(), '')
      }
    }
    fetchDiversityIds()
  }, [selectedFeatureIds, stage3DiversitySignature, diversityFeatureIds.size, setStage3DiversityCache])

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
      if (isUserConfirmed(causeSelectionSources.get(featureId)) && counts[category] !== undefined) {
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
      causeDecisionMargins,
      causeMarginThreshold
    )
  }, [causeSelectionStates, causeSelectionSources, causeDecisionMargins, causeMarginThreshold])

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
    columnHeaderProps
  } = useSortableList({
    items: causeFeatureItems,
    getItemKey: (item) => item.featureId,
    getDefaultScore: (item) => item.featureId,  // Default sort by feature ID
    decisionMarginScores: causeDecisionMargins,
    diversityIds: diversityFeatureIds,
    defaultLabel: 'Feature ID',
    decisionMarginLabel: 'Confidence Margin',
    initialMode: 'diversity',
    templateMode: 'decisionMargin',
    templateDirection: 'asc'
  })

  // Independent stage state (decoupled from sort mode) - restore from store when revisiting
  const [activeStage, setActiveStage] = useState<ActiveStage>(stage3FinalCommit?.workflowActiveStage ?? 'bootstrap')

  // Derive bootstrapMode from sortMode (for StageAccordionList display)
  const bootstrapMode: BootstrapMode = sortMode === 'diversity' ? 'diversity' : 'byScore'

  // Sync active stage to store + auto-enable filters when entering Apply phase
  const setWorkflowActiveStage = useVisualizationStore(state => state.setWorkflowActiveStage)
  useEffect(() => {
    setWorkflowActiveStage(activeStage)
    if (activeStage === 'apply' || activeStage === 'learn') {
      setHideTagged(true)
    } else {
      setHideTagged(false)
    }
  }, [activeStage, setWorkflowActiveStage])

  // ACTION LOGGING — margin threshold drag (debounced, skip mount)
  const hasRenderedRef = useRef(false)
  const logMarginDrag = useMemo(() => createDebouncedLogger('stage3', 'margin_threshold_drag', 800), [])
  useEffect(() => {
    if (!hasRenderedRef.current) { hasRenderedRef.current = true; return }
    logMarginDrag({ threshold: causeMarginThreshold })
  }, [causeMarginThreshold, logMarginDrag])

  // Save/restore bootstrap sort config when transitioning between stages
  const lastBootstrapSortRef = useRef<{ mode: SortMode; direction: 'asc' | 'desc' }>({ mode: 'diversity', direction: 'asc' })

  // Handlers for stage changes
  const handleStageChange = useCallback((stage: ActiveStage) => {
    logAction('stage3', 'stage_change', { stage })
    if (activeStage === 'bootstrap') {
      lastBootstrapSortRef.current = { mode: sortMode, direction: selectedSortDirection }
    }
    setActiveStage(stage)
    if (stage === 'bootstrap') {
      setSortMode(lastBootstrapSortRef.current.mode)
      setSelectedSortDirection(lastBootstrapSortRef.current.direction)
    } else if (stage === 'learn') {
      setSortMode('decisionMargin')
      setSelectedSortDirection('asc')
    } else if (stage === 'apply') {
      setSortMode('decisionMargin')
      setSelectedSortDirection('asc')
    }
    setCurrentFeatureIndex(0)
    setSelectedFeatureIdState(null)
  }, [activeStage, sortMode, selectedSortDirection, setSortMode, setSelectedSortDirection])

  // Bootstrap option cycling handler
  const handleBootstrapOptionChange = useCallback((mode: BootstrapMode) => {
    logAction('stage3', 'bootstrap_mode', { mode })
    if (mode === 'diversity') {
      setSortMode('diversity')
    } else {
      setSortMode('default')
      setSelectedSortDirection('asc')
    }
    setCurrentFeatureIndex(0)
    setSelectedFeatureIdState(null)
  }, [setSortMode, setSelectedSortDirection])

  // Determine if we're in "Top" mode (Most Confident First)
  const isTopMode = activeStage === 'apply'

  // Check if feature is visible based on mode and threshold - delegates to utility function
  const isVisibleInCurrentMode = useCallback((featureId: number): boolean => {
    return isFeatureVisibleInMode(
      featureId,
      causeSelectionSources,
      causeDecisionMargins,
      causeMarginThreshold,
      isTopMode
    )
  }, [causeSelectionSources, causeDecisionMargins, causeMarginThreshold, isTopMode])

  // All features filtered by visibility (mode-based) and category filter
  // When hideTagged=true, excludes user-confirmed features (they're already done)
  const filteredFeatureIds = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return []
    return Array.from(selectedFeatureIds).filter(featureId => {
      // Optionally exclude user-confirmed features from the list
      if (hideTagged && isUserConfirmed(causeSelectionSources.get(featureId))) return false
      // First check mode-based visibility (threshold)
      if (!isVisibleInCurrentMode(featureId)) return false
      // In Top mode, show all visible features
      if (isTopMode) {
        return true
      }
      // In Low mode, apply category filter (typically filtering 'unsure')
      const effectiveCategory = getEffectiveCategory(featureId)
      return visibleCategories.has(effectiveCategory)
    })
  }, [selectedFeatureIds, isVisibleInCurrentMode, getEffectiveCategory, visibleCategories, isTopMode, causeSelectionSources, hideTagged])

  // Memoized QBC disagreement lookup - flags only when SVM loses the majority vote
  const disagreementLookup = useMemo(() => {
    const lookup = new Map<number, { isDisagreement: boolean; tooltipText: string }>()
    if (!causeCommitteeVotes) return lookup
    causeCommitteeVotes.forEach((votes, featureId) => {
      const categories = [votes.svm_category, votes.rf_category, votes.mlp_category]
      const counts = new Map<string, number>()
      categories.forEach(c => counts.set(c, (counts.get(c) ?? 0) + 1))
      const majority = [...counts.entries()].find(([, count]) => count >= 2)
      if (majority && majority[0] !== votes.svm_category) {
        lookup.set(featureId, {
          isDisagreement: true,
          tooltipText: `SVM: ${votes.svm_category}\nMajority (RF+MLP): ${majority[0]}`
        })
      }
    })
    return lookup
  }, [causeCommitteeVotes])

  const disagreementFeatureIds = useMemo(() => new Set(disagreementLookup.keys()), [disagreementLookup])

  // Apply visibility filters AFTER sorting
  const sortedFilteredFeatureList = useMemo(() => {
    const featureIds = sortedFeatureItems.map(item => item.featureId)

    return featureIds.filter(featureId => {
      const source = causeSelectionSources.get(featureId)
      const userConfirmed = isUserConfirmed(source)

      // 1. Hide labeled filter
      if (hideTagged && userConfirmed) return false

      // 2. Disagreement filter
      if (showDisagreementOnly && !disagreementFeatureIds.has(featureId)) return false

      // 3. Diversity mode: no further filtering (medoids already curated by hook)
      if (sortMode === 'diversity') return true

      // 4. Apply phase (isTopMode): enforce margin threshold for ALL features
      if (isTopMode) {
        const margin = causeDecisionMargins.get(featureId)
        if (margin === undefined) return true
        return margin >= causeMarginThreshold
      }

      // 5. Non-Apply modes: user-confirmed bypass category filter but respect threshold
      if (!hideTagged && userConfirmed) {
        const margin = causeDecisionMargins.get(featureId)
        if (margin === undefined) return true  // No scores yet (Bootstrap) = show it
        return margin < causeMarginThreshold  // Learn mode: only show below threshold
      }

      // 6. Non-confirmed: mode-based visibility (threshold check)
      if (!isVisibleInCurrentMode(featureId)) return false

      // 7. Category filter (RadViz legend)
      return visibleCategories.has(getEffectiveCategory(featureId))
    })
  }, [sortMode, sortedFeatureItems, hideTagged, causeSelectionSources,
      isVisibleInCurrentMode, isTopMode, visibleCategories, getEffectiveCategory,
      showDisagreementOnly, disagreementFeatureIds,
      causeDecisionMargins, causeMarginThreshold])

  const allFeaturesLabeled = useMemo(() => {
    return causeFeatureItems.length > 0 && causeSelectionStates.size >= causeFeatureItems.length
  }, [causeFeatureItems.length, causeSelectionStates.size])

  // Main list scroll hook - scroll to item when clicked in subviews
  const { scrollTargetIndex } = useMainListScroll({
    sortedFilteredList: sortedFilteredFeatureList,
    sortMode,
    setSortMode,
    setSortDirection: setSelectedSortDirection,
  })

  // Check if flip rate stable (last 5 iterations all < 3%)
  const isFlipRateStable = useMemo(() => {
    const history = causeFlipTracking?.flipHistory
    if (!history || history.length < 5) return false
    const last5 = history.slice(-5)
    return last5.every(h => h.flipRate < 0.03)
  }, [causeFlipTracking?.flipHistory])

  // Flip rate popover dismiss (resets when flip rate becomes unstable — existing behavior)
  const [flipRatePopoverDismissed, setFlipRatePopoverDismissed] = useState(false)
  useEffect(() => {
    if (!isFlipRateStable) setFlipRatePopoverDismissed(false)
  }, [isFlipRateStable])

  // Label count > 50 popover — show once, permanently dismissed
  const labelCountPopoverShown = useRef(false)

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

  // Check if all features are user-confirmed tagged (for enabling next stage button)
  const allTagged = useMemo(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return false
    for (const featureId of selectedFeatureIds) {
      if (!isUserConfirmed(causeSelectionSources.get(featureId))) return false
    }
    return true
  }, [selectedFeatureIds, causeSelectionSources])

  // Download results as JSON
  const handleDownload = useCallback(() => {
    const data = buildExportData({
      sankeyNodes: leftPanel?.sankeyStructure?.nodes,
      stage1FinalCommit,
      stage2FinalCommit,
      pairSelectionStates,
      pairSelectionSources,
      featureSelectionStates,
      featureSelectionSources,
      causeSelectionStates,
      causeSelectionSources
    })
    return downloadExportJson(data)
  }, [
    leftPanel, stage1FinalCommit, stage2FinalCommit,
    pairSelectionStates, pairSelectionSources,
    featureSelectionStates, featureSelectionSources,
    causeSelectionStates, causeSelectionSources
  ])

  // Reset feature index when visible categories change (auto-select first feature)
  useEffect(() => {
    setCurrentFeatureIndex(0)
  }, [visibleCategories])

  // Compute selected feature ID - prefer stored state, fallback to index-based
  // This is the source of truth for which feature is selected
  const selectedFeatureId = useMemo(() => {
    // Prefer stored state when available (survives mode switches)
    if (selectedFeatureIdState !== null) {
      return selectedFeatureIdState
    }
    // Fallback to index-based selection
    return sortedFilteredFeatureList[currentFeatureIndex] ?? null
  }, [selectedFeatureIdState, sortedFilteredFeatureList, currentFeatureIndex])

  // Display the frozen feature (during SVM retrain) or the real selection
  const displayedFeatureId = frozenFeatureId ?? selectedFeatureId

  // Consensus lookup (must be after selectedFeatureId is defined)
  const consensus = displayedFeatureId !== null ? consensusData[displayedFeatureId] ?? null : null

  // Sync currentFeatureIndex when lists change (after mode switch)
  // This keeps the index pointing to the stored selected item
  useEffect(() => {
    if (selectedFeatureIdState === null) return

    // Find the stored item in the current active list
    const newIndex = sortedFilteredFeatureList.indexOf(selectedFeatureIdState)
    if (newIndex !== -1 && newIndex !== currentFeatureIndex) {
      setCurrentFeatureIndex(newIndex)
    }
  }, [selectedFeatureIdState, sortedFilteredFeatureList, currentFeatureIndex])

  // Reset to first item when SVM completes and re-sorts the list (decisionMargin mode only)
  // causeDecisionMargins gets a new Map reference on every SVM completion
  const prevMarginsRef = useRef(causeDecisionMargins)
  useEffect(() => {
    if (prevMarginsRef.current === causeDecisionMargins) return
    prevMarginsRef.current = causeDecisionMargins
    if (sortMode === 'decisionMargin' && causeDecisionMargins.size > 0) {
      setSelectedFeatureIdState(null)
      setCurrentFeatureIndex(0)
      setFrozenFeatureId(null)
    }
  }, [causeDecisionMargins, sortMode])

  // Clear batch loading overlay when SVM classification finishes (true → false transition)
  useEffect(() => {
    if (prevClassificationLoadingRef.current && !causeClassificationLoading && batchLoadingOverlay) {
      setBatchLoadingOverlay(false)
    }
    prevClassificationLoadingRef.current = causeClassificationLoading
  }, [causeClassificationLoading, batchLoadingOverlay])

  // Compute highlight index for main list (always show where selected item is)
  const mainListHighlightIndex = useMemo(() => {
    if (selectedFeatureId === null) return -1
    return sortedFilteredFeatureList.indexOf(selectedFeatureId)
  }, [selectedFeatureId, sortedFilteredFeatureList])

  // Effect: Auto-switch from diversity mode when selected feature is not visible in main list
  // This ensures the highlight always appears when a feature is selected from subviews
  useEffect(() => {
    if (selectedFeatureId === null || sortMode !== 'diversity') return

    const indexInMainList = sortedFilteredFeatureList.indexOf(selectedFeatureId)
    if (indexInMainList === -1) {
      // Selected feature not visible in medoids list, switch to Learn mode
      setSortMode('decisionMargin')
      setSelectedSortDirection('asc')
    }
  }, [selectedFeatureId, sortMode, sortedFilteredFeatureList, setSortMode, setSelectedSortDirection])

  // Show learn popover when all bootstrap items are labeled
  const lastRepReviewed = activeStage === 'bootstrap' && sortedFilteredFeatureList.length > 0 && reviewedFeatureIds.has(sortedFilteredFeatureList[sortedFilteredFeatureList.length - 1])

  // Get selected feature data for right panel
  const selectedFeatureData = useMemo(() => {
    if (displayedFeatureId === null) return null
    const feature = featureListWithMetadata.find(f => f.featureId === displayedFeatureId)
    if (!feature) return null
    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [displayedFeatureId, featureListWithMetadata, activationExamples])

  // Handle click on feature list item (main StageAccordionList)
  const handleListItemClick = useCallback((index: number) => {
    // Set feature ID first (survives mode switches)
    const featureId = sortedFilteredFeatureList[index]
    if (featureId !== undefined) {
      setSelectedFeatureIdState(featureId)
      logAction('stage3', 'feature_click', { featureId, index })
    }
    setCurrentFeatureIndex(index)
  }, [sortedFilteredFeatureList])



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

  const setStoreCommitData = useCallback((data: Map<number, { states: Map<number, CauseCategory>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }>) => {
    useVisualizationStore.setState({ stage3CommitData: data })
  }, [])

  const setStoreCurrentCommitIndex = useCallback((index: number) => {
    useVisualizationStore.setState({ stage3CurrentCommitIndex: index })
  }, [])

  const setFinalCommitFromHook = useCallback((data: { states: Map<number, CauseCategory>; sources: Map<number, 'click' | 'threshold' | 'predicted'>; featureIds: Set<number>; counts: CauseCommitCounts }) => {
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
  const { createCommit } = useCommitHistory<Map<number, CauseCategory>, Map<number, 'click' | 'threshold' | 'predicted'>, CauseCommitCounts>({
    ...createCauseCommitHistoryOptions(
      () => causeSelectionStates,
      () => causeSelectionSources,
      restoreCauseSelectionStates
    ),
    calculateCounts: getCauseCounts,
    getFeatureIds: () => selectedFeatureIds,
    getFlipTracking: () => useVisualizationStore.getState().causeFlipTracking,
    restoreFlipTracking: (ft) => {
      useVisualizationStore.setState({ causeFlipTracking: ft })
    },
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
    logAction('stage3', 'navigate_prev', {})
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setSelectedFeatureIdState(null)  // Clear stored state to allow normal navigation
    setCurrentFeatureIndex(i => Math.min(sortedFilteredFeatureList.length - 1, i + 1))
  }, [sortedFilteredFeatureList.length])

  const { handlePostTagNavigation, handlePostUnsureNavigation } = useTaggingNavigation({
    sortMode,
    currentIndex: currentFeatureIndex,
    listLength: sortedFilteredFeatureList.length,
    onNavigateNext: handleNavigateNext,
    onResetToFirst: () => {
      setSelectedFeatureIdState(null)
      setCurrentFeatureIndex(0)
    },
    isHistogramReady: causeDecisionMargins.size > 0,
    hideTagged,
    onClearStoredSelection: () => setSelectedFeatureIdState(null)
  })

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's effective category — phase-aware:
  // Bootstrap: only manual tags, everything else is unsure
  // Learn/Apply: threshold-aware effective category
  const currentCauseCategory = useMemo(() => {
    if (!selectedFeatureData) return null
    const featureId = selectedFeatureData.featureId
    if (activeStage === 'bootstrap') {
      const source = causeSelectionSources.get(featureId)
      if (!isUserConfirmed(source)) return 'unsure'
      return causeSelectionStates.get(featureId) || 'unsure'
    }
    return getEffectiveCategory(featureId)
  }, [selectedFeatureData, getEffectiveCategory, activeStage, causeSelectionSources, causeSelectionStates])

  const currentCauseSource = useMemo(() => {
    if (!selectedFeatureData) return null
    return causeSelectionSources.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, causeSelectionSources])

  // Helper to map internal category keys to readable tag labels for logging
  const causeTagLabel = (cat: CauseCategory | 'unsure' | null): string => {
    if (cat === 'noisy-activation') return 'Noisy Activation'
    if (cat === 'missed-N-gram') return 'Missed Syntax'
    if (cat === 'missed-context') return 'Missed Context'
    if (cat === 'well-explained') return 'Well-Explained'
    return 'Unsure'
  }

  // Mark item as reviewed (for popover trigger)
  const markReviewed = useCallback((featureId: number) => {
    setReviewedFeatureIds(prev => prev.has(featureId) ? prev : new Set(prev).add(featureId))
  }, [])

  // Handle tag button click
  // Clicking same category: keep tag and navigate (no toggle-off, matches QualityView)
  // Clicking predicted tag: confirm with manual source
  // Clicking different category: set new category
  const handleTagClick = useCallback((category: CauseCategory) => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)

    logAction('stage3', 'manual_tag', { tag: causeTagLabel(category), previousTag: causeTagLabel(currentCauseCategory), featureId })

    const isSameCategory = currentCauseCategory === category
    const isAutoTagged = currentCauseSource === 'predicted'

    if (isSameCategory && !isAutoTagged) {
      // Already manually selected same category - keep tag and navigate
      // Well-Explained doesn't affect SVM, so advance like unsure (next item)
      // But when hideTagged is ON, don't navigate — item disappears and next shifts into place
      if (category === 'well-explained') {
        if (hideTagged) setSelectedFeatureIdState(null)
        else handlePostUnsureNavigation()
      } else {
        handlePostTagNavigation()
      }
      return
    }

    // Freeze detail panel during SVM retrain to prevent double UI change
    const CAUSE_SVM_CATEGORIES: CauseCategory[] = ['noisy-activation', 'missed-N-gram', 'missed-context']
    const willRetrain = sortMode === 'decisionMargin' && causeDecisionMargins.size > 0
        && CAUSE_SVM_CATEGORIES.includes(category)
    if (willRetrain) {
      setFrozenFeatureId(featureId)
    }

    setCauseCategory(featureId, category)
    setLastClickTagAction({ stage: 'cause', featureId })
    // Well-Explained doesn't trigger SVM retrain, so advance to next (like unsure)
    // But when hideTagged is ON, don't navigate — item disappears and next shifts into place
    if (category === 'well-explained') {
      if (hideTagged) setSelectedFeatureIdState(null)
      else handlePostUnsureNavigation()
    } else {
      handlePostTagNavigation()
    }
  }, [selectedFeatureData, currentCauseCategory, currentCauseSource, setCauseCategory,
      setLastClickTagAction, markReviewed, handlePostTagNavigation, handlePostUnsureNavigation, hideTagged, sortMode, causeDecisionMargins])

  // Handle Unsure click - clear cause category and advance
  const handleUnsureClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)

    logAction('stage3', 'manual_tag', { tag: 'Unsure', previousTag: causeTagLabel(currentCauseCategory), featureId })

    setCauseCategory(featureId, null)
    handlePostUnsureNavigation()
  }, [selectedFeatureData, currentCauseCategory, setCauseCategory, markReviewed, handlePostUnsureNavigation])

  // ============================================================================
  // SELECTED TAGGING HANDLERS
  // ============================================================================

  // Tag ALL confident features (all three categories at once)
  const handleTagAllConfident = useCallback(() => {
    setBatchLoadingOverlay(true)
    logAction('stage3', 'tag_all_confident', { count: filteredFeatureIds.length, totalFeatures: selectedFeatureIds?.size ?? 0 })

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('tagAll')

    // 2. Collect all updates into a batch map
    const batchUpdates = new Map<number, 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'>()

    filteredFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip user-confirmed features - preserve user's explicit choices
      if (isUserConfirmed(source)) return
      // Tag features with their predicted category
      const predictedCategory = causeSelectionStates.get(featureId)
      if (predictedCategory === 'missed-N-gram' || predictedCategory === 'missed-context' || predictedCategory === 'noisy-activation') {
        batchUpdates.set(featureId, predictedCategory)
      }
    })

    // 3. Apply all updates in a single state change
    if (batchUpdates.size > 0) {
      setCauseCategoriesBatch(batchUpdates)
      setSelectedFeatureIdState(null)
      setCurrentFeatureIndex(0)
    }
  }, [filteredFeatureIds, causeSelectionSources, causeSelectionStates, setCauseCategoriesBatch, createCommit, selectedFeatureIds?.size])

  // Tag remaining untagged features by decision boundary (highest margin category)
  // Note: SVM only predicts cause categories (pattern miss, context miss, noisy activation)
  // Well-Explained is tagged individually, not by SVM batch tagging
  const handleTagRemainingByBoundary = useCallback(() => {
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) return
    setBatchLoadingOverlay(true)
    if (!selectedFeatureIds) return

    // 1. Create new commit FIRST (copies current state with manual tags only)
    createCommit('apply')

    // 2. Collect all updates in a batch map (only cause categories, not well-explained)
    const batchUpdates = new Map<number, 'noisy-activation' | 'missed-N-gram' | 'missed-context'>()

    // SVM cause categories (excludes well-explained)
    const svmCategories = ['noisy-activation', 'missed-N-gram', 'missed-context']

    selectedFeatureIds.forEach(featureId => {
      const source = causeSelectionSources.get(featureId)
      // Skip user-confirmed features
      if (isUserConfirmed(source)) return

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

    // Log counts per category
    const counts: Record<string, number> = { 'noisy-activation': 0, 'missed-N-gram': 0, 'missed-context': 0 }
    batchUpdates.forEach((cat) => { counts[cat] = (counts[cat] || 0) + 1 })
    logAction('stage3', 'tag_remaining_by_boundary', counts)

    // 3. Apply all updates in a single state change
    if (batchUpdates.size > 0) {
      setCauseCategoriesBatch(batchUpdates)
      setSelectedFeatureIdState(null)
      setCurrentFeatureIndex(0)
    }
  }, [causeCategoryDecisionMargins, selectedFeatureIds, causeSelectionSources, setCauseCategoriesBatch, createCommit])

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
      // Skip user-confirmed features
      if (isUserConfirmed(source)) return

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
      // Skip user-confirmed features - they won't be re-tagged
      if (isUserConfirmed(source)) return
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
      // Skip user-confirmed features - they won't be re-tagged
      if (isUserConfirmed(source)) {
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

  // Exclude well-explained features from the classification pool.
  // Like terminal tags in previous stages, well-explained doesn't belong to the 3 cause categories
  // and would get forced into a cause category by the SVM, skewing scaler stats and margins.
  const classifiableFeatureIds = useMemo(() => {
    if (!selectedFeatureIds) return new Set<number>()
    const filtered = new Set<number>()
    for (const fid of selectedFeatureIds) {
      if (causeSelectionStates.get(fid) !== 'well-explained') {
        filtered.add(fid)
      }
    }
    return filtered
  }, [selectedFeatureIds, causeSelectionStates])

  const classifiableFeatureIdsArray = useMemo(() => {
    return Array.from(classifiableFeatureIds)
  }, [classifiableFeatureIds])

  // Labeling guide popup
  const [showGuide, setShowGuide] = useState(false)

  // Get colors for each cause category
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'
  const wellExplainedColor = getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#9ca3af'
  const unsureColor = UNSURE_GRAY


  // Get display score for sortConfig (decision margin or undefined for diversity)
  const getDisplayScore = useCallback((featureId: number) => {
    // No score display for diversity mode (items are just medoids)
    if (sortMode === 'diversity') return undefined
    return causeDecisionMargins.get(featureId)
  }, [causeDecisionMargins, sortMode])

  // Render feature item for selected ScrollableItemList
  const renderBottomRowFeatureItem = useCallback((featureId: number, index: number) => {
    const causeSource = causeSelectionSources.get(featureId)

    // In diversity mode, show all features as "Unsure" (initial exploration)
    // Exception: manually tagged features should still show their tag
    let tagName: string
    let isAuto = false

    if (sortMode === 'diversity') {
      // Diversity mode: show user-confirmed tags, otherwise unsure
      if (isUserConfirmed(causeSource)) {
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

      // Stripe pattern for predicted (non-user-confirmed) features with a category
      // This applies in both Train (asc) and Apply (desc) stages in decisionMargin mode
      // Train: shows which features have predictions above threshold
      // Apply: shows which features will be auto-tagged
      isAuto = activeStage !== 'bootstrap' && sortMode === 'decisionMargin' && !isUserConfirmed(causeSource) && effectiveCategory !== 'unsure'
    }

    const disagreementInfo = activeStage === 'apply' && !isUserConfirmed(causeSelectionSources.get(featureId)) ? disagreementLookup.get(featureId) : undefined

    return (
      <>
        {disagreementInfo && (
          <DisagreementIndicator
            isDisagreement={disagreementInfo.isDisagreement}
            tooltipText={disagreementInfo.tooltipText}
          />
        )}
        <TagBadge
          featureId={featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_CAUSE}
          onClick={() => handleListItemClick(index)}
          fullWidth={true}
          isAuto={isAuto}
        />
      </>
    )
  }, [sortMode, getEffectiveCategory, causeSelectionStates, causeSelectionSources, handleListItemClick, disagreementLookup, activeStage])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`cause-view ${className} ${causeClassificationLoading ? 'cause-view--svm-loading' : ''}`}>

      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Failure Attribution</span>
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
        {/* Main column: Content */}
        <div className="cause-view__main">
          {/* Main content: Two rows (50/50 split) */}
          <div className="cause-view__content">
            {/* Batch tagging loading overlay - persists until SVM classification completes */}
            {batchLoadingOverlay && (
              <div className="cause-view__batch-flash-overlay" />
            )}
            {/* ============================================================ */}
            {/* TOP ROW: StageAccordionList (fixed) + Right Panel (flex: 1)  */}
            {/* ============================================================ */}
            <div className="cause-view__row-top">
              <StageAccordionList
                  variant="causeBrushed"
                  activeStage={activeStage}
                  onStageChange={handleStageChange}
                  bootstrapMode={bootstrapMode}
                  bootstrapDirection={selectedSortDirection}
                  onBootstrapModeChange={handleBootstrapOptionChange}
                  onBootstrapOptionChange={handleBootstrapOptionChange}
                  hasDiversityIds={diversityFeatureIds.size > 0}
                  learnDisabled={!canTrainSVM}
                  applyDisabled={!canTrainSVM}
                  learnSortable={true}
                  showLearnPopover={lastRepReviewed}
                  diversityLabel={`Most Critical ${diversityFeatureIds.size}`}
                  byScoreLabel="Feature ID"
                  hideTagged={hideTagged}
                  onHideTaggedChange={(v: boolean) => { logAction('stage3', 'hide_tagged', { enabled: v }); setHideTagged(v) }}
                  allItemsLabeled={allFeaturesLabeled}
                  showDisagreementOnly={showDisagreementOnly}
                  onShowDisagreementOnlyChange={(v: boolean) => { logAction('stage3', 'show_disagreement', { enabled: v }); setShowDisagreementOnly(v) }}
                  hasDisagreementData={causeCommitteeVotes !== null && causeCommitteeVotes.size > 0}
                  badges={[{
                    label: (activeStage === 'apply' || activeStage === 'learn')
                      ? (showDisagreementOnly
                          ? 'Thresholded Disagr. Features'
                          : hideTagged
                            ? 'Thresholded Unlabeled Features'
                            : 'Thresholded Features')
                      : showDisagreementOnly
                        ? 'Disagr. Features'
                        : sortMode === 'diversity'
                          ? 'Representative Features'
                          : hideTagged
                            ? 'Unlabeled Features'
                            : 'All Features',
                    count: sortedFilteredFeatureList.length
                  }]}
                  columnHeader={columnHeaderProps}
                  items={sortedFilteredFeatureList}
                  renderItem={renderBottomRowFeatureItem}
                  sortConfig={{ getDisplayScore }}
                  currentIndex={mainListHighlightIndex}
                  isActive
                  emptyMessage={!selectedFeatureIds || selectedFeatureIds.size === 0 ? "Select a cell with features" : undefined}
                  disableAutoScroll={true}
                  scrollTargetIndex={scrollTargetIndex}
                />

              {/* Right: Feature detail panel */}
              <div className="cause-view__top-right-panel" ref={rightPanelRef}>
                {frozenFeatureId !== null && (
                  <div className="cause-view__detail-loading-overlay" />
                )}
                {selectedFeatureData ? (
                  <>
                    {/* ---- Activation Section (top half) ---- */}
                    {/* Header row - OUTSIDE bordered container */}
                    <div className="cause-view__header-row">
                      <h4 className="subheader" data-tooltip-title="Activating Examples" data-tooltip={t('Ranked by max activation strength, then 2 examples sampled per quartile (highest → lowest). Blue-bordered tokens mark recurring patterns.', '최대 activation 강도순 정렬 후, Quartile별 2개 example 추출 (높은 순 → 낮은 순). 파란 테두리 token은 반복 pattern 표시.')}>Activating Examples <span className="instruction-subheader">of</span> <span className="panel-header__id">#{selectedFeatureData.featureId}</span></h4>
                      <div style={{ flex: 1 }} />
                      {/* Activation legend */}
                      <div className="legend-group">
                        <div className="legend-item">
                          <span className="legend-sample legend-sample--activation">token</span>:
                          <span className="legend-label">Activation Strength</span>
                        </div>
                        <div className="legend-item">
                          <span className="legend-sample legend-sample--inter">token</span>:
                          <span className="legend-label">Shared Pattern in Examples</span>
                        </div>
                      </div>
                    </div>
                    {/* Activation section - content only (HAS border) */}
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
                          <div className="cause-view__loading">Loading activating examples...</div>
                        )}
                      </div>
                    </div>

                    {/* Consensus + Parallel Coordinates row */}
                    <div className="cause-view__consensus-row-header">
                      <span className="subheader">Explainer Consensus</span>
                      <div style={{ flex: 1 }} />
                      <ConsensusLegend />
                      <div className="legend-separator" />
                      <div className="legend-group">
                        <div className="legend-item">
                          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#6b7280" strokeWidth="1.5" /></svg>
                          <span className="legend-label">Median</span>
                        </div>
                        <div className="legend-item">
                          <svg width="16" height="8"><rect x="0" y="0" width="16" height="8" fill="#6b7280" fillOpacity="0.18" /></svg>
                          <span className="legend-label">Q1-Q3</span>
                        </div>
                        <div className="legend-item">
                          <svg width="24" height="12">
                            <line x1="0" y1="6" x2="24" y2="6" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx="12" cy="6" r="3" fill="#000" stroke="white" strokeWidth="1" />
                          </svg>
                          <span className="legend-label">Current</span>
                        </div>
                        <div className="legend-item">
                          <svg width="24" height="12">
                            <line x1="0" y1="6" x2="24" y2="6" stroke="#B22222" strokeWidth="1.5" strokeDasharray="4 3" />
                          </svg>
                          <span className="legend-label">Random</span>
                        </div>
                      </div>
                    </div>
                    <div className="cause-view__consensus-with-metrics">
                      <ConsensusSection consensus={consensus} expanded hasNoActivations={!selectedFeatureData?.activation?.quantile_examples?.length} />
                    </div>

                    {/* ---- Floating control panel ---- */}
                    <div className="floating-controls">
                      {/* Previous button */}
                      <button
                        className="nav__button"
                        onClick={handleNavigatePrevious}
                        disabled={currentFeatureIndex === 0 || sortedFilteredFeatureList.length === 0}
                      >
                        ← Prev
                      </button>

                      {/* Help button */}
                      <button
                        className="floating-controls__help-btn"
                        onClick={() => setShowGuide(true)}
                        data-tooltip="Labeling guide"
                      >
                        ?
                      </button>

                      {/* Selection buttons - all features must have a tag */}
                      <TagButton
                        label="Missed Syntax"
                        variant="missed-N-gram"
                        color={missedNgramColor}
                        isSelected={currentCauseCategory === 'missed-N-gram'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'missed-N-gram'}
                        onClick={() => handleTagClick('missed-N-gram')}
                        tooltip={getTagTooltip(`${TAG_CATEGORY_CAUSE}:Missed Syntax`)}
                      />
                      <TagButton
                        label="Missed Context"
                        variant="missed-context"
                        color={missedContextColor}
                        isSelected={currentCauseCategory === 'missed-context'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'missed-context'}
                        onClick={() => handleTagClick('missed-context')}
                        tooltip={getTagTooltip(`${TAG_CATEGORY_CAUSE}:Missed Context`)}
                      />
                      <TagButton
                        label="Noisy Activation"
                        variant="noisy-activation"
                        color={noisyActivationColor}
                        isSelected={currentCauseCategory === 'noisy-activation'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'noisy-activation'}
                        onClick={() => handleTagClick('noisy-activation')}
                        tooltip={getTagTooltip(`${TAG_CATEGORY_CAUSE}:Noisy Activation`)}
                      />
                      <TagButton
                        label="Well-Explained"
                        variant="well-explained"
                        color={wellExplainedColor}
                        isSelected={currentCauseCategory === 'well-explained'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'well-explained'}
                        onClick={() => handleTagClick('well-explained')}
                        tooltip={getTagTooltip(`${TAG_CATEGORY_CAUSE}:Well-Explained`)}
                      />

                      {/* Next button */}
                      <button
                        className="nav__button"
                        onClick={() => { logAction('stage3', 'navigate_next', {}); handleNavigateNext() }}
                        disabled={currentFeatureIndex >= sortedFilteredFeatureList.length - 1 || sortedFilteredFeatureList.length === 0}
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
                          isSelected={currentCauseCategory === 'unsure'}
                          isAuto={false}
                          onClick={handleUnsureClick}
                          tooltip={getTagTooltip('Unsure')}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="cause-view__placeholder">
                    <span className="cause-view__placeholder-text">No features to display</span>
                    {(() => {
                      const hints: string[] = []
                      if (showDisagreementOnly) hints.push('uncheck "Disagreement Only"')
                      if (activeStage === 'apply' || activeStage === 'learn') hints.push('adjust the threshold range')
                      if (hideTagged) hints.push('uncheck "Hide Labeled" to review labeled features')
                      if (hints.length === 0) return null
                      const text = hints[0].charAt(0).toUpperCase() + hints[0].slice(1)
                        + (hints.length > 1 ? ', or ' + hints.slice(1).join(', or ') : '')
                      return <span className="empty-state-subtext">{text}</span>
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* BOTTOM ROW: ThresholdTaggingPanel with cause mode */}
            {/* ============================================================ */}
            {/* Cause mode uses causeProps for batch operations (BatchTaggingPanel).
                These handlers are required by interface but intentionally unused. */}
            <ThresholdTaggingPanel
                mode="cause"
                tagCategoryId={TAG_CATEGORY_CAUSE}
                leftListLabel=""
                rightListLabel=""
                histogramProps={{}}
                onApplyTags={() => {}}
                onTagAll={() => {}}
                activeStage={activeStage}
                causeProps={{
                  featureIds: classifiableFeatureIds,
                  causeDecisionMargins,
                  causeSelectionStates: causeSelectionStates as Map<number, CauseCategory>,
                  causeSelectionSources: causeSelectionSources as Map<number, 'click' | 'threshold' | 'predicted'>,
                  threshold: causeMarginThreshold,
                  onThresholdChange: setCauseMarginThreshold,
                  sortMode,
                  sortDirection: selectedSortDirection,
                  canTrainSVM,
                  manualTagCountsByCategory,
                  flipTracking: causeFlipTracking,
                  selectedFeatureId: displayedFeatureId,
                  stableFeatureIds: classifiableFeatureIdsArray,
                  hideTagged,
                  categories: [
                    {
                      id: 'missed-N-gram',
                      label: 'Missed Syntax',
                      color: missedNgramColor,
                      count: filteredBatchComposition.patternMiss,
                      inputCount: remainingComposition.patternMiss,
                      outputCount: filteredBatchComposition.patternMiss + boundaryTagCounts['missed-N-gram']
                    },
                    {
                      id: 'missed-context',
                      label: 'Missed Context',
                      color: missedContextColor,
                      count: filteredBatchComposition.contextMiss,
                      inputCount: remainingComposition.contextMiss,
                      outputCount: filteredBatchComposition.contextMiss + boundaryTagCounts['missed-context']
                    },
                    {
                      id: 'noisy-activation',
                      label: 'Noisy Activation',
                      color: noisyActivationColor,
                      count: filteredBatchComposition.noisyActivation,
                      inputCount: remainingComposition.noisyActivation,
                      outputCount: filteredBatchComposition.noisyActivation + boundaryTagCounts['noisy-activation']
                    }
                  ],
                  unsureCount: remainingComposition.unsure,
                  onConfirmAll: handleTagAllConfident,
                  onTagAllUnsure: handleTagRemainingByBoundary,
                }}
                showStabilityPopover={activeStage === 'learn' && (
                  (isFlipRateStable && !flipRatePopoverDismissed) ||
                  (causeSelectionStates.size > 50 && !labelCountPopoverShown.current)
                )}
                onDismissStabilityPopover={() => {
                  setFlipRatePopoverDismissed(true)
                  if (causeSelectionStates.size > 50) labelCountPopoverShown.current = true
                }}
            />
          </div>
        </div>

        {/* Right column: Download Results */}
        <div className="next-stage-column">
          <button
            className="action-button action-button--next"
            onClick={async () => {
              logAction('stage3', 'download_results', {})
              await activateStage4(PANEL_LEFT)
              const name = handleDownload()
              setExportFileName(name)
              setShowExportPopup(true)
            }}
            disabled={!allTagged}
            title={allTagged ? 'Export tagging results as JSON' : `Label all features first (${causeSelectionStates.size}/${selectedFeatureIds?.size || 0})`}
          >
            Download Results
          </button>
        </div>
      </div>

      {showExportPopup && (
        <ExportResultsPopup
          onClose={() => setShowExportPopup(false)}
          fileName={exportFileName}
        />
      )}

      {/* Labeling guide popup */}
      {showGuide && <LabelingGuidePopup stage={3} onClose={() => setShowGuide(false)} />}
    </div>
  )
}

export default React.memo(CauseView)
