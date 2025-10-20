import React from 'react'
import type { HighlightSegment } from '../types'

interface HighlightedExplanationProps {
  segments: HighlightSegment[]
  explainerNames?: string[]  // e.g., ['Llama', 'Qwen', 'OpenAI']
}

/**
 * Renders explanation text with syntax highlighting showing alignment across LLM explainers.
 *
 * Highlighting styles:
 * - Exact matches: Green color (from segment.color)
 * - Semantic matches: Bold font weight
 * - Both exact and semantic: Green color + bold
 *
 * Hover tooltips show:
 * - Match type (Exact/Semantic/Both)
 * - Similarity score (for semantic matches)
 * - N-gram length (for exact matches)
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

    const {
      match_type,
      similarity,
      ngram_length,
      shared_with,
      also_exact,
      exact_ngram_length,
      also_semantic,  // Legacy
      semantic_similarity  // Legacy
    } = segment.metadata
    const lines: string[] = []

    // Match type (handle both new and legacy structures)
    const hasBothTypes = also_exact || also_semantic
    if (hasBothTypes) {
      lines.push('Match Type: Semantic + Exact')
    } else {
      lines.push(`Match Type: ${match_type === 'exact' ? 'Exact' : 'Semantic'}`)
    }

    // Similarity/N-gram info
    if (match_type === 'semantic' && similarity !== undefined) {
      lines.push(`Similarity: ${similarity.toFixed(3)}`)
    }
    if (match_type === 'exact' && ngram_length !== undefined) {
      lines.push(`N-gram Length: ${ngram_length}`)
    }

    // Additional info for segments with both types
    if (also_exact && exact_ngram_length !== undefined) {
      lines.push(`Exact N-gram Length: ${exact_ngram_length}`)
    }
    if (also_semantic && semantic_similarity !== undefined) {
      lines.push(`Semantic Similarity: ${semantic_similarity.toFixed(3)}`)
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

    // Apply color for exact matches
    if (segment.color) {
      style.color = segment.color
    }

    // Apply bold for semantic matches
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

    // Handle both new and legacy structures
    const hasBothTypes = segment.metadata?.also_exact || segment.metadata?.also_semantic

    if (segment.metadata?.match_type === 'exact') {
      classes.push('highlighted-segment--exact')
    }
    if (segment.metadata?.match_type === 'semantic' || segment.metadata?.also_semantic) {
      classes.push('highlighted-segment--semantic')
    }
    // Add exact class if segment has both types (new structure: semantic + also_exact)
    if (segment.metadata?.also_exact) {
      classes.push('highlighted-segment--exact')
    }
    if (hasBothTypes) {
      classes.push('highlighted-segment--both')
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
