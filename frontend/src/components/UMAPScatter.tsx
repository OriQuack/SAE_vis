import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import { polygonContains } from 'd3-polygon'
import { useVisualizationStore } from '../store/index'
import {
  getCauseColor,
  computeBarycentricScales,
  computeCategoryContours,
  getTrianglePathString,
  spreadBarycentricPoints,
  CONTOUR_CONFIG,
  type CauseCategory
} from '../lib/umap-utils'
import '../styles/UMAPScatter.css'

// ============================================================================
// UMAP SCATTER PLOT COMPONENT - HYBRID VISUALIZATION
// ============================================================================
// Displays 2D UMAP projection using:
// - Density contours per cause category (always visible)
// - Individual points on brush selection (reveal on demand)

interface UMAPScatterProps {
  featureIds: number[]
  width?: number
  height?: number
  className?: string
  selectedFeatureId?: number | null  // Feature to highlight with explainer positions
}

// Margin configuration
const MARGIN = { top: 10, right: 10, bottom: 10, left: 10 }

// Cause categories for decision space validation (3 categories)
const CAUSE_CATEGORIES = ['noisy-activation', 'missed-N-gram', 'missed-context']

const UMAPScatter: React.FC<UMAPScatterProps> = ({
  featureIds,
  width: propWidth,
  height: propHeight,
  className = '',
  selectedFeatureId = null
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Fixed width, flexible height
  const fixedWidth = propWidth || 400
  const [containerHeight, setContainerHeight] = useState(propHeight || 350)

  // ResizeObserver for flexible height
  useEffect(() => {
    // If fixed height provided, use that
    if (propHeight) {
      setContainerHeight(propHeight)
      return
    }

    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const { height } = entry.contentRect
        if (height > 0) {
          setContainerHeight(height)
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [propHeight])

  // Lasso state
  const [isDrawing, setIsDrawing] = useState(false)
  const [lassoPath, setLassoPath] = useState<[number, number][]>([])
  const justFinishedDrawing = useRef(false)
  const isDrawingRef = useRef(false)  // Ref for immediate access in handlers

  // Track previous featureIds to avoid unnecessary refetches
  const prevFeatureIdsRef = useRef<string>('')

  // Store state
  const umapProjection = useVisualizationStore(state => state.umapProjection)
  const umapLoading = useVisualizationStore(state => state.umapLoading)
  const umapError = useVisualizationStore(state => state.umapError)
  const umapBrushedFeatureIds = useVisualizationStore(state => state.umapBrushedFeatureIds)
  const fetchUmapProjection = useVisualizationStore(state => state.fetchUmapProjection)
  const fetchCauseClassification = useVisualizationStore(state => state.fetchCauseClassification)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const setUmapBrushedFeatureIds = useVisualizationStore(state => state.setUmapBrushedFeatureIds)
  const clearUmapProjection = useVisualizationStore(state => state.clearUmapProjection)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)

  // Check if all 3 categories have at least one manual tag (for SVM classification)
  const { canUseDecisionSpace, manualCauseSelections } = useMemo(() => {
    const manualTags = new Map<string, number>()
    const selections: Record<number, string> = {}

    causeSelectionStates.forEach((category: string, featureId: number) => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') {
        manualTags.set(category, (manualTags.get(category) || 0) + 1)
        selections[featureId] = category
      }
    })

    const missingCount = CAUSE_CATEGORIES.filter(cat => (manualTags.get(cat) || 0) < 1).length

    return {
      canUseDecisionSpace: missingCount === 0,
      manualCauseSelections: selections
    }
  }, [causeSelectionStates, causeSelectionSources])

  // Chart dimensions
  const chartWidth = fixedWidth - MARGIN.left - MARGIN.right
  const chartHeight = containerHeight - MARGIN.top - MARGIN.bottom

  // Track manual tags for refetch
  const prevManualTagsRef = useRef<string>('')

  // Fetch barycentric positions when feature IDs change
  useEffect(() => {
    const featureSignature = featureIds.length >= 3
      ? `${featureIds.length}:${featureIds.slice(0, 5).join(',')}`
      : ''

    const featureIdsChanged = featureSignature !== prevFeatureIdsRef.current
    prevFeatureIdsRef.current = featureSignature

    if (!featureIdsChanged) return

    if (featureIds.length < 3) {
      clearUmapProjection()
      return
    }

    // Always fetch barycentric positions (precomputed, no options needed)
    fetchUmapProjection(featureIds)
  }, [featureIds, fetchUmapProjection, clearUmapProjection])

  // Fetch SVM classification when manual tags change (separate from positions)
  useEffect(() => {
    const manualTagsSignature = Object.keys(manualCauseSelections).sort().join(',')
    const manualTagsChanged = manualTagsSignature !== prevManualTagsRef.current
    prevManualTagsRef.current = manualTagsSignature

    if (!manualTagsChanged) return

    // Only fetch classification when we have enough manual tags
    if (featureIds.length >= 3 && canUseDecisionSpace) {
      fetchCauseClassification(featureIds, manualCauseSelections)
    }
  }, [featureIds, canUseDecisionSpace, manualCauseSelections, fetchCauseClassification])

  // Compute D3 scales using fixed barycentric triangle bounds
  const scales = useMemo(() => {
    if (chartWidth <= 0 || chartHeight <= 0) {
      return null
    }
    return computeBarycentricScales(chartWidth, chartHeight)
  }, [chartWidth, chartHeight])

  // Generate triangle outline path
  const trianglePath = useMemo(() => {
    if (!scales) return ''
    return getTrianglePathString(scales)
  }, [scales])

  // Transform points to spread across triangle (uniform scaling from centroid)
  const spreadPoints = useMemo(() => {
    if (!umapProjection || umapProjection.length === 0) return null
    return spreadBarycentricPoints(umapProjection)
  }, [umapProjection])

  // Compute density contours per category (using spread points)
  const categoryContours = useMemo(() => {
    if (!spreadPoints || !scales || chartWidth <= 0 || chartHeight <= 0) {
      return []
    }
    return computeCategoryContours(
      spreadPoints,
      causeSelectionStates as Map<number, CauseCategory>,
      chartWidth,
      chartHeight,
      scales,
      15,  // bandwidth (smaller = more detail)
      10   // threshold levels (more = finer contours)
    )
  }, [spreadPoints, causeSelectionStates, chartWidth, chartHeight, scales])

  // Get mouse position relative to SVG
  const getMousePosition = useCallback((e: React.MouseEvent<SVGSVGElement>): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  // Lasso mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only respond to left mouse button
    if (e.button !== 0) return

    e.preventDefault()
    const pos = getMousePosition(e)
    isDrawingRef.current = true
    setIsDrawing(true)
    setLassoPath([pos])
    setUmapBrushedFeatureIds(new Set())
  }, [getMousePosition, setUmapBrushedFeatureIds])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Use ref for immediate check (avoids stale closure issues)
    if (!isDrawingRef.current) return

    const pos = getMousePosition(e)
    setLassoPath(prev => [...prev, pos])
  }, [getMousePosition])

  const handleMouseUp = useCallback(() => {
    // Use ref for immediate check
    if (!isDrawingRef.current) {
      return
    }

    isDrawingRef.current = false
    setIsDrawing(false)
    justFinishedDrawing.current = true

    if (!scales || !spreadPoints) {
      return
    }

    // Need at least 3 points to form a polygon
    if (lassoPath.length < 3) {
      setLassoPath([])
      return
    }

    // Find points inside the lasso polygon (using spread points for visual consistency)
    const selectedIds = new Set<number>()
    for (const point of spreadPoints) {
      const px = scales.xScale(point.x)
      const py = scales.yScale(point.y)
      if (polygonContains(lassoPath, [px, py])) {
        selectedIds.add(point.feature_id)
      }
    }

    setUmapBrushedFeatureIds(selectedIds)
    // Keep the lasso path visible after selection
  }, [lassoPath, scales, spreadPoints, setUmapBrushedFeatureIds])

  // Clear selection on click outside
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only respond to left mouse button
    if (e.button !== 0) return

    // Skip if we just finished drawing (click fires after mouseup)
    if (justFinishedDrawing.current) {
      justFinishedDrawing.current = false
      return
    }

    // Clear selection if there's an existing lasso
    if (lassoPath.length > 0) {
      setLassoPath([])
      setUmapBrushedFeatureIds(new Set())
    }
  }, [lassoPath, setUmapBrushedFeatureIds])

  // Convert lasso path to SVG path string
  const lassoPathString = useMemo(() => {
    if (lassoPath.length < 2) return ''
    const pathParts = lassoPath.map((p, i) =>
      i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`
    )
    if (!isDrawing && lassoPath.length >= 3) {
      pathParts.push('Z')  // Close the path when done drawing
    }
    return pathParts.join(' ')
  }, [lassoPath, isDrawing])

  // Get set of manually tagged feature IDs for rendering
  const manuallyTaggedIds = useMemo(() => {
    return new Set(Object.keys(manualCauseSelections).map(Number))
  }, [manualCauseSelections])

  // Draw points on canvas: manually tagged (always) + brushed (when brush active) + selected feature explainers
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !spreadPoints || !scales || chartWidth <= 0 || chartHeight <= 0) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Always clear canvas first
    ctx.clearRect(0, 0, chartWidth, chartHeight)

    // Point styling
    const manualPointRadius = 4
    const brushedPointRadius = 2.5
    const manualPointAlpha = 0.85
    const brushedPointAlpha = 0.4

    // Find the selected feature's point for explainer positions
    const selectedPoint = selectedFeatureId != null
      ? spreadPoints.find(p => p.feature_id === selectedFeatureId)
      : null

    // Draw manually tagged and brushed points
    for (const point of spreadPoints) {
      const isManual = manuallyTaggedIds.has(point.feature_id)
      const isBrushed = umapBrushedFeatureIds.has(point.feature_id)
      const isSelected = point.feature_id === selectedFeatureId

      // Skip if not in any set (selected feature drawn separately at end)
      if (!isManual && !isBrushed) continue
      // Skip selected feature here - will draw it last on top
      if (isSelected) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)
      const color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)

      if (isManual) {
        // Manual points are larger and more opaque with a ring
        ctx.beginPath()
        ctx.arc(cx, cy, manualPointRadius + 1.5, 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.9
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy, manualPointRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = manualPointAlpha
        ctx.fill()
      } else if (isBrushed) {
        // Brushed (non-manual) points are smaller
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = brushedPointAlpha
        ctx.fill()
      }
    }

    // Draw selected feature and its explainer positions LAST (on top of everything)
    if (selectedPoint) {
      const categoryColor = getCauseColor(selectedFeatureId!, causeSelectionStates as Map<number, CauseCategory>)
      const selectionBlue = '#3b82f6'  // Blue highlight for selection indicator
      const meanX = scales.xScale(selectedPoint.x)
      const meanY = scales.yScale(selectedPoint.y)

      // Draw explainer positions if available
      if (selectedPoint.explainer_positions && selectedPoint.explainer_positions.length > 0) {
        // Draw lines from mean to each explainer position (blue selection indicator)
        ctx.strokeStyle = selectionBlue
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.6
        ctx.setLineDash([4, 4])

        for (const ep of selectedPoint.explainer_positions) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)

          ctx.beginPath()
          ctx.moveTo(meanX, meanY)
          ctx.lineTo(epX, epY)
          ctx.stroke()
        }

        ctx.setLineDash([])

        // Draw explainer points (blue with white border)
        for (const ep of selectedPoint.explainer_positions) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)

          ctx.beginPath()
          ctx.arc(epX, epY, 4, 0, Math.PI * 2)
          ctx.fillStyle = selectionBlue
          ctx.globalAlpha = 1
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // Draw selected feature point (mean position) with blue highlight ring - LAST
      ctx.beginPath()
      ctx.arc(meanX, meanY, manualPointRadius + 4, 0, Math.PI * 2)
      ctx.strokeStyle = selectionBlue
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 1
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(meanX, meanY, manualPointRadius + 1, 0, Math.PI * 2)
      ctx.fillStyle = categoryColor  // Keep category color for the main point
      ctx.globalAlpha = 1
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Reset alpha
    ctx.globalAlpha = 1
  }, [spreadPoints, scales, causeSelectionStates, umapBrushedFeatureIds, manuallyTaggedIds, selectedFeatureId, chartWidth, chartHeight])


  // ============================================================================
  // RENDER
  // ============================================================================

  // Container style - fixed width, flexible height via CSS
  const containerStyle = propHeight
    ? { width: fixedWidth, height: propHeight }
    : { width: fixedWidth }

  // Loading state - only block on position loading, not classification
  // Classification loading shows as overlay indicator instead
  if (umapLoading) {
    return (
      <div ref={containerRef} className={`umap-scatter umap-scatter--loading ${className}`} style={containerStyle}>
        <div className="umap-scatter__message">
          <span className="umap-scatter__spinner" />
          <span>Loading positions...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (umapError) {
    return (
      <div ref={containerRef} className={`umap-scatter umap-scatter--error ${className}`} style={containerStyle}>
        <div className="umap-scatter__message umap-scatter__message--error">
          <span>{umapError}</span>
        </div>
      </div>
    )
  }

  // Empty state
  if (!spreadPoints || spreadPoints.length === 0 || !scales) {
    return (
      <div ref={containerRef} className={`umap-scatter umap-scatter--empty ${className}`} style={containerStyle}>
        <div className="umap-scatter__message">
          <span>No features to project</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`umap-scatter ${className}`} style={containerStyle}>
      {/* Chart area */}
      <div className="umap-scatter__chart">
        {/* SVG for contours + lasso */}
        <svg
          ref={svgRef}
          className="umap-scatter__svg"
          width={chartWidth}
          height={chartHeight}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        >
          {/* Triangle outline */}
          {trianglePath && (
            <path
              d={trianglePath}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={1.5}
              className="umap-scatter__triangle-outline"
            />
          )}

          {/* Density contours per category */}
          <g className="umap-scatter__contours">
            {categoryContours.map(({ category, color, paths }) => (
              <g key={category} className={`umap-scatter__contour-group umap-scatter__contour-group--${category}`}>
                {paths.map((path, i) => {
                  // Outer contours are more transparent
                  const levelOpacity = CONTOUR_CONFIG.levelOpacities[
                    Math.min(i, CONTOUR_CONFIG.levelOpacities.length - 1)
                  ]
                  return (
                    <path
                      key={i}
                      d={path}
                      fill={color}
                      fillOpacity={CONTOUR_CONFIG.fillOpacity * levelOpacity}
                      stroke={color}
                      strokeOpacity={CONTOUR_CONFIG.strokeOpacity * levelOpacity}
                      strokeWidth={CONTOUR_CONFIG.strokeWidth}
                    />
                  )
                })}
              </g>
            ))}
          </g>

          {/* Lasso selection path */}
          {lassoPathString && (
            <>
              {/* Outer glow/shadow */}
              <path
                d={lassoPathString}
                className="umap-scatter__lasso-shadow"
                fill="none"
                stroke="rgba(0, 0, 0, 0.15)"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Main lasso line */}
              <path
                d={lassoPathString}
                className="umap-scatter__lasso"
                fill={isDrawing ? 'none' : 'rgba(59, 130, 246, 0.08)'}
                stroke={isDrawing ? '#3b82f6' : '#2563eb'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={isDrawing ? '6,4' : 'none'}
              />
              {/* Inner highlight (when completed) */}
              {!isDrawing && (
                <path
                  d={lassoPathString}
                  className="umap-scatter__lasso-inner"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.6)"
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </>
          )}
        </svg>

        {/* Canvas for brushed points (overlays SVG) */}
        <canvas
          ref={canvasRef}
          width={chartWidth}
          height={chartHeight}
          className="umap-scatter__canvas"
        />
      </div>

      {/* Classification loading indicator (subtle overlay) */}
      {causeClassificationLoading && (
        <div className="umap-scatter__classification-loading">
          <span className="umap-scatter__spinner umap-scatter__spinner--small" />
          <span>Updating...</span>
        </div>
      )}

      {/* Selection count */}
      {umapBrushedFeatureIds.size > 0 && (
        <div className="umap-scatter__selection-count">
          {umapBrushedFeatureIds.size} features selected
        </div>
      )}
    </div>
  )
}

export default React.memo(UMAPScatter)
