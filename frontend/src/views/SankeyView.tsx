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
  showControls?: boolean
  autoLoad?: boolean
}

interface ControlPanelProps {
  onResetAll: () => void
  onResetFilters: () => void
  onResetThresholds: () => void
  hasActiveFilters: boolean
  hasNodeThresholds: boolean
}

// ============================================================================
// CONTROL PANEL COMPONENT
// ============================================================================

const ControlPanel: React.FC<ControlPanelProps> = ({
  onResetAll,
  onResetFilters,
  onResetThresholds,
  hasActiveFilters,
  hasNodeThresholds
}) => {
  return (
    <div className="control-panel">
      <div className="control-panel__title">Controls</div>
      <div className="control-panel__buttons">
        <button
          className="control-panel__button control-panel__button--primary"
          onClick={onResetAll}
          disabled={!hasActiveFilters && !hasNodeThresholds}
          title="Reset all filters and node thresholds"
        >
          Reset All
        </button>
        <button
          className="control-panel__button control-panel__button--secondary"
          onClick={onResetFilters}
          disabled={!hasActiveFilters}
          title="Reset filters only"
        >
          Reset Filters
        </button>
        <button
          className="control-panel__button control-panel__button--secondary"
          onClick={onResetThresholds}
          disabled={!hasNodeThresholds}
          title="Clear all node thresholds"
        >
          Reset Thresholds
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// STATUS COMPONENT
// ============================================================================

const StatusPanel: React.FC = () => {
  const {
    filters,
    nodeThresholds,
    sankeyData,
    loading,
    errors
  } = useVisualizationStore()

  const getFilterCount = () => {
    return Object.values(filters).reduce((count, filterArray) => {
      return count + (filterArray?.length || 0)
    }, 0)
  }

  const getNodeThresholdCount = () => {
    return Object.keys(nodeThresholds).length
  }

  const hasData = sankeyData !== null
  const hasErrors = Object.values(errors).some(error => error !== null)
  const isLoading = Object.values(loading).some(isLoading => isLoading)

  return (
    <div className="status-panel">
      <div className="status-panel__title">Status</div>
      <div className="status-panel__content">
        <div className="status-panel__item">
          <span className="status-panel__label">Filters:</span>
          <span className="status-panel__value">
            {getFilterCount()} active
          </span>
        </div>
        <div className="status-panel__item">
          <span className="status-panel__label">Node Thresholds:</span>
          <span className="status-panel__value">
            {getNodeThresholdCount()} nodes
          </span>
        </div>
        <div className="status-panel__item">
          <span className="status-panel__label">Features:</span>
          <span className="status-panel__value">
            {sankeyData?.metadata.total_features.toLocaleString() || 'N/A'}
          </span>
        </div>
        <div className="status-panel__item">
          <span className="status-panel__label">Status:</span>
          <span className={`status-panel__status ${
            hasErrors ? 'status-panel__status--error' :
            isLoading ? 'status-panel__status--loading' :
            hasData ? 'status-panel__status--success' :
            'status-panel__status--idle'
          }`}>
            {hasErrors ? 'Error' :
             isLoading ? 'Loading' :
             hasData ? 'Ready' :
             'Idle'}
          </span>
        </div>
      </div>
    </div>
  )
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
  showControls = true,
  autoLoad = true
}) => {
  const {
    filters,
    nodeThresholds,
    filterOptions,
    fetchFilterOptions,
    fetchSankeyData,
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
    const hasActiveFilters = Object.values(filters).some(
      filterArray => filterArray && filterArray.length > 0
    )

    if (hasActiveFilters) {
      fetchSankeyData()
    }
  }, [filters])

  // Note: Node threshold changes now trigger Sankey refresh directly from setNodeThreshold
  // to avoid race conditions, so no useEffect needed here

  // Check if filters are active
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )

  // Check if node thresholds are set
  const hasNodeThresholds = Object.keys(nodeThresholds).length > 0


  // Handle control actions
  const handleResetAll = useCallback(() => {
    resetAll()
    // No need to fetch data since resetAll clears everything
  }, [])

  const handleResetFilters = useCallback(() => {
    resetFilters()
    // Data will be cleared by resetFilters, no fetch needed
  }, [])

  const handleResetThresholds = useCallback(() => {
    resetNodeThresholds()
    // Fetch updated Sankey data after threshold reset
    fetchSankeyData()
  }, [])

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

          {showControls && (
            <div className="sankey-view__controls">
              <StatusPanel />
              <ControlPanel
                onResetAll={handleResetAll}
                onResetFilters={handleResetFilters}
                onResetThresholds={handleResetThresholds}
                hasActiveFilters={hasActiveFilters}
                hasNodeThresholds={hasNodeThresholds}
              />
            </div>
          )}
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
                  showTooltips={true}
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
                  showTooltips={true}
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