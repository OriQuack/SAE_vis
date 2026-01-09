import React from 'react'
import '../styles/StatusPanel.css'

// ============================================================================
// STATUS PANEL - Sorting controls for scrollable lists
// ============================================================================
// Displays sort options + optional filter buttons (for Cause view)

// Filter option type for cause categories
interface FilterOption {
  value: string
  label: string
  color: string
}

interface StatusPanelProps {
  // Sort state
  sortMode: 'default' | 'decisionMargin'
  sortDirection: 'asc' | 'desc'
  onSortModeChange: (mode: 'default' | 'decisionMargin') => void
  onSortDirectionChange: (direction: 'asc' | 'desc') => void

  // Stage-specific labels for default metric options (optional - if not provided, default buttons hidden)
  defaultAscLabel?: string
  defaultDescLabel?: string

  // Template indicator
  isTemplateSort: boolean

  // Filter options (optional - for Cause view)
  filterOptions?: FilterOption[]
  filterValue?: string | null
  onFilterChange?: (value: string | null) => void
  filterDisabled?: boolean  // Show filter but disable it (e.g., in "Most Uncertain First" mode)

  // Disable "Most Confident First" button (e.g., before SVM is trained in Cause view)
  mostConfidentDisabled?: boolean

  className?: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  sortMode,
  sortDirection,
  onSortModeChange,
  onSortDirectionChange,
  defaultAscLabel,
  defaultDescLabel,
  filterOptions,
  filterValue,
  onFilterChange,
  filterDisabled = false,
  mostConfidentDisabled = false,
  className = ''
}) => {
  // Helper to check if a sort option is active
  const isActive = (mode: 'default' | 'decisionMargin', direction: 'asc' | 'desc') =>
    sortMode === mode && sortDirection === direction

  // Helper to handle combined mode + direction change
  const handleSortChange = (mode: 'default' | 'decisionMargin', direction: 'asc' | 'desc') => {
    if (sortMode !== mode) onSortModeChange(mode)
    if (sortDirection !== direction) onSortDirectionChange(direction)
  }

  return (
    <div className={`status-panel ${className}`}>
      <span className="status-panel__label">Sort:</span>

      <div className="status-panel__group">
        {/* Default metric options (only shown if labels provided) */}
        {defaultAscLabel && defaultDescLabel && (
          <>
            <button
              className={`status-panel__button ${isActive('default', 'asc') ? 'status-panel__button--active' : ''}`}
              onClick={() => handleSortChange('default', 'asc')}
            >
              {defaultAscLabel}
            </button>
            <button
              className={`status-panel__button ${isActive('default', 'desc') ? 'status-panel__button--active' : ''}`}
              onClick={() => handleSortChange('default', 'desc')}
            >
              {defaultDescLabel}
            </button>
            <div className="status-panel__divider" />
          </>
        )}

        {/* Decision margin options: low margin = uncertain, high margin = confident */}
        <button
          className={`status-panel__button ${isActive('decisionMargin', 'asc') ? 'status-panel__button--active' : ''}`}
          onClick={() => handleSortChange('decisionMargin', 'asc')}
        >
          Most Uncertain First
        </button>
        <button
          className={`status-panel__button ${isActive('decisionMargin', 'desc') ? 'status-panel__button--active' : ''}`}
          onClick={() => handleSortChange('decisionMargin', 'desc')}
          disabled={mostConfidentDisabled}
          title={mostConfidentDisabled ? 'Tag 2+ features per category to enable' : undefined}
        >
          Most Confident First
        </button>
      </div>

      {/* Filter options (optional - shown on the right) */}
      {filterOptions && onFilterChange && (
        <div className={`status-panel__filter-section ${filterDisabled ? 'status-panel__filter-section--disabled' : ''}`}>
          <div className="status-panel__divider status-panel__divider--vertical" />
          <span className="status-panel__label">Filter:</span>
          <div className="status-panel__group">
            <button
              className={`status-panel__button ${filterValue === null && !filterDisabled ? 'status-panel__button--active' : ''}`}
              onClick={() => !filterDisabled && onFilterChange(null)}
              disabled={filterDisabled}
            >
              All
            </button>
            {filterOptions.map(option => (
              <button
                key={option.value}
                className={`status-panel__button ${filterValue === option.value && !filterDisabled ? 'status-panel__button--active' : ''}`}
                style={{ '--tag-color': option.color } as React.CSSProperties}
                onClick={() => !filterDisabled && onFilterChange(option.value)}
                disabled={filterDisabled}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default React.memo(StatusPanel)
