import React, { useRef, useState, useEffect } from 'react'
import { getCircleRadius } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'

/**
 * DecoderSimilarityOverlay - Professional single-SVG visualization
 *
 * Renders decoder similarity connections as a single overlay SVG spanning
 * the entire feature group, eliminating complex per-row pass-through logic.
 * Now includes interactive badges for pattern type visualization.
 */

interface SimilarFeature {
  feature_id: number
  cosine_similarity: number
  is_main?: boolean
  inter_feature_similarity?: any  // Inter-feature similarity data with pattern_type
}

interface DecoderSimilarityOverlayProps {
  similarFeatures: SimilarFeature[]
  rowCount: number
  rowHeight: number
  mainFeatureId?: number  // Main/pivot feature ID for interaction tracking
  onBadgeInteraction?: (mainFeatureId: number, similarFeatureId: number, interfeatureData: any, isClick: boolean) => void
  onBadgeLeave?: () => void
}

// Badge component for SVG context - displays pattern type badges
interface DecoderBadgeProps {
  patternType: 'Lexical' | 'Semantic' | 'Both' | 'None'
  isHovered?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick?: () => void
}

const DecoderBadge: React.FC<DecoderBadgeProps> = ({
  patternType,
  isHovered = false,
  onMouseEnter,
  onMouseLeave,
  onClick
}) => {
  const interactiveProps = (onMouseEnter || onMouseLeave || onClick) ? {
    onMouseEnter,
    onMouseLeave,
    onClick,
    style: { cursor: 'pointer' }
  } : {}

  const hoverClass = isHovered ? ' decoder-stage-table__badge--hover' : ''

  if (patternType === 'Both') {
    return (
      <div
        className="decoder-stage-table__badge-stack decoder-stage-table__badge--compact"
        {...interactiveProps}
      >
        <span className={`decoder-stage-table__badge decoder-stage-table__badge--lexical decoder-stage-table__badge--compact${hoverClass}`}>
          LEX
        </span>
        <span className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}`}>
          SEM
        </span>
      </div>
    )
  } else if (patternType === 'Lexical') {
    return (
      <span
        className={`decoder-stage-table__badge decoder-stage-table__badge--lexical decoder-stage-table__badge--compact${hoverClass}`}
        {...interactiveProps}
      >
        LEX
      </span>
    )
  } else if (patternType === 'Semantic') {
    return (
      <span
        className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}`}
        {...interactiveProps}
      >
        SEM
      </span>
    )
  } else {
    return null  // Don't render "None" badges
  }
}

