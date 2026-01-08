import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { scaleLinear } from 'd3-scale'
import { ThresholdHandles } from './ThresholdHandles'
import { TAG_CATEGORY_CAUSE, UNSURE_GRAY } from '../lib/constants'
import { STRIPE_PATTERN } from '../lib/color-utils'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/umap-utils'
import '../styles/CauseMarginHistogram.css'

// Label width estimation for threshold labels
const LABEL_CHAR_WIDTH = 8   // Approximate width per character at 14px font
const ARROW_WIDTH = 16       // Arrow symbol width
const LABEL_PADDING = 4      // Small buffer from edge

// ============================================================================
// TYPES
// ============================================================================

interface CauseMarginHistogramProps {
  /** All feature IDs to include in histogram */
  featureIds: Set<number>
  /** Decision margins per feature (from SVM classification) */
  causeCategoryDecisionMargins: Map<number, Record<string, number>>
  /** Current category assignments */
  causeSelectionStates: Map<number, CauseCategory>
  /** Manual vs auto tag source */
  causeSelectionSources: Map<number, 'manual' | 'auto'>
  /** Current threshold value */
  threshold: number
  /** Callback when threshold changes */
  onThresholdChange: (value: number) => void
  /** Callback when hovering a bin (for scatter plot highlighting) */
  onBinHover?: (featureIds: Set<number> | null) => void
  /** Height of the histogram */
  height?: number
  /** Sort mode from StatusPanel */
  sortMode?: 'default' | 'decisionMargin'
  /** Sort direction from StatusPanel - affects boundary display (Low vs Top) when sortMode is decisionMargin */
  sortDirection?: 'asc' | 'desc'
  /** Callback when percentage changes (due to threshold drag) */
  onPercentageChange?: (percentage: number) => void
}

interface MarginDataPoint {
  featureId: number
  margin: number
  category: CauseCategory | 'unsure'
  isManual: boolean
}

interface HistogramBin {
  x0: number  // Bin start (margin value)
  x1: number  // Bin end (margin value)
  featureIds: number[]
  manualCounts: Record<CauseCategory | 'unsure', number>
  autoCounts: Record<CauseCategory | 'unsure', number>
}

