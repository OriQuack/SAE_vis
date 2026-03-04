import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FlipTrackingInfo } from '../types'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import CauseMarginHistogram from './CauseMarginHistogram'
import CauseRadViz from './CauseRadViz'
import ConvergenceIndicator from './ConvergenceIndicator'
import BatchTaggingPanel from './BatchTaggingPanel'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
import type { ActiveStage } from './StageAccordionList'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// THRESHOLD TAGGING PANEL - Reusable bottom row for tagging workflows
// ============================================================================
// Layout: [Histogram] | [Flip Rate (top) + Batch Tagging (bottom)]
// Used by: FeatureSplitView, QualityView, and CauseView

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
  hideTagged?: boolean
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
  onConfirmAll: () => void
  onTagAllUnsure: () => void
}

export interface ThresholdTaggingPanelProps {
  // Mode for DecisionMarginHistogram
  mode: 'feature' | 'pair' | 'cause'
  tagCategoryId: string

  // List configuration (labels differ per stage)
  leftListLabel: string    // e.g., "Monosemantic" or "Need Revision"
  rightListLabel: string   // e.g., "Incoherent Splitting" or "Well-Explained"

  // Histogram passthrough
  histogramProps: {
    availablePairs?: Array<{pairKey: string; mainFeatureId: number; similarFeatureId: number}>
    filteredFeatureIds?: Set<number>
    threshold?: number
    focusedItemId?: string | null
  }

  // Callbacks
  onApplyTags: () => void
  onTagAll: (method: 'left' | 'byBoundary') => void

  // Active stage for controlling threshold handle visibility
  activeStage?: ActiveStage

  // Cause mode specific props (only when mode='cause')
  causeProps?: CauseModeProps
}

const ThresholdTaggingPanel: React.FC<ThresholdTaggingPanelProps> = ({
  mode,
  tagCategoryId,
  leftListLabel,
  rightListLabel,
  histogramProps,
  onApplyTags,
  onTagAll,
  activeStage,
  // Cause mode props
  causeProps,
}) => {
  // Store state for scores and selections
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)

  // Get tag colors
  const leftTagColor = getTagColor(tagCategoryId, leftListLabel) || '#9ca3af'
  const rightTagColor = getTagColor(tagCategoryId, rightListLabel) || '#9ca3af'

  // Compute counts
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

  // Compute threshold counts (items past threshold handles) for BatchTaggingPanel
  const thresholdCounts = useMemo(() => {
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8

    let leftCount = 0
    let rightCount = 0

    if (mode === 'pair') {
      histogramProps.availablePairs?.forEach(pair => {
        const score = pairSimilarityScores.get(pair.pairKey)
        if (score !== undefined) {
          if (score < rejectThreshold) leftCount++
          else if (score >= selectThreshold) rightCount++
        }
      })
    } else {
      histogramProps.filteredFeatureIds?.forEach(featureId => {
        const score = similarityScores.get(featureId)
        if (score !== undefined) {
          if (score < rejectThreshold) leftCount++
          else if (score >= selectThreshold) rightCount++
        }
      })
    }

    return { left: leftCount, right: rightCount }
  }, [mode, tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold, histogramProps.availablePairs, histogramProps.filteredFeatureIds, pairSimilarityScores, similarityScores])

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
            canTrainSVM={causeProps.canTrainSVM}
            manualTagCountsByCategory={causeProps.manualTagCountsByCategory}
            activeStage={activeStage}
            focusedFeatureId={causeProps.selectedFeatureId}
          />
        ) : (
          <DecisionMarginHistogram
            mode={mode as 'feature' | 'pair'}
            availablePairs={histogramProps.availablePairs}
            filteredFeatureIds={histogramProps.filteredFeatureIds}
            threshold={histogramProps.threshold}
            activeStage={activeStage}
            focusedItemId={histogramProps.focusedItemId}
          />
        )}
      </div>

      {/* Right section: Flip Rate (top) + Batch Tagging (bottom) */}
      <div className="threshold-tagging-panel__right-section">
        {/* Convergence indicator at top */}
        <div className="threshold-tagging-panel__indicator-section">
          {mode === 'cause' && causeProps ? (
            <>
              <h4 className="subheader subheader--with-value">
                Stability Chart
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
            </>
          ) : (
            <>
              <h4 className="subheader subheader--with-value">
                Stability Chart
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
            </>
          )}
        </div>

        {/* Batch tagging area */}
        <div className="threshold-tagging-panel__batch-section">
          {mode === 'cause' && causeProps ? (
            /* Cause mode: RadViz + BatchTagging side by side */
            <div className="threshold-tagging-panel__cause-batch-row">
              <CauseRadViz
                featureIds={causeProps.stableFeatureIds}
                selectedFeatureId={causeProps.selectedFeatureId}
                visibleCategories={causeProps.visibleCategories}
                onVisibleCategoriesChange={causeProps.onVisibleCategoriesChange}
                onFeatureSelect={causeProps.onFeatureSelect}
                sortMode={causeProps.sortMode}
                sortDirection={causeProps.sortDirection}
                hideTagged={causeProps.hideTagged}
              />
              <div className="threshold-tagging-panel__batch-column">
                <h4 className="subheader">Automatic Labeling</h4>
                <BatchTaggingPanel
                  categories={causeProps.categories}
                  unsureCount={causeProps.unsureCount}
                  disabled={activeStage === 'bootstrap' || !causeProps.canTrainSVM || causeProps.causeCategoryDecisionMargins.size === 0}
                  onConfirmAll={causeProps.onConfirmAll}
                  onTagAllUnsure={causeProps.onTagAllUnsure}
                />
              </div>
            </div>
          ) : (
            /* Pair/Feature mode: BatchTagging only */
            <div className="threshold-tagging-panel__batch-column">
              <h4 className="subheader">Automatic Labeling</h4>
              <BatchTaggingPanel
                categories={[
                  {
                    id: 'left',
                    label: leftListLabel,
                    color: leftTagColor,
                    count: thresholdCounts.left,
                    inputCount: boundaryTagCounts.left,
                    outputCount: boundaryTagCounts.left
                  },
                  {
                    id: 'right',
                    label: rightListLabel,
                    color: rightTagColor,
                    count: thresholdCounts.right,
                    inputCount: boundaryTagCounts.right,
                    outputCount: boundaryTagCounts.right
                  }
                ]}
                unsureCount={remainingCount}
                disabled={activeStage === 'bootstrap' || !tagAutomaticState?.histogramData}
                onApplyThreshold={onApplyTags}
                thresholdCounts={thresholdCounts}
                onTagAllAsCategory={() => onTagAll('left')}
                onTagAllUnsure={() => onTagAll('byBoundary')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
