import React from 'react'
import { useVisualizationStore } from '../../stores/visualization'
import FilterPanel from '../layout/FilterPanel'

interface InlineFilterConfigurationProps {
  onCreateVisualization: () => void
  className?: string
}

export const InlineFilterConfiguration: React.FC<InlineFilterConfigurationProps> = ({
  onCreateVisualization,
  className = ''
}) => {
  const filters = useVisualizationStore(state => state.filters)

  // Check if filters have been selected
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )

  return (
    <div className={`inline-filter-configuration ${className}`}>
      <div className="inline-filter-configuration__header">
        <h2 className="inline-filter-configuration__title">
          Configure Data Filters
        </h2>
        <p className="inline-filter-configuration__subtitle">
          Select your data filters to create a visualization
        </p>
      </div>

      <div className="inline-filter-configuration__content">
        <FilterPanel
          title=""
          showResetButton={true}
        />
      </div>

      <div className="inline-filter-configuration__footer">
        <button
          className="inline-filter-configuration__create-button"
          onClick={onCreateVisualization}
          disabled={!hasActiveFilters}
          title={hasActiveFilters ? "Create visualization with selected filters" : "Please select at least one filter option"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className="inline-filter-configuration__create-icon">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Create Visualization
        </button>
      </div>
    </div>
  )
}

export default InlineFilterConfiguration