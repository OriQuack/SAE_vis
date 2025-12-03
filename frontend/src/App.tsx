import React, { useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from './store/index'
import Header from './components/AppHeader'
import SankeyDiagram from './components/SankeyDiagram'
import AlluvialDiagram from './components/AlluvialDiagram'
import HistogramPopover from './components/SankeyHistogramPopover'
import FeatureSplitView from './components/FeatureSplitView'
import QualityView from './components/QualityView'
import SimilarityTaggingPopover from './components/_TagAutomaticPopover.deprecated'
import TagCategoryPanel from './components/TagStagePanel'
import SankeyToSelectionFlowOverlay from './components/SankeyToSelectionFlowOverlay'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_QUALITY } from './lib/constants'
import type { SelectionCategory } from './types'
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

const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Checking connection to the backend API...' }) => (
  <div className="health-check">
    <div className="health-check__content">
      <h2 className="health-check__title">InSAEght</h2>
      <p className="health-check__message">{message}</p>
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
      <h2 className="health-check__title">InSAEght - Connection Failed</h2>
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

  // Loading stage tracking for user feedback
  const [loadingStage, setLoadingStage] = useState<string>('health')

  // Refs for Sankey-to-Selection flow overlay
  const [sankeySegmentRefs, setSankeySegmentRefs] = useState<Map<string, SVGRectElement>>(new Map())
  const [selectionCategoryRefs, setSelectionCategoryRefs] = useState<Map<SelectionCategory, HTMLDivElement>>(new Map())

  // Store state - now with dual panel support
  const {
    filterOptions,
    fetchFilterOptions,
    initializeWithDefaultFilters,
    showComparisonView,
    toggleComparisonView,
    activeStageCategory,
    activateCategoryTable,
    tableData
  } = useVisualizationStore()

  // Health check function
  const checkHealth = useCallback(async () => {
    setLoadingStage('health')
    setHealthState(prev => ({ ...prev, isChecking: true, error: null }))

    try {
      const isHealthy = await api.healthCheck()
      if (isHealthy) {
        setHealthState({ isHealthy: true, isChecking: false, error: null })
        setLoadingStage('filters')
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
      setLoadingStage('filters')
      fetchFilterOptions().then(() => {
        setLoadingStage('initialization')
      })
    }
  }, [healthState.isHealthy, filterOptions, autoLoad, fetchFilterOptions])

  // Initialize with default filters after filter options are loaded
  useEffect(() => {
    if (filterOptions && autoLoad) {
      setLoadingStage('initialization')
      initializeWithDefaultFilters()
        .then(() => {
          setLoadingStage('ready')
        })
        .catch(error => {
          console.error('[App] Failed to initialize with default filters:', error)
        })
    }
  }, [filterOptions, autoLoad, initializeWithDefaultFilters])

  // Show loading/error states if health check hasn't passed or still initializing
  if (!healthState.isHealthy) {
    if (healthState.isChecking) {
      return <LoadingSpinner message="Connecting to server..." />
    }
    return <ErrorDisplay error={healthState.error || 'Connection failed'} onRetry={checkHealth} />
  }

  // Show loading message during initialization stages
  // Use || to wait until BOTH: loadingStage is 'ready' AND tableData is loaded
  if (loadingStage !== 'ready' || tableData === null) {
    const stageMessages: Record<string, string> = {
      'health': 'Connecting to server...',
      'filters': 'Loading filter options...',
      'initialization': 'Loading features and building visualization...'
    }
    return <LoadingSpinner message={stageMessages[loadingStage] || 'Loading...'} />
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
                onSegmentRefsReady={setSankeySegmentRefs}
              />
            </div>
          </div>

          {/* Right Column - Table */}
          <div className="sankey-view__table-column">
            <div className="sankey-view__center-left">
              {/* Conditional Rendering: Feature Split View, Quality View, or Cause View */}
              {activeStageCategory === TAG_CATEGORY_FEATURE_SPLITTING ? (
                <>
                  <FeatureSplitView onCategoryRefsReady={setSelectionCategoryRefs} />
                  <SimilarityTaggingPopover />
                </>
              ) : activeStageCategory === TAG_CATEGORY_QUALITY ? (
                <>
                  <QualityView onCategoryRefsReady={setSelectionCategoryRefs} />
                  <SimilarityTaggingPopover />
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: '14px' }}>
                  Stage 3: Root Cause Analysis (coming soon)
                </div>
              )}

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

          {/* Flow Overlay - Visualizes flows from Sankey segments to SelectionBar */}
          <SankeyToSelectionFlowOverlay
            segmentRefs={sankeySegmentRefs}
            categoryRefs={selectionCategoryRefs}
          />
        </div>
      </div>

      {/* Histogram popover for node-specific threshold setting */}
      <HistogramPopover />
    </div>
  )
}

export default App