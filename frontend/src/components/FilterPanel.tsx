import React, { useEffect, useState } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import type { Filters } from '../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface FilterDropdownProps {
  label: string
  options: string[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
}

interface FilterPanelProps {
  className?: string
  title?: string
  showResetButton?: boolean
}

// ============================================================================
// FILTER DROPDOWN COMPONENT
// ============================================================================

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Select options...',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(value => value !== option))
    } else {
      onChange([...selectedValues, option])
    }
  }

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([])
    } else {
      onChange(options)
    }
  }

  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return placeholder
    } else if (selectedValues.length === 1) {
      return selectedValues[0]
    } else if (selectedValues.length === options.length) {
      return 'All selected'
    } else {
      return `${selectedValues.length} selected`
    }
  }

  return (
    <div className="filter-dropdown">
      <label className="filter-dropdown__label">{label}</label>
      <div className="filter-dropdown__container">
        <button
          className={`filter-dropdown__button ${isOpen ? 'filter-dropdown__button--open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          type="button"
        >
          <span className="filter-dropdown__text">{getDisplayText()}</span>
          <span className="filter-dropdown__arrow">▼</span>
        </button>

        {isOpen && (
          <div className="filter-dropdown__menu">
            <button
              className="filter-dropdown__option filter-dropdown__option--select-all"
              onClick={handleSelectAll}
              type="button"
            >
              {selectedValues.length === options.length ? 'Deselect All' : 'Select All'}
            </button>

            <div className="filter-dropdown__divider" />

            {options.map(option => (
              <button
                key={option}
                className={`filter-dropdown__option ${
                  selectedValues.includes(option) ? 'filter-dropdown__option--selected' : ''
                }`}
                onClick={() => handleToggleOption(option)}
                type="button"
              >
                <span className="filter-dropdown__checkbox">
                  {selectedValues.includes(option) ? '✓' : '○'}
                </span>
                <span className="filter-dropdown__option-text">{option}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// ERROR COMPONENT
// ============================================================================

const ErrorMessage: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry
}) => (
  <div className="error-message">
    <div className="error-message__content">
      <span className="error-message__icon">⚠️</span>
      <span className="error-message__text">{message}</span>
    </div>
    {onRetry && (
      <button className="error-message__retry" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
)

// ============================================================================
// LOADING COMPONENT
// ============================================================================

const LoadingSpinner: React.FC = () => (
  <div className="loading-spinner">
    <div className="loading-spinner__circle"></div>
    <span className="loading-spinner__text">Loading filter options...</span>
  </div>
)

// ============================================================================
// MAIN FILTER PANEL COMPONENT
// ============================================================================

export const FilterPanel: React.FC<FilterPanelProps> = ({
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
  }, [filterOptions, loading, error])

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.filter-dropdown__container')) {
        // Close all dropdowns by forcing re-render
        // This is a simple approach; in production you might want a more sophisticated solution
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Handle filter changes
  const handleFilterChange = (filterType: keyof Filters, values: string[]) => {
    setFilters({ [filterType]: values })
    // API calls will be triggered by useEffect in parent components
  }

  // Handle retry
  const handleRetry = () => {
    clearError('filters')
    fetchFilterOptions()
  }

  // Handle reset
  const handleReset = () => {
    resetFilters()
    // Data will be cleared by resetFilters, no need to fetch
  }

  // Get filter counts for display
  const getSelectedCount = () => {
    const counts = Object.entries(filters).map(([key, values]) =>
      ({ key, count: values?.length || 0 })
    ).filter(({ count }) => count > 0)

    return counts.length > 0 ? counts : null
  }

  const selectedCount = getSelectedCount()

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
        {loading && <LoadingSpinner />}

        {error && (
          <ErrorMessage message={error} onRetry={handleRetry} />
        )}

        {filterOptions && !loading && !error && (
          <div className="filter-panel__filters">
            <FilterDropdown
              label="SAE Model"
              options={filterOptions.sae_id}
              selectedValues={filters.sae_id || []}
              onChange={(values) => handleFilterChange('sae_id', values)}
              placeholder="Select SAE models..."
            />

            <FilterDropdown
              label="Explanation Method"
              options={filterOptions.explanation_method}
              selectedValues={filters.explanation_method || []}
              onChange={(values) => handleFilterChange('explanation_method', values)}
              placeholder="Select explanation methods..."
            />

            <FilterDropdown
              label="LLM Explainer"
              options={filterOptions.llm_explainer}
              selectedValues={filters.llm_explainer || []}
              onChange={(values) => handleFilterChange('llm_explainer', values)}
              placeholder="Select LLM explainers..."
            />

            <FilterDropdown
              label="LLM Scorer"
              options={filterOptions.llm_scorer}
              selectedValues={filters.llm_scorer || []}
              onChange={(values) => handleFilterChange('llm_scorer', values)}
              placeholder="Select LLM scorers..."
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
}

export default FilterPanel