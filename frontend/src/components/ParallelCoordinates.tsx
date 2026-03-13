// ============================================================================
// CAUSE METRIC PARALLEL COORDINATES
// Parallel coordinates visualization for root cause metric scores
// ============================================================================
// Displays metrics as parallel vertical axes with:
// - Category bands: Median line + IQR shaded region per cause category
// - Foreground line: Currently selected feature (vivid)
//
// Axes (left to right):
// - Activation Frequency (fracNonzero)
// - Explainer Consensus (consensusScore)
// - Embedding (embedding)
// - Detection (detection)
// - Fuzz (fuzz)

import React, { useMemo, useRef, useState, useEffect } from 'react'
import { scaleLinear } from 'd3-scale'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'
import type { CategoryBand } from '../lib/parallel-coords-utils'
import { getMetricDescription } from '../lib/i18n'
import '../styles/ParallelCoordinates.css'

// ============================================================================
// TYPES
// ============================================================================

export interface ParallelCoordsProps {
  /** Summary bands per cause category (median + IQR) */
  categoryBands: CategoryBand[]
  /** Scores of the currently selected feature for foreground line */
  currentScores: CauseMetricScores | null
  /** Optional className for container */
  className?: string
}

// Metric configuration for axes
interface MetricConfig {
  key: keyof CauseMetricScores
  label: string
  shortLabel: string
  description: string
}

// Define the 5 metrics in order (left to right)
const METRICS: MetricConfig[] = [
  { key: 'fracNonzero', label: 'Activation Frequency', shortLabel: 'Act. Freq', description: getMetricDescription('fracNonzero', 'How often this feature activates across the text corpus (0 = never, 1 = always)') },
  { key: 'consensusScore', label: 'Consensus Score', shortLabel: 'Consensus', description: getMetricDescription('consensusScore', 'Agreement of key phrases across different LLM explainers') },
  { key: 'embedding', label: 'Embedding Score', shortLabel: 'Embedding', description: getMetricDescription('embedding', 'How well the explanation semantically matches activating vs. non-activating examples (0.5 = random)') },
  { key: 'detection', label: 'Detection Score', shortLabel: 'Detection', description: getMetricDescription('detection', 'How well the explanation distinguishes activating from non-activating examples at the context level (0.5 = random)') },
  { key: 'fuzz', label: 'Fuzz Score', shortLabel: 'Fuzz', description: getMetricDescription('fuzz', 'How well the explanation identifies activating tokens vs. non-activating tokens within examples (0.5 = random)') }
]

// Layout constants
const MARGIN = { top: 6, right: 14, bottom: 28, left: 25 }
const FIXED_WIDTH = 250
const MIN_HEIGHT = 80

// Line colors
const LINE_COLOR = '#000000'

// Band rendering constants
const BAND_FILL_OPACITY = 0.12
const MEDIAN_STROKE_OPACITY = 1
const MEDIAN_STROKE_WIDTH = 1.5

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate polyline points string for a set of metric scores
 */
function generatePolylinePoints(
  scores: CauseMetricScores,
  xScale: (index: number) => number,
  yScale: (value: number) => number
): string {
  const points: string[] = []

  METRICS.forEach((metric, index) => {
    const value = scores[metric.key]
    if (value !== null && value !== undefined) {
      const x = xScale(index)
      const y = yScale(value)
      points.push(`${x},${y}`)
    }
  })

  return points.join(' ')
}

/**
 * Generate polygon points for an IQR band (Q1 top edge → Q3 bottom edge).
 * The polygon traces Q1 values left-to-right, then Q3 values right-to-left.
 */
function generateBandPolygon(
  band: CategoryBand,
  xScale: (index: number) => number,
  yScale: (value: number) => number
): string | null {
  const topPoints: string[] = []  // Q3 values (higher on screen = lower y in SVG)
  const bottomPoints: string[] = []  // Q1 values

  for (let i = 0; i < METRICS.length; i++) {
    const summary = band.metrics[METRICS[i].key]
    if (!summary) continue
    const x = xScale(i)
    topPoints.push(`${x},${yScale(summary.q3)}`)
    bottomPoints.push(`${x},${yScale(summary.q1)}`)
  }

  if (topPoints.length < 2) return null

  // Trace: top left→right, then bottom right→left to close polygon
  return [...topPoints, ...bottomPoints.reverse()].join(' ')
}

/**
 * Generate polyline points for median values of a band.
 */
