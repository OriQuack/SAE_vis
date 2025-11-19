import React, { useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from './store/index'
import Header from './components/Header'
import SankeyDiagram from './components/SankeyDiagram'
import AlluvialDiagram from './components/AlluvialDiagram'
import HistogramPopover from './components/SankeyHistogramPopover'
import TablePanel from './components/QualityTable'
import TagCategoryPanel from './components/TagStagePanel'
import TableSelectionPanel from './components/SelectionPanel'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_CAUSE, TAG_CATEGORY_TABLE_TITLES, TAG_CATEGORY_TABLE_INSTRUCTIONS } from './lib/tag-constants'
import * as api from './api'
import './styles/base.css'
import './styles/App.css'

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
      <h2 className="health-check__title">SAEGE - Connecting...</h2>
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
      <h2 className="health-check__title">SAEGE - Connection Failed</h2>
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
    filterOptions,
    fetchFilterOptions,
    initializeWithDefaultFilters,
    showComparisonView,
    toggleComparisonView,
    activeStageCategory,
    activateCategoryTable,
    moveToNextStep,
    tableData
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
      initializeWithDefaultFilters().catch(error => {
        console.error('[App] Failed to initialize with default filters:', error)
      })
    }
  }, [filterOptions, autoLoad, initializeWithDefaultFilters])

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
      <Header />

      {/* Main content - Tag Category at top, Sankey + Table below */}
      <div className={`sankey-view__content sankey-view__content--${layout}`}>
        {/* Tag Category Panel - Full Width at Top */}
        <div className="sankey-view__tag-category-top">
          <TagCategoryPanel
            selectedCategory={activeStageCategory}
            onCategoryClick={activateCategoryTable}
          />
        </div>

        {/* Bottom Section - Sankey + Selection Panel + Table */}
        <div className="sankey-view__main-content">
          {/* Left Column - Sankey */}
          <div className="sankey-view__sankey-column">
            <div className="sankey-view__sankey-left">
              <SankeyDiagram
                showHistogramOnClick={true}
                flowDirection="left-to-right"
                panel="left"
              />
              {/* Floating Comparison Toggle Button */}
              <button
                className={`comparison-toggle comparison-toggle--floating comparison-toggle--icon-only ${showComparisonView ? 'comparison-toggle--active' : ''}`}
                onClick={toggleComparisonView}
                title={showComparisonView ? 'Hide comparison view' : 'Show comparison view'}
              >
                {showComparisonView ? '◀' : '▶'}
              </button>
            </div>
          </div>

          {/* Middle Column - Selection Panel */}
          {tableData && (
            <div className="sankey-view__selection-panel-column">
              {activeStageCategory === TAG_CATEGORY_QUALITY && (
                <TableSelectionPanel
                  mode="feature"
                  tagLabel={TAG_CATEGORY_TABLE_TITLES[TAG_CATEGORY_QUALITY]}
                  instruction={TAG_CATEGORY_TABLE_INSTRUCTIONS[TAG_CATEGORY_QUALITY]}
                  onDone={moveToNextStep}
                  doneButtonEnabled={true}
                />
              )}
              {activeStageCategory === TAG_CATEGORY_FEATURE_SPLITTING && (
                <TableSelectionPanel
                  mode="pair"
                  tagLabel={TAG_CATEGORY_TABLE_TITLES[TAG_CATEGORY_FEATURE_SPLITTING]}
                  instruction={TAG_CATEGORY_TABLE_INSTRUCTIONS[TAG_CATEGORY_FEATURE_SPLITTING]}
                  onDone={moveToNextStep}
                  doneButtonEnabled={true}
                  pairKeys={tableData?.pairs?.map((p: any) => p.pairKey) || []}
                />
              )}
              {activeStageCategory === TAG_CATEGORY_CAUSE && (
                <TableSelectionPanel
                  mode="cause"
                  tagLabel={TAG_CATEGORY_TABLE_TITLES[TAG_CATEGORY_CAUSE]}
                  instruction={TAG_CATEGORY_TABLE_INSTRUCTIONS[TAG_CATEGORY_CAUSE]}
                  onDone={moveToNextStep}
                  doneButtonEnabled={true}
                />
              )}
            </div>
          )}

          {/* Right Column - Table */}
          <div className="sankey-view__table-column">
            <div className="sankey-view__center-left">
              {/* Table Panel - Full Height */}
              <TablePanel />

              {/* Comparison Overlay - Alluvial + Right Sankey */}
              {showComparisonView && (
                <div className="comparison-overlay">
                  {/* Alluvial Panel */}
                  <div className="comparison-overlay__alluvial">
                    <AlluvialDiagram
                      className="sankey-view__alluvial"
                    />
                  </div>

                  {/* Right Sankey Diagram */}
                  <div className="comparison-overlay__sankey">
                    <SankeyDiagram
                      showHistogramOnClick={true}
                      flowDirection="right-to-left"
                      panel="right"
                    />
                  </div>

                  {/* Close Button */}
                  <button
                    className="comparison-overlay__close"
                    onClick={toggleComparisonView}
                    title="Hide comparison view"
                  >
                    ◀
                  </button>
                </div>
              )}
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