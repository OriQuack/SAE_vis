import React from 'react'

/**
 * DecoderBadge - Compact badge component for SVG context
 *
 * Displays pattern type badges (Lexical, Semantic, Both, None) within SVG visualizations.
 * Reuses existing badge styles from DecoderSimilarityTable with compact sizing.
 */

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
  // Only add interactive props if handlers are provided
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
          Lexical
        </span>
        <span className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}`}>
          Semantic
        </span>
      </div>
    )
  } else if (patternType === 'Lexical') {
    return (
      <span
        className={`decoder-stage-table__badge decoder-stage-table__badge--lexical decoder-stage-table__badge--compact${hoverClass}`}
        {...interactiveProps}
      >
        Lexical
      </span>
    )
  } else if (patternType === 'Semantic') {
    return (
      <span
        className={`decoder-stage-table__badge decoder-stage-table__badge--semantic decoder-stage-table__badge--compact${hoverClass}`}
        {...interactiveProps}
      >
        Semantic
      </span>
    )
  } else {
    // Don't render "None" badges in compact mode
    return null
  }
}

export default DecoderBadge
