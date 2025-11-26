import React, { useState, useRef, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import ActivationExample from './ActivationExample'
import { UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { extractInterFeaturePositions } from '../lib/activation-utils'
import { getBestExplanation } from '../lib/table-utils'
import '../styles/FeatureSplitPairViewer.css'

// ============================================================================
// EXPLANATION WITH POPOVER - Inline component for truncated text with hover
// ============================================================================
interface ExplanationWithPopoverProps {
  text: string
}

const ExplanationWithPopover: React.FC<ExplanationWithPopoverProps> = ({ text }) => {
  const [showPopover, setShowPopover] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(() => {
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
  }, [])

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
}

const FeatureSplitPairViewer: React.FC<FeatureSplitPairViewerProps> = ({
  className = '',
  currentPairIndex,
  pairList,
  currentPair: currentPairProp,
  onNavigatePrevious,
  onNavigateNext
}) => {
  // Store state
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const togglePairSelection = useVisualizationStore(state => state.togglePairSelection)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const tableData = useVisualizationStore(state => state.tableData)

  const containerWidth = 1400 // Fixed width for full-width activation examples

  // Current pair - use prop if provided, otherwise compute from list
  const currentPair = currentPairProp !== undefined ? currentPairProp : (pairList[currentPairIndex] || null)

  // Get selection state for current pair
  const pairSelectionState = currentPair ? pairSelectionStates.get(currentPair.pairKey) || null : null

  // NOTE: Activation examples are pre-fetched by parent (FeatureSplitView) for the entire page
  // This component just reads from the activationExamples cache


  // Selection handlers
  const handleFragmentedClick = () => {
    if (!currentPair) return

    // If already selected (Fragmented), toggle to null (Unsure)
    if (pairSelectionState === 'selected') {
      // Toggle off by calling twice (null -> selected -> rejected -> null)
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
    } else {
      // Set to selected
      if (pairSelectionState === null) {
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      } else if (pairSelectionState === 'rejected') {
        // rejected -> null -> selected
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
        togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
      }
      // Auto-advance to next pair
      if (onNavigateNext && currentPairIndex < pairList.length - 1) {
        setTimeout(() => onNavigateNext(), 150)
      }
    }
  }

  const handleMonosemanticClick = () => {
    if (!currentPair) return

    // If already rejected (Monosemantic), toggle to null (Unsure)
    if (pairSelectionState === 'rejected') {
      togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
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
      // Auto-advance to next pair
      if (onNavigateNext && currentPairIndex < pairList.length - 1) {
        setTimeout(() => onNavigateNext(), 150)
      }
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
    // Auto-advance to next pair
    if (onNavigateNext && currentPairIndex < pairList.length - 1) {
      setTimeout(() => onNavigateNext(), 150)
    }
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
    <div className={`feature-split-pair-viewer ${className}`}>
      {/* Main content area */}
      <div className="pair-viewer__main">
        {/* Compact header with pair info and legend */}
        <div className="pair-viewer__header">
        {/* Decoder Similarity */}
        <div className="pair-info__similarity">
          <span className="similarity__label">Decoder Similarity:</span>
          <span className="similarity__value">
            {currentPair.decoderSimilarity !== null ? currentPair.decoderSimilarity.toFixed(3) : 'N/A'}
          </span>
        </div>

        {/* Flexible gap to push legend to the right */}
        <div style={{ flex: 1 }}></div>

        {/* Legend - aligned right */}
        <div className="pair-viewer__legend">
          <div className="legend-item">
            <span className="legend-sample legend-sample--activation">token</span>
            <span className="legend-label">Activation Strength</span>
          </div>
          <div className="legend-item">
            <span className="legend-sample legend-sample--max">token</span>
            <span className="legend-label">Max Activation</span>
          </div>
          <div className="legend-item">
            <span className="legend-sample legend-sample--intra">token</span>
            <span className="legend-label">Within-Feature Pattern</span>
          </div>
          <div className="legend-item">
            <span className="legend-sample legend-sample--inter">token</span>
            <span className="legend-label">Cross-Feature Pattern</span>
          </div>
        </div>
      </div>

      {/* Activation examples side-by-side */}
      <div className="pair-viewer__content">
        {/* Main feature activation */}
        <div className="activation-panel activation-panel--main">
          <div className="activation-panel__header">
            <div className="panel-header__content">
              <span className="panel-header__id">#{currentPair.mainFeatureId}</span>
              {mainExplanation && (
                <ExplanationWithPopover text={mainExplanation} />
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
                <ExplanationWithPopover text={similarExplanation} />
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
        <button
          className={`selection__button selection__button--unsure ${pairSelectionState === null ? 'selected' : ''}`}
          onClick={handleUnsureClick}
          style={{
            '--tag-color': unsureColor
          } as React.CSSProperties}
        >
          {pairSelectionState === null && <span className="button__icon">○</span>}
          Unsure
        </button>
        <button
          className={`selection__button selection__button--monosemantic ${pairSelectionState === 'rejected' ? 'selected' : ''}`}
          onClick={handleMonosemanticClick}
          style={{
            '--tag-color': monosemanticColor
          } as React.CSSProperties}
        >
          {pairSelectionState === 'rejected' && <span className="button__icon">✓</span>}
          Monosemantic
        </button>
        <button
          className={`selection__button selection__button--fragmented ${pairSelectionState === 'selected' ? 'selected' : ''}`}
          onClick={handleFragmentedClick}
          style={{
            '--tag-color': fragmentedColor
          } as React.CSSProperties}
        >
          {pairSelectionState === 'selected' && <span className="button__icon">✓</span>}
          Fragmented
        </button>

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
