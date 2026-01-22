import React, { useMemo, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, FlipTrackingInfo } from '../types'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import CauseMarginHistogram from './CauseMarginHistogram'
import CauseRadViz from './CauseRadViz'
import ScrollableItemList from './ScrollableItemList'
import ConvergenceIndicator from './ConvergenceIndicator'
import BatchTaggingPanel from './BatchTaggingPanel'
import { TagBadge, DisagreementIndicator } from './Indicators'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE } from '../lib/constants'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import type { SortMode, ActiveStage } from '../lib/tagging-hooks/useSortableList'
import type { ListSource } from '../lib/tagging-hooks/useListNavigation'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// THRESHOLD TAGGING PANEL - Reusable bottom row for tagging workflows
// ============================================================================
// Layout: [Histogram] | [Flip Rate (top) + Boundary Lists (bottom)] | [Buttons]
// Used by: FeatureSplitView and QualityView

// Shared type for pair items with metadata
export type PairItemWithMetadata = {
  pairKey: string
  mainFeatureId: number
  similarFeatureId: number
  clusterId: number
  row: FeatureTableRow | null
  similarRow: FeatureTableRow | null
  decoderSimilarity: number | null
}

// Feature item type for feature mode
export type FeatureItemWithMetadata = {
  featureId: number
  qualityScore: number
  row: FeatureTableRow | null
}

// Cause feature item type for cause mode (Stage 3)
export type CauseFeatureItem = {
  featureId: number
  margin: number
  predictedCategory: CauseCategory
  row: FeatureTableRow | null
}

// Filter category type (CauseCategory + 'unsure')
type FilterCategory = CauseCategory | 'unsure'

// Cause mode specific props
export interface CauseModeProps {
  featureIds: Set<number>
  causeCategoryDecisionMargins: Map<number, Record<string, number>>
  causeSelectionStates: Map<number, CauseCategory>
  causeSelectionSources: Map<number, 'click' | 'threshold' | 'predicted'>
  threshold: number
  onThresholdChange: (value: number) => void
  sortMode: SortMode
  sortDirection: 'asc' | 'desc'
  activeStage: ActiveStage  // 'bootstrap' | 'train' | 'apply'
  onPercentageChange: (pct: number) => void
  canTrainSVM: boolean
  manualTagCountsByCategory: Record<string, number>
  // Flip tracking for ConvergenceIndicator (optional - null until implemented)
  flipTracking?: FlipTrackingInfo | null
  // RadViz props
  selectedFeatureId: number | null
  visibleCategories: Set<FilterCategory>
  onVisibleCategoriesChange: (cats: Set<FilterCategory>) => void
  onFeatureSelect: (featureId: number) => void
  stableFeatureIds: number[]  // For RadViz
  // Batch tagging category counts and colors
  categories: Array<{
    id: string
    label: string
    color: string
    count: number
    inputCount: number
    outputCount: number
  }>
  unsureCount: number
  // Batch tagging handlers
  onConfirmCategory: (categoryId: string) => void
  onConfirmAll: () => void
  onTagAllUnsure: () => void
  // Committee votes for disagreement highlighting (optional)
  causeCommitteeVotes?: Map<number, {
    svm_category: string
    rf_category: string
    mlp_category: string
  }>
  // Boundary list navigation state
  boundaryListActiveIndex?: number
  isBoundaryListActive?: boolean
}

export interface ThresholdTaggingPanelProps {
  // Mode for DecisionMarginHistogram
  mode: 'feature' | 'pair' | 'cause'
  tagCategoryId: string

  // Pre-computed boundary items from parent (pair mode)
  leftItems?: PairItemWithMetadata[]   // e.g., Monosemantic pairs (below reject threshold)
  rightItems?: PairItemWithMetadata[]  // e.g., Fragmented pairs (above select threshold)

  // Pre-computed boundary items from parent (feature mode)
  leftFeatures?: FeatureItemWithMetadata[]   // e.g., Need Revision features
  rightFeatures?: FeatureItemWithMetadata[]  // e.g., Well-Explained features

  // List configuration (labels differ per stage)
  leftListLabel: string    // e.g., "Monosemantic" or "Need Revision"
  rightListLabel: string   // e.g., "Fragmented" or "Well-Explained"

