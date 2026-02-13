import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { scaleLinear } from 'd3-scale'
import { ThresholdHandles } from './ThresholdHandles'
import { Tooltip, formatCount } from './Tooltip'
import { TAG_CATEGORY_CAUSE, UNSURE_GRAY } from '../lib/constants'
import { STRIPE_PATTERN } from '../lib/color-utils'
import { getTagColor } from '../lib/tag-system'
import type { CauseCategory } from '../lib/cause-visualization-utils'
import type { SortMode } from '../lib/tagging-hooks/useSortableList'
import { isUserConfirmed } from '../lib/tagging-hooks/useCommitHistory'
import '../styles/CauseMarginHistogram.css'

// ============================================================================
// LAYOUT CONFIGURATION (all sizing/positioning)
// ============================================================================

const LAYOUT = {
  // Chart margins (space for axes and labels)
  margin: {
    top: 30,     // Space for threshold label arrow
    right: 4,
    bottom: 36,  // Space for x-axis ticks and label
    left: 36,    // Space for y-axis ticks
  },

  // Axis styling
  axis: {
    tickLength: 3,
    xTickCount: 5,
    yTickCount: 3,
    labelOffset: {
      xTick: 14,      // Distance from axis to tick labels
      xLabel: 28,     // Distance from axis to axis label
      yTick: 8,       // Distance from axis to tick labels (horizontal)
      yTextAdjust: 4, // Vertical centering for y-axis text
      yLabel: -38,    // Distance left of chart for y-axis label
    },
  },

  // Threshold label positioning
  thresholdLabel: {
    charWidth: 8,    // Approximate width per character at 14px font
    arrowWidth: 16,  // Arrow symbol width
    padding: 4,      // Buffer from chart edge
    yOffset: -8,     // Vertical position above chart
  },

  // Bar styling
  bar: {
    padding: 1,  // Gap between bars
  },
} as const

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
  /** Tag source: click (direct), threshold (batch), or predicted (SVM) */
  causeSelectionSources: Map<number, 'click' | 'threshold' | 'predicted'>
  /** Current threshold value */
  threshold: number
  /** Callback when threshold changes */
  onThresholdChange: (value: number) => void
  /** Height of the histogram */
  height?: number
  /** Sort mode from StageAccordionList */
  sortMode?: SortMode
  /** Sort direction from StageAccordionList - affects boundary display (Low vs Top) when sortMode is decisionMargin */
  sortDirection?: 'asc' | 'desc'
  /** Whether SVM can be trained (enough manual tags per category) */
  canTrainSVM?: boolean
  /** Manual tag counts per category for progress display */
  manualTagCountsByCategory?: Record<string, number>
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
// HISTOGRAM CONFIGURATION (data/binning)
// ============================================================================

const NUM_BINS = 40

// ============================================================================
// VISUAL CONFIGURATION (colors, patterns)
// ============================================================================

// Compact stripe pattern for narrow histogram bars (half of standard 12px)
const HISTOGRAM_STRIPE = {
  width: 6,
  height: 6,
  stripeWidth: 3,
  rotation: STRIPE_PATTERN.rotation,
  opacity: STRIPE_PATTERN.opacity
}

// Category order for stacking (bottom to top)
// Visual top-to-bottom: unsure, well-explained, Missed Syntax, Missed Context, Noisy Activation
const CATEGORY_STACK_ORDER: (CauseCategory | 'unsure')[] = [
  'noisy-activation',
  'missed-context',
  'missed-N-gram',
  'well-explained',
  'unsure'
]

