import React, { useMemo, useCallback, useState, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import FeatureSplitPairViewer from './FeatureSplitPairViewer'
import TagAutomaticPanel from './TagAutomaticPanel'
import ScrollableItemList from './ScrollableItemList'
import { TagBadge } from './TableIndicators'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getCanonicalPairKey } from '../lib/pairUtils'
import '../styles/FeatureSplitView.css'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build pairs from cluster groups
 * For each cluster, generate all within-cluster pairs (e.g., cluster [1,2,3] → pairs 1-2, 1-3, 2-3)
 *
 * @param tableData Table data with feature rows
 * @param clusterGroups Clusters with feature IDs (from backend)
 * @param selectedFeatureIds Set of selected feature IDs (for defensive filtering)
 * @returns Array of feature pairs with metadata
 */
function buildClusterPairs(
  tableData: any,
  clusterGroups: Array<{cluster_id: number, feature_ids: number[]}>,
  selectedFeatureIds: Set<number>
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
    // DEFENSIVE FILTER: Only include features that are:
    // 1. In the selected feature set
    // 2. Have corresponding table rows
    const validFeatures = cluster.feature_ids.filter(id =>
      selectedFeatureIds.has(id) && rowMap.has(id)
    )

    // Skip clusters with < 2 valid features (can't make pairs)
    if (validFeatures.length < 2) continue

    // Generate all combinations within this cluster
    for (let i = 0; i < validFeatures.length; i++) {
      for (let j = i + 1; j < validFeatures.length; j++) {
        const id1 = validFeatures[i]
        const id2 = validFeatures[j]

        // Use canonical pair key utility
        const pairKey = getCanonicalPairKey(id1, id2)
        const mainId = Math.min(id1, id2)
        const similarId = Math.max(id1, id2)

        // Try to find decoder similarity if available
        const mainRow = rowMap.get(mainId)!  // Safe: filtered by rowMap.has()
        const similarRow = rowMap.get(similarId)!
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
          row: mainRow,
          similarRow: similarRow
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
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const clusterGroups = useVisualizationStore(state => state.clusterGroups)
  const allClusterPairs = useVisualizationStore(state => state.allClusterPairs)
  const isLoadingDistributedPairs = useVisualizationStore(state => state.isLoadingDistributedPairs)
  const fetchAllClusterPairs = useVisualizationStore(state => (state as any).fetchAllClusterPairs)
  const clearDistributedPairs = useVisualizationStore(state => (state as any).clearDistributedPairs)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const lastPairSortedSelectionSignature = useVisualizationStore(state => state.lastPairSortedSelectionSignature)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)

  // Local state for carousel navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const features = getSelectedNodeFeatures()
    console.log('[FeatureSplitView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures])

  // Extract clustering threshold from Sankey structure
  const clusterThreshold = useMemo(() => {
    const sankeyStructure = leftPanel?.sankeyStructure
    if (!sankeyStructure) return 0.5

    const stage1Segment = sankeyStructure.nodes.find(n => n.id === 'stage1_segment')
    if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
      // Sankey threshold is already a similarity value, use it directly
      return stage1Segment.threshold
    }
    return 0.5
  }, [leftPanel?.sankeyStructure])

  // Convert Sankey threshold to clustering distance threshold
  // Sankey threshold is similarity-based (lower = less similar)
  // Clustering threshold is distance-based (higher = more dissimilar allowed)
  // Inversion: similarity 0.4 → distance 0.6 (looser clustering)
  const clusteringThreshold = useMemo(() => {
    return 1 - clusterThreshold
  }, [clusterThreshold])

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

  // Clear cluster groups when threshold or selected features change
  useEffect(() => {
    if (clusterGroups) {
      console.log('[FeatureSplitView] Threshold or features changed, clearing cluster groups')
      clearDistributedPairs()
    }
  }, [clusterThreshold, selectedFeatureIds])
  // NOTE: clearDistributedPairs NOT in dependencies to avoid triggering on clear

  // Fetch ALL cluster pairs when features change or when groups are cleared (Simplified Flow)
  useEffect(() => {
    if (selectedFeatureIds && selectedFeatureIds.size > 0 && !clusterGroups && !isLoadingDistributedPairs) {
      console.log('[FeatureSplitView] [SIMPLIFIED FLOW] Fetching ALL cluster pairs:', {
        featureCount: selectedFeatureIds.size,
        sankeyThreshold: clusterThreshold,
        clusteringThreshold: clusteringThreshold
      })
      // Call simplified API - returns ALL pairs (no sampling)
      fetchAllClusterPairs(Array.from(selectedFeatureIds), clusteringThreshold)
    }
  }, [selectedFeatureIds, clusterGroups, clusterThreshold, clusteringThreshold, fetchAllClusterPairs])
  // NOTE: clusterGroups IS in dependencies to fetch after clearing
  // NOTE: isLoadingDistributedPairs NOT in dependencies to avoid infinite loop
  // NOTE: clusterThreshold IS in dependencies to refetch when threshold changes

  // Clear cluster groups on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Build and randomly sample pair list from ALL cluster pairs (Simplified Flow)
  const pairList = useMemo(() => {
    if (!filteredTableData || !selectedFeatureIds) {
      return []
    }

    if (clusterGroups && clusterGroups.length > 0) {
      // Select 10 random clusters (or all if fewer than 10)
      const NUM_CLUSTERS_TO_DISPLAY = 10
      const selectedClusters = clusterGroups.length <= NUM_CLUSTERS_TO_DISPLAY
        ? clusterGroups  // Use all clusters if we have 10 or fewer
        : (() => {
            // Randomly sample 10 clusters using Fisher-Yates shuffle
            const shuffled = [...clusterGroups]
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            return shuffled.slice(0, NUM_CLUSTERS_TO_DISPLAY)
          })()

      // Build ALL pairs from the selected clusters
      const pairs = buildClusterPairs(filteredTableData, selectedClusters, selectedFeatureIds)

      console.log('[FeatureSplitView] [SIMPLIFIED FLOW] Selected', selectedClusters.length, 'clusters from', clusterGroups.length, 'total → built', pairs.length, 'pairs')

      return pairs
    }

    return []
  }, [filteredTableData, clusterGroups, selectedFeatureIds])

  // Auto-populate similarity scores when pair list is ready or selection states change
  useEffect(() => {
    // Extract manual selections to compute signature
    const currentSelectedKeys: string[] = []
    const currentRejectedKeys: string[] = []
    pairSelectionStates.forEach((state, pairKey) => {
      const source = pairSelectionSources.get(pairKey)
      if (source === 'manual') {
        if (state === 'selected') currentSelectedKeys.push(pairKey)
        else if (state === 'rejected') currentRejectedKeys.push(pairKey)
      }
    })

    const hasRequiredSelections = currentSelectedKeys.length >= 1 && currentRejectedKeys.length >= 1

    // Compute current signature to detect if scores are stale
    const currentSignature = `selected:${currentSelectedKeys.sort().join(',')}|rejected:${currentRejectedKeys.sort().join(',')}`
    const scoresAreStale = lastPairSortedSelectionSignature !== currentSignature

    // Need to compute scores if: (1) empty OR (2) selection signature changed
    const needsScores = (pairSimilarityScores.size === 0 || scoresAreStale) && pairList.length > 0

    if (hasRequiredSelections && needsScores) {
      const allPairKeys = pairList.map(p => p.pairKey)
      console.log('[FeatureSplitView] Computing similarity scores for', allPairKeys.length, 'pairs (stale:', scoresAreStale, ')')
      sortPairsBySimilarity(allPairKeys)
    }
  }, [pairList, pairSelectionStates, pairSelectionSources, pairSimilarityScores.size, lastPairSortedSelectionSignature, sortPairsBySimilarity])

  // ============================================================================
  // PAIR LIST LOGIC (for top row list)
  // ============================================================================

  // Jump to specific pair handler
  const goToPair = useCallback((index: number) => {
    if (index >= 0 && index < pairList.length) {
      setCurrentPairIndex(index)
    }
  }, [pairList.length])

  // Apply tags button handler
  const handleApplyTags = useCallback(() => {
    console.log('[FeatureSplitView] Applying tags')
    applySimilarityTags()
  }, [applySimilarityTags])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  const boundaryItems = useMemo(() => {
    // Extract threshold values inside useMemo for proper React reactivity
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? 0.3

    console.log('[FeatureSplitView.boundaryItems] Recomputing with thresholds:', {
      selectThreshold,
      rejectThreshold,
      allPairsCount: allClusterPairs?.length || 0,
      sampledPairsCount: pairList.length
    })

    // Build ALL pairs from allClusterPairs (not just sampled)
    let allPairs: Array<{
      mainFeatureId: number
      similarFeatureId: number
      pairKey: string
      row: FeatureTableRow | null
      similarRow: FeatureTableRow | null
    }> = []

    if (allClusterPairs && filteredTableData?.rows && selectedFeatureIds) {
      // Build row map
      const rowMap = new Map<number, FeatureTableRow>()
      filteredTableData.rows.forEach((row: FeatureTableRow) => {
        rowMap.set(row.feature_id, row)
      })

      // Convert all cluster pairs to pair objects
      allPairs = allClusterPairs
        .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
        .map(p => ({
          mainFeatureId: p.main_id,
          similarFeatureId: p.similar_id,
          pairKey: p.pair_key,
          row: rowMap.get(p.main_id) || null,
          similarRow: rowMap.get(p.similar_id) || null
        }))
    } else if (pairList.length > 0) {
      // Fallback: use sampled pairs
      allPairs = pairList
    }

    if (allPairs.length === 0) {
      return { rejectAbove: [], rejectBelow: [], selectAbove: [], selectBelow: [] }
    }

    // Use threshold values from above
    const thresholds = {
      select: selectThreshold,
      reject: rejectThreshold
    }

    // Filter pairs that have SVM similarity scores (from pairSimilarityScores Map)
    const pairsWithScores = allPairs.filter(pair => pairSimilarityScores.has(pair.pairKey))

    if (pairsWithScores.length === 0) {
      return { rejectAbove: [], rejectBelow: [], selectAbove: [], selectBelow: [] }
    }

    // REJECT THRESHOLD LISTS
    // Above reject: all pairs >= rejectThreshold, sorted ascending (lowest first), closest to threshold
    const rejectAbove = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= thresholds.reject)
      .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!) // Ascending: closest to threshold first

    // Below reject: all pairs < rejectThreshold, sorted descending (highest first), closest to threshold
    const rejectBelow = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! < thresholds.reject)
      .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!) // Descending: closest to threshold first

    // SELECT THRESHOLD LISTS
    // Above select: all pairs >= selectThreshold, sorted ascending (lowest first), closest to threshold
    const selectAbove = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= thresholds.select)
      .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!) // Ascending: closest to threshold first

    // Below select: all pairs < selectThreshold, sorted descending (highest first), closest to threshold
    const selectBelow = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! < thresholds.select)
      .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!) // Descending: closest to threshold first

    const result = { rejectAbove, rejectBelow, selectAbove, selectBelow }
    console.log('[FeatureSplitView.boundaryItems] Results:', {
      thresholds,
      rejectAbove: rejectAbove.length,
      rejectBelow: rejectBelow.length,
      selectAbove: selectAbove.length,
      selectBelow: selectBelow.length,
      pairsWithScores: pairsWithScores.length,
      allScores: pairsWithScores.map(p => pairSimilarityScores.get(p.pairKey)).sort((a, b) => a! - b!),
      rejectAboveIds: rejectAbove.map(p => `${p.mainFeatureId}-${p.similarFeatureId}`),
      rejectAboveScores: rejectAbove.map(p => pairSimilarityScores.get(p.pairKey)),
      selectAboveIds: selectAbove.map(p => `${p.mainFeatureId}-${p.similarFeatureId}`),
      selectAboveScores: selectAbove.map(p => pairSimilarityScores.get(p.pairKey))
    })
    return result
  }, [pairList, tagAutomaticState, pairSimilarityScores, allClusterPairs, filteredTableData, selectedFeatureIds])

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
          availablePairs={pairList}
          filteredFeatureIds={selectedFeatureIds}
        />

        {/* Right column: 2 rows */}
        <div className="feature-split-view__content">
        {/* Top row: Pair list + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
          <ScrollableItemList
            width={210}
            badges={[
              { label: 'Sampled Pairs', count: pairList.length }
            ]}
            items={pairList}
            currentIndex={currentPairIndex}
            highlightPredicate={(pair, currentPair) =>
              !!currentPair && pair.clusterId === currentPair.clusterId
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
              label: 'Apply Tags',
              onClick: handleApplyTags,
              disabled: !tagAutomaticState?.histogramData,
              title: tagAutomaticState?.histogramData
                ? 'Apply auto-tagging based on current thresholds'
                : 'Adjust thresholds in histogram first'
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
            {/* Below reject threshold - will be tagged Monosemantic */}
            <ScrollableItemList
              width={210}
              badges={[
                { label: '← Monosemantic', count: `${Math.min(10, boundaryItems.rejectBelow.length)} of ${boundaryItems.rejectBelow.length}` }
              ]}
              items={boundaryItems.rejectBelow.slice(0, 10)}
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

            {/* Above reject threshold - borderline, stays unsure */}
            <ScrollableItemList
              width={210}
              badges={[
                { label: 'Unsure →', count: `${Math.min(10, boundaryItems.rejectAbove.length)} of ${boundaryItems.rejectAbove.length}` }
              ]}
              items={boundaryItems.rejectAbove.slice(0, 10)}
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

          <TagAutomaticPanel
            mode="pair"
            availablePairs={pairList}
            filteredFeatureIds={selectedFeatureIds}
            threshold={clusteringThreshold}
          />

          {/* Right boundary lists - items near select threshold */}
          <div className="boundary-lists-container">
            {/* Above select threshold */}
            <ScrollableItemList
              width={210}
              badges={[
                { label: 'Fragmented →', count: `${Math.min(10, boundaryItems.selectAbove.length)} of ${boundaryItems.selectAbove.length}` }
              ]}
              items={boundaryItems.selectAbove.slice(0, 10)}
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
              width={210}
              badges={[
                { label: '← Unsure', count: `${Math.min(10, boundaryItems.selectBelow.length)} of ${boundaryItems.selectBelow.length}` }
              ]}
              items={boundaryItems.selectBelow.slice(0, 10)}
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
