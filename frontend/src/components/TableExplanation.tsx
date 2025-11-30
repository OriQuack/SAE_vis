import React from 'react'
import type { HighlightSegment } from '../types'
import { getSemanticSimilarityColor } from '../lib/color-utils'

interface HighlightedExplanationProps {
  segments: HighlightSegment[]
  explainerNames?: string[]  // e.g., ['Llama', 'Qwen', 'OpenAI']
  // Truncation props
  truncated?: boolean  // Enable truncation mode (default: false) - shows all highlighted segments ordered by similarity
}

/**
 * Renders explanation text with background highlighting showing alignment across LLM explainers.
 *
 * Highlighting styles (semantic similarity based - colors from color-utils.tsx):
 * - similarity >= 0.85: Dark teal green background (Higher Match)
 * - similarity >= 0.70: Medium green background (Medium Match)
 * - similarity >= 0.50: Light mint green background (Lower Match)
 * - similarity < 0.50: Plain text (no highlight)
 *
 * Truncation mode (truncated=true):
 * - Shows all highlighted segments ordered by similarity (highest to lowest)
 * - No ellipsis, single space between segments
 * - CSS handles natural cutoff at row boundary
 *
 * Hover tooltips show:
 * - Match strength label (Higher/Lower)
 * - Similarity score
 * - Explainer names that share this match
 */
export const HighlightedExplanation: React.FC<HighlightedExplanationProps> = React.memo(({
  segments,
  explainerNames = ['Llama', 'Qwen', 'OpenAI'],
  truncated = false
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
      let strength = 'Lower Match'
      if (similarity >= 0.85) {
        strength = 'Higher Match'
      } else if (similarity >= 0.7) {
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

    // Get background color from centralized color utility
    const similarity = segment.metadata?.similarity
    if (similarity !== undefined && similarity >= 0.5) {
      style.backgroundColor = getSemanticSimilarityColor(similarity)

      // Black text for readability on green backgrounds
      style.color = 'black'

      // Padding to match activation token style (horizontal only)
      style.padding = '1px 2px'
      style.borderRadius = '2px'

      // Reserve space for border to match activation token height
      style.border = '2px solid transparent'

      // Ensure inline display for proper text flow
      style.display = 'inline'

      // Match activation example font-size and line-height exactly
      style.fontSize = '11px'
      style.lineHeight = '1.4'
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
      if (similarity >= 0.85) {
        classes.push('highlighted-segment--higher')
      } else if (similarity >= 0.7) {
        classes.push('highlighted-segment--medium')
      } else if (similarity >= 0.5) {
        classes.push('highlighted-segment--lower')
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

  // Render a single segment with all features (used by both truncated and full views)
  const renderSegment = (segment: HighlightSegment, index: number, addSpaceAfter: boolean = true) => {
    if (!segment.highlight) {
      // Plain text segment
      return (
        <React.Fragment key={index}>
          <span>{segment.text}</span>
          {addSpaceAfter && needsSpaceAfter(segment, index) && ' '}
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
        {addSpaceAfter && needsSpaceAfter(segment, index) && ' '}
      </React.Fragment>
    )
  }

  // Render truncated view (all segments ordered by similarity)
  if (truncated) {
    // Get highlighted segments with similarity scores and sort by similarity (descending)
    const topSegmentsByScore = segments
      .map((seg, idx) => ({ seg, idx }))
      .filter(({ seg }) => seg.highlight && seg.metadata?.similarity)
      .sort((a, b) => (b.seg.metadata?.similarity || 0) - (a.seg.metadata?.similarity || 0))

    // If no highlighted segments, show plain text with ellipsis truncation
    if (topSegmentsByScore.length === 0) {
      const plainText = segments.map(s => s.text).join('')
      return <span className="highlighted-explanation highlighted-explanation--plain-truncated">{plainText}</span>
    }

    // Render all segments in similarity order with single space between
    return (
      <span className="highlighted-explanation">
        {topSegmentsByScore.map(({ seg, idx }, arrIdx) => (
          <React.Fragment key={idx}>
            {arrIdx > 0 && ' '}
            {renderSegment(seg, idx, false)}
          </React.Fragment>
        ))}
      </span>
    )
  }

  // Render full view (all segments)
  // Note: Backend provides complete text with all original spacing preserved in segments.
  // We pass addSpaceAfter=false to avoid adding extra spaces since spacing is already included.
  return (
    <span className="highlighted-explanation">
      {segments.map((segment, index) => renderSegment(segment, index, false))}
    </span>
  )
})

HighlightedExplanation.displayName = 'HighlightedExplanation'
