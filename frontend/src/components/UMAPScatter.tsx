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
  BARYCENTRIC_TRIANGLE,
  type CauseCategory
} from '../lib/umap-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE } from '../lib/constants'
import {
  computeTriangleGrid,
  cellToSvgPoints,
  THRESHOLD_DIVISOR,
  type TriangleCell
} from '../lib/triangle-grid'
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
const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

// Cause categories for decision space validation (3 categories)
const CAUSE_CATEGORIES = ['noisy-activation', 'missed-N-gram', 'missed-context']

// Selection mode type
type SelectionMode = 'cells' | 'lasso'

// Cell category info for SVM visualization
interface CellCategoryInfo {
  majorityCategory: CauseCategory | null
  purity: number  // 0-1, percentage of features with majority category
  totalFeatures: number
}

// Map category to display name for getTagColor lookup
const CATEGORY_TO_TAG_NAME: Record<CauseCategory, string> = {
  'noisy-activation': 'Noisy Activation',
  'missed-N-gram': 'Pattern Miss',
  'missed-context': 'Context Miss',
  'well-explained': 'Well-Explained'
}

// Get color for a cause category
function getCauseCategoryColor(category: CauseCategory): string {
  const tagName = CATEGORY_TO_TAG_NAME[category]
  return getTagColor(TAG_CATEGORY_CAUSE, tagName) || '#9ca3af'
}

// Convert hex to HSL
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return [h * 360, s * 100, l * 100]
}

// Adjust color brightness based on purity (0-1)
// High purity = full color, low purity = lighter/washed out
function adjustColorByPurity(hexColor: string, purity: number): string {
  const [h, s, l] = hexToHsl(hexColor)
  // Map purity to lightness: low purity = light (85%), high purity = normal lightness
  // Also reduce saturation for low purity
  const targetL = 85 - purity * (85 - l)  // Interpolate from 85% (light) to original
  const targetS = 30 + purity * (s - 30)   // Interpolate from 30% to original saturation
  return `hsl(${h}, ${targetS}%, ${targetL}%)`
}

// Shape type for explainer positions
type ExplainerShape = 'square' | 'diamond' | 'triangle'

// Shape mapping for each LLM explainer (using full model names from backend)
const EXPLAINER_SHAPES: Record<string, ExplainerShape> = {
  'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'square',  // llama
  'google/gemini-flash-2.5': 'diamond',                             // gemini
  'openai/gpt-4o-mini': 'triangle'                                  // openai
}

