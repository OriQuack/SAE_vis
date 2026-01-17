import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import ScrollableItemList from './ScrollableItemList'
import ConvergenceIndicator from './ConvergenceIndicator'
import BatchTaggingPanel from './BatchTaggingPanel'
import { TagBadge } from './Indicators'
import { getTagColor } from '../lib/tag-system'
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

export interface ThresholdTaggingPanelProps {
  // Mode for DecisionMarginHistogram
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

  // Whether current sort matches template (default) sort
  // When false, selection highlight is disabled in boundary lists
  isTemplateSort?: boolean

  // Sort direction from parent (synced with StageAccordionList)
  sortDirection?: 'asc' | 'desc'
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
  isTemplateSort = true,
  sortDirection = 'asc',
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
        <DecisionMarginHistogram
          mode={mode}
          availablePairs={histogramProps.availablePairs}
          filteredFeatureIds={histogramProps.filteredFeatureIds}
          threshold={histogramProps.threshold}
        />
      </div>

      {/* Middle section: Flip Rate (top) + Boundary lists (bottom) */}
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
              columnHeader={{
                label: '|Decision Margin|',
                sortDirection: sortDirection
              }}
              items={sortedLeftItems as PairItemWithMetadata[]}
              currentIndex={activeListSource === 'reject' ? currentIndex : -1}
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
                { label: rightListLabel, count: mode === 'pair' ? `${rightItems.length.toLocaleString()} pairs` : `${rightFeatures.length.toLocaleString()} features` }
              ]}
              columnHeader={{
                label: '|Decision Margin|',
                sortDirection: sortDirection
              }}
              items={sortedRightItems as PairItemWithMetadata[]}
              currentIndex={activeListSource === 'select' ? currentIndex : -1}
              isActive={activeListSource === 'select'}
              isTemplateSort={isTemplateSort}
              renderItem={(item, index) => mode === 'pair'
                ? renderBoundaryItem(item, index, 'right')
                : renderFeatureItem(item as unknown as FeatureItemWithMetadata, index, 'right')
              }
            />
          </div>
        </div>
      </div>

      {/* Buttons section on the right */}
      <div className="threshold-tagging-panel__buttons-section">
        <h4 className="subheader">Batch Tagging</h4>
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
          showPlaceholder={false}
          onApplyThreshold={onApplyTags}
          thresholdCounts={{ left: leftCount, right: rightCount }}
          onTagAllAsCategory={() => onTagAll('left')}
          onTagAllUnsure={() => onTagAll('byBoundary')}
        />
      </div>
    </div>
  )
}

export default React.memo(ThresholdTaggingPanel)
