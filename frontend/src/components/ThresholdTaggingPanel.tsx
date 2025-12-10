import React from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import TagAutomaticPanel from './TagAutomaticPanel'
import ScrollableItemList from './ScrollableItemList'
import BimodalityIndicator from './ModalityIndicator'
import { TagBadge } from './Indicators'
import { getTagColor } from '../lib/tag-system'
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
  onListItemClick: (listType: 'left' | 'right', index: number) => void

  // State from parent
  activeListSource: 'all' | 'reject' | 'select'
  currentIndex: number
  isBimodal: boolean
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
  isBimodal
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

  // Button is enabled when there are items in the boundary lists
  const hasItemsToTag = mode === 'pair'
    ? (leftItems.length > 0 || rightItems.length > 0)
    : (leftFeatures.length > 0 || rightFeatures.length > 0)

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

    return (
      <div className="pair-item-with-score">
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

    return (
      <div className="pair-item-with-score">
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

  return (
    <div className="threshold-tagging-panel">
      {/* Histogram */}
      <div className="threshold-tagging-panel__histogram-section">
        <TagAutomaticPanel
          mode={mode}
          availablePairs={histogramProps.availablePairs}
          filteredFeatureIds={histogramProps.filteredFeatureIds}
          threshold={histogramProps.threshold}
        />
      </div>

      {/* Buttons section with modality indicator above */}
      <div className="threshold-tagging-panel__buttons-section">
        <BimodalityIndicator bimodality={tagAutomaticState?.histogramData?.bimodality} />
        <div className="threshold-tagging-panel__buttons">
          {/* Button 1: Tag by Threshold */}
          <div className="action-button-item">
            <button
              className="action-button action-button--primary"
              onClick={onApplyTags}
              disabled={!hasItemsToTag}
              title={hasItemsToTag ? 'Apply auto-tags and sort by uncertainty' : `No ${mode === 'pair' ? 'pairs' : 'features'} in threshold regions to tag`}
            >
              Tag by Threshold
            </button>
            <div className="action-button__desc">
              Tag {mode === 'pair' ? 'pairs' : 'features'} in stripe regions using threshold values
            </div>
            <div className="action-button__legend">
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': leftTagColor } as React.CSSProperties} />
                <span className="action-button__legend-count">{leftCount}</span>
              </span>
              <span className="action-button__legend-arrow">→</span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: leftTagColor }} />
                <span className="action-button__legend-count">{leftCount}</span>
              </span>
              <span style={{ margin: '0 4px', color: '#d1d5db' }}>|</span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch action-button__legend-swatch--striped" style={{ '--swatch-color': rightTagColor } as React.CSSProperties} />
                <span className="action-button__legend-count">{rightCount}</span>
              </span>
              <span className="action-button__legend-arrow">→</span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: rightTagColor }} />
                <span className="action-button__legend-count">{rightCount}</span>
              </span>
            </div>
          </div>

          {/* Button 2: Tag Remaining as Left */}
          <div className="action-button-item">
            <button
              className={`action-button ${isBimodal ? 'action-button--active' : ''}`}
              onClick={() => onTagAll('left')}
              disabled={!isBimodal}
              title={isBimodal ? `Tag all remaining as ${leftListLabel}` : 'Requires strongly bimodal distribution'}
            >
              Tag Remaining as {leftListLabel}
            </button>
            <div className="action-button__desc">
              Assign all untagged to {leftListLabel}
            </div>
            <div className="action-button__legend">
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                <span className="action-button__legend-count">{remainingCount}</span>
              </span>
              <span className="action-button__legend-arrow">→</span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: leftTagColor }} />
                <span className="action-button__legend-count">{remainingCount}</span>
              </span>
            </div>
          </div>

          {/* Button 3: Tag Remaining by Boundary */}
          <div className="action-button-item">
            <button
              className={`action-button ${isBimodal ? 'action-button--active' : ''}`}
              onClick={() => onTagAll('byBoundary')}
              disabled={!isBimodal}
              title={isBimodal ? 'Tag all remaining by decision boundary' : 'Requires strongly bimodal distribution'}
            >
              Tag Remaining by Boundary
            </button>
            <div className="action-button__desc">
              Split remaining {mode === 'pair' ? 'pairs' : 'features'} by SVM decision boundary at 0.0
            </div>
            <div className="action-button__legend">
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: '#e0e0e0' }} />
                <span className="action-button__legend-count">{remainingCount}</span>
              </span>
              <span className="action-button__legend-arrow">→</span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: leftTagColor }} />
                <span className="action-button__legend-count">{boundaryTagCounts.left}</span>
              </span>
              <span className="action-button__legend-item">
                <span className="action-button__legend-swatch" style={{ backgroundColor: rightTagColor }} />
                <span className="action-button__legend-count">{boundaryTagCounts.right}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Boundary lists wrapper with subtitle */}
      <div className="threshold-tagging-panel__lists-section">
        <h4 className="subheader">
          {mode === 'pair' ? 'Boundary Feature Pairs' : 'Boundary Features'}
        </h4>
        <div className="threshold-tagging-panel__lists-container">
          {/* Left boundary list (Monosemantic/Need Revision - below reject threshold) */}
          <ScrollableItemList
            variant="boundary"
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
            variant="boundary"
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
      </div>
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
