import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import { useResizeObserver } from '../lib/utils'
import {
  getCauseColor,
  computeBarycentricScales,
  getTrianglePathString,
  spreadBarycentricPoints,
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
// UMAP SCATTER PLOT COMPONENT - CELL-BASED VISUALIZATION
// ============================================================================
// Displays 2D UMAP projection using:
// - Triangle cell grid for region selection
// - Individual points on cell selection (reveal on demand)

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

// Short name mapping for each LLM explainer (using full model names from backend)
const EXPLAINER_SHORT_NAMES: Record<string, string> = {
  'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'Llama',
  'google/gemini-flash-2.5': 'Gemini',
  'openai/gpt-4o-mini': 'OpenAI'
}

const UMAPScatter: React.FC<UMAPScatterProps> = ({
  featureIds,
  width: propWidth,
  height: propHeight,
  className = '',
  selectedFeatureId = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Use standardized resize observer hook for consistent behavior
  const { ref: containerRef, size: measuredSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: propWidth || 400,
    defaultHeight: propHeight || 400,
    debounceMs: 16,
    debugId: 'umap-scatter'
  })

  // Square proportion: use minimum of width/height to fit within container
  const size = Math.min(measuredSize.width, measuredSize.height) || propHeight || propWidth || 400

  // Cell grid state
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null)

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
  // Memoization is handled in the store - it skips API call if data is already cached
  useEffect(() => {
    if (featureIds.length < 3) {
      clearUmapProjection()
      return
    }

    // Store handles memoization: skips API call if same featureIds already fetched
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

  // Cell click handler
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

        // Draw explainer points with text labels
        const badgeGray = '#374151'  // Dark gray for badge background
        for (const ep of selectedPoint.explainer_positions) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)
          const shortName = EXPLAINER_SHORT_NAMES[ep.explainer] || ep.explainer

          // Draw small circle at explainer position (blue)
          ctx.beginPath()
          ctx.arc(epX, epY, 3, 0, Math.PI * 2)
          ctx.fillStyle = selectionBlue
          ctx.globalAlpha = 1
          ctx.fill()

          // Draw text label with background (above the point)
          ctx.font = '10px system-ui, -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          const textWidth = ctx.measureText(shortName).width
          const padding = 3
          const labelX = epX
          const labelY = epY - 8  // Position above the point

          // Draw badge background (dark gray)
          ctx.fillStyle = badgeGray
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          ctx.roundRect(labelX - textWidth / 2 - padding, labelY - 12, textWidth + padding * 2, 14, 3)
          ctx.fill()

          // Draw text
          ctx.fillStyle = '#fff'
          ctx.globalAlpha = 1
          ctx.fillText(shortName, labelX, labelY)
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

  // Container style - fill available space from flex parent
  const containerStyle = { width: '100%', height: '100%' }

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
      {/* Centered chart wrapper - square size, centered in container */}
      <div
        className="umap-scatter__chart-wrapper"
        style={{ width: size, height: size }}
      >
        {/* Chart area */}
        <div className="umap-scatter__chart">
        {/* SVG for cell grid */}
        <svg
          ref={svgRef}
          className="umap-scatter__svg"
          width={chartWidth}
          height={chartHeight}
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

          {/* Triangle cell grid */}
          {gridState && scales && (
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
      </div>

      {/* Unified legend panel */}
      <div className="umap-scatter__unified-legend">
        {/* Explainer badges */}
        <div className="umap-scatter__legend-section">
          <span className="umap-scatter__legend-title">Explainer</span>
          <div className="umap-scatter__legend-items">
            <span className="umap-scatter__explainer-badge">Llama</span>
            <span className="umap-scatter__explainer-badge">Gemini</span>
            <span className="umap-scatter__explainer-badge">OpenAI</span>
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
