import React, { useRef, useState, useEffect, useMemo } from 'react'
import { getCircleRadius } from '../lib/circle-encoding-utils'
import { getMetricColor } from '../lib/utils'
import { useVisualizationStore } from '../store/index'
import { buildActivationTokens, getActivationColor } from '../lib/activation-utils'
import type { ActivationExamples, QuantileExample } from '../types'

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
  pattern_type?: 'Lexical' | 'Semantic' | 'Both' | 'None'  // Individual feature's own pattern type (for circles)
  inter_feature_similarity?: any  // Inter-feature similarity data with pattern_type (for lines)
}

interface DecoderSimilarityOverlayProps {
  similarFeatures: SimilarFeature[]
  rowCount: number
  rowHeight: number
  mainFeatureId?: number  // Main/pivot feature ID for interaction tracking
  onBadgeInteraction?: (mainFeatureId: number, similarFeatureId: number, interfeatureData: any, isClick: boolean) => void
  onBadgeLeave?: () => void
  activationColumnWidth?: number  // Width of activation column for popover sizing
  interFeatureHighlights?: Map<string, any>  // Map of clicked pairs from parent (for persisting selection state)
}

// ========== Activation Example Helpers (copied from ActivationExample.tsx) ==========

/**
 * Determine which n-gram type to use for underlining based on Jaccard scores
 */
const getNgramUnderlineType = (examples: ActivationExamples): { type: 'char' | 'word' | null, jaccard: number } => {
  const patternType = examples.pattern_type.toLowerCase()
  if (patternType === 'none' || patternType === 'semantic') {
    return { type: null, jaccard: 0 }
  }

  const charJaccard = examples.char_ngram_max_jaccard || 0
  const wordJaccard = examples.word_ngram_max_jaccard || 0

  if (charJaccard === 0 && wordJaccard === 0) return { type: null, jaccard: 0 }

  if (charJaccard >= wordJaccard) {
    return { type: 'char', jaccard: charJaccard }
  } else {
    return { type: 'word', jaccard: wordJaccard }
  }
}

/**
 * Get the CSS class for n-gram confidence level based on Jaccard score
 */
const getNgramConfidenceClass = (jaccard: number): string => {
  if (jaccard < 0.4) return 'activation-token--ngram-low'
  if (jaccard < 0.7) return 'activation-token--ngram-medium'
  return 'activation-token--ngram-high'
}

/**
 * Check if a token should be underlined based on n-gram positions
 */
const shouldUnderlineToken = (
  tokenPosition: number,
  example: QuantileExample,
  underlineType: 'char' | 'word' | null
): boolean => {
  if (!underlineType) return false

  if (underlineType === 'char') {
    return example.char_ngram_positions?.some(pos => pos.token_position === tokenPosition) || false
  } else {
    return example.word_ngram_positions?.includes(tokenPosition) || false
  }
}

/**
 * Helper function to generate appropriate whitespace symbol
 */
const getWhitespaceSymbol = (text: string): string => {
  const newlineCount = (text.match(/\n/g) || []).length
  const tabCount = (text.match(/\t/g) || []).length
  const crCount = (text.match(/\r/g) || []).length

  if (tabCount > 0) {
    return '→'.repeat(tabCount)
  } else if (crCount > 0 && newlineCount === 0) {
    return '⏎'.repeat(crCount)
  } else if (newlineCount > 0) {
    return '↵'.repeat(newlineCount)
  }
  return '·'
}

