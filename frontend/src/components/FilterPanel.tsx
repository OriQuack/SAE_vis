import { useVisualizationStore } from '../store'
import '../styles/FilterPanel.css'

// ============================================================================
// FILTER PANEL PROPS
// ============================================================================
interface FilterPanelProps {
  onCreateVisualization: () => void
  onCancel: () => void
  className?: string
  panel?: 'left' | 'right'
}

// ============================================================================
// MAIN FILTER PANEL COMPONENT
// ============================================================================
export const FilterPanel = ({
  onCreateVisualization,
  onCancel,
  className = '',
  panel = 'left'
}: FilterPanelProps) => {
  const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
  const store = useVisualizationStore()
  const filters = store[panelKey].filters
  const filterOptions = store.filterOptions
  const setFilters = (newFilters: any) => store.setFilters(newFilters, panel)
  const resetFilters = () => store.resetFilters(panel)

  // Check if filters have been selected
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )

  // Handle dropdown changes
  const handleFilterChange = (filterKey: string, value: string) => {
    const selected = value ? [value] : []
    setFilters({ [filterKey]: selected })
  }

  // Format filter key for display
  const formatFilterLabel = (key: string) => {
    return key.replace('_', ' ').toUpperCase()
  }

  // Render dropdown for a specific filter
  const renderFilterDropdown = (filterKey: string, options: string[]) => {
    const currentValue = filters[filterKey as keyof typeof filters]?.[0] || ''

    return (
      <div key={filterKey} className="filter-panel__filter-group">
        <label className="filter-panel__filter-label">
          {formatFilterLabel(filterKey)}
        </label>
        <select
          className="filter-panel__filter-select"
          value={currentValue}
          onChange={(e) => handleFilterChange(filterKey, e.target.value)}
        >
          <option value="">Select {formatFilterLabel(filterKey).toLowerCase()}</option>
          {options.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {currentValue && (
          <div className="filter-panel__selected-filters">
            Selected: {currentValue}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`filter-panel ${className}`}>
      {/* Header */}
      <div className="filter-panel__header">
        <h2 className="filter-panel__title">Configure Data Filters</h2>
        <button
          className="filter-panel__close-button"
          onClick={onCancel}
          aria-label="Close filter configuration"
          title="Return to main view"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="filter-panel__close-icon">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Filter Content */}
      <div className="filter-panel__content">
        <div className="filter-panel__filter-section">
          {filterOptions && Object.entries(filterOptions).map(([filterKey, options]) =>
            renderFilterDropdown(filterKey, options)
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="filter-panel__footer">
        <button
          className="filter-panel__reset-button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          title="Reset all filters to default values"
        >
          Reset Filters
        </button>

        <button
          className="filter-panel__create-button"
          onClick={onCreateVisualization}
          disabled={!hasActiveFilters}
          title={hasActiveFilters ? "Create visualization with selected filters" : "Please select at least one filter option"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="filter-panel__button-icon">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Create Visualization
        </button>
      </div>
    </div>
  )
}

export default FilterPanel
