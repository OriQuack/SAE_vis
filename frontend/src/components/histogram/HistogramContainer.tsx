/**
 * Histogram container component
 * Orchestrates histogram chart and threshold slider
 */

import React, { useEffect, useCallback, useMemo } from 'react'
import { HistogramChart } from './HistogramChart'
import { ThresholdSlider } from './ThresholdSlider'
import { useStore, useNodeData, useDataActions } from '../../stores/useStore'
import { useThresholds } from '../../hooks/useThresholds'
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor'
import { VIZ_CONFIG } from '../../constants/visualization'
import type { MetricType } from '../../types'
import { LoadingState } from '../common/LoadingState'
import { ErrorDisplay } from '../common/ErrorDisplay'

interface HistogramContainerProps {
  nodeId: string
  metric: MetricType
  width?: number
  height?: number
  showStats?: boolean
  onThresholdChange?: (value: number) => void
  className?: string
}

export const HistogramContainer: React.FC<HistogramContainerProps> = React.memo(({
  nodeId,
  metric,
  width = 400,
  height = 200,
  showStats = false,
  onThresholdChange,
  className = ''
}) => {
  const { measureRender } = usePerformanceMonitor({
    componentName: 'HistogramContainer',
    enableLogging: VIZ_CONFIG.PERFORMANCE.ENABLE_LOGGING
  })

  // Store hooks
  const { histogramData, getEffectiveThreshold } = useNodeData(nodeId, metric)
  const fetchHistogramData = useStore((state) => state.fetchHistogramData)
  const loadingHistogram = useStore((state) => {
    const filterStr = JSON.stringify(state.filters)
    const cacheKey = `${filterStr}_${metric}_${nodeId}`
    return state.loadingHistogram.has(cacheKey)
  })
  const histogramError = useStore((state) => state.histogramError)

  const { updateThreshold } = useThresholds()
  const filters = useStore((state) => state.filters)

  // Create a stable cache key for the histogram data
  const cacheKey = useMemo(() => {
    return `${JSON.stringify(filters)}_${metric}_${nodeId}`
  }, [filters, metric, nodeId])

  // Current threshold value
  const currentThreshold = useMemo(() => {
    return getEffectiveThreshold(metric)
  }, [getEffectiveThreshold, metric])

  // Fetch histogram data when component mounts or filters change
  useEffect(() => {
    if (!histogramData && !loadingHistogram) {
      fetchHistogramData(filters, metric, nodeId)  // Correct parameter order: filters, metric, nodeId
    }
  }, [cacheKey, fetchHistogramData, histogramData, loadingHistogram]) // Dependencies for data fetching

  // Handle threshold change
  const handleThresholdChange = useCallback((value: number) => {
    const cleanup = measureRender()
    updateThreshold(nodeId, metric, value)
    if (onThresholdChange) {
      onThresholdChange(value)
    }
    cleanup()
  }, [nodeId, metric, updateThreshold, onThresholdChange, measureRender])

  // Loading state
  if (loadingHistogram) {
    return (
      <div className={`histogram-container ${className}`} style={{ width, height }}>
        <LoadingState
          variant="skeleton"
          message="Loading histogram data..."
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    )
  }

  // Error state
  if (histogramError) {
    return (
      <div className={`histogram-container ${className}`} style={{ width, height }}>
        <ErrorDisplay
          error={new Error(histogramError || 'Failed to load histogram')}
          onRetry={() => fetchHistogramData(filters, metric, nodeId)}
        />
      </div>
    )
  }

  // No data state
  if (!histogramData) {
    return (
      <div className={`histogram-container ${className}`} style={{ width, height }}>
        <div className="histogram-container__empty">
          <p>No histogram data available</p>
          <button
            onClick={() => fetchHistogramData(filters, metric, nodeId)}
            className="histogram-container__retry-button"
          >
            Load Data
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`histogram-container ${className}`} style={{ width, height }}>
      <div className="histogram-container__chart">
        <HistogramChart
          data={histogramData}
          metric={metric}
          width={width}
          height={height * 0.7}
          threshold={currentThreshold}
          showStats={showStats}
        />
      </div>
      <div className="histogram-container__slider">
        <ThresholdSlider
          value={currentThreshold}
          onChange={handleThresholdChange}
          min={histogramData.statistics.min}
          max={histogramData.statistics.max}
          step={VIZ_CONFIG.THRESHOLDS[metric.toUpperCase() as keyof typeof VIZ_CONFIG.THRESHOLDS]?.STEP || 0.01}
          width={width}
          height={height * 0.3}
          label={`${metric} threshold`}
        />
      </div>
    </div>
  )
}) // Remove custom comparison to allow re-renders on threshold changes

HistogramContainer.displayName = 'HistogramContainer'