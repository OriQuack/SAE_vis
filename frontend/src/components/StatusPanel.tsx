import React from 'react'
import '../styles/StatusPanel.css'

// ============================================================================
// STATUS PANEL - Sorting controls for scrollable lists
// ============================================================================
// Displays 4 descriptive sort options combining metric + direction
// Each button clearly describes what will be shown first

interface StatusPanelProps {
  // Sort state
  sortMode: 'default' | 'decisionMargin'
  sortDirection: 'asc' | 'desc'
  onSortModeChange: (mode: 'default' | 'decisionMargin') => void
  onSortDirectionChange: (direction: 'asc' | 'desc') => void

  // Stage-specific labels for default metric options
  defaultAscLabel: string   // e.g., "Least similar first" or "Lowest quality first"
  defaultDescLabel: string  // e.g., "Most similar first" or "Highest quality first"

  // Template indicator
  isTemplateSort: boolean

  className?: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  sortMode,
  sortDirection,
  onSortModeChange,
  onSortDirectionChange,
  defaultAscLabel,
  defaultDescLabel,
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

      {/* All 4 sort options as combined buttons */}
      <div className="status-panel__group">
        {/* Default metric options */}
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

        {/* Divider */}
        <div className="status-panel__divider" />

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
        >
          Most Confident First
        </button>
      </div>
    </div>
  )
}

export default React.memo(StatusPanel)
