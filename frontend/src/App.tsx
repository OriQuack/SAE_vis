import React, { useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from './store'
import FilterPanel from './components/FilterPanel'
import SankeyDiagram from './components/SankeyDiagram'
import AlluvialDiagram from './components/AlluvialDiagram'
import HistogramPopover from './components/HistogramPopover'
import FlowPanel from './components/FlowPanel'
import HistogramPanel from './components/HistogramPanel'
import ThresholdGroupPanel from './components/ThresholdGroupPanel'
import ProgressBar from './components/ProgressBar'
import LLMComparisonSelection from './components/LLMComparisonSelection'
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

const EmptyState: React.FC<{ onAddVisualization: () => void }> = ({ onAddVisualization }) => (
  <div className="empty-state-card">
    <div className="empty-state-card__content">
      <p className="empty-state-card__text">
        Select LLM Explainer on the left to display Sankey diagrams
      </p>
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



  // Use custom hook to handle panel data loading (consolidates duplicate logic)
  usePanelDataLoader('left', leftPanel, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData)
  usePanelDataLoader('right', rightPanel, healthState.isHealthy, fetchMultipleHistogramData, fetchSankeyData)

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
          {/* Control Column - Contains input controls and histograms */}
          <div className="sankey-view__control-column">
            {/* Flow Panel */}
            <div className="sankey-view__flow-panel">
              <FlowPanel />
            </div>

            {/* LLM Comparison Panel */}
            <div className="sankey-view__llm-comparison-panel">
              <LLMComparisonSelection />
            </div>

            {/* Histogram Container */}
            <div className="sankey-view__histogram-container">
              <div className="sankey-view__histogram-panel">
                <HistogramPanel />
              </div>
              <div className="sankey-view__threshold-group-panel">
                <ThresholdGroupPanel />
              </div>
            </div>
          </div>

          {/* Visualization Column - Contains visualizations */}
          <div className="sankey-view__visualization-column">
            {/* Linear Set Panel - Progress bar showing feature overlap */}
            <div className="sankey-view__linear-set-panel">
              <ProgressBar />
            </div>

            {/* Sankey Container - Dual Sankey diagrams with alluvial flow */}
            <div className="sankey-view__sankey-container">
              {/* Left Sankey Diagram */}
              <div className="sankey-view__sankey-left">
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

              {/* Alluvial Panel - Center flow comparison */}
              <div className="sankey-view__alluvial-panel">
                <AlluvialDiagram
                  height={FIXED_DIAGRAM_HEIGHT}
                  className="sankey-view__alluvial"
                />
              </div>

              {/* Right Sankey Diagram */}
              <div className="sankey-view__sankey-right">
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

            {/* Analysis Container - Additional analysis panels */}
            <div className="sankey-view__analysis-container">
              {/* UMAP Panel */}
              <div className="sankey-view__umap-panel">
                <div className="sankey-view__placeholder-text">
                  UMAP Panel
                </div>
              </div>

              {/* Analysis Right Panel */}
              <div className="sankey-view__analysis-right-panel">
                <div className="sankey-view__placeholder-text">
                  Analysis Panel
                </div>
              </div>
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