// Map internal category names to display tag names for color lookup
const CATEGORY_TO_TAG_NAME: Record<CauseCategory, string> = {
  'noisy-activation': 'Noisy Activation',
  'missed-N-gram': 'Missed Syntax',
  'missed-context': 'Missed Context',
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
  height,
  sortMode = 'decisionMargin',
  sortDirection = 'asc',
  canTrainSVM = true,
  manualTagCountsByCategory
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(200)
  const [containerHeight, setContainerHeight] = useState(200)
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [liveThreshold, setLiveThreshold] = useState<number | null>(null)

  // Determine if we're in "Top X%" mode (Most Confident First)
  const isTopMode = sortMode === 'decisionMargin' && sortDirection === 'desc'

  // Use live threshold during drag for interactive bar updates, otherwise use prop
  const effectiveThreshold = liveThreshold ?? threshold

  // Observe container size for responsiveness
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Compute margin data for all features (uses effectiveThreshold for interactive updates)
  const marginData = useMemo((): MarginDataPoint[] => {
    const data: MarginDataPoint[] = []

    for (const featureId of featureIds) {
      const margin = computeFeatureMargin(featureId, causeCategoryDecisionMargins)
      const category = causeSelectionStates.get(featureId)
      const source = causeSelectionSources.get(featureId)
      const isManual = isUserConfirmed(source)

      // Determine effective category (semantic - not based on mode)
      // Below threshold = unsure (always), Above threshold = predicted category
      let effectiveCategory: CauseCategory | 'unsure'
      if (isManual && category) {
        effectiveCategory = category
      } else if (category) {
        const isUnsure = margin < effectiveThreshold
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
  }, [featureIds, causeCategoryDecisionMargins, causeSelectionStates, causeSelectionSources, effectiveThreshold])

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

  // Calculate all dimensions from container size (use observed height when no height prop)
  const dimensions = useMemo(() => {
    const svgHeight = height ?? containerHeight
    const chartWidth = containerWidth - LAYOUT.margin.left - LAYOUT.margin.right
    const chartHeight = svgHeight - LAYOUT.margin.top - LAYOUT.margin.bottom

    return {
      svg: {
        width: containerWidth,
        height: svgHeight,
      },
      chart: {
        width: chartWidth,
        height: Math.max(0, chartHeight),
      },
      transform: `translate(${LAYOUT.margin.left}, ${LAYOUT.margin.top})`,
    }
  }, [height, containerHeight, containerWidth])

  // Create scales
  const xScale = useMemo(() =>
    scaleLinear().domain([0, maxMargin]).range([0, dimensions.chart.width]),
    [maxMargin, dimensions.chart.width]
  )

  const yScale = useMemo(() =>
    scaleLinear().domain([0, maxCount]).range([dimensions.chart.height, 0]),
    [maxCount, dimensions.chart.height]
  )

  // Calculate bar segments for rendering (manual first, then auto for each category)
  const barSegments = useMemo((): BarSegment[] => {
    const segments: BarSegment[] = []
    const binWidth = dimensions.chart.width / NUM_BINS
    const { height: chartHeight } = dimensions.chart

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
            x: binIndex * binWidth + LAYOUT.bar.padding,
            y,
            width: Math.max(binWidth - LAYOUT.bar.padding * 2, 1),
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
            x: binIndex * binWidth + LAYOUT.bar.padding,
            y,
            width: Math.max(binWidth - LAYOUT.bar.padding * 2, 1),
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
  }, [bins, dimensions.chart, yScale])

  // Threshold position in pixels
  const thresholdX = xScale(effectiveThreshold)

  // Calculate label position with clipping to avoid overflow
  const labelPosition = useMemo(() => {
    const labelText = isTopMode ? 'Confident' : 'Unsure'
    const { charWidth, arrowWidth, padding } = LAYOUT.thresholdLabel
    const labelWidth = labelText.length * charWidth + arrowWidth

    if (isTopMode) {
      // Right side: anchor=start, shift left if would overflow
      return Math.min(dimensions.chart.width - labelWidth - padding, thresholdX + 4)
    } else {
      // Left side: anchor=end, shift right if would overflow
      return Math.max(labelWidth + padding, thresholdX - 4)
    }
  }, [isTopMode, dimensions.chart.width, thresholdX])

  // Handle threshold update from dragging
  const handleThresholdUpdate = useCallback((newThresholds: number[]) => {
    onThresholdChange(newThresholds[0])
  }, [onThresholdChange])

  // Handle live drag updates for visual feedback and store sync
  const handleDragUpdate = useCallback((newThresholds: number[]) => {
    setLiveThreshold(newThresholds[0])
    onThresholdChange(newThresholds[0])
  }, [onThresholdChange])

  const handleDragEnd = useCallback(() => {
    setLiveThreshold(null)
  }, [])

  // Handle bin hover (tooltip only)
  const handleBinMouseEnter = useCallback((binIndex: number, e: React.MouseEvent) => {
    setHoveredBinIndex(binIndex)
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleBinMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleBinMouseLeave = useCallback(() => {
    setHoveredBinIndex(null)
    setTooltipPosition(null)
  }, [])

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

  // Get category colors for placeholder display
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'

  // Show placeholder when not enough tags for SVM training
  if (!canTrainSVM) {
    return (
      <div className="cause-margin-histogram cause-margin-histogram--placeholder" ref={containerRef} style={height ? { height } : undefined}>
        <div className="cause-margin-histogram__placeholder-content">
          <div className="cause-margin-histogram__main-instruction">
            <span className="cause-margin-histogram__stage-number">1</span>
            Tag 2+ features in each category to see histogram.
          </div>
          <div className="cause-margin-histogram__progress-row">
            <span className="cause-margin-histogram__progress-item" style={{ backgroundColor: noisyActivationColor }}>
              Noisy Activation: {manualTagCountsByCategory?.['noisy-activation'] || 0}/2
            </span>
            <span className="cause-margin-histogram__progress-item" style={{ backgroundColor: missedNgramColor }}>
              Missed Syntax: {manualTagCountsByCategory?.['missed-N-gram'] || 0}/2
            </span>
            <span className="cause-margin-histogram__progress-item" style={{ backgroundColor: missedContextColor }}>
              Missed Context: {manualTagCountsByCategory?.['missed-context'] || 0}/2
            </span>
          </div>
        </div>
      </div>
    )
  }

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
    <div className="cause-margin-histogram" ref={containerRef} style={height ? { height } : undefined}>
      <svg
        width={dimensions.svg.width}
        height={dimensions.svg.height}
        className="cause-margin-histogram__svg"
        style={{ overflow: 'visible' }}
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

        <g transform={dimensions.transform}>
          {/* Zone backgrounds - Left = unsure (striped), Right = candidates (white) - always */}
          {/* Left zone (unsure - below threshold) */}
          <rect
            x={0}
            y={0}
            width={Math.max(0, thresholdX)}
            height={dimensions.chart.height}
            fill="url(#unsureZoneStripe)"
          />
          {/* Right zone (candidates - above threshold) */}
          <rect
            x={Math.max(0, thresholdX)}
            y={0}
            width={Math.max(0, dimensions.chart.width - thresholdX)}
            height={dimensions.chart.height}
            fill="#ffffff"
          />

          {/* Full-height hover hit areas for each bin */}
          {bins.map((_bin, binIndex) => {
            const binWidth = dimensions.chart.width / NUM_BINS
            return (
              <rect
                key={`hit-area-${binIndex}`}
                x={binIndex * binWidth}
                y={0}
                width={binWidth}
                height={dimensions.chart.height}
                fill={hoveredBinIndex === binIndex ? 'rgba(0, 0, 0, 0.04)' : 'transparent'}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handleBinMouseEnter(binIndex, e)}
                onMouseMove={handleBinMouseMove}
                onMouseLeave={handleBinMouseLeave}
              />
            )
          })}

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
            y2={dimensions.chart.height}
            stroke="#333"
            strokeWidth={2}
          />

          {/* Y-axis ticks */}
          {Array.from({ length: LAYOUT.axis.yTickCount + 1 }, (_, i) => {
            const value = Math.round((maxCount / LAYOUT.axis.yTickCount) * i)
            const y = dimensions.chart.height - (dimensions.chart.height / LAYOUT.axis.yTickCount) * i
            return (
              <g key={`y-tick-${i}`}>
                <line x1={-LAYOUT.axis.tickLength} y1={y} x2={0} y2={y} stroke="#333" strokeWidth={1} />
                <text x={-LAYOUT.axis.labelOffset.yTick} y={y + LAYOUT.axis.labelOffset.yTextAdjust} fontSize={12} fill="#666" textAnchor="end">
                  {formatCount(value)}
                </text>
              </g>
            )
          })}

          {/* X-axis line */}
          <line
            x1={0}
            y1={dimensions.chart.height}
            x2={dimensions.chart.width}
            y2={dimensions.chart.height}
            stroke="#333"
            strokeWidth={2}
          />

          {/* X-axis ticks */}
          {Array.from({ length: LAYOUT.axis.xTickCount + 1 }, (_, i) => {
            const value = (maxMargin / LAYOUT.axis.xTickCount) * i
            const x = (dimensions.chart.width / LAYOUT.axis.xTickCount) * i
            const isFirst = i === 0
            const isLast = i === LAYOUT.axis.xTickCount
            return (
              <g key={`x-tick-${i}`}>
                <line x1={x} y1={dimensions.chart.height} x2={x} y2={dimensions.chart.height + LAYOUT.axis.tickLength} stroke="#333" strokeWidth={1} />
                <text
                  x={x}
                  y={dimensions.chart.height + LAYOUT.axis.labelOffset.xTick}
                  fontSize={12}
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
            x={dimensions.chart.width / 2}
            y={dimensions.chart.height + LAYOUT.axis.labelOffset.xLabel}
            fontSize={14}
            fill="#666"
            textAnchor="middle"
          >
            |Decision Margin|
          </text>

          {/* Y-axis label */}
          <text
            textAnchor="middle"
            fontSize={14}
            fill="#666"
            transform={`translate(${LAYOUT.axis.labelOffset.yLabel}, ${dimensions.chart.height / 2}) rotate(-90)`}
          >
            Count
          </text>

          {/* Threshold handle */}
          <ThresholdHandles
            orientation="horizontal"
            bounds={{ min: 0, max: dimensions.chart.width }}
            thresholds={[threshold]}
            metricRange={{ min: 0, max: maxMargin }}
            position={{ x: 0, y: 0 }}
            lineBounds={{ min: 0, max: dimensions.chart.height }}
            showThresholdLine={true}
            onUpdate={handleThresholdUpdate}
            onDragUpdate={handleDragUpdate}
            onDragEnd={handleDragEnd}
          />

          {/* Threshold label with arrow - clips to stay within bounds */}
          {isTopMode ? (
            <text
              x={labelPosition}
              y={LAYOUT.thresholdLabel.yOffset}
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
              y={LAYOUT.thresholdLabel.yOffset}
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
      {tooltipContent && (
        <Tooltip position={tooltipPosition}>
          <Tooltip.Header>
            {tooltipContent.range}
          </Tooltip.Header>
          <Tooltip.Summary showSeparator={tooltipContent.total > 0}>
            Total: {formatCount(tooltipContent.total)} features
          </Tooltip.Summary>
          {Object.entries(tooltipContent.counts)
            .filter(([, { manual, auto }]) => manual + auto > 0)
            .flatMap(([cat, { manual, auto }]) => {
              const color = getCategoryColor(cat as CauseCategory | 'unsure')
              const label = cat === 'unsure' ? 'Unsure' : CATEGORY_TO_TAG_NAME[cat as CauseCategory]
              const rows: React.ReactNode[] = []
              if (manual > 0) {
                rows.push(
                  <Tooltip.Row key={`${cat}-manual`} color={color}>
                    {label}: {formatCount(manual)}
                  </Tooltip.Row>
                )
              }
              if (auto > 0) {
                rows.push(
                  <Tooltip.Row key={`${cat}-auto`} color={color} striped>
                    {label}: {formatCount(auto)}
                  </Tooltip.Row>
                )
              }
              return rows
            })
          }
        </Tooltip>
      )}
    </div>
  )
}

export default CauseMarginHistogram
