import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import { useResizeObserver } from '../lib/utils'
import {
  computeRadVizPositions,
  computeRadVizScales,
  getRadVizCircleParams,
  getAnchorPixelPosition,
  RADVIZ_ANCHORS,
  type RadVizPoint
} from '../lib/radviz-utils'
import { getCauseColor, computeCategoryContours, type CauseCategory, type CategoryContour } from '../lib/cause-visualization-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY } from '../lib/constants'
import {
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'
import { isUserConfirmed, type SelectionSource } from '../lib/tagging-hooks'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
import '../styles/CauseRadViz.css'

// ============================================================================
// CAUSE RADVIZ COMPONENT - RadViz visualization for cause categories
// ============================================================================
// Features positioned using softmax(decision_scores) as weights toward category anchors
// No points shown until SVM training begins (user must tag features first)

// Darker unsure gray for scatterplot points (better visibility on white background)
const DARK_UNSURE_GRAY = '#686868ff'

// Filter categories (includes unsure)
type FilterCategory = CauseCategory | 'unsure'

// Minimum manual tags required per cause category before SVM training
const MIN_TAGS_PER_CATEGORY = 2

// Cause categories for decision space validation (3 categories)
const CAUSE_CATEGORIES = ['noisy-activation', 'missed-N-gram', 'missed-context']

interface CauseRadVizProps {
  featureIds: number[]
  width?: number
  height?: number
  className?: string
  selectedFeatureId?: number | null
  visibleCategories?: Set<FilterCategory>
  onVisibleCategoriesChange?: (categories: Set<FilterCategory>) => void
  onFeatureSelect?: (featureId: number) => void
  sortMode?: SortMode
  sortDirection?: 'asc' | 'desc'
  hideTagged?: boolean
}

// Margin configuration
const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

const CauseRadViz: React.FC<CauseRadVizProps> = ({
  featureIds,
  width: propWidth,
  height: propHeight,
  className = '',
  selectedFeatureId = null,
  visibleCategories: propVisibleCategories,
  onFeatureSelect,
  sortMode = 'decisionMargin',
  sortDirection = 'asc',
  hideTagged = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)

  // Contour style configuration (read from CSS variables)
  const [contourStyle, setContourStyle] = useState({
    fillOpacity: 0.1,
    strokeOpacity: 0.5,
    strokeWidth: 1,
    bandwidth: 5,
    levels: 6
  })

  // Read CSS variables for contour styling
  useEffect(() => {
    const computedStyle = getComputedStyle(document.documentElement)
    const fillOpacity = parseFloat(computedStyle.getPropertyValue('--contour-fill-opacity')) || 0.12
    const strokeOpacity = parseFloat(computedStyle.getPropertyValue('--contour-stroke-opacity')) || 0.5
    const strokeWidth = parseFloat(computedStyle.getPropertyValue('--contour-stroke-width')) || 1
    const bandwidth = parseFloat(computedStyle.getPropertyValue('--contour-bandwidth')) || 20
    const levels = parseInt(computedStyle.getPropertyValue('--contour-levels'), 10) || 4

    setContourStyle({ fillOpacity, strokeOpacity, strokeWidth, bandwidth, levels })
  }, [])

  // Use standardized resize observer hook for consistent behavior
  const { ref: resizeRef, size: measuredSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: propWidth || 400,
    defaultHeight: propHeight || 400,
    debounceMs: 16,
    debugId: 'cause-radviz'
  })

  // Combined ref callback for both resize observer and element ref
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node
    resizeRef(node)
  }, [resizeRef])

  // Square proportion: use minimum of width/height to fit within container
  const size = Math.min(measuredSize.width, measuredSize.height) || propHeight || propWidth || 400

  // Store state
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)
  const fetchCauseClassification = useVisualizationStore(state => state.fetchCauseClassification)

  // Filter state: use prop if provided, fallback to local state
  const [localVisibleCategories] = useState<Set<FilterCategory>>(
    new Set(['unsure'])
  )
  const visibleCategories = propVisibleCategories ?? localVisibleCategories

  // Check if all 3 categories have MIN_TAGS_PER_CATEGORY manual tags (for SVM classification)
  // Both 'click' and 'threshold' sources count for SVM training (with different weights)
  const { canUseDecisionSpace, manualCauseSelections, manualTagCounts: _manualTagCounts } = useMemo(() => {
    const manualTags = new Map<string, number>()
    const selections: Record<number, { category: string; source: 'click' | 'threshold' }> = {}

    causeSelectionStates.forEach((category: string, featureId: number) => {
      const source = causeSelectionSources.get(featureId)
      // Include both 'click' and 'threshold' for weighted SVM training
      if (source === 'click' || source === 'threshold') {
        manualTags.set(category, (manualTags.get(category) || 0) + 1)
        selections[featureId] = { category, source }
      }
    })

    const counts: Record<string, number> = {}
    for (const cat of CAUSE_CATEGORIES) {
      counts[cat] = manualTags.get(cat) || 0
    }

    const missingCount = CAUSE_CATEGORIES.filter(cat => (manualTags.get(cat) || 0) < MIN_TAGS_PER_CATEGORY).length

    return {
      canUseDecisionSpace: missingCount === 0,
      manualCauseSelections: selections,
      manualTagCounts: counts
    }
  }, [causeSelectionStates, causeSelectionSources])

  // Compute signature of manual tags to use as stable dependency
  // This prevents infinite loops by only triggering when the SET of manual tag IDs changes
  const manualTagsSignature = useMemo(() => {
    const manualIds: number[] = []
    causeSelectionStates.forEach((_category, featureId) => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'click' || source === 'threshold') {
        manualIds.push(featureId)
      }
    })
    return manualIds.sort((a, b) => a - b).join(',')
  }, [causeSelectionStates, causeSelectionSources])

  // Track last signature that triggered API call to prevent duplicate requests
  const lastFetchedSignatureRef = useRef<string>('')

  // Fetch SVM classification when manual tags change
  // Uses ref-based guard to prevent infinite loops
  useEffect(() => {
    // Guard 1: Check signature FIRST to prevent effect from running unnecessarily
    if (!manualTagsSignature || manualTagsSignature === lastFetchedSignatureRef.current) {
      return
    }

    // Guard 2: Prevent duplicate in-flight requests
    if (causeClassificationLoading) {
      return
    }

    // Guard 3: Only fetch classification when we have enough features and all categories tagged
    if (featureIds.length >= 3 && canUseDecisionSpace) {
      lastFetchedSignatureRef.current = manualTagsSignature
      fetchCauseClassification(featureIds, manualCauseSelections)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canUseDecisionSpace, manualCauseSelections accessed via closure; Zustand actions stable
  }, [featureIds, manualTagsSignature])

  // Chart dimensions
  const chartWidth = size - MARGIN.left - MARGIN.right
  const chartHeight = size - MARGIN.top - MARGIN.bottom

  // Compute D3 scales
  const scales = useMemo(() => {
    if (chartWidth <= 0 || chartHeight <= 0) return null
    return computeRadVizScales(chartWidth, chartHeight)
  }, [chartWidth, chartHeight])

  // Generate circle outline params
  const circleParams = useMemo(() => {
    if (!scales) return null
    return getRadVizCircleParams(scales)
  }, [scales])

  // Determine if we're in "Top" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && sortDirection === 'desc'

  // Get effective category for a feature
  const getEffectiveCategory = useCallback((featureId: number): FilterCategory => {
    return getEffectiveCategoryUtil(
      featureId,
      causeSelectionStates as Map<number, CauseCategory>,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold
    )
  }, [causeSelectionStates, causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold])

  // Check if feature is visible based on mode and threshold
  const isVisibleInCurrentMode = useCallback((featureId: number): boolean => {
    return isFeatureVisibleInMode(
      featureId,
      causeSelectionSources,
      causeCategoryDecisionMargins,
      causeMarginThreshold,
      isTopMode
    )
  }, [causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold, isTopMode])

  // Compute RadViz positions from decision margins
  const radVizPositions = useMemo(() => {
    // No positions until SVM trained
    if (causeCategoryDecisionMargins.size === 0) return null

    return computeRadVizPositions(causeCategoryDecisionMargins, featureIds)
  }, [featureIds, causeCategoryDecisionMargins])

  // Filter RadViz points by visibility and category
  const filteredRadVizPoints = useMemo(() => {
    if (!radVizPositions) return null

    return radVizPositions.filter(point => {
      // First check mode-based visibility (threshold)
      if (!isVisibleInCurrentMode(point.feature_id)) return false

      // Hide user-confirmed tagged features when hideTagged is checked
      if (hideTagged && isUserConfirmed(causeSelectionSources.get(point.feature_id))) return false

      // In Top mode, show all visible features
      if (isTopMode) {
        return true
      }

      // In Low mode, apply category filter
      const category = getEffectiveCategory(point.feature_id)
      return visibleCategories.has(category)
    })
  }, [radVizPositions, isVisibleInCurrentMode, getEffectiveCategory, visibleCategories, isTopMode, hideTagged, causeSelectionSources])

  // Get set of manually tagged feature IDs for rendering
  const manuallyTaggedIds = useMemo(() => {
    const ids = new Set<number>()
    causeSelectionSources.forEach((source, featureId) => {
      if (isUserConfirmed(source)) {
        ids.add(featureId)
      }
    })
    return ids
  }, [causeSelectionSources])

  // ============================================================================
  // CONTOUR COMPUTATION
  // ============================================================================
  // Convert RadViz points to UmapPoint format for contour computation
  const contourPoints = useMemo(() => {
    if (!filteredRadVizPoints || filteredRadVizPoints.length < 3) return []
    return filteredRadVizPoints.map(point => ({
      feature_id: point.feature_id,
      x: point.x,
      y: point.y,
      cluster_id: 0  // Not used in RadViz but required by UmapPoint type
    }))
  }, [filteredRadVizPoints])

  // Compute density contours
  // Train stage (not isTopMode): Single gray contour for all unsure features
  // Apply stage (isTopMode): Separate colored contours per predicted category
  const categoryContours = useMemo((): CategoryContour[] => {
    if (!scales || !contourPoints || contourPoints.length < 3) return []
    if (chartWidth <= 0 || chartHeight <= 0) return []

    if (isTopMode) {
      // Apply stage: Separate contours per category (show predicted categories)
      return computeCategoryContours(
        contourPoints,
        causeSelectionStates as Map<number, CauseCategory>,
        causeSelectionSources as Map<number, SelectionSource>,
        chartWidth,
        chartHeight,
        scales,
        contourStyle.bandwidth,
        contourStyle.levels,
        true  // excludeManual: show predictions only in contours
      )
    } else {
      // Train stage: Single contour for all unsure features
      // Pass empty causeStates so all points are treated as "unsure"
      return computeCategoryContours(
        contourPoints,
        new Map<number, CauseCategory>(),  // Empty = all points are unsure
        new Map<number, SelectionSource>(),
        chartWidth,
        chartHeight,
        scales,
        contourStyle.bandwidth,
        contourStyle.levels,
        false  // Don't exclude anything - show all points
      )
    }
  }, [contourPoints, causeSelectionStates, causeSelectionSources, chartWidth, chartHeight, scales, contourStyle.bandwidth, contourStyle.levels, isTopMode])

  // Track if cursor is over a clickable point
  const [isOverPoint, setIsOverPoint] = useState(false)

  // Helper to find closest point within radius
  const findClosestPoint = useCallback((x: number, y: number, maxDist = 10) => {
    if (!filteredRadVizPoints || !scales) return null

    let closestPoint: RadVizPoint | null = null
    let closestDist = maxDist

    for (const point of filteredRadVizPoints) {
      const px = scales.xScale(point.x)
      const py = scales.yScale(point.y)
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (dist < closestDist) {
        closestDist = dist
        closestPoint = point
      }
    }
    return closestPoint
  }, [filteredRadVizPoints, scales])

  // Click handler for point selection (works with SVG)
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onFeatureSelect) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const closestPoint = findClosestPoint(x, y, 20)  // Larger radius for contour-based selection
    if (closestPoint) {
      onFeatureSelect(closestPoint.feature_id)
    }
  }, [findClosestPoint, onFeatureSelect])

  // Mouse move handler to update cursor
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const closestPoint = findClosestPoint(x, y, 20)
    setIsOverPoint(closestPoint !== null)
  }, [findClosestPoint])

  // Reset cursor when leaving SVG
  const handleSvgMouseLeave = useCallback(() => {
    setIsOverPoint(false)
  }, [])

  // Compute selected point data for SVG rendering
  const selectedPointData = useMemo(() => {
    if (selectedFeatureId == null || !filteredRadVizPoints || !scales) return null

    const selectedPoint = filteredRadVizPoints.find(p => p.feature_id === selectedFeatureId)
    if (!selectedPoint) return null

    const effectiveCategory = getEffectiveCategory(selectedFeatureId)
    let categoryColor: string
    if (effectiveCategory === 'unsure') {
      categoryColor = DARK_UNSURE_GRAY
    } else if (effectiveCategory === 'well-explained') {
      categoryColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
    } else {
      categoryColor = getCauseColor(selectedFeatureId, causeSelectionStates as Map<number, CauseCategory>)
    }

    return {
      cx: scales.xScale(selectedPoint.x),
      cy: scales.yScale(selectedPoint.y),
      color: categoryColor,
      isManual: manuallyTaggedIds.has(selectedFeatureId)
    }
  }, [selectedFeatureId, filteredRadVizPoints, scales, getEffectiveCategory, causeSelectionStates, manuallyTaggedIds])

  // ============================================================================
  // RENDER
  // ============================================================================

  // No inline styles - dimensions set by CSS (.cause-radviz has fixed 260px width)

  // Empty state - no SVM data yet
  if (!radVizPositions || radVizPositions.length === 0) {
    return (
      <div ref={containerRef} className={`cause-radviz cause-radviz--empty ${className}`}>
        <div className="cause-radviz__placeholder">
          <span className="cause-radviz__placeholder-text">
            <span className="cause-radviz__stage-number">2</span> Wait for histogram to see plot.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`cause-radviz ${className}${causeClassificationLoading ? ' cause-radviz--training' : ''}`}>
      {/* Centered chart wrapper */}
      <div
        className="cause-radviz__chart-wrapper"
        style={{ width: size, height: size }}
      >
        <div className="cause-radviz__chart">
          {/* SVG for circle outline (background) */}
          <svg
            className="cause-radviz__svg cause-radviz__svg--background"
            width={chartWidth}
            height={chartHeight}
            style={{ pointerEvents: 'none' }}
          >
            {/* Circle outline */}
            {circleParams && (
              <circle
                cx={circleParams.cx}
                cy={circleParams.cy}
                r={circleParams.r}
                fill="none"
                stroke="#000"
                strokeWidth={0.5}
                className="cause-radviz__circle-outline"
              />
            )}
            {/* Anchor markers on circle edge */}
            {scales && Object.entries(RADVIZ_ANCHORS).map(([key, _anchor]) => {
              const pos = getAnchorPixelPosition(key, scales)
              if (!pos) return null
              return (
                <circle
                  key={key}
                  cx={pos.x}
                  cy={pos.y}
                  r={4}
                  fill={
                    key === 'noisy-activation' ? (getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#cc79a7') :
                    key === 'missed-N-gram' ? (getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#e69f00') :
                    (getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#d55e00')
                  }
                  stroke="#fff"
                  strokeWidth={1}
                />
              )
            })}
          </svg>

          {/* SVG for contours and interaction (replaces canvas) */}
          <svg
            ref={svgRef}
            className="cause-radviz__svg cause-radviz__svg--contours"
            width={chartWidth}
            height={chartHeight}
            style={{ cursor: isOverPoint ? 'pointer' : 'default' }}
            onClick={handleSvgClick}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
          >
            {/* Clip path to constrain contours within circle */}
            <defs>
              {circleParams && (
                <clipPath id="radviz-circle-clip">
                  <circle
                    cx={circleParams.cx}
                    cy={circleParams.cy}
                    r={circleParams.r}
                  />
                </clipPath>
              )}
            </defs>

            {/* Contour fill layers (background) - clipped to circle */}
            <g className="cause-radviz__contour-fills" clipPath="url(#radviz-circle-clip)">
              {categoryContours.map((categoryContour) => (
                <g key={`fill-${categoryContour.category}`} className={`cause-radviz__contour-category cause-radviz__contour-category--${categoryContour.category}`}>
                  {categoryContour.paths.map((pathString, i) => {
                    // Progressive opacity: outer contours lighter, inner contours more opaque
                    const levelOpacity = (i + 1) / categoryContour.paths.length
                    return (
                      <path
                        key={`fill-${i}`}
                        d={pathString}
                        fill={categoryContour.color}
                        fillOpacity={contourStyle.fillOpacity * levelOpacity}
                        stroke="none"
                      />
                    )
                  })}
                </g>
              ))}
            </g>

            {/* Contour stroke layers - clipped to circle */}
            <g className="cause-radviz__contour-strokes" clipPath="url(#radviz-circle-clip)">
              {categoryContours.map((categoryContour) => (
                <g key={`stroke-${categoryContour.category}`} className={`cause-radviz__contour-category cause-radviz__contour-category--${categoryContour.category}`}>
                  {categoryContour.paths.map((pathString, i) => (
                    <path
                      key={`stroke-${i}`}
                      d={pathString}
                      fill="none"
                      stroke={categoryContour.color}
                      strokeWidth={contourStyle.strokeWidth}
                      strokeOpacity={contourStyle.strokeOpacity}
                    />
                  ))}
                </g>
              ))}
            </g>

            {/* Points layer - show individual features */}
            <g className="cause-radviz__points">
              {filteredRadVizPoints && scales && filteredRadVizPoints.map(point => {
                // Skip selected point - render it last on top
                if (point.feature_id === selectedFeatureId) return null

                const cx = scales.xScale(point.x)
                const cy = scales.yScale(point.y)
                const isManual = manuallyTaggedIds.has(point.feature_id)
                const effectiveCategory = getEffectiveCategory(point.feature_id)

                // Determine color
                let color: string
                if (effectiveCategory === 'unsure') {
                  color = DARK_UNSURE_GRAY
                } else if (effectiveCategory === 'well-explained') {
                  color = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
                } else {
                  color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)
                }

                if (isManual) {
                  // Manual: filled circle
                  return (
                    <circle
                      key={point.feature_id}
                      cx={cx}
                      cy={cy}
                      r={2.5}
                      fill={color}
                      className="cause-radviz__point cause-radviz__point--manual"
                    />
                  )
                } else {
                  // Auto/unsure: ring
                  return (
                    <circle
                      key={point.feature_id}
                      cx={cx}
                      cy={cy}
                      r={2}
                      fill="none"
                      stroke={color}
                      strokeWidth={1}
                      opacity={effectiveCategory === 'unsure' ? 0.4 : 0.6}
                      className="cause-radviz__point cause-radviz__point--auto"
                    />
                  )
                }
              })}
            </g>

            {/* Selected point highlight (on top) */}
            {selectedPointData && (
              <g className="cause-radviz__selected-point">
                {/* White background */}
                <circle
                  cx={selectedPointData.cx}
                  cy={selectedPointData.cy}
                  r={6}
                  fill="#fff"
                />
                {/* Blue selection ring */}
                <circle
                  cx={selectedPointData.cx}
                  cy={selectedPointData.cy}
                  r={6.5}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1}
                />
                {/* Point itself */}
                {selectedPointData.isManual ? (
                  <circle
                    cx={selectedPointData.cx}
                    cy={selectedPointData.cy}
                    r={4}
                    fill={selectedPointData.color}
                  />
                ) : (
                  <circle
                    cx={selectedPointData.cx}
                    cy={selectedPointData.cy}
                    r={4}
                    fill="none"
                    stroke={selectedPointData.color}
                    strokeWidth={3}
                  />
                )}
              </g>
            )}
          </svg>

          {/* Anchor labels positioned outside the circle with rotation */}
          {scales && (
            <>
              {/* Top anchor: Noisy Activation (90°) - horizontal */}
              <div
                className="cause-radviz__vertex-label"
                style={{
                  left: scales.xScale(RADVIZ_ANCHORS['noisy-activation'].x),
                  top: scales.yScale(RADVIZ_ANCHORS['noisy-activation'].y),
                  transform: 'translate(-50%, -100%) translateY(-8px)',
                  '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
                } as React.CSSProperties}
              >
                Noisy Activation
              </div>
              {/* Bottom-left anchor: Missed Syntax (210°) - rotated 60° clockwise for radial alignment */}
              <div
                className="cause-radviz__vertex-label"
                style={{
                  left: scales.xScale(RADVIZ_ANCHORS['missed-N-gram'].x),
                  top: scales.yScale(RADVIZ_ANCHORS['missed-N-gram'].y),
                  transform: 'translate(-100%, 150%) rotate(60deg)',
                  transformOrigin: 'right center',
                  '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#9ca3af'
                } as React.CSSProperties}
              >
                Missed Syntax
              </div>
              {/* Bottom-right anchor: Missed Context (330°) - rotated 60° counterclockwise for radial alignment */}
              <div
                className="cause-radviz__vertex-label"
                style={{
                  left: scales.xScale(RADVIZ_ANCHORS['missed-context'].x),
                  top: scales.yScale(RADVIZ_ANCHORS['missed-context'].y),
                  transform: 'translate(0%, 150%) rotate(-60deg)',
                  transformOrigin: 'left center',
                  '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'
                } as React.CSSProperties}
              >
                Missed Context
              </div>
            </>
          )}
        </div>
      </div>

      {/* Classification loading indicator */}
      {causeClassificationLoading && (
        <div className="cause-radviz__classification-loading">
          <span className="cause-radviz__spinner cause-radviz__spinner--small" />
          <span>Updating...</span>
        </div>
      )}

      {/* Legend */}
      <div className="cause-radviz__legend">
        <div className="cause-radviz__legend-item">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="3" fill="#686868" />
          </svg>
          <span>Manual</span>
        </div>
        <div className="cause-radviz__legend-item">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="2.5" fill="none" stroke="#686868" strokeWidth="1" />
          </svg>
          <span>Auto</span>
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseRadViz)
