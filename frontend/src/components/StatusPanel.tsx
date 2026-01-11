import React from 'react'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
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
  sortMode: SortMode
  sortDirection: 'asc' | 'desc'
  onSortModeChange: (mode: SortMode) => void
  onSortDirectionChange: (direction: 'asc' | 'desc') => void

  // Diversity mode availability
  hasDiversityIds?: boolean  // Show diversity button only when medoid IDs are available

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

  // Disable decision margin buttons (e.g., before SVM is trained - need 3+ tags per category)
  decisionMarginDisabled?: boolean

  // Hide tagged items checkbox (optional - for all tagging views)
  hideTagged?: boolean
  onHideTaggedChange?: (value: boolean) => void

  className?: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  sortMode,
  sortDirection,
  onSortModeChange,
  onSortDirectionChange,
  hasDiversityIds = false,
  defaultAscLabel,
  defaultDescLabel,
  filterOptions,
  filterValue,
  onFilterChange,
  filterDisabled = false,
  decisionMarginDisabled = false,
  hideTagged,
  onHideTaggedChange,
  className = ''
}) => {
  // Helper to check if a sort option is active
  const isActive = (mode: SortMode, direction?: 'asc' | 'desc') =>
    sortMode === mode && (direction === undefined || sortDirection === direction)

  // Helper to handle combined mode + direction change
  const handleSortChange = (mode: SortMode, direction?: 'asc' | 'desc') => {
    if (sortMode !== mode) onSortModeChange(mode)
    if (direction !== undefined && sortDirection !== direction) onSortDirectionChange(direction)
  }

  return (
    <div className={`status-panel ${className}`}>
      <span className="status-panel__label">View:</span>

      <div className="status-panel__group">
        {/* Diversity option (only shown if medoid IDs are available) */}
        {hasDiversityIds && (
          <>
            <button
              className={`status-panel__button ${isActive('diversity') ? 'status-panel__button--active' : ''}`}
              onClick={() => handleSortChange('diversity')}
              title="Show only diverse representative samples (cluster medoids)"
            >
              Representatives Only
            </button>
            <div className="status-panel__divider" />
          </>
        )}

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
          disabled={decisionMarginDisabled}
          title={decisionMarginDisabled ? 'Tag 3+ items per category to enable' : undefined}
        >
          Most Uncertain First
        </button>
        <button
          className={`status-panel__button ${isActive('decisionMargin', 'desc') ? 'status-panel__button--active' : ''}`}
          onClick={() => handleSortChange('decisionMargin', 'desc')}
          disabled={decisionMarginDisabled}
          title={decisionMarginDisabled ? 'Tag 3+ items per category to enable' : undefined}
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

      {/* Hide Tagged checkbox (optional - for all tagging views) */}
      {onHideTaggedChange !== undefined && (
        <div className="status-panel__hide-tagged">
          <label className="status-panel__checkbox-label">
            <input
              type="checkbox"
              checked={hideTagged ?? true}
              onChange={(e) => onHideTaggedChange(e.target.checked)}
            />
            Hide Tagged
          </label>
        </div>
      )}
    </div>
  )
}

export default React.memo(StatusPanel)
