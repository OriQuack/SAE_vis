import React, { useRef, useState, useEffect, useMemo } from 'react'
import { getCircleRadius } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'
import { useVisualizationStore } from '../store/index'

/**
 * DecoderSimilarityOverlay - Horizontal pair visualization
 *
 * Renders a single horizontal pair of features with:
 * - Left circle (main feature)
 * - Horizontal connecting line (relationship)
 * - Right circle (similar feature)
 * - Three badges below for pattern types
 */

interface DecoderSimilarityOverlayProps {
  mainFeature: {
    feature_id: number
    pattern_type: 'Lexical' | 'Semantic' | 'Both' | 'None'
  }
  similarFeature: {
    feature_id: number
    cosine_similarity: number
    pattern_type: 'Lexical' | 'Semantic' | 'Both' | 'None'
    inter_feature_similarity?: any
  }
  mainFeatureId?: number  // Main feature ID for interaction tracking
  onBadgeInteraction?: (mainFeatureId: number, similarFeatureId: number, interfeatureData: any, isClick: boolean) => void
  onBadgeLeave?: () => void
  interFeatureHighlights?: Map<string, any>  // Map of clicked pairs from parent (for persisting selection state)
  onHoverChange?: (isHovered: boolean) => void  // Callback to notify parent when hover state changes
  isRowSelected?: boolean  // Whether the row is selected
}

// Badge component - purely visual, no interaction (background handles all events)
interface DecoderBadgeProps {
  patternType: 'Lexical' | 'Semantic' | 'Both' | 'None'
  isHovered?: boolean
  variant?: 'default' | 'green'  // Green variant for inter-feature badges
}

const DecoderBadge: React.FC<DecoderBadgeProps> = ({ patternType, isHovered = false, variant = 'default' }) => {
  const hoverClass = isHovered ? ' decoder-stage-table__badge--hover' : ''
  const variantClass = variant === 'green' ? ' decoder-stage-table__badge--green' : ''

  if (patternType === 'Both') {
    return (
      <div className="decoder-stage-table__badge-stack decoder-stage-table__badge--compact">
        <span className={`decoder-stage-table__badge decoder-stage-table__badge--lexical decoder-stage-table__badge--compact${hoverClass}${variantClass}`}>
          LEX
        </span>
        <span className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}${variantClass}`}>
          SEM
        </span>
      </div>
    )
  } else if (patternType === 'Lexical') {
    return (
      <span className={`decoder-stage-table__badge decoder-stage-table__badge--lexical decoder-stage-table__badge--compact${hoverClass}${variantClass}`}>
        LEX
      </span>
    )
  } else if (patternType === 'Semantic') {
    return (
      <span className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}${variantClass}`}>
        SEM
      </span>
    )
  } else {
    return null  // Don't render "None" badges
  }
}

