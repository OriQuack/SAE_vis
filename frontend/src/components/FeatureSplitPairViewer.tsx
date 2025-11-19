import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import { METRIC_DECODER_SIMILARITY } from '../lib/constants'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/tag-constants'
import ActivationExample from './TableActivationExample'
import { TagBadge } from './TableIndicators'
import { extractInterFeaturePositions } from '../lib/activation-utils'
import '../styles/FeatureSplitPairViewer.css'

// ============================================================================
// CONFIGURATION
// ============================================================================

// Easy configuration for developers - change this to adjust sample size
const DISTRIBUTED_SAMPLE_SIZE = 30

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert splitting selection state to tag name for TagBadge
 */
function getSplitTagName(state: 'selected' | 'rejected' | null): string {
  if (state === 'selected') return 'Fragmented'
  if (state === 'rejected') return 'Monosemantic'
  return 'Unsure'
}

/**
 * Build list of all pairs from decoder_similarity data in tableData
 * Returns array of {mainFeatureId, similarFeatureId, decoderSimilarity, pairKey}
 */
function buildPairList(tableData: any): Array<{
  mainFeatureId: number
  similarFeatureId: number
  decoderSimilarity: number
  pairKey: string
  row: FeatureTableRow
  similarRow: FeatureTableRow | null
}> {
  if (!tableData?.rows) return []

  const pairs: Array<{
    mainFeatureId: number
    similarFeatureId: number
    decoderSimilarity: number
    pairKey: string
    row: FeatureTableRow
    similarRow: FeatureTableRow | null
  }> = []

  const rowMap = new Map<number, FeatureTableRow>()
  tableData.rows.forEach((row: FeatureTableRow) => {
    rowMap.set(row.feature_id, row)
  })

  for (const row of tableData.rows) {
    const decoderData = row.decoder_similarity
    if (!decoderData || !Array.isArray(decoderData)) continue

    // Get top 3 similar features
    const topSimilar = decoderData.slice(0, 3)

    for (const similarData of topSimilar) {
      const mainId = row.feature_id
      const similarId = similarData.feature_id

      // Create canonical pair key (smaller ID first)
      const pairKey = mainId < similarId ? `${mainId}-${similarId}` : `${similarId}-${mainId}`

      // Check if we already added this pair (prevent duplicates)
      if (pairs.some(p => p.pairKey === pairKey)) continue

      pairs.push({
        mainFeatureId: mainId,
        similarFeatureId: similarId,
        decoderSimilarity: similarData.decoder_similarity,
        pairKey,
        row,
        similarRow: rowMap.get(similarId) || null
      })
    }
  }

  return pairs
}

/**
 * Build list of distributed pairs from selected feature IDs
 * For each distributed feature, find its top-1 decoder_similarity match
 * Returns array of {mainFeatureId, similarFeatureId, decoderSimilarity, pairKey}
 */
function buildDistributedPairList(
  tableData: any,
  distributedFeatureIds: number[]
): Array<{
  mainFeatureId: number
  similarFeatureId: number
  decoderSimilarity: number
  pairKey: string
  row: FeatureTableRow
  similarRow: FeatureTableRow | null
}> {
  if (!tableData?.rows || !distributedFeatureIds || distributedFeatureIds.length === 0) return []

  const pairs: Array<{
    mainFeatureId: number
    similarFeatureId: number
    decoderSimilarity: number
    pairKey: string
    row: FeatureTableRow
    similarRow: FeatureTableRow | null
  }> = []

  const rowMap = new Map<number, FeatureTableRow>()
  tableData.rows.forEach((row: FeatureTableRow) => {
    rowMap.set(row.feature_id, row)
  })

  // For each distributed feature, get its top-1 decoder_similarity pair
  for (const featureId of distributedFeatureIds) {
    const row = rowMap.get(featureId)
    if (!row) continue

    const decoderData = row.decoder_similarity
    if (!decoderData || !Array.isArray(decoderData) || decoderData.length === 0) continue

    // Get top-1 similar feature (first in the array)
    const topSimilar = decoderData[0]
    const similarId = topSimilar.feature_id

    // Create canonical pair key (smaller ID first)
    const pairKey = featureId < similarId ? `${featureId}-${similarId}` : `${similarId}-${featureId}`

    pairs.push({
      mainFeatureId: featureId,
      similarFeatureId: similarId,
      decoderSimilarity: topSimilar.decoder_similarity,
      pairKey,
      row,
      similarRow: rowMap.get(similarId) || null
    })
  }

  return pairs
}

// ============================================================================
// FEATURE SPLIT PAIR VIEWER COMPONENT
// ============================================================================

interface FeatureSplitPairViewerProps {
  className?: string
}

