import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import { useResizeObserver } from '../lib/utils'
import {
  calculateHistogramLayout,
  calculateCategoryStackedBars,
  calculateXAxisTicks,
  calculateYAxisTicks
} from '../lib/histogram-utils'
import type { CategoryCounts } from '../lib/histogram-utils'
import { getSelectionColors, STRIPE_PATTERN } from '../lib/color-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_QUALITY } from '../lib/constants'
import { isPairInSelection } from '../lib/pairUtils'
import { isUserConfirmed } from '../lib/tagging-hooks/useCommitHistory'
import type { ActiveStage } from './StageAccordionList'
import * as api from '../api'
import ThresholdHandles from './ThresholdHandles'
import { Tooltip, formatCount } from './Tooltip'
import '../styles/DecisionMarginHistogram.css'

// ============================================================================
// SPACING CONSTANTS - Single source of truth for all margins/paddings
// ============================================================================
const TAG_HISTOGRAM_SPACING = {
  svg: {
    // Fixed margins that always accommodate labels (no complex calculations needed)
    // Label overflows into left panel space (SelectionPanel has unused area)
    margin: { top: 30, right: 4, bottom: 40, left: 25 },
    // Label offsets (relative to chart area)
    xLabelOffset: 34,   // Distance below chart for x-axis label
    yLabelOffset: -30,  // Distance left of chart for y-axis label
    xTickOffset: 18     // Distance below chart for x-axis tick labels
  }
}

// Label width estimation for threshold labels
const LABEL_CHAR_WIDTH = 8   // Approximate width per character at 14px font
const ARROW_WIDTH = 16       // Arrow symbol width
const LABEL_PADDING = 4      // Small buffer from edge

interface DecisionMarginHistogramProps {
  mode: 'feature' | 'pair'
  availablePairs?: Array<{pairKey: string, mainFeatureId: number, similarFeatureId: number}>  // Cluster-based pairs (single source of truth)
  filteredFeatureIds?: Set<number>  // Selected feature IDs from Sankey segment
  threshold?: number  // Clustering threshold from Sankey (required for simplified flow)
  activeStage?: ActiveStage  // Controls threshold handle visibility (shown only in 'apply' phase)
}

