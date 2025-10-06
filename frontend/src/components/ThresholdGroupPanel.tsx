import React, { useEffect, useRef, useState } from 'react'
import { useVisualizationStore } from '../store'
import { formatThresholdRange, formatMetricName } from '../lib/selection-utils'
import '../styles/ThresholdGroupPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface ThresholdGroupPanelProps {
  className?: string
}

// ==================== MAIN COMPONENT ====================
export const ThresholdGroupPanel: React.FC<ThresholdGroupPanelProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 800 })

  // Store state
  const selectionMode = useVisualizationStore(state => state.selectionMode)
  const selections = useVisualizationStore(state => state.selections)
  const setSelectionMode = useVisualizationStore(state => state.setSelectionMode)
  const removeSelection = useVisualizationStore(state => state.removeSelection)
  const clearAllSelections = useVisualizationStore(state => state.clearAllSelections)

  // Placeholder states - ready for future data integration
  const loading = false
  const error = null

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Render loading state
  if (loading) {
    return (
      <div className={`threshold-group-panel ${className}`} ref={containerRef}>
        <div className="threshold-group-panel__loading">
          <div className="threshold-group-panel__spinner" />
          <span>Loading threshold groups...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className={`threshold-group-panel ${className}`} ref={containerRef}>
        <div className="threshold-group-panel__error">
          <div className="threshold-group-panel__error-icon">⚠️</div>
          <div className="threshold-group-panel__error-message">{error}</div>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className={`threshold-group-panel ${className}`} ref={containerRef}>
      {/* Add button */}
      <button
        className={`threshold-group-panel__add-button ${
          selectionMode ? 'threshold-group-panel__add-button--active' : ''
        }`}
        onClick={() => setSelectionMode(!selectionMode)}
        title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
        </svg>
      </button>

      <div className="threshold-group-panel__container">
        {/* Selection list */}
        {selections.length > 0 ? (
          <div className="threshold-group-panel__selections">
            <div className="threshold-group-panel__selections-header">
              <span className="threshold-group-panel__selections-title">Selected Thresholds</span>
              {selections.length > 1 && (
                <button
                  className="threshold-group-panel__clear-all"
                  onClick={clearAllSelections}
                  title="Clear all selections"
                >
                  Clear All
                </button>
              )}
            </div>
            {selections.map(selection => (
              <div key={selection.id} className="threshold-group-panel__selection-item">
                <div
                  className="threshold-group-panel__selection-color"
                  style={{ backgroundColor: selection.color }}
                />
                <div className="threshold-group-panel__selection-details">
                  <div className="threshold-group-panel__selection-metric">
                    {formatMetricName(selection.metricType)}
                  </div>
                  <div className="threshold-group-panel__selection-range">
                    {formatThresholdRange(selection.thresholdRange.min, selection.thresholdRange.max)}
                  </div>
                </div>
                <button
                  className="threshold-group-panel__remove-selection"
                  onClick={() => removeSelection(selection.id)}
                  title="Remove selection"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="threshold-group-panel__empty">
            <div className="threshold-group-panel__empty-icon">🎯</div>
            <div className="threshold-group-panel__empty-message">
              {selectionMode ? 'Drag on histogram to select' : 'No selections'}
            </div>
            <div className="threshold-group-panel__empty-submessage">
              {selectionMode ? 'Selection mode active' : 'Click + to start selecting'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ThresholdGroupPanel
