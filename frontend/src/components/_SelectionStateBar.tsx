import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import { SELECTION_CATEGORY_COLORS, type SelectionCategory } from '../lib/constants'
import '../styles/SelectionStateBar.css'

interface SelectionStateBarProps {
  mode: 'feature' | 'pair'
}

interface CategoryCounts {
  confirmed: number
  expanded: number
  rejected: number
  unsure: number
  total: number
}

const CATEGORY_CONFIG: Record<SelectionCategory, { label: string; color: string; description: string }> = {
  confirmed: {
    label: 'Confirmed',
    color: SELECTION_CATEGORY_COLORS.CONFIRMED.HEX,
    description: 'Manually selected by user'
  },
  expanded: {
    label: 'Expanded',
    color: SELECTION_CATEGORY_COLORS.EXPANDED.HEX,
    description: 'Auto-tagged by histogram thresholds'
  },
  rejected: {
    label: 'Rejected',
    color: SELECTION_CATEGORY_COLORS.REJECTED.HEX,
    description: 'Manually rejected by user'
  },
  unsure: {
    label: 'Unsure',
    color: SELECTION_CATEGORY_COLORS.UNSURE.HEX,
    description: 'Not selected or investigated'
  }
}

/**
 * SelectionStateBar - Interactive horizontal bar showing feature/pair selection distribution
 *
 * Categories:
 * - Confirmed: User manually selected (green)
 * - Expanded: Auto-tagged by histogram (blue)
 * - Rejected: User manually rejected (red)
 * - Unsure: Not selected/tagged (gray)
 *
 * Click a segment to sort table by that category and scroll to it
 */
export default function SelectionStateBar({ mode }: SelectionStateBarProps) {
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const sortTableByCategory = useVisualizationStore(state => state.sortTableByCategory)

  // Calculate counts for each category
  const counts = useMemo((): CategoryCounts => {
    let confirmed = 0
    let expanded = 0
    let rejected = 0
    let unsure = 0

    if (mode === 'feature' && tableData?.features) {
      // Count features in each category
      tableData.features.forEach((feature: any) => {
        const featureId = feature.feature_id
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          rejected++
        } else {
          unsure++
        }
      })
    } else if (mode === 'pair' && tableData?.pairs) {
      // Count pairs in each category
      tableData.pairs.forEach((pair: any) => {
        const pairKey = pair.pairKey
        const selectionState = pairSelectionStates.get(pairKey)
        const source = pairSelectionSources.get(pairKey)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          rejected++
        } else {
          unsure++
        }
      })
    }

    const total = confirmed + expanded + rejected + unsure

    return { confirmed, expanded, rejected, unsure, total }
  }, [mode, tableData, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources])

  // Calculate percentages
  const percentages = useMemo(() => {
    if (counts.total === 0) {
      return {
        confirmed: 0,
        expanded: 0,
        rejected: 0,
        unsure: 100
      }
    }

    return {
      confirmed: (counts.confirmed / counts.total) * 100,
      expanded: (counts.expanded / counts.total) * 100,
      rejected: (counts.rejected / counts.total) * 100,
      unsure: (counts.unsure / counts.total) * 100
    }
  }, [counts])

  // Handle category click - sort table by category and scroll to it
  const handleCategoryClick = (category: SelectionCategory) => {
    console.log(`[SelectionStateBar] Clicked category: ${category}`)
    sortTableByCategory(category, mode)
    // TODO: Implement scrolling to the first item of the category
    // This could be done by finding the first item of that category and scrolling to it
  }

  // Don't render if no data
  if (!tableData || counts.total === 0) {
    return null
  }

  return (
    <div className="selection-state-bar">
      <div className="selection-state-bar__header">
        <span className="selection-state-bar__title">
          Selection State ({mode === 'feature' ? 'Features' : 'Pairs'})
        </span>
        <span className="selection-state-bar__total">
          {counts.total} Total
        </span>
      </div>

      <div className="selection-state-bar__chart">
        {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
          const percentage = percentages[category]
          const count = counts[category]
          const config = CATEGORY_CONFIG[category]

          // Don't render segment if count is 0
          if (count === 0) {
            return null
          }

          return (
            <div
              key={category}
              className={`selection-state-bar__segment selection-state-bar__segment--${category}`}
              style={{
                width: `${percentage}%`,
                backgroundColor: config.color
              }}
              onClick={() => handleCategoryClick(category)}
              title={`${config.label}: ${count} (${percentage.toFixed(1)}%) - ${config.description}`}
            >
              {/* Show label if segment is wide enough (>10%) */}
              {percentage > 10 && (
                <span className="selection-state-bar__label">
                  {config.label} ({count})
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="selection-state-bar__legend">
        {(Object.keys(CATEGORY_CONFIG) as SelectionCategory[]).map((category) => {
          const count = counts[category]
          const config = CATEGORY_CONFIG[category]
          const percentage = percentages[category]

          return (
            <div key={category} className="selection-state-bar__legend-item">
              <div
                className="selection-state-bar__legend-color"
                style={{ backgroundColor: config.color }}
              />
              <span className="selection-state-bar__legend-label">
                {config.label}
              </span>
              <span className="selection-state-bar__legend-count">
                {count} ({percentage.toFixed(1)}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