function generateMedianLine(
  band: CategoryBand,
  xScale: (index: number) => number,
  yScale: (value: number) => number
): string | null {
  const points: string[] = []

  for (let i = 0; i < METRICS.length; i++) {
    const summary = band.metrics[METRICS[i].key]
    if (!summary) continue
    points.push(`${xScale(i)},${yScale(summary.median)}`)
  }

  return points.length >= 2 ? points.join(' ') : null
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CauseMetricParallelCoords - Parallel coordinates visualization for cause metrics
 *
 * Shows:
 * - Category bands: IQR shaded region + median line per cause category
 * - Foreground line: Currently selected feature (vivid, thicker)
 */
export const CauseMetricParallelCoords: React.FC<ParallelCoordsProps> = ({
  categoryBands,
  currentScores,
  className = ''
}) => {
  // Track height dynamically via ResizeObserver
  const svgWrapperRef = useRef<HTMLDivElement>(null)
  const [svgHeight, setSvgHeight] = useState(MIN_HEIGHT)

  useEffect(() => {
    if (!svgWrapperRef.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setSvgHeight(Math.max(rect.height, MIN_HEIGHT))
    })
    observer.observe(svgWrapperRef.current)
    return () => observer.disconnect()
  }, [])

  // Fixed width, dynamic height
  const { innerHeight, xScale, yScale } = useMemo(() => {
    const iw = FIXED_WIDTH - MARGIN.left - MARGIN.right
    const ih = svgHeight - MARGIN.top - MARGIN.bottom

    const xs = scaleLinear()
      .domain([0, METRICS.length - 1])
      .range([0, iw])

    const ys = scaleLinear()
      .domain([0, 1])
      .range([ih, 0])

    return {
      innerHeight: ih,
      xScale: (i: number) => xs(i) ?? 0,
      yScale: (v: number) => ys(v) ?? 0
    }
  }, [svgHeight])

  // Generate band polygons and median lines
  const bandShapes = useMemo(() => {
    return categoryBands
      .filter(band => band.count >= 2)
      .map(band => ({
        band,
        polygon: generateBandPolygon(band, xScale, yScale),
        medianLine: generateMedianLine(band, xScale, yScale)
      }))
      .filter(s => s.polygon || s.medianLine)
  }, [categoryBands, xScale, yScale])

  // Generate foreground line (current feature)
  const foregroundLine = useMemo(() => {
    if (!currentScores) return null
    return generatePolylinePoints(currentScores, xScale, yScale)
  }, [currentScores, xScale, yScale])

  // Generate axis lines and labels
  const axes = useMemo(() => {
    return METRICS.map((metric, index) => ({
      x: xScale(index),
      label: metric.shortLabel,
      tooltipTitle: metric.label,
      tooltipText: metric.description
    }))
  }, [xScale])

  // Check if we have any data at all
  const hasData = categoryBands.some(b => b.count > 0)

  // Empty state
  if (!hasData && !currentScores) {
    return (
      <div className={`cause-metric-parallel-coords ${className}`.trim()}>
        <div className="cause-metric-parallel-coords__placeholder">
          No metric data available
        </div>
      </div>
    )
  }

  return (
    <div className={`cause-metric-parallel-coords ${className}`.trim()}>
      <div ref={svgWrapperRef} className="cause-metric-parallel-coords__svg-wrapper">
        <svg
          width={FIXED_WIDTH}
          height={svgHeight}
          className="cause-metric-parallel-coords__svg"
        >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Axis lines */}
          {axes.map((axis, i) => {
            // Wide invisible hover zone spanning halfway to neighboring axes
            const axisSpacing = axes.length > 1 ? axes[1].x - axes[0].x : 40
            const halfGap = axisSpacing / 2
            const zoneX = i === 0 ? -MARGIN.left : axis.x - halfGap
            const zoneWidth = i === 0
              ? halfGap + MARGIN.left
              : i === axes.length - 1
                ? halfGap + MARGIN.right
                : axisSpacing

            return (
            <g key={i} className="cause-metric-parallel-coords__axis-group">
              {/* Invisible wide hover target for tooltip */}
              <rect
                x={zoneX}
                y={-MARGIN.top}
                width={zoneWidth}
                height={innerHeight + MARGIN.top + MARGIN.bottom}
                fill="transparent"
                data-tooltip-title={axis.tooltipTitle}
                data-tooltip={axis.tooltipText}
              />
              <line
                x1={axis.x}
                y1={0}
                x2={axis.x}
                y2={innerHeight}
                className="cause-metric-parallel-coords__axis"
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={axis.x}
                y={innerHeight + (i % 2 === 0 ? 4 : 16)}
                className="cause-metric-parallel-coords__axis-label"
                style={{ pointerEvents: 'none' }}
              >
                {axis.label}
              </text>
              {/* Top tick label (1.0) */}
              {i === 0 && (
                <text
                  x={axis.x - 4}
                  y={4}
                  className="cause-metric-parallel-coords__tick-label"
                >
                  1
                </text>
              )}
              {/* Bottom tick label (0.0) */}
              {i === 0 && (
                <text
                  x={axis.x - 4}
                  y={innerHeight}
                  className="cause-metric-parallel-coords__tick-label"
                >
                  0
                </text>
              )}
            </g>
          )})}

          {/* Random baseline dotted line at 0.5 for embedding, detection, fuzz */}
          <line
            x1={xScale(2)}
            y1={yScale(0.5)}
            x2={xScale(4)}
            y2={yScale(0.5)}
            className="cause-metric-parallel-coords__random-line"
            stroke="#B22222"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            style={{ pointerEvents: 'none' }}
          />

          {/* Category bands: IQR polygon + median line */}
          {bandShapes.map(({ band, polygon, medianLine }) => (
            <g key={band.category} style={{ pointerEvents: 'none' }}>
              {/* IQR shaded band */}
              {polygon && (
                <polygon
                  points={polygon}
                  fill={band.color}
                  fillOpacity={BAND_FILL_OPACITY}
                  stroke="none"
                />
              )}
              {/* Median line */}
              {medianLine && (
                <polyline
                  points={medianLine}
                  fill="none"
                  stroke={band.color}
                  strokeWidth={MEDIAN_STROKE_WIDTH}
                  strokeOpacity={MEDIAN_STROKE_OPACITY}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          ))}

          {/* Foreground line (current feature) */}
          {foregroundLine && (
            <polyline
              points={foregroundLine}
              className="cause-metric-parallel-coords__foreground-line"
              style={{ stroke: LINE_COLOR, pointerEvents: 'none' }}
            />
          )}

          {/* Data points on foreground line */}
          {currentScores && METRICS.map((metric, index) => {
            const value = currentScores[metric.key]
            if (value === null || value === undefined) return null
            return (
              <circle
                key={index}
                cx={xScale(index)}
                cy={yScale(value)}
                r={4}
                className="cause-metric-parallel-coords__foreground-point"
                style={{ fill: LINE_COLOR, pointerEvents: 'none' }}
              />
            )
          })}
        </g>
        </svg>
      </div>
    </div>
  )
}

export default CauseMetricParallelCoords
