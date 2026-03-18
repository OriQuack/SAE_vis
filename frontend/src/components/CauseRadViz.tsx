import React, { useRef, useMemo, useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
import { computeCauseSignature } from '../store/utils'
import { useResizeObserver } from '../lib/utils'
import { hexbin as d3Hexbin } from 'd3-hexbin'
import {
  computeRadVizPositions,
  computeRadVizScales,
  getRadVizCircleParams,
  getAnchorPixelPosition,
  RADVIZ_ANCHORS,
  computeHexbinData
} from '../lib/radviz-utils'
import { getCauseColor, type CauseCategory } from '../lib/cause-visualization-utils'
import { getTagColor } from '../lib/tag-system'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY, SELECTION_BLUE } from '../lib/constants'
import { isUserConfirmed } from '../lib/tagging-hooks'
import type { ActiveStage } from '../lib/tagging-hooks/useSortableList'
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
  activeStage?: ActiveStage
  hideTagged?: boolean
}


const CauseRadViz: React.FC<CauseRadVizProps> = ({
  featureIds,
  width: propWidth,
  height: propHeight,
  className = '',
  selectedFeatureId = null,
  activeStage,
  hideTagged = false
}) => {
  // Use standardized resize observer hook for consistent behavior
  const { ref: containerRef, size: measuredSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: propWidth || 400,
    defaultHeight: propHeight || 400,
    debounceMs: 16,
    debugId: 'cause-radviz'
  })

  // Square proportion: use minimum of width/height to fit within container
  const size = Math.min(measuredSize.width, measuredSize.height) || propHeight || propWidth || 400

  // Store state
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeCategoryDecisionMargins = useVisualizationStore(state => state.causeCategoryDecisionMargins)
  const causeDecisionMargins = useVisualizationStore(state => state.causeDecisionMargins)
  const causeClassificationLoading = useVisualizationStore(state => state.causeClassificationLoading)
  const causeMarginThreshold = useVisualizationStore(state => state.causeMarginThreshold)
  const fetchCauseClassification = useVisualizationStore(state => state.fetchCauseClassification)
  const causeLastClassificationSignature = useVisualizationStore(state => state.causeLastClassificationSignature)

  // Check if all 3 categories have MIN_TAGS_PER_CATEGORY manual tags (for SVM classification)
  // Both 'click' and 'threshold' sources count for SVM training (with different weights)
  const { canUseDecisionSpace, manualCauseSelections } = useMemo(() => {
    const manualTags = new Map<string, number>()
    const selections: Record<number, { category: string; source: 'click' | 'threshold' }> = {}

    causeSelectionStates.forEach((category: string, featureId: number) => {
      const source = causeSelectionSources.get(featureId)
      // Include both 'click' and 'threshold' for weighted SVM training
      // Exclude well-explained (non-cause) categories from SVM training data
      if ((source === 'click' || source === 'threshold') && CAUSE_CATEGORIES.includes(category)) {
        manualTags.set(category, (manualTags.get(category) || 0) + 1)
        selections[featureId] = { category, source }
      }
    })

    const missingCount = CAUSE_CATEGORIES.filter(cat => (manualTags.get(cat) || 0) < MIN_TAGS_PER_CATEGORY).length

    return {
      canUseDecisionSpace: missingCount === 0,
      manualCauseSelections: selections,
    }
  }, [causeSelectionStates, causeSelectionSources])

  // Compute signature of manual tags to use as stable dependency
  // This prevents infinite loops by only triggering when the SET of manual tag IDs changes
  // Uses shared computeCauseSignature to guarantee format consistency with store's causeLastClassificationSignature
  const manualTagsSignature = useMemo(() => {
    return computeCauseSignature(
      causeSelectionStates as Map<number, string>,
      causeSelectionSources as Map<number, string>
    )
  }, [causeSelectionStates, causeSelectionSources])

  // Track last signature that triggered API call to prevent duplicate requests
  const lastFetchedSignatureRef = useRef<string>('')

  // Sync ref from store field so commit restoration (which sets the store signature)
  // prevents this effect from re-triggering classification
  useEffect(() => {
    if (causeLastClassificationSignature !== null) {
      lastFetchedSignatureRef.current = causeLastClassificationSignature
    }
  }, [causeLastClassificationSignature])

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

  // Chart dimensions (same as size — no margins)
  const chartWidth = size
  const chartHeight = size

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

  // Compute RadViz positions from decision margins
  const radVizPositions = useMemo(() => {
    // No positions until SVM trained
    if (causeCategoryDecisionMargins.size === 0) return null

    return computeRadVizPositions(causeCategoryDecisionMargins, featureIds)
  }, [featureIds, causeCategoryDecisionMargins])

  // Filter RadViz points — always show all features, only apply hideTagged
  const filteredRadVizPoints = useMemo(() => {
    if (!radVizPositions) return null

    return radVizPositions.filter(point => {
      // hideTagged: hide user-confirmed tagged features
      if (hideTagged && isUserConfirmed(causeSelectionSources.get(point.feature_id))) return false
      return true
    })
  }, [radVizPositions, hideTagged, causeSelectionSources])


  // ============================================================================
  // HEXBIN AGGREGATION
  // ============================================================================
  const HEX_RADIUS = 6

  // Get color for a category (used in hexbin computation)
  const getCategoryColor = useCallback((category: string): string => {
    if (category === 'unsure') return DARK_UNSURE_GRAY
    if (category === 'well-explained') return getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#59a14f'
    // For cause categories, use cause color (need a dummy map lookup)
    const dummyMap = new Map<number, CauseCategory>([[0, category as CauseCategory]])
    return getCauseColor(0, dummyMap)
  }, [])

  // Threshold-based coloring: above threshold = category color, below = gray
  // Manual tags always show color; bootstrap = all non-manual gray
  const hexbinGetCategory = useCallback((featureId: number): FilterCategory => {
    const tag = causeSelectionStates.get(featureId)
    const source = causeSelectionSources.get(featureId)

    // Rule 1: Manual tags (click/threshold) always show category color
    if (tag && isUserConfirmed(source)) return tag as FilterCategory

    // Rule 2: Bootstrap (no threshold visualization) — non-manual = gray
    if ((activeStage ?? 'bootstrap') === 'bootstrap') return 'unsure'

    // Rule 3: Learn/Apply — above threshold = category color, below = gray
    if (tag) {
      const margin = causeDecisionMargins.get(featureId) ?? 0
      return margin >= causeMarginThreshold ? tag as FilterCategory : 'unsure'
    }

    return 'unsure'
  }, [activeStage, causeSelectionStates, causeSelectionSources, causeDecisionMargins, causeMarginThreshold])

  // Compute hexbin data from filtered points
  const hexbinData = useMemo(() => {
    if (!filteredRadVizPoints || !scales || filteredRadVizPoints.length === 0) return []
    return computeHexbinData(
      filteredRadVizPoints,
      scales,
      HEX_RADIUS,
      hexbinGetCategory,
      getCategoryColor
    )
  }, [filteredRadVizPoints, scales, hexbinGetCategory, getCategoryColor])

  // Precompute hexagon path for reuse
  const hexagonPath = useMemo(() => {
    return d3Hexbin().radius(HEX_RADIUS).hexagon()
  }, [])

  // Max count for opacity normalization
  const maxHexCount = useMemo(() => {
    if (hexbinData.length === 0) return 1
    return Math.max(1, ...hexbinData.map(h => h.count))
  }, [hexbinData])

  // Compute selected point data for SVG rendering
  // Falls back to unfiltered positions when selected feature is hidden by hideTagged
  const selectedPointData = useMemo(() => {
    if (selectedFeatureId == null || !scales) return null
    const point = filteredRadVizPoints?.find(p => p.feature_id === selectedFeatureId)
      ?? radVizPositions?.find(p => p.feature_id === selectedFeatureId)
    if (!point) return null
    return {
      cx: scales.xScale(point.x),
      cy: scales.yScale(point.y),
    }
  }, [selectedFeatureId, filteredRadVizPoints, radVizPositions, scales])

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

          {/* SVG for hexbins and interaction */}
          <svg
            className="cause-radviz__svg cause-radviz__svg--contours"
            width={chartWidth}
            height={chartHeight}
            style={{ pointerEvents: 'none' }}
          >
            {/* Clip path to constrain hexbins within circle */}
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

            {/* Hexbin density layer - clipped to circle */}
            <g className="cause-radviz__hexbins" clipPath="url(#radviz-circle-clip)">
              {hexbinData.map((hex, i) => {
                const opacity = 0.15 + 0.75 * (hex.count / maxHexCount)
                return (
                  <path
                    key={i}
                    className="cause-radviz__hexbin"
                    d={hexagonPath}
                    transform={`translate(${hex.cx},${hex.cy})`}
                    fill={hex.color}
                    fillOpacity={opacity}
                    stroke={hex.color}
                    strokeWidth={0.5}
                    strokeOpacity={opacity * 0.5}
                  />
                )
              })}
            </g>

            {/* Selected point pin marker (on top) */}
            {selectedPointData && (
              <g
                className="cause-radviz__selected-point"
                transform={`translate(${selectedPointData.cx},${selectedPointData.cy})`}
              >
                {/* Pin shape: tip at (0,0), head circle at (0,-14) */}
                <path
                  d="M0,0 C-3,-5 -5,-10 -5,-14 A5,5 0 1 1 5,-14 C5,-10 3,-5 0,0Z"
                  fill={SELECTION_BLUE.DEFAULT}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                {/* Inner dot on pin head */}
                <circle
                  cx={0}
                  cy={-14}
                  r={2}
                  fill="#fff"
                />
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
                  transform: 'translate(-50%, -100%) translate(8px, -8px)',
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

      {/* Legend (top-left) */}
      <div className="cause-radviz__legend">
        <div className="cause-radviz__legend-item">
          <svg className="cause-radviz__legend-pin" width="10" height="16" viewBox="-6 -21 12 22">
            <path
              d="M0,0 C-3,-5 -5,-10 -5,-14 A5,5 0 1 1 5,-14 C5,-10 3,-5 0,0Z"
              fill={SELECTION_BLUE.DEFAULT}
              stroke="#fff"
              strokeWidth={1}
            />
            <circle cx={0} cy={-14} r={1.5} fill="#fff" />
          </svg>
          <span>Selected</span>
        </div>
        <div className="cause-radviz__legend-item">
          <span className="cause-radviz__legend-gradient" />
          <span>Density</span>
        </div>
        {(activeStage === 'learn' || activeStage === 'apply') && (
          <>
            <div className="cause-radviz__legend-item">
              {/* Tri-color pie: 3 equal 120° slices for the 3 cause categories */}
              <svg className="cause-radviz__legend-pie" width="10" height="10" viewBox="0 0 10 10">
                <path d="M5,5 L5,0 A5,5 0 0,1 9.33,7.5 Z" fill={getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#cc79a7'} />
                <path d="M5,5 L9.33,7.5 A5,5 0 0,1 0.67,7.5 Z" fill={getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#d55e00'} />
                <path d="M5,5 L0.67,7.5 A5,5 0 0,1 5,0 Z" fill={getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#e69f00'} />
              </svg>
              <span>Confident</span>
            </div>
            <div className="cause-radviz__legend-item">
              <span className="cause-radviz__legend-swatch" style={{ background: DARK_UNSURE_GRAY }} />
              <span>Unsure</span>
            </div>
          </>
        )}
      </div>

      {/* Classification loading indicator */}
      {causeClassificationLoading && (
        <div className="cause-radviz__classification-loading">
          <span className="cause-radviz__spinner cause-radviz__spinner--small" />
          <span>Updating...</span>
        </div>
      )}

    </div>
  )
}

export default React.memo(CauseRadViz)
