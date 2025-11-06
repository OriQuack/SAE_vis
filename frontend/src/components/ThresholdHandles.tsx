import React, { useState, useRef, useCallback } from 'react'
import { OKABE_ITO_PALETTE, NEUTRAL_ICON_COLORS } from '../lib/constants'

// ============================================================================
// TYPES
// ============================================================================

interface ThresholdHandlesProps {
  orientation: 'horizontal' | 'vertical'
  bounds: { min: number; max: number }      // Pixel bounds for handle movement (0 to width/height)
  thresholds: number[]                      // Threshold values in metric space
  metricRange: { min: number; max: number } // Metric value range
  position: { x: number; y: number }        // SVG position offset
  parentOffset?: { x: number; y: number }   // Parent transform offset from SVG origin
  lineBounds?: { min: number; max: number } // Pixel bounds for threshold line span (defaults to bounds)
  showThresholdLine?: boolean               // Whether to show dotted threshold line
  showDragTooltip?: boolean                 // Whether to show numeric value tooltip when dragging (default: true)
  usePercentiles?: boolean                  // If true, return percentiles (0-1) instead of metric values
  onUpdate: (newThresholds: number[]) => void
  onDragUpdate?: (newThresholds: number[]) => void  // Called during drag for live preview
  handleDimensions?: { width: number; height: number }
  percentileToMetric?: (percentile: number) => number  // Optional: Convert percentile to metric value for tooltip
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps threshold value (or percentile) to pixel position
 */
function calculateHandlePositionFromThreshold(
  threshold: number,
  metricMin: number,
  metricMax: number,
  boundsMin: number,
  boundsMax: number,
  usePercentiles: boolean = false
): number {
  let ratio: number

  if (usePercentiles) {
    // In percentile mode, threshold IS the ratio (0-1)
    ratio = threshold
  } else {
    // In metric mode, calculate ratio from metric value
    ratio = (threshold - metricMin) / (metricMax - metricMin)
  }

  const result = boundsMin + ratio * (boundsMax - boundsMin)
  return result
}

/**
 * Maps pixel position to threshold value or percentile
 */
function calculateThresholdFromHandlePosition(
  position: number,
  metricMin: number,
  metricMax: number,
  boundsMin: number,
  boundsMax: number,
  usePercentiles: boolean = false
): number {
  const ratio = (position - boundsMin) / (boundsMax - boundsMin)

  // In percentile mode, return the ratio directly (0-1 normalized position)
  if (usePercentiles) {
    return ratio
  }

  // In metric mode, map ratio to metric value range
  return metricMin + ratio * (metricMax - metricMin)
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ThresholdHandles: React.FC<ThresholdHandlesProps> = ({
  orientation,
  bounds,
  thresholds,
  metricRange,
  position,
  parentOffset = { x: 0, y: 0 },
  lineBounds,
  showThresholdLine = true,
  showDragTooltip = true,
  usePercentiles = false,
  onUpdate,
  onDragUpdate,
  handleDimensions = { width: 20, height: 16 },
  percentileToMetric
}) => {
  // Use lineBounds if provided, otherwise default to bounds
  const effectiveLineBounds = lineBounds || bounds
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null)
  const [tempThresholds, setTempThresholds] = useState<number[]>(thresholds)
  const rafIdRef = useRef<number | null>(null)
  const svgElementRef = useRef<SVGSVGElement | null>(null)
  const offsetRef = useRef<number>(0)
  const justUpdatedRef = useRef<boolean>(false)
  const lastPreviewRef = useRef<string>('')
  const pendingThresholdsRef = useRef<number[] | null>(null)

  // Update temp thresholds when props change (but NOT if we just updated them ourselves)
  React.useEffect(() => {
    if (justUpdatedRef.current) {
      // Check if props have actually updated to match what we sent
      const propsKey = thresholds.map(t => t.toFixed(6)).join(',')
      const pendingKey = pendingThresholdsRef.current?.map(t => t.toFixed(6)).join(',')

      if (propsKey === pendingKey) {
        // Props match what we sent - reset flag and clear pending
        justUpdatedRef.current = false
        pendingThresholdsRef.current = null
      }
      // Don't update tempThresholds yet - props haven't changed to new value
      return
    }

    if (draggingHandle === null) {
      setTempThresholds(thresholds)
    }
  }, [thresholds, draggingHandle])

  const displayThresholds = tempThresholds

  const handleMouseDown = useCallback((handleIndex: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    // Store SVG element for use during drag
    const svgElement = (e.target as Element).closest('svg') as SVGSVGElement
    if (svgElement) {
      svgElementRef.current = svgElement
    }

    // Store the coordinate offset for mouse position calculations
    // Converts mouse position (SVG coords) to node-relative coordinates
    // Subtracts: margin (parentOffset) + node position in D3 space (position)
    offsetRef.current = orientation === 'horizontal'
      ? parentOffset.x + position.x
      : parentOffset.y + position.y

    // Disable selection globally during drag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = orientation === 'horizontal' ? 'ew-resize' : 'ns-resize'

    setDraggingHandle(handleIndex)
  }, [orientation, parentOffset, position])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingHandle === null) return

