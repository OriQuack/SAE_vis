import React, { useEffect, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import FilterDropdown from './shared/FilterDropdown'
import ErrorMessage from './shared/ErrorMessage'
import LoadingSpinner from './LoadingSpinner'
import type { Filters } from '../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface FilterPanelProps {
  className?: string
  title?: string
  showResetButton?: boolean
}

// ============================================================================
// MAIN FILTER PANEL COMPONENT
// ============================================================================

export const FilterPanel: React.FC<FilterPanelProps> = React.memo(({
  className = '',
  title = 'Filters',
  showResetButton = true
}) => {
  const filters = useVisualizationStore(state => state.filters)
  const filterOptions = useVisualizationStore(state => state.filterOptions)
  const loading = useVisualizationStore(state => state.loading.filters)
  const error = useVisualizationStore(state => state.errors.filters)
  const { setFilters, resetFilters, fetchFilterOptions, clearError } = useVisualizationStore()

  // Fetch filter options on mount
  useEffect(() => {
    if (!filterOptions && !loading && !error) {
      fetchFilterOptions()
    }
  }, [filterOptions, loading, error, fetchFilterOptions])

  // Handle filter changes - memoized
  const handleFilterChange = useCallback((filterType: keyof Filters, values: string[]) => {
    setFilters({ [filterType]: values })
  }, [setFilters])

  // Handle retry - memoized
  const handleRetry = useCallback(() => {
    clearError('filters')
    fetchFilterOptions()
  }, [clearError, fetchFilterOptions])

  // Handle reset - memoized
  const handleReset = useCallback(() => {
    resetFilters()
  }, [resetFilters])

  // Get filter counts for display - memoized
  const selectedCount = useMemo(() => {
    const counts = Object.entries(filters).map(([key, values]) =>
      ({ key, count: values?.length || 0 })
    ).filter(({ count }) => count > 0)

    return counts.length > 0 ? counts : null
  }, [filters])

  return (
    <div className={`filter-panel ${className}`}>
      {/* Header */}
      <div className="filter-panel__header">
        <h2 className="filter-panel__title">{title}</h2>
        {selectedCount && (
          <div className="filter-panel__summary">
            {selectedCount.map(({ key, count }) => (
              <span key={key} className="filter-panel__count">
                {key.replace('_', ' ')}: {count}
              </span>
            ))}
          </div>
        )}
        {showResetButton && selectedCount && (
          <button
            className="filter-panel__reset"
            onClick={handleReset}
            title="Reset all filters"
          >
            Reset
          </button>
        )}
      </div>

      {/* Content */}
      <div className="filter-panel__content">
        {loading && (
          <LoadingSpinner message="Loading filter options..." />
        )}

        {error && (
          <ErrorMessage message={error} onRetry={handleRetry} />
        )}

        {filterOptions && !loading && !error && (
          <div className="filter-panel__filters">
            <FilterDropdown
              label="SAE"
              options={filterOptions.sae_id}
              selectedValues={filters.sae_id || []}
              onChange={(values) => handleFilterChange('sae_id', values)}
              placeholder="Select SAE..."
            />

            <FilterDropdown
              label="Method"
              options={filterOptions.explanation_method}
              selectedValues={filters.explanation_method || []}
              onChange={(values) => handleFilterChange('explanation_method', values)}
              placeholder="Select method..."
            />

            <FilterDropdown
              label="Explainer"
              options={filterOptions.llm_explainer}
              selectedValues={filters.llm_explainer || []}
              onChange={(values) => handleFilterChange('llm_explainer', values)}
              placeholder="Select explainer..."
            />

            <FilterDropdown
              label="Scorer"
              options={filterOptions.llm_scorer}
              selectedValues={filters.llm_scorer || []}
              onChange={(values) => handleFilterChange('llm_scorer', values)}
              placeholder="Select scorer..."
            />
          </div>
        )}

        {/* Empty state */}
        {!filterOptions && !loading && !error && (
          <div className="filter-panel__empty">
            <p>No filter options available</p>
            <button onClick={fetchFilterOptions}>Load Filters</button>
          </div>
        )}
      </div>
    </div>
  )
})

FilterPanel.displayName = 'FilterPanel'

export default FilterPanel