// ========== End Activation Example Helpers ==========

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
  similarFeatures,
  rowCount,
  rowHeight,
  mainFeatureId,
  onBadgeInteraction,
  onBadgeLeave,
  activationColumnWidth,
  interFeatureHighlights
}) => {
  const toggleFeatureSelection = useVisualizationStore(state => state.toggleFeatureSelection)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const activationExamples = useVisualizationStore(state => state.activationExamples)
  const fetchActivationExamples = useVisualizationStore(state => state.fetchActivationExamples)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(100)
  const [containerHeight, setContainerHeight] = useState(rowCount * rowHeight)

  // Hover state for connection highlighting
  const [hoveredConnection, setHoveredConnection] = useState<number | null>(null)
  const [_hoveredElement, setHoveredElement] = useState<'line' | 'circle-main' | 'circle-similar' | 'badge' | null>(null)

  // Filter out main feature (we only draw connections for similar features)
  const similarOnly = similarFeatures.filter(f => !f.is_main)

  // Derive selected connections from parent's interFeatureHighlights Map (persists across remounts)
  const selectedConnections = useMemo(() => {
    const selected = new Set<number>()
    if (interFeatureHighlights && mainFeatureId !== undefined) {
      similarOnly.forEach((similar, idx) => {
        const key = `${mainFeatureId}-${similar.feature_id}`
        if (interFeatureHighlights.has(key)) {
          selected.add(idx)
        }
      })
    }
    return selected
  }, [interFeatureHighlights, mainFeatureId, similarOnly])

  // Activation popover state
  const [hoveredPairForActivation, setHoveredPairForActivation] = useState<number | null>(null)
  const [showActivationPopover, setShowActivationPopover] = useState<boolean>(false)

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

  // Extract main feature for its pattern type (used for main circle badges)
  const mainFeature = similarFeatures.find(f => f.is_main)
  const mainFeaturePatternType = mainFeature?.pattern_type || 'None'

  // Calculate number of circles
  const numCircles = similarOnly.length

  // Calculate X positions in pixels based on measured container width
  // Use compact spacing - maximum 400px or 60% of container width
  const maxTotalWidth = Math.min(400, containerWidth * 0.75)
  const availableWidth = numCircles > 1 ? maxTotalWidth : 0
  const spacing = numCircles > 1 ? availableWidth / (numCircles - 1) : 0
  const startX = (containerWidth - availableWidth) / 2  // Center the circle group
  const xPositions = similarOnly.map((_, idx) => startX + (idx * spacing))

  // Calculate Y positions based on actual container height
  // Distribute evenly across the measured height
  const rowHeightActual = containerHeight / rowCount
  const mainRowCenterY = rowHeightActual / 2  // Center of first row (main feature)

  // Local hover state handlers (for visual feedback)
  const handleConnectionHoverEnter = (idx: number, element: 'line' | 'circle-main' | 'circle-similar' | 'badge') => {
    setHoveredConnection(idx)
    setHoveredElement(element)
  }

  const handleConnectionHoverLeave = () => {
    setHoveredConnection(null)
    setHoveredElement(null)
  }

  // Click handler for persistent selection
  const handleConnectionClick = (idx: number) => {
    const similar = similarOnly[idx]
    const isCurrentlySelected = selectedConnections.has(idx)

    if (isCurrentlySelected) {
      // Deselecting - always uncheck similar feature
      if (selectedFeatureIds.has(similar.feature_id)) {
        toggleFeatureSelection(similar.feature_id)
      }

      // Only uncheck main feature if no other pairs remain selected
      const otherSelectedPairs = Array.from(selectedConnections).filter(i => i !== idx)
      if (otherSelectedPairs.length === 0 && mainFeatureId !== undefined && selectedFeatureIds.has(mainFeatureId)) {
        toggleFeatureSelection(mainFeatureId)
      }

      // Remove sticky inter-feature highlighting (parent updates Map, which triggers re-render)
      if (onBadgeInteraction && mainFeatureId !== undefined) {
        onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)
      }
    } else {
      // Selecting - only check if not already checked
      if (mainFeatureId !== undefined && !selectedFeatureIds.has(mainFeatureId)) {
        toggleFeatureSelection(mainFeatureId)
      }
      if (!selectedFeatureIds.has(similar.feature_id)) {
        toggleFeatureSelection(similar.feature_id)
      }

      // Add sticky inter-feature highlighting (parent updates Map, which triggers re-render)
      if (onBadgeInteraction && mainFeatureId !== undefined) {
        onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, true)
      }
    }
  }

  // Helper function to render quantile example tokens
  const renderQuantileExample = (
    examples: ActivationExamples,
    quantileIndex: number,
    interFeaturePositions?: {
      type: 'char' | 'word',
      positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}>
    }
  ) => {
    // Get the n-gram underline info
    const ngramInfo = getNgramUnderlineType(examples)
    const underlineType = ngramInfo.type
    const ngramJaccard = ngramInfo.jaccard

    // Find example for this quantile
    const example = examples.quantile_examples.find(ex => ex.quantile_index === quantileIndex)
    if (!example) return null

    // Build tokens from 32-token window
    const tokens = buildActivationTokens(example, 32)

    // Helper to check if token matches inter-feature position (same logic as ActivationExample)
    const hasInterFeatureMatch = (tokenPosition: number): boolean => {
      if (!interFeaturePositions) return false

      // Find positions for this specific prompt_id
      const promptPositions = interFeaturePositions.positions.find(
        p => p.prompt_id === example.prompt_id
      )

      if (!promptPositions) return false

      if (interFeaturePositions.type === 'char') {
        // For char type, positions is Array<{token_position, char_offset}>
        return (promptPositions.positions as Array<{token_position: number, char_offset?: number}>)
          .some(pos => pos.token_position === tokenPosition)
      } else {
        // For word type, positions is number[]
        return (promptPositions.positions as number[]).includes(tokenPosition)
      }
    }

    return (
      <div key={quantileIndex} className="decoder-activation-popover__quantile-row">
        {tokens.map((token, tokenIdx) => {
          const hasUnderline = shouldUnderlineToken(token.position, example, underlineType)
          const ngramClass = hasUnderline ? getNgramConfidenceClass(ngramJaccard) : ''
          const hasInterFeature = hasInterFeatureMatch(token.position)

          // Build title with activation and n-gram info
          let title = token.activation_value?.toFixed(3) || 'No activation'
          if (hasUnderline) {
            const ngramText = underlineType === 'char'
              ? examples.top_char_ngram_text
              : examples.top_word_ngram_text
            title += `\nN-gram pattern: "${ngramText}" (Jaccard: ${ngramJaccard.toFixed(3)})`
          }
          if (hasInterFeature) {
            title += `\n✓ Inter-feature match`
          }

          return (
            <span
              key={tokenIdx}
              className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${ngramClass} ${hasInterFeature ? 'activation-token--interfeature' : ''}`}
              style={{
                backgroundColor: token.activation_value
                  ? getActivationColor(token.activation_value, example.max_activation)
                  : 'transparent'
              }}
              title={title}
            >
              {token.is_newline ? (
                <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
              ) : (
                token.text
              )}
            </span>
          )
        })}
      </div>
    )
  }

  // Add padding to SVG height to accommodate badges below bottom circles
  // Bottom badge: radius (~5-8px) + offset (4px) + badge height (30px) = ~42px buffer
  const svgHeight = containerHeight + 42

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
        {/* Draw background rectangles first (largest hit targets, behind everything) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2
          const isHovered = hoveredConnection === idx
          const isSelected = selectedConnections.has(idx)
          const isHighlighted = isHovered || isSelected

          // Background rectangle dimensions
          const bgWidth = 35
          const bgHeight = circleY - mainRowCenterY
          const bgX = x - bgWidth / 2
          const bgY = mainRowCenterY

          return (
            <rect
              key={`bg-${similar.feature_id}`}
              x={bgX}
              y={bgY}
              width={bgWidth}
              height={bgHeight}
              rx={4}
              ry={4}
              fill={
                isHighlighted
                  ? 'rgba(16, 185, 129, 0.08)'  // Light green (matches inter-feature highlighting)
                  : 'rgba(156, 163, 175, 0.05)'  // Minimal gray
              }
              stroke={
                isHighlighted
                  ? '#10b981'  // Green (matches inter-feature highlighting)
                  : 'transparent'
              }
              strokeWidth={isHighlighted ? 2 : 0}
              style={{
                pointerEvents: onBadgeInteraction && mainFeatureId !== undefined ? 'auto' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={() => {
                handleConnectionHoverEnter(idx, 'badge')
                if (onBadgeInteraction && mainFeatureId !== undefined) {
                  onBadgeInteraction(mainFeatureId, similar.feature_id, similar.inter_feature_similarity, false)
                }
                // Activation popover logic
                if (mainFeatureId !== undefined) {
                  setHoveredPairForActivation(idx)
                  // Fetch activation examples if not cached
                  const featuresToFetch = []
                  if (!activationExamples[mainFeatureId]) featuresToFetch.push(mainFeatureId)
                  if (!activationExamples[similar.feature_id]) featuresToFetch.push(similar.feature_id)
                  if (featuresToFetch.length > 0) {
                    fetchActivationExamples(featuresToFetch)
                  }
                  // Show popover immediately
                  setShowActivationPopover(true)
                }
              }}
              onMouseLeave={() => {
                handleConnectionHoverLeave()
                if (onBadgeLeave) {
                  onBadgeLeave()
                }
                // Hide activation popover
                setHoveredPairForActivation(null)
                setShowActivationPopover(false)
              }}
              onClick={() => {
                handleConnectionClick(idx)
              }}
            />
          )
        })}

        {/* Draw all lines (appear above background, behind circles) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1  // Target circles appear in rows 1-4 (0-indexed)
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2  // Center of target row
          const isHovered = hoveredConnection === idx
          const isSelected = selectedConnections.has(idx)
          const isHighlighted = isHovered || isSelected  // Highlighted if hovered OR selected
          const relationshipPatternType = similar.inter_feature_similarity?.pattern_type || 'None'  // Relationship pattern (for line)
          const midY = (mainRowCenterY + circleY) / 2  // Badge position at line center

          return (
            <g key={`connection-${similar.feature_id}`}>
              {/* Line - visual only, background handles interaction */}
              <line
                className={isHighlighted ? 'decoder-connection--highlighted' : ''}
                x1={x}
                y1={mainRowCenterY}
                x2={x}
                y2={circleY}
                stroke={isHighlighted
                  ? (relationshipPatternType === 'Semantic' ? '#a855f7' : '#10b981')
                  : '#9ca3af'}
                strokeWidth={isHighlighted ? '2.5' : '1.5'}
                opacity={isHighlighted ? '1.0' : '0.8'}
                style={{ pointerEvents: 'none' }}
              />

              {/* Badge at line center - visual only, background handles interaction */}
              {/* Green for lexical, default (purple) for semantic */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={midY - 10}
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
            </g>
          )
        })}

        {/* Draw all circles second (so they appear above lines) */}
        {similarOnly.map((similar, idx) => {
          const x = xPositions[idx]
          const circleRowIndex = idx + 1  // Target circles appear in rows 1-4 (0-indexed)
          const circleY = circleRowIndex * rowHeightActual + rowHeightActual / 2  // Center of target row
          const isHovered = hoveredConnection === idx
          const isSelected = selectedConnections.has(idx)
          const isHighlighted = isHovered || isSelected  // Highlighted if hovered OR selected
          const similarFeaturePatternType = similar.pattern_type || 'None'  // Similar feature's individual pattern (for circles)
          const radius = getCircleRadius(similar.cosine_similarity)

          return (
            <g key={similar.feature_id}>
              {/* Circle in main feature row - visual only, background handles interaction */}
              <circle
                className={isHighlighted ? 'decoder-circle--highlighted' : ''}
                cx={x}
                cy={mainRowCenterY}
                r={radius}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke={isHighlighted ? '#10b981' : 'none'}
                strokeWidth={isHighlighted ? '2' : '0'}
                style={{ pointerEvents: 'none' }}
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>

              {/* Badge above main circle - visual only, background handles interaction */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={mainRowCenterY - radius - 22}
                  width={40}
                  height={30}
                  style={{ pointerEvents: 'none', overflow: 'visible' }}
                >
                  <DecoderBadge
                    patternType={mainFeaturePatternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
                    isHovered={isHighlighted}
                  />
                </foreignObject>
              )}

              {/* Circle at target row - visual only, background handles interaction */}
              <circle
                className={isHighlighted ? 'decoder-circle--highlighted' : ''}
                cx={x}
                cy={circleY}
                r={radius}
                fill={getMetricColor('decoder_similarity', similar.cosine_similarity, true)}
                opacity={1.0}
                stroke={isHighlighted ? '#10b981' : 'none'}
                strokeWidth={isHighlighted ? '2' : '0'}
                style={{ pointerEvents: 'none' }}
              >
                <title>{`Feature ${similar.feature_id}: ${similar.cosine_similarity.toFixed(3)}`}</title>
              </circle>

              {/* Badge below similar circle - visual only, background handles interaction */}
              {onBadgeInteraction && mainFeatureId !== undefined && (
                <foreignObject
                  x={x - 20}
                  y={circleY + radius + 2}
                  width={40}
                  height={30}
                  style={{ pointerEvents: 'none', overflow: 'visible' }}
                >
                  <DecoderBadge
                    patternType={similarFeaturePatternType as 'Lexical' | 'Semantic' | 'Both' | 'None'}
                    isHovered={isHighlighted}
                  />
                </foreignObject>
              )}
            </g>
          )
        })}
      </svg>

      {/* Activation Popover */}
      {showActivationPopover && hoveredPairForActivation !== null && mainFeatureId !== undefined && (
        (() => {
          const similar = similarOnly[hoveredPairForActivation]
          const mainExamples = activationExamples[mainFeatureId]
          const similarExamples = activationExamples[similar.feature_id]

          // Only show if both features have activation examples loaded
          if (!mainExamples || !similarExamples) return null

          // Extract inter-feature positions for highlighting
          const interfeatureData = similar.inter_feature_similarity
          let mainInterFeaturePositions:
            | { type: 'char' | 'word', positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}> }
            | undefined = undefined
          let similarInterFeaturePositions:
            | { type: 'char' | 'word', positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}> }
            | undefined = undefined

          if (interfeatureData && (interfeatureData.pattern_type === 'Lexical' || interfeatureData.pattern_type === 'Both')) {
            // Determine type based on Jaccard scores (prioritize lexical for "Both")
            const charJaccard = interfeatureData.char_jaccard || 0
            const wordJaccard = interfeatureData.word_jaccard || 0
            const type: 'char' | 'word' = charJaccard >= wordJaccard ? 'char' : 'word'

            // Extract positions (already structured with prompt_id groupings)
            const mainPositions = type === 'char'
              ? interfeatureData.main_char_ngram_positions
              : interfeatureData.main_word_ngram_positions
            const similarPositions = type === 'char'
              ? interfeatureData.similar_char_ngram_positions
              : interfeatureData.similar_word_ngram_positions

            if (mainPositions && similarPositions) {
              mainInterFeaturePositions = { type, positions: mainPositions }
              similarInterFeaturePositions = { type, positions: similarPositions }
            }
          }

          // Always position popover on first row (main feature row)
          const popoverTop = 0

          return (
            <div
              className="decoder-activation-popover"
              style={{
                maxWidth: activationColumnWidth || 800,
                top: popoverTop,
                left: 'calc(100%)'  // Position right after decoder similarity column
              }}
            >
              {/* Main Feature Section */}
              <div className="decoder-activation-popover__feature">
                <div className="decoder-activation-popover__feature-label">
                  Feature {mainFeatureId}
                </div>
                {[0, 1, 2, 3].map(qIndex => renderQuantileExample(mainExamples, qIndex, mainInterFeaturePositions))}
              </div>

              {/* Similar Feature Section */}
              <div className="decoder-activation-popover__feature">
                <div className="decoder-activation-popover__feature-label">
                  Feature {similar.feature_id}
                </div>
                {[0, 1, 2, 3].map(qIndex => renderQuantileExample(similarExamples, qIndex, similarInterFeaturePositions))}
              </div>
            </div>
          )
        })()
      )}
    </div>
  )
}

export default DecoderSimilarityOverlay
