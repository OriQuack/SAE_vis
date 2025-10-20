import React from 'react'
import type { HighlightSegment } from '../types'

interface HighlightedExplanationProps {
  segments: HighlightSegment[]
  explainerNames?: string[]  // e.g., ['Llama', 'Qwen', 'OpenAI']
}

/**
 * Renders explanation text with background highlighting showing alignment across LLM explainers.
 *
 * Highlighting styles (semantic similarity based):
 * - similarity >= 0.9: Dark green background (full opacity) + white text + bold (Strong Match)
 * - similarity >= 0.8: Dark green background (0.75 opacity) + white text + bold (Medium Match)
 * - similarity >= 0.7: Dark green background (0.5 opacity) + white text + bold (Weak Match)
 * - similarity < 0.7: Plain text (no highlight)
 *
 * Hover tooltips show:
 * - Match strength label (Strong/Medium/Weak)
 * - Similarity score
 * - Explainer names that share this match
 */
export const HighlightedExplanation: React.FC<HighlightedExplanationProps> = React.memo(({
  segments,
  explainerNames = ['Llama', 'Qwen', 'OpenAI']
}) => {
  if (!segments || segments.length === 0) {
    return <span>-</span>
  }

  /**
   * Generate tooltip text for highlighted segment
   */
  const getTooltipText = (segment: HighlightSegment): string => {
    if (!segment.highlight || !segment.metadata) {
      return ''
    }

    const { similarity, shared_with } = segment.metadata
    const lines: string[] = []

    // Match strength label based on similarity
    if (similarity !== undefined) {
      let strength = 'Weak Match'
      if (similarity >= 0.9) {
        strength = 'Strong Match'
      } else if (similarity >= 0.8) {
        strength = 'Medium Match'
      }
      lines.push(strength)

      // Similarity score
      lines.push(`Similarity: ${similarity.toFixed(3)}`)
    }

    // Shared explainers
    if (shared_with && shared_with.length > 0) {
      const explainers = shared_with
        .map(idx => explainerNames[idx] || `Explainer ${idx}`)
        .join(', ')
      lines.push(`Shared by: ${explainers}`)
    }

    return lines.join('\n')
  }

  /**
   * Get inline styles for highlighted segment
   */
  const getSegmentStyle = (segment: HighlightSegment): React.CSSProperties => {
    if (!segment.highlight) {
      return {}
    }

    const style: React.CSSProperties = {}

    // Calculate dark green background with opacity based on similarity
    const similarity = segment.metadata?.similarity
    if (similarity !== undefined) {
      let opacity = 0.7  // Default for similarity >= 0.7 (Weak)
      if (similarity >= 0.9) {
        opacity = 1.0  // Strong match - full opacity
      } else if (similarity >= 0.8) {
        opacity = 0.85  // Medium match
      }

      // Apply dark green background (#16a34a - green-600) with calculated opacity
      style.backgroundColor = `rgba(22, 163, 74, ${opacity})`

      // White text for better visibility on dark green background
      style.color = 'white'

      // Add subtle padding for highlighter effect
      style.padding = '1px 2px'
      style.borderRadius = '2px'
    }

    // Always apply bold for highlighted segments
    if (segment.style === 'bold') {
      style.fontWeight = 'bold'
    }

    return style
  }

  /**
   * Get CSS class for highlighted segment
   */
  const getSegmentClass = (segment: HighlightSegment): string => {
    if (!segment.highlight) {
      return ''
    }

    const classes: string[] = []

    // Add strength-based class based on similarity
    const similarity = segment.metadata?.similarity
    if (similarity !== undefined) {
      if (similarity >= 0.9) {
        classes.push('highlighted-segment--strong')
      } else if (similarity >= 0.8) {
        classes.push('highlighted-segment--medium')
      } else if (similarity >= 0.7) {
        classes.push('highlighted-segment--weak')
      }
    }

    return classes.join(' ')
  }

  /**
   * Check if we need to add a space after this segment
   */
  const needsSpaceAfter = (segment: HighlightSegment, index: number): boolean => {
    // Don't add space after last segment
    if (index === segments.length - 1) {
      return false
    }

    const text = segment.text
    // Don't add space if segment already ends with whitespace
    if (text.match(/\s$/)) {
      return false
    }

    const nextSegment = segments[index + 1]
    // Don't add space if next segment starts with whitespace
    if (nextSegment && nextSegment.text.match(/^\s/)) {
      return false
    }

    // Don't add space if next segment is punctuation that should attach directly
    // (like closing brackets, periods, commas, etc.)
    if (nextSegment && nextSegment.text.match(/^[,;.!?:)\]}>]/)) {
      return false
    }

    return true
  }

  return (
    <span className="highlighted-explanation">
      {segments.map((segment, index) => {
        const addSpace = needsSpaceAfter(segment, index)

        if (!segment.highlight) {
          // Plain text segment
          return (
            <React.Fragment key={index}>
              <span>{segment.text}</span>
              {addSpace && ' '}
            </React.Fragment>
          )
        }

        // Highlighted segment with tooltip
        const tooltipText = getTooltipText(segment)
        const style = getSegmentStyle(segment)
        const className = getSegmentClass(segment)

        return (
          <React.Fragment key={index}>
            <span
              className={className}
              style={style}
              title={tooltipText}
            >
              {segment.text}
            </span>
            {addSpace && ' '}
          </React.Fragment>
        )
      })}
    </span>
  )
})

HighlightedExplanation.displayName = 'HighlightedExplanation'
