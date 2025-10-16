import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import type { ConsistencyType, SortBy } from '../types'
import { calculateColorBarLayout } from '../lib/d3-table-utils'
import '../styles/ConsistencyPanel.css'

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
// CONSISTENCY PANEL COMPONENT
// ============================================================================

const ConsistencyPanel: React.FC = () => {
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const rightPanel = useVisualizationStore(state => state.rightPanel)
  const selectedConsistencyType = useVisualizationStore(state => state.selectedConsistencyType)
  const setConsistencyType = useVisualizationStore(state => state.setConsistencyType)
  const sortBy = useVisualizationStore(state => state.tableSortBy)
  const sortDirection = useVisualizationStore(state => state.tableSortDirection)
  const setTableSort = useVisualizationStore(state => state.setTableSort)

  // Get selected LLM explainers
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Check if only one explainer is selected
  const hasOnlyOneExplainer = selectedExplainers.size === 1

  // Check if a consistency type is disabled
  const isConsistencyTypeDisabled = (type: ConsistencyType): boolean => {
    if (type === 'none') {
      return false
    }

    if (hasOnlyOneExplainer) {
      return type === 'cross_explanation_score' || type === 'llm_explainer_consistency'
    }

    if (selectedExplainers.size > 1) {
      return type === 'llm_scorer_consistency'
    }

    return false
  }

  // Calculate color bar layout
  const colorBarLayout = useMemo(() => calculateColorBarLayout(400, 12), [])

  // Auto-switch from disabled consistency types when explainer count changes
  React.useEffect(() => {
    const shouldSwitch = (
      (hasOnlyOneExplainer && (
        selectedConsistencyType === 'cross_explanation_score' ||
        selectedConsistencyType === 'llm_explainer_consistency'
      )) ||
      (selectedExplainers.size > 1 && selectedConsistencyType === 'llm_scorer_consistency')
    )

    if (shouldSwitch) {
      setConsistencyType('none')
    }
  }, [selectedExplainers.size, selectedConsistencyType, setConsistencyType, hasOnlyOneExplainer])

  // Handle consistency type click
  const handleConsistencyClick = (value: ConsistencyType) => {
    if (isConsistencyTypeDisabled(value)) {
      return
    }

    setConsistencyType(value)

    if (value !== 'none') {
      handleSort({ type: 'consistency', consistencyType: value })
    }
  }

  // Handle sort click
  const handleSort = (newSortBy: SortBy) => {
    if (JSON.stringify(sortBy) === JSON.stringify(newSortBy)) {
      if (sortDirection === null) {
        setTableSort(newSortBy, 'asc')
      } else if (sortDirection === 'asc') {
        setTableSort(newSortBy, 'desc')
      } else {
        setTableSort(null, null)
      }
    } else {
      setTableSort(newSortBy, 'asc')
    }
  }

  return (
    <div className="consistency-panel">
      {/* Title */}
      <div className="consistency-panel__title">Consistency</div>

      {/* Consistency Type Buttons */}
      <div className="consistency-panel__buttons">
        {CONSISTENCY_OPTIONS.map((option) => {
          const disabled = isConsistencyTypeDisabled(option.value)
          const isActive = selectedConsistencyType === option.value
          const isSorted = sortBy?.type === 'consistency' && sortBy.consistencyType === option.value
          const showSortIndicator = option.value !== 'none'

          return (
            <button
              key={option.id}
              className={`consistency-panel__button ${
                isActive ? 'active' : ''
              } ${disabled ? 'disabled' : ''}`}
              onClick={() => handleConsistencyClick(option.value)}
              disabled={disabled}
            >
              {option.label}
              {showSortIndicator && (
                <span className={`consistency-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Color Bar Legend */}
      <div className="consistency-panel__legend">
        <svg
          width={colorBarLayout.width}
          height={colorBarLayout.height}
          className="consistency-panel__color-bar"
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
            className="consistency-panel__color-bar-label-left"
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
            className="consistency-panel__color-bar-label-right"
            textAnchor="start"
            dominantBaseline="central"
          >
            1 High
          </text>
        </svg>
      </div>
    </div>
  )
}

export default ConsistencyPanel
