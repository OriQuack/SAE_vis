import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow } from '../types'
import {
  buildHeaderStructure,
  formatTableScore,
  getExplainerDisplayName,
  extractRowScores,
  type HeaderStructure
} from '../lib/d3-table-utils'
import '../styles/TablePanel.css'

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

  const [headerStructure, setHeaderStructure] = useState<HeaderStructure | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)

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
    rightPanel.filters.llm_explainer
  ])

  // Build header structure when table data changes
  useEffect(() => {
    if (tableData && tableData.explainer_ids.length > 0) {
      const isAveraged = tableData.is_averaged || false
      const scorerIds = tableData.scorer_ids || []
      const structure = buildHeaderStructure(tableData.explainer_ids, isAveraged, scorerIds)
      setHeaderStructure(structure)
    } else {
      setHeaderStructure(null)
    }
  }, [tableData])

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

  // Get selected LLM explainers
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
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

  // Determine if scores are averaged (2+ explainers selected)
  const isAveraged = tableData.is_averaged || false

  // Render table with conditional 2-row or 3-row header
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      <div className="table-panel__content" ref={tableContainerRef}>
        <table className="table-panel__table">
          <thead className="table-panel__thead">
            {/* Row 1: Explainer names */}
            <tr className="table-panel__header-row-1">
              <th className="table-panel__feature-id-header" rowSpan={isAveraged ? 2 : 3}>
                ID
              </th>
              {headerStructure.row1.map((cell, idx) => (
                <th
                  key={`explainer-${idx}`}
                  colSpan={cell.colSpan}
                  className="table-panel__explainer-header"
                >
                  {cell.label}
                </th>
              ))}
            </tr>

            {/* Row 2: Metric names (Embedding, Fuzz, Detection) */}
            <tr className="table-panel__header-row-2">
              {headerStructure.row2.map((cell, idx) => (
                <th
                  key={`metric-${idx}`}
                  colSpan={cell.colSpan}
                  className="table-panel__metric-header"
                >
                  {cell.label}
                </th>
              ))}
            </tr>

            {/* Row 3: Scorer labels (only shown when not averaged) */}
            {!isAveraged && (
              <tr className="table-panel__header-row-3">
                {headerStructure.row3.map((cell, idx) => (
                  <th
                    key={`scorer-${idx}`}
                    className="table-panel__scorer-header"
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
              const scores = extractRowScores(row, tableData.explainer_ids, isAveraged)
              return (
                <tr key={row.feature_id} className="table-panel__feature-row">
                  <td className="table-panel__feature-id-cell">
                    {row.feature_id}
                  </td>
                  {scores.map((score, idx) => (
                    <td
                      key={`${row.feature_id}-${idx}`}
                      className="table-panel__score-cell"
                    >
                      {formatTableScore(score)}
                    </td>
                  ))}
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
