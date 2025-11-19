import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import ActivationExample from './ActivationExample'
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
        decoderSimilarity: similarData.cosine_similarity,
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
      decoderSimilarity: topSimilar.cosine_similarity,
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
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const isPairSimilaritySortLoading = useVisualizationStore(state => state.isPairSimilaritySortLoading)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)
  const distributedPairFeatureIds = useVisualizationStore(state => state.distributedPairFeatureIds)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchDistributedPairs = useVisualizationStore(state => (state as any).fetchDistributedPairs)
  const clearDistributedPairs = useVisualizationStore(state => (state as any).clearDistributedPairs)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)

  // Local state for carousel navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  const containerWidth = 1400 // Fixed width for full-width activation examples

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const features = getSelectedNodeFeatures()
    console.log('[FeatureSplitPairViewer] Selected feature IDs:', features ? features.size : 0)
    return features
  }, [getSelectedNodeFeatures, selectedSegment, leftPanel])

  // Filter tableData to only include selected features
  const filteredTableData = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) {
      console.log('[FeatureSplitPairViewer] No filtered data:', {
        hasTableData: !!tableData,
        hasFeatures: !!tableData?.features,
        selectedCount: selectedFeatureIds?.size || 0
      })
      return null
    }

    const filteredFeatures = tableData.features.filter((row: FeatureTableRow) => selectedFeatureIds.has(row.feature_id))
    console.log('[FeatureSplitPairViewer] Filtered table data:', {
      totalFeatures: tableData.features.length,
      selectedFeatures: selectedFeatureIds.size,
      filteredFeatures: filteredFeatures.length
    })

    return {
      rows: filteredFeatures
    }
  }, [tableData, selectedFeatureIds])

  // Fetch distributed pairs on mount when filteredTableData is available
  useEffect(() => {
    if (filteredTableData?.rows && filteredTableData.rows.length > 0 && !distributedPairFeatureIds && !isLoadingDistributedPairs && selectedFeatureIds) {
      console.log('[FeatureSplitPairViewer] Fetching distributed pairs on mount:', {
        filteredFeatures: filteredTableData.rows.length,
        selectedFeatures: selectedFeatureIds.size,
        requestingSamples: DISTRIBUTED_SAMPLE_SIZE
      })
      fetchDistributedPairs(DISTRIBUTED_SAMPLE_SIZE, selectedFeatureIds)
    }
  }, [filteredTableData, distributedPairFeatureIds, isLoadingDistributedPairs, fetchDistributedPairs, selectedFeatureIds])

  // Clear distributed pairs on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Build pair list from filtered table data - use distributed pairs if available, otherwise all pairs
  const pairList = useMemo(() => {
    if (!filteredTableData) {
      console.log('[FeatureSplitPairViewer] No filtered table data available')
      return []
    }

    if (distributedPairFeatureIds && distributedPairFeatureIds.length > 0) {
      console.log('[FeatureSplitPairViewer] Using distributed pairs:', distributedPairFeatureIds.length)
      return buildDistributedPairList(filteredTableData, distributedPairFeatureIds)
    }
    // Fallback to all pairs (original behavior)
    console.log('[FeatureSplitPairViewer] Building all pairs from filtered data')
    return buildPairList(filteredTableData)
  }, [filteredTableData, distributedPairFeatureIds])

  // Current pair
  const currentPair = pairList[currentPairIndex] || null

  // Get selection state for current pair
  const pairSelectionState = currentPair ? pairSelectionStates.get(currentPair.pairKey) || null : null

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

  const handleClearClick = () => {
    clearPairSelection()
  }


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
      {/* Compact header with navigation and selection */}
      <div className="pair-viewer__header">
        {/* Navigation */}
        <div className="pair-viewer__navigation">
          <button
            className="nav__button"
            onClick={goToPreviousPair}
            disabled={currentPairIndex === 0}
          >
            ← Prev
          </button>
          <span className="nav__counter">
            {currentPairIndex + 1} / {pairList.length}
          </span>
          <button
            className="nav__button"
            onClick={goToNextPair}
            disabled={currentPairIndex === pairList.length - 1}
          >
            Next →
          </button>
        </div>

        {/* Pair Info */}
        <div className="pair-viewer__info">
          <div className="pair-info__feature">
            <span className="feature__label">Main:</span>
            <span className="feature__id">#{currentPair.mainFeatureId}</span>
          </div>
          <span className="pair-info__separator">|</span>
          <div className="pair-info__feature">
            <span className="feature__label">Similar:</span>
            <span className="feature__id">#{currentPair.similarFeatureId}</span>
          </div>
          <div className="pair-info__similarity">
            <span className="similarity__icon">↔</span>
            <span className="similarity__value">
              {currentPair.decoderSimilarity.toFixed(3)}
            </span>
          </div>
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

        {/* Action buttons */}
        <div className="pair-viewer__actions">
          <button
            className="action__button action__button--sort"
            onClick={handleSortClick}
            disabled={isPairSimilaritySortLoading}
          >
            {isPairSimilaritySortLoading ? 'Sorting...' : 'Sort'}
          </button>
          <button
            className="action__button action__button--tag"
            onClick={handleTagClick}
          >
            Auto-Tag
          </button>
          <button
            className="action__button action__button--clear"
            onClick={handleClearClick}
            disabled={pairSelectionStates.size === 0}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Activation examples side-by-side */}
      <div className="pair-viewer__content">
        {/* Main feature activation */}
        <div className="activation-panel activation-panel--main">
          <div className="activation-panel__header">
            <span className="panel-header__label">Main Feature</span>
            <span className="panel-header__id">#{currentPair.mainFeatureId}</span>
          </div>
          {mainActivation ? (
            <div className="activation-panel__examples">
              <ActivationExample
                examples={mainActivation}
                containerWidth={containerWidth - 40}
                interFeaturePositions={mainInterFeaturePositions}
                numQuantiles={4}
              />
            </div>
          ) : (
            <div className="activation-panel__loading">Loading activation examples...</div>
          )}
        </div>

        {/* Similar feature activation */}
        <div className="activation-panel activation-panel--similar">
          <div className="activation-panel__header">
            <span className="panel-header__label">Similar Feature</span>
            <span className="panel-header__id">#{currentPair.similarFeatureId}</span>
          </div>
          {similarFeatureRow ? (
            similarActivation ? (
              <div className="activation-panel__examples">
                <ActivationExample
                  examples={similarActivation}
                  containerWidth={containerWidth - 40}
                  interFeaturePositions={similarInterFeaturePositions}
                  numQuantiles={4}
                />
              </div>
            ) : (
              <div className="activation-panel__loading">Loading activation examples...</div>
            )
          ) : (
            <div className="activation-panel__missing">Feature data not available</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitPairViewer)
