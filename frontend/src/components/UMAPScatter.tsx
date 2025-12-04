import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import { polygonContains } from 'd3-polygon'
import { useVisualizationStore } from '../store/index'
import {
  getCauseColor,
  getCauseCategoryLegend,
  computeUmapScales,
  computeCategoryContours,
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
}

// Margin configuration
const MARGIN = { top: 10, right: 10, bottom: 10, left: 10 }

const UMAPScatter: React.FC<UMAPScatterProps> = ({
  featureIds,
  width: propWidth = 400,
  height: propHeight = 350,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

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
  const setUmapBrushedFeatureIds = useVisualizationStore(state => state.setUmapBrushedFeatureIds)
  const clearUmapProjection = useVisualizationStore(state => state.clearUmapProjection)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)

  // Chart dimensions from props
  const chartWidth = propWidth - MARGIN.left - MARGIN.right
  const chartHeight = propHeight - MARGIN.top - MARGIN.bottom

  // Fetch UMAP projection when feature IDs actually change (by content, not reference)
  useEffect(() => {
    // Create a stable signature to compare feature IDs by content
    const signature = featureIds.length >= 3
      ? `${featureIds.length}:${featureIds.slice(0, 5).join(',')}`
      : ''

    // Skip if signature hasn't changed
    if (signature === prevFeatureIdsRef.current) {
      return
    }
    prevFeatureIdsRef.current = signature

    if (featureIds.length >= 3) {
      fetchUmapProjection(featureIds, { nNeighbors: 50, minDist: 0.3 })
    } else {
      clearUmapProjection()
    }
  }, [featureIds, fetchUmapProjection, clearUmapProjection])

  // Compute D3 scales
  const scales = useMemo(() => {
    if (!umapProjection || umapProjection.length === 0) {
      return null
    }
    return computeUmapScales(umapProjection, chartWidth, chartHeight)
  }, [umapProjection, chartWidth, chartHeight])

  // Compute density contours per category
  const categoryContours = useMemo(() => {
    if (!umapProjection || !scales || chartWidth <= 0 || chartHeight <= 0) {
      return []
    }
    return computeCategoryContours(
      umapProjection,
      causeSelectionStates as Map<number, CauseCategory>,
      chartWidth,
      chartHeight,
      scales,
      15,  // bandwidth (smaller = more detail)
      10   // threshold levels (more = finer contours)
    )
  }, [umapProjection, causeSelectionStates, chartWidth, chartHeight, scales])

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

    if (!scales || !umapProjection) {
      return
    }

    // Need at least 3 points to form a polygon
    if (lassoPath.length < 3) {
      setLassoPath([])
      return
    }

    // Find points inside the lasso polygon
    const selectedIds = new Set<number>()
    for (const point of umapProjection) {
      const px = scales.xScale(point.x)
      const py = scales.yScale(point.y)
      if (polygonContains(lassoPath, [px, py])) {
        selectedIds.add(point.feature_id)
      }
    }

    setUmapBrushedFeatureIds(selectedIds)
    // Keep the lasso path visible after selection
  }, [lassoPath, scales, umapProjection, setUmapBrushedFeatureIds])

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

  // Draw brushed points on canvas (only when brush is active)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !umapProjection || !scales || chartWidth <= 0 || chartHeight <= 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, chartWidth, chartHeight)

    // Only draw points that are brushed
    if (umapBrushedFeatureIds.size === 0) return

    // Small radius and low alpha for better density visualization
    const pointRadius = 2.5
    const pointAlpha = 0.4

    for (const point of umapProjection) {
      if (!umapBrushedFeatureIds.has(point.feature_id)) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)
      const color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)

      ctx.beginPath()
      ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = pointAlpha
      ctx.fill()
    }

    // Reset alpha
    ctx.globalAlpha = 1
  }, [umapProjection, scales, causeSelectionStates, umapBrushedFeatureIds, chartWidth, chartHeight])

  // Get legend items
  const legendItems = useMemo(() => getCauseCategoryLegend(), [])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Container style with size from props
  const containerStyle = { width: propWidth, height: propHeight }

  // Loading state
  if (umapLoading) {
    return (
      <div className={`umap-scatter umap-scatter--loading ${className}`} style={containerStyle}>
        <div className="umap-scatter__message">
          <span className="umap-scatter__spinner" />
          <span>Computing UMAP projection...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (umapError) {
    return (
      <div className={`umap-scatter umap-scatter--error ${className}`} style={containerStyle}>
        <div className="umap-scatter__message umap-scatter__message--error">
          <span>{umapError}</span>
        </div>
      </div>
    )
  }

  // Empty state
  if (!umapProjection || umapProjection.length === 0 || !scales) {
    return (
      <div className={`umap-scatter umap-scatter--empty ${className}`} style={containerStyle}>
        <div className="umap-scatter__message">
          <span>No features to project</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`umap-scatter ${className}`} style={containerStyle}>
      {/* Legend */}
      <div className="umap-scatter__legend">
        {legendItems.map(item => (
          <div key={item.category} className="umap-scatter__legend-item">
            <span
              className="umap-scatter__legend-dot"
              style={{ backgroundColor: item.color }}
            />
            <span className="umap-scatter__legend-label">{item.label}</span>
          </div>
        ))}
      </div>

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
