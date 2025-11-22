import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow } from '../types'
import ActivationExample from './ActivationExample'
import { TagBadge } from './TableIndicators'
import { TAG_CATEGORY_FEATURE_SPLITTING, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { extractInterFeaturePositions } from '../lib/activation-utils'
import '../styles/FeatureSplitPairViewer.css'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build pairs from cluster groups
 * For each cluster, generate all within-cluster pairs (e.g., cluster [1,2,3] → pairs 1-2, 1-3, 2-3)
 * Returns array of {mainFeatureId, similarFeatureId, decoderSimilarity, pairKey, clusterId, ...}
 */
function buildClusterPairs(
  tableData: any,
  clusterGroups: Array<{cluster_id: number, feature_ids: number[]}>
): Array<{
  mainFeatureId: number
  similarFeatureId: number
  decoderSimilarity: number | null
  pairKey: string
  clusterId: number
  row: FeatureTableRow | null
  similarRow: FeatureTableRow | null
}> {
  if (!tableData?.rows || !clusterGroups || clusterGroups.length === 0) return []

  const pairs: Array<{
    mainFeatureId: number
    similarFeatureId: number
    decoderSimilarity: number | null
    pairKey: string
    clusterId: number
    row: FeatureTableRow | null
    similarRow: FeatureTableRow | null
  }> = []

  // Build feature ID to row mapping
  const rowMap = new Map<number, FeatureTableRow>()
  tableData.rows.forEach((row: FeatureTableRow) => {
    rowMap.set(row.feature_id, row)
  })

  // For each cluster, generate all pairs
  for (const cluster of clusterGroups) {
    const featureIds = cluster.feature_ids

    // Generate all combinations within this cluster
    for (let i = 0; i < featureIds.length; i++) {
      for (let j = i + 1; j < featureIds.length; j++) {
        const id1 = featureIds[i]
        const id2 = featureIds[j]

        // Ensure smaller ID first for canonical pair key
        const mainId = Math.min(id1, id2)
        const similarId = Math.max(id1, id2)
        const pairKey = `${mainId}-${similarId}`

        // Try to find decoder similarity if available
        const mainRow = rowMap.get(mainId)
        const similarRow = rowMap.get(similarId)
        let decoderSimilarity: number | null = null

        if (mainRow?.decoder_similarity) {
          const similarData = mainRow.decoder_similarity.find(d => d.feature_id === similarId)
          if (similarData) {
            decoderSimilarity = similarData.cosine_similarity
          }
        }

        pairs.push({
          mainFeatureId: mainId,
          similarFeatureId: similarId,
          decoderSimilarity,
          pairKey,
          clusterId: cluster.cluster_id,
          row: mainRow || null,
          similarRow: similarRow || null
        })
      }
    }
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
  const clusterGroups = useVisualizationStore(state => state.clusterGroups)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchDistributedPairs = useVisualizationStore(state => (state as any).fetchDistributedPairs)
  const clearDistributedPairs = useVisualizationStore(state => (state as any).clearDistributedPairs)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)

  // Local state for carousel navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  const containerWidth = 1400 // Fixed width for full-width activation examples

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const features = getSelectedNodeFeatures()
    console.log('[FeatureSplitPairViewer] Selected feature IDs:', features ? features.size : 0)
    return features
  }, [getSelectedNodeFeatures])

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

  // Fetch cluster groups on mount when filteredTableData is available
  useEffect(() => {
    if (filteredTableData?.rows && filteredTableData.rows.length > 0 && !clusterGroups && !isLoadingDistributedPairs && selectedFeatureIds) {
      console.log('[FeatureSplitPairViewer] Fetching cluster groups on mount:', {
        filteredFeatures: filteredTableData.rows.length,
        selectedFeatures: selectedFeatureIds.size
      })
      fetchDistributedPairs(15, selectedFeatureIds)
    }
  }, [filteredTableData, clusterGroups, isLoadingDistributedPairs, fetchDistributedPairs, selectedFeatureIds])

  // Clear cluster groups on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Build pair list from cluster groups
  const pairList = useMemo(() => {
    if (!filteredTableData) {
      console.log('[FeatureSplitPairViewer] No filtered table data available')
      return []
    }

    if (clusterGroups && clusterGroups.length > 0) {
      console.log('[FeatureSplitPairViewer] Building pairs from cluster groups:', clusterGroups.length)
      return buildClusterPairs(filteredTableData, clusterGroups)
    }

    console.log('[FeatureSplitPairViewer] No cluster groups available')
    return []
  }, [filteredTableData, clusterGroups])

  // Current pair
  const currentPair = pairList[currentPairIndex] || null

  // Get selection state for current pair
  const pairSelectionState = currentPair ? pairSelectionStates.get(currentPair.pairKey) || null : null

  // Calculate counts for Tag Automatically button (must be before early returns)
  const selectionCounts = useMemo(() => {
    let selectedCount = 0
    let rejectedCount = 0
    pairSelectionStates.forEach(state => {
      if (state === 'selected') selectedCount++
      else if (state === 'rejected') rejectedCount++
    })
    return { selectedCount, rejectedCount }
  }, [pairSelectionStates])

  const canTagAutomatically = selectionCounts.selectedCount >= 1 && selectionCounts.rejectedCount >= 1

  // Handler for Tag Automatically button (must be before early returns)
  const handleTagAutomatically = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    showSimilarityTaggingPopover('pair', {
      x: rect.left,
      y: rect.bottom + 10
    }, 'Fragmented')
  }, [showSimilarityTaggingPopover])

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

  // Jump to specific pair handler
  const goToPair = useCallback((index: number) => {
    if (index >= 0 && index < pairList.length) {
      setCurrentPairIndex(index)
    }
  }, [pairList.length])

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



  // Show loading state while fetching cluster groups
  if (isLoadingDistributedPairs) {
    return (
      <div className={`feature-split-pair-viewer ${className}`}>
        <div className="pair-viewer__empty">Loading cluster groups...</div>
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

  // TEMPORARY FIX: We have 16k features but only ~7500 in tableData
  // However, we DO have activation examples for features > 7500
  // So we get activation data directly, even if similarRow doesn't exist
  // TODO: Remove this workaround when full feature data is available
  const similarActivation = activationExamples[currentPair.similarFeatureId] || null

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

  // Get tag colors for buttons
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'
  const monosemanticColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || UNSURE_GRAY
  const unsureColor = UNSURE_GRAY  // Gray for unsure state

  return (
    <div className={`feature-split-pair-viewer ${className}`}>
      <div className="pair-viewer__header-title">
        <h3 className="pair-viewer__title">Candidate Validation</h3>
        <p className="pair-viewer__description">
          Validate candidates for{' '}
          <span
            className="pair-viewer__tag-badge"
            style={{ backgroundColor: fragmentedColor }}
          >
            Fragmented
          </span>{' '}
          tag
        </p>
      </div>
      <div className="pair-viewer__body">
        {/* Sidebar with pair list grouped by cluster */}
        <div className="pair-viewer__sidebar">
        <div className="sidebar__header">
          <div className="sidebar__badge">
            <span className="badge__label">Pairs</span>
            <span className="badge__count">{pairList.length}</span>
          </div>
          {clusterGroups && clusterGroups.length > 0 && (
            <div className="sidebar__badge">
              <span className="badge__label">Clusters</span>
              <span className="badge__count">{clusterGroups.length}</span>
            </div>
          )}
        </div>
        <div className="pair-list__container">
          {pairList.map((pair, index) => {
            const isCurrent = index === currentPairIndex
            const selectionState = pairSelectionStates.get(pair.pairKey) || null

            // Map selection state to tag name
            let tagName = 'Unsure'
            if (selectionState === 'selected') {
              tagName = 'Fragmented'
            } else if (selectionState === 'rejected') {
              tagName = 'Monosemantic'
            }

            // Format pair ID as string for TagBadge
            const pairIdString = `${pair.mainFeatureId}-${pair.similarFeatureId}`

            // Check if this pair is in the same cluster as the current pair
            const isInCurrentCluster = currentPair && pair.clusterId === currentPair.clusterId

            // Detect cluster boundaries for continuous background
            const prevPair = index > 0 ? pairList[index - 1] : null
            const nextPair = index < pairList.length - 1 ? pairList[index + 1] : null
            const prevInSameCluster = prevPair && currentPair && prevPair.clusterId === currentPair.clusterId
            const nextInSameCluster = nextPair && currentPair && nextPair.clusterId === currentPair.clusterId

            const isClusterFirst = isInCurrentCluster && !prevInSameCluster
            const isClusterLast = isInCurrentCluster && !nextInSameCluster

            return (
              <div
                key={pair.pairKey}
                className={`pair-list-item ${isCurrent ? 'pair-list-item--current' : ''} ${isInCurrentCluster ? 'pair-list-item--same-cluster' : ''} ${isClusterFirst ? 'pair-list-item--cluster-first' : ''} ${isClusterLast ? 'pair-list-item--cluster-last' : ''}`}
              >
                <TagBadge
                  featureId={pairIdString as any}
                  tagName={tagName}
                  tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                  onClick={() => goToPair(index)}
                  fullWidth={true}
                />
              </div>
            )
          })}
        </div>
        {/* Tag Automatically Button */}
        <button
          className={`sidebar__tag-button ${canTagAutomatically ? 'sidebar__tag-button--available' : ''}`}
          onClick={handleTagAutomatically}
          disabled={!canTagAutomatically}
          title={canTagAutomatically ? 'Tag remaining pairs automatically' : `Need ≥1 Fragmented and ≥1 Monosemantic (${selectionCounts.selectedCount}/1 Fragmented, ${selectionCounts.rejectedCount}/1 Monosemantic)`}
        >
          Tag Automatically
        </button>
      </div>

      {/* Main content area */}
      <div className="pair-viewer__main">
        {/* Compact header with navigation and selection */}
        <div className="pair-viewer__header">
        {/* Prev button */}
        <button
          className="nav__button"
          onClick={goToPreviousPair}
          disabled={currentPairIndex === 0}
        >
          ← Prev
        </button>

        {/* Counter */}
        <span className="nav__counter">
          {currentPairIndex + 1} / {pairList.length}
        </span>

        {/* Separator */}
        <span className="pair-info__separator">|</span>

        {/* Feature IDs */}
        <div className="pair-info__ids">
          <span className="feature__id">#{currentPair.mainFeatureId}</span>
          <span className="similarity__icon"> ↔ </span>
          <span className="feature__id">#{currentPair.similarFeatureId}</span>
        </div>

        {/* Separator */}
        <span className="pair-info__separator">|</span>

        {/* Decoder Similarity */}
        <div className="pair-info__similarity">
          <span className="similarity__label">Decoder Similarity:</span>
          <span className="similarity__value">
            {currentPair.decoderSimilarity !== null ? currentPair.decoderSimilarity.toFixed(3) : 'N/A'}
          </span>
        </div>

        {/* Flexible gap */}
        <div style={{ flex: 1 }}></div>

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
          onClick={goToNextPair}
          disabled={currentPairIndex === pairList.length - 1}
        >
          Next →
        </button>
      </div>

      {/* Activation examples side-by-side */}
      <div className="pair-viewer__content">
        {/* Main feature activation */}
        <div className="activation-panel activation-panel--main">
          <div className="activation-panel__header">
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
            <span className="panel-header__id">#{currentPair.similarFeatureId}</span>
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
              />
            </div>
          ) : (
            <div className="activation-panel__loading">Loading activation examples...</div>
          )}
        </div>
      </div>
      {/* Close pair-viewer__main */}
      </div>
      {/* Close pair-viewer__body */}
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitPairViewer)
