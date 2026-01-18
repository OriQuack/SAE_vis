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
import { getCauseColor, type CauseCategory } from '../lib/umap-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY } from '../lib/constants'
import {
  getEffectiveCategory as getEffectiveCategoryUtil,
  isFeatureVisibleInMode
} from '../lib/cause-tagging-utils'
import { isUserConfirmed } from '../lib/tagging-hooks'
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
  filterByTag?: CauseCategory | null
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
  filterByTag = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)

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
  const { canUseDecisionSpace, manualCauseSelections, manualTagCounts } = useMemo(() => {
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
      if (source === 'click') {
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
  }, [radVizPositions, isVisibleInCurrentMode, getEffectiveCategory, visibleCategories, isTopMode, filterByTag, causeSelectionStates])

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

  // Draw points on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scales || chartWidth <= 0 || chartHeight <= 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, chartWidth * dpr, chartHeight * dpr)
    ctx.scale(dpr, dpr)

    // No points to render if no RadViz positions
    if (!filteredRadVizPoints || filteredRadVizPoints.length === 0) {
      ctx.globalAlpha = 1
      return
    }

    // Point styling
    const pointRadius = 2
    const manualPointAlpha = 1
    const autoPointAlpha = 0.4
    const unsurePointAlpha = 0.4

    // Draw all points except selected
    for (const point of filteredRadVizPoints) {
      const isManual = manuallyTaggedIds.has(point.feature_id)
      const isSelected = point.feature_id === selectedFeatureId

      // Skip selected - draw it last
      if (isSelected) continue

      // Apply visibility filter
      const effectiveCategory = getEffectiveCategory(point.feature_id)
      if (!isTopMode && !visibleCategories.has(effectiveCategory)) continue

      const cx = scales.xScale(point.x)
      const cy = scales.yScale(point.y)

      // Determine color based on effective category
      let color: string
      if (effectiveCategory === 'unsure') {
        color = DARK_UNSURE_GRAY
      } else if (effectiveCategory === 'well-explained') {
        color = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
      } else {
        color = getCauseColor(point.feature_id, causeSelectionStates as Map<number, CauseCategory>)
      }

      if (isManual) {
        // Manual points: solid filled circles
        ctx.beginPath()
        ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = manualPointAlpha
        ctx.fill()
      } else if (effectiveCategory !== 'unsure') {
        // Auto-tagged: colored ring
        ctx.beginPath()
        ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = autoPointAlpha
        ctx.stroke()
      } else {
        // Unsure: gray ring
        ctx.beginPath()
        ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2)
        ctx.strokeStyle = DARK_UNSURE_GRAY
        ctx.lineWidth = 1
        ctx.globalAlpha = unsurePointAlpha
        ctx.stroke()
      }
    }

    // Draw selected point LAST (on top)
    if (selectedFeatureId != null) {
      const selectedPoint = filteredRadVizPoints.find(p => p.feature_id === selectedFeatureId)
      if (selectedPoint) {
        const selectedEffectiveCategory = getEffectiveCategory(selectedFeatureId)
        let categoryColor: string
        if (selectedEffectiveCategory === 'unsure') {
          categoryColor = DARK_UNSURE_GRAY
        } else if (selectedEffectiveCategory === 'well-explained') {
          categoryColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
        } else {
          categoryColor = getCauseColor(selectedFeatureId, causeSelectionStates as Map<number, CauseCategory>)
        }

        const selectionBlue = '#3b82f6'
        const cx = scales.xScale(selectedPoint.x)
        const cy = scales.yScale(selectedPoint.y)
        const isManual = manuallyTaggedIds.has(selectedFeatureId)
        const selectedPointRadius = pointRadius + 2

        // White background
        ctx.beginPath()
        ctx.arc(cx, cy, selectedPointRadius + 2, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 1
        ctx.fill()

        // Blue selection ring
        ctx.beginPath()
        ctx.arc(cx, cy, selectedPointRadius + 2.5, 0, Math.PI * 2)
        ctx.strokeStyle = selectionBlue
        ctx.lineWidth = 1
        ctx.stroke()

        // Point itself
        ctx.beginPath()
        ctx.arc(cx, cy, selectedPointRadius, 0, Math.PI * 2)
        ctx.globalAlpha = 1

        if (isManual) {
          ctx.fillStyle = categoryColor
          ctx.fill()
        } else {
          ctx.strokeStyle = categoryColor
          ctx.lineWidth = 3
          ctx.stroke()
        }
      }
    }

    ctx.globalAlpha = 1
  }, [filteredRadVizPoints, scales, causeSelectionStates, manuallyTaggedIds, selectedFeatureId, chartWidth, chartHeight, getEffectiveCategory, isTopMode, visibleCategories])

  // ============================================================================
  // RENDER
  // ============================================================================

  const containerStyle = { width: '100%', height: '100%' }

  // Empty state - no SVM data yet
  if (!radVizPositions || radVizPositions.length === 0) {
    return (
      <div ref={containerRef} className={`cause-radviz cause-radviz--empty ${className}`} style={containerStyle}>
        <div className="cause-radviz__placeholder">
          <span className="cause-radviz__main-instruction">
            Tag features to start SVM training
          </span>
          <div className="cause-radviz__progress-row">
            <div
              className="cause-radviz__progress-item"
              style={{ backgroundColor: getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#e69f00' }}
            >
              Pattern Miss: {manualTagCounts['missed-N-gram']} / {MIN_TAGS_PER_CATEGORY}
            </div>
            <div
              className="cause-radviz__progress-item"
              style={{ backgroundColor: getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#d55e00' }}
            >
              Context Miss: {manualTagCounts['missed-context']} / {MIN_TAGS_PER_CATEGORY}
            </div>
            <div
              className="cause-radviz__progress-item"
              style={{ backgroundColor: getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#cc79a7' }}
            >
              Noisy Activation: {manualTagCounts['noisy-activation']} / {MIN_TAGS_PER_CATEGORY}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`cause-radviz ${className}${causeClassificationLoading ? ' cause-radviz--training' : ''}`} style={containerStyle}>
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
                    key === 'missed-N-gram' ? (getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#e69f00') :
                    (getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#d55e00')
                  }
                  stroke="#fff"
                  strokeWidth={1}
                />
              )
            })}
          </svg>

          {/* Canvas for points (clickable) */}
          <canvas
            ref={canvasRef}
            width={chartWidth * (window.devicePixelRatio || 1)}
            height={chartHeight * (window.devicePixelRatio || 1)}
            className="cause-radviz__canvas"
            style={{ width: chartWidth, height: chartHeight, cursor: isOverPoint ? 'pointer' : 'default' }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
          />

          {/* Anchor labels positioned outside the circle */}
          {scales && (
            <>
              {/* Top anchor: Noisy Activation (90°) */}
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
              {/* Bottom-left anchor: Pattern Miss (210°) */}
              <div
                className="cause-radviz__vertex-label"
                style={{
                  left: scales.xScale(RADVIZ_ANCHORS['missed-N-gram'].x),
                  top: scales.yScale(RADVIZ_ANCHORS['missed-N-gram'].y),
                  transform: 'translate(-100%, 0) translateX(-8px)',
                  '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9ca3af'
                } as React.CSSProperties}
              >
                Pattern Miss
              </div>
              {/* Bottom-right anchor: Context Miss (330°) */}
              <div
                className="cause-radviz__vertex-label"
                style={{
                  left: scales.xScale(RADVIZ_ANCHORS['missed-context'].x),
                  top: scales.yScale(RADVIZ_ANCHORS['missed-context'].y),
                  transform: 'translate(0, 0) translateX(8px)',
                  '--tag-color': getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#9ca3af'
                } as React.CSSProperties}
              >
                Context Miss
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
      <div className="cause-radviz__unified-legend">
        <span className="instruction-subheader">Legend</span>
        <div className="cause-radviz__legend-section">
          {/* Filled circle = tagged */}
          <div className="cause-radviz__legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="4" fill="#686868" />
            </svg>
            <span>Tagged</span>
          </div>
          {/* Ring = untagged */}
          <div className="cause-radviz__legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="3.5" fill="none" stroke="#686868" strokeWidth="1.5" />
            </svg>
            <span>Untagged</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseRadViz)
