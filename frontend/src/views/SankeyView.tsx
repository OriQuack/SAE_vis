import React, { useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../stores/store'
import { EmptyStateCard } from '../components/ui/EmptyStateCard'
import CompactFilterConfiguration from '../components/ui/CompactFilterConfiguration'
import VisualizationActions from '../components/ui/VisualizationActions'
import SankeyDiagram from '../components/visualization/SankeyDiagram'
import HistogramPopover from '../components/visualization/HistogramPopover/index'

// ============================================================================
// TYPES
// ============================================================================

interface SankeyViewProps {
  className?: string
  layout?: 'vertical' | 'horizontal'
  autoLoad?: boolean
}




// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren<Record<string, never>>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<Record<string, never>>) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SankeyView Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__message">
              An unexpected error occurred while rendering the visualization.
            </p>
            {this.state.error && (
              <details className="error-boundary__details">
                <summary>Error Details</summary>
                <pre className="error-boundary__stack">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              className="error-boundary__retry"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================================
// MAIN SANKEY VIEW COMPONENT
// ============================================================================

export const SankeyView: React.FC<SankeyViewProps> = ({
  className = '',
  layout = 'vertical',
  autoLoad = true
}) => {
  const {
    filters,
    thresholds,
    hierarchicalThresholds,
    viewState,
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

  // Initialize filter options on mount
  useEffect(() => {
    if (!filterOptions && autoLoad) {
      fetchFilterOptions()
    }
  }, [filterOptions, autoLoad, fetchFilterOptions])

  // Watch for filter changes and fetch data when in visualization mode
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(filters).some(
        filterArray => filterArray && filterArray.length > 0
      )

      if (hasActiveFilters && viewState === 'visualization') {
        // Wait for histogram data to complete and set thresholds
        await fetchMultipleHistogramData(['feature_splitting', 'semdist_mean', 'score_fuzz'])
        // Then fetch Sankey with updated thresholds
        fetchSankeyData()
      }
    }

    loadData()
  }, [filters, viewState, fetchMultipleHistogramData, fetchSankeyData])

  // Watch for threshold changes and re-fetch Sankey data
  useEffect(() => {
    console.log('🔍 [SankeyView] Threshold useEffect triggered:', {
      thresholds,
      hierarchicalThresholds,
      viewState,
      hasActiveFilters: Object.values(filters).some(filterArray => filterArray && filterArray.length > 0)
    })

    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (hasActiveFilters && viewState === 'visualization') {
      console.log('✅ [SankeyView] Conditions met, calling fetchSankeyData')
      // Only fetch Sankey data when thresholds change (histogram data stays the same)
      fetchSankeyData()
    } else {
      console.log('❌ [SankeyView] Conditions not met:', { hasActiveFilters, viewState })
    }
  }, [thresholds, hierarchicalThresholds, filters, viewState, fetchSankeyData])

  // Handlers for view state
  const handleAddVisualization = useCallback(() => {
    setViewState('filtering')
  }, [setViewState])

  const handleCancelFiltering = useCallback(() => {
    setViewState('empty')
  }, [setViewState])

  const handleCreateVisualization = useCallback(() => {
    showVisualization()
  }, [showVisualization])

  const handleEditFilters = useCallback(() => {
    editFilters()
  }, [editFilters])

  const handleRemoveVisualization = useCallback(() => {
    removeVisualization()
    resetFilters()
  }, [removeVisualization, resetFilters])



  const containerClass = `sankey-view ${className} sankey-view--${layout}`

  return (
    <ErrorBoundary>
      <div className={containerClass}>
        {/* Header */}
        <div className="sankey-view__header">
          <div className="sankey-view__title-section">
            <h1 className="sankey-view__title">
              SAE Feature Visualization - Reliability & Consistency Analysis
            </h1>
          </div>
        </div>

        {/* Main content - conditional rendering based on view state */}
        <div className={`sankey-view__content sankey-view__content--${layout}`}>
          {viewState === 'empty' && (
            <div className="sankey-view__main-content">
              <div className="sankey-view__left-half">
                <EmptyStateCard onAddVisualization={handleAddVisualization} />
              </div>
              <div className="sankey-view__right-half">
                {/* Empty space for future content */}
              </div>
            </div>
          )}

          {viewState === 'filtering' && (
            <div className="sankey-view__main-content">
              <div className="sankey-view__left-half">
                <CompactFilterConfiguration
                  onCreateVisualization={handleCreateVisualization}
                  onCancel={handleCancelFiltering}
                />
              </div>
              <div className="sankey-view__right-half">
                {/* Empty space for future content */}
              </div>
            </div>
          )}

          {viewState === 'visualization' && (
            <div className="sankey-view__main-content">
              <div className="sankey-view__left-half">
                <div className="sankey-view__diagram-container">
                  <VisualizationActions
                    onEditFilters={handleEditFilters}
                    onRemove={handleRemoveVisualization}
                    className="sankey-view__floating-actions"
                  />
                  <SankeyDiagram
                    width={(window.innerWidth / 2) - 40}
                    height={window.innerHeight - 170}
                    showHistogramOnClick={true}
                  />
                </div>
              </div>
              <div className="sankey-view__right-half">
                {/* Empty space for future content */}
              </div>
            </div>
          )}
        </div>

        {/* Histogram popover for node-specific threshold setting */}
        <HistogramPopover />
      </div>
    </ErrorBoundary>
  )
}

export default SankeyView