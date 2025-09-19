/**
 * Error boundary component for graceful error handling
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetKeys?: Array<string | number>
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys } = this.props
    const { hasError } = this.state

    if (hasError && prevProps.resetKeys !== resetKeys) {
      // Reset error boundary if resetKeys changed
      if (resetKeys?.some((key, idx) => key !== prevProps.resetKeys?.[idx])) {
        this.reset()
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    const { hasError, error, errorInfo } = this.state
    const { children, fallback } = this.props

    if (hasError && error) {
      if (fallback) {
        return fallback(error, errorInfo!)
      }

      return (
        <div className="error-boundary">
          <div className="error-container">
            <h2 className="error-title">Something went wrong</h2>
            <div className="error-details">
              <p className="error-message">{error.message}</p>
              {process.env.NODE_ENV === 'development' && errorInfo && (
                <details className="error-stack">
                  <summary>Stack trace</summary>
                  <pre>{errorInfo.componentStack}</pre>
                </details>
              )}
            </div>
            <button onClick={this.reset} className="error-reset-button">
              Try again
            </button>
          </div>
        </div>
      )
    }

    return children
  }
}

/**
 * Hook to wrap async operations with error boundary reset
 */
export function useErrorHandler() {
  const [errorKey, setErrorKey] = React.useState(0)

  const resetError = React.useCallback(() => {
    setErrorKey(prev => prev + 1)
  }, [])

  const handleError = React.useCallback((error: Error) => {
    console.error('Handled error:', error)
    // Could also send to error reporting service
  }, [])

  return { errorKey, resetError, handleError }
}