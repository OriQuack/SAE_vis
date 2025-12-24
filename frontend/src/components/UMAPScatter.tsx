import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
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
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY } from '../lib/constants'
// Triangle grid for visual batch tagging
import { computeTriangleGrid, cellToSvgPoints, THRESHOLD_DIVISOR } from '../lib/triangle-grid'
import '../styles/UMAPScatter.css'

// ============================================================================
// UMAP SCATTER PLOT COMPONENT - TRIANGLE GRID VISUALIZATION
// ============================================================================
// Displays 2D UMAP projection using:
// - Triangle grid for batch selection (click point → select cell)
// - Adaptive hierarchical cell system that merges based on feature density

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

// Filter categories (includes unsure)
type FilterCategory = CauseCategory | 'unsure'
const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: 'noisy-activation', label: 'Noisy Activation' },
  { id: 'missed-N-gram', label: 'Pattern Miss' },
  { id: 'missed-context', label: 'Context Miss' },
  { id: 'well-explained', label: 'Well-Explained' },
  { id: 'unsure', label: 'Unsure' }
]

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
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure)

  // Shared margin threshold from store
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)
  const setCauseMarginThreshold = useVisualizationStore(state => state.setCauseMarginThreshold)

  // Filter state: which categories to show
  const [visibleCategories, setVisibleCategories] = useState<Set<FilterCategory>>(
    new Set(['noisy-activation', 'missed-N-gram', 'missed-context', 'well-explained', 'unsure'])
  )

  // Toggle category visibility
  const toggleCategory = useCallback((category: FilterCategory) => {
    setVisibleCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

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

  // Transform points using barycentric power transform (spreads toward vertices)
  const spreadPoints = useMemo(() => {
    if (!umapProjection || umapProjection.length === 0) return null
    return spreadBarycentricPoints(umapProjection, 'barycentricPower')
  }, [umapProjection])

  // Compute triangle grid for batch selection
  const gridState = useMemo(() => {
    if (!spreadPoints || spreadPoints.length === 0) return null
    const mergeThreshold = Math.ceil(spreadPoints.length / THRESHOLD_DIVISOR)
    return computeTriangleGrid(spreadPoints, mergeThreshold)
  }, [spreadPoints])

  // Auto-select first grid cell on initial load (when no selection exists)
  useEffect(() => {
    if (!gridState || umapBrushedFeatureIds.size > 0) return

    // Find the first non-empty leaf cell
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

  // Extract well-explained feature IDs from Stage 3 segment (above decision_margin threshold)
  // stage3_segment.segments[1] = "Well-Explained" (above threshold)
  const wellExplainedFeatureIds = useMemo(() => {
    if (!sankeyStructure) return new Set<number>()
    const stage3Node = sankeyStructure.nodes.find((n: { id: string }) => n.id === 'stage3_segment')
    if (stage3Node?.segments?.[1]?.featureIds) {
      return stage3Node.segments[1].featureIds
    }
    return new Set<number>()
  }, [sankeyStructure])

  // Helper: get effective category for a feature (considering margin threshold)
  // Priority: well-explained (Stage 3 segment) > manual tags > auto-tags with margin check > unsure
  const getEffectiveCategory = useCallback((featureId: number): FilterCategory => {
    // Well-explained from Stage 3 segment takes highest priority
    if (wellExplainedFeatureIds.has(featureId)) return 'well-explained'

    const isManual = manuallyTaggedIds.has(featureId)
    const category = causeSelectionStates.get(featureId) as CauseCategory | undefined

    // Manual tags are respected
    if (isManual && category) return category

    // For auto-tagged features, check margin threshold
    if (category && causeCategoryDecisionMargins) {
      const categoryScores = causeCategoryDecisionMargins.get(featureId)
      if (categoryScores) {
        const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
        if (margin < causeMarginThreshold) return 'unsure'
      }
    }

    return category || 'unsure'
  }, [wellExplainedFeatureIds, manuallyTaggedIds, causeSelectionStates, causeCategoryDecisionMargins, causeMarginThreshold])

  // Compute explainer label positions for HTML rendering (crisp text)
  const explainerLabels = useMemo(() => {
    if (!scales || !spreadPoints || selectedFeatureId == null) return []

    const selectedPoint = spreadPoints.find(p => p.feature_id === selectedFeatureId)
    if (!selectedPoint?.explainer_positions) return []

    return selectedPoint.explainer_positions.map(ep => ({
      explainer: ep.explainer,
      shortName: EXPLAINER_SHORT_NAMES[ep.explainer] || ep.explainer,
      x: scales.xScale(ep.x),
      y: scales.yScale(ep.y)
    }))
  }, [scales, spreadPoints, selectedFeatureId])

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
    const brushedPointRadius = 2
    const manualPointAlpha = 1
    const untaggedPointAlpha = 0.2  // Alpha for untagged points

    // Find the selected feature's point for explainer positions
    const selectedPoint = selectedFeatureId != null
      ? spreadPoints.find(p => p.feature_id === selectedFeatureId)
      : null

    // Draw all feature points
    for (const point of spreadPoints) {
      const isManual = manuallyTaggedIds.has(point.feature_id)
      const isAutoTagged = !isManual && causeSelectionSources.get(point.feature_id) === 'auto'
      const isSelected = point.feature_id === selectedFeatureId

      // Skip selected feature here - will draw it last on top
      if (isSelected) continue

      // Apply filter: skip points whose effective category is not visible
      const effectiveCategory = getEffectiveCategory(point.feature_id)
      if (!visibleCategories.has(effectiveCategory)) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)

      // Determine color based on effective category
      let color: string
      if (effectiveCategory === 'unsure') {
        color = '#6b7280'  // Dark gray for unsure
      } else if (effectiveCategory === 'well-explained') {
        color = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'  // Green
      } else {
        color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)
      }

      if (isManual) {
        // Manual points: solid filled circles with cause category color
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = manualPointAlpha
        ctx.fill()
      } else if (isAutoTagged) {
        // Auto-tagged points: hollow circles (ring only) with cause category color
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 0.5
        ctx.globalAlpha = untaggedPointAlpha
        ctx.stroke()
      } else {
        // Untagged points: simple gray
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.fillStyle = '#6b7280'  // Dark gray for untagged
        ctx.globalAlpha = untaggedPointAlpha
        ctx.fill()
      }
    }

    // Draw selected feature and its explainer positions LAST (on top of everything)
    if (selectedPoint) {
      // Use effective category for selected point color too
      const selectedEffectiveCategory = getEffectiveCategory(selectedFeatureId!)
      let categoryColor: string
      if (selectedEffectiveCategory === 'unsure') {
        categoryColor = '#6b7280'
      } else if (selectedEffectiveCategory === 'well-explained') {
        categoryColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
      } else {
        categoryColor = getCauseColor(selectedFeatureId!, causeSelectionStates as Map<number, CauseCategory>)
      }
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

        // Draw explainer points (circles only - labels rendered as HTML)
        for (const ep of selectedPoint.explainer_positions) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)

          // Draw small circle at explainer position (blue)
          ctx.beginPath()
          ctx.arc(epX, epY, 3, 0, Math.PI * 2)
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
  }, [spreadPoints, scales, causeSelectionStates, causeSelectionSources, manuallyTaggedIds, selectedFeatureId, chartWidth, chartHeight, visibleCategories, getEffectiveCategory])


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
        {/* Canvas for points (rendered first, below SVG) */}
        <canvas
          ref={canvasRef}
          width={chartWidth * (window.devicePixelRatio || 1)}
          height={chartHeight * (window.devicePixelRatio || 1)}
          className="umap-scatter__canvas"
          style={{ width: chartWidth, height: chartHeight }}
        />

        {/* SVG for grid cells and triangle outline (on top of canvas) */}
        <svg
          ref={svgRef}
          className="umap-scatter__svg umap-scatter__svg--interactive"
          width={chartWidth}
          height={chartHeight}
          style={{ pointerEvents: 'none' }}
        >
          {/* Triangle outline */}
          {trianglePath && (
            <path
              d={trianglePath}
              fill="none"
              stroke="#000"
              strokeWidth={1.5}
              className="umap-scatter__triangle-outline"
            />
          )}

          {/* Triangle cell grid for batch selection */}
          {gridState && scales && Array.from(gridState.leafCells).map(cellKey => {
            const cell = gridState.cells.get(cellKey)
            if (!cell || cell.featureIds.size === 0) return null

            // Check if this cell is selected (its features match brushed features)
            const isSelected = umapBrushedFeatureIds.size > 0 &&
              cell.featureIds.size === umapBrushedFeatureIds.size &&
              [...cell.featureIds].every(id => umapBrushedFeatureIds.has(id))

            return (
              <polygon
                key={cell.key}
                points={cellToSvgPoints(cell, scales.xScale, scales.yScale)}
                className={`umap-scatter__grid-cell${isSelected ? ' umap-scatter__grid-cell--selected' : ''}`}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => setUmapBrushedFeatureIds(cell.featureIds)}
              />
            )
          })}
        </svg>

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

        {/* Explainer position labels (rendered as HTML for crisp text) */}
        {explainerLabels.map(label => (
          <div
            key={label.explainer}
            className="umap-scatter__explainer-label"
            style={{
              left: label.x,
              top: label.y
            }}
          >
            {label.shortName}
          </div>
        ))}
        </div>
      </div>

      {/* Filter panel */}
      <div className="umap-scatter__filter-panel">
        <span className="umap-scatter__filter-title">Filter</span>
        {/* Category filter buttons - vertically stacked */}
        <div className="umap-scatter__filter-buttons">
          {FILTER_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`umap-scatter__filter-btn${visibleCategories.has(cat.id) ? ' umap-scatter__filter-btn--active' : ''}`}
              onClick={() => toggleCategory(cat.id)}
              style={{
                '--filter-color': cat.id === 'unsure'
                  ? '#6b7280'
                  : cat.id === 'well-explained'
                    ? getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
                    : getTagColor(TAG_CATEGORY_CAUSE, cat.label) || '#6b7280'
              } as React.CSSProperties}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {/* Margin threshold slider */}
        <div className="umap-scatter__threshold-slider">
          <label>Margin: {causeMarginThreshold.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={causeMarginThreshold}
            onChange={(e) => setCauseMarginThreshold(parseFloat(e.target.value))}
          />
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
