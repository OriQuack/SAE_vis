import React, { useRef, useMemo, useCallback, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  calculateHistogramLayout,
  calculateCategoryStackedBars,
  calculateXAxisTicks,
  calculateYAxisTicks
} from '../lib/histogram-utils'
import { SELECTION_CATEGORY_COLORS } from '../lib/constants'
import SelectionStateBar, { type CategoryCounts } from './SelectionBar'
import ThresholdHandles from './ThresholdHandles'
import '../styles/TagAutomaticPanel.css'

interface TagAutomaticPanelProps {
  mode: 'feature' | 'pair'
}

const TagAutomaticPanel: React.FC<TagAutomaticPanelProps> = ({ mode }) => {
  const similarityTaggingPopover = useVisualizationStore(state => state.similarityTaggingPopover)
  const updateBothSimilarityThresholds = useVisualizationStore(state => state.updateBothSimilarityThresholds)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const hideThresholdsOnTable = useVisualizationStore(state => state.hideThresholdsOnTable)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)

  const svgRef = useRef<SVGSVGElement>(null)

  const [isMinimized, setIsMinimized] = useState(false)
  const [thresholds, setThresholds] = useState({ select: 0.1, reject: -0.1 })
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)

  // Get histogram data from store (if available)
  const histogramData = similarityTaggingPopover?.histogramData || null
  const isLoading = similarityTaggingPopover?.isLoading || false

  // Calculate histogram layout and bars with symmetric domain
  const histogramChart = useMemo(() => {
    if (!histogramData) return null

    const { statistics } = histogramData

    // Validate statistics - handle NaN or invalid values
    const minValue = isFinite(statistics.min) ? statistics.min : -1
    const maxValue = isFinite(statistics.max) ? statistics.max : 1

    // Calculate symmetric domain around zero for visual centering
    const maxAbsValue = Math.max(Math.abs(minValue), Math.abs(maxValue))

    // Ensure maxAbsValue is valid and non-zero
    const validMaxAbsValue = isFinite(maxAbsValue) && maxAbsValue > 0 ? maxAbsValue : 1

    // Create modified histogram data with symmetric domain
    const symmetricHistogramData = {
      ...histogramData,
      statistics: {
        ...statistics,
        min: -validMaxAbsValue,
        max: validMaxAbsValue
      }
    }

    const histogramDataMap = {
      similarity: symmetricHistogramData
    }

    const layout = calculateHistogramLayout(histogramDataMap, 900, 250)
    const chart = layout.charts[0]

    // Increase top margin to prevent "0" label cutoff
    return {
      ...chart,
      margin: { ...chart.margin, top: 20 }
    }
  }, [histogramData])

  // Compute category breakdown per bin
  const categoryData = useMemo(() => {
    if (!histogramChart || !histogramData?.scores) {
      return new Map<number, CategoryCounts>()
    }

    const categoryMap = new Map<number, CategoryCounts>()
    const scores = histogramData.scores
    const bins = histogramChart.bins

    // Initialize category counts for each bin
    bins.forEach((_, binIndex) => {
      return categoryMap.set(binIndex, {
        confirmed: 0, expanded: 0, rejected: 0, autoRejected: 0, unsure: 0,
        total: 0
      })
    })

    // Iterate through each feature/pair and assign to bins
    Object.entries(scores).forEach(([id, score]) => {
      if (typeof score !== 'number') return

      // Find which bin this score falls into
      const binIndex = bins.findIndex((bin) => score >= bin.x0 && score < bin.x1)
      // Handle edge case: score exactly equals the last bin's upper edge
      const lastBinIndex = bins.length - 1
      const adjustedBinIndex = binIndex === -1 && score === bins[lastBinIndex].x1 ? lastBinIndex : binIndex

      if (adjustedBinIndex === -1) return // Score out of range

      const counts = categoryMap.get(adjustedBinIndex)!

      // Determine category based on selection state and source
      if (mode === 'feature') {
        const featureId = parseInt(id, 10)
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            counts.expanded++
          } else {
            counts.confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'auto') {
            counts.autoRejected++
          } else {
            counts.rejected++
          }
        } else {
          counts.unsure++
        }
      } else {
        // Pair mode
        const selectionState = pairSelectionStates.get(id)
        const source = pairSelectionSources.get(id)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            counts.expanded++
          } else {
            counts.confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'auto') {
            counts.autoRejected++
          } else {
            counts.rejected++
          }
        } else {
          counts.unsure++
        }
      }
    })

    return categoryMap
  }, [histogramChart, histogramData, mode, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources])

  // Calculate stacked category bars
  const categoryBars = useMemo(() => {
    if (!histogramChart || categoryData.size === 0) return []

    const categoryColors = {
      confirmed: SELECTION_CATEGORY_COLORS.CONFIRMED.HEX,
      expanded: SELECTION_CATEGORY_COLORS.EXPANDED.HEX,
      rejected: SELECTION_CATEGORY_COLORS.REJECTED.HEX,
      autoRejected: SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX,
      unsure: SELECTION_CATEGORY_COLORS.UNSURE.HEX
    }

    return calculateCategoryStackedBars(histogramChart, categoryData, categoryColors)
  }, [histogramChart, categoryData])

  // Calculate current category counts for SelectionStateBar
  const currentCounts = useMemo((): CategoryCounts => {
    if (!histogramData?.scores) {
      return { confirmed: 0, expanded: 0, rejected: 0, autoRejected: 0, unsure: 0, total: 0 }
    }

    const scores = histogramData.scores
    let confirmed = 0
    let expanded = 0
    let rejected = 0
    let autoRejected = 0
    let unsure = 0

    Object.entries(scores).forEach(([id, score]) => {
      if (typeof score !== 'number') return

      if (mode === 'feature') {
        const featureId = parseInt(id, 10)
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'auto') {
            autoRejected++
          } else {
            rejected++
          }
        } else {
          unsure++
        }
      } else {
        const selectionState = pairSelectionStates.get(id)
        const source = pairSelectionSources.get(id)

        if (selectionState === 'selected') {
          if (source === 'auto') {
            expanded++
          } else {
            confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'auto') {
            autoRejected++
          } else {
            rejected++
          }
        } else {
          unsure++
        }
      }
    })

    const total = confirmed + expanded + rejected + autoRejected + unsure
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [histogramData, mode, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources])

  // Calculate preview counts after applying tags
  const previewCounts = useMemo((): CategoryCounts => {
    if (!histogramData?.scores) {
      return currentCounts
    }

    const scores = histogramData.scores
    let confirmed = currentCounts.confirmed
    let expanded = currentCounts.expanded
    let rejected = currentCounts.rejected
    let autoRejected = currentCounts.autoRejected
    let unsure = currentCounts.unsure

    // Calculate how many unsure items will become expanded or auto-rejected
    let newlyExpanded = 0
    let newlyAutoRejected = 0

    Object.entries(scores).forEach(([id, score]) => {
      if (typeof score !== 'number') return

      // Check current state
      const isAlreadyTagged = mode === 'feature'
        ? featureSelectionStates.has(parseInt(id, 10))
        : pairSelectionStates.has(id)

      // If not already tagged, apply auto-tagging based on thresholds
      if (!isAlreadyTagged) {
        if (score >= thresholds.select) {
          newlyExpanded++
        } else if (score <= thresholds.reject) {
          newlyAutoRejected++
        }
      }
    })

    // Update counts: unsure items become expanded or auto-rejected
    expanded += newlyExpanded
    autoRejected += newlyAutoRejected
    unsure -= (newlyExpanded + newlyAutoRejected)

    const total = confirmed + expanded + rejected + autoRejected + unsure
    return { confirmed, expanded, rejected, autoRejected, unsure, total }
  }, [currentCounts, histogramData, thresholds, mode, featureSelectionStates, pairSelectionStates])

  // Calculate axis ticks
  const xAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateXAxisTicks(histogramChart, 8)
  }, [histogramChart])

  const yAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateYAxisTicks(histogramChart, 5)
  }, [histogramChart])

  // Safe threshold positions and domain - clamp to valid range and handle NaN
  const safeThresholdPositions = useMemo(() => {
    if (!histogramChart) return { selectX: 0, rejectX: 0, minDomain: -1, maxDomain: 1 }

    // Get domain from xScale and validate
    const domain = histogramChart.xScale.domain()
    let minDomain = domain[0]
    let maxDomain = domain[1]

    // Validate domain values
    if (!isFinite(minDomain)) minDomain = -1
    if (!isFinite(maxDomain)) maxDomain = 1

    // Clamp thresholds to domain
    const clampedSelect = Math.max(minDomain, Math.min(maxDomain, thresholds.select))
    const clampedReject = Math.max(minDomain, Math.min(maxDomain, thresholds.reject))

    // Calculate positions
    let selectX = histogramChart.xScale(clampedSelect)
    let rejectX = histogramChart.xScale(clampedReject)

    // Validate and fallback to safe values
    if (!isFinite(selectX)) selectX = histogramChart.width
    if (!isFinite(rejectX)) rejectX = 0

    return { selectX, rejectX, minDomain, maxDomain }
  }, [histogramChart, thresholds])

  // Threshold update callback for dual thresholds
  const handleThresholdUpdate = useCallback((newThresholds: number[]) => {
    if (newThresholds.length !== 2) return

    const newReject = newThresholds[0]
    const newSelect = newThresholds[1]

    // Use functional update to ensure we have the latest state
    setThresholds(prev => {
      // Only update if values actually changed
      if (newReject !== prev.reject || newSelect !== prev.select) {
        updateBothSimilarityThresholds(newSelect, newReject)
        return { reject: newReject, select: newSelect }
      }
      return prev
    })
  }, [updateBothSimilarityThresholds])

  // Handle preview on table with loading state (not applicable for embedded panel - removed)
  // const handlePreviewOnTable = useCallback(async () => {
  //   setIsPreviewLoading(true)
  //   try {
  //     await showThresholdsOnTable()
  //   } finally {
  //     setIsPreviewLoading(false)
  //   }
  // }, [showThresholdsOnTable])

  // Handle apply tags
  const handleApplyTags = useCallback(() => {
    applySimilarityTags()
    hideThresholdsOnTable()
  }, [applySimilarityTags, hideThresholdsOnTable])

  // Handle reset thresholds
  const handleResetThresholds = useCallback(() => {
    setThresholds({ select: 0.1, reject: -0.1 })
    updateBothSimilarityThresholds(0.1, -0.1)
    hideThresholdsOnTable()
  }, [updateBothSimilarityThresholds, hideThresholdsOnTable])

  if (!histogramData) {
    return (
      <div className="tag-automatic-panel tag-automatic-panel--empty">
        <div className="tag-panel__header">
          <span className="tag-panel__title">Automatic Tagging - {mode === 'feature' ? 'Features' : 'Pairs'}</span>
        </div>
        <div className="tag-panel__empty-message">
          Click "Tag Automatically" to configure thresholds
        </div>
      </div>
    )
  }

  return (
    <div className={`tag-automatic-panel ${isMinimized ? 'tag-automatic-panel--minimized' : ''}`}>
      <div className="tag-panel__header">
        <span className="tag-panel__title">
          Automatic Tagging - {mode === 'feature' ? 'Features' : 'Pairs'}
        </span>
        <button
          className="tag-panel__minimize-button"
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {!isMinimized && (
        <div className="tag-panel__content">
          {isLoading ? (
            <div className="tag-panel__loading">
              <div className="spinner" />
              <span>Calculating similarity scores...</span>
            </div>
          ) : histogramChart ? (
            <>
              <div className="tag-panel__info">
                <p>
                  Drag the thresholds to tag {mode === 'feature' ? 'features' : 'pairs'} automatically.
                  Items <strong>above the right threshold (blue)</strong> will be tagged as <strong style={{ color: SELECTION_CATEGORY_COLORS.EXPANDED.HEX }}>Auto-Selected</strong>.
                  Items <strong>below the left threshold (red)</strong> will be tagged as <strong style={{ color: SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX }}>Auto-Rejected</strong>.
                </p>
              </div>

              <svg
                ref={svgRef}
                className="tag-panel__svg"
                width={900}
                height={260}
              >
                {/* Define stripe patterns for preview */}
                <defs>
                  <pattern
                    id="expandedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width="8"
                    height="8"
                    patternTransform="rotate(45)"
                  >
                    <rect width="4" height="8" fill={SELECTION_CATEGORY_COLORS.EXPANDED.HEX} opacity={0.3} />
                  </pattern>
                  <pattern
                    id="autoRejectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width="8"
                    height="8"
                    patternTransform="rotate(45)"
                  >
                    <rect width="4" height="8" fill={SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX} opacity={0.3} />
                  </pattern>
                </defs>

                <g transform={`translate(${histogramChart.margin.left}, ${histogramChart.margin.top})`}>
                  {/* Colored region backgrounds with 4 zones */}
                  {/* Zone 1: Left edge to reject threshold (light red stripe, auto-rejected preview) */}
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(0, safeThresholdPositions.rejectX)}
                    height={histogramChart.height}
                    fill="url(#autoRejectedPreviewStripe)"
                  />
                  {/* Zone 2: Reject threshold to 0 (grey, unsure) */}
                  <rect
                    x={safeThresholdPositions.rejectX}
                    y={0}
                    width={Math.max(0, histogramChart.xScale(0) - safeThresholdPositions.rejectX)}
                    height={histogramChart.height}
                    fill="#999"
                    opacity={0.1}
                  />
                  {/* Zone 3: 0 to select threshold (light grey, middle unsure) */}
                  <rect
                    x={histogramChart.xScale(0)}
                    y={0}
                    width={Math.max(0, safeThresholdPositions.selectX - histogramChart.xScale(0))}
                    height={histogramChart.height}
                    fill="#999"
                    opacity={0.05}
                  />
                  {/* Zone 4: Select threshold to right edge (blue stripe, auto-selected preview) */}
                  <rect
                    x={safeThresholdPositions.selectX}
                    y={0}
                    width={Math.max(0, histogramChart.width - safeThresholdPositions.selectX)}
                    height={histogramChart.height}
                    fill="url(#expandedPreviewStripe)"
                  />

                  {/* Stacked category bars */}
                  {categoryBars.map((segment, i) => (
                    <rect
                      key={i}
                      x={segment.x}
                      y={segment.y}
                      width={segment.width}
                      height={segment.height}
                      fill={segment.color}
                      stroke="none"
                      opacity={hoveredBinIndex === segment.binIndex ? 1 : 0.85}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredBinIndex(segment.binIndex)}
                      onMouseLeave={() => setHoveredBinIndex(null)}
                    />
                  ))}

                  {/* Tooltip for hovered bin */}
                  {hoveredBinIndex !== null && histogramChart && (() => {
                    const bin = histogramChart.bins[hoveredBinIndex]
                    const counts = categoryData.get(hoveredBinIndex)
                    if (!bin || !counts) return null

                    const total = counts.confirmed + counts.expanded + counts.rejected + counts.autoRejected + counts.unsure
                    const binX = histogramChart.xScale(bin.x0) as number
                    const binWidth = (histogramChart.xScale(bin.x1) as number) - binX

                    return (
                      <g transform={`translate(${binX + binWidth / 2}, ${-5})`}>
                        <rect
                          x={-90}
                          y={-75}
                          width={180}
                          height={70}
                          fill="#333"
                          opacity={0.95}
                          rx={4}
                        />
                        <text x={0} y={-58} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="bold">
                          Bin [{bin.x0.toFixed(2)} - {bin.x1.toFixed(2)}]
                        </text>
                        <text x={0} y={-46} textAnchor="middle" fontSize={9} fill={SELECTION_CATEGORY_COLORS.CONFIRMED.HEX}>
                          Confirmed: {counts.confirmed}
                        </text>
                        <text x={0} y={-36} textAnchor="middle" fontSize={9} fill={SELECTION_CATEGORY_COLORS.EXPANDED.HEX}>
                          Expanded: {counts.expanded}
                        </text>
                        <text x={0} y={-26} textAnchor="middle" fontSize={9} fill={SELECTION_CATEGORY_COLORS.REJECTED.HEX}>
                          Rejected: {counts.rejected}
                        </text>
                        <text x={0} y={-16} textAnchor="middle" fontSize={9} fill={SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX}>
                          Auto-Rejected: {counts.autoRejected}
                        </text>
                        <text x={0} y={-6} textAnchor="middle" fontSize={9} fill={SELECTION_CATEGORY_COLORS.UNSURE.HEX}>
                          Unsure: {counts.unsure}
                        </text>
                        <text x={0} y={-58 + 70} textAnchor="middle" fontSize={9} fill="#aaa">
                          Total: {total}
                        </text>
                      </g>
                    )
                  })()}

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

                  {/* Dual threshold handles for auto-rejection and auto-selection */}
                  <ThresholdHandles
                    orientation="horizontal"
                    bounds={{
                      min: 0,
                      max: histogramChart.width
                    }}
                    thresholds={[thresholds.reject, thresholds.select]}
                    metricRange={{
                      min: safeThresholdPositions.minDomain,
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

              {/* Selection State Bar with Preview */}
              <div className="tag-panel__state-bar">
                <SelectionStateBar
                  counts={currentCounts}
                  previewCounts={previewCounts}
                  showLabels={false}
                  showLegend={true}
                  height={24}
                />
              </div>

              <div className="tag-panel__actions">
                <button
                  className="tag-panel__button tag-panel__button--reset"
                  onClick={handleResetThresholds}
                >
                  Reset Thresholds
                </button>
                <button
                  className="tag-panel__button tag-panel__button--apply"
                  onClick={handleApplyTags}
                >
                  Apply Tags
                </button>
              </div>
            </>
          ) : (
            <div className="tag-panel__error">
              Failed to load histogram data
            </div>
          )}
        </div>
      )}

      {isMinimized && (
        <div className="tag-panel__minimized-summary">
          <SelectionStateBar
            counts={currentCounts}
            previewCounts={previewCounts}
            showLabels={true}
            showLegend={false}
            height={20}
          />
        </div>
      )}
    </div>
  )
}

export default React.memo(TagAutomaticPanel)
