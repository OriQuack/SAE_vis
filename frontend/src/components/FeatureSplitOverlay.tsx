import React, { useRef, useState, useMemo } from 'react'
import { getCircleRadius } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'
import { useVisualizationStore } from '../store/index'

/**
 * DecoderSimilarityOverlay - Simplified single circle visualization
 *
 * Renders a single circle with decoder similarity value below:
 * - Circle size encodes similarity (larger = more similar)
 * - Number below shows exact value (3 decimal places)
 * - Interactive: hover and click support
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

const DecoderSimilarityOverlay: React.FC<DecoderSimilarityOverlayProps> = ({
  mainFeature: _mainFeature,
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

  // Hover state for highlighting
  const [isHovered, setIsHovered] = useState<boolean>(false)

  // Derive selected state from parent's interFeatureHighlights Map
  const isSelected = useMemo(() => {
    if (!interFeatureHighlights || mainFeatureId === undefined) return false
    const key = `${mainFeatureId}-${similarFeature.feature_id}`
    return interFeatureHighlights.has(key)
  }, [interFeatureHighlights, mainFeatureId, similarFeature.feature_id])

  // Determine highlight state
  const isHighlighted = isHovered || isSelected || isRowSelected

  // Calculate circle properties
  const radius = getCircleRadius(similarFeature.cosine_similarity)
  const color = getMetricColor('decoder_similarity', similarFeature.cosine_similarity, true)

  // Handle clicks
  const handleClick = () => {
    if (onBadgeInteraction && mainFeatureId !== undefined) {
      onBadgeInteraction(mainFeatureId, similarFeature.feature_id, similarFeature.inter_feature_similarity, true)
    }
  }

  // Handle hover enter
  const handleMouseEnter = () => {
    setIsHovered(true)
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

  // Handle hover leave
  const handleMouseLeave = () => {
    setIsHovered(false)
    if (onBadgeLeave) {
      onBadgeLeave()
    }

    // Notify parent to hide activation overlays
    onHoverChange?.(false)
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: '4px',
        background: 'transparent'
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Circle */}
      <svg
        width={radius * 2 + 4}
        height={radius * 2 + 4}
        style={{
          display: 'block',
          marginBottom: '4px',
          background: 'transparent'
        }}
      >
        <circle
          cx={radius + 2}
          cy={radius + 2}
          r={radius}
          fill={color}
          stroke={isHighlighted ? '#3b82f6' : 'none'}
          strokeWidth={isHighlighted ? 2 : 0}
          style={{ transition: 'all 0.15s ease' }}
        >
          <title>{`Decoder Similarity: ${similarFeature.cosine_similarity.toFixed(3)}`}</title>
        </circle>
      </svg>

      {/* Number below circle */}
      <div
        style={{
          fontSize: '11px',
          fontFamily: 'monospace',
          color: isHighlighted ? '#3b82f6' : '#6b7280',
          fontWeight: isHighlighted ? 600 : 400,
          transition: 'all 0.15s ease'
        }}
      >
        {similarFeature.cosine_similarity.toFixed(3)}
      </div>
    </div>
  )
}

export default DecoderSimilarityOverlay
