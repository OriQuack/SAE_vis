// ============================================================================
// CAUSE METRIC PARALLEL COORDINATES
// Parallel coordinates visualization for root cause metric scores
// ============================================================================
// Displays metrics as parallel vertical axes with connecting lines:
// - Background lines: Stage 2 "Well-Explained" features (low opacity)
// - Foreground line: Currently selected feature (vivid)
//
// Axes (left to right):
// - Activation Example Sim (intraFeatureSim)
// - LLM Explainer Semantic Sim (explainerSemanticSim)
// - Embedding (embedding)
// - Detection (detection)
// - Fuzz (fuzz)

import React, { useMemo, useRef, useState, useEffect } from 'react'
import { scaleLinear } from 'd3-scale'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'
import type { CauseCategory } from '../lib/umap-utils'
import '../styles/CauseMetricParallelCoords.css'

// ============================================================================
// TYPES
// ============================================================================

export interface CauseMetricParallelCoordsProps {
  /** Scores from Stage 2 "Well-Explained" features for background lines */
  wellExplainedScores: Map<number, CauseMetricScores>
  /** Scores of the currently selected feature for foreground line */
  currentScores: CauseMetricScores | null
  /** Current feature's cause category (for foreground line color) */
  currentCategory?: CauseCategory | null
  /** Optional className for container */
  className?: string
}

// Metric configuration for axes
interface MetricConfig {
  key: keyof CauseMetricScores
  label: string
  shortLabel: string
}

// Define the 5 metrics in order (left to right)
const METRICS: MetricConfig[] = [
  { key: 'intraFeatureSim', label: 'Activation Example Sim', shortLabel: 'Act. Sim' },
  { key: 'explainerSemanticSim', label: 'LLM Explainer Semantic Sim', shortLabel: 'LLM Explainer Sim' },
  { key: 'embedding', label: 'Embedding', shortLabel: 'Embedding' },
  { key: 'detection', label: 'Detection', shortLabel: 'Detection' },
  { key: 'fuzz', label: 'Fuzz', shortLabel: 'Fuzz' }
]

// Layout constants
const MARGIN = { top: 0, right: 15, bottom: 25, left: 20 }
const HEIGHT = 150
const MIN_WIDTH = 250

// Map cause category to display name for color lookup
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

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CauseMetricParallelCoords - Parallel coordinates visualization for cause metrics
 *
 * Shows:
 * - Background lines: Well-explained features from Stage 2 (low opacity)
 * - Foreground line: Currently selected feature (vivid, thicker)
 */
