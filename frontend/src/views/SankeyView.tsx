import React, { useEffect, useCallback, useState } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import FilterPanel from '../components/FilterPanel'
import SankeyDiagram from '../components/SankeyDiagram'
import HistogramPopover from '../components/HistogramPopover'

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
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
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
    nodeThresholds,
    filterOptions,
    fetchFilterOptions,
    fetchSankeyData,
    fetchMultipleHistogramData,
    resetAll,
    resetFilters,
    resetNodeThresholds
  } = useVisualizationStore()

  // Local state for UI
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize the component
  useEffect(() => {
    if (!isInitialized && autoLoad) {
      setIsInitialized(true)

      // Load filter options if not already loaded
      if (!filterOptions) {
        fetchFilterOptions()
      }
    }
  }, [isInitialized, autoLoad, filterOptions])

  // Watch for filter changes and fetch data
  useEffect(() => {
    const loadData = async () => {
      const hasActiveFilters = Object.values(filters).some(
        filterArray => filterArray && filterArray.length > 0
      )

      if (hasActiveFilters) {
        // Wait for histogram data to complete and set thresholds
        await fetchMultipleHistogramData(['feature_splitting', 'semdist_mean', 'score_fuzz'])
        // Then fetch Sankey with updated thresholds
        fetchSankeyData()
      }
    }

    loadData()
  }, [filters])

  // Note: Node threshold changes now trigger Sankey refresh directly from setNodeThreshold
  // to avoid race conditions, so no useEffect needed here



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

        {/* Main content */}
        <div className={`sankey-view__content sankey-view__content--${layout}`}>
          {layout === 'vertical' ? (
            <>
              {/* Filter panel at top - full width */}
              <div className="sankey-view__section sankey-view__section--filters">
                <FilterPanel
                  title="Data Filters"
                  showResetButton={false}
                />
              </div>

              {/* Two-column layout below filters */}
              <div className="sankey-view__main-content">
                <div className="sankey-view__left-half">
                  <SankeyDiagram
                    width={(window.innerWidth / 2) - 40}
                    height={window.innerHeight - 170}
                    showHistogramOnClick={true}
                  />
                </div>
                <div className="sankey-view__right-half">
                  {/* Empty space for future content */}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Horizontal layout: side panel and main visualization */}
              <div className="sankey-view__sidebar">
                <div className="sankey-view__sidebar-section">
                  <FilterPanel
                    title="Filters"
                    showResetButton={false}
                  />
                </div>
              </div>

              <div className="sankey-view__main">
                <SankeyDiagram
                  width={(window.innerWidth - 450)}
                  height={window.innerHeight - 170}
                  showHistogramOnClick={true}
                />
              </div>
            </>
          )}
        </div>


        {/* Histogram popover for node-specific threshold setting */}
        <HistogramPopover />
      </div>
    </ErrorBoundary>
  )
}

export default SankeyView