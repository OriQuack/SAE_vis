import React from 'react'
import '../styles/StatusPanel.css'

// ============================================================================
// STATUS PANEL - Sorting controls for scrollable lists
// ============================================================================
// Displays sort mode toggle (primary metric vs uncertainty) and sort direction
// When sorting differs from template, selection highlighting is disabled in the view

interface StatusPanelProps {
  // Sort state
  sortMode: 'default' | 'decisionMargin'
  sortDirection: 'asc' | 'desc'
  onSortModeChange: (mode: 'default' | 'decisionMargin') => void
  onSortDirectionChange: (direction: 'asc' | 'desc') => void

  // Labels (stage-specific)
  defaultModeLabel: string  // "Decoder sim" or "Quality score"

  // Template indicator
  isTemplateSort: boolean

  className?: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  sortMode,
  sortDirection,
  onSortModeChange,
  onSortDirectionChange,
  defaultModeLabel,
  className = ''
}) => {
  return (
    <div className={`status-panel ${className}`}>
      {/* Sort Mode Group */}
      <span className="status-panel__label">Sort by:</span>
      <div className="status-panel__group">
        <button
          className={`status-panel__button ${sortMode === 'default' ? 'status-panel__button--active' : ''}`}
          onClick={() => onSortModeChange('default')}
        >
          {defaultModeLabel}
        </button>
        <button
          className={`status-panel__button ${sortMode === 'decisionMargin' ? 'status-panel__button--active' : ''}`}
          onClick={() => onSortModeChange('decisionMargin')}
        >
          Uncertainty
        </button>
      </div>

      {/* Divider */}
      <div className="status-panel__divider" />

      {/* Sort Direction Group */}
      <div className="status-panel__group">
        <button
          className={`status-panel__button status-panel__button--icon ${sortDirection === 'asc' ? 'status-panel__button--active' : ''}`}
          onClick={() => onSortDirectionChange('asc')}
          title="Ascending"
        >
          ↑ Asc
        </button>
        <button
          className={`status-panel__button status-panel__button--icon ${sortDirection === 'desc' ? 'status-panel__button--active' : ''}`}
          onClick={() => onSortDirectionChange('desc')}
          title="Descending"
        >
          ↓ Desc
        </button>
      </div>
    </div>
  )
}

export default React.memo(StatusPanel)
