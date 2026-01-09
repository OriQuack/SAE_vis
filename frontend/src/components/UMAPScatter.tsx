import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import { useResizeObserver } from '../lib/utils'
import {
  getCauseColor,
  computeBarycentricScales,
  getTrianglePathString,
  spreadBarycentricPoints,
  computeCategoryContours,
  BARYCENTRIC_TRIANGLE,
  CONTOUR_CONFIG,
  type CauseCategory
} from '../lib/umap-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY } from '../lib/constants'
import {
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'

// Darker unsure gray for scatterplot points (better visibility on white background)
const DARK_UNSURE_GRAY = '#686868ff'
// Triangle grid disabled - using density heatmap
// import { computeTriangleGrid, cellToSvgPoints } from '../lib/triangle-grid'
import '../styles/UMAPScatter.css'

// ============================================================================
// UMAP SCATTER PLOT COMPONENT - TRIANGLE GRID VISUALIZATION
// ============================================================================
// Displays 2D UMAP projection using:
// - Triangle grid for batch selection (click point → select cell)
// - Adaptive hierarchical cell system that merges based on feature density

// Filter categories (includes unsure)
type FilterCategory = CauseCategory | 'unsure'

interface UMAPScatterProps {
  featureIds: number[]
  width?: number
  height?: number
  className?: string
  selectedFeatureId?: number | null  // Feature to highlight with explainer positions
  visibleCategories?: Set<FilterCategory>  // Which categories to show (controlled by parent)
  onVisibleCategoriesChange?: (categories: Set<FilterCategory>) => void  // Callback when filter changes
  onFeatureSelect?: (featureId: number) => void  // Callback when a point is clicked
  sortMode?: 'default' | 'decisionMargin'  // Sort mode from StatusPanel (for visibility filtering)
  sortDirection?: 'asc' | 'desc'  // Sort direction from StatusPanel (for visibility filtering)
  filterByTag?: CauseCategory | null  // Filter to show only features with this predicted category
}

// Margin configuration
const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

// Cause categories for decision space validation (3 categories)
const CAUSE_CATEGORIES = ['noisy-activation', 'missed-N-gram', 'missed-context']

// Minimum manual tags required per cause category before SVM training
const MIN_TAGS_PER_CATEGORY = 2

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
  selectedFeatureId = null,
  visibleCategories: propVisibleCategories,
  // onVisibleCategoriesChange - removed filter buttons
  onFeatureSelect,
  sortMode = 'decisionMargin',
  sortDirection = 'asc',
  filterByTag = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)

  // Use standardized resize observer hook for consistent behavior
  const { ref: resizeRef, size: measuredSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: propWidth || 400,
    defaultHeight: propHeight || 400,
    debounceMs: 16,
    debugId: 'umap-scatter'
  })

  // Combined ref callback for both resize observer and element ref
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node
    resizeRef(node)
  }, [resizeRef])

  // Square proportion: use minimum of width/height to fit within container
  const size = Math.min(measuredSize.width, measuredSize.height) || propHeight || propWidth || 400

  // Store state
  const umapProjection = useVisualizationStore(state => state.umapProjection)
  const umapLoading = useVisualizationStore(state => state.umapLoading)
  const umapError = useVisualizationStore(state => state.umapError)
  // Grid selection disabled - using click on points instead
  // const umapBrushedFeatureIds = useVisualizationStore(state => state.umapBrushedFeatureIds)
  const fetchUmapProjection = useVisualizationStore(state => state.fetchUmapProjection)
  const fetchCauseClassification = useVisualizationStore(state => state.fetchCauseClassification)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  // Grid cell selection disabled
  // const setUmapBrushedFeatureIds = useVisualizationStore(state => state.setUmapBrushedFeatureIds)
  const clearUmapProjection = useVisualizationStore(state => state.clearUmapProjection)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)

  // Shared margin threshold from store (used for visibility filtering)
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)

  // Filter state: use prop if provided, fallback to local state
  // Initially show only 'unsure' - user starts by reviewing uncertain features
  const [localVisibleCategories] = useState<Set<FilterCategory>>(
    new Set(['unsure'])
  )

  const visibleCategories = propVisibleCategories ?? localVisibleCategories

  // Hover state disabled - no grid cells
  // const [hoveredCell, setHoveredCell] = useState<{
  //   cellKey: string
  //   position: { x: number; y: number }
  // } | null>(null)

  // Check if all 3 categories have MIN_TAGS_PER_CATEGORY manual tags (for SVM classification)
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

    const missingCount = CAUSE_CATEGORIES.filter(cat => (manualTags.get(cat) || 0) < MIN_TAGS_PER_CATEGORY).length

    return {
      canUseDecisionSpace: missingCount === 0,
      manualCauseSelections: selections
    }
  }, [causeSelectionStates, causeSelectionSources])

  // Compute signature of manual tags to use as stable dependency
  // This prevents infinite loops by only triggering when the SET of manual tag IDs changes
  // Computing directly from Maps avoids intermediate object reference changes
  const manualTagsSignature = useMemo(() => {
    const manualIds: number[] = []
    causeSelectionStates.forEach((_category, featureId) => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') {
        manualIds.push(featureId)
      }
    })
    return manualIds.sort((a, b) => a - b).join(',')
  }, [causeSelectionStates, causeSelectionSources])

  // Track last signature that triggered API call to prevent duplicate requests
  const lastFetchedSignatureRef = useRef<string>('')

  // Chart dimensions
  const chartWidth = size - MARGIN.left - MARGIN.right
  const chartHeight = size - MARGIN.top - MARGIN.bottom

  // Fetch barycentric positions when feature IDs change
  // Memoization is handled in the store - it skips API call if data is already cached
  useEffect(() => {
    if (featureIds.length < 3) {
      clearUmapProjection()
      return
    }

    // Store handles memoization: skips API call if same featureIds already fetched
    fetchUmapProjection(featureIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions have stable references
  }, [featureIds])

  // Fetch SVM classification when manual tags change (separate from positions)
  // Uses ref-based guard to prevent infinite loops
  useEffect(() => {
    // Guard 1: CRITICAL - Check signature FIRST to prevent effect from running unnecessarily
    // This breaks the infinite loop by ensuring the effect exits early when manual tags haven't changed
    if (!manualTagsSignature || manualTagsSignature === lastFetchedSignatureRef.current) {
      return
    }

    // Guard 2: Prevent duplicate in-flight requests
    if (causeClassificationLoading) {
      return
    }

    // Guard 3: Only fetch classification when we have enough features and all categories tagged
    // Note: canUseDecisionSpace accessed via closure (not in deps) to prevent triggering on auto-tag updates
    if (featureIds.length >= 3 && canUseDecisionSpace) {
      lastFetchedSignatureRef.current = manualTagsSignature
      fetchCauseClassification(featureIds, manualCauseSelections)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canUseDecisionSpace, manualCauseSelections accessed via closure; Zustand actions stable
  }, [featureIds, manualTagsSignature])

  // Read contour styling from CSS variables (enables hot-reload when editing CSS)
  const [contourStyle, setContourStyle] = useState({
    fillOpacity: 0.1,
    strokeOpacity: 1,
    strokeWidth: 2,
    bandwidth: 10,
    levels: 6
  })

  useEffect(() => {
    const el = containerElRef.current
    if (!el) return
    const styles = getComputedStyle(el)
    setContourStyle({
      fillOpacity: parseFloat(styles.getPropertyValue('--contour-fill-opacity')) || 0.12,
      strokeOpacity: parseFloat(styles.getPropertyValue('--contour-stroke-opacity')) || 0.5,
      strokeWidth: parseFloat(styles.getPropertyValue('--contour-stroke-width')) || 1,
      bandwidth: parseFloat(styles.getPropertyValue('--contour-bandwidth')) || 20,
      levels: parseInt(styles.getPropertyValue('--contour-levels')) || 4
    })
  }, [])

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

  // Get set of manually tagged feature IDs for rendering
  const manuallyTaggedIds = useMemo(() => {
    return new Set(Object.keys(manualCauseSelections).map(Number))
  }, [manualCauseSelections])

  // Determine if we're in "Top" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && sortDirection === 'desc'

  // Get effective category for a feature - delegates to utility function
  const getEffectiveCategory = useCallback((featureId: number): FilterCategory => {
    return getEffectiveCategoryUtil(
      featureId,
      causeSelectionStates as Map<number, CauseCategory>,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold
    )
  }, [causeSelectionStates, causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold])

  // Check if feature is visible based on mode and threshold - delegates to utility function
  const isVisibleInCurrentMode = useCallback((featureId: number): boolean => {
    return isFeatureVisibleInMode(
      featureId,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold,
      isTopMode
    )
  }, [causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold, isTopMode])

  // Filter spread points by visibility (mode-based) and category filter
  const filteredSpreadPoints = useMemo(() => {
    if (!spreadPoints) return null
    return spreadPoints.filter(point => {
      // First check mode-based visibility (threshold)
      if (!isVisibleInCurrentMode(point.feature_id)) return false
      // In Top mode, apply filterByTag if set
      if (isTopMode) {
        if (filterByTag) {
          const predicted = causeSelectionStates.get(point.feature_id)
          return predicted === filterByTag
        }
        return true
      }
      // In Low mode, apply category filter
      const category = getEffectiveCategory(point.feature_id)
      return visibleCategories.has(category)
    })
  }, [spreadPoints, isVisibleInCurrentMode, getEffectiveCategory, visibleCategories, isTopMode, filterByTag, causeSelectionStates])

  // Triangle grid disabled - using density heatmap instead
  // const gridState = useMemo(() => {
  //   if (!filteredSpreadPoints || filteredSpreadPoints.length === 0) return null
  //   return computeTriangleGrid(filteredSpreadPoints)
  // }, [filteredSpreadPoints])

  // Compute category contours for visualization
  // Uses ALL spread points (not filtered by visibility) so contours always show as context
  // Excludes manually tagged features - contours represent predictions/auto-tags only
  const categoryContours = useMemo(() => {
    if (!spreadPoints || spreadPoints.length < 3 || !scales || chartWidth <= 0 || chartHeight <= 0) {
      return []
    }
    return computeCategoryContours(
      spreadPoints,  // Use all points, not filtered by visibility
      causeSelectionStates as Map<number, CauseCategory>,
      causeSelectionSources,  // Pass sources to exclude manual tags
      chartWidth,
      chartHeight,
      scales,
      contourStyle.bandwidth,
      contourStyle.levels,
      true  // excludeManual = true
    )
  }, [spreadPoints, causeSelectionStates, causeSelectionSources, chartWidth, chartHeight, scales, contourStyle.bandwidth, contourStyle.levels])

  // Grid-related code disabled - using density heatmap instead
  // const maxCellCount = useMemo(() => {
  //   if (!gridState) return 1
  //   let max = 1
  //   for (const cellKey of gridState.leafCells) {
  //     const cell = gridState.cells.get(cellKey)
  //     if (cell) max = Math.max(max, cell.featureIds.size)
  //   }
  //   return max
  // }, [gridState])

  // const getStrokeWidth = useCallback((count: number) => {
  //   const minStroke = 0.3
  //   const maxStroke = 3.5
  //   const ratio = count / maxCellCount
  //   return minStroke + ratio * (maxStroke - minStroke)
  // }, [maxCellCount])

  // Auto-select disabled - no grid cells
  // useEffect(() => {
  //   if (!gridState || umapBrushedFeatureIds.size > 0) return
  //   for (const cellKey of gridState.leafCells) {
  //     const cell = gridState.cells.get(cellKey)
  //     if (cell && cell.featureIds.size > 0) {
  //       setUmapBrushedFeatureIds(cell.featureIds)
  //       break
  //     }
  //   }
  // }, [gridState, umapBrushedFeatureIds.size, setUmapBrushedFeatureIds])

  // Cell tooltip disabled - no grid cells
  // const hoveredCellComposition = useMemo(() => {
  //   if (!hoveredCell || !gridState) return null
  //   const cell = gridState.cells.get(hoveredCell.cellKey)
  //   if (!cell) return null
  //   const counts = {
  //     wellExplained: { manual: 0, auto: 0 },
  //     noisyActivation: { manual: 0, auto: 0 },
  //     patternMiss: { manual: 0, auto: 0 },
  //     contextMiss: { manual: 0, auto: 0 },
  //     unsure: 0
  //   }
  //   cell.featureIds.forEach(featureId => {
  //     const category = getEffectiveCategory(featureId)
  //     const source = causeSelectionSources.get(featureId)
  //     const isManual = source === 'manual'
  //     switch (category) {
  //       case 'well-explained':
  //         isManual ? counts.wellExplained.manual++ : counts.wellExplained.auto++
  //         break
  //       case 'noisy-activation':
  //         isManual ? counts.noisyActivation.manual++ : counts.noisyActivation.auto++
  //         break
  //       case 'missed-N-gram':
  //         isManual ? counts.patternMiss.manual++ : counts.patternMiss.auto++
  //         break
  //       case 'missed-context':
  //         isManual ? counts.contextMiss.manual++ : counts.contextMiss.auto++
  //         break
  //       default:
  //         counts.unsure++
  //     }
  //   })
  //   return { ...counts, total: cell.featureIds.size }
  // }, [hoveredCell, gridState, getEffectiveCategory, causeSelectionSources])

  // Render ALL filtered points (category contours show distribution)
  const pointsToRender = filteredSpreadPoints || []

  // Compute explainer label positions for HTML rendering (crisp text)
  // Show all explainers: best (at main point) + others
  const explainerLabels = useMemo(() => {
    if (!scales || !spreadPoints || selectedFeatureId == null) return []

    const selectedPoint = spreadPoints.find(p => p.feature_id === selectedFeatureId)
    if (!selectedPoint?.explainer_positions) return []

    return selectedPoint.explainer_positions.map(ep => ({
      explainer: ep.explainer,
      shortName: EXPLAINER_SHORT_NAMES[ep.explainer] || ep.explainer,
      x: scales.xScale(ep.x),
      y: scales.yScale(ep.y),
      isBest: ep.is_best
    }))
  }, [scales, spreadPoints, selectedFeatureId])

  // Track if cursor is over a clickable point
  const [isOverPoint, setIsOverPoint] = useState(false)

  // Helper to find closest point within radius
  const findClosestPoint = useCallback((x: number, y: number, maxDist = 10) => {
    if (!filteredSpreadPoints || !scales) return null

    let closestPoint: typeof filteredSpreadPoints[0] | null = null
    let closestDist = maxDist

    for (const point of filteredSpreadPoints) {
      const px = scales.xScale(point.x)
      const py = scales.yScale(point.y)
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (dist < closestDist) {
        closestDist = dist
        closestPoint = point
      }
    }
    return closestPoint
  }, [filteredSpreadPoints, scales])

  // Click handler for point selection
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onFeatureSelect) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const closestPoint = findClosestPoint(x, y)
    if (closestPoint) {
      onFeatureSelect(closestPoint.feature_id)
    }
  }, [findClosestPoint, onFeatureSelect])

  // Mouse move handler to update cursor
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const closestPoint = findClosestPoint(x, y)
    setIsOverPoint(closestPoint !== null)
  }, [findClosestPoint])

  // Reset cursor when leaving canvas
  const handleCanvasMouseLeave = useCallback(() => {
    setIsOverPoint(false)
  }, [])

  // Draw points on canvas: only on-demand points (manually tagged, brushed, selected)
  // Density heatmap shows overall distribution in background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pointsToRender || !scales || chartWidth <= 0 || chartHeight <= 0) {
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
    const brushedPointRadius = 2
    const manualPointAlpha = 1
    const untaggedPointAlpha = 0.4  // Alpha for auto-tagged points
    const unsurePointAlpha = 0.4    // Alpha for unsure points

    // Find the selected feature's point for explainer positions
    const selectedPoint = (selectedFeatureId != null && spreadPoints)
      ? spreadPoints.find(p => p.feature_id === selectedFeatureId)
      : null

    // Draw on-demand feature points (manually tagged, brushed, selected)
    for (const point of pointsToRender) {
      const isManual = manuallyTaggedIds.has(point.feature_id)
      const isSelected = point.feature_id === selectedFeatureId

      // Skip selected feature here - will draw it last on top
      if (isSelected) continue

      // Apply visibility filter - same logic as filteredSpreadPoints
      const effectiveCategory = getEffectiveCategory(point.feature_id)
      if (!isTopMode && !visibleCategories.has(effectiveCategory)) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)

      // Determine color based on effective category
      let color: string
      if (effectiveCategory === 'unsure') {
        color = DARK_UNSURE_GRAY
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
      } else if (effectiveCategory !== 'unsure') {
        // Above threshold (candidate): colored ring showing predicted category
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = untaggedPointAlpha
        ctx.stroke()
      } else {
        // Unsure points: gray ring (not filled)
        ctx.beginPath()
        ctx.arc(cx, cy, brushedPointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = DARK_UNSURE_GRAY
        ctx.lineWidth = 1
        ctx.globalAlpha = unsurePointAlpha
        ctx.stroke()
      }
    }

    // Draw selected feature and its explainer positions LAST (on top of everything)
    if (selectedPoint) {
      // Use effective category for selected point color too
      const selectedEffectiveCategory = getEffectiveCategory(selectedFeatureId!)
      let categoryColor: string
      if (selectedEffectiveCategory === 'unsure') {
        categoryColor = DARK_UNSURE_GRAY
      } else if (selectedEffectiveCategory === 'well-explained') {
        categoryColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
      } else {
        categoryColor = getCauseColor(selectedFeatureId!, causeSelectionStates as Map<number, CauseCategory>)
      }
      const selectionBlue = '#3b82f6'  // Blue highlight for selection indicator
      const bestX = scales.xScale(selectedPoint.x)
      const bestY = scales.yScale(selectedPoint.y)

      // Draw non-best explainer positions if available
      if (selectedPoint.explainer_positions && selectedPoint.explainer_positions.length > 0) {
        // Filter to non-best explainers only
        const nonBestExplainers = selectedPoint.explainer_positions.filter(ep => !ep.is_best)

        // Draw lines from best to each non-best explainer position
        ctx.strokeStyle = selectionBlue
        ctx.lineWidth = 2.5
        ctx.globalAlpha = 0.7
        ctx.setLineDash([4, 4])

        for (const ep of nonBestExplainers) {
          const epX = scales.xScale(ep.x)
          const epY = scales.yScale(ep.y)

          ctx.beginPath()
          ctx.moveTo(bestX, bestY)
          ctx.lineTo(epX, epY)
          ctx.stroke()
        }

        ctx.setLineDash([])

        // Draw non-best explainer points (circles only - labels rendered as HTML)
        for (const ep of nonBestExplainers) {
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

      // Draw selected feature point (best explainer position) - white background, blue ring
      const isSelectedManual = manuallyTaggedIds.has(selectedFeatureId!)
      const selectedPointRadius = brushedPointRadius + 2  // Bigger for visibility

      // White background circle for visibility
      ctx.beginPath()
      ctx.arc(bestX, bestY, selectedPointRadius + 2, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.globalAlpha = 1
      ctx.fill()

      // Blue selection ring (small)
      ctx.beginPath()
      ctx.arc(bestX, bestY, selectedPointRadius + 2.5, 0, Math.PI * 2)
      ctx.strokeStyle = selectionBlue
      ctx.lineWidth = 1
      ctx.stroke()

      // Point itself (slightly bigger, thicker)
      ctx.beginPath()
      ctx.arc(bestX, bestY, selectedPointRadius, 0, Math.PI * 2)
      ctx.globalAlpha = 1

      if (isSelectedManual) {
        // Manual: filled circle
        ctx.fillStyle = categoryColor
        ctx.fill()
      } else {
        // Auto-tagged or untagged: thicker hollow circle
        ctx.strokeStyle = categoryColor
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }

    // Reset alpha
    ctx.globalAlpha = 1
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleCategories is already accounted for via pointsToRender filtering
  }, [pointsToRender, spreadPoints, scales, causeSelectionStates, causeSelectionSources, manuallyTaggedIds, selectedFeatureId, chartWidth, chartHeight, getEffectiveCategory])


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
    <div ref={containerRef} className={`umap-scatter ${className}${causeClassificationLoading ? ' umap-scatter--training' : ''}`} style={containerStyle}>
      {/* Centered chart wrapper - square size, centered in container */}
      <div
        className="umap-scatter__chart-wrapper"
        style={{ width: size, height: size }}
      >
        {/* Chart area */}
        <div className="umap-scatter__chart">
        {/* SVG for contour fills (background layer - below points) */}
        <svg
          className="umap-scatter__svg umap-scatter__svg--fills"
          width={chartWidth}
          height={chartHeight}
          style={{ pointerEvents: 'none' }}
        >
          {/* Category contour fills only - hidden until enough manual tags */}
          {canUseDecisionSpace && categoryContours.map(({ category, color, paths }) => (
            <g key={category} className="umap-scatter__contour-group">
              {paths.map((path, i) => (
                <path
                  key={i}
                  d={path}
                  fill={color}
                  fillOpacity={contourStyle.fillOpacity * CONTOUR_CONFIG.levelOpacities[Math.min(i, CONTOUR_CONFIG.levelOpacities.length - 1)]}
                  stroke="none"
                />
              ))}
            </g>
          ))}

          {/* Triangle outline */}
          {trianglePath && (
            <path
              d={trianglePath}
              fill="none"
              stroke="#000"
              strokeWidth={0.5}
              className="umap-scatter__triangle-outline"
            />
          )}
        </svg>

        {/* Canvas for points (clickable) - middle layer */}
        <canvas
          ref={canvasRef}
          width={chartWidth * (window.devicePixelRatio || 1)}
          height={chartHeight * (window.devicePixelRatio || 1)}
          className="umap-scatter__canvas"
          style={{ width: chartWidth, height: chartHeight, cursor: isOverPoint ? 'pointer' : 'default' }}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />

        {/* SVG for contour strokes (top layer - above points) */}
        <svg
          ref={svgRef}
          className="umap-scatter__svg umap-scatter__svg--strokes"
          width={chartWidth}
          height={chartHeight}
          style={{ pointerEvents: 'none' }}
        >
          {/* Category contour strokes only - hidden until enough manual tags */}
          {canUseDecisionSpace && categoryContours.map(({ category, color, paths }) => (
            <g key={category} className="umap-scatter__contour-group">
              {paths.map((path, i) => (
                <path
                  key={i}
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={contourStyle.strokeWidth}
                  strokeOpacity={contourStyle.strokeOpacity}
                />
              ))}
            </g>
          ))}

          {/* Triangle cell grid disabled - using density heatmap instead */}
          {/* {gridState && scales && Array.from(gridState.leafCells).map(cellKey => {
            const cell = gridState.cells.get(cellKey)
            if (!cell || cell.featureIds.size === 0) return null
            const isSelected = umapBrushedFeatureIds.size > 0 &&
              cell.featureIds.size === umapBrushedFeatureIds.size &&
              [...cell.featureIds].every(id => umapBrushedFeatureIds.has(id))
            return (
              <polygon
                key={cell.key}
                points={cellToSvgPoints(cell, scales.xScale, scales.yScale)}
                className={`umap-scatter__grid-cell${isSelected ? ' umap-scatter__grid-cell--selected' : ''}`}
                style={{
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  strokeWidth: getStrokeWidth(cell.featureIds.size)
                }}
                onClick={() => setUmapBrushedFeatureIds(cell.featureIds)}
                onMouseEnter={(e) => setHoveredCell({ cellKey: cell.key, position: { x: e.clientX, y: e.clientY } })}
                onMouseMove={(e) => setHoveredCell(prev => prev ? { ...prev, position: { x: e.clientX, y: e.clientY } } : null)}
                onMouseLeave={() => setHoveredCell(null)}
              />
            )
          })} */}
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
        {/* Sort so best explainer renders last (on top) */}
        {[...explainerLabels].sort((a, b) => (a.isBest ? 1 : 0) - (b.isBest ? 1 : 0)).map(label => (
          <div
            key={label.explainer}
            className={`umap-scatter__explainer-label${label.isBest ? ' umap-scatter__explainer-label--best' : ''}`}
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

      {/* Classification loading indicator (subtle overlay) */}
      {causeClassificationLoading && (
        <div className="umap-scatter__classification-loading">
          <span className="umap-scatter__spinner umap-scatter__spinner--small" />
          <span>Updating...</span>
        </div>
      )}

      {/* Legend - explains visual encodings */}
      <div className="umap-scatter__unified-legend">
        <span className="instruction-subheader">Legend</span>
        <div className="umap-scatter__legend-section">
          {/* Filled circle = tagged */}
          <div className="umap-scatter__legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="4" fill="#686868" />
            </svg>
            <span>Tagged</span>
          </div>
          {/* Ring = untagged */}
          <div className="umap-scatter__legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="3.5" fill="none" stroke="#686868" strokeWidth="1.5" />
            </svg>
            <span>Untagged</span>
          </div>
          {/* Contour = prediction density */}
          <div className="umap-scatter__legend-item">
            <svg width="20" height="14" viewBox="0 0 20 14">
              <ellipse cx="10" cy="7" rx="8" ry="5" fill="#686868" fillOpacity={contourStyle.fillOpacity} stroke="#686868" strokeWidth={contourStyle.strokeWidth} strokeOpacity={contourStyle.strokeOpacity} />
            </svg>
            <span>Prediction Density</span>
          </div>
        </div>
      </div>

    </div>
  )
}

export default React.memo(UMAPScatter)
