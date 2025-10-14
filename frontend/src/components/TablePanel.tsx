import React, { useEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow, ConsistencyType } from '../types'
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
  type HeaderStructure
} from '../lib/d3-table-utils'
import '../styles/TablePanel.css'

// ============================================================================
// CONSISTENCY TYPE OPTIONS - Hierarchical Structure
// ============================================================================

const MAIN_CATEGORIES: Array<{
  id: string
  label: string
  value: ConsistencyType | null // null for parent categories
}> = [
  {
    id: 'llm_scorer',
    label: 'LLM Scorer',
    value: 'llm_scorer_consistency'
  },
  {
    id: 'scoring_metric',
    label: 'Scoring Metric',
    value: null // parent category
  },
  {
    id: 'llm_explainer',
    label: 'LLM Explainer',
    value: 'llm_explainer_consistency'
  }
]

const SUB_OPTIONS: Array<{
  value: ConsistencyType
  label: string
  parent: string
}> = [
  {
    value: 'within_explanation_score',
    label: 'Within-explanation',
    parent: 'scoring_metric'
  },
  {
    value: 'cross_explanation_score',
    label: 'Cross-explanation',
    parent: 'scoring_metric'
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

  const [headerStructure, setHeaderStructure] = useState<HeaderStructure | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Sub-options popover state
  const [subOptionsPopover, setSubOptionsPopover] = useState<{
    visible: boolean
    anchorEl: HTMLElement | null
  }>({
    visible: false,
    anchorEl: null
  })

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

  // Determine active main category based on selected consistency type
  const getActiveMainCategory = (): string => {
    const subOption = SUB_OPTIONS.find(opt => opt.value === selectedConsistencyType)
    if (subOption) {
      return subOption.parent // 'scoring_metric'
    }
    // Check main categories
    const mainCat = MAIN_CATEGORIES.find(cat => cat.value === selectedConsistencyType)
    return mainCat?.id || 'llm_scorer'
  }

  const activeMainCategory = getActiveMainCategory()

  // Check if a consistency type is disabled
  const isConsistencyTypeDisabled = (type: ConsistencyType | null): boolean => {
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
      setConsistencyType('within_explanation_score')
    }
  }, [selectedExplainers.size, selectedConsistencyType, setConsistencyType, hasOnlyOneExplainer]) // Re-run when number of explainers changes

  // Handle main category click
  const handleMainCategoryClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    categoryId: string,
    categoryValue: ConsistencyType | null
  ) => {
    // Check if disabled
    if (isConsistencyTypeDisabled(categoryValue)) {
      return
    }

    if (categoryValue) {
      // Direct value - select it
      setConsistencyType(categoryValue)
      setSubOptionsPopover({ visible: false, anchorEl: null })
    } else if (categoryId === 'scoring_metric') {
      // Parent category - toggle popover
      if (!subOptionsPopover.visible) {
        // Show popover, select default if needed
        if (activeMainCategory !== 'scoring_metric') {
          setConsistencyType('within_explanation_score')
        }
        setSubOptionsPopover({
          visible: true,
          anchorEl: event.currentTarget
        })
      } else {
        // Hide popover
        setSubOptionsPopover({ visible: false, anchorEl: null })
      }
    }
  }

  // Handle sub-option click in popover
  const handleSubOptionClick = (value: ConsistencyType) => {
    // Check if disabled
    if (isConsistencyTypeDisabled(value)) {
      return
    }

    setConsistencyType(value)
    setSubOptionsPopover({ visible: false, anchorEl: null })
  }

  // Close popover when clicking outside
  useEffect(() => {
    if (!subOptionsPopover.visible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (subOptionsPopover.anchorEl) {
        const target = event.target as Node
        const popoverElement = document.querySelector('.table-panel__sub-options-popover')

        if (
          !subOptionsPopover.anchorEl.contains(target) &&
          (!popoverElement || !popoverElement.contains(target))
        ) {
          setSubOptionsPopover({ visible: false, anchorEl: null })
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [subOptionsPopover.visible, subOptionsPopover.anchorEl])

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
      {/* Consistency Header */}
      <div className="table-panel__header">
        {/* Title */}
        <div className="table-panel__consistency-title">Consistency</div>

        {/* Main Category Buttons (3 horizontal) */}
        <div className="table-panel__main-categories">
          {MAIN_CATEGORIES.map((category) => {
            const disabled = isConsistencyTypeDisabled(category.value)
            return (
              <button
                key={category.id}
                className={`table-panel__main-category-button ${
                  activeMainCategory === category.id ? 'active' : ''
                } ${disabled ? 'disabled' : ''}`}
                onClick={(e) => handleMainCategoryClick(e, category.id, category.value)}
                disabled={disabled}
              >
                {category.label}
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

      {/* Sub-Options Popover (Portal-based) */}
      {subOptionsPopover.visible && subOptionsPopover.anchorEl && createPortal(
        (() => {
          const rect = subOptionsPopover.anchorEl.getBoundingClientRect()
          return (
            <div
              className="table-panel__sub-options-popover"
              style={{
                position: 'fixed',
                top: `${rect.bottom + 4}px`,
                left: `${rect.left + rect.width / 2 - 75}px`,
                zIndex: 1000
              }}
            >
              {SUB_OPTIONS.map((option) => {
                const disabled = isConsistencyTypeDisabled(option.value)
                return (
                  <button
                    key={option.value}
                    className={`table-panel__sub-options-popover-item ${
                      selectedConsistencyType === option.value ? 'active' : ''
                    } ${disabled ? 'disabled' : ''}`}
                    onClick={() => handleSubOptionClick(option.value)}
                    disabled={disabled}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )
        })(),
        document.body
      )}

      <div className="table-panel__content" ref={tableContainerRef}>
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
                    {cell.label}
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
                return (
                  <th
                    key={`row2-${idx}`}
                    colSpan={cell.colSpan}
                    className={`${cellClass} ${highlightedRows.row2 ? 'highlighted' : ''}`}
                  >
                    {cell.label}
                  </th>
                )
              })}
            </tr>

            {/* Row 3: Scorer labels (only shown when not averaged) */}
            {!isAveraged && (
              <tr className={`table-panel__header-row-3 ${highlightedRows.row3 ? 'highlighted' : ''}`}>
                {headerStructure.row3.map((cell, idx) => (
                  <th
                    key={`scorer-${idx}`}
                    className={`table-panel__scorer-header ${highlightedRows.row3 ? 'highlighted' : ''}`}
                    onMouseEnter={cell.title ? (e) => handleMouseEnter(e, cell.title!) : undefined}
                    onMouseLeave={cell.title ? handleMouseLeave : undefined}
                  >
                    {cell.label}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          <tbody className="table-panel__tbody">
            {tableData.features.map((row: FeatureTableRow) => {
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
