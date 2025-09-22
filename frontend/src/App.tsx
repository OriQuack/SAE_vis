import React, { useEffect, useState } from 'react'
import SankeyView from './views/SankeyView'
import { api } from './services/api'
import './styles/globals.css'

interface AppState {
  isHealthy: boolean
  isChecking: boolean
  error: string | null
}

const HealthCheck: React.FC<{ onHealthy: () => void }> = ({ onHealthy }) => {
  const [state, setState] = useState<AppState>({
    isHealthy: false,
    isChecking: true,
    error: null
  })

  const checkHealth = async () => {
    setState(prev => ({ ...prev, isChecking: true, error: null }))

    try {
      const isHealthy = await api.healthCheck()
      if (isHealthy) {
        setState({ isHealthy: true, isChecking: false, error: null })
        onHealthy()
      } else {
        setState({
          isHealthy: false,
          isChecking: false,
          error: 'Backend server is not responding'
        })
      }
    } catch (error) {
      setState({
        isHealthy: false,
        isChecking: false,
        error: 'Failed to connect to backend server'
      })
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  if (state.isHealthy) {
    return null
  }

  return (
    <div className="health-check">
      <div className="health-check__content">
        <div className="health-check__icon">
          {state.isChecking ? '🔄' : '⚠️'}
        </div>

        <h2 className="health-check__title">
          {state.isChecking ? 'Connecting to Server...' : 'Connection Failed'}
        </h2>

        <p className="health-check__message">
          {state.isChecking
            ? 'Checking connection to the backend API...'
            : state.error || 'Unable to connect to the backend server'
          }
        </p>

        {!state.isChecking && (
          <div className="health-check__actions">
            <button
              className="health-check__retry"
              onClick={checkHealth}
            >
              Retry Connection
            </button>

            <div className="health-check__help">
              <p>Make sure the backend server is running:</p>
              <code>cd backend && python start.py</code>
            </div>
          </div>
        )}

        {state.isChecking && (
          <div className="health-check__spinner">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error">
          <div className="app-error__content">
            <div className="app-error__icon">💥</div>
            <h1 className="app-error__title">Application Error</h1>
            <p className="app-error__message">
              Something went wrong and the application crashed.
            </p>

            {this.state.error && (
              <div className="app-error__details">
                <h3>Error Details:</h3>
                <pre className="app-error__stack">
                  {this.state.error.message}
                  {this.state.error.stack && '\n\n' + this.state.error.stack}
                </pre>
              </div>
            )}

            <div className="app-error__actions">
              <button
                className="app-error__retry"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>

              <button
                className="app-error__reset"
                onClick={() => {
                  localStorage.clear()
                  window.location.reload()
                }}
              >
                Reset & Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  const [isReady, setIsReady] = useState(false)

  const handleHealthy = () => {
    setIsReady(true)
  }

  return (
    <AppErrorBoundary>
      <div className="app">
        {!isReady ? (
          <HealthCheck onHealthy={handleHealthy} />
        ) : (
          <main className="app__main">
            <SankeyView
              layout="vertical"
              autoLoad={true}
            />
          </main>
        )}

      </div>
    </AppErrorBoundary>
  )
}

export default App
