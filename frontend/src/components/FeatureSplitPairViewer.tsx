import React, { useState, useRef, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import ActivationExample from './ActivationExamplePanel'
import ScrollableItemList from './ScrollableItemList'
import { TagBadge, TagButton } from './Indicators'
import { UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { extractInterFeaturePositions } from '../lib/activation-utils'
import { getBestExplanation } from '../lib/table-data-utils'
import { useTaggingNavigation, type ListSource } from '../lib/tagging-hooks'
import '../styles/FeatureSplitPairViewer.css'

// ============================================================================
// EXPLANATION WITH POPOVER - Inline component for truncated text with hover
// ============================================================================
interface ExplanationWithPopoverProps {
  text: string
  hasNoActivations?: boolean  // If true, show "No Explanation available" instead
}

const ExplanationWithPopover: React.FC<ExplanationWithPopoverProps> = ({ text, hasNoActivations = false }) => {
  const [showPopover, setShowPopover] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // If feature has no activations, any explanation is hallucinated
  if (hasNoActivations) {
    return <span className="explanation--unavailable">No Explanation available</span>
  }

  // Check for hallucinated/placeholder explanations from Neuronpedia
  if (text.includes('No explanation available from Neuronpedia')) {
    return <span className="explanation--unavailable">No Explanation available</span>
  }

  const handleMouseEnter = () => {
    if (!containerRef.current) return
    // Get the parent header element for full width
    const header = containerRef.current.closest('.panel-header__content')
    if (!header) return
    const rect = header.getBoundingClientRect()

    // Position popover over the header, aligned right
    setPopoverStyle({
      position: 'fixed',
      right: `${window.innerWidth - rect.right}px`,
      top: `${rect.top}px`,
      maxWidth: `${rect.width}px`,
      zIndex: 10000
    })
    setShowPopover(true)
  }

  return (
    <div
      ref={containerRef}
      className="panel-header__explanation"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowPopover(false)}
    >
      {text}
      {showPopover && (
        <div className="explanation-popover" style={popoverStyle}>
          {text}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FEATURE SPLIT PAIR VIEWER COMPONENT
// ============================================================================
// Displays activation examples for the current pair
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
  activeListSource?: ListSource  // Current active list source for auto-advance logic
  sortMode?: 'default' | 'decisionMargin'  // Current sort mode
  isLoading?: boolean  // Whether similarity scores are being calculated
  isTemplateSort?: boolean  // Whether current sort matches template (default) sort
  onResetToFirstPair?: () => void  // Callback to reset to page 1, first pair

  // Preview pair keys (items in threshold regions that will be auto-tagged)
  previewRejectKeys?: Set<string>  // Will be rejected → Monosemantic
  previewSelectKeys?: Set<string>  // Will be selected → Fragmented

  // ScrollableItemList props for "All Pairs" list
  allPairsListProps?: {
    currentPagePairs: Array<PairData>
    totalPairCount: number
    isActive: boolean
    columnHeaderProps: {
      label: string
      sortDirection: 'asc' | 'desc'
      onClick: () => void
    }
    getDisplayScore: (item: PairData) => number | undefined
    currentPage: number
    totalPages: number
    onItemClick: (index: number) => void
    onPreviousPage: () => void
    onNextPage: () => void
    isTemplateSort?: boolean
  }
}

const FeatureSplitPairViewer: React.FC<FeatureSplitPairViewerProps> = ({
  className = '',
  currentPairIndex,
  pairList,
  currentPair: currentPairProp,
  onNavigatePrevious,
  onNavigateNext,
  activeListSource = 'all',
  sortMode = 'default',
  isLoading = false,
  isTemplateSort = true,
  onResetToFirstPair,
  previewRejectKeys,
  previewSelectKeys,
  allPairsListProps
}) => {
  // Constants - must match FeatureSplitView.tsx
  const PAIRS_PER_PAGE = 10
  // Store state
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const togglePairSelection = useVisualizationStore(state => state.togglePairSelection)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const tableData = useVisualizationStore(state => state.tableData)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)

  // Container width for activation examples (responsive to resize)
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

  // NOTE: Activation examples are pre-fetched by parent (FeatureSplitView) for the entire page
  // This component just reads from the activationExamples cache

  // Post-tagging navigation hook
  const { handlePostTagNavigation, handlePostUnsureNavigation } = useTaggingNavigation({
    activeListSource,
    sortMode,
    currentIndex: currentPairIndex,
    listLength: pairList.length,
    onNavigateNext: onNavigateNext || (() => {}),
    onResetToFirst: onResetToFirstPair || (() => {}),
    isHistogramReady: !!tagAutomaticState?.histogramData
  })

  // Selection handlers
  const handleFragmentedClick = () => {
    if (!currentPair) return

    // If already selected (Fragmented), keep tag and navigate
    if (pairSelectionState === 'selected') {
      // Keep the tag, just navigate
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
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }

  const handleMonosemanticClick = () => {
    if (!currentPair) return

    // If already rejected (Monosemantic), keep tag and navigate
    if (pairSelectionState === 'rejected') {
      // Keep the tag, just navigate
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
      // Use centralized navigation logic
      handlePostTagNavigation()
    }
  }

  const handleUnsureClick = () => {
    if (!currentPair) return

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

  // Show empty state if no pairs available
  if (!currentPair) {
    return (
      <div className={`feature-split-pair-viewer ${className}`}>
        <div className="pair-viewer__empty">No pairs available</div>
      </div>
    )
  }

  // Get activation data
  const mainActivation = activationExamples[currentPair.mainFeatureId]

  // TEMPORARY FIX: We have 16k features but only ~7500 in tableData
  // However, we DO have activation examples for features > 7500
  // So we get activation data directly, even if similarRow doesn't exist
  // TODO: Remove this workaround when full feature data is available
  const similarActivation = activationExamples[currentPair.similarFeatureId] || null

  // Extract inter-feature positions for highlighting (if available)
  const mainFeatureRow = currentPair.row
  const similarFeatureRow = currentPair.similarRow

  // Get best explanations for each feature
  const mainExplanation = getBestExplanation(mainFeatureRow, tableData?.global_stats)
  const similarExplanation = getBestExplanation(similarFeatureRow, tableData?.global_stats)

  let mainInterFeaturePositions = undefined
  let similarInterFeaturePositions = undefined

  if (mainFeatureRow && similarFeatureRow) {
    const decoderData = mainFeatureRow.decoder_similarity
    if (decoderData && Array.isArray(decoderData)) {
      const similarData = decoderData.find(d => d.feature_id === currentPair.similarFeatureId)
      if (similarData?.inter_feature_similarity) {
        const extracted = extractInterFeaturePositions(similarData.inter_feature_similarity)
        if (extracted) {
          mainInterFeaturePositions = {
            type: extracted.type!,
            positions: extracted.mainPositions
          }
          similarInterFeaturePositions = {
            type: extracted.type!,
            positions: extracted.similarPositions
          }
        }
      }
    }
  }

  // Get tag colors for buttons
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'
  const monosemanticColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY  // Gray for unsure state

  return (
    <div className={`feature-split-pair-viewer ${className} ${allPairsListProps ? 'feature-split-pair-viewer--with-list' : ''}`}>
      {/* All Pairs list (optional) */}
      {allPairsListProps && (
        <ScrollableItemList
          variant="allPairs"
          badges={[
            { label: 'All Pairs', count: `${allPairsListProps.totalPairCount} pairs` }
          ]}
          columnHeader={allPairsListProps.columnHeaderProps}
          items={allPairsListProps.currentPagePairs}
          currentIndex={allPairsListProps.isActive ? currentPairIndex % PAIRS_PER_PAGE : -1}
          isActive={allPairsListProps.isActive}
          isTemplateSort={allPairsListProps.isTemplateSort ?? isTemplateSort}
          highlightPredicate={(pair: PairData, currentPairItem: PairData | null) =>
            !!currentPairItem && pair.clusterId === currentPairItem.clusterId
          }
          sortConfig={{ getDisplayScore: allPairsListProps.getDisplayScore }}
          renderItem={(pair: PairData, index: number) => {
            const selectionState = pairSelectionStates.get(pair.pairKey) || null
            const isAutoSource = pairSelectionSources.get(pair.pairKey) === 'auto'
            const inPreviewReject = previewRejectKeys?.has(pair.pairKey)
            const inPreviewSelect = previewSelectKeys?.has(pair.pairKey)

            // Determine tag name based on selection state OR preview state
            let tagName = 'Unsure'
            if (selectionState === 'selected') {
              tagName = 'Fragmented'
            } else if (selectionState === 'rejected') {
              tagName = 'Monosemantic'
            } else if (inPreviewSelect) {
              // Preview: will be selected → Fragmented
              tagName = 'Fragmented'
            } else if (inPreviewReject) {
              // Preview: will be rejected → Monosemantic
              tagName = 'Monosemantic'
            }

            // Format pair ID as string for TagBadge
            const pairIdString = `${pair.mainFeatureId}-${pair.similarFeatureId}`

            // Show stripe for: already auto-tagged OR in preview threshold regions
            const isAutoOrPreview = isAutoSource || inPreviewReject || inPreviewSelect

            return (
              <TagBadge
                featureId={pairIdString}
                tagName={tagName}
                tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                onClick={() => allPairsListProps.onItemClick(index)}
                fullWidth={true}
                isPair={true}
                isAuto={isAutoOrPreview}
              />
            )
          }}
          pageNavigation={{
            currentPage: allPairsListProps.currentPage,
            totalPages: allPairsListProps.totalPages,
            onPreviousPage: allPairsListProps.onPreviousPage,
            onNextPage: allPairsListProps.onNextPage
          }}
        />
      )}

      {/* Main content area */}
      <div className="pair-viewer__main" ref={mainContainerRef}>
        {/* Header row */}
        <div className="pair-viewer__header">
          {/* Subheader */}
          <h4 className="subheader">Activation Examples</h4>

          {/* Feature IDs */}
          <div className="pair-info__ids">
            <span className="panel-header__id">#{currentPair.mainFeatureId}</span>
            <span className="panel-header__id">#{currentPair.similarFeatureId}</span>
          </div>

          {/* Decoder Similarity */}
          <div className="pair-info__similarity">
            <span className="similarity__label">Decoder Similarity:</span>
            <span className="similarity__value">
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
          <div className="legend-item">
            <span className="legend-sample legend-sample--intra">token</span>:
            <span className="legend-label">Feature-Specific Pattern</span>
          </div>
          <div className="legend-item">
            <span className="legend-sample legend-sample--inter">token</span>:
            <span className="legend-label">Shared Pattern</span>
          </div>
        </div>

      {/* Activation examples side-by-side */}
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
                interFeaturePositions={mainInterFeaturePositions}
                numQuantiles={4}
                examplesPerQuantile={[2, 2, 2, 2]}
                disableHover={true}
              />
            </div>
          ) : (
            <div className="activation-panel__loading">Loading activation examples...</div>
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
                interFeaturePositions={similarInterFeaturePositions}
                numQuantiles={4}
                examplesPerQuantile={[2, 2, 2, 2]}
                disableHover={true}
              />
            </div>
          ) : (
            <div className="activation-panel__loading">Loading activation examples...</div>
          )}
        </div>
      </div>

      {/* Floating control panel at bottom */}
      <div className="pair-viewer__floating-controls">
        {/* Previous button */}
        <button
          className="nav__button"
          onClick={onNavigatePrevious}
          disabled={currentPairIndex === 0 || !onNavigatePrevious}
        >
          ← Prev
        </button>

        {/* Selection buttons */}
        <TagButton
          label="Unsure"
          variant="unsure"
          color={unsureColor}
          isSelected={pairSelectionState === null}
          onClick={handleUnsureClick}
        />
        <TagButton
          label="Monosemantic"
          variant="monosemantic"
          color={monosemanticColor}
          isSelected={pairSelectionState === 'rejected'}
          onClick={handleMonosemanticClick}
        />
        <TagButton
          label="Fragmented"
          variant="fragmented"
          color={fragmentedColor}
          isSelected={pairSelectionState === 'selected'}
          onClick={handleFragmentedClick}
        />

        {/* Next button */}
        <button
          className="nav__button"
          onClick={onNavigateNext}
          disabled={currentPairIndex >= pairList.length - 1 || !onNavigateNext}
        >
          Next →
        </button>
      </div>
    </div>
  </div>
  )
}

export default React.memo(FeatureSplitPairViewer)
