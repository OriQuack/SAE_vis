import React, { useRef, useMemo, useEffect, useCallback } from 'react'
import { useVisualizationStore } from '../store/index'
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
import {
  getEffectiveCategory as getEffectiveCategoryUtil,
} from '../lib/cause-tagging-utils'
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
  const manualTagsSignature = useMemo(() => {
    const manualIds: number[] = []
    causeSelectionStates.forEach((category, featureId) => {
      const source = causeSelectionSources.get(featureId)
      // Only include cause categories — well-explained tags should not trigger SVM retraining
      if ((source === 'click' || source === 'threshold') && CAUSE_CATEGORIES.includes(category)) {
        manualIds.push(featureId)
      }
    })
    return manualIds.sort((a, b) => a - b).join(',')
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

  // Compute RadViz positions from decision margins
  const radVizPositions = useMemo(() => {
    // No positions until SVM trained
    if (causeCategoryDecisionMargins.size === 0) return null

    return computeRadVizPositions(causeCategoryDecisionMargins, featureIds)
  }, [featureIds, causeCategoryDecisionMargins])

  // Filter RadViz points by phase (activeStage)
  const filteredRadVizPoints = useMemo(() => {
    if (!radVizPositions) return null
    const stage = activeStage ?? 'bootstrap'

    return radVizPositions.filter(point => {
      // hideTagged: hide user-confirmed tagged features
      if (hideTagged && isUserConfirmed(causeSelectionSources.get(point.feature_id))) return false

      // Bootstrap: show ALL features
      if (stage === 'bootstrap') return true

      // Learn/Apply: filter by margin threshold (no tagged-feature exemption)
      const categoryScores = causeCategoryDecisionMargins.get(point.feature_id)
      if (!categoryScores) return true
      const margin = Math.min(...Object.values(categoryScores).map(s => Math.abs(s)))
      return stage === 'apply'
        ? margin >= causeMarginThreshold
        : margin < causeMarginThreshold
    })
  }, [radVizPositions, activeStage, hideTagged, causeSelectionSources, causeCategoryDecisionMargins, causeMarginThreshold])


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

  // Bootstrap/Learn: only user-confirmed tags (click/threshold) show color; predictions are gray
  // Apply: all tags (including predicted) show color
  const hexbinGetCategory = useCallback((featureId: number): FilterCategory => {
    const tag = causeSelectionStates.get(featureId)
    if (tag) {
      const source = causeSelectionSources.get(featureId)
      if ((activeStage ?? 'bootstrap') === 'apply' || isUserConfirmed(source)) {
        return tag as FilterCategory
      }
    }
    return (activeStage ?? 'bootstrap') === 'apply'
      ? getEffectiveCategory(featureId)
      : 'unsure'
  }, [activeStage, causeSelectionStates, causeSelectionSources, getEffectiveCategory])

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
  const selectedPointData = useMemo(() => {
    if (selectedFeatureId == null || !filteredRadVizPoints || !scales) return null
    const selectedPoint = filteredRadVizPoints.find(p => p.feature_id === selectedFeatureId)
    if (!selectedPoint) return null
    return {
      cx: scales.xScale(selectedPoint.x),
      cy: scales.yScale(selectedPoint.y),
    }
  }, [selectedFeatureId, filteredRadVizPoints, scales])

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

            {/* Selected point highlight (on top) */}
            {selectedPointData && (
              <g className="cause-radviz__selected-point">
                <circle
                  cx={selectedPointData.cx}
                  cy={selectedPointData.cy}
                  r={3.5}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={4.5}
                />
                <circle
                  cx={selectedPointData.cx}
                  cy={selectedPointData.cy}
                  r={3.5}
                  fill="none"
                  stroke={SELECTION_BLUE.DEFAULT}
                  strokeWidth={2.5}
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

    </div>
  )
}

export default React.memo(CauseRadViz)
