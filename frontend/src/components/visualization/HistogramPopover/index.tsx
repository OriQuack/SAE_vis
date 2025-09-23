import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../../../stores/store'
import { useClickOutside, useDragHandler } from '../../../hooks'
import {
  calculateHistogramLayout,
  calculateMultiHistogramLayout,
  validateHistogramData,
  validateDimensions,
  DEFAULT_ANIMATION
} from '../../../utils/d3-helpers'
// Components
import { ErrorMessage } from '../../shared/ErrorMessage'
import { PopoverHeader } from './PopoverHeader'
import { SingleHistogramView } from './SingleHistogramView'
import { MultiHistogramView } from './MultiHistogramView'

// Hooks
import { usePopoverPosition } from './hooks/usePopoverPosition'
import { useThresholdManagement } from './hooks/useThresholdManagement'

// Utils
import { createDynamicContainerStyle } from './utils/styles'

interface HistogramPopoverProps {
  width?: number
  height?: number
  animationDuration?: number
}

export const HistogramPopover: React.FC<HistogramPopoverProps> = ({
  width = 520,
  height = 380,
  animationDuration = DEFAULT_ANIMATION.duration
}) => {
  const popoverData = useVisualizationStore(state => state.popoverState.histogram)
  const histogramData = useVisualizationStore(state => state.histogramData)
  const loading = useVisualizationStore(state => state.loading.histogram)
  const error = useVisualizationStore(state => state.errors.histogram)

  const {
    hideHistogramPopover,
    fetchMultipleHistogramData,
    clearError
  } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Local state for dragging
  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null)

  // Custom hooks
  const { containerSize, calculatedPosition } = usePopoverPosition({
    visible: popoverData?.visible || false,
    clickPosition: popoverData?.position,
    defaultWidth: width,
    defaultHeight: height,
    metricsCount: popoverData?.metrics?.length || 1
  })


  const {
    currentThresholds,
    handleSingleThresholdChange,
    handleMultiThresholdChange,
    getEffectiveThreshold
  } = useThresholdManagement({
    popoverData,
    histogramData
  })

  const { ref: clickOutsideRef } = useClickOutside(
    () => hideHistogramPopover(),
    { enabled: popoverData?.visible || false }
  )

  // Drag handler for making the popover movable
  const { handleMouseDown: handleDragStart } = useDragHandler({
    onDragStart: (event) => {
      const currentPosition = draggedPosition || {
        x: calculatedPosition?.x || popoverData?.position.x || 0,
        y: calculatedPosition?.y || popoverData?.position.y || 0
      }
      // Store the offset from mouse to current position
      setDragStartOffset({
        x: event.clientX - currentPosition.x,
        y: event.clientY - currentPosition.y
      })
    },
    onDragMove: (event) => {
      if (dragStartOffset) {
        // Update position based on mouse position and initial offset
        setDraggedPosition({
          x: event.clientX - dragStartOffset.x,
          y: event.clientY - dragStartOffset.y
        })
      }
    },
    onDragEnd: () => {
      // Keep the final position
    }
  })

  // Merge refs for container
  const mergedContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    clickOutsideRef.current = node
  }, [clickOutsideRef])

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (histogramData && popoverData?.metrics) {
      popoverData.metrics.forEach(metric => {
        const metricData = histogramData[metric]
        if (metricData) {
          errors.push(...validateHistogramData(metricData))
        } else {
          errors.push(`Missing histogram data for metric: ${metric}`)
        }
      })
    }

    errors.push(...validateDimensions(containerSize.width, containerSize.height))

    return errors
  }, [histogramData, popoverData?.metrics, containerSize])

  // Calculate layout
  const layout = useMemo(() => {
    if (!histogramData || validationErrors.length > 0 || !popoverData?.metrics) {
      return null
    }

    const chartWidth = containerSize.width - 16
    const isMultiHistogram = popoverData.metrics.length > 1

    if (isMultiHistogram) {
      const chartHeight = containerSize.height - 64
      return calculateMultiHistogramLayout(histogramData, chartWidth, chartHeight)
    } else {
      const chartHeight = containerSize.height - 64
      const singleMetric = popoverData.metrics[0]
      const singleHistogramData = histogramData[singleMetric]

      if (!singleHistogramData) {
        return null
      }

      return calculateHistogramLayout(singleHistogramData, chartWidth, chartHeight)
    }
  }, [histogramData, containerSize, validationErrors, popoverData?.metrics])

  // Get effective threshold for single histogram mode
  const effectiveThreshold = useMemo(() => {
    const firstMetric = popoverData?.metrics?.[0]
    if (firstMetric) {
      return getEffectiveThreshold(firstMetric)
    }
    return 0.5
  }, [popoverData?.metrics, getEffectiveThreshold, currentThresholds])


  // Handle close
  const handleClose = useCallback(() => {
    hideHistogramPopover()
  }, [hideHistogramPopover])

  // Handle retry
  const handleRetry = useCallback(() => {
    if (popoverData?.nodeId && popoverData?.metrics) {
      clearError('histogram')
      // Always use fetchMultipleHistogramData since it correctly handles the metric parameter
      fetchMultipleHistogramData(popoverData.metrics, false, popoverData.nodeId)
    }
  }, [popoverData?.nodeId, popoverData?.metrics, clearError, fetchMultipleHistogramData])

  // Reset dragged position when popover opens/closes
  useEffect(() => {
    if (!popoverData?.visible) {
      setDraggedPosition(null)
      setDragStartOffset(null)
    }
  }, [popoverData?.visible])

  // Fetch histogram data when popover opens
  useEffect(() => {
    if (popoverData?.visible && popoverData.nodeId && popoverData.metrics?.length > 0) {
      // Always use fetchMultipleHistogramData since it correctly handles the metric parameter
      fetchMultipleHistogramData(popoverData.metrics, false, popoverData.nodeId)
    }
  }, [popoverData?.visible, popoverData?.nodeId, popoverData?.metrics, fetchMultipleHistogramData])

  // Don't render if popover is not visible
  if (!popoverData?.visible) {
    return null
  }

  const finalPosition = draggedPosition || {
    x: calculatedPosition?.x || popoverData.position.x,
    y: calculatedPosition?.y || popoverData.position.y
  }

  const containerStyle = createDynamicContainerStyle(
    finalPosition,
    calculatedPosition?.transform || 'translate(0%, -50%)',
    animationDuration
  )

  const popoverContent = (
    <div className="histogram-popover" style={containerStyle}>
      <div
        ref={mergedContainerRef}
        className="histogram-popover__container"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        {/* Header */}
        <PopoverHeader
          nodeName={popoverData.nodeName}
          parentNodeName={popoverData.parentNodeName}
          metrics={popoverData.metrics}
          onClose={handleClose}
          onMouseDown={handleDragStart}
        />

        {/* Error display */}
        {error && (
          <ErrorMessage message={error} onRetry={handleRetry} />
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="histogram-popover__validation-errors">
            {validationErrors.map((error, index) => (
              <ErrorMessage key={index} message={error} showIcon={false} />
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="histogram-popover__loading">
            <div className="loading-spinner">⏳</div>
            <span>Loading histogram...</span>
          </div>
        )}

        {/* Main visualization */}
        {layout && histogramData && !loading && !error && validationErrors.length === 0 && popoverData?.metrics && (
          popoverData.metrics.length > 1 ? (
            <MultiHistogramView
              layout={layout as any}
              histogramData={histogramData}
              currentThresholds={currentThresholds}
              animationDuration={animationDuration}
              containerSize={containerSize}
              onThresholdChange={handleMultiThresholdChange}
              svgRef={svgRef}
            />
          ) : (
            <SingleHistogramView
              layout={layout as any}
              histogramData={histogramData[popoverData.metrics[0]]}
              threshold={effectiveThreshold}
              animationDuration={animationDuration}
              containerSize={containerSize}
              onThresholdChange={handleSingleThresholdChange}
              svgRef={svgRef}
            />
          )
        )}

      </div>
    </div>
  )

  // Render as portal to ensure proper z-index layering
  return createPortal(popoverContent, document.body)
}

HistogramPopover.displayName = 'HistogramPopover'

export default HistogramPopover