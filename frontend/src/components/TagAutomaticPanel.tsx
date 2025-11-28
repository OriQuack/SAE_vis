import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  calculateHistogramLayout,
  calculateCategoryStackedBars,
  calculateXAxisTicks,
  calculateYAxisTicks
} from '../lib/histogram-utils'
import type { CategoryCounts } from '../lib/histogram-utils'
import { getSelectionColors } from '../lib/color-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_FEATURE_SPLITTING } from '../lib/constants'
import { isPairInSelection } from '../lib/pairUtils'
import ThresholdHandles from './ThresholdHandles'
import '../styles/TagAutomaticPanel.css'

// ============================================================================
// SPACING CONSTANTS - Single source of truth for all margins/paddings
// ============================================================================
const TAG_HISTOGRAM_SPACING = {
  svg: {
    // Fixed margins that always accommodate labels (no complex calculations needed)
    margin: { top: 30, right: 30, bottom: -80, left: 30 },
    // Label offsets (relative to chart area)
    xLabelOffset: 40,   // Distance below chart for x-axis label
    yLabelOffset: -40,  // Distance left of chart for y-axis label
    xTickOffset: 18     // Distance below chart for x-axis tick labels
  }
}

interface TagAutomaticPanelProps {
  mode: 'feature' | 'pair'
  availablePairs?: Array<{pairKey: string, mainFeatureId: number, similarFeatureId: number}>  // Cluster-based pairs (single source of truth)
  filteredFeatureIds?: Set<number>  // Selected feature IDs from Sankey segment
  threshold?: number  // Clustering threshold from Sankey (required for simplified flow)
}