export const CauseMetricParallelCoords: React.FC<CauseMetricParallelCoordsProps> = ({
  wellExplainedScores,
  currentScores,
  currentCategory = null,
  className = ''
}) => {
  // Container ref and width tracking for full-width responsiveness
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(MIN_WIDTH)

  // Track container width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width || MIN_WIDTH
      setContainerWidth(Math.max(width, MIN_WIDTH))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Get colors
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#22c55e'
  const foregroundColor = useMemo(() => {
    if (currentCategory) {
      const tagName = CATEGORY_TO_TAG_NAME[currentCategory]
      return getTagColor(TAG_CATEGORY_CAUSE, tagName) || '#374151'
    }
    return '#374151' // Neutral dark gray for unsure
  }, [currentCategory])

  // Calculate dimensions and scales (responsive to container width)
  const { width, innerHeight, xScale, yScale } = useMemo(() => {
    const w = containerWidth
    const iw = w - MARGIN.left - MARGIN.right
    const ih = HEIGHT - MARGIN.top - MARGIN.bottom

    // X scale: map axis index (0-4) to x position
    const xs = scaleLinear()
      .domain([0, METRICS.length - 1])
      .range([0, iw])

    // Y scale: map metric value (0-1) to y position (inverted: 0 at bottom)
    const ys = scaleLinear()
      .domain([0, 1])
      .range([ih, 0])

    return {
      width: w,
      innerHeight: ih,
      xScale: (i: number) => xs(i) ?? 0,
      yScale: (v: number) => ys(v) ?? 0
    }
  }, [containerWidth])

  // Generate background lines (well-explained features)
  const backgroundLines = useMemo(() => {
    const lines: Array<{ id: number; points: string }> = []

    wellExplainedScores.forEach((scores, featureId) => {
      const points = generatePolylinePoints(scores, xScale, yScale)
      if (points) {
        lines.push({ id: featureId, points })
      }
    })

    return lines
  }, [wellExplainedScores, xScale, yScale])

  // Generate foreground line (current feature)
  const foregroundLine = useMemo(() => {
    if (!currentScores) return null
    return generatePolylinePoints(currentScores, xScale, yScale)
  }, [currentScores, xScale, yScale])

  // Generate axis lines and labels
  const axes = useMemo(() => {
    return METRICS.map((metric, index) => ({
      x: xScale(index),
      label: metric.shortLabel
    }))
  }, [xScale])

  // Empty state
  if (wellExplainedScores.size === 0 && !currentScores) {
    return (
      <div ref={containerRef} className={`cause-metric-parallel-coords ${className}`.trim()}>
        <div className="cause-metric-parallel-coords__placeholder">
          No metric data available
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`cause-metric-parallel-coords ${className}`.trim()}>
      {/* Legend */}
      <div className="cause-metric-parallel-coords__legend">
        <div className="cause-metric-parallel-coords__legend-item">
          <svg width="24" height="12" className="cause-metric-parallel-coords__legend-line">
            <line
              x1="0" y1="6" x2="24" y2="6"
              stroke={wellExplainedColor}
              strokeWidth="1"
              opacity="0.4"
            />
          </svg>
          <span className="cause-metric-parallel-coords__legend-label">
            Well-Explained ({wellExplainedScores.size})
          </span>
        </div>
        <div className="cause-metric-parallel-coords__legend-item">
          <svg width="24" height="12" className="cause-metric-parallel-coords__legend-line">
            <line
              x1="0" y1="6" x2="24" y2="6"
              stroke={foregroundColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="6" r="3" fill={foregroundColor} stroke="white" strokeWidth="1" />
          </svg>
          <span className="cause-metric-parallel-coords__legend-label">
            Current Feature
          </span>
        </div>
      </div>
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="cause-metric-parallel-coords__svg"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Axis lines */}
          {axes.map((axis, i) => (
            <g key={i} className="cause-metric-parallel-coords__axis-group">
              <line
                x1={axis.x}
                y1={0}
                x2={axis.x}
                y2={innerHeight}
                className="cause-metric-parallel-coords__axis"
              />
              <text
                x={axis.x}
                y={innerHeight + 15}
                className="cause-metric-parallel-coords__axis-label"
              >
                {axis.label}
              </text>
              {/* Top tick label (1.0) */}
              {i === 0 && (
                <text
                  x={axis.x - 8}
                  y={4}
                  className="cause-metric-parallel-coords__tick-label"
                >
                  1
                </text>
              )}
              {/* Bottom tick label (0.0) */}
              {i === 0 && (
                <text
                  x={axis.x - 8}
                  y={innerHeight + 4}
                  className="cause-metric-parallel-coords__tick-label"
                >
                  0
                </text>
              )}
            </g>
          ))}

          {/* Background lines (well-explained features) */}
          {backgroundLines.map(({ id, points }) => (
            <polyline
              key={id}
              points={points}
              className="cause-metric-parallel-coords__background-line"
              style={{ stroke: wellExplainedColor }}
            />
          ))}

          {/* Foreground line (current feature) */}
          {foregroundLine && (
            <polyline
              points={foregroundLine}
              className="cause-metric-parallel-coords__foreground-line"
              style={{ stroke: foregroundColor }}
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
                style={{ fill: foregroundColor }}
              />
            )
          })}
        </g>
      </svg>
    </div>
  )
}

export default CauseMetricParallelCoords
