import React from 'react'
import { useVisualizationStore } from '../store'

// ============================================================================
// INLINE STYLES
// ============================================================================
const STYLES = {
  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    margin: '16px 0'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px'
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 150ms ease'
  },
  closeButtonHover: {
    backgroundColor: '#f3f4f6',
    color: '#374151'
  },
  content: {
    marginBottom: '20px'
  },
  filterSection: {
    display: 'grid',
    gap: '16px'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em'
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    transition: 'all 150ms ease',
    cursor: 'pointer'
  },
  filterSelectFocus: {
    outline: 'none',
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.1)'
  },
  selectedFilters: {
    fontSize: '12px',
    color: '#7c3aed',
    fontWeight: '500',
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    border: '1px solid #e5e7eb'
  },
  footer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '16px'
  },
  resetButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#6b7280',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease'
  },
  resetButtonHover: {
    backgroundColor: '#f9fafb',
    borderColor: '#9ca3af'
  },
  resetButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  createButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  createButtonHover: {
    backgroundColor: '#2563eb'
  },
  createButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed'
  },
  icon: {
    width: '16px',
    height: '16px'
  }
}

// ============================================================================
// FILTER PANEL PROPS
// ============================================================================
interface FilterPanelProps {
  onCreateVisualization: () => void
  onCancel: () => void
  className?: string
}

// ============================================================================
// MAIN FILTER PANEL COMPONENT
// ============================================================================
export const FilterPanel: React.FC<FilterPanelProps> = ({
  onCreateVisualization,
  onCancel,
  className = ''
}) => {
  const { filters, filterOptions, setFilters, resetFilters } = useVisualizationStore()

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
      <div key={filterKey} style={STYLES.filterGroup}>
        <label style={STYLES.filterLabel}>
          {formatFilterLabel(filterKey)}
        </label>
        <select
          style={STYLES.filterSelect}
          value={currentValue}
          onChange={(e) => handleFilterChange(filterKey, e.target.value)}
          onFocus={(e) => Object.assign(e.currentTarget.style, STYLES.filterSelectFocus)}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <option value="">Select {formatFilterLabel(filterKey).toLowerCase()}</option>
          {options.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {currentValue && (
          <div style={STYLES.selectedFilters}>
            Selected: {currentValue}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={className} style={STYLES.container}>
      {/* Header */}
      <div style={STYLES.header}>
        <h2 style={STYLES.title}>Configure Data Filters</h2>
        <button
          style={STYLES.closeButton}
          onClick={onCancel}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, STYLES.closeButtonHover)}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#6b7280'
          }}
          aria-label="Close filter configuration"
          title="Return to main view"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={STYLES.icon}>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Filter Content */}
      <div style={STYLES.content}>
        <div style={STYLES.filterSection}>
          {filterOptions && Object.entries(filterOptions).map(([filterKey, options]) =>
            renderFilterDropdown(filterKey, options)
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={STYLES.footer}>
        <button
          style={{
            ...STYLES.resetButton,
            ...(hasActiveFilters ? {} : STYLES.resetButtonDisabled)
          }}
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          onMouseEnter={(e) => {
            if (hasActiveFilters) {
              Object.assign(e.currentTarget.style, STYLES.resetButtonHover)
            }
          }}
          onMouseLeave={(e) => {
            if (hasActiveFilters) {
              e.currentTarget.style.backgroundColor = '#ffffff'
              e.currentTarget.style.borderColor = '#d1d5db'
            }
          }}
          title="Reset all filters to default values"
        >
          Reset Filters
        </button>

        <button
          style={{
            ...STYLES.createButton,
            ...(hasActiveFilters ? {} : STYLES.createButtonDisabled)
          }}
          onClick={onCreateVisualization}
          disabled={!hasActiveFilters}
          onMouseEnter={(e) => {
            if (hasActiveFilters) {
              Object.assign(e.currentTarget.style, STYLES.createButtonHover)
            }
          }}
          onMouseLeave={(e) => {
            if (hasActiveFilters) {
              e.currentTarget.style.backgroundColor = '#3b82f6'
            }
          }}
          title={hasActiveFilters ? "Create visualization with selected filters" : "Please select at least one filter option"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={STYLES.icon}>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Create Visualization
        </button>
      </div>
    </div>
  )
}

export default FilterPanel