const TagAutomaticPanel: React.FC<TagAutomaticPanelProps> = ({
  mode,
  availablePairs,
  filteredFeatureIds,
  threshold
}) => {
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const updateBothSimilarityThresholds = useVisualizationStore(state => state.updateBothSimilarityThresholds)
  const fetchSimilarityHistogram = useVisualizationStore(state => state.fetchSimilarityHistogram)
  const setDraggingThreshold = useVisualizationStore(state => state.setDraggingThreshold)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)

  // Get mode-specific colors
  const modeColors = useMemo(() => getSelectionColors(mode), [mode])

  const svgRef = useRef<SVGSVGElement>(null)

  const [containerSize, setContainerSize] = useState({ width: 800, height: 300 })
  // Initialize thresholds from store if available, otherwise use defaults
  const [thresholds, setThresholds] = useState(() => ({
    select: tagAutomaticState?.selectThreshold ?? 0.1,
    reject: tagAutomaticState?.rejectThreshold ?? -0.1
  }))
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [isLocalLoading, setIsLocalLoading] = useState(false)
  const [localHistogramData, setLocalHistogramData] = useState<any>(null)

  // Get histogram data from store (if available) or local state
  const histogramData = tagAutomaticState?.histogramData || localHistogramData
  const isLoading = tagAutomaticState?.isLoading || isLocalLoading

  // Calculate selection counts for current mode
  const selectionCounts = useMemo(() => {
    if (mode === 'pair') {
      let selectedCount = 0
      let rejectedCount = 0
      pairSelectionStates.forEach((state, _) => {
        if (state === 'selected') selectedCount++
        else if (state === 'rejected') rejectedCount++
      })
      return { selectedCount, rejectedCount }
    }
    return { selectedCount: 0, rejectedCount: 0 }
  }, [mode, pairSelectionStates])

  // Sync local thresholds with store state when store changes
  // This ensures user-adjusted thresholds are preserved after histogram refetch
  useEffect(() => {
    if (tagAutomaticState?.selectThreshold !== undefined && tagAutomaticState?.rejectThreshold !== undefined) {
      setThresholds(prev => {
        // Only update if values are different to avoid unnecessary re-renders
        if (prev.select !== tagAutomaticState.selectThreshold || prev.reject !== tagAutomaticState.rejectThreshold) {
          return {
            select: tagAutomaticState.selectThreshold,
            reject: tagAutomaticState.rejectThreshold
          }
        }
        return prev
      })
    }
  }, [tagAutomaticState?.selectThreshold, tagAutomaticState?.rejectThreshold])

  // Measure SVG size directly (SVG fills container via CSS)
  useEffect(() => {
    if (!svgRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        // SVG size = container size (100% width/height from CSS)
        setContainerSize({
          width: Math.max(400, width),
          height: Math.max(200, height)
        })
      }
    })

    resizeObserver.observe(svgRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Fetch histogram data when component mounts or selection changes
  useEffect(() => {
    // Only fetch for pair mode (feature mode not yet implemented)
    if (mode !== 'pair') return

    // Debounce the fetch to avoid excessive API calls
    const timeoutId = setTimeout(async () => {
      // Need at least 1 selected and 1 rejected for meaningful histogram
      if (selectionCounts.selectedCount < 1 || selectionCounts.rejectedCount < 1) {
        // Clear histogram if insufficient data
        setLocalHistogramData(null)
        return
      }

      console.log('[TagAutomaticPanel] Fetching histogram - features:', filteredFeatureIds?.size || 0, ', threshold:', threshold ?? 0.5, ', counts:', selectionCounts)
      setIsLocalLoading(true)
      try {
        // Pass selected feature IDs AND threshold to fetch ALL cluster-based pairs from segment
        const result = await fetchSimilarityHistogram(filteredFeatureIds, threshold)
        if (result) {
          setLocalHistogramData(result.histogramData)
          // Update thresholds based on fetched data
          const newThresholds = {
            select: result.selectThreshold,
            reject: result.rejectThreshold
          }
          setThresholds(newThresholds)

          // IMPORTANT: Also update store state so FeatureSplitView can react to threshold changes
          updateBothSimilarityThresholds(newThresholds.select, newThresholds.reject)
        } else {
          setLocalHistogramData(null)
        }
      } catch (error) {
        console.error('[TagAutomaticPanel] Failed to fetch histogram:', error)
        setLocalHistogramData(null)
      } finally {
        setIsLocalLoading(false)
      }
    }, 0) // No debounce - fetch immediately

    return () => clearTimeout(timeoutId)
    // NOTE: selectionCounts and threshold excluded from deps to avoid extra re-fetches when values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectionCounts.selectedCount, selectionCounts.rejectedCount, fetchSimilarityHistogram, updateBothSimilarityThresholds, filteredFeatureIds])

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

    // Simple calculation: SVG size minus fixed margins = chart size
    const margin = TAG_HISTOGRAM_SPACING.svg.margin
    const chartWidth = containerSize.width - margin.left - margin.right
    const chartHeight = containerSize.height - margin.top - margin.bottom

    // Calculate histogram with chart dimensions
    const layout = calculateHistogramLayout(histogramDataMap, chartWidth, chartHeight)
    const chart = layout.charts[0]

    // Return chart with our fixed margins
    return {
      ...chart,
      margin
    }
  }, [histogramData, containerSize])

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
        confirmed: 0, expanded: 0, rejected: 0, autoRejected: 0, unsure: 0
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
        // Pair mode - only count pairs that are in selection
        // FILTER: Skip pairs not in availablePairs or filteredFeatureIds
        if (availablePairs) {
          // If availablePairs provided, only count pairs in the list
          const pairExists = availablePairs.some(p => p.pairKey === id)
          if (!pairExists) return
        } else if (filteredFeatureIds) {
          // Otherwise, check if both features in pair are in filteredFeatureIds
          if (!isPairInSelection(id, filteredFeatureIds)) return
        }

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
  }, [histogramChart, histogramData, mode, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, availablePairs, filteredFeatureIds])

  // Calculate stacked category bars
  const categoryBars = useMemo(() => {
    if (!histogramChart || categoryData.size === 0) return []

    return calculateCategoryStackedBars(histogramChart, categoryData, modeColors)
  }, [histogramChart, categoryData, modeColors])

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

  // Threshold update callback for dual thresholds (called on drag end)
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

  // Live threshold update during drag (for real-time stripe pattern updates)
  const handleThresholdDragUpdate = useCallback((newThresholds: number[]) => {
    if (newThresholds.length !== 2) return

    const newReject = newThresholds[0]
    const newSelect = newThresholds[1]

    // Update local state for immediate visual feedback
    setThresholds({ reject: newReject, select: newSelect })

    // Update store for real-time stripe pattern updates in SelectionPanel/FeatureSplitView
    updateBothSimilarityThresholds(newSelect, newReject)
  }, [updateBothSimilarityThresholds])

  // Drag start/end callbacks to prevent rapid fetches
  const handleDragStart = useCallback(() => {
    setDraggingThreshold(true)
  }, [setDraggingThreshold])

  const handleDragEnd = useCallback(() => {
    setDraggingThreshold(false)
  }, [setDraggingThreshold])

  // Show empty state with helpful message
  if (!histogramData && !isLoading) {
    // Get tag colors for highlighting
    const fragmentedColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#F0E442'
    const monosemanticColor = getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || '#D3D3D3'

    return (
      <div className="tag-automatic-panel tag-automatic-panel--empty">
        <div className="tag-panel__empty-message">
          <div className="tag-panel__main-instruction">
            {mode === 'pair' ? (
              <>
                Select at least 1
                <span className="tag-panel__tag-badge" style={{ backgroundColor: fragmentedColor }}>
                  Fragmented
                </span>
                and 1
                <span className="tag-panel__tag-badge" style={{ backgroundColor: monosemanticColor }}>
                  Monosemantic
                </span>
                pair to enable automatic tagging
              </>
            ) : (
              'Select features to enable automatic tagging'
            )}
          </div>
          {mode === 'pair' && (
            <div className="tag-panel__sub-description">
              Currently Selected:
              <span className="tag-panel__count-badge" style={{ backgroundColor: fragmentedColor }}>
                {selectionCounts.selectedCount} Fragmented
              </span>
              <span className="tag-panel__count-badge" style={{ backgroundColor: monosemanticColor }}>
                {selectionCounts.rejectedCount} Monosemantic
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="tag-automatic-panel">
      <div className="tag-panel__content">
        {/* Histogram container - always rendered if we have data, dimmed when loading */}
        {histogramChart ? (
            <div className={`tag-panel__histogram-container ${isLoading ? 'tag-panel__histogram-container--loading' : ''}`}>
              {/* Loading overlay - shown on top of dimmed histogram */}
              {isLoading && (
                <div className="tag-panel__loading-overlay">
                  <div className="spinner" />
                  <span>Updating...</span>
                </div>
              )}
              <svg
                ref={svgRef}
                className="tag-panel__svg"
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
                    <rect width="4" height="8" fill={modeColors.expanded} opacity={0.3} />
                  </pattern>
                  <pattern
                    id="autoRejectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width="8"
                    height="8"
                    patternTransform="rotate(45)"
                  >
                    <rect width="4" height="8" fill={modeColors.autoRejected} opacity={0.3} />
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
                  {/* Zone 3: 0 to select threshold (grey, unsure - same as zone 2) */}
                  <rect
                    x={histogramChart.xScale(0)}
                    y={0}
                    width={Math.max(0, safeThresholdPositions.selectX - histogramChart.xScale(0))}
                    height={histogramChart.height}
                    fill="#999"
                    opacity={0.1}
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
                        <text x={0} y={-46} textAnchor="middle" fontSize={9} fill={modeColors.confirmed}>
                          Confirmed: {counts.confirmed}
                        </text>
                        <text x={0} y={-36} textAnchor="middle" fontSize={9} fill={modeColors.expanded}>
                          Expanded: {counts.expanded}
                        </text>
                        <text x={0} y={-26} textAnchor="middle" fontSize={9} fill={modeColors.rejected}>
                          Rejected: {counts.rejected}
                        </text>
                        <text x={0} y={-16} textAnchor="middle" fontSize={9} fill={modeColors.autoRejected}>
                          Auto-Rejected: {counts.autoRejected}
                        </text>
                        <text x={0} y={-6} textAnchor="middle" fontSize={9} fill={modeColors.unsure}>
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
                        y={histogramChart.height + TAG_HISTOGRAM_SPACING.svg.xTickOffset}
                        textAnchor="middle"
                        fontSize={12}
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
                        fontSize={12}
                        fill="#666"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}

                  {/* Axis labels */}
                  <text
                    x={histogramChart.width / 2}
                    y={histogramChart.height + TAG_HISTOGRAM_SPACING.svg.xLabelOffset}
                    textAnchor="middle"
                    fontSize={14}
                    fill="#666"
                  >
                    Decision Margin
                  </text>
                  <text
                    x={-histogramChart.height / 2}
                    y={TAG_HISTOGRAM_SPACING.svg.yLabelOffset}
                    textAnchor="middle"
                    fontSize={14}
                    fill="#666"
                    transform={`rotate(-90, ${-histogramChart.height / 2}, ${TAG_HISTOGRAM_SPACING.svg.yLabelOffset})`}
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
                    onDragUpdate={handleThresholdDragUpdate}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />

                  {/* Threshold labels with arrows */}
                  <g>
                    {/* Left threshold: Monosemantic (rejected) - colored arrow + black text */}
                    <text
                      x={safeThresholdPositions.rejectX}
                      y={-8}
                      textAnchor="end"
                      fontSize={14}
                      fontWeight={600}
                      fill="#272121ff"
                    >
                      <tspan fill={modeColors.rejected} fontSize={16}>← </tspan>
                      <tspan>Monosemantic</tspan>
                    </text>
                  </g>
                  <g>
                    {/* Right threshold: Fragmented (selected) - black text + colored arrow */}
                    <text
                      x={safeThresholdPositions.selectX}
                      y={-8}
                      textAnchor="start"
                      fontSize={14}
                      fontWeight={600}
                      fill="#000000"
                    >
                      <tspan>Fragmented </tspan>
                      <tspan fill={modeColors.confirmed} fontSize={16}>→</tspan>
                    </text>
                  </g>
                </g>
              </svg>
            </div>
        ) : isLoading ? (
          /* Initial loading state - no previous data to show */
          <div className="tag-panel__loading">
            <div className="spinner" />
            <span>Calculating similarity scores...</span>
          </div>
        ) : (
          <div className="tag-panel__error">
            Failed to load histogram data
          </div>
        )}
      </div>
    </div>
  )
}

export default React.memo(TagAutomaticPanel)
