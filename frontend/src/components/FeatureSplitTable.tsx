import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, DecoderStageRow, StageTableContext } from '../types'
import { METRIC_DECODER_SIMILARITY } from '../lib/constants'
import ActivationExample from './ActivationExample'
import DecoderSimilarityOverlay from './FeatureSplitOverlay'
import '../styles/TablePanel.css'
import '../styles/DecoderSimilarityTable.css'

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
  const clearActiveStageNode = useVisualizationStore(state => state.clearActiveStageNode)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const toggleFeatureSelection = useVisualizationStore(state => state.toggleFeatureSelection)
  const loading = useVisualizationStore(state => state.loading)
  const setTableScrollState = useVisualizationStore(state => state.setTableScrollState)

  // Sorting state
  const [sortBy, setSortBy] = useState<'id' | 'decoder_similarity' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)

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
    if (!interfeatureData || interfeatureData.pattern_type === 'None') return

    // Determine type based on Jaccard scores (prioritize lexical for "Both")
    const charJaccard = interfeatureData.char_jaccard || 0
    const wordJaccard = interfeatureData.word_jaccard || 0
    const type: 'char' | 'word' = charJaccard >= wordJaccard ? 'char' : 'word'

    // Extract positions
    const mainPositions = type === 'char'
      ? interfeatureData.main_char_ngram_positions
      : interfeatureData.main_word_ngram_positions
    const similarPositions = type === 'char'
      ? interfeatureData.similar_char_ngram_positions
      : interfeatureData.similar_word_ngram_positions

    if (!mainPositions || !similarPositions) return

    const newHighlight = {
      mainFeatureId,
      similarFeatureId,
      type,
      mainPositions,
      similarPositions
    }

    if (isClick) {
      // Toggle sticky highlight in the Map
      const key = `${mainFeatureId}-${similarFeatureId}`
      setInterFeatureHighlights(prev => {
        const newMap = new Map(prev)
        if (newMap.has(key)) {
          // Remove if already exists (toggle off)
          newMap.delete(key)
        } else {
          // Add new highlight (toggle on)
          newMap.set(key, newHighlight)
        }
        return newMap
      })
    } else {
      // Hover: set temporary hover highlight
      setHoverHighlight(newHighlight)
    }
  }

  const handleBadgeLeave = () => {
    // Clear hover highlight
    setHoverHighlight(null)
  }

  // Helper function to compute merged inter-feature positions for a given feature
  // Merges ALL clicked pairs that involve this feature
  const getInterFeaturePositionsForFeature = React.useMemo(() => {
    return (featureId: number) => {
      const allHighlights: Array<{ type: 'char' | 'word', positions: any }> = []

      // Collect from all clicked highlights (Map)
      interFeatureHighlights.forEach((highlight) => {
        if (highlight.mainFeatureId === featureId) {
          allHighlights.push({ type: highlight.type, positions: highlight.mainPositions })
        } else if (highlight.similarFeatureId === featureId) {
          allHighlights.push({ type: highlight.type, positions: highlight.similarPositions })
        }
      })

      // Add hover highlight if it matches this feature
      if (hoverHighlight) {
        if (hoverHighlight.mainFeatureId === featureId) {
          allHighlights.push({ type: hoverHighlight.type, positions: hoverHighlight.mainPositions })
        } else if (hoverHighlight.similarFeatureId === featureId) {
          allHighlights.push({ type: hoverHighlight.type, positions: hoverHighlight.similarPositions })
        }
      }

      if (allHighlights.length === 0) return undefined

      // Merge ALL highlights regardless of type mismatch
      // Strategy: Normalize all positions to char format (word positions become char without offset)
      const mergedPositionsMap = new Map<number, {
        prompt_id: number,
        positions: Array<{token_position: number, char_offset?: number}>
      }>()

      allHighlights.forEach(({ type, positions }) => {
        if (positions) {
          positions.forEach((promptData: any) => {
            const existing = mergedPositionsMap.get(promptData.prompt_id)

            // Normalize positions to char format
            let normalizedPositions: Array<{token_position: number, char_offset?: number}>
            if (type === 'char') {
              // Already in char format
              normalizedPositions = promptData.positions as Array<{token_position: number, char_offset?: number}>
            } else {
              // Convert word positions (number[]) to char format
              normalizedPositions = (promptData.positions as number[]).map(tokenPos => ({
                token_position: tokenPos,
                char_offset: undefined
              }))
            }

            if (existing) {
              // Merge positions for same prompt_id (deduplicate by token_position)
              const posMap = new Map<number, {token_position: number, char_offset?: number}>()
              existing.positions.forEach(p => posMap.set(p.token_position, p))
              normalizedPositions.forEach(p => {
                // Keep existing char_offset if present, otherwise use new one (or undefined)
                if (!posMap.has(p.token_position)) {
                  posMap.set(p.token_position, p)
                }
              })
              existing.positions = Array.from(posMap.values())
            } else {
              // Add new prompt_id entry
              mergedPositionsMap.set(promptData.prompt_id, {
                prompt_id: promptData.prompt_id,
                positions: [...normalizedPositions]
              })
            }
          })
        }
      })

      // Return merged positions in char format
      return {
        type: 'char' as const,
        positions: Array.from(mergedPositionsMap.values())
      }
    }
  }, [interFeatureHighlights, hoverHighlight])

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

  // Process table data to create decoder stage rows with top 5 similar features per index
  const stageRows = useMemo<DecoderStageRow[]>(() => {
    if (!stageContext || !tableData) {
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
    const stageFeatures = tableData.features.filter(
      (feature: FeatureTableRow) => allFeatureIds.has(feature.feature_id)
    )

    // Transform to decoder stage rows - each feature shows main feature + 4 most similar
    const rows: DecoderStageRow[] = stageFeatures.map((feature: FeatureTableRow) => {
      // Get decoder similarity data
      const decoderData = feature.decoder_similarity || []

      // Extract top 4 similar features (not including self)
      const top4Similar = decoderData.slice(0, 4)

      // Create array with main feature first, then 4 similar features
      const allFeatures = [
        {
          feature_id: feature.feature_id,
          cosine_similarity: 1.0,  // Self-similarity is always 1.0
          is_main: true,
          pattern_type: activationExamples[feature.feature_id]?.pattern_type || 'None',  // Individual feature pattern
          inter_feature_similarity: null  // Main feature has no inter-feature similarity
        },
        ...top4Similar.map(item => ({
          feature_id: item.feature_id,
          cosine_similarity: item.cosine_similarity,
          is_main: false,
          pattern_type: activationExamples[item.feature_id]?.pattern_type || 'None',  // Individual feature pattern
          inter_feature_similarity: item.inter_feature_similarity || null  // Relationship pattern
        }))
      ]

      return {
        feature_id: feature.feature_id,
        decoder_similarity: 0, // Not used in this view
        top_similar_features: allFeatures
      }
    })

    return rows
  }, [stageContext, tableData, leftPanel.sankeyTree, activationExamples])

  // Sort rows using the main feature's top decoder similarity
  const sortedRows = useMemo(() => {
    if (!sortBy || !sortDirection) return stageRows

    const sorted = [...stageRows]
    sorted.sort((a, b) => {
      let compareValue = 0

      if (sortBy === 'id') {
        // Sort by the main feature ID (index 0, which has is_main: true)
        const aMainId = a.feature_id
        const bMainId = b.feature_id
        compareValue = aMainId - bMainId
      } else if (sortBy === 'decoder_similarity') {
        // Sort by the main feature's highest decoder similarity (index 1, first similar feature)
        const aMaxSim = a.top_similar_features[1]?.cosine_similarity || 0
        const bMaxSim = b.top_similar_features[1]?.cosine_similarity || 0
        compareValue = aMaxSim - bMaxSim
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [stageRows, sortBy, sortDirection])

  // Virtual scrolling for performance with large datasets
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 250, // Estimate ~50px per sub-row × 5 sub-rows per feature group
    overscan: 3, // Render 3 extra items above/below for smooth scrolling
  })

  // Handle sort click
  const handleSort = (column: 'id' | 'decoder_similarity') => {
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

  // Handle feature selection
  const handleFeatureToggle = (featureId: number) => {
    toggleFeatureSelection(featureId)
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

    // Extract all unique feature IDs from decoder similarity rows
    const allFeatureIds = Array.from(
      new Set(
        sortedRows.flatMap(row =>
          row.top_similar_features.map(f => f.feature_id)
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
  }, [stageContext, sortedRows, fetchActivationExamples])
  // NOTE: activationExamples is NOT in dependencies to prevent infinite loop

  // Track scroll state for Sankey vertical bar scroll indicator
  useEffect(() => {
    const container = tableContainerRef.current
    if (!container) return

    let rafId: number | null = null

    const measureAndUpdate = () => {
      if (!container) return
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        // Calculate visible features using simple percentage-based approach
        const totalFeatures = sortedRows.length
        const scrollPercentage = container.scrollHeight > 0
          ? container.scrollTop / container.scrollHeight
          : 0
        const viewportPercentage = container.scrollHeight > 0
          ? container.clientHeight / container.scrollHeight
          : 0

        // Calculate which features are visible based on scroll position
        const firstVisibleIndex = Math.floor(scrollPercentage * totalFeatures)
        const lastVisibleIndex = Math.min(
          Math.ceil((scrollPercentage + viewportPercentage) * totalFeatures),
          totalFeatures
        )

        // Extract visible feature IDs using simple array slice
        const visibleFeatureIds = new Set<number>(
          sortedRows.slice(firstVisibleIndex, lastVisibleIndex).map(row => row.feature_id)
        )

        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          visibleFeatureIds
        }

        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          setTableScrollState(scrollState)
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
  }, [setTableScrollState, sortedRows])  // Re-run when rows change

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

      {/* Minimal selection header */}
      <div className="decoder-stage-table__selection-header">
        <span className="decoder-stage-table__selection-count">
          {stageContext.rangeLabel} • {stageContext.featureCount.toLocaleString()} features
        </span>
        <button
          className="decoder-stage-table__clear-selection"
          onClick={clearActiveStageNode}
          title="Return to normal table"
        >
          Clear ×
        </button>
      </div>

      {/* Table */}
      <div className="table-panel__content" ref={tableContainerRef}>
        <table className="table-panel__table--simple">
          <thead className="table-panel__thead">
            <tr className="table-panel__header-row">
              <th className="table-panel__header-cell table-panel__header-cell--index">
                #
              </th>
              <th className="table-panel__header-cell decoder-stage-table__header-cell--checkbox">
                ☑
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--id"
                onClick={() => handleSort('id')}
              >
                ID
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
              <th className="table-panel__header-cell decoder-stage-table__header-cell--activation">
                Activation Example
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {/* Top padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
                <td colSpan={5} />
              </tr>
            )}

            {/* Render only visible virtual items */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = sortedRows[virtualRow.index]
              const groupIndex = virtualRow.index
              // Each group has 5 rows (top 5 similar features)
              const similarFeatures = row.top_similar_features
              const rowCount = Math.max(similarFeatures.length, 1) // At least 1 row

              return (
                <React.Fragment key={row.feature_id}>
                  {similarFeatures.map((similar, subIndex) => {
                    const isSelected = selectedFeatureIds.has(similar.feature_id)
                    const isFirstRow = subIndex === 0
                    const isLastRow = subIndex === similarFeatures.length - 1
                    const isMainFeature = similar.is_main === true

                    return (
                      <tr
                        key={similar.feature_id}
                        className={`table-panel__sub-row ${isLastRow ? 'decoder-stage-table__group-last-row' : ''} ${isMainFeature ? 'decoder-stage-table__main-feature-row' : ''}`}
                      >
                        {/* Index cell - only on first row, spans all rows in group */}
                        {isFirstRow && (
                          <td
                            className="table-panel__cell table-panel__cell--index"
                            rowSpan={rowCount}
                          >
                            {groupIndex + 1}
                          </td>
                        )}

                        {/* Checkbox */}
                        <td className="table-panel__cell decoder-stage-table__cell--checkbox">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleFeatureToggle(similar.feature_id)}
                            className="decoder-stage-table__checkbox"
                          />
                        </td>

                        {/* Feature ID */}
                        <td className="table-panel__cell table-panel__cell--id">
                          {similar.feature_id}
                        </td>

                        {/* Decoder Similarity Score - Single overlay visualization */}
                        {isFirstRow ? (
                          <td
                            className="table-panel__cell table-panel__cell--score"
                            style={{ position: 'relative', padding: 0, verticalAlign: 'top' }}
                            rowSpan={rowCount}
                          >
                            <DecoderSimilarityOverlay
                              similarFeatures={similarFeatures}
                              rowCount={rowCount}
                              rowHeight={46}
                              mainFeatureId={row.feature_id}
                              onBadgeInteraction={handleBadgeInteraction}
                              onBadgeLeave={handleBadgeLeave}
                              activationColumnWidth={activationColumnWidth}
                              interFeatureHighlights={interFeatureHighlights}
                            />
                          </td>
                        ) : null}

                        {/* Activation Example */}
                        <td className="table-panel__cell decoder-stage-table__cell--activation">
                          {activationExamples[similar.feature_id] ? (
                            <ActivationExample
                              examples={activationExamples[similar.feature_id]}
                              containerWidth={activationColumnWidth}
                              interFeaturePositions={getInterFeaturePositionsForFeature(similar.feature_id)}
                            />
                          ) : (
                            <span className="table-panel__placeholder">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {/* If no similar features, show one empty row */}
                  {similarFeatures.length === 0 && (
                    <tr className="table-panel__sub-row decoder-stage-table__group-last-row">
                      <td className="table-panel__cell table-panel__cell--index">
                        {groupIndex + 1}
                      </td>
                      <td className="table-panel__cell decoder-stage-table__cell--checkbox">
                        <input
                          type="checkbox"
                          checked={false}
                          disabled
                          className="decoder-stage-table__checkbox"
                        />
                      </td>
                      <td className="table-panel__cell table-panel__cell--id">—</td>
                      <td className="table-panel__cell table-panel__cell--score">—</td>
                      <td className="table-panel__cell decoder-stage-table__cell--activation">
                        <span className="table-panel__placeholder">No similar features</span>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DecoderSimilarityTable
