import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FlipTrackingInfo } from '../types'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import CauseMarginHistogram from './CauseMarginHistogram'
import CauseRadViz from './CauseRadViz'
import ConvergenceIndicator from './ConvergenceIndicator'
import BatchTaggingPanel from './BatchTaggingPanel'
import GuidancePopover from './GuidancePopover'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
import type { ActiveStage } from './StageAccordionList'
import { ThresholdHandleIcon } from './ThresholdHandles'
import { t } from '../lib/i18n'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// THRESHOLD TAGGING PANEL - Reusable bottom row for tagging workflows
// ============================================================================
// Layout: [Histogram] | [Flip Rate (top) + Batch Tagging (bottom)]
// Used by: FeatureSplitView, QualityView, and CauseView

// Cause mode specific props
export interface CauseModeProps {
  featureIds: Set<number>
  causeDecisionMargins: Map<number, number>
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

  // Stability popover (shown when flip rate is stable)
  showStabilityPopover?: boolean
  onDismissStabilityPopover?: () => void
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
  // Stability popover
  showStabilityPopover,
  onDismissStabilityPopover,
}) => {
  const stabilityHeaderRef = useRef<HTMLHeadingElement>(null)
  const thresholdHandleRef = useRef<SVGGElement>(null)

  // Show GuidancePopover on threshold handles when first entering Apply phase
  const [showHandlePopover, setShowHandlePopover] = useState(false)
  const prevActiveStageRef = useRef(activeStage)
  useEffect(() => {
    const prev = prevActiveStageRef.current
    prevActiveStageRef.current = activeStage
    const showOnApply = activeStage === 'apply' && prev !== 'apply'
    const showOnLearnCause = mode === 'cause' && activeStage === 'learn' && prev !== 'learn'
    if (showOnApply || showOnLearnCause) {
      setShowHandlePopover(true)
    }
  }, [activeStage, mode])
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

  // Count already tagged items WITHIN the current selection (not global store size)
  const taggedCount = mode === 'pair'
    ? (histogramProps.availablePairs?.filter(p => pairSelectionStates.has(p.pairKey)).length ?? 0)
    : (() => { let c = 0; histogramProps.filteredFeatureIds?.forEach(id => { if (featureSelectionStates.has(id)) c++ }); return c })()
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
      <div className="threshold-tagging-panel__histogram-column">
        <h4 className="subheader" data-tooltip-title="Confidence Histogram" data-tooltip={mode === 'cause' ? t('Distance to the nearest decision boundary. Higher values indicate more confident classification.', '가장 가까운 decision boundary까지의 거리. 높을수록 confident한 classification.') : t(`Confidence of the classifier for each ${mode === 'pair' ? 'pair' : 'feature'}. Extremes are confident; near zero is ambiguous.`, `각 ${mode === 'pair' ? 'pair' : 'feature'}에 대한 classifier confidence. 극단값은 확신, 0 근처는 모호.`)}>Confidence Histogram {(activeStage === 'apply' || (activeStage === 'learn' && mode === 'cause')) && (
          <span className="instruction-subheader" style={{ marginLeft: 8 }}>
            {t('Drag the', '드래그하여')} <ThresholdHandleIcon orientation="horizontal" width={20} height={18} className="view-threshold-icon" />{activeStage === 'learn' && mode === 'cause'
              ? t(' to set Unsure threshold for Uncertainty list above and category scatter', ' 위 Uncertainty 목록과 category scatter의 Unsure threshold 설정')
              : <> {t('to set a threshold to filter the Disagreement list above', '위 Disagreement 목록의 필터링 threshold 설정')}{mode === 'cause' ? t(' and category scatter', ' 및 category scatter') : ''}</>}
          </span>
        )}</h4>
        {showHandlePopover && (
          <GuidancePopover
            anchorRef={thresholdHandleRef}
            message={<>{t('Drag the', '드래그하여')} <ThresholdHandleIcon orientation="horizontal" width={20} height={18} className="view-threshold-icon" />{activeStage === 'learn' && mode === 'cause'
              ? t(' to set Unsure threshold for Uncertainty list above and category scatter', ' 위 Uncertainty 목록과 category scatter의 Unsure threshold 설정')
              : <> {t('to set a threshold to filter the Disagreement list above', '위 Disagreement 목록의 필터링 threshold 설정')}{mode === 'cause' ? t(' and category scatter', ' 및 category scatter') : ''}</>}</>}
            onDismiss={() => setShowHandlePopover(false)}
            position="above"
          />
        )}
        <div className="threshold-tagging-panel__histogram-section">
        {mode === 'cause' && causeProps ? (
          <CauseMarginHistogram
            featureIds={causeProps.featureIds}
            causeDecisionMargins={causeProps.causeDecisionMargins}
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
            handleRef={thresholdHandleRef}
          />
        ) : (
          <DecisionMarginHistogram
            mode={mode as 'feature' | 'pair'}
            availablePairs={histogramProps.availablePairs}
            filteredFeatureIds={histogramProps.filteredFeatureIds}
            threshold={histogramProps.threshold}
            activeStage={activeStage}
            focusedItemId={histogramProps.focusedItemId}
            handleRef={thresholdHandleRef}
          />
        )}
        </div>
      </div>

      {/* Right section: Flip Rate (top) + Batch Tagging (bottom) */}
      <div className="threshold-tagging-panel__right-section">
        {/* Convergence indicator at top */}
        <div className="threshold-tagging-panel__indicator-section">
          {mode === 'cause' && causeProps ? (
            <>
              <h4 ref={stabilityHeaderRef} className="subheader subheader--with-value" data-tooltip-title="Stability Chart" data-tooltip={t("Fraction of predictions that changed between labeling iterations. A declining rate indicates convergence.", "Labeling 반복 간 prediction 변화 비율. 감소 추세는 수렴을 의미.")}>
                Stability Chart
                {causeProps.flipTracking?.flipHistory?.length ? (
                  <>
                    <span className="subheader__label">Current Flip Rate:</span>
                    <span className="subheader__value">
                      {(causeProps.flipTracking.flipHistory[causeProps.flipTracking.flipHistory.length - 1].flipRate * 100).toFixed(1)}%
                    </span>
                  </>
                ) : null}
              </h4>
              <ConvergenceIndicator
                flipTracking={causeProps.flipTracking ?? null}
                stage="stage3"
              />
            </>
          ) : (
            <>
              <h4 ref={stabilityHeaderRef} className="subheader subheader--with-value" data-tooltip-title="Stability Chart" data-tooltip={t("Fraction of predictions that changed between labeling iterations. A declining rate indicates convergence.", "Labeling 반복 간 prediction 변화 비율. 감소 추세는 수렴을 의미.")}>
                Stability Chart
                {tagAutomaticState?.flipTracking?.flipHistory?.length ? (
                  <>
                    <span className="subheader__label">Current Flip Rate:</span>
                    <span className="subheader__value">
                      {(tagAutomaticState.flipTracking.flipHistory[tagAutomaticState.flipTracking.flipHistory.length - 1].flipRate * 100).toFixed(1)}%
                    </span>
                  </>
                ) : null}
              </h4>
              <ConvergenceIndicator
                flipTracking={tagAutomaticState?.flipTracking ?? null}
                stage={mode === 'pair' ? 'stage1' : 'stage2'}
              />
            </>
          )}
        </div>

        {/* Stability popover anchored to Stability Chart header */}
        {showStabilityPopover && onDismissStabilityPopover && (
          <GuidancePopover
            anchorRef={stabilityHeaderRef}
            message={t("Predictions have stabilized. Consider moving on to Disagreement phase to finalize labels.", "Prediction이 안정화되었습니다. Disagreement 단계로 이동하여 label을 확정하세요.")}
            onDismiss={onDismissStabilityPopover}
            position="above"
          />
        )}

        {/* Batch tagging area */}
        <div className="threshold-tagging-panel__batch-section">
          {mode === 'cause' && causeProps ? (
            /* Cause mode: RadViz + BatchTagging side by side */
            <div className="threshold-tagging-panel__cause-batch-row">
              <div className="threshold-tagging-panel__radviz-column">
                <h4 className="subheader" data-tooltip-title="Category Scatter" data-tooltip={t("Each feature positioned by relative classifier confidence toward each category.", "각 feature를 category별 classifier confidence에 따라 배치.")}>Category Scatter</h4>
                <CauseRadViz
                  featureIds={causeProps.stableFeatureIds}
                  selectedFeatureId={causeProps.selectedFeatureId}
                  activeStage={activeStage}
                  hideTagged={causeProps.hideTagged}
                />
              </div>
              <div className="threshold-tagging-panel__batch-column">
                <h4 className="subheader" data-tooltip-title="Automatic Labeling" data-tooltip={t("Apply classifier predictions to remaining unlabeled features.", "미분류 feature에 classifier prediction 적용.")}>Automatic Labeling</h4>
                <BatchTaggingPanel
                  categories={causeProps.categories}
                  unsureCount={causeProps.unsureCount}
                  disabled={activeStage !== 'apply' || !causeProps.canTrainSVM || causeProps.causeDecisionMargins.size === 0}
                  onConfirmAll={causeProps.onConfirmAll}
                  onTagAllUnsure={causeProps.onTagAllUnsure}
                  itemLabel="features"
                />
              </div>
            </div>
          ) : (
            /* Pair/Feature mode: BatchTagging only */
            <div className="threshold-tagging-panel__batch-column">
              <h4 className="subheader" data-tooltip-title="Automatic Labeling" data-tooltip={t("Apply classifier predictions to remaining unlabeled features.", "미분류 feature에 classifier prediction 적용.")}>Automatic Labeling</h4>
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
                disabled={activeStage !== 'apply' || !tagAutomaticState?.histogramData}
                onApplyThreshold={onApplyTags}
                thresholdCounts={thresholdCounts}
                onTagAllAsCategory={() => onTagAll('left')}
                onTagAllUnsure={() => onTagAll('byBoundary')}
                itemLabel={mode === 'pair' ? 'pairs' : 'features'}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
