import React from 'react'
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
// Layout: [Histogram + Indicator] | [Buttons] | [Left list] | [Right list]
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

  // Next stage info for button label
  nextStageName: string
  nextStageNumber: number
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
  allTagged,
  nextStageName,
  nextStageNumber
}) => {
  // Store state for scores and selections
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)


  // Button is enabled when there are items in the boundary lists
  const hasItemsToTag = mode === 'pair'
    ? (leftItems.length > 0 || rightItems.length > 0)
    : (leftFeatures.length > 0 || rightFeatures.length > 0)

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
      {/* Histogram + Bimodality Indicator */}
      <div className="threshold-tagging-panel__histogram-section">
        <TagAutomaticPanel
          mode={mode}
          availablePairs={histogramProps.availablePairs}
          filteredFeatureIds={histogramProps.filteredFeatureIds}
          threshold={histogramProps.threshold}
        />
        <BimodalityIndicator bimodality={tagAutomaticState?.histogramData?.bimodality} />
      </div>

      {/* Buttons */}
      <div className="threshold-tagging-panel__buttons">
        <button
          className="threshold-tagging-panel__apply-button"
          onClick={onApplyTags}
          disabled={!hasItemsToTag}
          title={hasItemsToTag ? 'Apply auto-tags and sort by uncertainty' : `No ${mode === 'pair' ? 'pairs' : 'features'} in threshold regions to tag`}
        >
          Tag by Threshold
        </button>

        <button
          className={`threshold-tagging-panel__tag-all-button ${isBimodal ? 'threshold-tagging-panel__tag-all-button--active' : ''}`}
          onClick={() => onTagAll('left')}
          disabled={!isBimodal}
          title={isBimodal ? `Tag all remaining as ${leftListLabel}` : 'Requires strongly bimodal distribution'}
        >
          Tag Remaining as {leftListLabel}
        </button>

        <button
          className={`threshold-tagging-panel__tag-all-button ${isBimodal ? 'threshold-tagging-panel__tag-all-button--active' : ''}`}
          onClick={() => onTagAll('byBoundary')}
          disabled={!isBimodal}
          title={isBimodal ? 'Tag all remaining by decision boundary' : 'Requires strongly bimodal distribution'}
        >
          Tag Remaining by Decision Boundary
        </button>

        <button
          className="threshold-tagging-panel__next-stage-button"
          onClick={onNextStage}
          disabled={!allTagged}
          title={allTagged ? `Proceed to Stage ${nextStageNumber}: ${nextStageName}` : `Tag all ${mode === 'pair' ? 'pairs' : 'features'} first`}
        >
          Stage {nextStageNumber}: {nextStageName} →
        </button>
      </div>

      {/* Left boundary list (Monosemantic/Need Revision - below reject threshold) */}
      <ScrollableItemList
        width={260}
        height={390}
        badges={[
          { label: leftListLabel, count: mode === 'pair' ? `${leftItems.length.toLocaleString()} pairs` : `${leftFeatures.length.toLocaleString()} features` }
        ]}
        columnHeader={{ label: 'Decision Margin', sortDirection: 'asc' }}
        headerStripe={{ type: 'autoReject', mode: mode }}
        items={(mode === 'pair' ? leftItems : leftFeatures) as PairItemWithMetadata[]}
        currentIndex={activeListSource === 'reject' ? currentIndex : -1}
        isActive={activeListSource === 'reject'}
        renderItem={(item, index) => mode === 'pair'
          ? renderBoundaryItem(item, index, 'left')
          : renderFeatureItem(item as unknown as FeatureItemWithMetadata, index, 'left')
        }
      />

      {/* Right boundary list (Fragmented/Well-Explained - above select threshold) */}
      <ScrollableItemList
        width={260}
        height={390}
        badges={[
          { label: rightListLabel, count: mode === 'pair' ? `${rightItems.length.toLocaleString()} pairs` : `${rightFeatures.length.toLocaleString()} features` }
        ]}
        columnHeader={{ label: 'Decision Margin', sortDirection: 'asc' }}
        headerStripe={{ type: 'expand', mode: mode }}
        items={(mode === 'pair' ? rightItems : rightFeatures) as PairItemWithMetadata[]}
        currentIndex={activeListSource === 'select' ? currentIndex : -1}
        isActive={activeListSource === 'select'}
        renderItem={(item, index) => mode === 'pair'
          ? renderBoundaryItem(item, index, 'right')
          : renderFeatureItem(item as unknown as FeatureItemWithMetadata, index, 'right')
        }
      />
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