    e.preventDefault()

    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const svgElement = svgElementRef.current
      if (!svgElement) return

      const svgRect = svgElement.getBoundingClientRect()
      const mousePos = orientation === 'horizontal'
        ? e.clientX - svgRect.left
        : e.clientY - svgRect.top

      const adjustedPos = mousePos - offsetRef.current

      // Clamp position within bounds
      const clampedPos = Math.max(bounds.min, Math.min(bounds.max, adjustedPos))

      // Convert to threshold value or percentile
      const newThreshold = calculateThresholdFromHandlePosition(
        clampedPos,
        metricRange.min,
        metricRange.max,
        bounds.min,
        bounds.max,
        usePercentiles
      )

      // Compute updated thresholds with constraints BEFORE setState
      const computeUpdated = (prev: number[]) => {
        const updated = [...prev]
        updated[draggingHandle] = newThreshold

        // Ensure thresholds stay ordered (supports N handles)
        // For both orientations in percentile mode: handle[i] < handle[i+1]
        // (Top/Left = smaller value, Bottom/Right = larger value)
        if (draggingHandle === 0 && updated.length > 1) {
          // First handle: must be less than next handle
          updated[0] = Math.min(updated[0], updated[1] - 0.01)
        } else if (draggingHandle === updated.length - 1 && updated.length > 1) {
          // Last handle: must be greater than previous handle
          updated[draggingHandle] = Math.max(updated[draggingHandle], updated[draggingHandle - 1] + 0.01)
        } else if (draggingHandle > 0 && draggingHandle < updated.length - 1) {
          // Middle handle: must be between neighbors
          updated[draggingHandle] = Math.max(updated[draggingHandle], updated[draggingHandle - 1] + 0.01)
          updated[draggingHandle] = Math.min(updated[draggingHandle], updated[draggingHandle + 1] - 0.01)
        }

        return updated
      }

      // Compute the new values
      const newValues = computeUpdated(tempThresholds)

      // Call onDragUpdate OUTSIDE of setState to avoid "Cannot update while rendering" error
      if (onDragUpdate) {
        const previewKey = newValues.join(',')
        if (previewKey !== lastPreviewRef.current) {
          lastPreviewRef.current = previewKey
          onDragUpdate(newValues)
        }
      }

