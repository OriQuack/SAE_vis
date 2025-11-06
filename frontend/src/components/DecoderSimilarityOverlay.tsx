import React, { useRef, useState, useEffect } from 'react'
import { getCircleRadius } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'

/**
 * DecoderSimilarityOverlay - Professional single-SVG visualization
 *
 * Renders decoder similarity connections as a single overlay SVG spanning
 * the entire feature group, eliminating complex per-row pass-through logic.
 */

interface SimilarFeature {
  feature_id: number
  cosine_similarity: number
  is_main?: boolean
  inter_feature_similarity?: any  // Not used by overlay, but present in data
}

interface DecoderSimilarityOverlayProps {
  similarFeatures: SimilarFeature[]
  rowCount: number
  rowHeight: number
}

const DecoderSimilarityOverlay: React.FC<DecoderSimilarityOverlayProps> = ({
  similarFeatures,
  rowCount,
  rowHeight
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(100)
  const [containerHeight, setContainerHeight] = useState(rowCount * rowHeight)

  // Measure actual container dimensions
  useEffect(() => {
    const measureDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        const height = containerRef.current.offsetHeight
        if (width > 0) {
          setContainerWidth(width)
        }
        if (height > 0) {
          setContainerHeight(height)
        }
      }
    }

    // Measure immediately
    measureDimensions()

    // Measure after a short delay to ensure table layout is complete
    const timeoutId = setTimeout(measureDimensions, 100)

    const observer = new ResizeObserver(measureDimensions)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [rowCount, rowHeight])

  // Filter out main feature (we only draw connections for similar features)
  const similarOnly = similarFeatures.filter(f => !f.is_main)

  // Calculate number of circles
  const numCircles = similarOnly.length

  // Calculate X positions in pixels based on measured container width
  const padding = containerWidth * 0.1  // 10% padding
  const availableWidth = containerWidth - (2 * padding)
  const spacing = numCircles > 1 ? availableWidth / (numCircles - 1) : 0
  const xPositions = similarOnly.map((_, idx) => padding + (idx * spacing))

  // Calculate Y positions based on actual container height
  // Distribute evenly across the measured height
  const rowHeightActual = containerHeight / rowCount
  const mainRowCenterY = rowHeightActual / 2  // Center of first row (main feature)

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <svg
        className="decoder-similarity-overlay"
        width={containerWidth}
        height={containerHeight}
        style={{
          display: 'block',
          pointerEvents: 'none'
        }}
      >
        {/* Draw all lines first (so they appear behind circles) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1  // Target circles appear in rows 1-4 (0-indexed)
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2  // Center of target row

          return (
            <line
              key={`line-${similar.feature_id}`}
              x1={x}
              y1={mainRowCenterY}
              x2={x}
              y2={circleY}
              stroke="#9ca3af"
              strokeWidth="1.5"
              opacity="1.0"
            />
          )
        })}

        {/* Draw all circles second (so they appear above lines) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1  // Target circles appear in rows 1-4 (0-indexed)
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2  // Center of target row

          return (
            <g key={similar.feature_id}>
              {/* Circle in main feature row (row 0) */}
              <circle
                cx={x}
                cy={mainRowCenterY}
                r={getCircleRadius(similar.cosine_similarity)}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke="none"
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>

              {/* Circle at target row */}
              <circle
                cx={x}
                cy={circleY}
                r={getCircleRadius(similar.cosine_similarity)}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke="none"
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default DecoderSimilarityOverlay
