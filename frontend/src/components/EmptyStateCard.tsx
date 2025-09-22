import React from 'react'

interface EmptyStateCardProps {
  onAddVisualization: () => void
  className?: string
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  onAddVisualization,
  className = ''
}) => {
  return (
    <div className={`empty-state-card ${className}`}>
      <div className="empty-state-card__content">
        <button
          className="empty-state-card__add-button"
          onClick={onAddVisualization}
          aria-label="Add visualization"
          title="Click to add a new visualization"
        >
          <svg
            className="empty-state-card__plus-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="48"
            height="48"
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5 11h-4v4a1 1 0 01-2 0v-4H7a1 1 0 010-2h4V7a1 1 0 012 0v4h4a1 1 0 010 2z"/>
          </svg>
        </button>
        <p className="empty-state-card__text">
          Add Visualization
        </p>
      </div>
    </div>
  )
}

export default EmptyStateCard