import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import ActivationExample from './ActivationExamplePanel'
import { ExplanationWithPopover } from './ExplanationPanel'
import { TagButton } from './Indicators'
import { UNSURE_GRAY, TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { t, getTagTooltip } from '../lib/i18n'
import { getTagColor } from '../lib/tag-system'
// import { extractInterFeaturePositions } from '../lib/activation-utils' // commented out: inter-feature highlighting
import { getBestExplanation } from '../lib/table-data-utils'
import { useTaggingNavigation, type SortMode, type ActiveStage } from '../lib/tagging-hooks'
import { logAction } from '../lib/action-logger'
import '../styles/FeatureSplitPairViewer.css'

// ============================================================================
// FEATURE SPLIT PAIR VIEWER COMPONENT
// ============================================================================
// Displays activating examples for the current pair
// Parent (FeatureSplitView) manages pair list and navigation

type PairData = {
  mainFeatureId: number
  similarFeatureId: number
  decoderSimilarity: number | null
  pairKey: string
  clusterId: number
  row: FeatureTableRow | null
  similarRow: FeatureTableRow | null
}

interface FeatureSplitPairViewerProps {
  className?: string
  currentPairIndex: number
  pairList: Array<PairData>
  currentPair?: PairData | null  // Optional: pass directly to avoid recomputation during drag
  onNavigatePrevious?: () => void
  onNavigateNext?: () => void
  sortMode?: SortMode  // Current sort mode
  isLoading?: boolean  // Whether similarity scores are being calculated
  isTemplateSort?: boolean  // Whether current sort matches template (default) sort
  onResetToFirstPair?: () => void  // Callback to reset to page 1, first pair
  hideTagged?: boolean  // Whether tagged items are hidden - disables auto-advance
  activeStage?: ActiveStage  // Current workflow stage
  allItemsLabeled?: boolean  // All items (unfiltered) have been labeled
  showDisagreementOnly?: boolean  // Whether disagreement filter is active
  onClearStoredSelection?: () => void  // Clear stored selection state when hideTagged removes item
  onUndoNavigate?: (pairKey: string) => void  // Navigate to undone pair after undo
  previewSelectKeys?: Set<string>  // Pairs in select threshold region (before Apply)
  previewRejectKeys?: Set<string>  // Pairs in reject threshold region (before Apply)
  onItemReviewed?: (pairKey: string) => void  // Called when user takes any tag action (including unsure)
}

const FeatureSplitPairViewer: React.FC<FeatureSplitPairViewerProps> = ({
  className = '',
  currentPairIndex,
  pairList,
  currentPair: currentPairProp,
  onNavigatePrevious,
  onNavigateNext,
  sortMode = 'default',
  isLoading = false,
  isTemplateSort: _isTemplateSort = true,
  onResetToFirstPair,
  hideTagged = false,
  activeStage = 'bootstrap',
  allItemsLabeled = false,
  showDisagreementOnly = false,
  onClearStoredSelection,
  onUndoNavigate,
  previewSelectKeys,
  previewRejectKeys,
  onItemReviewed
}) => {
  // Store state
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const togglePairSelection = useVisualizationStore(state => state.togglePairSelection)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const tableData = useVisualizationStore(state => state.tableData)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const lastClickTagAction = useVisualizationStore(state => state.lastClickTagAction)
  const setLastClickTagAction = useVisualizationStore(state => state.setLastClickTagAction)
  const undoLastClickTag = useVisualizationStore(state => state.undoLastClickTag)

  // Container width for activating examples (responsive to resize)
  const [containerWidth, setContainerWidth] = useState(1400)
  const mainContainerRef = useRef<HTMLDivElement>(null)

  // ResizeObserver to update containerWidth on resize
  // Re-run when currentPair becomes available (ref element renders)
  useEffect(() => {
    const element = mainContainerRef.current
    if (!element) return

    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width
      setContainerWidth(width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [currentPairProp, pairList, currentPairIndex])

  // Current pair - use prop if provided, otherwise compute from list
  const currentPair = currentPairProp !== undefined ? currentPairProp : (pairList[currentPairIndex] || null)

  // Get selection state for current pair
  const pairSelectionState = currentPair ? pairSelectionStates.get(currentPair.pairKey) || null : null
  // Preview state: show stripe when item is in threshold region but not yet applied
  const currentPairPreview = useMemo(() => {
    if (!currentPair || pairSelectionState !== null) return null
    if (previewSelectKeys?.has(currentPair.pairKey)) return 'selected' as const
    if (previewRejectKeys?.has(currentPair.pairKey)) return 'rejected' as const
    return null
  }, [currentPair, pairSelectionState, previewSelectKeys, previewRejectKeys])

  // NOTE: activating examples are pre-fetched by parent (FeatureSplitView) for the entire page
  // This component just reads from the activationExamples cache

  // Post-tagging navigation hook
  const { handlePostTagNavigation, handlePostUnsureNavigation } = useTaggingNavigation({
    sortMode,
    currentIndex: currentPairIndex,
    listLength: pairList.length,
    onNavigateNext: onNavigateNext || (() => {}),
    onResetToFirst: onResetToFirstPair || (() => {}),
    isHistogramReady: !!tagAutomaticState?.histogramData,
    hideTagged,
    onClearStoredSelection
  })

  // Selection handlers
  const handleFragmentedClick = () => {
    if (!currentPair) return
    onItemReviewed?.(currentPair.pairKey)
    const previousTag = pairSelectionState === 'selected' ? 'Incoherent Splitting' : pairSelectionState === 'rejected' ? 'Monosemantic' : 'Unsure'
    logAction('stage1', 'manual_tag', { tag: 'Incoherent Splitting', previousTag, pairKey: currentPair.pairKey, mainFeatureId: currentPair.mainFeatureId, similarFeatureId: currentPair.similarFeatureId })

    // If already selected (Fragmented), keep tag and navigate
    if (pairSelectionState === 'selected') {
      handlePostTagNavigation()
    } else {
      // Set to selected
      if (pairSelectionState === null) {
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      } else if (pairSelectionState === 'rejected') {
        // rejected -> null -> selected
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      }
      setLastClickTagAction({ stage: 'pair', pairKey: currentPair.pairKey })
      handlePostTagNavigation()
    }
  }

  const handleMonosemanticClick = () => {
    if (!currentPair) return
    onItemReviewed?.(currentPair.pairKey)
    const previousTag = pairSelectionState === 'selected' ? 'Incoherent Splitting' : pairSelectionState === 'rejected' ? 'Monosemantic' : 'Unsure'
    logAction('stage1', 'manual_tag', { tag: 'Monosemantic', previousTag, pairKey: currentPair.pairKey, mainFeatureId: currentPair.mainFeatureId, similarFeatureId: currentPair.similarFeatureId })

    // If already rejected (Monosemantic), keep tag and navigate
    if (pairSelectionState === 'rejected') {
      handlePostTagNavigation()
    } else {
      // Set to rejected
      if (pairSelectionState === null) {
        // null -> selected -> rejected
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      } else if (pairSelectionState === 'selected') {
        // selected -> rejected
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      }
      setLastClickTagAction({ stage: 'pair', pairKey: currentPair.pairKey })
      handlePostTagNavigation()
    }
  }

  const handleUnsureClick = () => {
    if (!currentPair) return
    onItemReviewed?.(currentPair.pairKey)
    const previousTag = pairSelectionState === 'selected' ? 'Incoherent Splitting' : pairSelectionState === 'rejected' ? 'Monosemantic' : 'Unsure'
    logAction('stage1', 'manual_tag', { tag: 'Unsure', previousTag, pairKey: currentPair.pairKey, mainFeatureId: currentPair.mainFeatureId, similarFeatureId: currentPair.similarFeatureId })

    // Clear selection (set to null)
    if (pairSelectionState === 'selected') {
      // selected -> rejected -> null
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
    } else if (pairSelectionState === 'rejected') {
      // rejected -> null
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
    }
    // Use centralized navigation logic (always advances for unsure)
    handlePostUnsureNavigation()
  }

  // Undo handler: revert tag and navigate to the undone pair
  const handleUndoClick = () => {
    const pairKey = lastClickTagAction?.pairKey
    undoLastClickTag()
    if (pairKey && onUndoNavigate) {
      onUndoNavigate(pairKey)
    }
  }

  // Get activation data (only if currentPair exists)
  const mainActivation = currentPair ? activationExamples[currentPair.mainFeatureId] : null

  // TEMPORARY FIX: We have 16k features but only ~7500 in tableData
  // However, we DO have activating examples for features > 7500
  // So we get activation data directly, even if similarRow doesn't exist
  // TODO: Remove this workaround when full feature data is available
  const similarActivation = currentPair ? (activationExamples[currentPair.similarFeatureId] || null) : null

  // Extract inter-feature positions for highlighting (if available)
  const mainFeatureRow = currentPair?.row
  const similarFeatureRow = currentPair?.similarRow

  // Get best explanations for each feature
  const mainExplanation = getBestExplanation(mainFeatureRow ?? null, tableData?.global_stats)
  const similarExplanation = getBestExplanation(similarFeatureRow ?? null, tableData?.global_stats)

  // COMMENTED OUT: Inter-feature blue border highlighting disabled
  // let mainInterFeaturePositions = undefined
  // let similarInterFeaturePositions = undefined
  //
  // if (currentPair && mainFeatureRow && similarFeatureRow) {
  //   const decoderData = mainFeatureRow.decoder_similarity
  //   if (decoderData && Array.isArray(decoderData)) {
  //     const similarData = decoderData.find(d => d.feature_id === currentPair.similarFeatureId)
  //     if (similarData?.inter_feature_similarity) {
  //       const extracted = extractInterFeaturePositions(similarData.inter_feature_similarity)
  //       if (extracted) {
  //         const interNgramLength = extracted.type === 'char' && similarData.inter_feature_similarity.best_ngram_text
  //           ? similarData.inter_feature_similarity.best_ngram_text.length
  //           : 0
  //         mainInterFeaturePositions = {
  //           type: extracted.type!,
  //           positions: extracted.mainPositions,
  //           ngramLength: interNgramLength
  //         }
  //         similarInterFeaturePositions = {
  //           type: extracted.type!,
  //           positions: extracted.similarPositions,
  //           ngramLength: interNgramLength
  //         }
  //       }
  //     }
  //   }
  // }

  // Get tag colors for buttons
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Incoherent Splitting') || '#F0E442'
  const monosemanticColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY  // Gray for unsure state

  return (
    <div className={`feature-split-pair-viewer ${className}`}>
      {/* Main content area */}
      <div className="pair-viewer__main" ref={mainContainerRef}>
        {currentPair ? (
          <>
            {/* Header row */}
            <div className="pair-viewer__header">
              {/* Subheader */}
              <h4 className="subheader" data-tooltip-title="Activating Examples" data-tooltip-html={t('2 examples per quartile, ranked by max activation strength (highest &rarr; lowest).', 'Quartile별 2개 example, 최대 activation 강도순 정렬 (높은 순 &rarr; 낮은 순).')}>Activating Examples <span className="instruction-subheader">of</span>{' '}
                <span className="panel-header__id">#{currentPair.mainFeatureId}</span>{' '}
                <span className="panel-header__id">#{currentPair.similarFeatureId}</span>
              </h4>

              {/* Decoder Similarity */}
              <div className="pair-info__similarity">
                <span className="subheader__label">Decoder Similarity:</span>
                <span className="subheader__value">
                  {currentPair.decoderSimilarity !== null ? currentPair.decoderSimilarity.toFixed(3) : 'N/A'}
                </span>
              </div>
            </div>
            {/* Activation legend */}
            <div className="pair-viewer__legend">
              <div className="legend-item">
                <span className="legend-sample legend-sample--activation">token</span>:
                <span className="legend-label">Activation Strength</span>
              </div>
              {/* COMMENTED OUT: Inter-feature blue border legend disabled
              <div className="legend-item">
                <span className="legend-sample legend-sample--inter">token</span>:
                <span className="legend-label">Shared Pattern Between Features</span>
              </div>
              */}
            </div>

            {/* activating examples side-by-side */}
            <div className={`pair-viewer__content ${isLoading ? 'pair-viewer__content--loading' : ''}`}>
              {/* Main feature activation */}
              <div className="activation-panel activation-panel--main">
                <div className="activation-panel__header">
                  <div className="panel-header__content">
                    <span className="panel-header__id">#{currentPair.mainFeatureId}</span>
                    {mainExplanation && (
                      <ExplanationWithPopover
                        text={mainExplanation}
                        hasNoActivations={!mainActivation?.quantile_examples?.length}
                      />
                    )}
                  </div>
                </div>
                {mainActivation ? (
                  <div className="activation-panel__examples">
                    <ActivationExample
                      examples={mainActivation}
                      containerWidth={containerWidth - 40}
                      numQuantiles={4}
                      examplesPerQuantile={[2, 2, 2, 2]}
                      disableHover={true}
                      disableNgramHighlight={true}
                    />
                  </div>
                ) : (
                  <div className="activation-panel__loading">Loading activating examples...</div>
                )}
              </div>

              {/* Similar feature activation */}
              <div className="activation-panel activation-panel--similar">
                <div className="activation-panel__header">
                  <div className="panel-header__content">
                    <span className="panel-header__id">#{currentPair.similarFeatureId}</span>
                    {similarExplanation && (
                      <ExplanationWithPopover
                        text={similarExplanation}
                        hasNoActivations={!similarActivation?.quantile_examples?.length}
                      />
                    )}
                  </div>
                </div>
                {/* TEMPORARY FIX: Check for activation data instead of feature row */}
                {/* TODO: Remove when full feature data is available for all 16k features */}
                {similarActivation ? (
                  <div className="activation-panel__examples">
                    <ActivationExample
                      examples={similarActivation}
                      containerWidth={containerWidth - 40}
                      numQuantiles={4}
                      examplesPerQuantile={[2, 2, 2, 2]}
                      disableHover={true}
                      disableNgramHighlight={true}
                    />
                  </div>
                ) : (
                  <div className="activation-panel__loading">Loading activating examples...</div>
                )}
              </div>
            </div>

            {/* Floating control panel at bottom */}
            <div className="floating-controls">
              {/* Previous button */}
              <button
                className="nav__button"
                onClick={onNavigatePrevious}
                disabled={currentPairIndex === 0 || !onNavigatePrevious}
              >
                ← Prev
              </button>

              {/* Selection buttons - Monosemantic | Fragmented */}
              <TagButton
                label="Monosemantic"
                variant="monosemantic"
                color={monosemanticColor}
                isSelected={pairSelectionState === 'rejected' || currentPairPreview === 'rejected'}
                isAuto={currentPairPreview === 'rejected'}
                onClick={handleMonosemanticClick}
                tooltip={getTagTooltip(`${TAG_CATEGORY_FEATURE_SPLITTING}:Monosemantic`)}
              />
              <TagButton
                label="Incoherent Splitting"
                variant="fragmented"
                color={fragmentedColor}
                isSelected={pairSelectionState === 'selected' || currentPairPreview === 'selected'}
                isAuto={currentPairPreview === 'selected'}
                onClick={handleFragmentedClick}
                tooltip={getTagTooltip(`${TAG_CATEGORY_FEATURE_SPLITTING}:Incoherent Splitting`)}
              />

              {/* Next button */}
              <button
                className="nav__button"
                onClick={() => { logAction('stage1', 'navigate_next', {}); onNavigateNext?.() }}
                disabled={currentPairIndex >= pairList.length - 1 || !onNavigateNext}
              >
                Next →
              </button>

              {/* Secondary actions: Undo + Unsure */}
              <div className="floating-controls__secondary">
                <button
                  className="nav__button nav__button--undo"
                  onClick={handleUndoClick}
                  disabled={!lastClickTagAction}
                  title="Undo last tag"
                >
                  ↩ Undo
                </button>
                <TagButton
                  label="Unsure"
                  variant="unsure"
                  color={unsureColor}
                  isSelected={pairSelectionState === null}
                  onClick={handleUnsureClick}
                  tooltip={getTagTooltip('Unsure')}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="pair-viewer__empty-state">
            <span>No pairs to display</span>
            {(() => {
              const hints: string[] = []
              if (showDisagreementOnly) hints.push('uncheck "Disagreement Only"')
              if (activeStage === 'apply' && !allItemsLabeled) hints.push('adjust the threshold range')
              if (hideTagged && (activeStage !== 'apply' || allItemsLabeled)) hints.push('uncheck "Hide Labeled" to review labeled pairs')
              if (hints.length === 0) return null
              const text = hints[0].charAt(0).toUpperCase() + hints[0].slice(1)
                + (hints.length > 1 ? ', or ' + hints.slice(1).join(', or ') : '')
              return <span className="empty-state-subtext">{text}</span>
            })()}
          </div>
        )}
      </div>
  </div>
  )
}

export default React.memo(FeatureSplitPairViewer)
