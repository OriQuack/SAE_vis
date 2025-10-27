import React from 'react'
import type { FeatureTableRow, MetricNormalizationStats } from '../types'
import { getExplainerDisplayName } from '../lib/d3-table-utils'
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
  // Calculate z-scores and ranges for each explainer
  const explainerIds = Object.keys(feature.explainers)

  // Chart dimensions - smaller and simpler
  const chartWidth = width
  const chartHeight = 120
  const margin = { top: 13, right: 10, bottom: 13, left: 13 }
  const innerWidth = chartWidth - margin.left - margin.right
  const innerHeight = chartHeight - margin.top - margin.bottom

  // Calculate metrics for each explainer
  const explainerMetrics = explainerIds.map((explainerId) => {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) return null

    // Calculate z-scores for each metric
    const embeddingZScore = explainerData.embedding !== null && globalStats.embedding
      ? (explainerData.embedding - globalStats.embedding.mean) / (globalStats.embedding.std || 1)
      : null

    // Fuzz: calculate z-score range and average
    const fuzzScores = [explainerData.fuzz.s1, explainerData.fuzz.s2, explainerData.fuzz.s3].filter(s => s !== null) as number[]
    const fuzzZScores = fuzzScores.map(score =>
      globalStats.fuzz ? (score - globalStats.fuzz.mean) / (globalStats.fuzz.std || 1) : 0
    )
    const fuzzZMin = fuzzZScores.length > 0 ? Math.min(...fuzzZScores) : null
    const fuzzZMax = fuzzZScores.length > 0 ? Math.max(...fuzzZScores) : null
    const fuzzZAvg = fuzzZScores.length > 0 ? fuzzZScores.reduce((a, b) => a + b, 0) / fuzzZScores.length : null

    // Detection: calculate z-score range and average
    const detectionScores = [explainerData.detection.s1, explainerData.detection.s2, explainerData.detection.s3].filter(s => s !== null) as number[]
    const detectionZScores = detectionScores.map(score =>
      globalStats.detection ? (score - globalStats.detection.mean) / (globalStats.detection.std || 1) : 0
    )
    const detectionZMin = detectionZScores.length > 0 ? Math.min(...detectionZScores) : null
    const detectionZMax = detectionZScores.length > 0 ? Math.max(...detectionZScores) : null
    const detectionZAvg = detectionZScores.length > 0 ? detectionZScores.reduce((a, b) => a + b, 0) / detectionZScores.length : null

    return {
      id: explainerId,
      name: getExplainerDisplayName(explainerId),
      embedding: {
        zScore: embeddingZScore,
        color: embeddingZScore !== null ? getMetricColor('embedding', 0.5) : '#cccccc'
      },
      fuzz: {
        zMin: fuzzZMin,
        zMax: fuzzZMax,
        zAvg: fuzzZAvg,
        color: fuzzZAvg !== null ? getMetricColor('fuzz', 0.5) : '#cccccc'
      },
      detection: {
        zMin: detectionZMin,
        zMax: detectionZMax,
        zAvg: detectionZAvg,
        color: detectionZAvg !== null ? getMetricColor('detection', 0.5) : '#cccccc'
      }
    }
  }).filter(m => m !== null)

  // Fixed Y scale bounds (z-score range: -3 to 3)
  const yMin = -3
  const yMax = 3
  const yScale = (zScore: number) => {
    const normalized = (zScore - yMin) / (yMax - yMin)
    return innerHeight * (1 - normalized) // Invert for SVG coordinates
  }

  // Calculate quality score z-score (average of all explainer z-score averages)
  const qualityScoreZScores: number[] = []
  explainerMetrics.forEach(m => {
    const zScores: number[] = []
    if (m.embedding.zScore !== null) zScores.push(m.embedding.zScore)
    if (m.fuzz.zAvg !== null) zScores.push(m.fuzz.zAvg)
    if (m.detection.zAvg !== null) zScores.push(m.detection.zAvg)

    if (zScores.length > 0) {
      const avgZ = zScores.reduce((sum, z) => sum + z, 0) / zScores.length
      qualityScoreZScores.push(avgZ)
    }
  })
  const qualityScoreZ = qualityScoreZScores.length > 0
    ? qualityScoreZScores.reduce((sum, z) => sum + z, 0) / qualityScoreZScores.length
    : null

  // X scale for explainers
  const xSpacing = innerWidth / (explainerMetrics.length)
  const xScale = (index: number) => xSpacing * index

  return (
    <div className="table-panel__quality-breakdown">
      <svg width={chartWidth} height={chartHeight}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Y-axis (z-score) */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={innerHeight}
            stroke="#d1d5db"
            strokeWidth={1}
          />

          {/* Y-axis label - only show 0 to save space */}
          <text
            x={-3}
            y={innerHeight / 2}
            textAnchor="end"
            fontSize={10}
            fill="#6b7280"
          >
            0
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

          {/* Quality score z-score line */}
          {qualityScoreZ !== null && (
            <line
              x1={0}
              y1={yScale(qualityScoreZ)}
              x2={innerWidth}
              y2={yScale(qualityScoreZ)}
              stroke="#000000"
              strokeWidth={1}
              strokeDasharray="4,2"
              opacity={1}
            />
          )}

          {/* Render each explainer's metrics */}
          {explainerMetrics.map((metrics, index) => {
            const x = xScale(index) + 25
            const pillWidth = 6
            const circleRadius = 3
            const metricSpacing = 6  // Minimal spacing to keep metrics side by side

            // Calculate pill dimensions with minimum height
            const fuzzRangeHeight = metrics.fuzz.zMin !== null && metrics.fuzz.zMax !== null
              ? Math.abs(yScale(metrics.fuzz.zMin!) - yScale(metrics.fuzz.zMax!))
              : 0
            const fuzzHeight = Math.max(fuzzRangeHeight, pillWidth)
            const fuzzY = metrics.fuzz.zMin !== null && metrics.fuzz.zMax !== null
              ? (yScale(metrics.fuzz.zMax!) + yScale(metrics.fuzz.zMin!)) / 2 - fuzzHeight / 2
              : 0

            const detectionRangeHeight = metrics.detection.zMin !== null && metrics.detection.zMax !== null
              ? Math.abs(yScale(metrics.detection.zMin!) - yScale(metrics.detection.zMax!))
              : 0
            const detectionHeight = Math.max(detectionRangeHeight, pillWidth)
            const detectionY = metrics.detection.zMin !== null && metrics.detection.zMax !== null
              ? (yScale(metrics.detection.zMax!) + yScale(metrics.detection.zMin!)) / 2 - detectionHeight / 2
              : 0

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

                {/* Fuzz pill */}
                {metrics.fuzz.zMin !== null && metrics.fuzz.zMax !== null && (
                  <rect
                    x={x - metricSpacing - pillWidth / 2}
                    y={fuzzY}
                    width={pillWidth}
                    height={fuzzHeight}
                    rx={pillWidth / 2}
                    ry={pillWidth / 2}
                    fill={metrics.fuzz.color}
                    opacity={1}
                  />
                )}

                {/* Detection pill */}
                {metrics.detection.zMin !== null && metrics.detection.zMax !== null && (
                  <rect
                    x={x - pillWidth / 2}
                    y={detectionY}
                    width={pillWidth}
                    height={detectionHeight}
                    rx={pillWidth / 2}
                    ry={pillWidth / 2}
                    fill={metrics.detection.color}
                    opacity={1}
                  />
                )}

                {/* Embedding circle */}
                {metrics.embedding.zScore !== null && (
                  <circle
                    cx={x + metricSpacing}
                    cy={yScale(metrics.embedding.zScore)}
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