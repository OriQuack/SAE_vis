import React, { useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from './store'
import FilterPanel from './components/FilterPanel'
import SankeyDiagram from './components/SankeyDiagram'
import AlluvialDiagram from './components/AlluvialDiagram'
import HistogramPopover from './components/HistogramPopover'
import * as api from './api'
import './styles/base.css'
import './styles/App.css'

// ============================================================================
// CONSTANTS
// ============================================================================
const FIXED_DIAGRAM_HEIGHT = 600 // Fixed height for both Sankey and Alluvial diagrams

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

const EmptyState: React.FC<{ onAddVisualization: () => void }> = ({ onAddVisualization }) => (
  <div className="empty-state-card">
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
      <p className="empty-state-card__text">Add Visualization</p>
    </div>
  </div>
)

const VisualizationActions: React.FC<{
  onEditFilters: () => void
  onRemove: () => void
  className?: string
}> = ({ onEditFilters, onRemove, className }) => (
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
    setViewState,
    showVisualization,
    editFilters,
    removeVisualization,
    resetFilters
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

  // Watch for filter changes and fetch data when in visualization mode - left panel
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(leftPanel.filters).some(
        filterArray => filterArray && filterArray.length > 0
      )

      if (hasActiveFilters && leftPanel.viewState === 'visualization') {
        try {
          await fetchMultipleHistogramData(['feature_splitting', 'semdist_mean', 'score_fuzz'], undefined, 'left')
          fetchSankeyData('left')
        } catch (error) {
          console.error('Failed to load left visualization data:', error)
        }
      }
    }

    if (healthState.isHealthy) {
      loadData()
    }
  }, [leftPanel.filters, leftPanel.viewState, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData])

  // Watch for filter changes and fetch data when in visualization mode - right panel
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(rightPanel.filters).some(
        filterArray => filterArray && filterArray.length > 0
      )

      if (hasActiveFilters && rightPanel.viewState === 'visualization') {
        try {
          await fetchMultipleHistogramData(['feature_splitting', 'semdist_mean', 'score_fuzz'], undefined, 'right')
          fetchSankeyData('right')
        } catch (error) {
          console.error('Failed to load right visualization data:', error)
        }
      }
    }

    if (healthState.isHealthy) {
      loadData()
    }
  }, [rightPanel.filters, rightPanel.viewState, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData])

  // Watch for threshold changes and re-fetch Sankey data - left panel
  useEffect(() => {
    const hasActiveFilters = Object.values(leftPanel.filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (hasActiveFilters && leftPanel.viewState === 'visualization' && healthState.isHealthy) {
      try {
        fetchSankeyData('left')
      } catch (error) {
        console.error('Failed to update left Sankey data:', error)
      }
    }
  }, [leftPanel.thresholdTree, leftPanel.filters, leftPanel.viewState, healthState.isHealthy, fetchSankeyData])

  // Watch for threshold changes and re-fetch Sankey data - right panel
  useEffect(() => {
    const hasActiveFilters = Object.values(rightPanel.filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (hasActiveFilters && rightPanel.viewState === 'visualization' && healthState.isHealthy) {
      try {
        fetchSankeyData('right')
      } catch (error) {
        console.error('Failed to update right Sankey data:', error)
      }
    }
  }, [rightPanel.thresholdTree, rightPanel.filters, rightPanel.viewState, healthState.isHealthy, fetchSankeyData])

  // Event handlers - left panel
  const handleAddVisualizationLeft = useCallback(() => {
    setViewState('filtering', 'left')
  }, [setViewState])

  const handleCancelFilteringLeft = useCallback(() => {
    setViewState('empty', 'left')
  }, [setViewState])

  const handleCreateVisualizationLeft = useCallback(() => {
    showVisualization('left')
  }, [showVisualization])

  const handleEditFiltersLeft = useCallback(() => {
    editFilters('left')
  }, [editFilters])

  const handleRemoveVisualizationLeft = useCallback(() => {
    removeVisualization('left')
    resetFilters('left')
  }, [removeVisualization, resetFilters])

  // Event handlers - right panel
  const handleAddVisualizationRight = useCallback(() => {
    setViewState('filtering', 'right')
  }, [setViewState])

  const handleCancelFilteringRight = useCallback(() => {
    setViewState('empty', 'right')
  }, [setViewState])

  const handleCreateVisualizationRight = useCallback(() => {
    showVisualization('right')
  }, [showVisualization])

  const handleEditFiltersRight = useCallback(() => {
    editFilters('right')
  }, [editFilters])

  const handleRemoveVisualizationRight = useCallback(() => {
    removeVisualization('right')
    resetFilters('right')
  }, [removeVisualization, resetFilters])

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

      {/* Main content - four-panel rendering */}
      <div className={`sankey-view__content sankey-view__content--${layout}`}>
        <div className="sankey-view__main-content">
          {/* Far Left Panel - Placeholder for now */}
          <div className="sankey-view__far-left-panel">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#9ca3af',
              fontSize: '14px'
            }}>
              Panel 1
            </div>
          </div>

          {/* Left Panel */}
          <div className="sankey-view__left-panel">
            {leftPanel.viewState === 'empty' && (
              <EmptyState onAddVisualization={handleAddVisualizationLeft} />
            )}

            {leftPanel.viewState === 'filtering' && (
              <FilterPanel
                onCreateVisualization={handleCreateVisualizationLeft}
                onCancel={handleCancelFilteringLeft}
                panel="left"
              />
            )}

            {leftPanel.viewState === 'visualization' && (
              <div className="sankey-view__diagram-container">
                <VisualizationActions
                  onEditFilters={handleEditFiltersLeft}
                  onRemove={handleRemoveVisualizationLeft}
                  className="sankey-view__floating-actions"
                />
                <SankeyDiagram
                  height={FIXED_DIAGRAM_HEIGHT}
                  showHistogramOnClick={true}
                  flowDirection="left-to-right"
                  panel="left"
                />
              </div>
            )}
          </div>

          {/* Center Panel - Alluvial Diagram */}
          <div className="sankey-view__center-panel">
            <AlluvialDiagram
              height={FIXED_DIAGRAM_HEIGHT}
              className="sankey-view__alluvial"
            />
          </div>

          {/* Right Panel */}
          <div className="sankey-view__right-panel">
            {rightPanel.viewState === 'empty' && (
              <EmptyState onAddVisualization={handleAddVisualizationRight} />
            )}

            {rightPanel.viewState === 'filtering' && (
              <FilterPanel
                onCreateVisualization={handleCreateVisualizationRight}
                onCancel={handleCancelFilteringRight}
                panel="right"
              />
            )}

            {rightPanel.viewState === 'visualization' && (
              <div className="sankey-view__diagram-container">
                <VisualizationActions
                  onEditFilters={handleEditFiltersRight}
                  onRemove={handleRemoveVisualizationRight}
                  className="sankey-view__floating-actions"
                />
                <SankeyDiagram
                  height={FIXED_DIAGRAM_HEIGHT}
                  showHistogramOnClick={true}
                  flowDirection="right-to-left"
                  panel="right"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Histogram popover for node-specific threshold setting */}
      <HistogramPopover />
    </div>
  )
}

export default App