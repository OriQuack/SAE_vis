import React, { useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from './store'
import SankeyDiagram from './components/SankeyDiagram'
import AlluvialDiagram from './components/AlluvialDiagram'
import HistogramPopover from './components/HistogramPopover'
import FlowPanel from './components/FlowPanel'
import ProgressBar from './components/ProgressBar'
import TablePanel from './components/TablePanel'
import HistogramPanel from './components/HistogramPanel'
import VerticalBar from './components/VerticalBar'
import ConsistencyPanel from './components/ConsistencyPanel'
import { usePanelDataLoader } from './lib/utils'
import * as api from './api'
import './styles/base.css'
import './styles/App.css'

// ============================================================================
// CONSTANTS
// ============================================================================
const FIXED_DIAGRAM_HEIGHT = 500 // Fixed height for both Sankey and Alluvial diagrams

// ============================================================================
// TYPES
// ============================================================================

interface AppState {
  isHealthy: boolean
  isChecking: boolean
  error: string | null
}

interface AppProps {
  className?: string
  layout?: 'vertical' | 'horizontal'
  autoLoad?: boolean
}

// ============================================================================
// INLINE UI COMPONENTS
// ============================================================================

const LoadingSpinner: React.FC = () => (
  <div className="health-check">
    <div className="health-check__content">
      <div className="health-check__icon">🔄</div>
      <h2 className="health-check__title">Connecting to Server...</h2>
      <p className="health-check__message">Checking connection to the backend API...</p>
      <div className="health-check__spinner">
        <div className="spinner"></div>
      </div>
    </div>
  </div>
)

const ErrorDisplay: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="health-check">
    <div className="health-check__content">
      <div className="health-check__icon">⚠️</div>
      <h2 className="health-check__title">Connection Failed</h2>
      <p className="health-check__message">{error}</p>
      <div className="health-check__actions">
        <button className="health-check__retry" onClick={onRetry}>
          Retry Connection
        </button>
        <div className="health-check__help">
          <p>Make sure the backend server is running:</p>
          <code>cd backend && python start.py</code>
        </div>
      </div>
    </div>
  </div>
)

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App({ className = '', layout = 'vertical', autoLoad = true }: AppProps) {
  // Health check state
  const [healthState, setHealthState] = useState<AppState>({
    isHealthy: false,
    isChecking: true,
    error: null
  })

  // Store state - now with dual panel support
  const {
    leftPanel,
    rightPanel,
    filterOptions,
    fetchFilterOptions,
    fetchSankeyData,
    fetchMultipleHistogramData,
    initializeWithDefaultFilters,
    showComparisonView,
    toggleComparisonView
  } = useVisualizationStore()

  // Health check function
  const checkHealth = useCallback(async () => {
    setHealthState(prev => ({ ...prev, isChecking: true, error: null }))

    try {
      const isHealthy = await api.healthCheck()
      if (isHealthy) {
        setHealthState({ isHealthy: true, isChecking: false, error: null })
      } else {
        setHealthState({
          isHealthy: false,
          isChecking: false,
          error: 'Backend server is not responding'
        })
      }
    } catch {
      setHealthState({
        isHealthy: false,
        isChecking: false,
        error: 'Failed to connect to backend server'
      })
    }
  }, [])

  // Initialize health check
  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // Initialize filter options after health check passes
  useEffect(() => {
    if (healthState.isHealthy && !filterOptions && autoLoad) {
      fetchFilterOptions()
    }
  }, [healthState.isHealthy, filterOptions, autoLoad, fetchFilterOptions])

  // Initialize with default filters after filter options are loaded
  useEffect(() => {
    if (filterOptions && autoLoad) {
      initializeWithDefaultFilters()
    }
  }, [filterOptions, autoLoad, initializeWithDefaultFilters])

  // Use custom hook to handle panel data loading (consolidates duplicate logic)
  usePanelDataLoader('left', leftPanel, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData)
  usePanelDataLoader('right', rightPanel, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData)

  // Show loading/error states if health check hasn't passed
  if (!healthState.isHealthy) {
    if (healthState.isChecking) {
      return <LoadingSpinner />
    }
    return <ErrorDisplay error={healthState.error || 'Connection failed'} onRetry={checkHealth} />
  }

  // Main application render
  const containerClass = `app sankey-view ${className} sankey-view--${layout}`

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="sankey-view__header">
        <div className="sankey-view__title-section">
          <h1 className="sankey-view__title">
            SAE Feature Visualization - Reliability & Consistency Analysis
          </h1>
        </div>
      </div>

      {/* Main content - 3x3 grid layout */}
      <div className={`sankey-view__content sankey-view__content--${layout}`}>
        <div className="sankey-view__main-content">
          {/* Top Panel Container - Row 1 */}
          <div className="sankey-view__top-panel-container">
            {/* Top Left - Flow Panel */}
            <div className="sankey-view__top-left">
              <FlowPanel />
            </div>

            {/* Top Middle - Consistency Panel */}
            <div className="sankey-view__top-middle">
              <ConsistencyPanel />
            </div>

            {/* Top Right - Comparison Toggle */}
            <div className="sankey-view__top-right">
              <button
                className={`comparison-toggle ${showComparisonView ? 'comparison-toggle--active' : ''}`}
                onClick={toggleComparisonView}
                title={showComparisonView ? 'Hide comparison view' : 'Show comparison view'}
              >
                <span className="comparison-toggle__icon">
                  {showComparisonView ? '◀' : '▶'}
                </span>
                <span className="comparison-toggle__text">
                  {showComparisonView ? 'Hide' : 'Show'} Comparison
                </span>
              </button>
            </div>
          </div>

          {/* Center Panel Container - Row 2 */}
          <div className="sankey-view__center-panel-container">
            {/* Center Left - Left Sankey Only */}
            <div className={`sankey-view__center-left ${showComparisonView ? 'sankey-view__center-left--split' : 'sankey-view__center-left--full'}`}>
              {/* Left Sankey Diagram */}
              <div className="sankey-view__sankey-left">
                <SankeyDiagram
                  showHistogramOnClick={true}
                  flowDirection="left-to-right"
                  panel="left"
                />
              </div>
            </div>

            {/* Comparison Container - Alluvial + Right Sankey (conditionally rendered) */}
            {showComparisonView && (
              <div className="sankey-view__comparison-container">
                {/* Alluvial Panel - Center flow comparison */}
                <div className="sankey-view__alluvial-panel">
                  <AlluvialDiagram
                    className="sankey-view__alluvial"
                  />
                </div>

                {/* Right Sankey Diagram */}
                <div className="sankey-view__sankey-right">
                  <SankeyDiagram
                    showHistogramOnClick={true}
                    flowDirection="right-to-left"
                    panel="right"
                  />
                </div>
              </div>
            )}

            {/* Center Middle - Vertical Bar */}
            <div className="sankey-view__center-middle">
              <VerticalBar />
            </div>

            {/* Center Right - Table Panel */}
            <div className="sankey-view__center-right">
              <TablePanel />
            </div>
          </div>
        </div>
      </div>

      {/* Histogram popover for node-specific threshold setting */}
      <HistogramPopover />
    </div>
  )
}

export default App