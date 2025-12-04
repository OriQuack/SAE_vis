import React, { useRef, useMemo, useCallback, useEffect } from 'react'
import { select } from 'd3-selection'
import { brush } from 'd3-brush'
import type { D3BrushEvent } from 'd3-brush'
import { useVisualizationStore } from '../store/index'
import { useResizeObserver } from '../lib/utils'
import {
  getCauseColor,
  getCauseCategoryLegend,
  computeUmapScales,
  getFeatureIdsInBrushSelection,
  UMAP_POINT_CONFIG,
  isPointDimmed,
  type CauseCategory
} from '../lib/umap-utils'
import '../styles/UMAPScatter.css'

// ============================================================================
// UMAP SCATTER PLOT COMPONENT
// ============================================================================
// Displays 2D UMAP projection of features for cause analysis.
// Uses D3 brush for selection, colors points by cause category.

interface UMAPScatterProps {
  featureIds: number[]
  className?: string
}

// Margin configuration
const MARGIN = { top: 20, right: 20, bottom: 40, left: 40 }

const UMAPScatter: React.FC<UMAPScatterProps> = ({
  featureIds,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brushGroupRef = useRef<SVGGElement>(null)

  // Store state
  const umapProjection = useVisualizationStore(state => state.umapProjection)
  const umapLoading = useVisualizationStore(state => state.umapLoading)
  const umapError = useVisualizationStore(state => state.umapError)
  const umapBrushedFeatureIds = useVisualizationStore(state => state.umapBrushedFeatureIds)
  const fetchUmapProjection = useVisualizationStore(state => state.fetchUmapProjection)
  const setUmapBrushedFeatureIds = useVisualizationStore(state => state.setUmapBrushedFeatureIds)
  const clearUmapProjection = useVisualizationStore(state => state.clearUmapProjection)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)

  // Responsive sizing
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 400,
    defaultHeight: 300,
    debounceMs: 16,
    debugId: 'umap-scatter'
  })

  // Calculate chart dimensions
  const width = containerSize.width - MARGIN.left - MARGIN.right
  const height = containerSize.height - MARGIN.top - MARGIN.bottom

  // Fetch UMAP projection when feature IDs change
  useEffect(() => {
    if (featureIds.length >= 3) {
      fetchUmapProjection(featureIds, { nNeighbors: 30, minDist: 0.3 })
    } else {
      clearUmapProjection()
    }
  }, [featureIds, fetchUmapProjection, clearUmapProjection])

  // Compute D3 scales
  const scales = useMemo(() => {
    if (!umapProjection || umapProjection.length === 0) {
      return null
    }
    return computeUmapScales(umapProjection, width, height)
  }, [umapProjection, width, height])

  // Setup D3 brush
  const handleBrush = useCallback((event: D3BrushEvent<unknown>) => {
    if (!scales || !umapProjection) return

    const selection = event.selection as [[number, number], [number, number]] | null

    if (selection) {
      const selectedIds = getFeatureIdsInBrushSelection(umapProjection, selection, scales)
      setUmapBrushedFeatureIds(selectedIds)
    } else {
      setUmapBrushedFeatureIds(new Set())
    }
  }, [scales, umapProjection, setUmapBrushedFeatureIds])

  // Initialize/update brush
  useEffect(() => {
    if (!brushGroupRef.current || !scales || width <= 0 || height <= 0) return

    const brushBehavior = brush<unknown>()
      .extent([[0, 0], [width, height]])
      .on('end', handleBrush)  // Only update on mouse release, not during drag

    const brushGroup = select(brushGroupRef.current)

    // Clear any existing brush
    brushGroup.selectAll('*').remove()

    // Apply brush
    brushGroup.call(brushBehavior)

    // Style the brush
    brushGroup.selectAll('.selection')
      .attr('fill', 'rgba(100, 100, 100, 0.2)')
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,2')

    return () => {
      brushGroup.selectAll('*').remove()
    }
  }, [width, height, scales, handleBrush])

  // Draw points on canvas (much faster than hundreds of SVG circles)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !umapProjection || !scales || width <= 0 || height <= 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw each point
    for (const point of umapProjection) {
      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)
      const color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)
      const isDimmed = isPointDimmed(point.feature_id, umapBrushedFeatureIds)
      const isBrushed = umapBrushedFeatureIds.has(point.feature_id)
      const radius = isBrushed ? UMAP_POINT_CONFIG.radiusBrushed : UMAP_POINT_CONFIG.radius

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = isDimmed ? UMAP_POINT_CONFIG.opacityDimmed : UMAP_POINT_CONFIG.opacity
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = isBrushed ? '#333' : '#fff'
      ctx.lineWidth = isBrushed ? UMAP_POINT_CONFIG.strokeWidthBrushed : UMAP_POINT_CONFIG.strokeWidth
      ctx.stroke()
    }
  }, [umapProjection, scales, causeSelectionStates, umapBrushedFeatureIds, width, height])

  // Get legend items
  const legendItems = useMemo(() => getCauseCategoryLegend(), [])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Loading state
  if (umapLoading) {
    return (
      <div className={`umap-scatter umap-scatter--loading ${className}`} ref={containerRef}>
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
      <div className={`umap-scatter umap-scatter--error ${className}`} ref={containerRef}>
        <div className="umap-scatter__message umap-scatter__message--error">
          <span>{umapError}</span>
        </div>
      </div>
    )
  }

  // Empty state
  if (!umapProjection || umapProjection.length === 0 || !scales) {
    return (
      <div className={`umap-scatter umap-scatter--empty ${className}`} ref={containerRef}>
        <div className="umap-scatter__message">
          <span>No features to project</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`umap-scatter ${className}`} ref={containerRef}>
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

      {/* Chart area with canvas + SVG overlay */}
      <div className="umap-scatter__chart">
        {/* Canvas for points (fast - no DOM nodes per point) */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="umap-scatter__canvas"
        />

        {/* SVG overlay for brush only */}
        <svg
          className="umap-scatter__svg"
          width={width}
          height={height}
        >
          <g ref={brushGroupRef} className="umap-scatter__brush" />
        </svg>
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
