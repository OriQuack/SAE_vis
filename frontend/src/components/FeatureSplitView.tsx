import React, { useMemo, useCallback, useState, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import FeatureSplitPairViewer from './FeatureSplitPairViewer'
import TagAutomaticPanel from './TagAutomaticPanel'
import ScrollableItemList from './ScrollableItemList'
import { TagBadge } from './TableIndicators'
import { TAG_CATEGORY_FEATURE_SPLITTING, UNSURE_GRAY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import '../styles/FeatureSplitView.css'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build pairs from cluster groups
 * For each cluster, generate all within-cluster pairs (e.g., cluster [1,2,3] → pairs 1-2, 1-3, 2-3)
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
// FEATURE SPLIT VIEW - Organized layout for feature splitting workflow
// ============================================================================
// Layout: [SelectionPanel bar] | [Top: pair list + viewer] | [Bottom: left boundary + histogram + right boundary]

interface FeatureSplitViewProps {
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void
}

const FeatureSplitView: React.FC<FeatureSplitViewProps> = ({
  className = '',
  onCategoryRefsReady
}) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const clusterGroups = useVisualizationStore(state => state.clusterGroups)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchDistributedPairs = useVisualizationStore(state => (state as any).fetchDistributedPairs)
  const clearDistributedPairs = useVisualizationStore(state => (state as any).clearDistributedPairs)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const similarityTaggingPopover = useVisualizationStore(state => state.similarityTaggingPopover)
  const showSimilarityTaggingPopover = useVisualizationStore(state => state.showSimilarityTaggingPopover)

  // Local state for carousel navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    return getSelectedNodeFeatures()
  }, [getSelectedNodeFeatures])

  // Filter tableData to only include selected features
  const filteredTableData = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) {
      return null
    }

    const filteredFeatures = tableData.features.filter((row: FeatureTableRow) => selectedFeatureIds.has(row.feature_id))

    return {
      rows: filteredFeatures
    }
  }, [tableData, selectedFeatureIds])

  // Fetch cluster groups on mount when filteredTableData is available
  useEffect(() => {
    if (filteredTableData?.rows && filteredTableData.rows.length > 0 && !clusterGroups && !isLoadingDistributedPairs && selectedFeatureIds) {
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
      return []
    }

    if (clusterGroups && clusterGroups.length > 0) {
      return buildClusterPairs(filteredTableData, clusterGroups)
    }

    return []
  }, [filteredTableData, clusterGroups])

  // Get current pair
  const currentPair = pairList[currentPairIndex] || null

  // ============================================================================
  // PAIR LIST LOGIC (for top row list)
  // ============================================================================

  // Calculate selection counts for Tag Automatically button
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

  // Handler for Tag Automatically button
  const handleTagAutomatically = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    showSimilarityTaggingPopover('pair', {
      x: rect.left,
      y: rect.bottom + 10
    }, 'Fragmented')
  }, [showSimilarityTaggingPopover])

  // Jump to specific pair handler
  const goToPair = useCallback((index: number) => {
    if (index >= 0 && index < pairList.length) {
      setCurrentPairIndex(index)
    }
  }, [pairList.length])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  const boundaryItems = useMemo(() => {
    // Use pairList with decoder similarity scores
    if (!pairList || pairList.length === 0) {
      return { rejectAbove: [], rejectBelow: [], selectAbove: [], selectBelow: [] }
    }

    // Get thresholds from popover (updates when user drags handles)
    const thresholds = {
      select: similarityTaggingPopover?.selectThreshold || 0.8,
      reject: similarityTaggingPopover?.rejectThreshold || 0.3
    }

    // Filter pairs that have decoder similarity scores
    const pairsWithScores = pairList.filter(pair => pair.decoderSimilarity !== null)

    if (pairsWithScores.length === 0) {
      return { rejectAbove: [], rejectBelow: [], selectAbove: [], selectBelow: [] }
    }

    // REJECT THRESHOLD LISTS
    // Above reject: 3 pairs >= rejectThreshold, sorted descending (highest first), closest to threshold
    const rejectAbove = pairsWithScores
      .filter(pair => pair.decoderSimilarity! >= thresholds.reject)
      .sort((a, b) => a.decoderSimilarity! - b.decoderSimilarity!) // Ascending: closest to threshold first
      .slice(0, 3)

    // Below reject: 3 pairs < rejectThreshold, sorted descending (highest first), closest to threshold
    const rejectBelow = pairsWithScores
      .filter(pair => pair.decoderSimilarity! < thresholds.reject)
      .sort((a, b) => b.decoderSimilarity! - a.decoderSimilarity!) // Descending: closest to threshold first
      .slice(0, 3)

    // SELECT THRESHOLD LISTS
    // Above select: 3 pairs >= selectThreshold, sorted ascending (lowest first), closest to threshold
    const selectAbove = pairsWithScores
      .filter(pair => pair.decoderSimilarity! >= thresholds.select)
      .sort((a, b) => a.decoderSimilarity! - b.decoderSimilarity!) // Ascending: closest to threshold first
      .slice(0, 3)

    // Below select: 3 pairs < selectThreshold, sorted descending (highest first), closest to threshold
    const selectBelow = pairsWithScores
      .filter(pair => pair.decoderSimilarity! < thresholds.select)
      .sort((a, b) => b.decoderSimilarity! - a.decoderSimilarity!) // Descending: closest to threshold first
      .slice(0, 3)

    return { rejectAbove, rejectBelow, selectAbove, selectBelow }
  }, [pairList, similarityTaggingPopover?.selectThreshold, similarityTaggingPopover?.rejectThreshold])

  // Get tag color for header badge
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'

  // Navigation handlers
  const handleNavigatePrevious = useCallback(() => {
    setCurrentPairIndex(prev => Math.max(0, prev - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentPairIndex(prev => Math.min(pairList.length - 1, prev + 1))
  }, [pairList.length])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`feature-split-view ${className}`}>
      {/* Header - Full width */}
      <div className="feature-split-view__header">
        <h3 className="feature-split-view__title">Candidate Validation</h3>
        <p className="feature-split-view__description">
          Validate candidates for{' '}
          <span
            className="feature-split-view__tag-badge"
            style={{ backgroundColor: fragmentedColor }}
          >
            Fragmented
          </span>{' '}
          tag
        </p>
      </div>

      {/* Body: SelectionPanel + Content area */}
      <div className="feature-split-view__body">
        {/* Left column: SelectionPanel vertical bar (full height) */}
        <SelectionPanel
          mode="pair"
          tagLabel="Feature Splitting"
          onCategoryRefsReady={onCategoryRefsReady}
        />

        {/* Right column: 2 rows */}
        <div className="feature-split-view__content">
        {/* Top row: Pair list + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
          <ScrollableItemList
            width={200}
            badges={[
              { label: 'Pairs', count: pairList.length },
              ...(clusterGroups && clusterGroups.length > 0 ? [{ label: 'Clusters', count: clusterGroups.length }] : [])
            ]}
            items={pairList}
            currentIndex={currentPairIndex}
            highlightPredicate={(pair, currentPair) =>
              currentPair && pair.clusterId === currentPair.clusterId
            }
            renderItem={(pair, index) => {
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

              return (
                <TagBadge
                  featureId={pairIdString as any}
                  tagName={tagName}
                  tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                  onClick={() => goToPair(index)}
                  fullWidth={true}
                />
              )
            }}
            footerButton={{
              label: 'Tag Automatically',
              onClick: handleTagAutomatically,
              disabled: !canTagAutomatically,
              title: canTagAutomatically
                ? 'Tag remaining pairs automatically'
                : `Need ≥1 Fragmented and ≥1 Monosemantic (${selectionCounts.selectedCount}/1 Fragmented, ${selectionCounts.rejectedCount}/1 Monosemantic)`,
              className: canTagAutomatically ? 'scrollable-list__footer-button--available' : ''
            }}
          />
          <FeatureSplitPairViewer
            currentPairIndex={currentPairIndex}
            pairList={pairList}
            onNavigatePrevious={handleNavigatePrevious}
            onNavigateNext={handleNavigateNext}
          />
        </div>

        {/* Bottom row: Left boundary lists + TagAutomaticPanel + Right boundary lists */}
        <div className="feature-split-view__row-bottom">
          {/* Left boundary lists - items near reject threshold */}
          <div className="boundary-lists-container">
            {/* Above reject threshold */}
            <ScrollableItemList
              width={180}
              badges={[
                { label: 'Above Reject', count: boundaryItems.rejectAbove.length }
              ]}
              items={boundaryItems.rejectAbove}
              renderItem={(item) => {
                const selectionState = pairSelectionStates.get(item.pairKey)

                let tagName = 'Unsure'
                if (selectionState === 'selected') {
                  tagName = 'Fragmented'
                } else if (selectionState === 'rejected') {
                  tagName = 'Monosemantic'
                }

                // Format pair ID as string for TagBadge
                const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

                return (
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => {}}
                    fullWidth={true}
                  />
                )
              }}
            />

            {/* Below reject threshold */}
            <ScrollableItemList
              width={180}
              badges={[
                { label: 'Below Reject', count: boundaryItems.rejectBelow.length }
              ]}
              items={boundaryItems.rejectBelow}
              renderItem={(item) => {
                const selectionState = pairSelectionStates.get(item.pairKey)

                let tagName = 'Unsure'
                if (selectionState === 'selected') {
                  tagName = 'Fragmented'
                } else if (selectionState === 'rejected') {
                  tagName = 'Monosemantic'
                }

                // Format pair ID as string for TagBadge
                const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

                return (
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => {}}
                    fullWidth={true}
                  />
                )
              }}
            />
          </div>

          <TagAutomaticPanel mode="pair" />

          {/* Right boundary lists - items near select threshold */}
          <div className="boundary-lists-container">
            {/* Above select threshold */}
            <ScrollableItemList
              width={180}
              badges={[
                { label: 'Above Select', count: boundaryItems.selectAbove.length }
              ]}
              items={boundaryItems.selectAbove}
              renderItem={(item) => {
                const selectionState = pairSelectionStates.get(item.pairKey)

                let tagName = 'Unsure'
                if (selectionState === 'selected') {
                  tagName = 'Fragmented'
                } else if (selectionState === 'rejected') {
                  tagName = 'Monosemantic'
                }

                // Format pair ID as string for TagBadge
                const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

                return (
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => {}}
                    fullWidth={true}
                  />
                )
              }}
            />

            {/* Below select threshold */}
            <ScrollableItemList
              width={180}
              badges={[
                { label: 'Below Select', count: boundaryItems.selectBelow.length }
              ]}
              items={boundaryItems.selectBelow}
              renderItem={(item) => {
                const selectionState = pairSelectionStates.get(item.pairKey)

                let tagName = 'Unsure'
                if (selectionState === 'selected') {
                  tagName = 'Fragmented'
                } else if (selectionState === 'rejected') {
                  tagName = 'Monosemantic'
                }

                // Format pair ID as string for TagBadge
                const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

                return (
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => {}}
                    fullWidth={true}
                  />
                )
              }}
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitView)