const DecoderSimilarityOverlay: React.FC<DecoderSimilarityOverlayProps> = ({
  similarFeatures,
  rowCount,
  rowHeight,
  mainFeatureId,
  onBadgeInteraction,
  onBadgeLeave
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(100)
  const [containerHeight, setContainerHeight] = useState(rowCount * rowHeight)

  // Hover state for connection highlighting
  const [hoveredConnection, setHoveredConnection] = useState<number | null>(null)
  const [hoveredElement, setHoveredElement] = useState<'line' | 'circle-main' | 'circle-similar' | null>(null)

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

  // Local hover state handlers (for visual feedback only)
  const handleConnectionHoverEnter = (idx: number, element: 'line' | 'circle-main' | 'circle-similar') => {
    setHoveredConnection(idx)
    setHoveredElement(element)
  }

  const handleConnectionHoverLeave = () => {
    setHoveredConnection(null)
    setHoveredElement(null)
  }

  // Add padding to SVG height to accommodate badges below bottom circles
  // Bottom badge: radius (~5-8px) + offset (2px) + badge height (12px) = ~20px buffer
  const svgHeight = containerHeight + 20

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <svg
        className="decoder-similarity-overlay"
        width={containerWidth}
        height={svgHeight}
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
          const isHovered = hoveredConnection === idx
          const patternType = similar.inter_feature_similarity?.pattern_type || 'None'
          const midY = (mainRowCenterY + circleY) / 2  // Badge position at line center

          return (
            <g key={`connection-${similar.feature_id}`}>
              {/* Line with hover state */}
              <line
                className={isHovered ? 'decoder-connection--highlighted' : ''}
                x1={x}
                y1={mainRowCenterY}
                x2={x}
                y2={circleY}
                stroke={isHovered ? '#3b82f6' : '#9ca3af'}
                strokeWidth={isHovered ? '2.5' : '1.5'}
                opacity={isHovered ? '1.0' : '0.8'}
                style={{ pointerEvents: onBadgeInteraction && mainFeatureId !== undefined ? 'auto' : 'none', cursor: 'pointer' }}
                onMouseEnter={() => {
                  handleConnectionHoverEnter(idx, 'line')
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)
                  }
                }}
                onMouseLeave={() => {
                  handleConnectionHoverLeave()
                  if (onBadgeLeave) {
                    onBadgeLeave()
                  }
                }}
                onClick={() => {
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)
                  }
                }}
              />

              {/* Badge at line center */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={midY - 8}
                  width={40}
                  height={16}
                  style={{ pointerEvents: 'auto' }}
                  onMouseEnter={() => handleConnectionHoverEnter(idx, 'line')}
                  onMouseLeave={handleConnectionHoverLeave}
                >
                  <DecoderBadge
                    patternType={patternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
                    isHovered={isHovered && hoveredElement === 'line'}
                    onMouseEnter={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)}
                    onMouseLeave={onBadgeLeave}
                    onClick={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)}
                  />
                </foreignObject>
              )}
            </g>
          )
        })}

        {/* Draw all circles second (so they appear above lines) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1  // Target circles appear in rows 1-4 (0-indexed)
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2  // Center of target row
          const isHovered = hoveredConnection === idx
          const patternType = similar.inter_feature_similarity?.pattern_type || 'None'
          const radius = getCircleRadius(similar.cosine_similarity)

          return (
            <g key={similar.feature_id}>
              {/* Circle in main feature row (row 0) */}
              <circle
                className={isHovered ? 'decoder-circle--highlighted' : ''}
                cx={x}
                cy={mainRowCenterY}
                r={radius}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke={isHovered ? '#3b82f6' : 'none'}
                strokeWidth={isHovered ? '2' : '0'}
                style={{ pointerEvents: onBadgeInteraction && mainFeatureId !== undefined ? 'auto' : 'none', cursor: 'pointer' }}
                onMouseEnter={() => {
                  handleConnectionHoverEnter(idx, 'circle-main')
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)
                  }
                }}
                onMouseLeave={() => {
                  handleConnectionHoverLeave()
                  if (onBadgeLeave) {
                    onBadgeLeave()
                  }
                }}
                onClick={() => {
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)
                  }
                }}
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>

              {/* Badge above main circle */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={mainRowCenterY - radius - 20}
                  width={40}
                  height={16}
                  style={{ pointerEvents: 'auto' }}
                  onMouseEnter={() => handleConnectionHoverEnter(idx, 'circle-main')}
                  onMouseLeave={handleConnectionHoverLeave}
                >
                  <DecoderBadge
                    patternType={patternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
                    isHovered={isHovered && hoveredElement === 'circle-main'}
                    onMouseEnter={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)}
                    onMouseLeave={onBadgeLeave}
                    onClick={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)}
                  />
                </foreignObject>
              )}

              {/* Circle at target row */}
              <circle
                className={isHovered ? 'decoder-circle--highlighted' : ''}
                cx={x}
                cy={circleY}
                r={radius}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke={isHovered ? '#3b82f6' : 'none'}
                strokeWidth={isHovered ? '2' : '0'}
                style={{ pointerEvents: onBadgeInteraction && mainFeatureId !== undefined ? 'auto' : 'none', cursor: 'pointer' }}
                onMouseEnter={() => {
                  handleConnectionHoverEnter(idx, 'circle-similar')
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)
                  }
                }}
                onMouseLeave={() => {
                  handleConnectionHoverLeave()
                  if (onBadgeLeave) {
                    onBadgeLeave()
                  }
                }}
                onClick={() => {
                  if (onBadgeInteraction && mainFeatureId !== undefined) {
                    onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)
                  }
                }}
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>

              {/* Badge below similar circle */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={circleY + radius + 2}
                  width={40}
                  height={12}
                  style={{ pointerEvents: 'auto' }}
                  onMouseEnter={() => handleConnectionHoverEnter(idx, 'circle-similar')}
                  onMouseLeave={handleConnectionHoverLeave}
                >
                  <DecoderBadge
                    patternType={patternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
                    isHovered={isHovered && hoveredElement === 'circle-similar'}
                    onMouseEnter={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)}
                    onMouseLeave={onBadgeLeave}
                    onClick={() => onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)}
                  />
                </foreignObject>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default DecoderSimilarityOverlay
