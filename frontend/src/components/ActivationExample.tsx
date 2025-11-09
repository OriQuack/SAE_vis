import React, { useState, useMemo, useRef } from 'react'
import type { ActivationExamples, QuantileExample } from '../types'
import {
  buildActivationTokens,
  getActivationColor,
  formatTokensWithEllipsis
} from '../lib/activation-utils'
import '../styles/ActivationExample.css'

interface ActivationExampleProps {
  examples: ActivationExamples
  containerWidth: number  // Width of container passed from parent (eliminates measurement shift)
  // Inter-feature pattern highlighting (optional, from decoder similarity table)
  interFeaturePositions?: {
    type: 'char' | 'word'
    positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}>
  }
  // Hover coordination for paired activation examples
  isHovered?: boolean  // Whether this pair is currently hovered (from parent)
  onHoverChange?: (isHovered: boolean) => void  // Callback when hover state changes
}

/**
 * Determine which n-gram type to use for underlining based on Jaccard scores
 * Only underline for Lexical or Both pattern types (not None or Semantic)
 * Returns both the type and the Jaccard score for confidence encoding
 */
const getNgramUnderlineType = (examples: ActivationExamples): { type: 'char' | 'word' | null, jaccard: number } => {
  // Only show underlines for Lexical or Both patterns
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
 * Low: 0.0-0.4 (dotted border)
 * Medium: 0.4-0.7 (solid border)
 * High: 0.7-1.0 (solid border + glow)
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
 * Check if a token should be highlighted based on inter-feature positions
 * Similar to shouldUnderlineToken but checks against inter-feature position data
 */
const shouldHighlightInterfeature = (
  tokenPosition: number,
  example: QuantileExample,
  interFeaturePositions?: {
    type: 'char' | 'word'
    positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}>
  }
): boolean => {
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

// Helper function to generate appropriate whitespace symbol
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
  return '·' // Generic whitespace indicator
}

const ActivationExample: React.FC<ActivationExampleProps> = ({
  examples,
  containerWidth,
  interFeaturePositions,
  isHovered,
  onHoverChange
}) => {
  const [showPopover, setShowPopover] = useState<boolean>(false)
  const [popoverPosition, setPopoverPosition] = useState<'above' | 'below'>('below')
  const containerRef = useRef<HTMLDivElement>(null)

  // Show popover if either locally hovered or parent says this pair is hovered
  const effectiveShowPopover = showPopover || (isHovered ?? false)

  // Detect popover position (above/below) based on available space
  const detectPopoverPosition = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Estimated popover height ~200px
    const spaceBelow = window.innerHeight - rect.bottom
    const position = spaceBelow < 200 ? 'above' : 'below'
    setPopoverPosition(position)
  }

  // Calculate max characters based on container width passed from parent
  // Assume ~7px per character at 11px monospace font
  // No ResizeObserver needed - parent measures once and passes width down
  const maxLength = useMemo(() => Math.floor(containerWidth / 7), [containerWidth])

  // Determine which n-gram type to underline (char vs word) and get Jaccard score
  const ngramInfo = useMemo(() => getNgramUnderlineType(examples), [examples])
  const underlineType = ngramInfo.type
  const ngramJaccard = ngramInfo.jaccard

  // Group examples by quantile_index (memoized for performance)
  // Prioritize examples with positions for the winning type
  const quantileGroups = useMemo(() => {
    return [0, 1, 2, 3].map(qIndex => {
      const filtered = examples.quantile_examples.filter(ex => ex.quantile_index === qIndex)
      // Sort to put examples with winning type positions first
      const sorted = [...filtered].sort((a, b) => {
        const aHasPositions = (underlineType === 'char' && a.char_ngram_positions?.length > 0) ||
                             (underlineType === 'word' && a.word_ngram_positions?.length > 0)
        const bHasPositions = (underlineType === 'char' && b.char_ngram_positions?.length > 0) ||
                             (underlineType === 'word' && b.word_ngram_positions?.length > 0)
        return bHasPositions === aHasPositions ? 0 : (bHasPositions ? 1 : -1)
      })
      return sorted.slice(0, 2)
    })
  }, [examples.quantile_examples, underlineType])

  return (
    <div
      ref={containerRef}
      className="activation-example"
      onMouseEnter={() => {
        detectPopoverPosition()
        setShowPopover(true)
        onHoverChange?.(true)
      }}
      onMouseLeave={() => {
        setShowPopover(false)
        onHoverChange?.(false)
      }}
    >
      {/* Default view: 3 quantiles (0, 1, 2), character-based truncation */}
      {[0, 1, 2].map(qIndex => {
        // Use the first example from sorted quantileGroups (prioritizes examples with positions)
        const example = quantileGroups[qIndex]?.[0]
        if (!example) return null

        // Build tokens from 32-token window
        const tokens = buildActivationTokens(example, 32)
        // Truncate based on available width (symmetric around max token)
        const { displayTokens, hasLeftEllipsis, hasRightEllipsis } = formatTokensWithEllipsis(tokens, maxLength)

        return (
          <div
            key={qIndex}
            className="activation-example__quantile"
          >
            {hasLeftEllipsis && <span className="activation-example__ellipsis">...</span>}
            {displayTokens.map((token, tokenIdx) => {
              const hasUnderline = shouldUnderlineToken(token.position, example, underlineType)
              const hasInterfeatureHighlight = shouldHighlightInterfeature(token.position, example, interFeaturePositions)

              // Get confidence-based CSS class for n-gram underline
              const ngramClass = hasUnderline ? getNgramConfidenceClass(ngramJaccard) : ''

              return (
                <span
                  key={tokenIdx}
                  className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${ngramClass} ${hasInterfeatureHighlight ? 'activation-token--interfeature' : ''}`}
                  style={{
                    backgroundColor: token.activation_value
                      ? getActivationColor(token.activation_value, example.max_activation)
                      : 'transparent'
                  }}
                >
                  {token.is_newline ? (
                    <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
                  ) : (
                    token.text
                  )}
                </span>
              )
            })}
            {hasRightEllipsis && <span className="activation-example__ellipsis">...</span>}
          </div>
        )
      })}

      {/* Hover popover: All 8 examples (2 per quantile) - shows when this row is hovered */}
      {effectiveShowPopover && (
        <div className={`activation-example__popover activation-example__popover--${popoverPosition}`}>
          <div className="activation-example__popover-content">
            {quantileGroups.map((group, qIdx) => (
              <div key={qIdx} className="activation-example__popover-quantile-group">
                {group.map((example, exIdx) => {
                  // Show full 32-token window without truncation
                  const tokens = buildActivationTokens(example, 32)

                  return (
                    <div key={exIdx} className="activation-example__popover-row">
                      {tokens.map((token, tokenIdx) => {
                        const hasUnderline = shouldUnderlineToken(token.position, example, underlineType)
                        const hasInterfeatureHighlight = shouldHighlightInterfeature(token.position, example, interFeaturePositions)

                        // Get confidence-based CSS class for n-gram underline
                        const ngramClass = hasUnderline ? getNgramConfidenceClass(ngramJaccard) : ''

                        return (
                          <span
                            key={tokenIdx}
                            className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${ngramClass} ${hasInterfeatureHighlight ? 'activation-token--interfeature' : ''}`}
                            style={{
                              backgroundColor: token.activation_value
                                ? getActivationColor(token.activation_value, example.max_activation)
                                : 'transparent'
                            }}
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
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(ActivationExample)
