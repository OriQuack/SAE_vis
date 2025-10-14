import React, { useEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow, ConsistencyType, SortBy, SortDirection } from '../types'
import {
  buildHeaderStructure,
  buildMetricFirstHeaderStructure,
  formatTableScore,
  getExplainerDisplayName,
  extractRowScores,
  extractRowScoresMetricFirst,
  calculateColorBarLayout,
  getConsistencyForCell,
  getConsistencyColor,
  getConsistencyValueForSorting,
  getScoreValue,
  compareValues,
  type HeaderStructure
} from '../lib/d3-table-utils'
import '../styles/TablePanel.css'

// ============================================================================
// CONSISTENCY TYPE OPTIONS - Flat Structure
// ============================================================================

const CONSISTENCY_OPTIONS: Array<{
  id: string
  label: string
  value: ConsistencyType
}> = [
  {
    id: 'none',
    label: 'None',
    value: 'none'
  },
  {
    id: 'llm_scorer',
    label: 'LLM Scorer',
    value: 'llm_scorer_consistency'
  },
  {
    id: 'within_exp_score',
    label: 'Within-exp. Score',
    value: 'within_explanation_score'
  },
  {
    id: 'cross_exp_score',
    label: 'Cross-exp. Score',
    value: 'cross_explanation_score'
  },
  {
    id: 'llm_explainer',
    label: 'LLM Explainer',
    value: 'llm_explainer_consistency'
  }
]

// ============================================================================
// MAIN TABLE PANEL COMPONENT
// ============================================================================

interface TablePanelProps {
  className?: string
}