interface BarSegment {
  binIndex: number
  x: number
  y: number
  width: number
  height: number
  color: string
  category: CauseCategory | 'unsure'
  isManual: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NUM_BINS = 40
const MARGIN = { top: 20, right: 0, bottom: 30, left: 36 }
const HEADER_HEIGHT = 24 // ~16px text + 4px margin + 4px buffer (matches CSS)
const X_TICK_COUNT = 5
const Y_TICK_COUNT = 3

// Compact stripe pattern for narrow histogram bars (half of standard 12px)
const HISTOGRAM_STRIPE = {
  width: 6,
  height: 6,
  stripeWidth: 3,
  rotation: STRIPE_PATTERN.rotation,
  opacity: STRIPE_PATTERN.opacity
}

// Category order for stacking (bottom to top)
const CATEGORY_STACK_ORDER: (CauseCategory | 'unsure')[] = [
  'noisy-activation',
  'missed-N-gram',
  'missed-context',
  'well-explained',
  'unsure'
]

// Map internal category names to display tag names for color lookup
const CATEGORY_TO_TAG_NAME: Record<CauseCategory, string> = {
  'noisy-activation': 'Noisy Activation',
  'missed-N-gram': 'Pattern Miss',
  'missed-context': 'Context Miss',
  'well-explained': 'Well-Explained'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compute margin for a feature from decision margins map
 * Margin = minimum absolute distance to any category boundary
 */
function computeFeatureMargin(
  featureId: number,
  decisionMargins: Map<number, Record<string, number>>
): number {
  const scores = decisionMargins.get(featureId)
  if (!scores) return 0
  return Math.min(...Object.values(scores).map(s => Math.abs(s)))
}

/**
 * Get category color from tag system
 */
function getCategoryColor(category: CauseCategory | 'unsure'): string {
  if (category === 'unsure') return UNSURE_GRAY
  const tagName = CATEGORY_TO_TAG_NAME[category]
  return getTagColor(TAG_CATEGORY_CAUSE, tagName) || UNSURE_GRAY
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CauseMarginHistogram: React.FC<CauseMarginHistogramProps> = ({
  featureIds,
  causeCategoryDecisionMargins,
  causeSelectionStates,
  causeSelectionSources,
  threshold,
  onThresholdChange,
  onBinHover,
  height = 80,
  sortMode = 'decisionMargin',
  sortDirection = 'asc',
  onPercentageChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(200)
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [liveThreshold, setLiveThreshold] = useState<number | null>(null)

  // Determine if we're in "Top X%" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && sortDirection === 'desc'

  // Observe container width for responsiveness
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Compute margin data for all features
  const marginData = useMemo((): MarginDataPoint[] => {
    const data: MarginDataPoint[] = []

    for (const featureId of featureIds) {
      const margin = computeFeatureMargin(featureId, causeCategoryDecisionMargins)
      const category = causeSelectionStates.get(featureId)
      const source = causeSelectionSources.get(featureId)
      const isManual = source === 'manual'

      // Determine effective category (semantic - not based on mode)
      // Below threshold = unsure (always), Above threshold = predicted category
      let effectiveCategory: CauseCategory | 'unsure'
      if (isManual && category) {
        effectiveCategory = category
      } else if (category) {
        const isUnsure = margin < threshold
        effectiveCategory = isUnsure ? 'unsure' : category
      } else {
        effectiveCategory = 'unsure'
      }

      data.push({
        featureId,
        margin,
        category: effectiveCategory,
        isManual
      })
    }

    return data
  }, [featureIds, causeCategoryDecisionMargins, causeSelectionStates, causeSelectionSources, threshold])

  // Calculate percentage of features in unsure zone (candidates to review)
  // Top mode: features above threshold; Low mode: features below threshold
  const unsurePercentage = useMemo(() => {
    if (marginData.length === 0) return 0
    const unsureCount = isTopMode
      ? marginData.filter(d => d.margin > threshold).length
      : marginData.filter(d => d.margin < threshold).length
    return Math.round((unsureCount / marginData.length) * 100)
  }, [marginData, threshold, isTopMode])

  // Compute histogram bins (no clipping - show full range)
  const { bins, maxMargin, maxCount } = useMemo(() => {
    if (marginData.length === 0) {
      return { bins: [], maxMargin: 1, maxCount: 0 }
    }

    const sortedMargins = marginData.map(d => d.margin).sort((a, b) => a - b)
    const displayMax = sortedMargins[sortedMargins.length - 1] || 0.01

    const binWidth = displayMax / NUM_BINS

    // Initialize bins
    const histBins: HistogramBin[] = []
    const emptyCounts = () => ({
      'noisy-activation': 0,
      'missed-N-gram': 0,
      'missed-context': 0,
      'well-explained': 0,
      'unsure': 0
    })
    for (let i = 0; i < NUM_BINS; i++) {
      histBins.push({
        x0: i * binWidth,
        x1: (i + 1) * binWidth,
        featureIds: [],
        manualCounts: emptyCounts(),
        autoCounts: emptyCounts()
      })
    }

    // Assign features to bins
    for (const point of marginData) {
      const binIndex = Math.min(Math.floor(point.margin / binWidth), NUM_BINS - 1)
      histBins[binIndex].featureIds.push(point.featureId)
      if (point.isManual) {
        histBins[binIndex].manualCounts[point.category]++
      } else {
        histBins[binIndex].autoCounts[point.category]++
      }
    }

    // Find max count for y-scale
    const maxC = Math.max(...histBins.map(b => {
      const manualTotal = Object.values(b.manualCounts).reduce((a, c) => a + c, 0)
      const autoTotal = Object.values(b.autoCounts).reduce((a, c) => a + c, 0)
      return manualTotal + autoTotal
    }), 1)

    return { bins: histBins, maxMargin: displayMax, maxCount: maxC }
  }, [marginData])

  // Calculate chart dimensions
  const svgHeight = height - HEADER_HEIGHT
  const chartWidth = containerWidth - MARGIN.left - MARGIN.right
  const chartHeight = svgHeight - MARGIN.top - MARGIN.bottom

  // Create scales
  const xScale = useMemo(() =>
    scaleLinear().domain([0, maxMargin]).range([0, chartWidth]),
    [maxMargin, chartWidth]
  )

  const yScale = useMemo(() =>
    scaleLinear().domain([0, maxCount]).range([chartHeight, 0]),
    [maxCount, chartHeight]
  )

  // Calculate bar segments for rendering (manual first, then auto for each category)
  const barSegments = useMemo((): BarSegment[] => {
    const segments: BarSegment[] = []
    const binWidth = chartWidth / NUM_BINS
    const barPadding = 1

    for (let binIndex = 0; binIndex < bins.length; binIndex++) {
      const bin = bins[binIndex]
      let cumulativeHeight = 0

      for (const category of CATEGORY_STACK_ORDER) {
        const manualCount = bin.manualCounts[category]
        const autoCount = bin.autoCounts[category]

        // Manual segment (solid fill) - bottom
        if (manualCount > 0) {
          const barHeight = chartHeight - yScale(manualCount)
          const y = chartHeight - cumulativeHeight - barHeight

          segments.push({
            binIndex,
            x: binIndex * binWidth + barPadding,
            y,
            width: Math.max(binWidth - barPadding * 2, 1),
            height: barHeight,
            color: getCategoryColor(category),
            category,
            isManual: true
          })

          cumulativeHeight += barHeight
        }

        // Auto segment (striped fill) - top
        if (autoCount > 0) {
          const barHeight = chartHeight - yScale(autoCount)
          const y = chartHeight - cumulativeHeight - barHeight

          segments.push({
            binIndex,
            x: binIndex * binWidth + barPadding,
            y,
            width: Math.max(binWidth - barPadding * 2, 1),
            height: barHeight,
            color: getCategoryColor(category),
            category,
            isManual: false
          })

          cumulativeHeight += barHeight
        }
      }
    }

    return segments
  }, [bins, chartWidth, chartHeight, yScale])

  // Use live threshold during drag, otherwise use prop
  const effectiveThreshold = liveThreshold ?? threshold

  // Threshold position in pixels
  const thresholdX = xScale(effectiveThreshold)

  // Calculate label position with clipping to avoid overflow
  const labelPosition = useMemo(() => {
    const labelText = isTopMode ? 'Confident' : 'Unsure'
    const labelWidth = labelText.length * LABEL_CHAR_WIDTH + ARROW_WIDTH

    if (isTopMode) {
      // Right side: anchor=start, shift left if would overflow
      return Math.min(chartWidth - labelWidth - LABEL_PADDING, thresholdX + 4)
    } else {
      // Left side: anchor=end, shift right if would overflow
      return Math.max(labelWidth + LABEL_PADDING, thresholdX - 4)
    }
  }, [isTopMode, chartWidth, thresholdX])

  // Handle threshold update from dragging
  const handleThresholdUpdate = useCallback((newThresholds: number[]) => {
    const newThreshold = newThresholds[0]
    onThresholdChange(newThreshold)

    // Calculate and report new percentage based on threshold position
    if (onPercentageChange && marginData.length > 0) {
      const unsureCount = isTopMode
        ? marginData.filter(d => d.margin > newThreshold).length
        : marginData.filter(d => d.margin < newThreshold).length
      const newPercentage = Math.round((unsureCount / marginData.length) * 100)
      onPercentageChange(newPercentage)
    }
  }, [onThresholdChange, onPercentageChange, marginData, isTopMode])

  // Handle live drag updates for visual feedback
  const handleDragUpdate = useCallback((newThresholds: number[]) => {
    setLiveThreshold(newThresholds[0])
  }, [])

  const handleDragEnd = useCallback(() => {
    setLiveThreshold(null)
  }, [])

  // Handle bin hover
  const handleBinMouseEnter = useCallback((binIndex: number, e: React.MouseEvent) => {
    setHoveredBinIndex(binIndex)
    setTooltipPosition({ x: e.clientX, y: e.clientY })

    if (onBinHover && bins[binIndex]) {
      onBinHover(new Set(bins[binIndex].featureIds))
    }
  }, [bins, onBinHover])

  const handleBinMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleBinMouseLeave = useCallback(() => {
    setHoveredBinIndex(null)
    setTooltipPosition(null)
    onBinHover?.(null)
  }, [onBinHover])

  // Tooltip content
  const tooltipContent = useMemo(() => {
    if (hoveredBinIndex === null || !bins[hoveredBinIndex]) return null
    const bin = bins[hoveredBinIndex]
    const manualTotal = Object.values(bin.manualCounts).reduce((a, c) => a + c, 0)
    const autoTotal = Object.values(bin.autoCounts).reduce((a, c) => a + c, 0)
    const total = manualTotal + autoTotal

    // Combine counts for display
    const counts: Record<CauseCategory | 'unsure', { manual: number; auto: number }> = {
      'noisy-activation': { manual: bin.manualCounts['noisy-activation'], auto: bin.autoCounts['noisy-activation'] },
      'missed-N-gram': { manual: bin.manualCounts['missed-N-gram'], auto: bin.autoCounts['missed-N-gram'] },
      'missed-context': { manual: bin.manualCounts['missed-context'], auto: bin.autoCounts['missed-context'] },
      'well-explained': { manual: bin.manualCounts['well-explained'], auto: bin.autoCounts['well-explained'] },
      'unsure': { manual: bin.manualCounts['unsure'], auto: bin.autoCounts['unsure'] }
    }

    return {
      range: `${bin.x0.toFixed(3)} - ${bin.x1.toFixed(3)}`,
      total,
      counts
    }
  }, [hoveredBinIndex, bins])

  if (featureIds.size === 0 || causeCategoryDecisionMargins.size === 0) {
    return (
      <div className="cause-margin-histogram cause-margin-histogram--empty" ref={containerRef}>
        <span className="cause-margin-histogram__empty-text">
          No classification data
        </span>
      </div>
    )
  }

  return (
    <div className="cause-margin-histogram" ref={containerRef} style={{ height, border: '2px solid red' }}>
      <div className="cause-margin-histogram__header">
        <span className="subheader subheader--with-value">
          Unsure Boundary: <span className="subheader__value">{sortMode === 'decisionMargin' && sortDirection === 'desc' ? 'Top' : 'Low'} {unsurePercentage}%</span>
        </span>
      </div>

      <svg
        width={containerWidth}
        height={svgHeight}
        className="cause-margin-histogram__svg"
      >
        {/* SVG Patterns */}
        <defs>
          {/* Pattern for unsure zone background */}
          <pattern
            id="unsureZoneStripe"
            patternUnits="userSpaceOnUse"
            width={STRIPE_PATTERN.width}
            height={STRIPE_PATTERN.height}
            patternTransform={`rotate(${-STRIPE_PATTERN.rotation})`}
          >
            <rect
              width={STRIPE_PATTERN.stripeWidth}
              height={STRIPE_PATTERN.height}
              fill={UNSURE_GRAY}
              opacity={0.3}
            />
          </pattern>
          {/* Stripe patterns for auto-tagged category bars (compact size for narrow bars) */}
          {CATEGORY_STACK_ORDER.map(category => (
            <pattern
              key={`stripe-${category}`}
              id={`stripe-${category}`}
              patternUnits="userSpaceOnUse"
              width={HISTOGRAM_STRIPE.width}
              height={HISTOGRAM_STRIPE.height}
              patternTransform={`rotate(${-HISTOGRAM_STRIPE.rotation})`}
            >
              <rect width={HISTOGRAM_STRIPE.width} height={HISTOGRAM_STRIPE.height} fill={UNSURE_GRAY} />
              <rect
                width={HISTOGRAM_STRIPE.stripeWidth}
                height={HISTOGRAM_STRIPE.height}
                fill={getCategoryColor(category)}
                opacity={HISTOGRAM_STRIPE.opacity}
              />
            </pattern>
          ))}
        </defs>

        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Zone backgrounds - Left = unsure (striped), Right = candidates (white) - always */}
          {/* Left zone (unsure - below threshold) */}
          <rect
            x={0}
            y={0}
            width={Math.max(0, thresholdX)}
            height={chartHeight}
            fill="url(#unsureZoneStripe)"
          />
          {/* Right zone (candidates - above threshold) */}
          <rect
            x={Math.max(0, thresholdX)}
            y={0}
            width={Math.max(0, chartWidth - thresholdX)}
            height={chartHeight}
            fill="#ffffff"
          />

          {/* Category bars - solid for manual, striped for auto */}
          {barSegments.map((segment, i) => (
            <rect
              key={i}
              x={segment.x}
              y={segment.y}
              width={segment.width}
              height={segment.height}
              fill={segment.isManual ? segment.color : `url(#stripe-${segment.category})`}
              opacity={hoveredBinIndex === segment.binIndex ? 1 : 0.85}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => handleBinMouseEnter(segment.binIndex, e)}
              onMouseMove={handleBinMouseMove}
              onMouseLeave={handleBinMouseLeave}
            />
          ))}

          {/* Y-axis line */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={chartHeight}
            stroke="#d1d5db"
            strokeWidth={1}
          />

          {/* Y-axis ticks */}
          {Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => {
            const value = Math.round((maxCount / Y_TICK_COUNT) * i)
            const y = chartHeight - (chartHeight / Y_TICK_COUNT) * i
            return (
              <g key={`y-tick-${i}`}>
                <line x1={-3} y1={y} x2={0} y2={y} stroke="#d1d5db" strokeWidth={1} />
                <text x={-8} y={y + 4} fontSize={10} fill="#666" textAnchor="end">
                  {value}
                </text>
              </g>
            )
          })}

          {/* X-axis line */}
          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#d1d5db"
            strokeWidth={1}
          />

          {/* X-axis ticks */}
          {Array.from({ length: X_TICK_COUNT + 1 }, (_, i) => {
            const value = (maxMargin / X_TICK_COUNT) * i
            const x = (chartWidth / X_TICK_COUNT) * i
            const isFirst = i === 0
            const isLast = i === X_TICK_COUNT
            return (
              <g key={`x-tick-${i}`}>
                <line x1={x} y1={chartHeight} x2={x} y2={chartHeight + 3} stroke="#d1d5db" strokeWidth={1} />
                <text
                  x={x}
                  y={chartHeight + 14}
                  fontSize={10}
                  fill="#666"
                  textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                >
                  {value.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* X-axis label */}
          <text
            x={chartWidth / 2}
            y={chartHeight + 26}
            fontSize={10}
            fill="#666"
            textAnchor="middle"
          >
            |Decision Margin|
          </text>

          {/* Threshold handle */}
          <ThresholdHandles
            orientation="horizontal"
            bounds={{ min: 0, max: chartWidth }}
            thresholds={[threshold]}
            metricRange={{ min: 0, max: maxMargin }}
            position={{ x: 0, y: 0 }}
            lineBounds={{ min: 0, max: chartHeight }}
            showThresholdLine={true}
            showDragTooltip={true}
            onUpdate={handleThresholdUpdate}
            onDragUpdate={handleDragUpdate}
            onDragEnd={handleDragEnd}
            handleDimensions={{ width: 16, height: 12 }}
          />

          {/* Threshold label with arrow - clips to stay within bounds */}
          {isTopMode ? (
            <text
              x={labelPosition}
              y={-8}
              textAnchor="start"
              fontSize={14}
              fontWeight={600}
              fill="#272121ff"
            >
              <tspan>Confident </tspan>
              <tspan fontSize={16}>→</tspan>
            </text>
          ) : (
            <text
              x={labelPosition}
              y={-8}
              textAnchor="end"
              fontSize={14}
              fontWeight={600}
              fill="#272121ff"
            >
              <tspan fontSize={16}>← </tspan>
              <tspan>Unsure</tspan>
            </text>
          )}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltipContent && tooltipPosition && (
        <div
          className="cause-margin-histogram__tooltip"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y - 10
          }}
        >
          <div className="cause-margin-histogram__tooltip-header">
            Margin: {tooltipContent.range}
          </div>
          <div className="cause-margin-histogram__tooltip-total">
            Total: {tooltipContent.total} features
          </div>
          {Object.entries(tooltipContent.counts)
            .filter(([, { manual, auto }]) => manual + auto > 0)
            .map(([cat, { manual, auto }]) => (
              <div key={cat} className="cause-margin-histogram__tooltip-row">
                <span
                  className="cause-margin-histogram__tooltip-color"
                  style={{ backgroundColor: getCategoryColor(cat as CauseCategory | 'unsure') }}
                />
                <span>
                  {cat === 'unsure' ? 'Unsure' : CATEGORY_TO_TAG_NAME[cat as CauseCategory]}: {manual + auto}
                  {manual > 0 && auto > 0 && ` (${manual}m/${auto}a)`}
                  {manual > 0 && auto === 0 && ' (manual)'}
                  {manual === 0 && auto > 0 && ' (auto)'}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

export default CauseMarginHistogram