const DecoderSimilarityOverlay: React.FC<DecoderSimilarityOverlayProps> = ({
  mainFeature,
  similarFeature,
  mainFeatureId,
  onBadgeInteraction,
  onBadgeLeave,
  interFeatureHighlights,
  onHoverChange,
  isRowSelected
}) => {
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(100)
  const [containerHeight, setContainerHeight] = useState(50)

  // Hover state for connection highlighting
  const [hoveredConnection, setHoveredConnection] = useState<boolean>(false)

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

    measureDimensions()
    const timeoutId = setTimeout(measureDimensions, 100)

    const observer = new ResizeObserver(measureDimensions)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [])

  // Derive selected pair from parent's interFeatureHighlights Map
  const isSelected = useMemo(() => {
    if (!interFeatureHighlights || mainFeatureId === undefined) return false
    const key = `${mainFeatureId}-${similarFeature.feature_id}`
    return interFeatureHighlights.has(key)
  }, [interFeatureHighlights, mainFeatureId, similarFeature.feature_id])

  // Circle positioning for horizontal layout
  const centerY = containerHeight / 2
  const mainCircleX = containerWidth * 0.2  // 20% from left
  const similarCircleX = containerWidth * 0.8  // 80% from left

  // Determine highlight state
  const isHighlighted = hoveredConnection || isSelected || isRowSelected
  // Both circles show the same decoder similarity (the relationship between the pair)
  const mainRadius = getCircleRadius(similarFeature.cosine_similarity)
  const similarRadius = getCircleRadius(similarFeature.cosine_similarity)

  // Get pattern types for badges
  const mainPatternType = mainFeature.pattern_type
  const similarPatternType = similarFeature.pattern_type
  const relationshipPatternType = similarFeature.inter_feature_similarity?.pattern_type || 'None'

  // Handle clicks on the visualization
  const handleClick = () => {
    if (onBadgeInteraction && mainFeatureId !== undefined) {
      onBadgeInteraction(mainFeatureId, similarFeature.feature_id, similarFeature.inter_feature_similarity, true)
    }
  }

  // Handle hover - trigger parent's activation overlay display
  const handleMouseEnter = () => {
    setHoveredConnection(true)
    if (onBadgeInteraction && mainFeatureId !== undefined) {
      onBadgeInteraction(mainFeatureId, similarFeature.feature_id, similarFeature.inter_feature_similarity, false)
    }

    // Fetch activation examples if needed
    if (mainFeatureId !== undefined) {
      const featuresToFetch = []
      if (!activationExamples[mainFeatureId]) featuresToFetch.push(mainFeatureId)
      if (!activationExamples[similarFeature.feature_id]) featuresToFetch.push(similarFeature.feature_id)
      if (featuresToFetch.length > 0) {
        fetchActivationExamples(featuresToFetch)
      }
    }

    // Notify parent to show activation overlays
    onHoverChange?.(true)
  }

  const handleMouseLeave = () => {
    setHoveredConnection(false)
    if (onBadgeLeave) {
      onBadgeLeave()
    }

    // Notify parent to hide activation overlays
    onHoverChange?.(false)
  }

  const svgHeight = containerHeight + 30  // Add padding for badges below

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
        {/* Background hit target rectangle */}
        <rect
          x={0}
          y={0}
          width={containerWidth}
          height={containerHeight}
          fill={isHighlighted ? 'rgba(156, 163, 175, 0.05)' : 'transparent'}
          stroke={isHighlighted ? '#9ca3af' : 'transparent'}
          strokeWidth={isHighlighted ? 1 : 0}
          rx={4}
          style={{
            pointerEvents: onBadgeInteraction && mainFeatureId !== undefined ? 'auto' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />

        {/* Horizontal connecting line */}
        <line
          x1={mainCircleX + mainRadius}
          y1={centerY}
          x2={similarCircleX - similarRadius}
          y2={centerY}
          stroke={isHighlighted ? '#3b82f6' : '#9ca3af'}
          strokeWidth={isHighlighted ? 2.5 : 1.5}
          opacity={isHighlighted ? 1.0 : 0.8}
          style={{ pointerEvents: 'none' }}
        />

        {/* Badge on line */}
        {onBadgeInteraction && mainFeatureId !== undefined && (
          <foreignObject
            x={(mainCircleX + similarCircleX) / 2 - 20}
            y={centerY - 11}
            width={40}
            height={30}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <DecoderBadge
              patternType={relationshipPatternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
              isHovered={isHighlighted}
              variant={relationshipPatternType === 'Semantic' ? 'default' : 'green'}
            />
          </foreignObject>
        )}

        {/* Main feature circle */}
        <circle
          cx={mainCircleX}
          cy={centerY}
          r={mainRadius}
          fill={getMetricColor('decoder_similarity', similarFeature.cosine_similarity, true)}
          opacity={1.0}
          stroke={isHighlighted ? '#3b82f6' : 'none'}
          strokeWidth={isHighlighted ? 2 : 0}
          style={{ pointerEvents: 'none' }}
        >
          <title>{`Feature ${mainFeature.feature_id}: ${similarFeature.cosine_similarity.toFixed(3)}`}</title>
        </circle>

        {/* Badge below main circle */}
        {onBadgeInteraction && mainFeatureId !== undefined && (
          <foreignObject
            x={mainCircleX - 20}
            y={centerY + mainRadius + 2}
            width={40}
            height={30}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <DecoderBadge
              patternType={mainPatternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
              isHovered={isHighlighted}
            />
          </foreignObject>
        )}

        {/* Similar feature circle */}
        <circle
          cx={similarCircleX}
          cy={centerY}
          r={similarRadius}
          fill={getMetricColor('decoder_similarity', similarFeature.cosine_similarity, true)}
          opacity={1.0}
          stroke={isHighlighted ? '#3b82f6' : 'none'}
          strokeWidth={isHighlighted ? 2 : 0}
          style={{ pointerEvents: 'none' }}
        >
          <title>{`Feature ${similarFeature.feature_id}: ${similarFeature.cosine_similarity.toFixed(3)}`}</title>
        </circle>

        {/* Badge below similar circle */}
        {onBadgeInteraction && mainFeatureId !== undefined && (
          <foreignObject
            x={similarCircleX - 20}
            y={centerY + similarRadius + 2}
            width={40}
            height={30}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <DecoderBadge
              patternType={similarPatternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
              isHovered={isHighlighted}
            />
          </foreignObject>
        )}
      </svg>

      {/* Activation overlays are now shown from ActivationExample components when pair is hovered */}
    </div>
  )
}

export default DecoderSimilarityOverlay
