import React from 'react'
import { useVisualizationStore, useFilters, useFilterOptions } from '../../stores/visualization'

interface CompactFilterConfigurationProps {
  onCreateVisualization: () => void
  onCancel: () => void
  className?: string
}

export const CompactFilterConfiguration: React.FC<CompactFilterConfigurationProps> = ({
  onCreateVisualization,
  onCancel,
  className = ''
}) => {
  const filters = useFilters()
  const filterOptions = useFilterOptions()
  const { setFilters, resetFilters } = useVisualizationStore()

  // Check if filters have been selected
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )

  return (
    <div className={`compact-filter-configuration ${className}`}>
      <div className="compact-filter-configuration__header">
        <h2 className="compact-filter-configuration__title">
          Configure Data Filters
        </h2>
        <button
          className="compact-filter-configuration__close"
          onClick={onCancel}
          aria-label="Close filter configuration"
          title="Return to main view"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div className="compact-filter-configuration__content">
        <div className="filter-section">
          {filterOptions && Object.entries(filterOptions).map(([filterKey, options]) => (
            <div key={filterKey} className="filter-group">
              <label className="filter-label">
                {filterKey.replace('_', ' ').toUpperCase()}
              </label>
              <select
                className="filter-select"
                value={filters[filterKey as keyof typeof filters]?.[0] || ''}
                onChange={(e) => {
                  const selected = e.target.value ? [e.target.value] : []
                  setFilters({ [filterKey]: selected })
                }}
              >
                <option value="">Select {filterKey.replace('_', ' ')}</option>
                {options.map((option: string) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {filters[filterKey as keyof typeof filters]?.length > 0 && (
                <div className="selected-filters">
                  Selected: {filters[filterKey as keyof typeof filters]?.[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="compact-filter-configuration__footer">
        <button
          className="compact-filter-configuration__reset-button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          title="Reset all filters to default values"
        >
          Reset Filters
        </button>
        <button
          className="compact-filter-configuration__create-button"
          onClick={onCreateVisualization}
          disabled={!hasActiveFilters}
          title={hasActiveFilters ? "Create visualization with selected filters" : "Please select at least one filter option"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className="compact-filter-configuration__create-icon">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Create Visualization
        </button>
      </div>
    </div>
  )
}

export default CompactFilterConfiguration