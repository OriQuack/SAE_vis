/**
 * Error display component with different severity levels
 */

import React, { memo, useCallback } from 'react'

export interface ErrorDetails {
  message: string
  code?: string
  severity?: 'info' | 'warning' | 'error' | 'critical'
  details?: Record<string, unknown>
  retryable?: boolean
}

interface ErrorDisplayProps {
  error: ErrorDetails | string | null
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}

export const ErrorDisplay = memo<ErrorDisplayProps>(({
  error,
  onRetry,
  onDismiss,
  className = ''
}) => {
  if (!error) return null

  const errorDetails: ErrorDetails = typeof error === 'string'
    ? { message: error, severity: 'error' }
    : error

  const { message, code, severity = 'error', details, retryable = true } = errorDetails

  const severityStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    critical: 'bg-red-100 border-red-400 text-red-900'
  }

  const severityIcons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    critical: '🚨'
  }

  const handleRetry = useCallback(() => {
    onRetry?.()
  }, [onRetry])

  const handleDismiss = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  return (
    <div
      className={`error-display border rounded-lg p-4 ${severityStyles[severity]} ${className}`}
      role="alert"
    >
      <div className="flex items-start">
        <span className="text-2xl mr-3" aria-hidden="true">
          {severityIcons[severity]}
        </span>

        <div className="flex-1">
          <h3 className="font-semibold">
            {code ? `Error ${code}: ` : ''}{message}
          </h3>

          {details && process.env.NODE_ENV === 'development' && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm">
                Technical details
              </summary>
              <pre className="mt-2 text-xs bg-white bg-opacity-50 p-2 rounded overflow-auto">
                {JSON.stringify(details, null, 2)}
              </pre>
            </details>
          )}

          <div className="mt-3 flex space-x-2">
            {retryable && onRetry && (
              <button
                onClick={handleRetry}
                className="px-3 py-1 text-sm bg-white rounded border border-current hover:bg-opacity-90"
              >
                Try Again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="px-3 py-1 text-sm bg-transparent rounded border border-current hover:bg-white hover:bg-opacity-20"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

ErrorDisplay.displayName = 'ErrorDisplay'

/**
 * Inline error message component
 */
interface InlineErrorProps {
  error: string | null
  className?: string
}

export const InlineError = memo<InlineErrorProps>(({
  error,
  className = ''
}) => {
  if (!error) return null

  return (
    <span className={`inline-error text-red-600 text-sm ${className}`}>
      {error}
    </span>
  )
})

InlineError.displayName = 'InlineError'