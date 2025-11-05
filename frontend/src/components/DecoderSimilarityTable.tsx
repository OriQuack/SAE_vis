import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, DecoderStageRow, StageTableContext, ActivationExamples } from '../types'
import { METRIC_DECODER_SIMILARITY } from '../lib/constants'
import { getMetricColor } from '../lib/utils'
import { getActivationExamples } from '../api'
import ActivationExample from './ActivationExample'
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

  // Sorting state
  const [sortBy, setSortBy] = useState<'id' | 'decoder_similarity' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Activation examples state
  const [activationData, setActivationData] = useState<Record<number, ActivationExamples>>({})
  const loadedActivationFeatureIds = useRef<Set<number>>(new Set())

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
          is_main: true
        },
        ...top4Similar.map(item => ({
          feature_id: item.feature_id,
          cosine_similarity: item.cosine_similarity,
          is_main: false
        }))
      ]

      return {
        feature_id: feature.feature_id,
        decoder_similarity: 0, // Not used in this view
        top_similar_features: allFeatures
      }
    })

    return rows
  }, [stageContext, tableData, leftPanel.sankeyTree])

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

  // Fetch activation examples when stage changes (with caching)
  useEffect(() => {
    if (!stageContext || !tableData || sortedRows.length === 0) return

    // Extract all unique feature IDs in this stage
    const featureIds = Array.from(
      new Set(
        sortedRows.flatMap(row =>
          row.top_similar_features.map(f => f.feature_id)
        )
      )
    )

    // Check which features we haven't loaded yet
    const unloadedFeatureIds = featureIds.filter(
      id => !loadedActivationFeatureIds.current.has(id)
    )

    // Only fetch if there are new features
    if (unloadedFeatureIds.length === 0) {
      console.log('[DecoderSimilarityTable] All activation examples already cached')
      return
    }

    console.log('[DecoderSimilarityTable] Fetching activation examples for', unloadedFeatureIds.length, 'new features (', featureIds.length, 'total )')

    // Fetch activation examples
    getActivationExamples(unloadedFeatureIds)
      .then(examples => {
        console.log('[DecoderSimilarityTable] Loaded activation examples:', Object.keys(examples).length)

        // Merge with existing data
        setActivationData(prev => ({ ...prev, ...examples }))

        // Mark as loaded
        unloadedFeatureIds.forEach(id => loadedActivationFeatureIds.current.add(id))
      })
      .catch(error => {
        console.error('[DecoderSimilarityTable] Failed to fetch activation examples:', error)
      })
  }, [stageContext, tableData])

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
              <th className="table-panel__header-cell decoder-stage-table__header-cell--type">
                Type
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
                <td colSpan={6} />
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

                        {/* Decoder Similarity Score */}
                        <td
                          className="table-panel__cell table-panel__cell--score"
                          title={isMainFeature ? 'Main feature' : `Decoder Similarity: ${similar.cosine_similarity.toFixed(3)}`}
                        >
                          {!isMainFeature && (
                            <svg width="16" height="16" style={{ display: 'block', margin: '0 auto' }}>
                              <circle
                                cx="8"
                                cy="8"
                                r="7"
                                fill={getMetricColor('decoder_similarity', similar.cosine_similarity)}
                                stroke="none"
                              />
                            </svg>
                          )}
                        </td>

                        {/* Type */}
                        <td className="table-panel__cell decoder-stage-table__cell--type">
                          <span className="decoder-stage-table__type-badge">
                            {activationData[similar.feature_id]?.pattern_type || 'None'}
                          </span>
                        </td>

                        {/* Activation Example */}
                        <td className="table-panel__cell decoder-stage-table__cell--activation">
                          {activationData[similar.feature_id] ? (
                            <ActivationExample
                              examples={activationData[similar.feature_id]}
                              compact={true}
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
                      <td className="table-panel__cell decoder-stage-table__cell--type">—</td>
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
                <td colSpan={6} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DecoderSimilarityTable
