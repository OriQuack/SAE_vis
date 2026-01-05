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
import { TAG_CATEGORY_QUALITY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'
import '../styles/ParallelCoordinates.css'

// ============================================================================
// TYPES
// ============================================================================

export interface ParallelCoordsProps {
  /** Scores from Stage 2 "Well-Explained" features for background lines */
  wellExplainedScores: Map<number, CauseMetricScores>
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
const MARGIN = { top: 5, right: 25, bottom: 30, left: 25 }
const MIN_WIDTH = 250
const MIN_HEIGHT = 80

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
export const CauseMetricParallelCoords: React.FC<ParallelCoordsProps> = ({
  wellExplainedScores,
  currentScores,
  className = ''
}) => {
  // SVG wrapper ref for size tracking (excludes legend)
  const svgWrapperRef = useRef<HTMLDivElement>(null)
  const [svgSize, setSvgSize] = useState({ width: MIN_WIDTH, height: MIN_HEIGHT })

  // Track SVG wrapper size with ResizeObserver
  useEffect(() => {
    if (!svgWrapperRef.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) {
        setSvgSize({
          width: Math.max(rect.width, MIN_WIDTH),
          height: Math.max(rect.height, MIN_HEIGHT)
        })
      }
    })
    observer.observe(svgWrapperRef.current)
    return () => observer.disconnect()
  }, [])

  // Line colors
  const lineColor = '#000000'
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#22c55e'

  // Calculate dimensions and scales (responsive to SVG wrapper size)
  const { width, height, innerHeight, xScale, yScale } = useMemo(() => {
    const w = svgSize.width
    const h = svgSize.height
    const iw = w - MARGIN.left - MARGIN.right
    const ih = h - MARGIN.top - MARGIN.bottom

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
      height: h,
      innerHeight: ih,
      xScale: (i: number) => xs(i) ?? 0,
      yScale: (v: number) => ys(v) ?? 0
    }
  }, [svgSize])

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
      <div className={`cause-metric-parallel-coords ${className}`.trim()}>
        <div className="cause-metric-parallel-coords__placeholder">
          No metric data available
        </div>
      </div>
    )
  }

  return (
    <div className={`cause-metric-parallel-coords ${className}`.trim()}>
      {/* Header row with title and legend */}
      <div className="cause-metric-parallel-coords__header">
        <h4 className="subheader">Metrics</h4>
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
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="6" r="3" fill={lineColor} stroke="white" strokeWidth="1" />
          </svg>
          <span className="cause-metric-parallel-coords__legend-label">
            Current Feature
          </span>
        </div>
        <div className="cause-metric-parallel-coords__legend-item">
          <svg width="16" height="12" className="cause-metric-parallel-coords__legend-line">
            <line x1="4" y1="6" x2="12" y2="6" stroke="#B22222" strokeWidth="1.5" />
          </svg>
          <span className="cause-metric-parallel-coords__legend-label">
            Random (0.5)
          </span>
        </div>
        </div>
      </div>
      {/* SVG wrapper for size measurement */}
      <div ref={svgWrapperRef} className="cause-metric-parallel-coords__svg-wrapper">
        <svg
          width={width}
          height={height}
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
              {/* Random baseline tick at 0.5 for embedding, detection, fuzz */}
              {(i === 2 || i === 3 || i === 4) && (
                <line
                  x1={axis.x - 4}
                  y1={yScale(0.5)}
                  x2={axis.x + 4}
                  y2={yScale(0.5)}
                  className="cause-metric-parallel-coords__random-tick"
                />
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
              style={{ stroke: lineColor }}
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
                style={{ fill: lineColor }}
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
