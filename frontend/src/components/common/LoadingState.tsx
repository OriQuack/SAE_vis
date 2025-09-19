/**
 * Unified loading state component with different variants
 */

import React, { memo } from 'react'

interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton' | 'dots' | 'progress'
  size?: 'small' | 'medium' | 'large'
  message?: string
  progress?: number // For progress variant
  className?: string
}

export const LoadingState = memo<LoadingStateProps>(({
  variant = 'spinner',
  size = 'medium',
  message,
  progress,
  className = ''
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  }

  const renderContent = () => {
    switch (variant) {
      case 'spinner':
        return (
          <div className={`loading-spinner ${sizeClasses[size]}`}>
            <svg
              className="animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )

      case 'skeleton':
        return (
          <div className="loading-skeleton animate-pulse">
            <div className="space-y-3">
              <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              <div className="h-4 bg-gray-300 rounded"></div>
              <div className="h-4 bg-gray-300 rounded w-5/6"></div>
            </div>
          </div>
        )

      case 'dots':
        return (
          <div className="loading-dots flex space-x-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`${sizeClasses[size]} bg-current rounded-full animate-bounce`}
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )

      case 'progress':
        return (
          <div className="loading-progress w-full">
            <div className="bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress || 0}%` }}
              />
            </div>
            {progress !== undefined && (
              <div className="text-sm text-gray-600 mt-1">
                {Math.round(progress)}%
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className={`loading-state flex flex-col items-center justify-center p-4 ${className}`}>
      {renderContent()}
      {message && (
        <p className="loading-message text-sm text-gray-600 mt-2">
          {message}
        </p>
      )}
    </div>
  )
})

LoadingState.displayName = 'LoadingState'

/**
 * Loading overlay component
 */
interface LoadingOverlayProps {
  visible: boolean
  message?: string
  fullScreen?: boolean
}

export const LoadingOverlay = memo<LoadingOverlayProps>(({
  visible,
  message,
  fullScreen = false
}) => {
  if (!visible) return null

  return (
    <div
      className={`loading-overlay ${
        fullScreen ? 'fixed inset-0' : 'absolute inset-0'
      } bg-white bg-opacity-75 flex items-center justify-center z-50`}
    >
      <LoadingState variant="spinner" size="large" message={message} />
    </div>
  )
})

LoadingOverlay.displayName = 'LoadingOverlay'