  // Histogram passthrough
  histogramProps: {
    availablePairs?: Array<{pairKey: string; mainFeatureId: number; similarFeatureId: number}>
    filteredFeatureIds?: Set<number>
    threshold?: number
  }

  // Callbacks
  onApplyTags: () => void
  onTagAll: (method: 'left' | 'byBoundary') => void
  onListItemClick: (listType: 'left' | 'right', index: number) => void

  // State from parent
  activeListSource: ListSource
  currentIndex: number
  isBimodal: boolean

  // Separate highlight indices for boundary lists (show selection in all lists)
  // If provided, these override the conditional logic based on activeListSource
  leftHighlightIndex?: number
  rightHighlightIndex?: number

  // Whether current sort matches template (default) sort
  // When false, selection highlight is disabled in boundary lists
  isTemplateSort?: boolean

  // Sort direction from parent (synced with StageAccordionList)
  sortDirection?: 'asc' | 'desc'

  // Cause mode specific props (only when mode='cause')
  causeProps?: CauseModeProps

  // Pre-computed boundary items for cause mode (single list with all categories)
  causeBoundaryItems?: CauseFeatureItem[]

  // Cause mode list item click handler
  onCauseListItemClick?: (featureId: number) => void
}

const ThresholdTaggingPanel: React.FC<ThresholdTaggingPanelProps> = ({
  mode,
  tagCategoryId,
  leftItems = [],
  rightItems = [],
  leftFeatures = [],
  rightFeatures = [],
  leftListLabel,
  rightListLabel,
  histogramProps,
  onApplyTags,
  onTagAll,
  onListItemClick,
  activeListSource,
  currentIndex,
  leftHighlightIndex,
  rightHighlightIndex,
  isTemplateSort = true,
  sortDirection = 'asc',
  // Cause mode props
  causeProps,
  causeBoundaryItems = [],
  onCauseListItemClick,
}) => {
  // Store state for scores and selections
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)

  // Sort boundary items based on direction from parent (by |decision margin|)
  const sortedLeftItems = useMemo(() => {
    if (mode === 'pair') {
      return [...leftItems].sort((a, b) => {
        const scoreA = pairSimilarityScores.get(a.pairKey) ?? 0
        const scoreB = pairSimilarityScores.get(b.pairKey) ?? 0
        const absA = Math.abs(scoreA)
        const absB = Math.abs(scoreB)
        return sortDirection === 'asc' ? absA - absB : absB - absA
      })
    } else {
      return [...leftFeatures].sort((a, b) => {
        const scoreA = similarityScores.get(a.featureId) ?? 0
        const scoreB = similarityScores.get(b.featureId) ?? 0
        const absA = Math.abs(scoreA)
        const absB = Math.abs(scoreB)
        return sortDirection === 'asc' ? absA - absB : absB - absA
      })
    }
  }, [mode, leftItems, leftFeatures, pairSimilarityScores, similarityScores, sortDirection])

  const sortedRightItems = useMemo(() => {
    if (mode === 'pair') {
      return [...rightItems].sort((a, b) => {
        const scoreA = pairSimilarityScores.get(a.pairKey) ?? 0
        const scoreB = pairSimilarityScores.get(b.pairKey) ?? 0
        const absA = Math.abs(scoreA)
        const absB = Math.abs(scoreB)
        return sortDirection === 'asc' ? absA - absB : absB - absA
      })
    } else {
      return [...rightFeatures].sort((a, b) => {
        const scoreA = similarityScores.get(a.featureId) ?? 0
        const scoreB = similarityScores.get(b.featureId) ?? 0
        const absA = Math.abs(scoreA)
        const absB = Math.abs(scoreB)
        return sortDirection === 'asc' ? absA - absB : absB - absA
      })
    }
  }, [mode, rightItems, rightFeatures, pairSimilarityScores, similarityScores, sortDirection])

  // Get tag colors
  const leftTagColor = getTagColor(tagCategoryId, leftListLabel) || '#9ca3af'
  const rightTagColor = getTagColor(tagCategoryId, rightListLabel) || '#9ca3af'

  // Compute counts for instructions
  const leftCount = mode === 'pair' ? leftItems.length : leftFeatures.length
  const rightCount = mode === 'pair' ? rightItems.length : rightFeatures.length
  const totalItems = mode === 'pair'
    ? (histogramProps.availablePairs?.length || 0)
    : (histogramProps.filteredFeatureIds?.size || 0)

  // Count already tagged items for remaining count calculation
  const taggedCount = mode === 'pair'
    ? pairSelectionStates.size
    : featureSelectionStates.size
  const remainingCount = Math.max(0, totalItems - taggedCount)

  // Count how many remaining items will be tagged left vs right by 0.0 decision boundary
  const boundaryTagCounts = React.useMemo(() => {
    let leftByBoundary = 0
    let rightByBoundary = 0

    if (mode === 'pair') {
      // For pair mode, iterate through available pairs
      histogramProps.availablePairs?.forEach(pair => {
        if (!pairSelectionStates.has(pair.pairKey)) {
          const score = pairSimilarityScores.get(pair.pairKey)
          if (score !== undefined) {
            if (score < 0) {
              leftByBoundary++
            } else {
              rightByBoundary++
            }
          }
        }
      })
    } else {
      // For feature mode, iterate through filtered feature IDs
      histogramProps.filteredFeatureIds?.forEach(featureId => {
        if (!featureSelectionStates.has(featureId)) {
          const score = similarityScores.get(featureId)
          if (score !== undefined) {
            if (score < 0) {
              leftByBoundary++
            } else {
              rightByBoundary++
            }
          }
        }
      })
    }

    return { left: leftByBoundary, right: rightByBoundary }
  }, [mode, histogramProps.availablePairs, histogramProps.filteredFeatureIds, pairSelectionStates, featureSelectionStates, pairSimilarityScores, similarityScores])

  // Get committee data for disagreement highlighting
  const committeeVotes = tagAutomaticState?.committeeVotes ?? null

  // State for filtering to show only items needing review (with disagreement)
  const [showOnlyNeedReview, setShowOnlyNeedReview] = useState(false)
  const [showOnlyCauseNeedReview, setShowOnlyCauseNeedReview] = useState(false)

  // Helper to check if an item has disagreement based on list type
  const hasDisagreement = useCallback((itemKey: string, listType: 'left' | 'right'): boolean => {
    const voteInfo = committeeVotes?.get(itemKey)
    if (!voteInfo) return false
    return listType === 'right'
      ? (voteInfo.rf_prediction === 0 || voteInfo.mlp_prediction === 0)
      : (voteInfo.rf_prediction === 1 || voteInfo.mlp_prediction === 1)
  }, [committeeVotes])

  // Filter sorted items based on showOnlyNeedReview
  const filteredLeftItems = useMemo(() => {
    if (!showOnlyNeedReview || !committeeVotes) return sortedLeftItems
    if (mode === 'pair') {
      return (sortedLeftItems as PairItemWithMetadata[]).filter(item => hasDisagreement(item.pairKey, 'left'))
    } else {
      return (sortedLeftItems as unknown as FeatureItemWithMetadata[]).filter(item => hasDisagreement(String(item.featureId), 'left'))
    }
  }, [sortedLeftItems, showOnlyNeedReview, committeeVotes, mode, hasDisagreement])

  const filteredRightItems = useMemo(() => {
    if (!showOnlyNeedReview || !committeeVotes) return sortedRightItems
    if (mode === 'pair') {
      return (sortedRightItems as PairItemWithMetadata[]).filter(item => hasDisagreement(item.pairKey, 'right'))
    } else {
      return (sortedRightItems as unknown as FeatureItemWithMetadata[]).filter(item => hasDisagreement(String(item.featureId), 'right'))
    }
  }, [sortedRightItems, showOnlyNeedReview, committeeVotes, mode, hasDisagreement])

  // Count items needing review in each list
  const needReviewCounts = useMemo(() => {
    if (!committeeVotes) return { left: 0, right: 0 }

    let leftCount = 0
    let rightCount = 0

    if (mode === 'pair') {
      (sortedLeftItems as PairItemWithMetadata[]).forEach(item => {
        if (hasDisagreement(item.pairKey, 'left')) leftCount++
      });
      (sortedRightItems as PairItemWithMetadata[]).forEach(item => {
        if (hasDisagreement(item.pairKey, 'right')) rightCount++
      })
    } else {
      (sortedLeftItems as unknown as FeatureItemWithMetadata[]).forEach(item => {
        if (hasDisagreement(String(item.featureId), 'left')) leftCount++
      });
      (sortedRightItems as unknown as FeatureItemWithMetadata[]).forEach(item => {
        if (hasDisagreement(String(item.featureId), 'right')) rightCount++
      })
    }

    return { left: leftCount, right: rightCount }
  }, [sortedLeftItems, sortedRightItems, committeeVotes, mode, hasDisagreement])

  // Helper to check if a cause item has disagreement (RF or MLP predicts different category than SVM)
  const hasCauseDisagreement = useCallback((featureId: number, svmCategory: string): boolean => {
    const voteInfo = causeProps?.causeCommitteeVotes?.get(featureId)
    if (!voteInfo) return false
    return voteInfo.rf_category !== svmCategory || voteInfo.mlp_category !== svmCategory
  }, [causeProps?.causeCommitteeVotes])

  // Filter cause boundary items based on showOnlyCauseNeedReview
  const filteredCauseBoundaryItems = useMemo(() => {
    if (!showOnlyCauseNeedReview || !causeProps?.causeCommitteeVotes) return causeBoundaryItems
    return causeBoundaryItems.filter(item =>
      hasCauseDisagreement(item.featureId, item.predictedCategory)
    )
  }, [causeBoundaryItems, showOnlyCauseNeedReview, causeProps?.causeCommitteeVotes, hasCauseDisagreement])

  // Count cause items needing review
  const causeNeedReviewCount = useMemo(() => {
    if (!causeProps?.causeCommitteeVotes) return 0
    return causeBoundaryItems.filter(item =>
      hasCauseDisagreement(item.featureId, item.predictedCategory)
    ).length
  }, [causeBoundaryItems, causeProps?.causeCommitteeVotes, hasCauseDisagreement])

  // Render item for pair boundary lists
  // Shows PREVIEW tag (what it will be after apply) with stripe pattern
  const renderBoundaryItem = (item: PairItemWithMetadata, index: number, listType: 'left' | 'right') => {
    const selectionState = pairSelectionStates.get(item.pairKey)
    const score = pairSimilarityScores.get(item.pairKey)

    // For untagged items, show preview tag based on which list they're in
    // Left list = will be rejected, Right list = will be selected
    let tagName: string
    if (selectionState === 'selected') {
      tagName = rightListLabel  // Already Fragmented
    } else if (selectionState === 'rejected') {
      tagName = leftListLabel   // Already Monosemantic
    } else {
      // Preview: show what it WILL be tagged as
      tagName = listType === 'left' ? leftListLabel : rightListLabel
    }

    const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

    // Check for disagreement: item is in boundary list AND RF/MLP predicts opposite class
    const voteInfo = committeeVotes?.get(item.pairKey) ?? null
    const isDisagreement = voteInfo
      ? (listType === 'right'
          ? (voteInfo.rf_prediction === 0 || voteInfo.mlp_prediction === 0)  // SVM says selected, RF/MLP says rejected
          : (voteInfo.rf_prediction === 1 || voteInfo.mlp_prediction === 1)) // SVM says rejected, RF/MLP says selected
      : false

    return (
      <div className="pair-item-with-score" style={{ position: 'relative' }}>
        <DisagreementIndicator voteInfo={voteInfo} isDisagreement={isDisagreement} />
        <TagBadge
          featureId={pairIdString}
          tagName={tagName}
          tagCategoryId={tagCategoryId}
          onClick={() => onListItemClick(listType, index)}
          fullWidth={true}
          isPair={true}
          isAuto={true}
        />
        {score !== undefined && (
          <span className="pair-similarity-score">{score.toFixed(2)}</span>
        )}
      </div>
    )
  }

  // Render item for feature boundary lists
  // Shows PREVIEW tag (what it will be after apply) with stripe pattern
  const renderFeatureItem = (item: FeatureItemWithMetadata, index: number, listType: 'left' | 'right') => {
    const selectionState = featureSelectionStates.get(item.featureId)
    const score = similarityScores.get(item.featureId)

    // For untagged items, show preview tag based on which list they're in
    // Left list = will be rejected, Right list = will be selected
    let tagName: string
    if (selectionState === 'selected') {
      tagName = rightListLabel  // Already Well-Explained
    } else if (selectionState === 'rejected') {
      tagName = leftListLabel   // Already Need Revision
    } else {
      // Preview: show what it WILL be tagged as
      tagName = listType === 'left' ? leftListLabel : rightListLabel
    }

    // Check for disagreement: item is in boundary list AND RF/MLP predicts opposite class
    const featureIdStr = String(item.featureId)
    const voteInfo = committeeVotes?.get(featureIdStr) ?? null
    const isDisagreement = voteInfo
      ? (listType === 'right'
          ? (voteInfo.rf_prediction === 0 || voteInfo.mlp_prediction === 0)  // SVM says selected, RF/MLP says rejected
          : (voteInfo.rf_prediction === 1 || voteInfo.mlp_prediction === 1)) // SVM says rejected, RF/MLP says selected
      : false

    return (
      <div className="pair-item-with-score" style={{ position: 'relative' }}>
        <DisagreementIndicator voteInfo={voteInfo} isDisagreement={isDisagreement} />
        <TagBadge
          featureId={item.featureId}
          tagName={tagName}
          tagCategoryId={tagCategoryId}
          onClick={() => onListItemClick(listType, index)}
          fullWidth={true}
          isAuto={true}
        />
        {score !== undefined && (
          <span className="pair-similarity-score">{score.toFixed(2)}</span>
        )}
      </div>
    )
  }

  // Map CauseCategory to display tag names
  const CAUSE_TAG_NAMES: Record<CauseCategory, string> = {
    'noisy-activation': 'Noisy Activation',
    'missed-N-gram': 'Pattern Miss',
    'missed-context': 'Context Miss',
    'well-explained': 'Well-Explained'
  }

  // Render item for cause boundary list (Stage 3)
  // In apply stage: shows predicted category with stripe pattern
  // In unsure stage: shows "Unsure" without stripe
  const renderCauseBoundaryItem = (item: CauseFeatureItem, _index: number) => {
    const isApplyStage = causeProps?.activeStage === 'apply'
    const tagName = isApplyStage ? (CAUSE_TAG_NAMES[item.predictedCategory] || 'Unsure') : 'Unsure'

    // Check for disagreement in cause mode
    const causeVoteInfo = causeProps?.causeCommitteeVotes?.get(item.featureId)
    const isCauseDisagreement = causeVoteInfo
      ? (causeVoteInfo.rf_category !== item.predictedCategory || causeVoteInfo.mlp_category !== item.predictedCategory)
      : false

    return (
      <div className="pair-item-with-score" style={{ position: 'relative' }}>
        {/* Disagreement indicator for cause mode - matches DisagreementIndicator styling */}
        {isCauseDisagreement && (
          <>
            {/* Background overlay - behind TagBadge */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />
            {/* Left border - in front of TagBadge */}
            <div
              title={`RF: ${causeVoteInfo?.rf_category}, MLP: ${causeVoteInfo?.mlp_category}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '3px',
                backgroundColor: '#f59e0b',
                borderRadius: '4px 0 0 4px',
                pointerEvents: 'none',
                zIndex: 2
              }}
            />
          </>
        )}
        <TagBadge
          featureId={item.featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_CAUSE}
          onClick={() => onCauseListItemClick?.(item.featureId)}
          fullWidth={true}
          isAuto={isApplyStage}
        />
        {item.margin !== undefined && (
          <span className="pair-similarity-score">{item.margin.toFixed(2)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="threshold-tagging-panel">
      {/* Histogram Section */}
      <div className="threshold-tagging-panel__histogram-section">
        {mode === 'cause' && causeProps ? (
          <CauseMarginHistogram
            featureIds={causeProps.featureIds}
            causeCategoryDecisionMargins={causeProps.causeCategoryDecisionMargins}
            causeSelectionStates={causeProps.causeSelectionStates}
            causeSelectionSources={causeProps.causeSelectionSources}
            threshold={causeProps.threshold}
            onThresholdChange={causeProps.onThresholdChange}
            sortMode={causeProps.sortMode}
            sortDirection={causeProps.sortDirection}
            onPercentageChange={causeProps.onPercentageChange}
            canTrainSVM={causeProps.canTrainSVM}
            manualTagCountsByCategory={causeProps.manualTagCountsByCategory}
          />
        ) : (
          <DecisionMarginHistogram
            mode={mode as 'feature' | 'pair'}
            availablePairs={histogramProps.availablePairs}
            filteredFeatureIds={histogramProps.filteredFeatureIds}
            threshold={histogramProps.threshold}
          />
        )}
      </div>

      {/* Middle section: different layouts for cause vs pair/feature modes */}
      {mode === 'cause' && causeProps ? (
        /* Cause mode: Convergence indicator (top) + RadViz + Boundary List (bottom) */
        <div className="threshold-tagging-panel__middle-section">
          {/* Convergence indicator at top (same as pair/feature modes) */}
          <div className="threshold-tagging-panel__indicator-section">
            <h4 className="subheader subheader--with-value">
              Prediction Flip Rate
              {causeProps.flipTracking?.flipHistory?.length ? (
                <span className="subheader__value">
                  {(causeProps.flipTracking.flipHistory[causeProps.flipTracking.flipHistory.length - 1].flipRate * 100).toFixed(1)}%
                </span>
              ) : null}
            </h4>
            <ConvergenceIndicator
              flipTracking={causeProps.flipTracking ?? null}
              stage="stage3"
            />
          </div>
          {/* Content header for cause mode */}
          <div className="threshold-tagging-panel__content-header">
            <h4 className="subheader">
              Thresholded Features
              {causeProps.causeCategoryDecisionMargins.size > 0 && (
                <span className={`mode-indicator mode-indicator--${causeProps.activeStage === 'apply' ? 'confident' : 'unsure'}`}>
                  {causeProps.activeStage === 'apply' ? 'Confident' : 'Unsure'}
                </span>
              )}
            </h4>
            {causeProps.causeCommitteeVotes && causeNeedReviewCount > 0 && (
              <label className="threshold-tagging-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={showOnlyCauseNeedReview}
                  onChange={(e) => setShowOnlyCauseNeedReview(e.target.checked)}
                />
                Show <span style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  borderLeft: '3px solid #f59e0b',
                  padding: '2px',
                  borderRadius: '2px'
                }}>Disagreement</span> Only ({causeNeedReviewCount})
              </label>
            )}
          </div>
          {/* RadViz + Boundary List side by side - same structure as pair/feature mode */}
          <div className="threshold-tagging-panel__content-section threshold-tagging-panel__content-section--dual">
            {/* RadViz on left - sets its own 260px width */}
            <CauseRadViz
              featureIds={causeProps.stableFeatureIds}
              selectedFeatureId={causeProps.selectedFeatureId}
              visibleCategories={causeProps.visibleCategories}
              onVisibleCategoriesChange={causeProps.onVisibleCategoriesChange}
              onFeatureSelect={causeProps.onFeatureSelect}
              sortMode={causeProps.sortMode}
              sortDirection={causeProps.sortDirection}
            />
            {/* Boundary list on right - sets its own 260px width via variant */}
            <ScrollableItemList
              variant="boundary"
              badges={[
                {
                  label: causeProps.activeStage === 'apply' ? 'Confident Features' : 'Unsure Features',
                  count: `${filteredCauseBoundaryItems.length}`
                }
              ]}
              columnHeader={{
                label: '|Decision Margin|',
                sortDirection: sortDirection
              }}
              items={filteredCauseBoundaryItems as CauseFeatureItem[]}
              currentIndex={causeProps.isBoundaryListActive ? causeProps.boundaryListActiveIndex ?? -1 : -1}
              isActive={causeProps.isBoundaryListActive ?? false}
              isTemplateSort={true}
              renderItem={(item, index) => renderCauseBoundaryItem(item as CauseFeatureItem, index)}
            />
          </div>
        </div>
      ) : (
        /* Pair/Feature mode: Flip Rate (top) + Boundary lists (bottom) */
        <div className="threshold-tagging-panel__middle-section">
          {/* Convergence indicator at top of middle section */}
          <div className="threshold-tagging-panel__indicator-section">
            <h4 className="subheader subheader--with-value">
              Prediction Flip Rate
              {tagAutomaticState?.flipTracking?.flipHistory?.length ? (
                <span className="subheader__value">
                  {(tagAutomaticState.flipTracking.flipHistory[tagAutomaticState.flipTracking.flipHistory.length - 1].flipRate * 100).toFixed(1)}%
                </span>
              ) : null}
            </h4>
            <ConvergenceIndicator
              flipTracking={tagAutomaticState?.flipTracking ?? null}
              stage={mode === 'pair' ? 'stage1' : 'stage2'}
            />
          </div>

          {/* Content header with subtitle and optional checkbox */}
          <div className="threshold-tagging-panel__content-header">
            <h4 className="subheader">
              {mode === 'pair' ? 'Thresholded Feature Pairs' : 'Thresholded Features'}
            </h4>
            {committeeVotes && (needReviewCounts.left > 0 || needReviewCounts.right > 0) && (
              <label className="threshold-tagging-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={showOnlyNeedReview}
                  onChange={(e) => setShowOnlyNeedReview(e.target.checked)}
                />
                Show <span style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  borderLeft: '3px solid #f59e0b',
                  padding: '2px',
                  borderRadius: '2px'
                }}>Disagreement</span> Only ({needReviewCounts.left + needReviewCounts.right})
              </label>
            )}
          </div>
          {/* Boundary lists container */}
          <div className="threshold-tagging-panel__content-section threshold-tagging-panel__content-section--dual">
            {/* Left boundary list (Monosemantic/Need Revision - below reject threshold) */}
            <ScrollableItemList
              variant="boundary"
              badges={[
                { label: leftListLabel, count: mode === 'pair' ? `${filteredLeftItems.length.toLocaleString()} pairs` : `${filteredLeftItems.length.toLocaleString()} features` }
              ]}
              columnHeader={{
                label: '|Decision Margin|',
                sortDirection: sortDirection
              }}
              items={filteredLeftItems as PairItemWithMetadata[]}
              currentIndex={leftHighlightIndex !== undefined ? leftHighlightIndex : (activeListSource === 'reject' ? currentIndex : -1)}
              isActive={activeListSource === 'reject'}
              isTemplateSort={isTemplateSort}
              renderItem={(item, index) => mode === 'pair'
                ? renderBoundaryItem(item, index, 'left')
                : renderFeatureItem(item as unknown as FeatureItemWithMetadata, index, 'left')
              }
            />

            {/* Right boundary list (Fragmented/Well-Explained - above select threshold) */}
            <ScrollableItemList
              variant="boundary"
              badges={[
                { label: rightListLabel, count: mode === 'pair' ? `${filteredRightItems.length.toLocaleString()} pairs` : `${filteredRightItems.length.toLocaleString()} features` }
              ]}
              columnHeader={{
                label: '|Decision Margin|',
                sortDirection: sortDirection
              }}
              items={filteredRightItems as PairItemWithMetadata[]}
              currentIndex={rightHighlightIndex !== undefined ? rightHighlightIndex : (activeListSource === 'select' ? currentIndex : -1)}
              isActive={activeListSource === 'select'}
              isTemplateSort={isTemplateSort}
              renderItem={(item, index) => mode === 'pair'
                ? renderBoundaryItem(item, index, 'right')
                : renderFeatureItem(item as unknown as FeatureItemWithMetadata, index, 'right')
              }
            />
          </div>
        </div>
      )}

      {/* Buttons section on the right */}
      <div className="threshold-tagging-panel__buttons-section">
        <h4 className="subheader">Batch Tagging</h4>
        {mode === 'cause' && causeProps ? (
          <BatchTaggingPanel
            categories={causeProps.categories}
            unsureCount={causeProps.unsureCount}
            disabled={!causeProps.canTrainSVM || causeProps.causeCategoryDecisionMargins.size === 0}
            onConfirmCategory={causeProps.onConfirmCategory}
            onConfirmAll={causeProps.onConfirmAll}
            onTagAllUnsure={causeProps.onTagAllUnsure}
          />
        ) : (
          <BatchTaggingPanel
            categories={[
              {
                id: 'left',
                label: leftListLabel,
                color: leftTagColor,
                count: leftCount,
                inputCount: boundaryTagCounts.left,
                outputCount: boundaryTagCounts.left
              },
              {
                id: 'right',
                label: rightListLabel,
                color: rightTagColor,
                count: rightCount,
                inputCount: boundaryTagCounts.right,
                outputCount: boundaryTagCounts.right
              }
            ]}
            unsureCount={remainingCount}
            disabled={!tagAutomaticState?.histogramData}
            onApplyThreshold={onApplyTags}
            thresholdCounts={{ left: leftCount, right: rightCount }}
            onTagAllAsCategory={() => onTagAll('left')}
            onTagAllUnsure={() => onTagAll('byBoundary')}
          />
        )}
      </div>
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
