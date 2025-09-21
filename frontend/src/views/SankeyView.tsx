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
        await fetchMultipleHistogramData(['semdist_mean', 'score_fuzz'])
        // Then fetch Sankey with updated thresholds
        fetchSankeyData()
      }
    }

    loadData()
  }, [filters])

  // Note: Node threshold changes now trigger Sankey refresh directly from setNodeThreshold
  // to avoid race conditions, so no useEffect needed here

  // Check if filters are active
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )


  const containerClass = `sankey-view ${className} sankey-view--${layout}`

  return (
    <ErrorBoundary>
      <div className={containerClass}>
        {/* Header */}
        <div className="sankey-view__header">
          <div className="sankey-view__title-section">
            <h1 className="sankey-view__title">
              SAE Feature Visualization
            </h1>
            <p className="sankey-view__subtitle">
              Analyze feature explanation reliability and consistency
            </p>
          </div>

        </div>

        {/* Main content */}
        <div className={`sankey-view__content sankey-view__content--${layout}`}>
          {layout === 'vertical' ? (
            <>
              {/* Vertical layout: stacked components */}
              <div className="sankey-view__section sankey-view__section--filters">
                <FilterPanel
                  title="Data Filters"
                  showResetButton={false}
                />
              </div>

              <div className="sankey-view__section sankey-view__section--sankey">
                <SankeyDiagram
                  width={1000}
                  height={600}
                  showHistogramOnClick={true}
                />
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
                  width={800}
                  height={700}
                  showHistogramOnClick={true}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sankey-view__footer">
          <div className="sankey-view__footer-content">
            <div className="sankey-view__info">
              <p className="sankey-view__description">
                This visualization shows how SAE features flow through different
                categorization stages based on your selected filters. Click on any node
                or link in the diagram to view its histogram and set per-node thresholds.
              </p>
            </div>

            {!hasActiveFilters && (
              <div className="sankey-view__getting-started">
                <h3>Getting Started</h3>
                <ol>
                  <li>Select one or more filters from the available options</li>
                  <li>Click on nodes or links in the Sankey diagram</li>
                  <li>Adjust per-node thresholds using the histogram popovers</li>
                  <li>Explore how threshold changes affect the feature flow</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Histogram popover for node-specific threshold setting */}
        <HistogramPopover />
      </div>
    </ErrorBoundary>
  )
}

export default SankeyView