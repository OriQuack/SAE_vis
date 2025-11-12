import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, DecoderStagePairRow, StageTableContext } from '../types'
import { METRIC_DECODER_SIMILARITY } from '../lib/constants'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORIES } from '../lib/tag-constants'
import {
  getBadgeConfig,
  getRowBackgroundColor,
  getRowStyleProperties,
  getRowCategoryClass
} from '../lib/table-color-utils'
import { extractInterFeaturePositions, mergeInterFeaturePositions } from '../lib/activation-utils'
import ActivationExample from './TableActivationExample'
import ScoreCircle from './TableScoreCircle'
import SimilarityTaggingPopover from './TagAutomaticPopover'
import TableSelectionPanel from './TableSelectionPanel'
import '../styles/QualityTable.css'
import '../styles/FeatureSplitTable.css'

// ============================================================================
// DECODER SIMILARITY STAGE TABLE
// ============================================================================

interface DecoderSimilarityTableProps {
  className?: string
}

const DecoderSimilarityTable: React.FC<DecoderSimilarityTableProps> = ({ className = '' }) => {
  // State from store
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const tableData = useVisualizationStore(state => state.tableData)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const togglePairSelection = useVisualizationStore(state => state.togglePairSelection)
  const loading = useVisualizationStore(state => state.loading)
  const setTableScrollState = useVisualizationStore(state => state.setTableScrollState)
  const pairSimilarityScores = useVisualizationStore(state => state.pairSimilarityScores)
  const tableSortBy = useVisualizationStore(state => state.tableSortBy)

  // Similarity tagging (automatic tagging) state and action
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Get badge labels and colors from centralized utility
  const badgeConfig = useMemo(() => getBadgeConfig('pair'), [])

  // Sorting state
  const [sortBy, setSortBy] = useState<'id' | 'decoder_similarity' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)

  // Hover state for coordinating activation example overlays across both columns
  const [hoveredPairKey, setHoveredPairKey] = useState<string | null>(null)

  // Inter-feature pattern highlighting state (supports multiple pairs)
  const [interFeatureHighlights, setInterFeatureHighlights] = useState<Map<string, {
    mainFeatureId: number
    similarFeatureId: number
    type: 'char' | 'word'
    mainPositions: any
    similarPositions: any
  }>>(new Map())
  const [hoverHighlight, setHoverHighlight] = useState<{
    mainFeatureId: number
    similarFeatureId: number
    type: 'char' | 'word'
    mainPositions: any
    similarPositions: any
  } | null>(null)

  // Helper function to handle badge hover/click for inter-feature highlighting
  const handleBadgeInteraction = (
    mainFeatureId: number,
    similarFeatureId: number,
    interfeatureData: any,
    isClick: boolean
  ) => {
    const key = `${mainFeatureId}-${similarFeatureId}`

    if (isClick) {
      // Click: Toggle persistent highlight
      setInterFeatureHighlights(prev => {
        const newMap = new Map(prev)
        if (newMap.has(key)) {
          newMap.delete(key) // Toggle off
        } else {
          // Extract positions using utility
          const extracted = extractInterFeaturePositions(interfeatureData)
          if (extracted) {
            newMap.set(key, {
              mainFeatureId,
              similarFeatureId,
              type: extracted.type!,
              mainPositions: extracted.mainPositions,
              similarPositions: extracted.similarPositions
            })
          } else {
            // No positions, but still mark as selected (for visual highlighting)
            newMap.set(key, {
              mainFeatureId,
              similarFeatureId,
              type: 'char',
              mainPositions: undefined,
              similarPositions: undefined
            })
          }
        }
        return newMap
      })
    } else {
      // Hover: Temporary highlight (skip if no pattern data)
      const extracted = extractInterFeaturePositions(interfeatureData)
      if (!extracted) return

      setHoverHighlight({
        mainFeatureId,
        similarFeatureId,
        type: extracted.type!,
        mainPositions: extracted.mainPositions,
        similarPositions: extracted.similarPositions
      })
    }
  }

  const handleBadgeLeave = () => {
    // Clear hover highlight
    setHoverHighlight(null)
  }

  // Helper function to compute merged inter-feature positions for a given feature
  // Only applies highlights if the pairKey matches the clicked/hovered pair
  // This prevents highlighting all rows that contain the feature
  const getInterFeaturePositionsForFeature = React.useMemo(() => {
    return (featureId: number, currentPairKey?: string) => {
      const allHighlights: Array<{ type: 'char' | 'word', positions: any }> = []

      // 1. Collect from clicked highlights (ONLY if currentPairKey matches)
      if (currentPairKey && interFeatureHighlights.has(currentPairKey)) {
        const highlight = interFeatureHighlights.get(currentPairKey)!
        if (highlight.mainFeatureId === featureId) {
          allHighlights.push({ type: highlight.type, positions: highlight.mainPositions })
        } else if (highlight.similarFeatureId === featureId) {
          allHighlights.push({ type: highlight.type, positions: highlight.similarPositions })
        }
      }

      // 2. Add hover highlight (ONLY if currentPairKey matches)
      if (hoverHighlight && currentPairKey && hoveredPairKey === currentPairKey) {
        if (hoverHighlight.mainFeatureId === featureId) {
          allHighlights.push({ type: hoverHighlight.type, positions: hoverHighlight.mainPositions })
        } else if (hoverHighlight.similarFeatureId === featureId) {
          allHighlights.push({ type: hoverHighlight.type, positions: hoverHighlight.similarPositions })
        }
      }

      // 3. Merge using utility function
      return mergeInterFeaturePositions(allHighlights)
    }
  }, [interFeatureHighlights, hoverHighlight, hoveredPairKey])

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Track activation column width to pass to ActivationExample components
  const [activationColumnWidth, setActivationColumnWidth] = useState<number>(630) // Default width

  // Activation examples from global store (centralized cache)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)

  // Track which features we've already requested to prevent infinite loops
  const requestedFeatureIds = useRef<Set<number>>(new Set())

  // Get stage context
  const stageContext = useMemo<StageTableContext | null>(() => {
    if (!activeStageNodeId || !leftPanel.sankeyTree) {
      return null
    }

    const node = leftPanel.sankeyTree.get(activeStageNodeId)
    if (!node) {
      return null
    }

    return {
      nodeId: activeStageNodeId,
      metric: node.metric || METRIC_DECODER_SIMILARITY,
      rangeLabel: node.rangeLabel,
      featureCount: node.featureCount
    }
  }, [activeStageNodeId, leftPanel.sankeyTree])

  // Compute stage features for header display
  const stageFeatures = useMemo(() => {
    if (!stageContext || !tableData || !leftPanel.sankeyTree) {
      return []
    }

    const node = leftPanel.sankeyTree.get(stageContext.nodeId)
    if (!node) {
      return []
    }

    // Collect all feature IDs from this decoder similarity stage
    let allFeatureIds = new Set<number>()

    if (node.children && node.children.length > 0) {
      node.children.forEach(childId => {
        const childNode = leftPanel.sankeyTree.get(childId)
        if (childNode) {
          childNode.featureIds.forEach(fid => allFeatureIds.add(fid))
        }
      })
    } else {
      allFeatureIds = node.featureIds
    }

    // Filter features to only those in this stage
    return tableData.features.filter(
      (feature: FeatureTableRow) => allFeatureIds.has(feature.feature_id)
    )
  }, [stageContext, tableData, leftPanel.sankeyTree])

  // Process table data to create decoder stage pair rows (horizontal layout)
  const stageRows = useMemo<DecoderStagePairRow[]>(() => {
    if (!stageContext || !tableData || stageFeatures.length === 0) {
      return []
    }

    // Transform to decoder stage pair rows - one row per pair (feature + similar feature)
    const rows: DecoderStagePairRow[] = stageFeatures.flatMap((feature: FeatureTableRow) => {
      // Get decoder similarity data - safely ensure it's an array
      const decoderData = Array.isArray(feature.decoder_similarity) ? feature.decoder_similarity : []

      // Extract top 4 similar features (not including self)
      const top4Similar = decoderData.slice(0, 4)

      // Create rows for ALL pairs (even if similar feature not in current dataset)
      // We'll track which pairs are "valid" (have complete data) separately
      return top4Similar.map(similarItem => {
        // IMPORTANT: Use canonical key format (smaller ID first) to match API response
        const id1 = feature.feature_id
        const id2 = similarItem.feature_id
        const canonicalPairKey = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`

        return {
          pairKey: canonicalPairKey,
          mainFeature: {
            feature_id: feature.feature_id,
            pattern_type: (activationExamples[feature.feature_id]?.pattern_type || 'None') as 'Lexical' | 'Semantic' | 'Both' | 'None'
          },
          similarFeature: {
            feature_id: similarItem.feature_id,
            cosine_similarity: similarItem.cosine_similarity,
            pattern_type: (activationExamples[similarItem.feature_id]?.pattern_type || 'None') as 'Lexical' | 'Semantic' | 'Both' | 'None',
            inter_feature_similarity: similarItem.inter_feature_similarity || null
          }
        }
      })
    })

    // Deduplicate pairs: only keep one of (A, B) and (B, A)
    // This prevents showing redundant pairs like (1,2) and (2,1)
    const seenPairs = new Set<string>()
    const deduplicatedRows: DecoderStagePairRow[] = []

    for (const row of rows) {
      const id1 = row.mainFeature.feature_id
      const id2 = row.similarFeature.feature_id

      // Create canonical key: smaller ID first to ensure (1,2) and (2,1) map to same key
      const canonicalKey = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`

      if (!seenPairs.has(canonicalKey)) {
        seenPairs.add(canonicalKey)
        deduplicatedRows.push(row)
      }
    }

    return deduplicatedRows
  }, [stageContext, tableData, stageFeatures, activationExamples])

  // Get frozen selection states from store (used when sorted by similarity)
  const pairSortedBySelectionStates = useVisualizationStore(state => state.pairSortedBySelectionStates)

  // Sort rows by main feature ID, decoder similarity, or by pair similarity (three-tier)
  const sortedRows = useMemo(() => {
    console.log('[FeatureSplitTable] sortedRows useMemo triggered:', {
      tableSortBy,
      localSortBy: sortBy,
      localSortDirection: sortDirection,
      willUsePairSimilarity: tableSortBy === 'pair_similarity'
    })

    // If using pair similarity sort, implement three-tier logic with FROZEN states
    if (tableSortBy === 'pair_similarity') {
      const selected: DecoderStagePairRow[] = []
      const unselected: DecoderStagePairRow[] = []
      const rejected: DecoderStagePairRow[] = []

      // Use FROZEN selection states from when sort was performed
      // This prevents re-grouping when user changes selection after sorting
      const groupingStates = pairSortedBySelectionStates || new Map<string, 'selected' | 'rejected'>()

      // Separate into three groups based on FROZEN states
      stageRows.forEach(row => {
        const frozenState = groupingStates.get(row.pairKey)

        if (frozenState === 'selected') {
          selected.push(row)
        } else if (frozenState === 'rejected') {
          rejected.push(row)
        } else {
          unselected.push(row)
        }
      })

      // Sort unselected by similarity score (descending)
      // Validate that we have scores before sorting
      const scoresAvailable = pairSimilarityScores.size > 0
      if (!scoresAvailable) {
        console.warn('[FeatureSplitTable] ⚠️  pairSimilarityScores is empty - cannot sort by similarity!')
      }

      // Sample a few scores for debugging
      const samplePairs = unselected.slice(0, 3)
      console.log('[FeatureSplitTable] Sample pair keys and scores:',
        samplePairs.map(p => ({
          key: p.pairKey,
          score: pairSimilarityScores.get(p.pairKey) ?? 'MISSING'
        }))
      )

      unselected.sort((a, b) => {
        const aScore = pairSimilarityScores.get(a.pairKey) ?? -Infinity
        const bScore = pairSimilarityScores.get(b.pairKey) ?? -Infinity

        // Debug: Log if scores are missing (only first few to avoid spam)
        if ((aScore === -Infinity || bScore === -Infinity) && unselected.indexOf(a) < 5) {
          if (aScore === -Infinity) {
            console.warn('[FeatureSplitTable] Missing score for pair:', a.pairKey)
          }
          if (bScore === -Infinity) {
            console.warn('[FeatureSplitTable] Missing score for pair:', b.pairKey)
          }
        }

        return bScore - aScore // Descending (higher scores first)
      })

      console.log('[FeatureSplitTable] Pair similarity sort applied:', {
        selected: selected.length,
        unselected: unselected.length,
        rejected: rejected.length,
        usingFrozenStates: !!pairSortedBySelectionStates,
        scoresMapSize: pairSimilarityScores.size,
        hasScores: scoresAvailable
      })

      // Return three-tier: selected, sorted unselected, rejected
      return [...selected, ...unselected, ...rejected]
    }

    // Otherwise, apply regular sorting (ID or decoder similarity)
    if (!sortBy || !sortDirection) return stageRows

    const sorted = [...stageRows]
    sorted.sort((a, b) => {
      let compareValue = 0

      if (sortBy === 'id') {
        // Sort by the main feature ID
        const aMainId = a.mainFeature.feature_id
        const bMainId = b.mainFeature.feature_id
        compareValue = aMainId - bMainId
      } else if (sortBy === 'decoder_similarity') {
        // Sort by the decoder similarity of this pair
        const aSim = a.similarFeature.cosine_similarity
        const bSim = b.similarFeature.cosine_similarity
        compareValue = aSim - bSim
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [stageRows, sortBy, sortDirection, tableSortBy, pairSortedBySelectionStates, pairSimilarityScores])

  // Virtual scrolling for performance with large datasets
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 60, // Estimate ~60px per row (single pair with activation examples)
    overscan: 5, // Render 5 extra items above/below for smooth scrolling
  })

  // Handle sort click
  const handleSort = (column: 'id' | 'decoder_similarity') => {
    // Clear similarity sort if active (allow switching to regular column sort)
    if (tableSortBy === 'pair_similarity') {
      const setTableSort = useVisualizationStore.getState().setTableSort
      setTableSort(null, null)
    }

    if (sortBy === column) {
      // Cycle: null → asc → desc → null
      if (sortDirection === null) {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        setSortBy(null)
        setSortDirection(null)
      }
    } else {
      setSortBy(column)
      setSortDirection('asc')
    }
  }

  // Handle pair selection
  const handlePairToggle = (mainFeatureId: number, similarFeatureId: number) => {
    // IMPORTANT: Use canonical key format (smaller ID first)
    const pairKey = mainFeatureId < similarFeatureId
      ? `${mainFeatureId}-${similarFeatureId}`
      : `${similarFeatureId}-${mainFeatureId}`
    const currentState = pairSelectionStates.get(pairKey)

    // After toggle, the new state will be: null -> selected -> rejected -> null
    const willBeSelected = currentState === undefined // null -> selected

    if (willBeSelected) {
      // Show inter-feature highlights when selecting
      const feature = tableData?.features.find((f: FeatureTableRow) => f.feature_id === mainFeatureId)
      const similarItem = feature?.decoder_similarity?.find((s: any) => s.feature_id === similarFeatureId)
      const interfeatureData = similarItem?.inter_feature_similarity

      // Extract using utility (replaces 30 lines!)
      const extracted = extractInterFeaturePositions(interfeatureData)
      if (extracted) {
        setInterFeatureHighlights(prev => {
          const newMap = new Map(prev)
          newMap.set(pairKey, {
            mainFeatureId,
            similarFeatureId,
            type: extracted.type!,
            mainPositions: extracted.mainPositions,
            similarPositions: extracted.similarPositions
          })
          return newMap
        })
      }
    } else {
      // Clear highlights
      setInterFeatureHighlights(prev => {
        const newMap = new Map(prev)
        newMap.delete(pairKey)
        return newMap
      })
    }

    togglePairSelection(mainFeatureId, similarFeatureId)
  }

  // Measure activation column width once (eliminates shifting in ActivationExample)
  useEffect(() => {
    if (!tableContainerRef.current) return

    const measureActivationColumn = () => {
      const headerCell = tableContainerRef.current?.querySelector('.decoder-stage-table__header-cell--activation')
      if (headerCell) {
        const width = headerCell.getBoundingClientRect().width
        if (width > 0) {
          setActivationColumnWidth(width)
        }
      }
    }

    // Initial measurement
    measureActivationColumn()

    // Watch for table resize
    const observer = new ResizeObserver(measureActivationColumn)
    observer.observe(tableContainerRef.current)

    return () => observer.disconnect()
  }, [])

  // ============================================================================
  // ⚠️ TEMPORARY FIX: Fetch missing activation examples for decoder similarity stage
  // ============================================================================
  // ISSUE: Initial table has 824 features, but full dataset has 16,384 features.
  //        When decoder similarity stage is added, additional features appear
  //        that weren't in the initial 824, so they're not pre-fetched.
  //
  // TEMPORARY SOLUTION: Fetch missing features when decoder similarity stage loads
  //
  // TODO: Remove this when one of these is implemented:
  //       1. Pre-fetch ALL 16,384 features on app startup (memory intensive)
  //       2. Implement proper pagination/virtual scrolling with on-demand loading
  //       3. Load full table data (16,384 rows) initially instead of just 824
  //
  // For now, this ensures decoder similarity table works correctly.
  // ============================================================================
  useEffect(() => {
    if (!stageContext || sortedRows.length === 0) return

    // Extract all unique feature IDs from decoder similarity rows (main + similar)
    const allFeatureIds = Array.from(
      new Set(
        sortedRows.flatMap(row => [
          row.mainFeature.feature_id,
          row.similarFeature.feature_id
        ])
      )
    )

    // Check which features are missing from cache AND not already requested
    // IMPORTANT: Don't check activationExamples here to avoid infinite loop
    const missingFeatureIds = allFeatureIds.filter(
      id => !requestedFeatureIds.current.has(id)
    )

    // Fetch only missing features (store handles deduplication and cache checking)
    if (missingFeatureIds.length > 0) {
      console.log(
        '[DecoderSimilarityTable] 🔧 TEMPORARY: Fetching',
        missingFeatureIds.length,
        'missing activation examples for decoder similarity stage'
      )
      console.log(
        '[DecoderSimilarityTable] ⚠️ TODO: Remove this when full dataset (16,384 features) is loaded initially'
      )

      // Mark as requested BEFORE calling fetch to prevent duplicate requests
      missingFeatureIds.forEach(id => requestedFeatureIds.current.add(id))

      // Store's fetchActivationExamples handles cache checking and deduplication
      fetchActivationExamples(missingFeatureIds)
    }
  }, [stageContext, sortedRows, fetchActivationExamples])
  // NOTE: activationExamples is NOT in dependencies to prevent infinite loop

  // Track scroll state for Sankey vertical bar scroll indicator
  useEffect(() => {
    const container = tableContainerRef.current
    if (!container) return

    let rafId: number | null = null
    let lastScrollState: any = null

    const measureAndUpdate = () => {
      if (!container) return
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        const totalFeatures = sortedRows.length

        // FIXED: Correct scroll percentage calculation
        // scrollPercentage should be: scrollTop / (scrollHeight - clientHeight)
        // This ensures proper positioning, especially at the bottom
        const scrollableHeight = container.scrollHeight - container.clientHeight
        const scrollPercentage = scrollableHeight > 0
          ? container.scrollTop / scrollableHeight
          : 0

        // Clamp to [0, 1] to avoid edge case calculations
        const clampedScrollPercentage = Math.min(Math.max(scrollPercentage, 0), 1)

        // Calculate visible range based on corrected scroll percentage
        const visibleRange = container.clientHeight / container.scrollHeight
        const firstVisibleIndex = Math.floor(clampedScrollPercentage * totalFeatures)
        const lastVisibleIndex = Math.min(
          Math.ceil((clampedScrollPercentage + visibleRange) * totalFeatures),
          totalFeatures
        )

        // Extract visible feature IDs using simple array slice
        const visibleFeatureIds = new Set<number>(
          sortedRows.slice(firstVisibleIndex, lastVisibleIndex).flatMap(row => [
            row.mainFeature.feature_id,
            row.similarFeature.feature_id
          ])
        )

        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          visibleFeatureIds
        }

        // FIXED: Only update if state actually changed (avoid unnecessary re-renders)
        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          const stateChanged = !lastScrollState ||
            lastScrollState.scrollTop !== scrollState.scrollTop ||
            lastScrollState.scrollHeight !== scrollState.scrollHeight ||
            lastScrollState.clientHeight !== scrollState.clientHeight ||
            lastScrollState.visibleFeatureIds.size !== scrollState.visibleFeatureIds.size

          if (stateChanged) {
            lastScrollState = scrollState
            setTableScrollState(scrollState)
          }
        }

        rafId = null
      })
    }

    // Add scroll event listener
    const handleScrollEvent = () => measureAndUpdate()
    container.addEventListener('scroll', handleScrollEvent, { passive: true })

    // Observe container size changes
    const resizeObserver = new ResizeObserver(() => measureAndUpdate())
    resizeObserver.observe(container)

    // Initial measurement
    measureAndUpdate()

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      container.removeEventListener('scroll', handleScrollEvent)
      resizeObserver.disconnect()
    }
  }, [setTableScrollState, sortedRows])  // FIXED: Removed rowVirtualizer to prevent cascade re-runs

  // Empty state
  if (!stageContext) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__placeholder">
          No stage selected
        </div>
      </div>
    )
  }

  // Render
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {loading.table && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Unified Selection Panel with header, buttons, and state bar */}
      <TableSelectionPanel
        mode="pair"
        tagLabel={TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].label}
        onDone={moveToNextStep}
        doneButtonEnabled={true}
      />

      {/* Table */}
      <div className="table-panel__content feature-split-table" ref={tableContainerRef}>
        <table className="table-panel__table--simple">
          <thead className="table-panel__thead">
            <tr className="table-panel__header-row">
              <th className="table-panel__header-cell table-panel__header-cell--index">
                #
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--checkbox">
                Feature Splitting
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--id-pair"
                onClick={() => handleSort('id')}
              >
                ID Pair
                {sortBy === 'id' && sortDirection === 'asc' && <span className="table-panel__sort-indicator asc" />}
                {sortBy === 'id' && sortDirection === 'desc' && <span className="table-panel__sort-indicator desc" />}
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--score"
                onClick={() => handleSort('decoder_similarity')}
              >
                Decoder Similarity
                {sortBy === 'decoder_similarity' && sortDirection === 'asc' && <span className="table-panel__sort-indicator asc" />}
                {sortBy === 'decoder_similarity' && sortDirection === 'desc' && <span className="table-panel__sort-indicator desc" />}
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--activation decoder-stage-table__header-cell--activation-main">
                Activation Example
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--activation decoder-stage-table__header-cell--activation-similar">
                Activation Example
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {/* Top padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
                <td colSpan={6} />
              </tr>
            )}

            {/* Render only visible virtual items (each item is a single pair row) */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = sortedRows[virtualRow.index]
              const pairSelectionState = pairSelectionStates.get(row.pairKey)
              const pairSelectionSource = pairSelectionSources.get(row.pairKey)

              // Determine row styling using centralized color functions
              const categoryClass = getRowCategoryClass(pairSelectionState, pairSelectionSource)
              const rowBackgroundColor = getRowBackgroundColor(pairSelectionState, pairSelectionSource)

              // Build row className with selection state AND auto-tagged indicator
              const rowClassName = [
                'table-panel__sub-row',
                categoryClass,
                // Add auto-tagged indicator for items tagged via "Tag Automatically"
                pairSelectionSource === 'auto' ? 'table-panel__sub-row--auto-tagged' : ''
              ].filter(Boolean).join(' ')

              return (
                <tr
                  key={row.pairKey}
                  className={rowClassName}
                  onClick={(e) => {
                    // Allow clicking anywhere on the row to toggle the pair selection
                    // but don't toggle if clicking interactive elements
                    const target = e.target as HTMLElement
                    if (!target.closest('.table-panel__category-badge, .decoder-stage-table__cell--activation, .decoder-stage-table__cell--decoder-similarity')) {
                      handlePairToggle(row.mainFeature.feature_id, row.similarFeature.feature_id)
                    }
                  }}
                  style={{
                    ...getRowStyleProperties(rowBackgroundColor) as React.CSSProperties,
                    cursor: 'pointer'
                  }}
                >
                  {/* Index cell */}
                  <td className="table-panel__cell table-panel__cell--index">
                    {virtualRow.index + 1}
                  </td>

                  {/* Category badge: null -> fragmented -> monosemantic -> null */}
                  <td className="table-panel__cell decoder-stage-table__cell--checkbox">
                    {(() => {
                      if (!pairSelectionState) return null

                      const config = pairSelectionState === 'selected' ? badgeConfig.selected : badgeConfig.rejected
                      const { label, color } = config

                      return (
                        <div
                          className="table-panel__category-badge"
                          style={{ backgroundColor: color }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePairToggle(row.mainFeature.feature_id, row.similarFeature.feature_id)
                          }}
                          title={label}
                        >
                          {label}
                        </div>
                      )
                    })()}
                  </td>

                  {/* ID Pair */}
                  <td className="table-panel__cell table-panel__cell--id-pair">
                    ({row.mainFeature.feature_id}, {row.similarFeature.feature_id})
                  </td>

                  {/* Decoder Similarity Score - Horizontal visualization */}
                  <td className="decoder-stage-table__cell--decoder-similarity" style={{ position: 'relative', overflow: 'visible' }}>
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        // Handle click interaction
                        handleBadgeInteraction(
                          row.mainFeature.feature_id,
                          row.similarFeature.feature_id,
                          row.similarFeature.inter_feature_similarity,
                          true
                        )
                      }}
                      onMouseEnter={() => {
                        // Handle hover interaction
                        handleBadgeInteraction(
                          row.mainFeature.feature_id,
                          row.similarFeature.feature_id,
                          row.similarFeature.inter_feature_similarity,
                          false
                        )

                        // Fetch activation examples if needed
                        const featuresToFetch = []
                        if (!activationExamples[row.mainFeature.feature_id]) {
                          featuresToFetch.push(row.mainFeature.feature_id)
                        }
                        if (!activationExamples[row.similarFeature.feature_id]) {
                          featuresToFetch.push(row.similarFeature.feature_id)
                        }
                        if (featuresToFetch.length > 0) {
                          fetchActivationExamples(featuresToFetch)
                        }

                        // Notify parent to show activation overlays
                        setHoveredPairKey(row.pairKey)
                      }}
                      onMouseLeave={() => {
                        // Clear hover highlight
                        handleBadgeLeave()

                        // Notify parent to hide activation overlays
                        setHoveredPairKey(null)
                      }}
                    >
                      <ScoreCircle
                        score={row.similarFeature.cosine_similarity}
                        metric="decoder_similarity"
                        useSolidColor={true}
                        label={row.similarFeature.cosine_similarity.toFixed(3)}
                        tooltipText={`Decoder Similarity: ${row.similarFeature.cosine_similarity.toFixed(3)}`}
                        showLabel={true}
                      />
                    </div>
                  </td>

                  {/* Main Feature Activation Example */}
                  <td className="table-panel__cell decoder-stage-table__cell--activation decoder-stage-table__cell--activation-main" style={{ position: 'relative', overflow: 'visible' }}>
                    {activationExamples[row.mainFeature.feature_id] ? (
                      <ActivationExample
                        examples={activationExamples[row.mainFeature.feature_id]}
                        containerWidth={activationColumnWidth}
                        interFeaturePositions={getInterFeaturePositionsForFeature(row.mainFeature.feature_id, row.pairKey)}
                        isHovered={hoveredPairKey === row.pairKey}
                        onHoverChange={(isHovered) => {
                          setHoveredPairKey(isHovered ? row.pairKey : null)
                          if (isHovered) {
                            // Trigger inter-feature highlighting on hover
                            const feature = tableData?.features.find((f: FeatureTableRow) => f.feature_id === row.mainFeature.feature_id)
                            const similarItem = feature?.decoder_similarity?.find((s: any) => s.feature_id === row.similarFeature.feature_id)
                            const interfeatureData = similarItem?.inter_feature_similarity
                            handleBadgeInteraction(row.mainFeature.feature_id, row.similarFeature.feature_id, interfeatureData, false)
                          } else {
                            handleBadgeLeave()
                          }
                        }}
                      />
                    ) : (
                      <span className="table-panel__placeholder">—</span>
                    )}
                  </td>

                  {/* Similar Feature Activation Example */}
                  <td className="table-panel__cell decoder-stage-table__cell--activation decoder-stage-table__cell--activation-similar" style={{ position: 'relative', overflow: 'visible' }}>
                    {activationExamples[row.similarFeature.feature_id] ? (
                      <ActivationExample
                        examples={activationExamples[row.similarFeature.feature_id]}
                        containerWidth={activationColumnWidth}
                        interFeaturePositions={getInterFeaturePositionsForFeature(row.similarFeature.feature_id, row.pairKey)}
                        isHovered={hoveredPairKey === row.pairKey}
                        onHoverChange={(isHovered) => {
                          setHoveredPairKey(isHovered ? row.pairKey : null)
                          if (isHovered) {
                            // Trigger inter-feature highlighting on hover
                            const feature = tableData?.features.find((f: FeatureTableRow) => f.feature_id === row.mainFeature.feature_id)
                            const similarItem = feature?.decoder_similarity?.find((s: any) => s.feature_id === row.similarFeature.feature_id)
                            const interfeatureData = similarItem?.inter_feature_similarity
                            handleBadgeInteraction(row.mainFeature.feature_id, row.similarFeature.feature_id, interfeatureData, false)
                          } else {
                            handleBadgeLeave()
                          }
                        }}
                      />
                    ) : (
                      <span className="table-panel__placeholder">—</span>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* Bottom padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{
                height: `${
                  rowVirtualizer.getTotalSize() -
                  (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0)
                }px`
              }}>
                <td colSpan={6} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Similarity tagging popover (automatic tagging) */}
      <SimilarityTaggingPopover />

    </div>
  )
}

export default DecoderSimilarityTable
