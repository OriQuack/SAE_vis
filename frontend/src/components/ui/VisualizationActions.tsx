import React from 'react'

interface VisualizationActionsProps {
  onEditFilters: () => void
  onRemove: () => void
  className?: string
}

export const VisualizationActions: React.FC<VisualizationActionsProps> = ({
  onEditFilters,
  onRemove,
  className
}) => {
  return (
    <div className={`visualization-actions${className ? ` ${className}` : ''}`}>
      <button
        className="visualization-actions__button visualization-actions__button--edit"
        onClick={onEditFilters}
        title="Edit filters and recreate visualization"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>

      <button
        className="visualization-actions__button visualization-actions__button--remove"
        onClick={onRemove}
        title="Remove visualization and return to empty state"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  )
}

export default VisualizationActions