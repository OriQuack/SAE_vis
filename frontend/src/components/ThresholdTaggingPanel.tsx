import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import TagAutomaticPanel from './TagAutomaticPanel'
import ScrollableItemList from './ScrollableItemList'
import BimodalityIndicator from './BimodalityIndicator'
import { TagBadge } from './TableIndicators'
import '../styles/ThresholdTaggingPanel.css'

// ============================================================================
// THRESHOLD TAGGING PANEL - Reusable bottom row for tagging workflows
// ============================================================================
// Layout: [Histogram] | [Buttons] | [Left boundary list] | [Right boundary list]
// Used by: FeatureSplitView (and future stages)

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

export interface ThresholdTaggingPanelProps {
  // Mode for TagAutomaticPanel
  mode: 'feature' | 'pair'
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
  onNextStage: () => void
  onListItemClick: (listType: 'left' | 'right', index: number) => void

  // State from parent
  activeListSource: 'all' | 'reject' | 'select'
  currentIndex: number
  isBimodal: boolean
  allTagged: boolean
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
  onNextStage,
  onListItemClick,
  activeListSource,
  currentIndex,
  isBimodal,
  allTagged
}) => {
  // Store state for scores and selections
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)

  // Tag All popover state
  const [showTagAllPopover, setShowTagAllPopover] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const tagAllButtonRef = useRef<HTMLButtonElement>(null)
  const tagAllPopoverRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    if (!showTagAllPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagAllPopoverRef.current &&
        !tagAllPopoverRef.current.contains(e.target as Node) &&
        tagAllButtonRef.current &&
        !tagAllButtonRef.current.contains(e.target as Node)
      ) {
        setShowTagAllPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTagAllPopover])

  // Button is enabled when there are items in the boundary lists
  const hasItemsToTag = mode === 'pair'
    ? (leftItems.length > 0 || rightItems.length > 0)
    : (leftFeatures.length > 0 || rightFeatures.length > 0)

  // Handle Tag All button click
  const handleTagAllClick = () => {
    if (tagAllButtonRef.current) {
      const rect = tagAllButtonRef.current.getBoundingClientRect()
      // Position above the button since panel is at the bottom of the screen
      setPopoverPosition({
        top: rect.top - 6,
        left: rect.left + rect.width / 2
      })
    }
    setShowTagAllPopover(true)
  }

  // Render item for pair boundary lists
  const renderBoundaryItem = (item: PairItemWithMetadata, index: number, listType: 'left' | 'right') => {
    const selectionState = pairSelectionStates.get(item.pairKey)
    const score = pairSimilarityScores.get(item.pairKey)

    let tagName = 'Unsure'
    if (selectionState === 'selected') {
      tagName = rightListLabel  // Fragmented
    } else if (selectionState === 'rejected') {
      tagName = leftListLabel   // Monosemantic
    }

    const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

    return (
      <div className="pair-item-with-score">
        <TagBadge
          featureId={pairIdString as any}
          tagName={tagName}
          tagCategoryId={tagCategoryId}
          onClick={() => onListItemClick(listType, index)}
          fullWidth={true}
        />
        {score !== undefined && (
          <span className="pair-similarity-score">{score.toFixed(2)}</span>
        )}
      </div>
    )
  }

  // Render item for feature boundary lists
  const renderFeatureItem = (item: FeatureItemWithMetadata, index: number, listType: 'left' | 'right') => {
    const selectionState = featureSelectionStates.get(item.featureId)
    const score = similarityScores.get(item.featureId)

    let tagName = 'Unsure'
    if (selectionState === 'selected') {
      tagName = rightListLabel  // Well-Explained
    } else if (selectionState === 'rejected') {
      tagName = leftListLabel   // Need Revision
    }

    return (
      <div className="pair-item-with-score">
        <TagBadge
          featureId={item.featureId}
          tagName={tagName}
          tagCategoryId={tagCategoryId}
          onClick={() => onListItemClick(listType, index)}
          fullWidth={true}
        />
        {score !== undefined && (
          <span className="pair-similarity-score">{score.toFixed(2)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="threshold-tagging-panel">
      {/* Left: Histogram */}
      <TagAutomaticPanel
        mode={mode}
        availablePairs={histogramProps.availablePairs}
        filteredFeatureIds={histogramProps.filteredFeatureIds}
        threshold={histogramProps.threshold}
      />

      {/* Button container - between histogram and boundary lists */}
      <div className="threshold-tagging-panel__buttons">
        {/* Apply Threshold button */}
        <button
          className="threshold-tagging-panel__apply-button"
          onClick={onApplyTags}
          disabled={!hasItemsToTag}
          title={hasItemsToTag ? 'Apply auto-tags and sort by uncertainty' : `No ${mode === 'pair' ? 'pairs' : 'features'} in threshold regions to tag`}
        >
          Apply Threshold
        </button>

        {/* Bimodality Indicator + Tag All (visually connected) */}
        <div className={`threshold-tagging-panel__bimodal-group ${isBimodal ? 'threshold-tagging-panel__bimodal-group--active' : ''}`}>
          <BimodalityIndicator bimodality={tagAutomaticState?.histogramData?.bimodality} />
          <button
            ref={tagAllButtonRef}
            className={`threshold-tagging-panel__tag-all-button ${isBimodal ? 'threshold-tagging-panel__tag-all-button--active' : ''}`}
            onClick={handleTagAllClick}
            disabled={!isBimodal}
            title={isBimodal ? 'Tag all remaining pairs and proceed to next stage' : 'Requires strongly bimodal distribution'}
          >
            Tag All
          </button>
          {/* Tag All popover - rendered via portal */}
          {showTagAllPopover && popoverPosition && createPortal(
            <div
              ref={tagAllPopoverRef}
              className="tag-all-popover"
              style={{ top: popoverPosition.top, left: popoverPosition.left }}
            >
              <div className="tag-all-popover__title">Tag remaining {mode === 'pair' ? 'pairs' : 'features'}:</div>
              <button
                className="tag-all-popover__option tag-all-popover__option--default"
                onClick={() => {
                  onTagAll('left')
                  setShowTagAllPopover(false)
                }}
              >
                As {leftListLabel}
              </button>
              <button
                className="tag-all-popover__option"
                onClick={() => {
                  onTagAll('byBoundary')
                  setShowTagAllPopover(false)
                }}
              >
                By Decision Boundary
              </button>
              <button
                className="tag-all-popover__cancel"
                onClick={() => setShowTagAllPopover(false)}
              >
                Cancel
              </button>
            </div>,
            document.body
          )}
        </div>

        {/* Next Stage button */}
        <button
          className="threshold-tagging-panel__next-stage-button"
          onClick={onNextStage}
          disabled={!allTagged}
          title={allTagged ? 'Proceed to next stage' : `Tag all ${mode === 'pair' ? 'pairs' : 'features'} first`}
        >
          Next Stage →
        </button>
      </div>

      {/* Left boundary list (Monosemantic/Need Revision - below reject threshold) */}
      <ScrollableItemList
        width={260}
        badges={[
          { label: leftListLabel, count: mode === 'pair' ? `${leftItems.length} pairs` : `${leftFeatures.length} features` }
        ]}
        columnHeader={{ label: 'Confidence', sortDirection: 'asc' }}
        headerStripe={{ type: 'autoReject', mode: mode }}
        items={mode === 'pair' ? leftItems : leftFeatures}
        currentIndex={activeListSource === 'reject' ? currentIndex : -1}
        isActive={activeListSource === 'reject'}
        renderItem={(item, index) => mode === 'pair'
          ? renderBoundaryItem(item as PairItemWithMetadata, index, 'left')
          : renderFeatureItem(item as FeatureItemWithMetadata, index, 'left')
        }
      />

      {/* Right boundary list (Fragmented/Well-Explained - above select threshold) */}
      <ScrollableItemList
        width={260}
        badges={[
          { label: rightListLabel, count: mode === 'pair' ? `${rightItems.length} pairs` : `${rightFeatures.length} features` }
        ]}
        columnHeader={{ label: 'Confidence', sortDirection: 'asc' }}
        headerStripe={{ type: 'expand', mode: mode }}
        items={mode === 'pair' ? rightItems : rightFeatures}
        currentIndex={activeListSource === 'select' ? currentIndex : -1}
        isActive={activeListSource === 'select'}
        renderItem={(item, index) => mode === 'pair'
          ? renderBoundaryItem(item as PairItemWithMetadata, index, 'right')
          : renderFeatureItem(item as FeatureItemWithMetadata, index, 'right')
        }
      />
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
