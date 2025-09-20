import React from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface LoadingSpinnerProps {
  message?: string
  size?: 'small' | 'medium' | 'large'
  className?: string
}

// ============================================================================
// LOADING SPINNER COMPONENT
// ============================================================================

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 'medium',
  className = ''
}) => (
  <div className={`loading-spinner ${className}`}>
    <div className={`loading-spinner__circle loading-spinner__circle--${size}`} />
    {message && (
      <span className="loading-spinner__text">{message}</span>
    )}
  </div>
)

export default LoadingSpinner