      // Update state
      setTempThresholds(newValues)
    })
  }, [draggingHandle, bounds, metricRange, orientation, usePercentiles, onDragUpdate, tempThresholds])

  const handleMouseUp = useCallback(() => {
    if (draggingHandle === null) return

    // Restore global styles
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    // Clear stored references
    svgElementRef.current = null
    offsetRef.current = 0
    lastPreviewRef.current = ''

    // Mark that we're updating the thresholds ourselves (to prevent snap-back)
    justUpdatedRef.current = true
    pendingThresholdsRef.current = [...tempThresholds]

    // Call update with final thresholds
    onUpdate(tempThresholds)
    setDraggingHandle(null)
  }, [draggingHandle, tempThresholds, onUpdate])

  // Global mouse event listeners during drag
  React.useEffect(() => {
    if (draggingHandle === null) return

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp])

  return (
    <g className="threshold-handles" transform={`translate(${position.x}, ${position.y})`}>
      {displayThresholds.map((threshold, index) => {
        const pos = calculateHandlePositionFromThreshold(
          threshold,
          metricRange.min,
          metricRange.max,
          bounds.min,
          bounds.max,
          usePercentiles
        )
        const isDragging = draggingHandle === index
        const isHovered = hoveredHandle === index && !isDragging

        // Professional color states
        const lineColor = isDragging || isHovered ? OKABE_ITO_PALETTE.BLUE : NEUTRAL_ICON_COLORS.ICON_FILL
        const lineOpacity = isDragging ? 1.0 : isHovered ? 0.8 : 0.4
        const handleFillColor = isDragging || isHovered ? OKABE_ITO_PALETTE.BLUE : NEUTRAL_ICON_COLORS.ICON_FILL
        const handleFillOpacity = isDragging ? 1.0 : isHovered ? 0.9 : 0.6
        const handleStrokeColor = isDragging || isHovered ? OKABE_ITO_PALETTE.BLUE : NEUTRAL_ICON_COLORS.ICON_STROKE
        const handleStrokeOpacity = isDragging ? 1.0 : isHovered ? 0.8 : 0.5
        const gripColor = '#ffffff'
        const gripOpacity = isDragging || isHovered ? 1.0 : 0.8

        // Calculate handle position based on orientation
        const handleX = orientation === 'horizontal'
          ? pos - handleDimensions.width / 2
          : -handleDimensions.width / 2
        const handleY = orientation === 'vertical'
          ? pos - handleDimensions.height / 2
          : 0

        // Calculate threshold line based on orientation
        // For horizontal: vertical line at x=pos, spanning Y from lineBounds.min to lineBounds.max
        // For vertical: horizontal line at y=pos, spanning X from lineBounds.min to lineBounds.max
        const lineX1 = orientation === 'horizontal' ? pos : effectiveLineBounds.min
        const lineY1 = orientation === 'vertical' ? pos : effectiveLineBounds.min
        const lineX2 = orientation === 'horizontal' ? pos : effectiveLineBounds.max
        const lineY2 = orientation === 'vertical' ? pos : effectiveLineBounds.max

        return (
          <g key={index}>
            {/* Threshold line spanning full bounds (conditionally shown) */}
            {showThresholdLine && (
              <line
                x1={lineX1}
                y1={lineY1}
                x2={lineX2}
                y2={lineY2}
                stroke={lineColor}
                strokeWidth={isDragging ? 2 : 1.5}
                strokeDasharray={isDragging ? 'none' : '4,3'}
                opacity={lineOpacity}
                style={{
                  pointerEvents: 'none',
                  transition: 'stroke 150ms ease-out, stroke-width 150ms ease-out, opacity 150ms ease-out'
                }}
              />
            )}

            {/* Professional grip-style handle - rounded rectangle with 3 grip lines */}
            <g
              onMouseDown={handleMouseDown(index)}
              onMouseEnter={() => setHoveredHandle(index)}
              onMouseLeave={() => setHoveredHandle(null)}
              style={{ cursor: orientation === 'horizontal' ? 'ew-resize' : 'ns-resize' }}
            >
              {/* Handle background (rounded rectangle) */}
              <rect
                x={handleX}
                y={handleY}
                width={handleDimensions.width}
                height={handleDimensions.height}
                rx={3}
                fill={handleFillColor}
                fillOpacity={handleFillOpacity}
                stroke={handleStrokeColor}
                strokeWidth={1}
                strokeOpacity={handleStrokeOpacity}
                style={{
                  transition: 'fill 150ms ease-out, fill-opacity 150ms ease-out, stroke 150ms ease-out, stroke-opacity 150ms ease-out'
                }}
              />

              {/* Grip lines (3 lines) */}
              {orientation === 'horizontal'
                ? // Vertical grip lines for horizontal handles
                  [-4, 0, 4].map((offset, i) => (
                    <line
                      key={i}
                      x1={pos + offset}
                      y1={5}
                      x2={pos + offset}
                      y2={handleDimensions.height - 5}
                      stroke={gripColor}
                      strokeWidth={1.5}
                      strokeOpacity={gripOpacity}
                      strokeLinecap="round"
                      style={{
                        pointerEvents: 'none',
                        transition: 'stroke-opacity 150ms ease-out'
                      }}
                    />
                  ))
                : // Horizontal grip lines for vertical handles
                  [-4, 0, 4].map((offset, i) => (
                    <line
                      key={i}
                      x1={handleX + 5}
                      y1={pos + offset}
                      x2={handleX + handleDimensions.width - 5}
                      y2={pos + offset}
                      stroke={gripColor}
                      strokeWidth={1.5}
                      strokeOpacity={gripOpacity}
                      strokeLinecap="round"
                      style={{
                        pointerEvents: 'none',
                        transition: 'stroke-opacity 150ms ease-out'
                      }}
                    />
                  ))}
            </g>

            {/* Threshold value label (show only when dragging, with background for contrast) */}
            {isDragging && showDragTooltip && (() => {
              // Convert percentile to actual metric value for display
              let displayValue: number

              if (usePercentiles) {
                if (!percentileToMetric) {
                  console.error('[ThresholdHandles] percentileToMetric function is missing! This should never happen.')
                  displayValue = 0  // Show error value
                } else {
                  displayValue = percentileToMetric(threshold)
                }
              } else {
                displayValue = threshold
              }

              return (
                <g>
                  {orientation === 'horizontal' ? (
                    <>
                      {/* Background rectangle for contrast */}
                      <rect
                        x={pos - 25}
                        y={handleDimensions.height + 5}
                        width={50}
                        height={20}
                        rx={3}
                        fill={NEUTRAL_ICON_COLORS.BACKGROUND_MEDIUM}
                        stroke={NEUTRAL_ICON_COLORS.BORDER_MEDIUM}
                        strokeWidth={1}
                        opacity={0.95}
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Threshold value text */}
                      <text
                        x={pos}
                        y={handleDimensions.height + 19}
                        dy="0.35em"
                        fontSize="11"
                        fontFamily="monospace"
                        fontWeight="600"
                        fill={NEUTRAL_ICON_COLORS.TEXT_PRIMARY}
                        textAnchor="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {displayValue.toFixed(3)}
                      </text>
                    </>
                  ) : (
                    <>
                      {/* Background rectangle for contrast */}
                      <rect
                        x={handleDimensions.width / 2 + 8}
                        y={pos - 10}
                        width={50}
                        height={20}
                        rx={3}
                        fill={NEUTRAL_ICON_COLORS.BACKGROUND_MEDIUM}
                        stroke={NEUTRAL_ICON_COLORS.BORDER_MEDIUM}
                        strokeWidth={1}
                        opacity={0.95}
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Threshold value text */}
                      <text
                        x={handleDimensions.width / 2 + 33}
                        y={pos}
                        dy="0.35em"
                        fontSize="11"
                        fontFamily="monospace"
                        fontWeight="600"
                        fill={NEUTRAL_ICON_COLORS.TEXT_PRIMARY}
                        textAnchor="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {displayValue.toFixed(3)}
                      </text>
                    </>
                  )}
                </g>
              )
            })()}
          </g>
        )
      })}
    </g>
  )
}

export default ThresholdHandles
