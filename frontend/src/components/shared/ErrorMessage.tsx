import React from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface ErrorMessageProps {
  message: string
  onRetry?: () => void
  className?: string
  icon?: string
  showIcon?: boolean
}

// ============================================================================
// SHARED ERROR MESSAGE COMPONENT
// ============================================================================

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  className = '',
  icon = '⚠️',
  showIcon = true
}) => (
  <div className={`error-message ${className}`}>
    <div className="error-message__content">
      {showIcon && <span className="error-message__icon">{icon}</span>}
      <span className="error-message__text">{message}</span>
    </div>
    {onRetry && (
      <button
        className="error-message__retry"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    )}
  </div>
)

export default ErrorMessage