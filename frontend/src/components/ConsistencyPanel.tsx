import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import type { ConsistencyType, SortBy } from '../types'
import { calculateColorBarLayout } from '../lib/d3-table-utils'
import {
  CONSISTENCY_COLORS,
  CONSISTENCY_TYPE_NONE,
  CONSISTENCY_TYPE_LLM_SCORER,
  CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  CONSISTENCY_TYPE_LLM_EXPLAINER
} from '../lib/constants'
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
    value: CONSISTENCY_TYPE_NONE
  },
  {
    id: 'llm_scorer',
    label: 'LLM Scorer',
    value: CONSISTENCY_TYPE_LLM_SCORER
  },
  {
    id: 'within_exp_metric',
    label: 'Within-exp. Metric',
    value: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC
  },
  {
    id: 'cross_exp_metric',
    label: 'Cross-exp. Metric',
    value: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC
  },
  {
    id: 'cross_exp_overall',
    label: 'Cross-exp. Overall',
    value: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE
  },
  {
    id: 'llm_explainer',
    label: 'LLM Explainer',
    value: CONSISTENCY_TYPE_LLM_EXPLAINER
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
    if (type === CONSISTENCY_TYPE_NONE) {
      return false
    }

    // LLM Scorer consistency is always available (works for any number of explainers)
    if (type === CONSISTENCY_TYPE_LLM_SCORER) {
      return false
    }

    // Cross-explanation and LLM Explainer consistency require multiple explainers
    if (hasOnlyOneExplainer) {
      return type === CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC ||
             type === CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE ||
             type === CONSISTENCY_TYPE_LLM_EXPLAINER
    }

    return false
  }

  // Calculate color bar layout (updates when consistency type changes)
  const colorBarLayout = useMemo(() => calculateColorBarLayout(400, 12, selectedConsistencyType), [selectedConsistencyType])

  // Auto-switch from disabled consistency types when explainer count changes
  React.useEffect(() => {
    const shouldSwitch = (
      hasOnlyOneExplainer && (
        selectedConsistencyType === CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC ||
        selectedConsistencyType === CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE ||
        selectedConsistencyType === CONSISTENCY_TYPE_LLM_EXPLAINER
      )
    )

    if (shouldSwitch) {
      setConsistencyType(CONSISTENCY_TYPE_NONE)
    }
  }, [selectedExplainers.size, selectedConsistencyType, setConsistencyType, hasOnlyOneExplainer])

  // Get button color based on consistency type
  const getButtonColor = (consistencyType: ConsistencyType): string | null => {
    switch (consistencyType) {
      case CONSISTENCY_TYPE_LLM_SCORER:
        return CONSISTENCY_COLORS.LLM_SCORER.HIGH
      case CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC:
        return CONSISTENCY_COLORS.WITHIN_EXPLANATION.HIGH
      case CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC:
        return CONSISTENCY_COLORS.CROSS_EXPLANATION.HIGH
      case CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE:
        return CONSISTENCY_COLORS.CROSS_EXPLANATION_OVERALL.HIGH
      case CONSISTENCY_TYPE_LLM_EXPLAINER:
        return CONSISTENCY_COLORS.LLM_EXPLAINER.HIGH
      case CONSISTENCY_TYPE_NONE:
      default:
        return null
    }
  }

  // Handle consistency type click
  const handleConsistencyClick = (value: ConsistencyType) => {
    if (isConsistencyTypeDisabled(value)) {
      return
    }

    setConsistencyType(value)

    // Trigger sorting when clicking on a consistency type (except 'none')
    if (value !== CONSISTENCY_TYPE_NONE) {
      // Map ConsistencyType to SortBy
      const sortKey = value as SortBy
      handleSort(sortKey)
    }
  }

  // Handle sort click (cycle through: null → asc → desc → null)
  const handleSort = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      // Same sort key: cycle through directions
      if (sortDirection === null) {
        setTableSort(newSortBy, 'asc')
      } else if (sortDirection === 'asc') {
        setTableSort(newSortBy, 'desc')
      } else {
        setTableSort(null, null)
      }
    } else {
      // New sort key: start with ascending
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
          const isSorted = sortBy === option.value
          const showSortIndicator = option.value !== CONSISTENCY_TYPE_NONE
          const buttonColor = getButtonColor(option.value)

          // Compute button style based on color and active state
          // Only apply color if button is not disabled
          const buttonStyle: React.CSSProperties = (buttonColor && !disabled) ? {
            backgroundColor: buttonColor,
            borderColor: buttonColor,
            color: 'white',
            opacity: isActive ? 1.0 : 0.6  // Higher opacity for selectable buttons
          } : {}

          return (
            <button
              key={option.id}
              className={`consistency-panel__button ${
                isActive ? 'active' : ''
              } ${disabled ? 'disabled' : ''} ${(buttonColor && !disabled) ? 'colored' : ''}`}
              style={buttonStyle}
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
            <linearGradient id={`consistency-gradient-${selectedConsistencyType}`} x1="0%" y1="0%" x2="100%" y2="0%">
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
            fill={`url(#consistency-gradient-${selectedConsistencyType})`}
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
