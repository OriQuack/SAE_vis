import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, DecoderStagePairRow, StageTableContext, FeatureSplitGroupedRow, FeatureSplitSubColumn } from '../types'
import { METRIC_DECODER_SIMILARITY } from '../lib/constants'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORIES } from '../lib/tag-constants'
import {
  getBadgeConfig
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
  // Default: Assume ~85% table width for combined cell, minus 100px labels, divided by 4 columns
  const [activationColumnWidth, setActivationColumnWidth] = useState<number>(300) // Default width per column

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

  // Group pairs by main feature ID for compact row layout
  // Creates 1 row per main feature with 4 sub-columns: [main, similar1, similar2, similar3]
  const groupedRows = useMemo<FeatureSplitGroupedRow[]>(() => {
    if (stageRows.length === 0) return []

    // Group pairs by main feature ID
    const groupsMap = new Map<number, DecoderStagePairRow[]>()
    stageRows.forEach(row => {
      const mainId = row.mainFeature.feature_id
      if (!groupsMap.has(mainId)) {
        groupsMap.set(mainId, [])
      }
      groupsMap.get(mainId)!.push(row)
    })

    // Build grouped rows with 4 sub-columns each
    const grouped: FeatureSplitGroupedRow[] = []
    groupsMap.forEach((pairs, mainFeatureId) => {
      // Get main feature activation and pattern type
      const mainActivation = activationExamples[mainFeatureId]
      const mainPatternType = (mainActivation?.pattern_type || 'None') as 'Lexical' | 'Semantic' | 'Both' | 'None'

      // Build sub-columns: first is main feature, rest are top 3 similar features
      const subColumns: FeatureSplitSubColumn[] = [
        // Sub-column 1: Main feature (no decoder similarity)
        {
          featureId: mainFeatureId,
          isMainFeature: true,
          decoderSimilarity: null,
          pairKey: null,
          patternType: mainPatternType,
          interFeatureSimilarity: null
        },
        // Sub-columns 2-4: Top 3 similar features
        ...pairs.slice(0, 3).map(pair => ({
          featureId: pair.similarFeature.feature_id,
          isMainFeature: false,
          decoderSimilarity: pair.similarFeature.cosine_similarity,
          pairKey: pair.pairKey,
          patternType: pair.similarFeature.pattern_type,
          interFeatureSimilarity: pair.similarFeature.inter_feature_similarity || null
        }))
      ]

      // Pad with empty sub-columns if less than 4 similar features
      while (subColumns.length < 4) {
        subColumns.push({
          featureId: -1,  // Invalid ID to indicate empty
          isMainFeature: false,
          decoderSimilarity: null,
          pairKey: null,
          patternType: 'None',
          interFeatureSimilarity: null
        })
      }

      grouped.push({
        mainFeatureId,
        subColumns: subColumns as [FeatureSplitSubColumn, FeatureSplitSubColumn, FeatureSplitSubColumn, FeatureSplitSubColumn]
      })
    })

    return grouped
  }, [stageRows, activationExamples])

  // Sort grouped rows by main feature ID or average decoder similarity
  const sortedGroupedRows = useMemo(() => {
    console.log('[FeatureSplitTable] sortedGroupedRows useMemo triggered:', {
      tableSortBy,
      localSortBy: sortBy,
      localSortDirection: sortDirection,
      groupedRowsCount: groupedRows.length
    })

    // For pair similarity sort, we'll need to sort by the average similarity of non-main sub-columns
    if (tableSortBy === 'pair_similarity' && pairSimilarityScores.size > 0) {
      const sorted = [...groupedRows]
      sorted.sort((a, b) => {
        // Calculate average pair similarity for each grouped row (excluding main feature)
        const getAvgScore = (row: FeatureSplitGroupedRow) => {
          const scores = row.subColumns
            .filter(col => !col.isMainFeature && col.pairKey)
            .map(col => pairSimilarityScores.get(col.pairKey!) ?? -Infinity)
            .filter(s => s !== -Infinity)
          return scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : -Infinity
        }

        const aScore = getAvgScore(a)
        const bScore = getAvgScore(b)
        return bScore - aScore  // Descending
      })

      console.log('[FeatureSplitTable] Pair similarity sort applied to grouped rows')
      return sorted
    }

    // Apply regular sorting (ID or decoder similarity)
    if (!sortBy || !sortDirection) return groupedRows

    const sorted = [...groupedRows]
    sorted.sort((a, b) => {
      let compareValue = 0

      if (sortBy === 'id') {
        // Sort by main feature ID
        compareValue = a.mainFeatureId - b.mainFeatureId
      } else if (sortBy === 'decoder_similarity') {
        // Sort by average decoder similarity of similar features (excluding main)
        const getAvgSim = (row: FeatureSplitGroupedRow) => {
          const sims = row.subColumns
            .filter(col => !col.isMainFeature && col.decoderSimilarity !== null)
            .map(col => col.decoderSimilarity!)
          return sims.length > 0 ? sims.reduce((sum, s) => sum + s, 0) / sims.length : -Infinity
        }

        const aSim = getAvgSim(a)
        const bSim = getAvgSim(b)
        compareValue = aSim - bSim
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [groupedRows, sortBy, sortDirection, tableSortBy, pairSimilarityScores])

  // Virtual scrolling for performance with large datasets
  const rowVirtualizer = useVirtualizer({
    count: sortedGroupedRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 154, // Estimate ~154px per row (4 sub-rows: ID 30px + Splitting 30px + Decoder 40px + Activation 54px)
    overscan: 3, // Render 3 extra items above/below for smooth scrolling (fewer due to larger rows)
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
      // Measure a single feature column cell directly
      const featureCell = tableContainerRef.current?.querySelector('.decoder-stage-table__cell--feature-column')
      if (featureCell) {
        const cellWidth = featureCell.getBoundingClientRect().width
        if (cellWidth > 0) {
          // Subtract cell padding (4px × 2 sides = 8px)
          const cellPadding = 8
          const singleColumnWidth = cellWidth - cellPadding
          setActivationColumnWidth(singleColumnWidth)
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
    if (!stageContext || sortedGroupedRows.length === 0) return

    // Extract all unique feature IDs from grouped rows (main + all sub-columns)
    const allFeatureIds = Array.from(
      new Set(
        sortedGroupedRows.flatMap(groupedRow =>
          groupedRow.subColumns
            .filter(col => col.featureId > 0)  // Exclude empty sub-columns (featureId: -1)
            .map(col => col.featureId)
        )
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
  }, [stageContext, sortedGroupedRows, fetchActivationExamples])
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
        const totalRows = sortedGroupedRows.length

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
        const firstVisibleIndex = Math.floor(clampedScrollPercentage * totalRows)
        const lastVisibleIndex = Math.min(
          Math.ceil((clampedScrollPercentage + visibleRange) * totalRows),
          totalRows
        )

        // Extract visible feature IDs from visible grouped rows
        const visibleFeatureIds = new Set<number>(
          sortedGroupedRows.slice(firstVisibleIndex, lastVisibleIndex).flatMap(groupedRow =>
            groupedRow.subColumns
              .filter(col => col.featureId > 0)  // Exclude empty sub-columns
              .map(col => col.featureId)
          )
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
  }, [setTableScrollState, sortedGroupedRows])  // FIXED: Removed rowVirtualizer to prevent cascade re-runs

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
            {/* Header row with 6 columns */}
            <tr className="table-panel__header-row decoder-stage-table__header-row">
              <th className="table-panel__header-cell table-panel__header-cell--index">
                #
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--labels">
                {/* Empty header for labels column */}
              </th>
              <th
                className="table-panel__header-cell decoder-stage-table__header-cell--feature-column"
                onClick={() => handleSort('decoder_similarity')}
                title="Main feature with decoder similarity and activation examples"
              >
                Main Feature
                {sortBy === 'decoder_similarity' && sortDirection === 'asc' && <span className="table-panel__sort-indicator asc" />}
                {sortBy === 'decoder_similarity' && sortDirection === 'desc' && <span className="table-panel__sort-indicator desc" />}
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--feature-column">
                Similar 1
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--feature-column">
                Similar 2
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--feature-column">
                Similar 3
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

            {/* Render only visible virtual items (each item is a grouped row with 6 columns) */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const groupedRow = sortedGroupedRows[virtualRow.index]

              return (
                <tr
                  key={groupedRow.mainFeatureId}
                  className="table-panel__grouped-row"
                >
                  {/* Column 1: Index */}
                  <td className="table-panel__cell table-panel__cell--index decoder-stage-table__cell--grouped-index">
                    {virtualRow.index + 1}
                  </td>

                  {/* Column 2: Labels */}
                  <td className="table-panel__cell decoder-stage-table__cell--labels">
                    <div className="decoder-stage-table__labels-column">
                      <div className="decoder-stage-table__label-cell decoder-stage-table__label-cell--id">
                        Feature ID
                      </div>
                      <div className="decoder-stage-table__label-cell decoder-stage-table__label-cell--splitting">
                        Feature Splitting
                      </div>
                      <div className="decoder-stage-table__label-cell decoder-stage-table__label-cell--decoder">
                        Decoder Sim
                      </div>
                      <div className="decoder-stage-table__label-cell decoder-stage-table__label-cell--activation">
                        Activation Example
                      </div>
                    </div>
                  </td>

                  {/* Columns 3-6: Feature columns */}
                  {groupedRow.subColumns.map((subCol, subColIdx) => {
                    // Handle empty columns
                    if (subCol.featureId <= 0) {
                      return (
                        <td
                          key={subColIdx}
                          className="table-panel__cell decoder-stage-table__cell--feature-column decoder-stage-table__cell--empty"
                        >
                          <div className="decoder-stage-table__feature-content decoder-stage-table__feature-content--empty">
                          </div>
                        </td>
                      )
                    }

                    const isMainFeature = subCol.isMainFeature
                    const pairKey = subCol.pairKey

                    // Get badge state for this pair
                    const pairSelectionState = pairKey ? pairSelectionStates.get(pairKey) : null

                    return (
                      <td
                        key={subColIdx}
                        className={`table-panel__cell decoder-stage-table__cell--feature-column ${
                          isMainFeature ? 'decoder-stage-table__cell--main-feature' : ''
                        }`}
                        onClick={() => {
                          // Only allow selection for non-main features
                          if (!isMainFeature && pairKey) {
                            handlePairToggle(groupedRow.mainFeatureId, subCol.featureId)
                          }
                        }}
                        style={{ cursor: isMainFeature ? 'default' : 'pointer' }}
                      >
                        <div className="decoder-stage-table__feature-content">
                          {/* Content row 1: Feature ID */}
                          <div className="decoder-stage-table__content-row decoder-stage-table__content-row--id">
                            {subCol.featureId}
                          </div>

                          {/* Content row 2: Feature Splitting Badge */}
                          <div className="decoder-stage-table__content-row decoder-stage-table__content-row--splitting">
                              {!isMainFeature && pairSelectionState && (
                                <div
                                  className="table-panel__category-badge decoder-stage-table__badge--inline"
                                  style={{
                                    backgroundColor: pairSelectionState === 'selected'
                                      ? badgeConfig.selected.color
                                      : badgeConfig.rejected.color
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handlePairToggle(groupedRow.mainFeatureId, subCol.featureId)
                                  }}
                                  title={`${pairSelectionState === 'selected' ? badgeConfig.selected.label : badgeConfig.rejected.label} (${groupedRow.mainFeatureId}, ${subCol.featureId})`}
                                >
                                  {pairSelectionState === 'selected' ? badgeConfig.selected.label : badgeConfig.rejected.label}
                                </div>
                              )}
                          </div>

                          {/* Content row 3: Decoder Similarity (empty for main feature) */}
                          <div className="decoder-stage-table__content-row decoder-stage-table__content-row--decoder">
                              {!isMainFeature && subCol.decoderSimilarity !== null && (
                                <div
                                  className="decoder-stage-table__decoder-circle-wrapper"
                                  onMouseEnter={() => {
                                    // Handle hover interaction for inter-feature highlighting
                                    if (subCol.interFeatureSimilarity) {
                                      handleBadgeInteraction(
                                        groupedRow.mainFeatureId,
                                        subCol.featureId,
                                        subCol.interFeatureSimilarity,
                                        false
                                      )
                                    }

                                    // Fetch activation examples if needed
                                    const featuresToFetch = []
                                    if (!activationExamples[groupedRow.mainFeatureId]) {
                                      featuresToFetch.push(groupedRow.mainFeatureId)
                                    }
                                    if (!activationExamples[subCol.featureId]) {
                                      featuresToFetch.push(subCol.featureId)
                                    }
                                    if (featuresToFetch.length > 0) {
                                      fetchActivationExamples(featuresToFetch)
                                    }

                                    // Set hovered pair
                                    setHoveredPairKey(pairKey!)
                                  }}
                                  onMouseLeave={() => {
                                    handleBadgeLeave()
                                    setHoveredPairKey(null)
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (subCol.interFeatureSimilarity) {
                                      handleBadgeInteraction(
                                        groupedRow.mainFeatureId,
                                        subCol.featureId,
                                        subCol.interFeatureSimilarity,
                                        true
                                      )
                                    }
                                  }}
                                >
                                  <ScoreCircle
                                    score={subCol.decoderSimilarity}
                                    metric="decoder_similarity"
                                    useSolidColor={true}
                                    label={subCol.decoderSimilarity.toFixed(3)}
                                    tooltipText={`Decoder Similarity: ${subCol.decoderSimilarity.toFixed(3)}`}
                                    showLabel={true}
                                  />
                                </div>
                              )}
                          </div>

                          {/* Content row 4: Activation Example */}
                          <div className="decoder-stage-table__content-row decoder-stage-table__content-row--activation">
                              {activationExamples[subCol.featureId] && (
                                <ActivationExample
                                  examples={activationExamples[subCol.featureId]}
                                  containerWidth={activationColumnWidth}  // Already calculated for single column
                                  interFeaturePositions={getInterFeaturePositionsForFeature(subCol.featureId, pairKey)}
                                  isHovered={pairKey !== null && hoveredPairKey === pairKey}
                                  onHoverChange={(isHovered) => {
                                    // Only set hover for non-main features
                                    if (!isMainFeature && pairKey) {
                                      setHoveredPairKey(isHovered ? pairKey : null)
                                      if (isHovered && subCol.interFeatureSimilarity) {
                                        handleBadgeInteraction(
                                          groupedRow.mainFeatureId,
                                          subCol.featureId,
                                          subCol.interFeatureSimilarity,
                                          false
                                        )
                                      } else if (!isHovered) {
                                        handleBadgeLeave()
                                      }
                                    }
                                  }}
                                />
                              )}
                          </div>
                        </div>
                      </td>
                    )
                  })}
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
