import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  calculateHistogramLayout,
  calculateDivergingBars,
  calculateXAxisTicks,
  calculateYAxisTicks
} from '../lib/d3-histogram-utils'
import ThresholdHandles from './ThresholdHandles'
import '../styles/SimilarityTaggingPopover.css'

const SimilarityTaggingPopover: React.FC = () => {
  const popoverState = useVisualizationStore(state => state.similarityTaggingPopover)
  const hideSimilarityTaggingPopover = useVisualizationStore(state => state.hideSimilarityTaggingPopover)
  const updateSimilarityThresholds = useVisualizationStore(state => state.updateSimilarityThresholds)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)

  const containerRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)
  const isDraggingPopoverRef = useRef(false)

  const [draggedPosition, setDraggedPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectThreshold, setSelectThreshold] = useState(0.1)

  // Initialize threshold and reset position when popover opens
  useEffect(() => {
    if (popoverState?.visible) {
      setSelectThreshold(popoverState.selectThreshold)
      setDraggedPosition(null) // Reset to center
    }
  }, [popoverState?.visible, popoverState?.selectThreshold])

  // Click outside to close
  useEffect(() => {
    if (!popoverState?.visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (backdropRef.current && e.target === backdropRef.current) {
        hideSimilarityTaggingPopover()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popoverState?.visible, hideSimilarityTaggingPopover])

  // Dragging logic (centered modal with offset)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const handleMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return

      // Calculate offset from center of viewport
      const currentOffset = draggedPosition || { x: 0, y: 0 }
      const startX = e.clientX
      const startY = e.clientY

      isDraggingPopoverRef.current = true

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
        }
        rafIdRef.current = requestAnimationFrame(() => {
          const deltaX = moveEvent.clientX - startX
          const deltaY = moveEvent.clientY - startY
          setDraggedPosition({
            x: currentOffset.x + deltaX,
            y: currentOffset.y + deltaY
          })
        })
      }

      const handleMouseUp = () => {
        isDraggingPopoverRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    header.addEventListener('mousedown', handleMouseDown)
    return () => {
      header.removeEventListener('mousedown', handleMouseDown)
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [draggedPosition])

  // Calculate histogram layout and bars with symmetric domain
  const histogramChart = useMemo(() => {
    if (!popoverState?.histogramData) return null

    const { statistics } = popoverState.histogramData

    // Validate statistics - handle NaN or invalid values
    const minValue = isFinite(statistics.min) ? statistics.min : -1
    const maxValue = isFinite(statistics.max) ? statistics.max : 1

    // Calculate symmetric domain around zero for visual centering
    const maxAbsValue = Math.max(Math.abs(minValue), Math.abs(maxValue))

    // Ensure maxAbsValue is valid and non-zero
    const validMaxAbsValue = isFinite(maxAbsValue) && maxAbsValue > 0 ? maxAbsValue : 1

    // Create modified histogram data with symmetric domain
    const symmetricHistogramData = {
      ...popoverState.histogramData,
      statistics: {
        ...statistics,
        min: -validMaxAbsValue,
        max: validMaxAbsValue
      }
    }

    const histogramDataMap = {
      similarity: symmetricHistogramData
    }

    const layout = calculateHistogramLayout(histogramDataMap, 600, 290)
    const chart = layout.charts[0]

    // Increase top margin to prevent "0" label cutoff
    return {
      ...chart,
      margin: { ...chart.margin, top: 20 }
    }
  }, [popoverState?.histogramData])

  const bars = useMemo(() => {
    if (!histogramChart) return []
    return calculateDivergingBars(histogramChart, 0)
  }, [histogramChart])

  // Calculate axis ticks
  const xAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateXAxisTicks(histogramChart, 6)
  }, [histogramChart])

  const yAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateYAxisTicks(histogramChart, 5)
  }, [histogramChart])

  // Safe threshold positions and domain - clamp to valid range and handle NaN
  const safeThresholdPositions = useMemo(() => {
    if (!histogramChart) return { selectX: 0, minDomain: -1, maxDomain: 1 }

    // Get domain from xScale and validate
    const domain = histogramChart.xScale.domain()
    let minDomain = domain[0]
    let maxDomain = domain[1]

    // Validate domain values
    if (!isFinite(minDomain)) minDomain = -1
    if (!isFinite(maxDomain)) maxDomain = 1

    // Clamp threshold to domain
    const clampedSelect = Math.max(minDomain, Math.min(maxDomain, selectThreshold))

    // Calculate position
    let selectX = histogramChart.xScale(clampedSelect)

    // Validate and fallback to safe values
    if (!isFinite(selectX)) selectX = histogramChart.width

    return { selectX, minDomain, maxDomain }
  }, [histogramChart, selectThreshold])

  // Calculate tag counts preview (single threshold: only select)
  const tagCounts = useMemo(() => {
    if (!popoverState?.histogramData?.scores) return { selected: 0, untagged: 0, preserved: 0 }

    const scores = popoverState.histogramData.scores
    let selected = 0
    let untagged = 0

    // Count preserved items directly from selection states (not from scores)
    // This is the correct count of already-tagged items
    const preserved = popoverState.mode === 'feature'
      ? featureSelectionStates.size
      : pairSelectionStates.size

    Object.entries(scores).forEach(([id, score]) => {
      // Check if already tagged - skip these as they're already counted in preserved
      const isAlreadyTagged = popoverState.mode === 'feature'
        ? featureSelectionStates.has(parseInt(id, 10))
        : pairSelectionStates.has(id)

      if (isAlreadyTagged) {
        return // Skip - already counted in preserved
      }

      // Count new tags (single threshold logic)
      if (typeof score === 'number') {
        if (score >= selectThreshold) {
          selected++
        } else {
          untagged++
        }
      }
    })

    return { selected, untagged, preserved }
  }, [popoverState, selectThreshold, featureSelectionStates, pairSelectionStates])

  // Threshold update callback for single threshold
  const handleThresholdUpdate = (newThresholds: number[]) => {
    if (newThresholds.length !== 1) return

    const newSelect = newThresholds[0]
    setSelectThreshold(newSelect)
    updateSimilarityThresholds(newSelect)
  }

  if (!popoverState?.visible) return null

  const { mode, isLoading, histogramData, tagLabel } = popoverState

  return (
    <>
      {/* Backdrop with blur */}
      <div
        ref={backdropRef}
        className="similarity-tagging-popover__backdrop"
      />

      {/* Centered popover */}
      <div
        ref={containerRef}
        className="similarity-tagging-popover"
        style={{
          transform: draggedPosition
            ? `translate(calc(-50% + ${draggedPosition.x}px), calc(-50% + ${draggedPosition.y}px))`
            : 'translate(-50%, -50%)',
          cursor: isDraggingPopoverRef.current ? 'grabbing' : 'default'
        }}
      >
        <div
          ref={headerRef}
          className="similarity-tagging-popover__header"
          style={{ cursor: isDraggingPopoverRef.current ? 'grabbing' : 'grab' }}
        >
          <span className="similarity-tagging-popover__title">
            Automatic Tagging - {mode === 'feature' ? 'Features' : 'Pairs'}
          </span>
          <button
            className="similarity-tagging-popover__close"
            onClick={hideSimilarityTaggingPopover}
          >
            ×
          </button>
        </div>

      <div className="similarity-tagging-popover__content">
        {isLoading ? (
          <div className="similarity-tagging-popover__loading">
            <div className="spinner" />
            <span>Calculating similarity scores...</span>
          </div>
        ) : histogramData && histogramChart ? (
          <>
            <div className="similarity-tagging-popover__info">
              <p>
                Drag the threshold to tag {mode === 'feature' ? 'features' : 'pairs'} automatically.
                <br />
                Items with scores <strong>above the threshold</strong> will be tagged as <strong style={{ color: '#4caf50' }}>{tagLabel}</strong>.
              </p>
            </div>

            <svg
              ref={svgRef}
              className="similarity-tagging-popover__svg"
              width={600}
              height={300}
            >
              <g transform={`translate(${histogramChart.margin.left}, ${histogramChart.margin.top})`}>
                {/* Colored region backgrounds (grey/green zones) */}
                {/* Grey zone: left edge to select threshold */}
                <rect
                  x={0}
                  y={0}
                  width={Math.max(0, safeThresholdPositions.selectX)}
                  height={histogramChart.height}
                  fill="#999"
                  opacity={0.1}
                />
                {/* Green zone: select threshold to right edge */}
                <rect
                  x={safeThresholdPositions.selectX}
                  y={0}
                  width={Math.max(0, histogramChart.width - safeThresholdPositions.selectX)}
                  height={histogramChart.height}
                  fill="#4caf50"
                  opacity={0.1}
                />

                {/* Histogram bars */}
                {bars.map((bar, i) => {
                  // Calculate bin center to determine which region it's in
                  const binCenter = (bar.binData.x0 + bar.binData.x1) / 2

                  // Determine color based on region:
                  // - Dark grey if below threshold (untagged)
                  // - Green if above threshold (selected)
                  const barColor = binCenter >= selectThreshold ? '#4caf50' : '#666'

                  return (
                    <rect
                      key={i}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      fill={barColor}
                      opacity={0.7}
                    />
                  )
                })}

                {/* Center line at 0 */}
                <line
                  x1={histogramChart.xScale(0)}
                  y1={0}
                  x2={histogramChart.xScale(0)}
                  y2={histogramChart.height}
                  stroke="#333"
                  strokeWidth={2}
                  strokeDasharray="4,4"
                  opacity={0.7}
                />

                {/* X axis */}
                <line
                  x1={0}
                  y1={histogramChart.height}
                  x2={histogramChart.width}
                  y2={histogramChart.height}
                  stroke="#333"
                  strokeWidth={2}
                />

                {/* X axis ticks and labels */}
                {xAxisTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={tick.position}
                      y1={histogramChart.height}
                      x2={tick.position}
                      y2={histogramChart.height + 5}
                      stroke="#333"
                      strokeWidth={1}
                    />
                    <text
                      x={tick.position}
                      y={histogramChart.height + 18}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#666"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* Y axis */}
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={histogramChart.height}
                  stroke="#333"
                  strokeWidth={2}
                />

                {/* Y axis ticks and labels */}
                {yAxisTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={0}
                      y1={tick.position}
                      x2={-5}
                      y2={tick.position}
                      stroke="#333"
                      strokeWidth={1}
                    />
                    <text
                      x={-10}
                      y={tick.position + 3}
                      textAnchor="end"
                      fontSize={10}
                      fill="#666"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* Axis labels */}
                <text
                  x={histogramChart.width / 2}
                  y={histogramChart.height + 35}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#666"
                >
                  Similarity Score (Selected - Rejected)
                </text>
                <text
                  x={-histogramChart.height / 2}
                  y={-40}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#666"
                  transform={`rotate(-90, ${-histogramChart.height / 2}, -40)`}
                >
                  Count
                </text>

                {/* Single threshold handle for selection */}
                <ThresholdHandles
                  orientation="horizontal"
                  bounds={{
                    min: 0,
                    max: histogramChart.width
                  }}
                  thresholds={[selectThreshold]}
                  metricRange={{
                    min: safeThresholdPositions.minDomain,  // Use validated domain
                    max: safeThresholdPositions.maxDomain
                  }}
                  position={{ x: 0, y: 0 }}
                  lineBounds={{
                    min: 0,
                    max: histogramChart.height
                  }}
                  showThresholdLine={true}
                  onUpdate={handleThresholdUpdate}
                  onDragUpdate={handleThresholdUpdate}
                />
              </g>
            </svg>

            <div className="similarity-tagging-popover__preview">
              <p>
                <strong>Preview:</strong> {tagCounts.selected} will be tagged as{' '}
                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{tagLabel}</span>, {tagCounts.untagged} will remain{' '}
                <span style={{ color: '#999', fontWeight: 'bold' }}>untagged</span>
                {tagCounts.preserved > 0 && ` (${tagCounts.preserved} preserved)`}
              </p>
            </div>

            <div className="similarity-tagging-popover__actions">
              <button
                className="similarity-tagging-popover__button similarity-tagging-popover__button--cancel"
                onClick={hideSimilarityTaggingPopover}
              >
                Cancel
              </button>
              <button
                className="similarity-tagging-popover__button similarity-tagging-popover__button--apply"
                onClick={applySimilarityTags}
              >
                Apply Tags
              </button>
            </div>
          </>
        ) : (
          <div className="similarity-tagging-popover__error">
            Failed to load histogram data
          </div>
        )}
      </div>
      </div>
    </>
  )
}

export default SimilarityTaggingPopover
