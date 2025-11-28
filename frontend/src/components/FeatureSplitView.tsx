import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import FeatureSplitPairViewer from './FeatureSplitPairViewer'
import TagAutomaticPanel from './TagAutomaticPanel'
import ScrollableItemList from './ScrollableItemList'
import BimodalityIndicator, { isBimodalScore } from './BimodalityIndicator'
import { TagBadge } from './TableIndicators'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import '../styles/FeatureSplitView.css'

// ============================================================================
// FEATURE SPLIT VIEW - Organized layout for feature splitting workflow
// ============================================================================
// Layout: [SelectionPanel bar] | [Top: pair list + viewer] | [Bottom: left boundary + histogram + right boundary]

// Commit history types
type SelectionState = 'selected' | 'rejected'
type SelectionSource = 'manual' | 'auto'

export interface TagCommit {
  id: number
  type: 'initial' | 'apply' | 'tagAll'  // initial = starting state, apply = Apply Tags, tagAll = Tag All
  pairSelectionStates: Map<string, SelectionState>
  pairSelectionSources: Map<string, SelectionSource>
}

// Maximum number of commits to keep (oldest auto-removed)
const MAX_COMMITS = 10

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
  const isDraggingThreshold = useVisualizationStore(state => state.isDraggingThreshold)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const lastPairSortedSelectionSignature = useVisualizationStore(state => state.lastPairSortedSelectionSignature)
  const sortPairsBySimilarity = useVisualizationStore(state => state.sortPairsBySimilarity)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const restorePairSelectionStates = useVisualizationStore(state => state.restorePairSelectionStates)
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Stage 1 revisiting state
  const isRevisitingStage1 = useVisualizationStore(state => state.isRevisitingStage1)
  const stage1FinalCommit = useVisualizationStore(state => state.stage1FinalCommit)
  const setStage1FinalCommit = useVisualizationStore(state => state.setStage1FinalCommit)

  // Local state for navigation
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  // Local state for Tag All popover
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
  // Which list is currently controlling the viewer: 'all', 'reject' (Monosemantic), or 'select' (Fragmented)
  const [activeListSource, setActiveListSource] = useState<'all' | 'reject' | 'select'>('all')
  // Captured sorted pair keys (one-time snapshot after Apply Tags)
  // When set, pairList uses this order instead of default cluster order
  const [uncertaintySortedPairKeys, setUncertaintySortedPairKeys] = useState<string[] | null>(null)

  // ============================================================================
  // COMMIT HISTORY STATE - Save and restore tagging state snapshots
  // ============================================================================
  // Initial commit represents the empty state
  const [tagCommitHistory, setTagCommitHistory] = useState<TagCommit[]>([
    { id: 0, type: 'initial', pairSelectionStates: new Map(), pairSelectionSources: new Map() }
  ])
  const [currentCommitIndex, setCurrentCommitIndex] = useState(0)

  // Restore from saved commit when revisiting Stage 1
  // NOTE: We do NOT clear isRevisitingStage1 here - it's needed by selectedFeatureIds useMemo
  // The flag is cleared when navigating away from Stage 1 (in activateCategoryTable)
  useEffect(() => {
    if (isRevisitingStage1 && stage1FinalCommit) {
      console.log('[FeatureSplitView] Revisiting Stage 1, restoring from saved commit:', stage1FinalCommit.pairSelectionStates.size, 'pairs, features:', stage1FinalCommit.featureIds.size)

      // Initialize history with the saved commit as a tagAll commit
      const restoredCommit: TagCommit = {
        id: 1,
        type: 'tagAll',
        pairSelectionStates: new Map(stage1FinalCommit.pairSelectionStates),
        pairSelectionSources: new Map(stage1FinalCommit.pairSelectionSources)
      }

      setTagCommitHistory([
        { id: 0, type: 'initial', pairSelectionStates: new Map(), pairSelectionSources: new Map() },
        restoredCommit
      ])
      setCurrentCommitIndex(1)

      // Restore pair selection states to store
      restorePairSelectionStates(stage1FinalCommit.pairSelectionStates, stage1FinalCommit.pairSelectionSources)
    }
  }, [isRevisitingStage1, stage1FinalCommit, restorePairSelectionStates])

  // Dependencies for selectedFeatureIds - ensure it updates when Sankey selection changes
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  // When revisiting Stage 1, use the stored feature IDs from the saved commit
  const selectedFeatureIds = useMemo(() => {
    // If revisiting Stage 1 and we have stored feature IDs, use those
    if (isRevisitingStage1 && stage1FinalCommit?.featureIds) {
      console.log('[FeatureSplitView] Using stored Stage 1 feature IDs:', stage1FinalCommit.featureIds.size)
      return stage1FinalCommit.featureIds
    }

    // These dependencies are necessary to trigger recalculation when Sankey selection changes
    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps  // Consume the variable to avoid unused-vars warning
    const features = getSelectedNodeFeatures()
    console.log('[FeatureSplitView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage1, stage1FinalCommit])

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
    // NOTE: clearDistributedPairs and clusterGroups NOT in dependencies to avoid triggering on clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterThreshold, selectedFeatureIds])

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
    // NOTE: clusterGroups IS in dependencies to fetch after clearing
    // NOTE: isLoadingDistributedPairs NOT in dependencies to avoid infinite loop
    // NOTE: clusterThreshold IS in dependencies to refetch when threshold changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeatureIds, clusterGroups, clusterThreshold, clusteringThreshold, fetchAllClusterPairs])

  // Clear cluster groups on unmount
  useEffect(() => {
    return () => {
      clearDistributedPairs()
    }
  }, [clearDistributedPairs])

  // Pagination constant
  const PAIRS_PER_PAGE = 10

  // Build pair list from ALL cluster pairs (no sampling)
  // If uncertaintySortedPairKeys is set, use that order (one-time snapshot from Apply Tags)
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

    // Use captured sorted order if available (from Apply Tags)
    // Pairs not in the sorted list (tagged pairs) get MAX_SAFE_INTEGER and appear at the end
    if (uncertaintySortedPairKeys && uncertaintySortedPairKeys.length > 0) {
      // Create a map for O(1) lookup of sort index
      const sortOrderMap = new Map<string, number>()
      uncertaintySortedPairKeys.forEach((key, index) => sortOrderMap.set(key, index))

      // Sort pairs by the captured order (untagged pairs sorted by confidence, tagged pairs at end)
      pairs.sort((a, b) => {
        const indexA = sortOrderMap.get(a.pairKey) ?? Number.MAX_SAFE_INTEGER
        const indexB = sortOrderMap.get(b.pairKey) ?? Number.MAX_SAFE_INTEGER
        return indexA - indexB
      })
    }

    return pairs
  }, [filteredTableData, allClusterPairs, selectedFeatureIds, uncertaintySortedPairKeys])

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

  // When threshold dragging starts, switch to 'all' list if currently in boundary lists
  // This prevents the selected pair from becoming invalid as boundary items change
  useEffect(() => {
    if (isDraggingThreshold && (activeListSource === 'reject' || activeListSource === 'select')) {
      console.log('[FeatureSplitView] Threshold drag started, switching from', activeListSource, 'to all list')
      setActiveListSource('all')
      setCurrentPairIndex(0)
    }
  }, [isDraggingThreshold, activeListSource])


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

  // Keep previous boundary items during histogram reload to prevent double updates
  const prevBoundaryItemsRef = useRef<{ rejectBelow: PairWithMetadata[], selectAbove: PairWithMetadata[] }>({ rejectBelow: [], selectAbove: [] })

  const boundaryItems = useMemo(() => {
    // Don't show anything until histogram is actually fetched
    // histogramData is null before first fetch and during reload
    if (!tagAutomaticState?.histogramData) {
      // During reload (after initial fetch), return previous values to prevent flicker
      if (prevBoundaryItemsRef.current.rejectBelow.length > 0 || prevBoundaryItemsRef.current.selectAbove.length > 0) {
        return prevBoundaryItemsRef.current
      }
      // Before first fetch, return empty lists
      return { rejectBelow: [] as PairWithMetadata[], selectAbove: [] as PairWithMetadata[] }
    }

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

    const result = { rejectBelow, selectAbove }
    // Store in ref for use during histogram reload
    prevBoundaryItemsRef.current = result
    return result
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
  // APPLY TAGS HANDLER
  // ============================================================================

  // Button is enabled when there are pairs in the boundary lists (pairs to auto-tag)
  const hasItemsToTag = boundaryItems.rejectBelow.length > 0 || boundaryItems.selectAbove.length > 0

  // Handle Apply Tags button click
  const handleApplyTags = useCallback(() => {
    // 1. Capture sort order BEFORE applying tags (using current scores)
    // Filter out already-tagged pairs - they don't have scores from the backend
    // (backend excludes training pairs from SVM scoring)
    if (pairSimilarityScores.size > 0 && pairList.length > 0) {
      // Only sort untagged pairs - tagged pairs will appear at the end
      const untaggedPairs = pairList.filter(p => !pairSelectionStates.has(p.pairKey))

      const sortedKeys = untaggedPairs
        .sort((a, b) => {
          const scoreA = pairSimilarityScores.get(a.pairKey) ?? 0
          const scoreB = pairSimilarityScores.get(b.pairKey) ?? 0
          // Ascending by absolute value: lowest |score| first = lowest confidence first
          return Math.abs(scoreA) - Math.abs(scoreB)
        })
        .map(p => p.pairKey)

      setUncertaintySortedPairKeys(sortedKeys)
      console.log('[FeatureSplitView] Captured sort order:', sortedKeys.length, 'untagged pairs (tagged pairs will appear at end)')
    }

    // 2. Save current state to current commit before applying new tags
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        pairSelectionStates: new Map(pairSelectionStates),
        pairSelectionSources: new Map(pairSelectionSources)
      }
      return updated
    })

    // 3. Apply auto-tags based on current thresholds
    applySimilarityTags()

    // 4. Create a new commit with the updated state (will be captured after state update)
    // Use setTimeout to ensure the store has updated with the new tags
    setTimeout(() => {
      // Get the updated states from the store
      const store = useVisualizationStore.getState()
      const newCommit: TagCommit = {
        id: tagCommitHistory.length,
        type: 'apply',
        pairSelectionStates: new Map(store.pairSelectionStates),
        pairSelectionSources: new Map(store.pairSelectionSources)
      }

      setTagCommitHistory(prev => {
        // Trim history to MAX_COMMITS if needed (remove oldest, keep initial)
        let newHistory = [...prev, newCommit]
        if (newHistory.length > MAX_COMMITS) {
          // Keep the first commit (initial state) and trim from the second
          newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
        }
        return newHistory
      })

      // Move to the new commit
      setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))

      console.log('[FeatureSplitView] Created new commit, history length:', tagCommitHistory.length + 1)
    }, 0)

    // 5. Reset to first page/pair
    setCurrentPairIndex(0)
    setActiveListSource('all')
  }, [applySimilarityTags, pairSimilarityScores, pairList, pairSelectionStates, pairSelectionSources, currentCommitIndex, tagCommitHistory.length])

  // Handle commit circle click - restore state from that commit
  const handleCommitClick = useCallback((commitIndex: number) => {
    if (commitIndex < 0 || commitIndex >= tagCommitHistory.length) return
    if (commitIndex === currentCommitIndex) return // Already on this commit

    // Save current state to current commit before switching
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        pairSelectionStates: new Map(pairSelectionStates),
        pairSelectionSources: new Map(pairSelectionSources)
      }
      return updated
    })

    // Restore the clicked commit's state
    const targetCommit = tagCommitHistory[commitIndex]
    restorePairSelectionStates(targetCommit.pairSelectionStates, targetCommit.pairSelectionSources)

    // Update current commit index
    setCurrentCommitIndex(commitIndex)

    console.log('[FeatureSplitView] Restored commit', commitIndex, 'with', targetCommit.pairSelectionStates.size, 'pairs')
  }, [tagCommitHistory, currentCommitIndex, pairSelectionStates, pairSelectionSources, restorePairSelectionStates])

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  // Check if histogram is bimodal (enables Tag All button)
  // Uses score >= 0.5 (Level 4: Likely Bimodal or higher)
  const isBimodal = useMemo(() => {
    return isBimodalScore(tagAutomaticState?.histogramData?.bimodality)
  }, [tagAutomaticState?.histogramData?.bimodality])

  // Check if all pairs are tagged (no unsure remaining) - enables Move to Next Stage button
  const allPairsTagged = useMemo(() => {
    if (pairList.length === 0) return false
    return pairList.every(pair => pairSelectionStates.has(pair.pairKey))
  }, [pairList, pairSelectionStates])

  // Handle Tag All - Option 1: Tag all unsure as Monosemantic
  const handleTagAllMonosemantic = useCallback(() => {
    console.log('[TagAll] Monosemantic option clicked')
    console.log('[TagAll] pairList length:', pairList.length)
    console.log('[TagAll] current pairSelectionStates size:', pairSelectionStates.size)

    // 1. Save current state to current commit before applying new tags
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        pairSelectionStates: new Map(pairSelectionStates),
        pairSelectionSources: new Map(pairSelectionSources)
      }
      return updated
    })

    const newStates = new Map(pairSelectionStates)
    const newSources = new Map(pairSelectionSources)

    let taggedCount = 0
    // Tag all untagged pairs as rejected (Monosemantic)
    pairList.forEach(pair => {
      if (!newStates.has(pair.pairKey)) {
        newStates.set(pair.pairKey, 'rejected')
        newSources.set(pair.pairKey, 'manual')
        taggedCount++
      }
    })

    console.log('[TagAll] Tagged', taggedCount, 'pairs as Monosemantic')
    console.log('[TagAll] New states size:', newStates.size)

    restorePairSelectionStates(newStates, newSources)
    setShowTagAllPopover(false)

    // 2. Create a new commit with the updated state
    const newCommit: TagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      pairSelectionStates: new Map(newStates),
      pairSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))

    // Save to global store for potential Stage 1 revisit (include feature IDs for pair fetching)
    setStage1FinalCommit({
      pairSelectionStates: new Map(newStates),
      pairSelectionSources: new Map(newSources),
      featureIds: selectedFeatureIds ? new Set(selectedFeatureIds) : new Set()
    })

    console.log('[TagAll] Created tagAll commit and saved to store, history length:', tagCommitHistory.length + 1)
  }, [pairList, pairSelectionStates, pairSelectionSources, restorePairSelectionStates, currentCommitIndex, tagCommitHistory.length, setStage1FinalCommit, selectedFeatureIds])

  // Handle Tag All - Option 2: Use SVM decision boundary (score >= 0 → Fragmented, score < 0 → Monosemantic)
  const handleTagAllByBoundary = useCallback(() => {
    console.log('[TagAll] By Decision Boundary (score=0) option clicked')

    // 1. Save current state to current commit before applying new tags
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        pairSelectionStates: new Map(pairSelectionStates),
        pairSelectionSources: new Map(pairSelectionSources)
      }
      return updated
    })

    const newStates = new Map(pairSelectionStates)
    const newSources = new Map(pairSelectionSources)

    let selectedCount = 0
    let rejectedCount = 0

    // Tag all pairs using SVM similarity scores with threshold 0
    // score >= 0 → Fragmented (selected), score < 0 → Monosemantic (rejected)
    pairList.forEach(pair => {
      // Skip if already tagged
      if (newStates.has(pair.pairKey)) return

      const score = pairSimilarityScores.get(pair.pairKey)
      if (score !== undefined) {
        if (score >= 0) {
          newStates.set(pair.pairKey, 'selected')
          newSources.set(pair.pairKey, 'manual')
          selectedCount++
        } else {
          newStates.set(pair.pairKey, 'rejected')
          newSources.set(pair.pairKey, 'manual')
          rejectedCount++
        }
      } else {
        // No score available - default to Monosemantic (conservative)
        newStates.set(pair.pairKey, 'rejected')
        newSources.set(pair.pairKey, 'manual')
        rejectedCount++
      }
    })

    console.log('[TagAll] By Decision Boundary results:', {
      fragmentedAboveZero: selectedCount,
      monosemanticBelowZero: rejectedCount,
      totalNewStates: newStates.size
    })

    restorePairSelectionStates(newStates, newSources)
    setShowTagAllPopover(false)

    // 2. Create a new commit with the updated state
    const newCommit: TagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      pairSelectionStates: new Map(newStates),
      pairSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))

    // Save to global store for potential Stage 1 revisit (include feature IDs for pair fetching)
    setStage1FinalCommit({
      pairSelectionStates: new Map(newStates),
      pairSelectionSources: new Map(newSources),
      featureIds: selectedFeatureIds ? new Set(selectedFeatureIds) : new Set()
    })

    console.log('[TagAll] Created tagAll commit and saved to store, history length:', tagCommitHistory.length + 1)
  }, [pairList, pairSelectionStates, pairSelectionSources, pairSimilarityScores, restorePairSelectionStates, currentCommitIndex, tagCommitHistory.length, setStage1FinalCommit, selectedFeatureIds])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`feature-split-view ${className}`}>
      {/* Header - Full width */}
      <div className="feature-split-view__header">
        <h3 className="feature-split-view__title">Candidate Validation</h3>
        <p className="feature-split-view__description">
          Validate features for{' '}
          <span
            className="feature-split-view__tag-badge"
            style={{ backgroundColor: fragmentedColor }}
          >
            Fragmented
          </span>
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
          commitHistory={tagCommitHistory}
          currentCommitIndex={currentCommitIndex}
          onCommitClick={handleCommitClick}
        />

        {/* Right column: 2 rows */}
        <div className="feature-split-view__content">
        {/* Top row: Pair list + FeatureSplitPairViewer */}
        <div className="feature-split-view__row-top">
          <ScrollableItemList
            width={210}
            badges={[
              { label: 'All Pairs', count: `${pairList.length} pairs` }
            ]}
            columnHeader={uncertaintySortedPairKeys ? { label: 'Confidence', sortDirection: 'asc' } : undefined}
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
            autoAdvance={activeListSource === 'all'}
          />
        </div>

        {/* Bottom row: Histogram + Apply Tags button + Monosemantic list + Fragmented list */}
        <div className="feature-split-view__row-bottom">
          {/* Left: Histogram */}
          <TagAutomaticPanel
            mode="pair"
            availablePairs={pairList}
            filteredFeatureIds={selectedFeatureIds || undefined}
            threshold={clusteringThreshold}
          />

          {/* Button container - between histogram and boundary lists */}
          <div className="feature-split-view__apply-button-container">
            {/* Apply Threshold button */}
            <button
              className="feature-split-view__apply-button"
              onClick={handleApplyTags}
              disabled={!hasItemsToTag}
              title={hasItemsToTag ? 'Apply auto-tags and sort by uncertainty' : 'No pairs in threshold regions to tag'}
            >
              Apply Threshold
            </button>

            {/* Bimodality Indicator + Tag All (visually connected) */}
            <div className={`feature-split-view__bimodal-group ${isBimodal ? 'feature-split-view__bimodal-group--active' : ''}`}>
              <BimodalityIndicator bimodality={tagAutomaticState?.histogramData?.bimodality} />
              <button
                ref={tagAllButtonRef}
                className={`feature-split-view__tag-all-button ${isBimodal ? 'feature-split-view__tag-all-button--active' : ''}`}
                onClick={() => {
                  if (tagAllButtonRef.current) {
                    const rect = tagAllButtonRef.current.getBoundingClientRect()
                    setPopoverPosition({
                      top: rect.bottom + 6,
                      left: rect.left + rect.width / 2
                    })
                  }
                  setShowTagAllPopover(true)
                }}
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
                  <div className="tag-all-popover__title">Tag remaining pairs:</div>
                  <button
                    className="tag-all-popover__option tag-all-popover__option--default"
                    onClick={handleTagAllMonosemantic}
                  >
                    As Monosemantic
                  </button>
                  <button
                    className="tag-all-popover__option"
                    onClick={handleTagAllByBoundary}
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
              className="feature-split-view__next-stage-button"
              onClick={moveToNextStep}
              disabled={!allPairsTagged}
              title={allPairsTagged ? 'Proceed to Quality stage' : 'Tag all pairs first'}
            >
              Next Stage →
            </button>
          </div>

          {/* Monosemantic list - below reject threshold */}
          <ScrollableItemList
            width={260}
            badges={[
              { label: 'Monosemantic', count: `${boundaryItems.rejectBelow.length} pairs` }
            ]}
            columnHeader={{ label: 'Confidence', sortDirection: 'asc' }}
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
              { label: 'Fragmented', count: `${boundaryItems.selectAbove.length} pairs` }
            ]}
            columnHeader={{ label: 'Confidence', sortDirection: 'asc' }}
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