const DecisionMarginHistogram: React.FC<DecisionMarginHistogramProps> = ({
  mode,
  availablePairs,
  filteredFeatureIds,
  threshold,
  activeStage
}) => {
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const updateBothSimilarityThresholds = useVisualizationStore(state => state.updateBothSimilarityThresholds)
  const setTagAutomaticHistogramData = useVisualizationStore(state => state.setTagAutomaticHistogramData)
  const fetchSimilarityHistogram = useVisualizationStore(state => state.fetchSimilarityHistogram)
  // Stage 1 revisiting state - used to skip histogram clearing when returning to Stage 1
  const isRevisitingStage1 = useVisualizationStore(state => state.isRevisitingStage1)
  const stage1FinalCommit = useVisualizationStore(state => state.stage1FinalCommit)
  const clearTagAutomaticHistogram = useVisualizationStore(state => state.clearTagAutomaticHistogram)
  const setDraggingThreshold = useVisualizationStore(state => state.setDraggingThreshold)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)

  // Get mode-specific colors (map mode to stage: 'pair' -> 'stage1', 'feature' -> 'stage2')
  const modeColors = useMemo(() => {
    const stage = mode === 'pair' ? 'stage1' : 'stage2'
    return getSelectionColors(stage)
  }, [mode])

  // Get mode-specific labels for threshold display
  const modeLabels = useMemo(() => {
    if (mode === 'pair') {
      return { selected: 'Incoherent Splitting', rejected: 'Monosemantic' }
    } else {
      return { selected: 'Well-Explained', rejected: 'Need Revision' }
    }
  }, [mode])

  const svgRef = useRef<SVGSVGElement>(null)

  // Track last fetch signature to prevent duplicate fetches from cascading state updates
  const lastFetchSignatureRef = useRef<string>('')

  // Use resize observer for responsive sizing (same pattern as SankeyDiagram)
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 800,
    defaultHeight: 300,
    debounceMs: 16,  // ~60fps for smooth resizing
    debugId: 'tag-histogram'
  })
  // Initialize thresholds from store if available, otherwise use defaults
  const [thresholds, setThresholds] = useState(() => ({
    select: tagAutomaticState?.selectThreshold ?? 0.1,
    reject: tagAutomaticState?.rejectThreshold ?? -0.1
  }))
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [isLocalLoading, setIsLocalLoading] = useState(false)
  const [localHistogramData, setLocalHistogramData] = useState<any>(null)

  // Get histogram data from store (if available) or local state
  // IMPORTANT: Only use store histogram data if mode matches to avoid showing stale data from previous stage
  const storeHistogramData = tagAutomaticState?.mode === mode ? tagAutomaticState?.histogramData : null
  const histogramData = storeHistogramData || localHistogramData
  const isLoading = (tagAutomaticState?.mode === mode && tagAutomaticState?.isLoading) || isLocalLoading

  // Calculate selection counts for current mode (manual selections only for SVM training)
  // IMPORTANT: For pair mode, only count pairs that exist in availablePairs to avoid
  // using stale selection data from previous sessions with different clustering thresholds
  const selectionCounts = useMemo(() => {
    if (mode === 'pair') {
      let selectedCount = 0
      let rejectedCount = 0

      // Create a set of available pair keys for efficient lookup
      const availablePairKeys = availablePairs
        ? new Set(availablePairs.map(p => p.pairKey))
        : null

      pairSelectionStates.forEach((state, pairKey) => {
        // Only count pairs that exist in the current available pairs list
        // This prevents counting stale selections from previous clustering thresholds
        if (availablePairKeys && !availablePairKeys.has(pairKey)) return

        const source = pairSelectionSources.get(pairKey)
        // Only count user-confirmed selections (click/threshold) for training
        if (isUserConfirmed(source)) {
          if (state === 'selected') selectedCount++
          else if (state === 'rejected') rejectedCount++
        }
      })
      return { selectedCount, rejectedCount }
    } else {
      // Feature mode
      let selectedCount = 0
      let rejectedCount = 0
      featureSelectionStates.forEach((state, featureId) => {
        // Only count features in the filtered set
        if (filteredFeatureIds && !filteredFeatureIds.has(featureId)) return
        const source = featureSelectionSources.get(featureId)
        // Only count user-confirmed selections (click/threshold) for training
        if (isUserConfirmed(source)) {
          if (state === 'selected') selectedCount++
          else if (state === 'rejected') rejectedCount++
        }
      })
      return { selectedCount, rejectedCount }
    }
  }, [mode, pairSelectionStates, pairSelectionSources, featureSelectionStates, featureSelectionSources, filteredFeatureIds, availablePairs])

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

  // Fetch histogram data when component mounts or selection changes
  useEffect(() => {
    // Debounce the fetch to avoid excessive API calls
    const timeoutId = setTimeout(async () => {
      // Skip histogram fetch/clear when revisiting Stage 1 with saved histogram state
      // This prevents overwriting the restored histogram while cluster pairs are being restored
      if (mode === 'pair' && isRevisitingStage1 && stage1FinalCommit?.histogramState) {
        return
      }

      // Need at least 3 selected and 3 rejected for meaningful histogram
      if (selectionCounts.selectedCount < 3 || selectionCounts.rejectedCount < 3) {
        // Clear histogram from both local state and store
        setLocalHistogramData(null)
        clearTagAutomaticHistogram()
        lastFetchSignatureRef.current = ''  // Reset signature when cleared
        return
      }

      // Compute signature based on fetch parameters to prevent duplicate fetches
      // This handles cascading state updates (e.g., pairSelectionStates → stage1FinalCommit)
      const fetchSignature = mode === 'pair'
        ? `pair:${selectionCounts.selectedCount}:${selectionCounts.rejectedCount}:${filteredFeatureIds?.size || 0}:${threshold}`
        : `feature:${selectionCounts.selectedCount}:${selectionCounts.rejectedCount}:${filteredFeatureIds?.size || 0}`

      // Skip if we already fetched with these exact parameters
      if (fetchSignature === lastFetchSignatureRef.current) {
        return
      }

      lastFetchSignatureRef.current = fetchSignature
      setIsLocalLoading(true)

      try {
        if (mode === 'pair') {
          // Pair mode: Use existing fetchSimilarityHistogram from store
          const result = await fetchSimilarityHistogram(filteredFeatureIds, threshold)
          if (result) {
            setLocalHistogramData(result.histogramData)
            const newThresholds = {
              select: result.selectThreshold,
              reject: result.rejectThreshold
            }
            setThresholds(newThresholds)
            updateBothSimilarityThresholds(newThresholds.select, newThresholds.reject)
          } else {
            setLocalHistogramData(null)
          }
        } else {
          // Feature mode: Call API directly for feature similarity histogram
          // Extract selected and rejected feature items with sources
          const selectedItems: { id: number; source: 'click' | 'threshold' }[] = []
          const rejectedItems: { id: number; source: 'click' | 'threshold' }[] = []
          const allFeatureIds: number[] = []

          featureSelectionStates.forEach((state, featureId) => {
            if (filteredFeatureIds && !filteredFeatureIds.has(featureId)) return
            const source = featureSelectionSources.get(featureId)
            if (isUserConfirmed(source)) {
              const weightedSource = source === 'click' ? 'click' : 'threshold' as const
              if (state === 'selected') selectedItems.push({ id: featureId, source: weightedSource })
              else if (state === 'rejected') rejectedItems.push({ id: featureId, source: weightedSource })
            }
          })

          // Get all feature IDs to score
          if (filteredFeatureIds) {
            filteredFeatureIds.forEach(id => allFeatureIds.push(id))
          }

          // Call API
          const histogramResponse = await api.getSimilarityScoreHistogram(
            selectedItems,
            rejectedItems,
            allFeatureIds
          )

          if (histogramResponse) {
            setLocalHistogramData(histogramResponse)
            // Calculate dynamic thresholds based on data range
            const { statistics } = histogramResponse
            const maxAbsValue = Math.max(
              Math.abs(statistics.min || 0),
              Math.abs(statistics.max || 0)
            )
            const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
            const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

            setThresholds({ select: selectThreshold, reject: rejectThreshold })
            // Update store's tagAutomaticState so SelectionPanel can show preview
            setTagAutomaticHistogramData(histogramResponse, selectThreshold, rejectThreshold)
          } else {
            setLocalHistogramData(null)
          }
        }
      } catch (error) {
        console.error('[DecisionMarginHistogram] Failed to fetch histogram:', error)
        setLocalHistogramData(null)
      } finally {
        setIsLocalLoading(false)
      }
    }, 0) // No debounce - fetch immediately

    return () => clearTimeout(timeoutId)
    // Note: selectionCounts object excluded - we use the specific count values to avoid unnecessary refetches
  }, [mode, selectionCounts.selectedCount, selectionCounts.rejectedCount, threshold, fetchSimilarityHistogram, updateBothSimilarityThresholds, setTagAutomaticHistogramData, clearTagAutomaticHistogram, filteredFeatureIds, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources, isRevisitingStage1, stage1FinalCommit])

  // Calculate histogram layout and bars
  const histogramChart = useMemo(() => {
    if (!histogramData) return null

    // Get the actual data range from bin_edges
    const binEdges = histogramData.histogram.bin_edges
    const dataMin = binEdges[0]
    const dataMax = binEdges[binEdges.length - 1]

    // Extend domain to include 0 (decision boundary) while preserving bin_edges
    // This ensures: 1) bars are sized correctly, 2) center line at 0 is visible
    const domainMin = Math.min(dataMin, 0)
    const domainMax = Math.max(dataMax, 0)

    // Create histogram data with extended domain but original bin_edges
    const extendedHistogramData = {
      ...histogramData,
      statistics: {
        ...histogramData.statistics,
        min: domainMin,
        max: domainMax
      }
    }

    const histogramDataMap = {
      similarity: extendedHistogramData
    }

    // Pass full container size and custom margin to calculateHistogramLayout
    // Apply minimum sizes to ensure chart remains usable
    const margin = TAG_HISTOGRAM_SPACING.svg.margin
    const width = Math.max(400, containerSize.width)
    const height = Math.max(200, containerSize.height)

    // Calculate histogram with container dimensions and custom margin
    const layout = calculateHistogramLayout(histogramDataMap, width, height, margin)
    const chart = layout.charts[0]

    return chart
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
        confirmed: 0, autoSelected: 0, rejected: 0, autoRejected: 0, unsure: 0
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
          if (source === 'predicted') {
            counts.autoSelected++
          } else {
            counts.confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'predicted') {
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
          if (source === 'predicted') {
            counts.autoSelected++
          } else {
            counts.confirmed++
          }
        } else if (selectionState === 'rejected') {
          if (source === 'predicted') {
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

  // Calculate shifted label positions to prevent overflow at chart boundaries
  const labelPositions = useMemo(() => {
    if (!histogramChart) return { leftX: 0, rightX: 0 }

    const chartWidth = histogramChart.width

    // Estimate label widths based on text content
    const leftLabelWidth = modeLabels.rejected.length * LABEL_CHAR_WIDTH + ARROW_WIDTH
    const rightLabelWidth = modeLabels.selected.length * LABEL_CHAR_WIDTH + ARROW_WIDTH

    // Left label: anchor=end, extends leftward from position
    // Shift right if label would extend past left boundary
    const leftX = Math.max(leftLabelWidth + LABEL_PADDING, safeThresholdPositions.rejectX)

    // Right label: anchor=start, extends rightward from position
    // Shift left if label would extend past right boundary
    const rightX = Math.min(chartWidth - rightLabelWidth - LABEL_PADDING, safeThresholdPositions.selectX)

    return { leftX, rightX }
  }, [histogramChart, modeLabels, safeThresholdPositions])

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

  // Show empty state with helpful message and cold-start suggestions
  if (!histogramData && !isLoading) {
    // Get tag colors for highlighting based on mode
    const selectedColor = mode === 'pair'
      ? (getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Incoherent Splitting') || '#F0E442')
      : (getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#4CAF50')
    const rejectedColor = mode === 'pair'
      ? (getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || '#D3D3D3')
      : (getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#FF9800')
    const selectedLabel = mode === 'pair' ? 'Incoherent Splitting' : 'Well-Explained'
    const rejectedLabel = mode === 'pair' ? 'Monosemantic' : 'Need Revision'
    const itemType = mode === 'pair' ? 'pairs' : 'features'

    return (
      <div className="tag-automatic-panel tag-automatic-panel--empty">
        <div className="tag-panel__empty-message">
          <div className="tag-panel__main-instruction">
            <span className="tag-panel__stage-number">1</span> Tag 3+ {itemType} in each category to see histogram.
          </div>
          <div className="tag-panel__progress-row">
            <span className="tag-panel__progress-item" style={{ backgroundColor: rejectedColor }}>
              {rejectedLabel}: {selectionCounts.rejectedCount}/3
            </span>
            <span className="tag-panel__progress-item" style={{ backgroundColor: selectedColor }}>
              {selectedLabel}: {selectionCounts.selectedCount}/3
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tag-automatic-panel">
      <div className="tag-panel__content">
        {/* Container is always rendered for accurate size measurement via ResizeObserver */}
        <div ref={containerRef} className={`tag-panel__histogram-container ${isLoading ? 'tag-panel__histogram-container--loading' : ''}`}>
          {histogramChart ? (
            <>
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
                width={containerSize.width}
                height={containerSize.height}
                style={{ overflow: 'visible' }}
              >
                {/* Define stripe patterns for preview */}
                {/* Note: SVG patternTransform uses opposite sign from CSS linear-gradient for same visual result */}
                <defs>
                  <pattern
                    id="autoSelectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width={STRIPE_PATTERN.width}
                    height={STRIPE_PATTERN.height}
                    patternTransform={`rotate(${-STRIPE_PATTERN.rotation})`}
                  >
                    <rect width={STRIPE_PATTERN.stripeWidth} height={STRIPE_PATTERN.height} fill={modeColors.autoSelected} opacity={STRIPE_PATTERN.opacity} />
                  </pattern>
                  <pattern
                    id="autoRejectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width={STRIPE_PATTERN.width}
                    height={STRIPE_PATTERN.height}
                    patternTransform={`rotate(${-STRIPE_PATTERN.rotation})`}
                  >
                    <rect width={STRIPE_PATTERN.stripeWidth} height={STRIPE_PATTERN.height} fill={modeColors.autoRejected} opacity={STRIPE_PATTERN.opacity} />
                  </pattern>
                </defs>

                <g transform={`translate(${histogramChart.margin.left}, ${histogramChart.margin.top})`}>
                  {/* Colored region backgrounds with 3 zones - only in apply phase */}
                  {activeStage === 'apply' && (
                    <>
                      {/* Zone 1: Left edge to reject threshold (auto-rejected stripe) */}
                      <rect
                        x={0}
                        y={0}
                        width={Math.max(0, safeThresholdPositions.rejectX)}
                        height={histogramChart.height}
                        fill="url(#autoRejectedPreviewStripe)"
                      />
                      {/* Zone 2: Reject threshold to select threshold (white, unsure) */}
                      <rect
                        x={safeThresholdPositions.rejectX}
                        y={0}
                        width={Math.max(0, safeThresholdPositions.selectX - safeThresholdPositions.rejectX)}
                        height={histogramChart.height}
                        fill="#ffffff"
                      />
                      {/* Zone 3: Select threshold to right edge (auto-selected stripe) */}
                      <rect
                        x={safeThresholdPositions.selectX}
                        y={0}
                        width={Math.max(0, histogramChart.width - safeThresholdPositions.selectX)}
                        height={histogramChart.height}
                        fill="url(#autoSelectedPreviewStripe)"
                      />
                    </>
                  )}

                  {/* Full-height hover hit areas for each bin */}
                  {histogramChart.bins.map((bin, binIndex) => {
                    const binX = histogramChart.xScale(bin.x0)
                    const binWidth = histogramChart.xScale(bin.x1) - binX
                    return (
                      <rect
                        key={`hit-area-${binIndex}`}
                        x={binX}
                        y={0}
                        width={binWidth}
                        height={histogramChart.height}
                        fill={hoveredBinIndex === binIndex ? 'rgba(0, 0, 0, 0.04)' : 'transparent'}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => {
                          setHoveredBinIndex(binIndex)
                          setTooltipPosition({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseMove={(e) => {
                          setTooltipPosition({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseLeave={() => {
                          setHoveredBinIndex(null)
                          setTooltipPosition(null)
                        }}
                      />
                    )
                  })}

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
                      onMouseEnter={(e) => {
                        setHoveredBinIndex(segment.binIndex)
                        setTooltipPosition({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseMove={(e) => {
                        setTooltipPosition({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseLeave={() => {
                        setHoveredBinIndex(null)
                        setTooltipPosition(null)
                      }}
                    />
                  ))}

                  {/* Flip markers - triangles above bins with flipped items */}
                  {tagAutomaticState?.flipTracking?.flippedBins && histogramChart.bins.map((bin, binIndex) => {
                    if (!tagAutomaticState.flipTracking!.flippedBins.has(binIndex)) return null

                    // Calculate bin center position
                    const binX = histogramChart.xScale(bin.x0)
                    const binX1 = histogramChart.xScale(bin.x1)
                    const binCenterX = (binX + binX1) / 2

                    // Find highest point of bar for this bin
                    const segmentsInBin = categoryBars.filter(s => s.binIndex === binIndex)
                    const maxY = segmentsInBin.length > 0
                      ? Math.min(...segmentsInBin.map(s => s.y))
                      : histogramChart.height

                    // Render triangle marker above bar
                    const markerY = Math.max(4, maxY - 8)
                    return (
                      <polygon
                        key={`flip-${binIndex}`}
                        points={`${binCenterX},${markerY} ${binCenterX - 5},${markerY - 8} ${binCenterX + 5},${markerY - 8}`}
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth={1}
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
                  {xAxisTicks.map((tick, i) => {
                    const isFirst = i === 0
                    const isLast = i === xAxisTicks.length - 1
                    return (
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
                          textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                          fontSize={12}
                          fill="#666"
                        >
                          {tick.label}
                        </text>
                      </g>
                    )
                  })}

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
                        {formatCount(tick.value)}
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
                    textAnchor="middle"
                    fontSize={14}
                    fill="#666"
                    transform={`translate(${TAG_HISTOGRAM_SPACING.svg.yLabelOffset}, ${histogramChart.height / 2}) rotate(-90)`}
                  >
                    Count
                  </text>

                  {/* Dual threshold handles + labels - only in apply phase */}
                  {activeStage === 'apply' && (
                    <>
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

                      {/* Threshold labels with arrows - positions shift to stay within bounds */}
                      <g>
                        {/* Left threshold: Rejected label - colored arrow + black text */}
                        <text
                          x={labelPositions.leftX}
                          y={-8}
                          textAnchor="end"
                          fontSize={14}
                          fontWeight={600}
                          fill="#272121ff"
                        >
                          <tspan fill={modeColors.rejected} fontSize={16}>← </tspan>
                          <tspan>{modeLabels.rejected}</tspan>
                        </text>
                      </g>
                      <g>
                        {/* Right threshold: Selected label - black text + colored arrow */}
                        <text
                          x={labelPositions.rightX}
                          y={-8}
                          textAnchor="start"
                          fontSize={14}
                          fontWeight={600}
                          fill="#000000"
                        >
                          <tspan>{modeLabels.selected} </tspan>
                          <tspan fill={modeColors.confirmed} fontSize={16}>→</tspan>
                        </text>
                      </g>
                    </>
                  )}
                </g>
              </svg>

              {/* HTML Tooltip at mouse position */}
              {hoveredBinIndex !== null && tooltipPosition && (() => {
                const bin = histogramChart.bins[hoveredBinIndex]
                const counts = categoryData.get(hoveredBinIndex)
                if (!bin || !counts) return null

                // Build legend items for non-zero counts with labels and striped flag
                const legendItems: Array<{ color: string; count: number; label: string; striped: boolean }> = []
                if (counts.confirmed > 0) legendItems.push({ color: modeColors.confirmed, count: counts.confirmed, label: modeLabels.selected, striped: false })
                if (counts.autoSelected > 0) legendItems.push({ color: modeColors.autoSelected, count: counts.autoSelected, label: modeLabels.selected, striped: true })
                if (counts.rejected > 0) legendItems.push({ color: modeColors.rejected, count: counts.rejected, label: modeLabels.rejected, striped: false })
                if (counts.autoRejected > 0) legendItems.push({ color: modeColors.autoRejected, count: counts.autoRejected, label: modeLabels.rejected, striped: true })
                if (counts.unsure > 0) legendItems.push({ color: modeColors.unsure, count: counts.unsure, label: 'Unsure', striped: false })

                const totalCount = counts.confirmed + counts.autoSelected + counts.rejected + counts.autoRejected + counts.unsure

                return (
                  <Tooltip position={tooltipPosition} offsetX={12} offsetY={-12}>
                    <Tooltip.Header>
                      {bin.x0.toFixed(2)} – {bin.x1.toFixed(2)}
                    </Tooltip.Header>
                    <Tooltip.Summary showSeparator={totalCount > 0}>
                      Total: {formatCount(totalCount)} {mode === 'pair' ? 'pairs' : 'features'}
                    </Tooltip.Summary>
                    {legendItems.map((item, idx) => (
                      <Tooltip.Row key={idx} color={item.color} striped={item.striped}>
                        {item.label}: {formatCount(item.count)}
                      </Tooltip.Row>
                    ))}
                  </Tooltip>
                )
              })()}
            </>
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
    </div>
  )
}

export default React.memo(DecisionMarginHistogram)
