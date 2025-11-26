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
import '../styles/FeatureSplitView.css'

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
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const lastPairSortedSelectionSignature = useVisualizationStore(state => state.lastPairSortedSelectionSignature)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)

  // Local state for navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  // Which list is currently controlling the viewer: 'all', 'reject' (Monosemantic), or 'select' (Fragmented)
  const [activeListSource, setActiveListSource] = useState<'all' | 'reject' | 'select'>('all')

  // Dependencies for selectedFeatureIds - ensure it updates when Sankey selection changes
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const features = getSelectedNodeFeatures()
    console.log('[FeatureSplitView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds])

  // Extract clustering threshold from Sankey structure
  const clusterThreshold = useMemo(() => {
    if (!sankeyStructure) return 0.5

    const stage1Segment = sankeyStructure.nodes.find(n => n.id === 'stage1_segment')
    if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
      // Sankey threshold is already a similarity value, use it directly
      return stage1Segment.threshold
    }
    return 0.5
  }, [sankeyStructure])

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

  // Pagination constant
  const PAIRS_PER_PAGE = 10

  // Build pair list from ALL cluster pairs (no sampling)
  const pairList = useMemo(() => {
    if (!filteredTableData || !selectedFeatureIds || !allClusterPairs || allClusterPairs.length === 0) {
      return []
    }

    // Build row map for metadata lookup
    const rowMap = new Map<number, FeatureTableRow>()
    filteredTableData.rows.forEach((row: FeatureTableRow) => {
      rowMap.set(row.feature_id, row)
    })

    // Convert ALL cluster pairs to pair objects with full metadata
    const pairs = allClusterPairs
      .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
      .map(p => {
        const mainRow = rowMap.get(p.main_id) || null
        const similarRow = rowMap.get(p.similar_id) || null

        // Try to find decoder similarity if available
        let decoderSimilarity: number | null = null
        if (mainRow?.decoder_similarity) {
          const similarData = mainRow.decoder_similarity.find(d => d.feature_id === p.similar_id)
          if (similarData) {
            decoderSimilarity = similarData.cosine_similarity
          }
        }

        return {
          mainFeatureId: p.main_id,
          similarFeatureId: p.similar_id,
          pairKey: p.pair_key,
          clusterId: p.cluster_id,
          row: mainRow,
          similarRow: similarRow,
          decoderSimilarity
        }
      })

    console.log('[FeatureSplitView] All pairs built:', pairs.length, 'pairs from', allClusterPairs.length, 'cluster pairs')

    return pairs
  }, [filteredTableData, allClusterPairs, selectedFeatureIds])

  // Pagination derived state
  const currentPage = Math.floor(currentPairIndex / PAIRS_PER_PAGE)
  const totalPages = Math.ceil(pairList.length / PAIRS_PER_PAGE) || 1

  // Get pairs for current page (for pre-fetching activation examples)
  const currentPagePairs = useMemo(() => {
    const startIdx = currentPage * PAIRS_PER_PAGE
    return pairList.slice(startIdx, startIdx + PAIRS_PER_PAGE)
  }, [pairList, currentPage])

  // Pre-fetch activation examples for all pairs on current page (All Pairs list)
  useEffect(() => {
    if (currentPagePairs.length === 0) return

    // Collect all unique feature IDs from current page pairs
    const featureIds = new Set<number>()
    currentPagePairs.forEach(pair => {
      featureIds.add(pair.mainFeatureId)
      featureIds.add(pair.similarFeatureId)
    })

    console.log('[FeatureSplitView] Pre-fetching activation examples for page', currentPage + 1, ':', featureIds.size, 'features')

    // Fetch all at once (the store handles caching, won't re-fetch already cached)
    fetchActivationExamples(Array.from(featureIds))
  }, [currentPagePairs, currentPage, fetchActivationExamples])

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
  // PAGE NAVIGATION HANDLERS (for All Pairs list pagination)
  // ============================================================================

  // Page navigation handlers
  const handlePreviousPage = useCallback(() => {
    if (currentPage > 0) {
      // Go to first item of previous page
      setCurrentPairIndex((currentPage - 1) * PAIRS_PER_PAGE)
    }
  }, [currentPage])

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      // Go to first item of next page
      setCurrentPairIndex((currentPage + 1) * PAIRS_PER_PAGE)
    }
  }, [currentPage, totalPages])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  // Boundary items type (same as pairList for FeatureSplitPairViewer compatibility)
  type PairWithMetadata = {
    mainFeatureId: number
    similarFeatureId: number
    pairKey: string
    clusterId: number
    row: FeatureTableRow | null
    similarRow: FeatureTableRow | null
    decoderSimilarity: number | null
  }

  const boundaryItems = useMemo(() => {
    // Extract threshold values inside useMemo for proper React reactivity
    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? 0.3

    // Build ALL pairs from allClusterPairs with FULL metadata for FeatureSplitPairViewer
    let allPairs: PairWithMetadata[] = []

    if (allClusterPairs && filteredTableData?.rows && selectedFeatureIds) {
      // Build row map
      const rowMap = new Map<number, FeatureTableRow>()
      filteredTableData.rows.forEach((row: FeatureTableRow) => {
        rowMap.set(row.feature_id, row)
      })

      // Convert all cluster pairs to pair objects with full metadata
      allPairs = allClusterPairs
        .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
        .map(p => {
          const mainRow = rowMap.get(p.main_id) || null
          const similarRow = rowMap.get(p.similar_id) || null

          // Try to find decoder similarity if available
          let decoderSimilarity: number | null = null
          if (mainRow?.decoder_similarity) {
            const similarData = mainRow.decoder_similarity.find(d => d.feature_id === p.similar_id)
            if (similarData) {
              decoderSimilarity = similarData.cosine_similarity
            }
          }

          return {
            mainFeatureId: p.main_id,
            similarFeatureId: p.similar_id,
            pairKey: p.pair_key,
            clusterId: p.cluster_id,
            row: mainRow,
            similarRow: similarRow,
            decoderSimilarity
          }
        })
    } else if (pairList.length > 0) {
      // Fallback: use sampled pairs (already has full metadata)
      allPairs = pairList
    }

    if (allPairs.length === 0) {
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

    // Use threshold values from above
    const thresholds = {
      select: selectThreshold,
      reject: rejectThreshold
    }

    // Filter pairs that have SVM similarity scores (from pairSimilarityScores Map)
    const pairsWithScores = allPairs.filter(pair => pairSimilarityScores.has(pair.pairKey))

    if (pairsWithScores.length === 0) {
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

    // REJECT THRESHOLD - Below reject: all pairs < rejectThreshold, sorted descending (highest first), closest to threshold
    const rejectBelow = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! < thresholds.reject)
      .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!) // Descending: closest to threshold first

    // SELECT THRESHOLD - Above select: all pairs >= selectThreshold, sorted ascending (lowest first), closest to threshold
    const selectAbove = pairsWithScores
      .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= thresholds.select)
      .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!) // Ascending: closest to threshold first

    return { rejectBelow, selectAbove }
  }, [pairList, tagAutomaticState, pairSimilarityScores, allClusterPairs, filteredTableData, selectedFeatureIds])

  // Get tag color for header badge
  const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'

  // ============================================================================
  // ACTIVE PAIR LIST - Determines which list the viewer shows
  // ============================================================================

  // Active pair list depends on which list is selected
  const activePairList = useMemo(() => {
    switch (activeListSource) {
      case 'reject':
        return boundaryItems.rejectBelow
      case 'select':
        return boundaryItems.selectAbove
      default:
        return pairList
    }
  }, [activeListSource, pairList, boundaryItems])

  // Fetch activation examples for current pair when it changes
  useEffect(() => {
    const currentPair = activePairList[currentPairIndex]
    if (currentPair) {
      fetchActivationExamples([currentPair.mainFeatureId, currentPair.similarFeatureId])
    }
  }, [activePairList, currentPairIndex, fetchActivationExamples])

  // ============================================================================
  // CLICK HANDLERS FOR ALL THREE LISTS
  // ============================================================================

  // All Pairs list click handler
  const handleAllPairsListClick = useCallback((pageRelativeIndex: number) => {
    const globalIndex = currentPage * PAIRS_PER_PAGE + pageRelativeIndex
    if (globalIndex >= 0 && globalIndex < pairList.length) {
      setActiveListSource('all')
      setCurrentPairIndex(globalIndex)
      // Pre-fetch activation examples for clicked pair
      const pair = pairList[globalIndex]
      if (pair) {
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
    }
  }, [pairList, currentPage, fetchActivationExamples])

  // Monosemantic (reject) list click handler
  const handleRejectListClick = useCallback((index: number) => {
    if (index >= 0 && index < boundaryItems.rejectBelow.length) {
      setActiveListSource('reject')
      setCurrentPairIndex(index)
      // Pre-fetch activation examples for clicked pair
      const pair = boundaryItems.rejectBelow[index]
      if (pair) {
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
    }
  }, [boundaryItems.rejectBelow, fetchActivationExamples])

  // Fragmented (select) list click handler
  const handleSelectListClick = useCallback((index: number) => {
    if (index >= 0 && index < boundaryItems.selectAbove.length) {
      setActiveListSource('select')
      setCurrentPairIndex(index)
      // Pre-fetch activation examples for clicked pair
      const pair = boundaryItems.selectAbove[index]
      if (pair) {
        fetchActivationExamples([pair.mainFeatureId, pair.similarFeatureId])
      }
    }
  }, [boundaryItems.selectAbove, fetchActivationExamples])

  // ============================================================================
  // NAVIGATION HANDLERS - Work with active list
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentPairIndex(prev => Math.max(0, prev - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentPairIndex(prev => Math.min(activePairList.length - 1, prev + 1))
  }, [activePairList.length])

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
          filteredFeatureIds={selectedFeatureIds || undefined}
        />

        {/* Right column: 2 rows */}
        <div className="feature-split-view__content">
        {/* Top row: Pair list + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
          <ScrollableItemList
            width={210}
            badges={[
              { label: 'All Pairs', count: pairList.length }
            ]}
            items={currentPagePairs}
            currentIndex={activeListSource === 'all' ? currentPairIndex % PAIRS_PER_PAGE : -1}
            isActive={activeListSource === 'all'}
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
                  onClick={() => handleAllPairsListClick(index)}
                  fullWidth={true}
                />
              )
            }}
            pageNavigation={{
              currentPage,
              totalPages,
              onPreviousPage: handlePreviousPage,
              onNextPage: handleNextPage
            }}
          />
          <FeatureSplitPairViewer
            currentPairIndex={currentPairIndex}
            pairList={activePairList}
            onNavigatePrevious={handleNavigatePrevious}
            onNavigateNext={handleNavigateNext}
          />
        </div>

        {/* Bottom row: Histogram + Monosemantic list + Fragmented list */}
        <div className="feature-split-view__row-bottom">
          {/* Left: Histogram */}
          <TagAutomaticPanel
            mode="pair"
            availablePairs={pairList}
            filteredFeatureIds={selectedFeatureIds || undefined}
            threshold={clusteringThreshold}
          />

          {/* Monosemantic list - below reject threshold */}
          <ScrollableItemList
            width={260}
            badges={[
              { label: '← Monosemantic', count: boundaryItems.rejectBelow.length }
            ]}
            columnHeader={{ label: 'Sim', sortDirection: 'desc' }}
            headerStripe={{ type: 'autoReject', mode: 'pair' }}
            items={boundaryItems.rejectBelow}
            currentIndex={activeListSource === 'reject' ? currentPairIndex : -1}
            isActive={activeListSource === 'reject'}
            renderItem={(item, index) => {
              const selectionState = pairSelectionStates.get(item.pairKey)
              const similarityScore = pairSimilarityScores.get(item.pairKey)

              let tagName = 'Unsure'
              if (selectionState === 'selected') {
                tagName = 'Fragmented'
              } else if (selectionState === 'rejected') {
                tagName = 'Monosemantic'
              }

              // Format pair ID as string for TagBadge
              const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

              return (
                <div className="pair-item-with-score">
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => handleRejectListClick(index)}
                    fullWidth={true}
                  />
                  {similarityScore !== undefined && (
                    <span className="pair-similarity-score">{similarityScore.toFixed(2)}</span>
                  )}
                </div>
              )
            }}
          />

          {/* Fragmented list - above select threshold */}
          <ScrollableItemList
            width={260}
            badges={[
              { label: 'Fragmented →', count: boundaryItems.selectAbove.length }
            ]}
            columnHeader={{ label: 'Sim', sortDirection: 'asc' }}
            headerStripe={{ type: 'expand', mode: 'pair' }}
            items={boundaryItems.selectAbove}
            currentIndex={activeListSource === 'select' ? currentPairIndex : -1}
            isActive={activeListSource === 'select'}
            renderItem={(item, index) => {
              const selectionState = pairSelectionStates.get(item.pairKey)
              const similarityScore = pairSimilarityScores.get(item.pairKey)

              let tagName = 'Unsure'
              if (selectionState === 'selected') {
                tagName = 'Fragmented'
              } else if (selectionState === 'rejected') {
                tagName = 'Monosemantic'
              }

              // Format pair ID as string for TagBadge
              const pairIdString = `${item.mainFeatureId}-${item.similarFeatureId}`

              return (
                <div className="pair-item-with-score">
                  <TagBadge
                    featureId={pairIdString as any}
                    tagName={tagName}
                    tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
                    onClick={() => handleSelectListClick(index)}
                    fullWidth={true}
                  />
                  {similarityScore !== undefined && (
                    <span className="pair-similarity-score">{similarityScore.toFixed(2)}</span>
                  )}
                </div>
              )
            }}
          />
        </div>
      </div>
      </div>
    </div>
  )
}

export default React.memo(FeatureSplitView)
