import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, ConsensusResponse, FlipTrackingInfo } from '../types'
import * as api from '../api'
import { getFeatureConsensus } from '../api'
import { useSortableList, type ActiveStage, type BootstrapMode, type SortMode } from '../lib/tagging-hooks/useSortableList'
import StageAccordionList from './StageAccordionList'
import { TagBadge, TagButton, DisagreementIndicator } from './Indicators'
import ActivationExample from './ActivationExamplePanel'
import ConsensusSection, { ConsensusLegend } from './ConsensusSection'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE, UNSURE_GRAY, PANEL_LEFT } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import { useCommitHistory, createCauseCommitHistoryOptions, type DisplayCommit, isUserConfirmed, useMainListScroll } from '../lib/tagging-hooks'
import { CauseMetricParallelCoords } from './ParallelCoordinates'
import {
  calculateCauseMetricScores,
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'
import { computeCategoryBands } from '../lib/parallel-coords-utils'
import { getCauseCategoryLegend } from '../lib/cause-visualization-utils'
import { useResizeObserver } from '../lib/utils'
import { logAction, createDebouncedLogger } from '../lib/action-logger'
import ExportResultsPopup from './ExportResultsPopup'
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
  const causeMetricScores = useVisualizationStore(state => state.causeMetricScores)

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
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const causeFlipTracking = useVisualizationStore(state => state.causeFlipTracking)
  const causeCommitteeVotes = useVisualizationStore(state => state.causeCommitteeVotes)

  // Stage navigation - activateStage4 splits Sankey into cause terminal nodes
  const activateStage4 = useVisualizationStore(state => state.activateStage4)

  // Export state
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

  // Deferred navigation state: hold current selection during SVM retraining
  const pendingNavRef = useRef<'tag' | 'unsure' | null>(null)
  const wasClassifyingRef = useRef(false)
  const [deferringNav, setDeferringNav] = useState(false)

  // Consensus data for selected feature
  const [consensus, setConsensus] = useState<ConsensusResponse | null>(null)
  const consensusCacheRef = useRef<Map<number, ConsensusResponse>>(new Map())

  // Active list source is always 'all' (boundary lists removed)
  const activeListSource = 'all' as const

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
          20  // Get 20 diverse features via Kennard-Stone
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
    columnHeaderProps
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

  // Independent stage state (decoupled from sort mode) - restore from store when revisiting
  const [activeStage, setActiveStage] = useState<ActiveStage>(stage3FinalCommit?.workflowActiveStage ?? 'bootstrap')

  // Derive bootstrapMode from sortMode (for StageAccordionList display)
  const bootstrapMode: BootstrapMode = sortMode === 'diversity' ? 'diversity' : 'byScore'

  // Sync active stage to store + auto-enable filters when entering Apply phase
  const setWorkflowActiveStage = useVisualizationStore(state => state.setWorkflowActiveStage)
  useEffect(() => {
    setWorkflowActiveStage(activeStage)
    if (activeStage === 'apply') {
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
      setSelectedSortDirection('desc')
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
  }, [setSortMode, setSelectedSortDirection])

  // Determine if we're in "Top" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && selectedSortDirection === 'desc'

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
        const categoryScores = causeCategoryDecisionMargins?.get(featureId)
        if (!categoryScores) return true
        const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
        return margin >= causeMarginThreshold
      }

      // 5. Non-Apply modes: user-confirmed bypass category filter but respect threshold
      if (!hideTagged && userConfirmed) {
        const categoryScores = causeCategoryDecisionMargins?.get(featureId)
        if (!categoryScores) return true  // No scores yet (Bootstrap) = show it
        const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
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
      causeCategoryDecisionMargins, causeMarginThreshold])

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

  // Stability popover dismissal state — reset when condition goes away
  const [stabilityPopoverDismissed, setStabilityPopoverDismissed] = useState(false)
  useEffect(() => {
    if (!isFlipRateStable) setStabilityPopoverDismissed(false)
  }, [isFlipRateStable])

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

  // Download results as JSON (replaces Stage 4 RegenerationView)
  const handleDownload = useCallback(() => {
    // Stage 1: Feature Splitting (pairs)
    const stage1 = {
      fragmented: { manual: [] as string[], auto: [] as string[] },
      monosemantic: { manual: [] as string[], auto: [] as string[] }
    }
    pairSelectionStates.forEach((state, key) => {
      const tag = state === 'selected' ? 'fragmented' : 'monosemantic'
      const source = pairSelectionSources.get(key) === 'click' ? 'manual' : 'auto'
      stage1[tag][source].push(key)
    })

    // Stage 2: Quality (features) + Stage 3 well-explained merged
    const stage2 = {
      wellExplained: { manual: [] as number[], auto: [] as number[] },
      needRevision: { manual: [] as number[], auto: [] as number[] }
    }
    featureSelectionStates.forEach((state, id) => {
      const tag = state === 'selected' ? 'wellExplained' : 'needRevision'
      const source = featureSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
      stage2[tag][source].push(id)
    })
    // Merge Stage 3 well-explained into Stage 2
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'well-explained') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage2.wellExplained[source].push(id)
      }
    })

    // Stage 3: Cause categories (excluding well-explained, merged above)
    const stage3 = {
      patternMiss: { manual: [] as number[], auto: [] as number[] },
      contextMiss: { manual: [] as number[], auto: [] as number[] },
      noisyActivation: { manual: [] as number[], auto: [] as number[] }
    }
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'missed-N-gram') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.patternMiss[source].push(id)
      } else if (tag === 'missed-context') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.contextMiss[source].push(id)
      } else if (tag === 'noisy-activation') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.noisyActivation[source].push(id)
      }
    })

    const exportData = {
      exportedAt: new Date().toISOString(),
      stage1_featureSplitting: stage1,
      stage2_quality: stage2,
      stage3_cause: stage3,
      summary: {
        totalPairsTagged: pairSelectionStates.size,
        totalFeaturesTagged: featureSelectionStates.size,
        totalCausesTagged: causeSelectionStates.size
      }
    }

    const fileName = `tagging-results-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return fileName
  }, [
    pairSelectionStates, pairSelectionSources,
    featureSelectionStates, featureSelectionSources,
    causeSelectionStates, causeSelectionSources
  ])

  // Compute category bands for parallel coordinates (median + IQR per category)
  const categoryBands = useMemo(() => {
    if (!tableData?.features) return []

    // Build feature lookup for score calculation
    const featureMap = new Map<number, FeatureTableRow>(
      tableData.features.map((f: FeatureTableRow) => [f.feature_id, f])
    )

    // Helper: compute CauseMetricScores for a set of feature IDs
    const buildScoresMap = (featureIds: Iterable<number>) => {
      const scores = new Map<number, ReturnType<typeof calculateCauseMetricScores>>()
      for (const fid of featureIds) {
        const row = featureMap.get(fid)
        if (row) scores.set(fid, calculateCauseMetricScores(row))
      }
      return scores
    }

    // 1. Well-Explained: from Stage 2 selected features
    const wellExplainedIds: number[] = []
    featureSelectionStates.forEach((state, fid) => {
      if (state === 'selected') wellExplainedIds.push(fid)
    })

    // 2. Cause categories: from Stage 3 tags
    const causeGroups = new Map<string, number[]>()
    causeSelectionStates.forEach((cat, fid) => {
      if (cat === 'well-explained') return // already counted above
      if (!causeGroups.has(cat)) causeGroups.set(cat, [])
      causeGroups.get(cat)!.push(fid)
    })

    // Build the categoryScoresMap
    const categoryScoresMap = new Map<string, Map<number, ReturnType<typeof calculateCauseMetricScores>>>()
    categoryScoresMap.set('well-explained', buildScoresMap(wellExplainedIds))
    for (const [cat, ids] of causeGroups) {
      categoryScoresMap.set(cat, buildScoresMap(ids))
    }

    // Build color/label maps from legend
    const legend = getCauseCategoryLegend()
    const colorMap = new Map<string, string>()
    const labelMap = new Map<string, string>()
    for (const item of legend) {
      if (item.category === 'unsure') continue
      colorMap.set(item.category, item.color)
      labelMap.set(item.category, item.label)
    }

    return computeCategoryBands(categoryScoresMap, colorMap, labelMap)
  }, [featureSelectionStates, causeSelectionStates, tableData])

  // Reset feature index when visible categories change (auto-select first feature)
  useEffect(() => {
    setCurrentFeatureIndex(0)
  }, [visibleCategories])

  // Execute deferred navigation after SVM classification completes
  useEffect(() => {
    if (!deferringNav) return

    // Shared navigation logic — decides advance-next vs reset-to-first
    const navigateAfterTag = () => {
      const navType = pendingNavRef.current
      pendingNavRef.current = null
      setDeferringNav(false)

      if (navType === 'tag') {
        if (hideTagged) {
          // Tagged item will disappear — clear stored ID so index-based fallback takes over
          setSelectedFeatureIdState(null)
        } else if (sortMode === 'decisionMargin' && causeCategoryDecisionMargins.size > 0) {
          // Decision margin mode with histogram: reset to first (list re-sorts)
          setSelectedFeatureIdState(null)
          setCurrentFeatureIndex(0)
        } else {
          // Default/diversity mode: advance to next item
          setSelectedFeatureIdState(null)
          setCurrentFeatureIndex(i => Math.min(sortedFilteredFeatureList.length - 1, i + 1))
        }
      } else {
        // Unsure: advance to next
        setSelectedFeatureIdState(null)
        setCurrentFeatureIndex(i => Math.min(sortedFilteredFeatureList.length - 1, i + 1))
      }
    }

    if (causeClassificationLoading) {
      wasClassifyingRef.current = true
    } else if (wasClassifyingRef.current) {
      // SVM just finished → navigate using shared logic
      wasClassifyingRef.current = false
      navigateAfterTag()
    }

    // Fallback: if SVM never starts loading, navigate directly
    const timer = setTimeout(() => {
      if (!wasClassifyingRef.current) {
        navigateAfterTag()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [deferringNav, causeClassificationLoading, sortedFilteredFeatureList, hideTagged, sortMode, causeCategoryDecisionMargins])

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
    if (selectedFeatureId === null) return null
    const feature = featureListWithMetadata.find(f => f.featureId === selectedFeatureId)
    if (!feature) return null
    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [selectedFeatureId, featureListWithMetadata, activationExamples])

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

  // NOTE: useTaggingNavigation removed — deferred nav effect handles all post-tag
  // navigation directly to avoid double renders from the hook's internal setTimeout

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

  // Handle tag button click - toggle category on/off
  // Clicking same category: if user-confirmed, clear to unsure; if predicted, confirm
  // Clicking different category: set new category as click source
  const handleTagClick = useCallback((category: CauseCategory) => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)

    logAction('stage3', 'manual_tag', { tag: causeTagLabel(category), previousTag: causeTagLabel(currentCauseCategory), featureId })

    const isSameCategory = currentCauseCategory === category
    const isAutoTagged = currentCauseSource === 'predicted'

    // Pin the tagged feature so detail panel stays stable during deferral
    setSelectedFeatureIdState(featureId)

    if (isSameCategory && !isAutoTagged) {
      // Already manually selected same category - toggle off to unsure
      setCauseCategory(featureId, null)
      pendingNavRef.current = 'unsure'
      setDeferringNav(true)
      return
    }

    // Either confirming auto tag or changing category - update with manual source
    setCauseCategory(featureId, category)
    setLastClickTagAction({ stage: 'cause', featureId })
    pendingNavRef.current = 'tag'
    setDeferringNav(true)
  }, [selectedFeatureData, currentCauseCategory, currentCauseSource, setCauseCategory, setLastClickTagAction, markReviewed])

  // Handle Unsure click - clear cause category
  const handleUnsureClick = useCallback(() => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId
    markReviewed(featureId)

    logAction('stage3', 'manual_tag', { tag: 'Unsure', previousTag: causeTagLabel(currentCauseCategory), featureId })

    // Pin the tagged feature so detail panel stays stable during deferral
    setSelectedFeatureIdState(featureId)
    // Clear the cause category to null (unsure)
    setCauseCategory(featureId, null)
    pendingNavRef.current = 'unsure'
    setDeferringNav(true)
  }, [selectedFeatureData, currentCauseCategory, setCauseCategory, markReviewed])

  // ============================================================================
  // SELECTED TAGGING HANDLERS
  // ============================================================================

  // Tag ALL confident features (all three categories at once)
  const handleTagAllConfident = useCallback(() => {
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
      pendingNavRef.current = 'tag'
      setDeferringNav(true)
    }
  }, [filteredFeatureIds, causeSelectionSources, causeSelectionStates, setCauseCategoriesBatch, createCommit, selectedFeatureIds?.size])

  // Tag remaining untagged features by decision boundary (highest margin category)
  // Note: SVM only predicts cause categories (pattern miss, context miss, noisy activation)
  // Well-Explained is tagged individually, not by SVM batch tagging
  const handleTagRemainingByBoundary = useCallback(() => {
    if (!causeCategoryDecisionMargins || causeCategoryDecisionMargins.size === 0) return
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
      pendingNavRef.current = 'tag'
      setDeferringNav(true)
    }
    // Effect will sync changes to current commit
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

  // Memoize featureIds array to prevent unnecessary re-renders
  // Array.from creates a new array reference on every call, so we memoize it
  const stableFeatureIds = useMemo(() => {
    return selectedFeatureIds ? Array.from(selectedFeatureIds) : []
  }, [selectedFeatureIds])

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
                  showLearnPopover={lastRepReviewed}
                  diversityLabel={`Representative ${diversityFeatureIds.size}`}
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
                          ? 'Thresholded Disagreement Features'
                          : hideTagged
                            ? 'Thresholded Unlabeled Features'
                            : 'Thresholded Features')
                      : showDisagreementOnly
                        ? 'Disagreement Features'
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
                  isActive={activeListSource === 'all'}
                  emptyMessage={!selectedFeatureIds || selectedFeatureIds.size === 0 ? "Select a cell with features" : undefined}
                  disableAutoScroll={true}
                  scrollTargetIndex={scrollTargetIndex}
                />

              {/* Right: Feature detail panel */}
              <div className="cause-view__top-right-panel" ref={rightPanelRef}>
                {deferringNav && (
                  <div className="cause-view__detail-loading-overlay" />
                )}
                {selectedFeatureData ? (
                  <>
                    {/* ---- Activation Section (top half) ---- */}
                    {/* Header row - OUTSIDE bordered container */}
                    <div className="cause-view__header-row">
                      <h4 className="subheader">Activating Examples <span className="instruction-subheader">of</span> <span className="panel-header__id">#{selectedFeatureData.featureId}</span></h4>
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
                      <div className="legend-separator" />
                      <ConsensusLegend />
                    </div>
                    <div className="cause-view__consensus-with-metrics">
                      <ConsensusSection consensus={consensus} />
                      <div className="cause-view__metrics-container">
                        <CauseMetricParallelCoords
                          categoryBands={categoryBands}
                          currentScores={causeMetricScores.get(selectedFeatureData.featureId) ?? null}
                        />
                      </div>
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

                      {/* Selection buttons - all features must have a tag */}
                      <TagButton
                        label="Missed Syntax"
                        variant="missed-N-gram"
                        color={missedNgramColor}
                        isSelected={currentCauseCategory === 'missed-N-gram'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'missed-N-gram'}
                        onClick={() => handleTagClick('missed-N-gram')}
                      />
                      <TagButton
                        label="Missed Context"
                        variant="missed-context"
                        color={missedContextColor}
                        isSelected={currentCauseCategory === 'missed-context'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'missed-context'}
                        onClick={() => handleTagClick('missed-context')}
                      />
                      <TagButton
                        label="Noisy Activation"
                        variant="noisy-activation"
                        color={noisyActivationColor}
                        isSelected={currentCauseCategory === 'noisy-activation'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'noisy-activation'}
                        onClick={() => handleTagClick('noisy-activation')}
                      />
                      <TagButton
                        label="Well-Explained"
                        variant="well-explained"
                        color={wellExplainedColor}
                        isSelected={currentCauseCategory === 'well-explained'}
                        isAuto={activeStage === 'apply' && currentCauseSource === 'predicted' && currentCauseCategory === 'well-explained'}
                        onClick={() => handleTagClick('well-explained')}
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
                  featureIds: selectedFeatureIds || new Set(),
                  causeCategoryDecisionMargins,
                  causeSelectionStates: causeSelectionStates as Map<number, CauseCategory>,
                  causeSelectionSources: causeSelectionSources as Map<number, 'click' | 'threshold' | 'predicted'>,
                  threshold: causeMarginThreshold,
                  onThresholdChange: setCauseMarginThreshold,
                  sortMode,
                  sortDirection: selectedSortDirection,
                  canTrainSVM,
                  manualTagCountsByCategory,
                  flipTracking: causeFlipTracking,
                  selectedFeatureId: selectedFeatureId,
                  stableFeatureIds,
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
                showStabilityPopover={isFlipRateStable && !stabilityPopoverDismissed}
                onDismissStabilityPopover={() => setStabilityPopoverDismissed(true)}
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
    </div>
  )
}

export default React.memo(CauseView)