const FeatureSplitPairViewer: React.FC<FeatureSplitPairViewerProps> = ({ className = '' }) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const togglePairSelection = useVisualizationStore(state => state.togglePairSelection)
  const clearPairSelection = useVisualizationStore(state => state.clearPairSelection)
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const isPairSimilaritySortLoading = useVisualizationStore(state => state.isPairSimilaritySortLoading)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)
  const donePairSelectionStates = useVisualizationStore(state => state.donePairSelectionStates)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)
  const distributedPairFeatureIds = useVisualizationStore(state => state.distributedPairFeatureIds)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchDistributedPairs = useVisualizationStore(state => state.fetchDistributedPairs)
  const clearDistributedPairs = useVisualizationStore(state => state.clearDistributedPairs)

  // Local state for carousel navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  const containerWidth = 800 // Fixed width for now

  // Fetch distributed pairs on mount when tableData is available
  useEffect(() => {
    if (tableData?.rows && tableData.rows.length > 0 && !distributedPairFeatureIds && !isLoadingDistributedPairs) {
      console.log('[FeatureSplitPairViewer] Fetching distributed pairs on mount')
      fetchDistributedPairs(DISTRIBUTED_SAMPLE_SIZE)
    }
  }, [tableData, distributedPairFeatureIds, isLoadingDistributedPairs, fetchDistributedPairs])

  // Clear distributed pairs on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Build pair list from table data - use distributed pairs if available, otherwise all pairs
  const pairList = useMemo(() => {
    if (distributedPairFeatureIds && distributedPairFeatureIds.length > 0) {
      console.log('[FeatureSplitPairViewer] Using distributed pairs:', distributedPairFeatureIds.length)
      return buildDistributedPairList(tableData, distributedPairFeatureIds)
    }
    // Fallback to all pairs (original behavior)
    return buildPairList(tableData)
  }, [tableData, distributedPairFeatureIds])

  // Current pair
  const currentPair = pairList[currentPairIndex] || null

  // Get selection state for current pair
  const pairSelectionState = currentPair ? pairSelectionStates.get(currentPair.pairKey) || null : null

  // Get stage node info (for display)
  const stageNode = useMemo(() => {
    if (!activeStageNodeId) return null
    return leftPanel.sankeyTree.get(activeStageNodeId) || null
  }, [activeStageNodeId, leftPanel.sankeyTree])

  // Navigation handlers
  const goToNextPair = useCallback(() => {
    if (currentPairIndex < pairList.length - 1) {
      setCurrentPairIndex(prev => prev + 1)
    }
  }, [currentPairIndex, pairList.length])

  const goToPreviousPair = useCallback(() => {
    if (currentPairIndex > 0) {
      setCurrentPairIndex(prev => prev - 1)
    }
  }, [currentPairIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPreviousPair()
      } else if (e.key === 'ArrowRight') {
        goToNextPair()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNextPair, goToPreviousPair])

  // Fetch activation examples for current pair when pair changes
  useEffect(() => {
    if (!currentPair) return

    const featureIds = [currentPair.mainFeatureId]
    if (currentPair.similarRow) {
      featureIds.push(currentPair.similarFeatureId)
    }

    fetchActivationExamples(featureIds)
  }, [currentPair, fetchActivationExamples])

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
  }

  // Action handlers
  const handleSortClick = async () => {
    const allPairKeys = pairList.map(p => p.pairKey)
    await sortPairsBySimilarity(allPairKeys)
  }

  const handleTagClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    showSimilarityTaggingPopover(
      'pair',
      { x: rect.left, y: rect.bottom + 8 },
      'Feature Splitting'
    )
  }

  const handleDoneClick = () => {
    // TODO: Implement done logic (likely close overlay or navigate back)
    console.log('Done clicked')
  }

  const handleClearClick = () => {
    clearPairSelection()
  }

  // Calculate selection counts for progress bar
  const selectionCounts = useMemo(() => {
    let fragmented = 0
    let monosemantic = 0
    let unsure = 0

    pairList.forEach(pair => {
      const state = pairSelectionStates.get(pair.pairKey)
      if (state === 'selected') fragmented++
      else if (state === 'rejected') monosemantic++
      else unsure++
    })

    return { fragmented, monosemantic, unsure }
  }, [pairList, pairSelectionStates])

  // Show loading state while fetching distributed pairs
  if (isLoadingDistributedPairs) {
    return (
      <div className={`feature-split-pair-viewer ${className}`}>
        <div className="pair-viewer__empty">Loading distributed sample...</div>
      </div>
    )
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
  const similarActivation = currentPair.similarRow ? activationExamples[currentPair.similarFeatureId] : null

  // Extract inter-feature positions for highlighting (if available)
  const mainFeatureRow = currentPair.row
  const similarFeatureRow = currentPair.similarRow

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

  return (
    <div className={`feature-split-pair-viewer ${className}`}>
      {/* Header */}
      <div className="pair-viewer__header">
        <div className="pair-viewer__title">
          <h3>Feature Splitting Detection</h3>
          <p className="pair-viewer__subtitle">
            Select pairs to tag as Fragmented (similar features) or Monosemantic (distinct features)
          </p>
        </div>

        {/* Stage info */}
        {stageNode && (
          <div className="pair-viewer__stage-info">
            <span className="stage-info__metric">{METRIC_DECODER_SIMILARITY}</span>
            <span className="stage-info__range">{stageNode.rangeLabel}</span>
            <span className="stage-info__count">{stageNode.featureCount} features</span>
          </div>
        )}
      </div>

      {/* Progress and navigation */}
      <div className="pair-viewer__progress">
        <button
          className="progress__nav-button"
          onClick={goToPreviousPair}
          disabled={currentPairIndex === 0}
        >
          ← Previous
        </button>

        <div className="progress__indicator">
          <span className="progress__text">
            Pair {currentPairIndex + 1} / {pairList.length}
          </span>
          <div className="progress__bar">
            <div
              className="progress__bar-fill progress__bar-fill--fragmented"
              style={{ width: `${(selectionCounts.fragmented / pairList.length) * 100}%` }}
            />
            <div
              className="progress__bar-fill progress__bar-fill--monosemantic"
              style={{ width: `${(selectionCounts.monosemantic / pairList.length) * 100}%` }}
            />
          </div>
          <div className="progress__counts">
            <span className="count--fragmented">{selectionCounts.fragmented} Fragmented</span>
            <span className="count--monosemantic">{selectionCounts.monosemantic} Monosemantic</span>
            <span className="count--unsure">{selectionCounts.unsure} Unsure</span>
          </div>
        </div>

        <button
          className="progress__nav-button"
          onClick={goToNextPair}
          disabled={currentPairIndex === pairList.length - 1}
        >
          Next →
        </button>
      </div>

      {/* Selection buttons */}
      <div className="pair-viewer__selection">
        <button
          className={`selection__button selection__button--fragmented ${pairSelectionState === 'selected' ? 'selected' : ''}`}
          onClick={handleFragmentedClick}
        >
          <span className="button__icon">✓</span>
          Fragmented
        </button>
        <button
          className={`selection__button selection__button--monosemantic ${pairSelectionState === 'rejected' ? 'selected' : ''}`}
          onClick={handleMonosemanticClick}
        >
          <span className="button__icon">✓</span>
          Monosemantic
        </button>
        <button
          className={`selection__button selection__button--unsure ${pairSelectionState === null ? 'selected' : ''}`}
          onClick={handleUnsureClick}
        >
          <span className="button__icon">○</span>
          Unsure
        </button>
      </div>

      {/* Pair cards */}
      <div className="pair-viewer__cards">
        {/* Main feature card */}
        <div className="feature-card">
          <div className="feature-card__header">
            <div className="card-header__title">
              <span className="card-title__label">Main Feature</span>
              <span className="card-title__id">#{currentPair.mainFeatureId}</span>
            </div>
            <div className="card-header__badge">
              <TagBadge
                featureId={currentPair.mainFeatureId}
                tagName={getSplitTagName(pairSelectionState)}
                tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
              />
            </div>
          </div>

          <div className="feature-card__info">
            <div className="card-info__label">Decoder Similarity with similar features</div>
          </div>

          {mainActivation && (
            <div className="feature-card__activation">
              <ActivationExample
                examples={mainActivation}
                containerWidth={containerWidth / 2 - 60}
                interFeaturePositions={mainInterFeaturePositions}
              />
            </div>
          )}
        </div>

        {/* Similarity arrow */}
        <div className="pair-viewer__arrow">
          <div className="arrow__similarity">
            {currentPair.decoderSimilarity.toFixed(3)}
          </div>
          <div className="arrow__icon">↔</div>
          <div className="arrow__label">Decoder Similarity</div>
        </div>

        {/* Similar feature card */}
        <div className="feature-card">
          <div className="feature-card__header">
            <div className="card-header__title">
              <span className="card-title__label">Similar Feature</span>
              <span className="card-title__id">#{currentPair.similarFeatureId}</span>
            </div>
          </div>

          {similarFeatureRow && (
            <>
              <div className="feature-card__info">
                <div className="card-info__label">Similar feature based on decoder similarity</div>
              </div>

              {similarActivation && (
                <div className="feature-card__activation">
                  <ActivationExample
                    examples={similarActivation}
                    containerWidth={containerWidth / 2 - 60}
                    interFeaturePositions={similarInterFeaturePositions}
                  />
                </div>
              )}
            </>
          )}

          {!similarFeatureRow && (
            <div className="feature-card__missing">Feature data not available</div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="pair-viewer__actions">
        <button
          className="action__button action__button--sort"
          onClick={handleSortClick}
          disabled={isPairSimilaritySortLoading}
        >
          {isPairSimilaritySortLoading ? 'Sorting...' : 'Sort by Similarity'}
        </button>
        <button
          className="action__button action__button--tag"
          onClick={handleTagClick}
        >
          Tag Automatically
        </button>
        <button
          className="action__button action__button--clear"
          onClick={handleClearClick}
          disabled={pairSelectionStates.size === 0}
        >
          Clear All
        </button>
        <button
          className="action__button action__button--done"
          onClick={handleDoneClick}
          disabled={!donePairSelectionStates}
        >
          Done
        </button>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitPairViewer)
