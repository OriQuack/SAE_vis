import React, { useMemo, useState } from 'react'
import { useVisualizationStore } from '../store'
import {
  calculateLinearSetLayout,
  LINEAR_SET_METRICS,
  DEFAULT_LINEAR_SET_DIMENSIONS
} from '../lib/d3-linear-set-utils'
import '../styles/ProgressBar.css'

interface ProgressBarProps {
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ className = '' }) => {
  const thresholdGroups = useVisualizationStore(state => state.thresholdGroups)
  const [hoveredGroupIndex, setHoveredGroupIndex] = useState<number | null>(null)
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null)

  // Calculate layout using D3 utilities
  const layout = useMemo(
    () => calculateLinearSetLayout(thresholdGroups, DEFAULT_LINEAR_SET_DIMENSIONS),
    [thresholdGroups]
  )

  const { width, height, margin, lineHeight } = DEFAULT_LINEAR_SET_DIMENSIONS
  const {
    featureGroups,
    metricSegments,
    groupPositions,
    innerHeight,
    rowHeight,
    xScale
  } = layout

  return (
    <div className={`progress-bar ${className}`}>
      <svg className="progress-bar__svg" width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Background groups */}
          {featureGroups.map((_group, index) => {
            const pos = groupPositions[index]
            const x = xScale(pos.start)
            const groupWidth = xScale(pos.end - pos.start)
            const isHovered = hoveredGroupIndex === index

            return (
              <rect
                key={index}
                x={x}
                y={0}
                width={groupWidth}
                height={innerHeight}
                fill={isHovered ? '#f3f4f6' : 'transparent'}
                stroke="#e5e7eb"
                strokeWidth={0.5}
                onMouseEnter={() => setHoveredGroupIndex(index)}
                onMouseLeave={() => setHoveredGroupIndex(null)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}

          {/* Metric rows with line segments */}
          {LINEAR_SET_METRICS.map((metric, rowIndex) => {
            const y = rowIndex * rowHeight + rowHeight / 2
            const segments = metricSegments.get(metric.key) || []
            const isHovered = hoveredMetric === metric.key

            return (
              <g key={metric.key}>
                {/* Row label */}
                <text
                  x={-10}
                  y={y}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize={12}
                  fontWeight={isHovered ? 600 : 500}
                  fill={isHovered ? '#1f2937' : '#374151'}
                >
                  {metric.label}
                </text>

                {/* Line segments */}
                {segments.map((segment, segIndex) => (
                  <rect
                    key={segIndex}
                    x={xScale(segment.startX)}
                    y={y - lineHeight / 2}
                    width={xScale(segment.endX) - xScale(segment.startX)}
                    height={lineHeight}
                    fill={metric.color}
                    opacity={isHovered ? 1 : 0.7}
                    onMouseEnter={() => setHoveredMetric(metric.key)}
                    onMouseLeave={() => setHoveredMetric(null)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Hover details */}
      {hoveredGroupIndex !== null && (
        <div className="progress-bar__hover-details">
          <div className="progress-bar__hover-title">
            Group {hoveredGroupIndex + 1}: {featureGroups[hoveredGroupIndex].count} features
          </div>
          <div className="progress-bar__hover-text">
            Metrics: {featureGroups[hoveredGroupIndex].metrics.size === 0
              ? 'No thresholds'
              : Array.from(featureGroups[hoveredGroupIndex].metrics)
                  .map(key => LINEAR_SET_METRICS.find(m => m.key === key)?.label)
                  .filter(Boolean)
                  .join(', ')}
          </div>
          <div className="progress-bar__hover-text" style={{ marginTop: '4px', fontSize: '10px' }}>
            Features: {featureGroups[hoveredGroupIndex].featureIds.slice(0, 10).join(', ')}
            {featureGroups[hoveredGroupIndex].featureIds.length > 10 && '...'}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProgressBar
