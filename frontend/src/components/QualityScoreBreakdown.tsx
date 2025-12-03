import React from 'react'
import type { FeatureTableRow, MetricNormalizationStats } from '../types'
import { getExplainerDisplayName, calculateQualityScore } from '../lib/table-data-utils'
import { getMetricColor } from '../lib/utils'

interface QualityScoreBreakdownProps {
  feature: FeatureTableRow
  globalStats: Record<string, MetricNormalizationStats>
  width?: number
}

const QualityScoreBreakdown: React.FC<QualityScoreBreakdownProps> = React.memo(({
  feature,
  globalStats,
  width = 180
}) => {
  // Calculate raw averaged scores for each explainer
  const explainerIds = Object.keys(feature.explainers)

  // Chart dimensions - smaller and simpler
  const chartWidth = width
  const chartHeight = 120
  const margin = { top: 13, right: 10, bottom: 13, left: 13 }
  const innerWidth = chartWidth - margin.left - margin.right
  const innerHeight = chartHeight - margin.top - margin.bottom

  // Calculate metrics for each explainer (raw averaged values)
  const explainerMetrics = explainerIds.map((explainerId) => {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) return null

    // Embedding: raw value
    const embeddingValue = explainerData.embedding

    // Fuzz: average of scorers
    const fuzzScores = [explainerData.fuzz.s1, explainerData.fuzz.s2, explainerData.fuzz.s3].filter(s => s !== null) as number[]
    const fuzzAvg = fuzzScores.length > 0
      ? fuzzScores.reduce((a, b) => a + b, 0) / fuzzScores.length
      : null

    // Detection: average of scorers
    const detectionScores = [explainerData.detection.s1, explainerData.detection.s2, explainerData.detection.s3].filter(s => s !== null) as number[]
    const detectionAvg = detectionScores.length > 0
      ? detectionScores.reduce((a, b) => a + b, 0) / detectionScores.length
      : null

    return {
      id: explainerId,
      name: getExplainerDisplayName(explainerId),
      embedding: {
        value: embeddingValue,
        color: embeddingValue !== null ? getMetricColor('embedding', 0.5) : '#cccccc'
      },
      fuzz: {
        value: fuzzAvg,
        color: fuzzAvg !== null ? getMetricColor('fuzz', 0.5) : '#cccccc'
      },
      detection: {
        value: detectionAvg,
        color: detectionAvg !== null ? getMetricColor('detection', 0.5) : '#cccccc'
      }
    }
  }).filter(m => m !== null)

  // Calculate combined Y scale range (min of all mins to max of all maxs)
  let yMin = Infinity
  let yMax = -Infinity

  // Include global stats ranges
  if (globalStats.embedding) {
    yMin = Math.min(yMin, globalStats.embedding.min)
    yMax = Math.max(yMax, globalStats.embedding.max)
  }
  if (globalStats.fuzz) {
    yMin = Math.min(yMin, globalStats.fuzz.min)
    yMax = Math.max(yMax, globalStats.fuzz.max)
  }
  if (globalStats.detection) {
    yMin = Math.min(yMin, globalStats.detection.min)
    yMax = Math.max(yMax, globalStats.detection.max)
  }

  // Fallback if no stats available
  if (!isFinite(yMin) || !isFinite(yMax)) {
    yMin = 0
    yMax = 1
  }

  // Add 5% padding to Y scale
  const yRange = yMax - yMin
  const yPadding = yRange * 0.05
  yMin = yMin - yPadding
  yMax = yMax + yPadding

  const yScale = (value: number) => {
    const normalized = (value - yMin) / (yMax - yMin)
    return innerHeight * (1 - normalized) // Invert for SVG coordinates
  }

  // Calculate quality score (normalized average)
  const qualityScores: number[] = []
  explainerMetrics.forEach(metrics => {
    const explainerData = feature.explainers[metrics.id]
    if (explainerData) {
      const qs = calculateQualityScore(
        explainerData.embedding,
        explainerData.fuzz,
        explainerData.detection,
        globalStats
      )
      if (qs !== null) {
        // Convert normalized quality score (0-1) to actual value range for display
        const qualityValue = yMin + qs * (yMax - yMin)
        qualityScores.push(qualityValue)
      }
    }
  })
  const avgQualityScore = qualityScores.length > 0
    ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
    : null

  // X scale for explainers
  const xSpacing = innerWidth / (explainerMetrics.length)
  const xScale = (index: number) => xSpacing * index

  return (
    <div className="table-panel__quality-breakdown">
      <svg width={chartWidth} height={chartHeight}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Y-axis (score value) */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={innerHeight}
            stroke="#d1d5db"
            strokeWidth={1}
          />

          {/* Y-axis labels - show min and max */}
          <text
            x={-3}
            y={5}
            textAnchor="end"
            fontSize={8}
            fill="#6b7280"
          >
            {yMax.toFixed(2)}
          </text>
          <text
            x={-3}
            y={innerHeight}
            textAnchor="end"
            fontSize={8}
            fill="#6b7280"
          >
            {yMin.toFixed(2)}
          </text>

          {/* X-axis */}
          <line
            x1={0}
            y1={innerHeight}
            x2={innerWidth}
            y2={innerHeight}
            stroke="#d1d5db"
            strokeWidth={1}
          />

          {/* Quality score line */}
          {avgQualityScore !== null && (
            <line
              x1={0}
              y1={yScale(avgQualityScore)}
              x2={innerWidth}
              y2={yScale(avgQualityScore)}
              stroke="#000000"
              strokeWidth={1}
              strokeDasharray="4,2"
              opacity={1}
            />
          )}

          {/* Render each explainer's metrics as circles */}
          {explainerMetrics.map((metrics, index) => {
            const x = xScale(index) + 25
            const circleRadius = 3
            const metricSpacing = 6

            return (
              <g key={metrics.id}>
                {/* X-axis label (explainer name) */}
                <text
                  x={x}
                  y={innerHeight + 10}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#374151"
                >
                  {metrics.name}
                </text>

                {/* Fuzz circle */}
                {metrics.fuzz.value !== null && (
                  <circle
                    cx={x - metricSpacing}
                    cy={yScale(metrics.fuzz.value)}
                    r={circleRadius}
                    fill={metrics.fuzz.color}
                  />
                )}

                {/* Detection circle */}
                {metrics.detection.value !== null && (
                  <circle
                    cx={x}
                    cy={yScale(metrics.detection.value)}
                    r={circleRadius}
                    fill={metrics.detection.color}
                  />
                )}

                {/* Embedding circle */}
                {metrics.embedding.value !== null && (
                  <circle
                    cx={x + metricSpacing}
                    cy={yScale(metrics.embedding.value)}
                    r={circleRadius}
                    fill={metrics.embedding.color}
                  />
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
})

QualityScoreBreakdown.displayName = 'QualityScoreBreakdown'

export default QualityScoreBreakdown