// Draw a shape on canvas at (x, y) with given size
// Sizes are adjusted for equal visual weight (same area)
function drawShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: ExplainerShape
) {
  ctx.beginPath()
  switch (shape) {
    case 'square':
      // Area = 4 * size²
      ctx.rect(x - size, y - size, size * 2, size * 2)
      break
    case 'diamond': {
      // Base diamond area = 2 * size², scale by √2 ≈ 1.41 for equal area
      const d = size * 1.41
      ctx.moveTo(x, y - d)
      ctx.lineTo(x + d, y)
      ctx.lineTo(x, y + d)
      ctx.lineTo(x - d, y)
      ctx.closePath()
      break
    }
    case 'triangle': {
      // Match legend proportions: base=12, height=11 in 14x14 viewBox
      // Scale for equal visual weight with square
      const halfBase = size * 1.5
      const height = size * 2.75
      ctx.moveTo(x, y - height / 2)              // Top vertex
      ctx.lineTo(x + halfBase, y + height / 2)   // Bottom right
      ctx.lineTo(x - halfBase, y + height / 2)   // Bottom left
      ctx.closePath()
      break
    }
  }
}

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

  // Measure container height and use for square dimensions
  const [measuredHeight, setMeasuredHeight] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const { height } = entry.contentRect
        if (height > 0) {
          setMeasuredHeight(height)
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Square proportion: use container height for both dimensions
  const size = measuredHeight || propHeight || propWidth || 400

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('cells')

  // Lasso state
  const [isDrawing, setIsDrawing] = useState(false)
  const [lassoPath, setLassoPath] = useState<[number, number][]>([])
  const justFinishedDrawing = useRef(false)
  const isDrawingRef = useRef(false)  // Ref for immediate access in handlers

  // Cell grid state
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null)

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
  const chartWidth = size - MARGIN.left - MARGIN.right
  const chartHeight = size - MARGIN.top - MARGIN.bottom

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

  // Transform points to spread across triangle (stretch to fill bounding box)
  const spreadPoints = useMemo(() => {
    if (!umapProjection || umapProjection.length === 0) return null
    return spreadBarycentricPoints(umapProjection, 'stretch')
  }, [umapProjection])

  // Compute triangle grid for cell-based selection (with dynamic threshold)
  const gridState = useMemo(() => {
    if (!spreadPoints || spreadPoints.length === 0) return null
    const threshold = Math.max(1, Math.ceil(spreadPoints.length / THRESHOLD_DIVISOR))
    return computeTriangleGrid(spreadPoints, threshold)
  }, [spreadPoints])

  // Compute cell category info for SVM visualization (majority category + purity)
  const cellCategoryInfo = useMemo(() => {
    if (!gridState) return new Map<string, CellCategoryInfo>()

    const info = new Map<string, CellCategoryInfo>()

    for (const cellKey of gridState.leafCells) {
      const cell = gridState.cells.get(cellKey)
      if (!cell || cell.featureIds.size === 0) {
        info.set(cellKey, { majorityCategory: null, purity: 0, totalFeatures: 0 })
        continue
      }

      // Count features by category
      const categoryCounts = new Map<CauseCategory, number>()

      for (const featureId of cell.featureIds) {
        const category = causeSelectionStates.get(featureId) as CauseCategory | undefined
        if (category) {
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)
        }
      }

      // Find majority category
      let majorityCategory: CauseCategory | null = null
      let maxCount = 0
      for (const [cat, count] of categoryCounts) {
        if (count > maxCount) {
          maxCount = count
          majorityCategory = cat
        }
      }

      // Calculate purity (percentage of ALL features with majority category)
      const purity = cell.featureIds.size > 0 ? maxCount / cell.featureIds.size : 0

      info.set(cellKey, {
        majorityCategory,
        purity,
        totalFeatures: cell.featureIds.size
      })
    }

    return info
  }, [gridState, causeSelectionStates])

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

  // Get mouse position relative to SVG (works with both React and native events)
  const getMousePosition = useCallback((e: MouseEvent | React.MouseEvent): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  // Cell click handler (for cell mode)
  const handleCellClick = useCallback((cell: TriangleCell) => {
    setUmapBrushedFeatureIds(cell.featureIds)
  }, [setUmapBrushedFeatureIds])

  // Auto-select first cell on initial load (when grid is computed and no selection exists)
  useEffect(() => {
    if (!gridState || umapBrushedFeatureIds.size > 0) return

    // Find the first leaf cell with features
    for (const cellKey of gridState.leafCells) {
      const cell = gridState.cells.get(cellKey)
      if (cell && cell.featureIds.size > 0) {
        setUmapBrushedFeatureIds(cell.featureIds)
        break
      }
    }
  }, [gridState, umapBrushedFeatureIds.size, setUmapBrushedFeatureIds])

  // Lasso mouse handlers (only active in lasso mode)
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only active in lasso mode
    if (selectionMode !== 'lasso') return
    // Only respond to left mouse button
    if (e.button !== 0) return

    e.preventDefault()
    const pos = getMousePosition(e)
    isDrawingRef.current = true
    setIsDrawing(true)
    setLassoPath([pos])
    setUmapBrushedFeatureIds(new Set())
  }, [selectionMode, getMousePosition, setUmapBrushedFeatureIds])

  const handleMouseMove = useCallback((e: MouseEvent) => {
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
  }, [])

  // Finalize lasso selection when drawing ends (separate from mouseup handler)
  useEffect(() => {
    // Only run when we just finished drawing (isDrawing went from true to false)
    if (isDrawing || !justFinishedDrawing.current) return

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
  }, [isDrawing, lassoPath, scales, spreadPoints, setUmapBrushedFeatureIds])

  // Attach global mouse handlers when drawing to continue lasso outside SVG
  // Also disable pointer events on other elements to prevent hover effects
  useEffect(() => {
    if (!isDrawing) return

    document.body.classList.add('umap-lasso-drawing')
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.classList.remove('umap-lasso-drawing')
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDrawing, handleMouseMove, handleMouseUp])

  // Clear selection on click outside (lasso mode only)
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only active in lasso mode
    if (selectionMode !== 'lasso') return
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
  }, [selectionMode, lassoPath, setUmapBrushedFeatureIds])

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

    // Handle high-DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1

    // Reset transform and clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, chartWidth * dpr, chartHeight * dpr)

    // Scale context for high-DPI
    ctx.scale(dpr, dpr)

    // Point styling
    const manualPointRadius = 4
    const brushedPointRadius = 2.5
    const manualPointAlpha = 0.85
    const brushedPointAlpha = 0.4

    // Find the selected feature's point for explainer positions
    const selectedPoint = selectedFeatureId != null
      ? spreadPoints.find(p => p.feature_id === selectedFeatureId)
      : null

    // Draw manually tagged and brushed points (auto-tagged only shown if brushed)
    for (const point of spreadPoints) {
      const isManual = manuallyTaggedIds.has(point.feature_id)
      const isBrushed = umapBrushedFeatureIds.has(point.feature_id)
      const isAutoTagged = !isManual && causeSelectionSources.get(point.feature_id) === 'auto'
      const isSelected = point.feature_id === selectedFeatureId

      // Skip if not in brushed selection (manual points always shown, auto only if brushed)
      if (!isManual && !isBrushed) continue
      // Skip selected feature here - will draw it last on top
      if (isSelected) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)
      const color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)

      if (isManual) {
        // Manual points: solid filled circles
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = manualPointAlpha
        ctx.fill()
      } else if (isAutoTagged) {
        // Auto-tagged points: hollow circles (ring only)
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = manualPointAlpha
        ctx.stroke()
      } else if (isBrushed) {
        // Brushed (untagged) points: smaller filled circles
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

        // Draw explainer points (blue, different shapes per explainer)
        for (const ep of selectedPoint.explainer_positions) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)
          const shape = EXPLAINER_SHAPES[ep.explainer] || 'square'

          drawShape(ctx, epX, epY, 4, shape)
          ctx.fillStyle = selectionBlue
          ctx.globalAlpha = 1
          ctx.fill()
        }
      }

      // Draw selected feature point (mean position) with blue highlight ring - LAST
      ctx.beginPath()
      ctx.arc(meanX, meanY, manualPointRadius + 4, 0, Math.PI * 2)
      ctx.strokeStyle = selectionBlue
      ctx.lineWidth = 2.5
      ctx.globalAlpha = 1
      ctx.stroke()

      // Check if selected feature is manually tagged
      const isSelectedManual = manuallyTaggedIds.has(selectedFeatureId!)

      ctx.beginPath()
      ctx.arc(meanX, meanY, manualPointRadius + 1, 0, Math.PI * 2)
      ctx.globalAlpha = 1

      if (isSelectedManual) {
        // Manual: filled circle
        ctx.fillStyle = categoryColor
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        // Auto-tagged or untagged: hollow circle
        ctx.strokeStyle = categoryColor
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // Reset alpha
    ctx.globalAlpha = 1
  }, [spreadPoints, scales, causeSelectionStates, causeSelectionSources, umapBrushedFeatureIds, manuallyTaggedIds, selectedFeatureId, chartWidth, chartHeight])


  // ============================================================================
  // RENDER
  // ============================================================================

  // Container style - fill height from flex parent, width matches height for square
  const containerStyle = { width: size, height: '100%' }

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

          {/* Density contours per category (lasso mode only) */}
          {selectionMode === 'lasso' && (
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
          )}

          {/* Triangle cell grid (cell mode only) */}
          {selectionMode === 'cells' && gridState && scales && (
            <g className="umap-scatter__cell-grid">
              {Array.from(gridState.leafCells).map(key => {
                const cell = gridState.cells.get(key)
                if (!cell) return null
                const isHovered = hoveredCellKey === key
                const hasSelection = umapBrushedFeatureIds.size > 0
                const isSelected = hasSelection &&
                  Array.from(cell.featureIds).some(fid => umapBrushedFeatureIds.has(fid))

                // Get category info for SVM visualization
                const catInfo = cellCategoryInfo.get(key)
                const hasCategoryData = catInfo?.majorityCategory != null

                // Compute brightness-adjusted color based on purity
                let adjustedColor: string | undefined
                if (hasCategoryData) {
                  const baseColor = getCauseCategoryColor(catInfo!.majorityCategory!)
                  const purity = catInfo!.purity
                  // On hover, boost purity slightly for visual feedback
                  const effectivePurity = isHovered ? Math.min(purity + 0.15, 1) : purity
                  adjustedColor = adjustColorByPurity(baseColor, effectivePurity)
                }

                // Build inline style for category coloring
                const cellStyle: React.CSSProperties | undefined = hasCategoryData && !isSelected
                  ? {
                      fill: adjustedColor,
                      stroke: isHovered ? 'rgba(59, 130, 246, 0.6)' : undefined,
                      strokeWidth: isHovered ? 1 : undefined
                    }
                  : undefined

                return (
                  <polygon
                    key={key}
                    points={cellToSvgPoints(cell, scales.xScale, scales.yScale)}
                    className={`umap-scatter__cell ${isHovered && !hasCategoryData ? 'umap-scatter__cell--hovered' : ''} ${isSelected ? 'umap-scatter__cell--selected' : ''}`}
                    style={cellStyle}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCellClick(cell)
                    }}
                    onMouseEnter={() => setHoveredCellKey(key)}
                    onMouseLeave={() => setHoveredCellKey(null)}
                  />
                )
              })}
            </g>
          )}

          {/* Lasso selection path (lasso mode only) */}
          {selectionMode === 'lasso' && lassoPathString && (
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
          width={chartWidth * (window.devicePixelRatio || 1)}
          height={chartHeight * (window.devicePixelRatio || 1)}
          className="umap-scatter__canvas"
          style={{ width: chartWidth, height: chartHeight }}
        />

        {/* Vertex labels (positioned at triangle corners) */}
        {scales && (
          <>
            {/* Top vertex: Noisy Activation */}
            <div
              className="umap-scatter__vertex-label"
              style={{
                left: scales.xScale(BARYCENTRIC_TRIANGLE.vertices.noisyActivation[0]),
                top: scales.yScale(BARYCENTRIC_TRIANGLE.vertices.noisyActivation[1]),
                transform: 'translate(-50%, -100%) translateY(-10px)',
                '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
              } as React.CSSProperties}
            >
              Noisy Activation
            </div>
            {/* Bottom-left vertex: Pattern Miss */}
            <div
              className="umap-scatter__vertex-label"
              style={{
                left: scales.xScale(BARYCENTRIC_TRIANGLE.vertices.missedNgram[0]),
                top: scales.yScale(BARYCENTRIC_TRIANGLE.vertices.missedNgram[1]),
                transform: 'translate(-20px, 10px)',
                '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9ca3af'
              } as React.CSSProperties}
            >
              Pattern Miss
            </div>
            {/* Bottom-right vertex: Context Miss */}
            <div
              className="umap-scatter__vertex-label"
              style={{
                left: scales.xScale(BARYCENTRIC_TRIANGLE.vertices.missedContext[0]),
                top: scales.yScale(BARYCENTRIC_TRIANGLE.vertices.missedContext[1]),
                transform: 'translate(calc(-100% + 20px), 10px)',
                '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#9ca3af'
              } as React.CSSProperties}
            >
              Context Miss
            </div>
          </>
        )}
      </div>

      {/* Mode toggle */}
      <div className="umap-scatter__mode-toggle">
        <button
          className={`umap-scatter__mode-btn ${selectionMode === 'cells' ? 'umap-scatter__mode-btn--active' : ''}`}
          onClick={() => {
            setSelectionMode('cells')
            setLassoPath([])  // Clear lasso when switching
          }}
          title="Cell selection"
        >
          Cells
        </button>
        <button
          className={`umap-scatter__mode-btn ${selectionMode === 'lasso' ? 'umap-scatter__mode-btn--active' : ''}`}
          onClick={() => {
            setSelectionMode('lasso')
            setHoveredCellKey(null)  // Clear hover when switching
          }}
          title="Lasso selection"
        >
          Lasso
        </button>
      </div>

      {/* Unified legend panel */}
      <div className="umap-scatter__unified-legend">
        {/* Explainer shapes */}
        <div className="umap-scatter__legend-section">
          <span className="umap-scatter__legend-title">Explainer</span>
          <div className="umap-scatter__legend-items">
            <div className="umap-scatter__legend-item">
              <svg width="12" height="12" viewBox="0 0 14 14">
                <rect x="3" y="3" width="8" height="8" fill="#3b82f6"/>
              </svg>
              <span>Llama</span>
            </div>
            <div className="umap-scatter__legend-item">
              <svg width="12" height="12" viewBox="0 0 14 14">
                <polygon points="7,0.5 13,7 7,13.5 1,7" fill="#3b82f6"/>
              </svg>
              <span>Gemini</span>
            </div>
            <div className="umap-scatter__legend-item">
              <svg width="12" height="12" viewBox="0 0 14 14">
                <polygon points="7,1 13,12 1,12" fill="#3b82f6"/>
              </svg>
              <span>OpenAI</span>
            </div>
          </div>
        </div>
        {/* Purity gradient */}
        <div className="umap-scatter__legend-section">
          <span className="umap-scatter__legend-title">Purity</span>
          <div className="umap-scatter__purity-row">
            <span>Low</span>
            <div className="umap-scatter__purity-bar" />
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Classification loading indicator (subtle overlay) */}
      {causeClassificationLoading && (
        <div className="umap-scatter__classification-loading">
          <span className="umap-scatter__spinner umap-scatter__spinner--small" />
          <span>Updating...</span>
        </div>
      )}

    </div>
  )
}

export default React.memo(UMAPScatter)