const TablePanel: React.FC<TablePanelProps> = ({ className = '' }) => {
  const tableData = useVisualizationStore(state => state.tableData) as FeatureTableDataResponse | null
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const rightPanel = useVisualizationStore(state => state.rightPanel)
  const fetchTableData = useVisualizationStore(state => state.fetchTableData)
  const selectedConsistencyType = useVisualizationStore(state => state.selectedConsistencyType)
  const setConsistencyType = useVisualizationStore(state => state.setConsistencyType)
  const isLoading = useVisualizationStore(state => state.loading.table)

  const [headerStructure, setHeaderStructure] = useState<HeaderStructure | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Sorting state
  const [sortBy, setSortBy] = useState<SortBy>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Check if only one explainer is selected (for disabling certain options)
  const hasOnlyOneExplainer = selectedExplainers.size === 1

  // Check if a consistency type is disabled
  const isConsistencyTypeDisabled = (type: ConsistencyType): boolean => {
    // "None" is never disabled
    if (type === 'none') {
      return false
    }

    // When only one explainer: disable cross-explanation and llm_explainer_consistency
    if (hasOnlyOneExplainer) {
      return type === 'cross_explanation_score' || type === 'llm_explainer_consistency'
    }

    // When multiple explainers: disable llm_scorer_consistency
    if (selectedExplainers.size > 1) {
      return type === 'llm_scorer_consistency'
    }

    return false
  }

  // Calculate color bar layout using D3 (following project pattern: D3 for calculations, React for rendering)
  const colorBarLayout = useMemo(() => calculateColorBarLayout(400, 12), [])

  // Calculate if scores are averaged and column count for table key (must be before early returns)
  const isAveraged = tableData ? tableData.is_averaged || false : false
  const columnCount = useMemo(() => {
    if (!tableData) return 0
    const numExplainers = tableData.explainer_ids.length
    const numScorers = tableData.scorer_ids.length

    if (isAveraged) {
      // Averaged mode: 3 columns per explainer (embedding, fuzz, detection)
      return numExplainers * 3
    } else {
      // Individual scorer mode: 1 + (numScorers * 2) columns per explainer
      // 1 embedding + numScorers fuzz + numScorers detection
      return numExplainers * (1 + numScorers * 2)
    }
  }, [tableData, isAveraged])

  // Auto-switch from disabled consistency types when explainer count changes
  useEffect(() => {
    // Check if current selection becomes disabled based on explainer count
    const shouldSwitch = (
      // When only one explainer, these are disabled
      (hasOnlyOneExplainer && (
        selectedConsistencyType === 'cross_explanation_score' ||
        selectedConsistencyType === 'llm_explainer_consistency'
      )) ||
      // When multiple explainers, this is disabled
      (selectedExplainers.size > 1 && selectedConsistencyType === 'llm_scorer_consistency')
    )

    if (shouldSwitch) {
      setConsistencyType('none')
    }
  }, [selectedExplainers.size, selectedConsistencyType, setConsistencyType, hasOnlyOneExplainer]) // Re-run when number of explainers changes

  // Handle consistency type click
  const handleConsistencyClick = (value: ConsistencyType) => {
    // Check if disabled
    if (isConsistencyTypeDisabled(value)) {
      return
    }

    // Set consistency type
    setConsistencyType(value)

    // "None" should not trigger sorting
    if (value !== 'none') {
      // Also handle sort for other consistency types
      handleSort({ type: 'consistency', consistencyType: value })
    }
  }

  // Handle sort click
  const handleSort = (newSortBy: SortBy) => {
    // If same sort target, cycle through: null → asc → desc → null
    if (JSON.stringify(sortBy) === JSON.stringify(newSortBy)) {
      if (sortDirection === null) {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        // Reset to no sort
        setSortBy(null)
        setSortDirection(null)
      }
    } else {
      // New sort target, start with ascending
      setSortBy(newSortBy)
      setSortDirection('asc')
    }
  }

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    visible: boolean
    text: string
    x: number
    y: number
  }>({
    visible: false,
    text: '',
    x: 0,
    y: 0
  })

  // Fetch data when component mounts or when filters change
  useEffect(() => {
    fetchTableData()
  }, [
    fetchTableData,
    leftPanel.filters.llm_explainer,
    rightPanel.filters.llm_explainer,
    leftPanel.filters.llm_scorer,
    rightPanel.filters.llm_scorer
  ])

  // Build header structure when table data changes or consistency type changes
  useEffect(() => {
    if (tableData && tableData.explainer_ids.length > 0) {
      const isAveraged = tableData.is_averaged || false
      const scorerIds = tableData.scorer_ids || []

      // Use metric-first structure for cross-explanation consistency
      const structure = selectedConsistencyType === 'cross_explanation_score'
        ? buildMetricFirstHeaderStructure(tableData.explainer_ids, isAveraged)
        : buildHeaderStructure(tableData.explainer_ids, isAveraged, scorerIds)

      setHeaderStructure(structure)
    } else {
      setHeaderStructure(null)
    }
  }, [tableData, selectedConsistencyType])

  // Tooltip handlers
  const handleMouseEnter = (event: React.MouseEvent<HTMLTableCellElement>, fullName: string) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      visible: true,
      text: fullName,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
  }

  const handleMouseLeave = () => {
    setTooltip({
      visible: false,
      text: '',
      x: 0,
      y: 0
    })
  }

  // Sort features based on current sort settings
  const sortedFeatures = useMemo(() => {
    if (!tableData || !sortBy || !sortDirection) {
      return tableData?.features || []
    }

    const features = [...tableData.features]

    features.sort((a, b) => {
      let valueA: number | null = null
      let valueB: number | null = null

      if (sortBy.type === 'consistency') {
        // Sort by consistency value
        valueA = getConsistencyValueForSorting(a, sortBy.consistencyType, tableData.explainer_ids)
        valueB = getConsistencyValueForSorting(b, sortBy.consistencyType, tableData.explainer_ids)
      } else if (sortBy.type === 'column') {
        // Sort by column score value
        valueA = getScoreValue(a, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
        valueB = getScoreValue(b, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
      }

      return compareValues(valueA, valueB, sortDirection)
    })

    return features
  }, [tableData, sortBy, sortDirection])

  // If no data or no explainers selected
  if (!tableData || !tableData.features || tableData.features.length === 0 || selectedExplainers.size === 0) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content">
          <p className="table-panel__placeholder">
            Select LLM explainers from the flowchart to view feature-level scoring data
          </p>
        </div>
      </div>
    )
  }

  if (!headerStructure) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content">
          <p className="table-panel__placeholder">
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // Determine which header rows should be highlighted based on selected consistency type
  const getHighlightedRows = (): { row1: boolean; row2: boolean; row3: boolean } => {
    switch (selectedConsistencyType) {
      case 'none':
        // No consistency: no highlighting
        return { row1: false, row2: false, row3: false }
      case 'llm_scorer_consistency':
        // LLM Scorer: highlights row 3 (scorer labels)
        return { row1: false, row2: false, row3: true }
      case 'within_explanation_score':
        // Within-explanation: highlights row 2 (metric names in normal view)
        return { row1: false, row2: true, row3: false }
      case 'cross_explanation_score':
        // Cross-explanation: In reordered view, row 1 = metrics, row 2 = explainers
        // Highlight row 2 (explainers) since we're comparing across explainers
        return { row1: false, row2: true, row3: false }
      case 'llm_explainer_consistency':
        // LLM Explainer: highlights row 1 (explainer names in normal view)
        return { row1: true, row2: false, row3: false }
      default:
        return { row1: false, row2: false, row3: false }
    }
  }

  const highlightedRows = getHighlightedRows()

  // Render table with conditional 2-row or 3-row header
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Consistency Header */}
      <div className="table-panel__header">
        {/* Title */}
        <div className="table-panel__consistency-title">Consistency</div>

        {/* Consistency Type Buttons (5 horizontal) */}
        <div className="table-panel__main-categories">
          {CONSISTENCY_OPTIONS.map((option) => {
            const disabled = isConsistencyTypeDisabled(option.value)
            // Check if this button is active
            const isActive = selectedConsistencyType === option.value
            // Check if this button is currently sorted
            const isSorted = sortBy?.type === 'consistency' && sortBy.consistencyType === option.value
            // "None" should not have sorting indicator
            const showSortIndicator = option.value !== 'none'
            return (
              <button
                key={option.id}
                className={`table-panel__main-category-button ${
                  isActive ? 'active' : ''
                } ${disabled ? 'disabled' : ''}`}
                onClick={() => handleConsistencyClick(option.value)}
                disabled={disabled}
              >
                {option.label}
                {showSortIndicator && (
                  <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Color Bar Legend (D3 calculated layout with inline labels) */}
        <div className="table-panel__consistency-legend">
          <svg
            width={colorBarLayout.width}
            height={colorBarLayout.height}
            className="table-panel__color-bar"
          >
            <defs>
              <linearGradient id="consistency-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                {colorBarLayout.gradientStops.map((stop, idx) => (
                  <stop key={idx} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>

            {/* Left label */}
            <text
              x={colorBarLayout.leftLabelX}
              y={colorBarLayout.leftLabelY}
              className="table-panel__color-bar-label-left"
              textAnchor="start"
              dominantBaseline="central"
            >
              0 Low
            </text>

            {/* Gradient bar */}
            <rect
              x={colorBarLayout.barX}
              y={colorBarLayout.barY}
              width={colorBarLayout.barWidth}
              height={colorBarLayout.barHeight}
              fill="url(#consistency-gradient)"
              rx="2"
            />

            {/* Right label */}
            <text
              x={colorBarLayout.rightLabelX}
              y={colorBarLayout.rightLabelY}
              className="table-panel__color-bar-label-right"
              textAnchor="start"
              dominantBaseline="central"
            >
              1 High
            </text>
          </svg>
        </div>
      </div>

      <div
        className={`table-panel__content ${isLoading ? 'loading' : ''}`}
        ref={tableContainerRef}
      >
        <table
          className="table-panel__table"
          key={`table-${columnCount}-${tableData?.scorer_ids.length || 0}`}
        >
          <thead className="table-panel__thead">
            {/* Row 1: Dynamic (Explainers or Metrics depending on view) */}
            <tr className={`table-panel__header-row-1 ${highlightedRows.row1 ? 'highlighted' : ''}`}>
              <th className="table-panel__feature-id-header" rowSpan={isAveraged ? 2 : 3}>
                ID
              </th>
              {headerStructure.row1.map((cell, idx) => {
                const cellClass = cell.type === 'metric'
                  ? 'table-panel__metric-header'
                  : 'table-panel__explainer-header'
                return (
                  <th
                    key={`row1-${idx}`}
                    colSpan={cell.colSpan}
                    className={`${cellClass} ${highlightedRows.row1 ? 'highlighted' : ''}`}
                  >
                    {cell.type === 'explainer' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px' }}>💬</span>
                        <span>{cell.label}</span>
                      </div>
                    ) : (
                      cell.label
                    )}
                  </th>
                )
              })}
            </tr>

            {/* Row 2: Dynamic (Metrics or Explainers depending on view) */}
            <tr className={`table-panel__header-row-2 ${highlightedRows.row2 ? 'highlighted' : ''}`}>
              {headerStructure.row2.map((cell, idx) => {
                const cellClass = cell.type === 'metric'
                  ? 'table-panel__metric-header'
                  : 'table-panel__explainer-header'

                // Check if this column is sortable (has explainerId and metricType)
                const isSortable = cell.explainerId && cell.metricType
                // Check if currently sorted
                const isSorted = isSortable && sortBy?.type === 'column' &&
                  sortBy.explainerId === cell.explainerId &&
                  sortBy.metricType === cell.metricType &&
                  !sortBy.scorerId // Row2 cells don't have scorerId

                return (
                  <th
                    key={`row2-${idx}`}
                    colSpan={cell.colSpan}
                    className={`${cellClass} ${highlightedRows.row2 ? 'highlighted' : ''} ${isSortable ? 'table-panel__sortable-header' : ''}`}
                    onClick={() => {
                      if (isSortable) {
                        handleSort({
                          type: 'column',
                          explainerId: cell.explainerId!,
                          metricType: cell.metricType!,
                          scorerId: undefined
                        })
                      }
                    }}
                  >
                    {cell.type === 'explainer' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px' }}>💬</span>
                        <span>{cell.label}</span>
                        {isSortable && (
                          <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                        )}
                      </div>
                    ) : (
                      <>
                        {cell.label}
                        {isSortable && (
                          <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                        )}
                      </>
                    )}
                  </th>
                )
              })}
            </tr>

            {/* Row 3: Scorer labels (only shown when not averaged) */}
            {!isAveraged && (
              <tr className={`table-panel__header-row-3 ${highlightedRows.row3 ? 'highlighted' : ''}`}>
                {headerStructure.row3.map((cell, idx) => {
                  // Check if this column is sortable
                  const isSortable = cell.explainerId && cell.metricType && cell.metricType !== 'embedding'
                  // Check if currently sorted
                  const isSorted = isSortable && sortBy?.type === 'column' &&
                    sortBy.explainerId === cell.explainerId &&
                    sortBy.metricType === cell.metricType &&
                    sortBy.scorerId === cell.scorerId

                  // Check if this is an embedding scorer cell (empty cell that needs diagonal line)
                  const isEmbeddingScorer = cell.metricType === 'embedding'

                  return (
                    <th
                      key={`scorer-${idx}`}
                      className={`table-panel__scorer-header ${highlightedRows.row3 ? 'highlighted' : ''} ${isSortable ? 'table-panel__sortable-header' : ''} ${isEmbeddingScorer ? 'table-panel__scorer-header--empty' : ''}`}
                      onClick={() => {
                        if (isSortable) {
                          handleSort({
                            type: 'column',
                            explainerId: cell.explainerId!,
                            metricType: cell.metricType!,
                            scorerId: cell.scorerId
                          })
                        }
                      }}
                    >
                      {cell.type === 'scorer' && cell.label && !isEmbeddingScorer ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                          <span style={{ fontSize: '10px' }}>🎯</span>
                          <span>{cell.label}</span>
                          {isSortable && (
                            <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                          )}
                        </div>
                      ) : (
                        <>
                          {cell.label}
                          {isSortable && (
                            <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                          )}
                        </>
                      )}
                    </th>
                  )
                })}
              </tr>
            )}
          </thead>

          <tbody className="table-panel__tbody">
            {sortedFeatures.map((row: FeatureTableRow) => {
              // Use metric-first extraction for cross-explanation consistency
              const scores = selectedConsistencyType === 'cross_explanation_score'
                ? extractRowScoresMetricFirst(row, tableData.explainer_ids, isAveraged)
                : extractRowScores(row, tableData.explainer_ids, isAveraged, tableData.scorer_ids.length)

              return (
                <tr key={row.feature_id} className="table-panel__feature-row">
                  <td className="table-panel__feature-id-cell">
                    {row.feature_id}
                  </td>
                  {scores.map((score, idx) => {
                    // Determine which cell this score belongs to using header structure
                    // Use row3 for scorer-specific cells, row2 for metric cells
                    let consistency: number | null = null

                    // Map score index to header cell for consistency lookup
                    if (!isAveraged && headerStructure.row3.length > 0) {
                      // 3-row header: row3 has scorer-level cells
                      const headerCell = headerStructure.row3[idx]
                      if (headerCell && headerCell.explainerId && headerCell.metricType) {
                        consistency = getConsistencyForCell(
                          row,
                          headerCell.explainerId,
                          headerCell.metricType,
                          headerCell.scorerId,
                          selectedConsistencyType
                        )
                      }
                    } else if (headerStructure.row2.length > 0) {
                      // 2-row header: row2 has metric-level cells
                      const headerCell = headerStructure.row2[idx]
                      if (headerCell && headerCell.explainerId && headerCell.metricType) {
                        consistency = getConsistencyForCell(
                          row,
                          headerCell.explainerId,
                          headerCell.metricType,
                          undefined,
                          selectedConsistencyType
                        )
                      }
                    }

                    // Apply background color based on consistency
                    const bgColor = consistency !== null ? getConsistencyColor(consistency) : 'transparent'

                    return (
                      <td
                        key={`${row.feature_id}-${idx}`}
                        className="table-panel__score-cell"
                        style={{
                          backgroundColor: bgColor,
                          color: consistency !== null && consistency < 0.5 ? 'white' : '#374151'  // White text for dark backgrounds
                        }}
                      >
                        {formatTableScore(score)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Portal-based tooltip */}
      {tooltip.visible && createPortal(
        <>
          <div
            className="table-panel__tooltip"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          >
            {tooltip.text}
          </div>
          <div
            className="table-panel__tooltip-arrow"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          />
        </>,
        document.body
      )}
    </div>
  )
}

export default TablePanel
