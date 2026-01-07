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
const MARGIN = { top: 6, right: 30, bottom: 32, left: 30 }
const MIN_WIDTH = 250
const MIN_HEIGHT = 80

// Line colors (matches CauseView legend)
const LINE_COLOR = '#000000'
const WELL_EXPLAINED_COLOR = '#22c55e'

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
            </g>
          ))}

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
          />

          {/* Background lines (well-explained features) */}
          {backgroundLines.map(({ id, points }) => (
            <polyline
              key={id}
              points={points}
              className="cause-metric-parallel-coords__background-line"
              style={{ stroke: WELL_EXPLAINED_COLOR }}
            />
          ))}

          {/* Foreground line (current feature) */}
          {foregroundLine && (
            <polyline
              points={foregroundLine}
              className="cause-metric-parallel-coords__foreground-line"
              style={{ stroke: LINE_COLOR }}
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
                style={{ fill: LINE_COLOR }}
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
