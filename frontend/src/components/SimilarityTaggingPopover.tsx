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
  const [rejectThreshold, setRejectThreshold] = useState(-0.1)
  const [selectThreshold, setSelectThreshold] = useState(0.1)

  // Initialize thresholds and reset position when popover opens
  useEffect(() => {
    if (popoverState?.visible) {
      setRejectThreshold(popoverState.rejectThreshold)
      setSelectThreshold(popoverState.selectThreshold)
      setDraggedPosition(null) // Reset to center
    }
  }, [popoverState?.visible, popoverState?.rejectThreshold, popoverState?.selectThreshold])

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

    // Calculate symmetric domain around zero for visual centering
    const maxAbsValue = Math.max(Math.abs(statistics.min), Math.abs(statistics.max))

    // Create modified histogram data with symmetric domain
    const symmetricHistogramData = {
      ...popoverState.histogramData,
      statistics: {
        ...statistics,
        min: -maxAbsValue,
        max: maxAbsValue
      }
    }

    const histogramDataMap = {
      similarity: symmetricHistogramData
    }

    const layout = calculateHistogramLayout(histogramDataMap, 600, 300)
    return layout.charts[0]
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

  // Calculate tag counts preview (three-way)
  const tagCounts = useMemo(() => {
    if (!popoverState?.histogramData?.scores) return { selected: 0, rejected: 0, untagged: 0, preserved: 0 }

    const scores = popoverState.histogramData.scores
    let selected = 0
    let rejected = 0
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

      // Count new tags (three-way logic)
      if (typeof score === 'number') {
        if (score < rejectThreshold) {
          rejected++
        } else if (score >= selectThreshold) {
          selected++
        } else {
          untagged++
        }
      }
    })

    return { selected, rejected, untagged, preserved }
  }, [popoverState, rejectThreshold, selectThreshold, featureSelectionStates, pairSelectionStates])

  // Threshold update callback for two thresholds
  const handleThresholdUpdate = (newThresholds: number[]) => {
    if (newThresholds.length !== 2) return

    const [newReject, newSelect] = newThresholds
    setRejectThreshold(newReject)
    setSelectThreshold(newSelect)
    updateSimilarityThresholds(newReject, newSelect)
  }

  if (!popoverState?.visible) return null

  const { mode, isLoading, histogramData } = popoverState

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
                <strong>Green</strong> (positive): more similar to selected
                <br />
                <strong>Red</strong> (negative): more similar to rejected
              </p>
            </div>

            <svg
              ref={svgRef}
              className="similarity-tagging-popover__svg"
              width={600}
              height={300}
            >
              <g transform={`translate(${histogramChart.margin.left}, ${histogramChart.margin.top})`}>
                {/* Colored region backgrounds (red/grey/green zones) */}
                {/* Red zone: left edge to reject threshold */}
                <rect
                  x={0}
                  y={0}
                  width={histogramChart.xScale(rejectThreshold)}
                  height={histogramChart.height}
                  fill="#f44336"
                  opacity={0.1}
                />
                {/* Grey zone: reject threshold to select threshold */}
                <rect
                  x={histogramChart.xScale(rejectThreshold)}
                  y={0}
                  width={histogramChart.xScale(selectThreshold) - histogramChart.xScale(rejectThreshold)}
                  height={histogramChart.height}
                  fill="#999"
                  opacity={0.1}
                />
                {/* Green zone: select threshold to right edge */}
                <rect
                  x={histogramChart.xScale(selectThreshold)}
                  y={0}
                  width={histogramChart.width - histogramChart.xScale(selectThreshold)}
                  height={histogramChart.height}
                  fill="#4caf50"
                  opacity={0.1}
                />

                {/* Histogram bars */}
                {bars.map((bar, i) => (
                  <rect
                    key={i}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    fill={bar.color === 'green' ? '#4caf50' : '#f44336'}
                    opacity={0.7}
                  />
                ))}

                {/* Center line at 0 */}
                <line
                  x1={histogramChart.xScale(0)}
                  y1={0}
                  x2={histogramChart.xScale(0)}
                  y2={histogramChart.height}
                  stroke="#ff9800"
                  strokeWidth={2}
                  strokeDasharray="4,4"
                  opacity={0.7}
                />
                {/* Label for 0 line */}
                <text
                  x={histogramChart.xScale(0)}
                  y={-5}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#ff9800"
                  fontWeight="bold"
                >
                  0
                </text>

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

                {/* Two threshold handles (reject and select) */}
                <ThresholdHandles
                  orientation="horizontal"
                  bounds={{
                    min: 0,
                    max: histogramChart.width
                  }}
                  thresholds={[rejectThreshold, selectThreshold]}
                  metricRange={{
                    min: histogramChart.xScale.domain()[0],  // Use symmetric domain
                    max: histogramChart.xScale.domain()[1]
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
                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>selected</span>, {tagCounts.rejected} as{' '}
                <span style={{ color: '#f44336', fontWeight: 'bold' }}>rejected</span>, {tagCounts.untagged} will remain{' '}
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
