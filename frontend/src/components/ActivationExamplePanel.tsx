import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { ActivationExamples, QuantileExample } from '../types'
import {
  buildActivationTokens,
  getActivationColor,
  formatTokensWithEllipsis
} from '../lib/activation-utils'
import '../styles/ActivationExamplePanel.css'

interface ActivationExampleProps {
  examples: ActivationExamples
  containerWidth: number  // Width of container passed from parent (eliminates measurement shift)
  // Inter-feature pattern highlighting (optional, from decoder similarity table)
  interFeaturePositions?: {
    type: 'char' | 'word'
    positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}>
  }
  // Hover coordination for paired activating examples
  isHovered?: boolean  // Whether this pair is currently hovered (from parent)
  onHoverChange?: (isHovered: boolean) => void  // Callback when hover state changes
  // Number of quantiles to show (1-4, default 3 for tables, 4 for feature split)
  numQuantiles?: number
  // Examples per quantile - array specifying how many examples to show per quantile
  // e.g., [2, 2, 1, 1] means 2 from Q0, 2 from Q1, 1 from Q2, 1 from Q3
  // If not provided, defaults to 1 per quantile
  examplesPerQuantile?: number[]
  // Disable hover popover (for FeatureSplitPairViewer where we show more examples inline)
  disableHover?: boolean
  // Disable feature-specific n-gram highlighting (Stage 1 only shows inter-feature patterns)
  disableNgramHighlight?: boolean
}

/**
 * Check if a token should be highlighted and get char offset (unified logic)
 * Backend decides word vs char; frontend just uses the unified positions
 */
const getTokenHighlight = (
  tokenPosition: number,
  example: QuantileExample
): { highlight: boolean; charOffset: number | null } => {
  const pos = example.ngram_positions?.find(
    p => p.token_position === tokenPosition
  )
  if (pos) {
    return { highlight: true, charOffset: pos.char_offset }
  }
  return { highlight: false, charOffset: null }
}

/**
 * Render token content with optional character-level highlighting
 * For char-level n-grams (charOffset !== null), splits the token to highlight substring
 * For word-level n-grams (charOffset === null), the whole token is highlighted via CSS class
 */
const renderTokenContent = (
  text: string,
  isNewline: boolean | undefined,
  charOffset: number | null,
  ngramLength: number
): React.ReactNode => {
  // Handle newline tokens
  if (isNewline) {
    return <span className="newline-symbol">{getWhitespaceSymbol(text)}</span>
  }

  // For char-level highlighting (charOffset !== null), split the token
  if (charOffset !== null && ngramLength > 0) {
    const before = text.slice(0, charOffset)
    const highlight = text.slice(charOffset, charOffset + ngramLength)
    const after = text.slice(charOffset + ngramLength)

    return (
      <>
        {before && <span>{before}</span>}
        <span className="activation-token__ngram-char">{highlight}</span>
        {after}
      </>
    )
  }

  // Default: return text as-is (word n-grams use CSS class on entire token)
  return text
}

/**
 * Check if a token should be highlighted based on inter-feature positions
 * Uses same position-matching logic but for inter-feature highlighting
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

/**
 * Render an activation token, splitting leading spaces from activated tokens
 * so consecutive highlighted words don't visually merge into one orange block.
 */
const renderActivationToken = (
  token: { text: string; activation_value?: number; is_max?: boolean; is_newline?: boolean; position: number },
  tokenIdx: number,
  example: QuantileExample,
  ngramLength: number,
  interFeaturePositions?: ActivationExampleProps['interFeaturePositions'],
  disableNgramHighlight?: boolean,
): React.ReactNode => {
  const { highlight, charOffset } = disableNgramHighlight
    ? { highlight: false, charOffset: null }
    : getTokenHighlight(token.position, example)
  const hasWordUnderline = highlight && charOffset === null
  const hasInterfeatureHighlight = shouldHighlightInterfeature(token.position, example, interFeaturePositions)

  const className = `activation-token ${token.activation_value ? 'activation-token--activated' : ''} ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${hasWordUnderline ? 'activation-token--ngram' : ''} ${hasInterfeatureHighlight ? 'activation-token--interfeature' : ''}`
  const bgColor = token.activation_value
    ? getActivationColor(token.activation_value, example.max_activation)
    : undefined

  // Split leading spaces from activated tokens to prevent merged highlights
  const leadingSpaces = token.activation_value && token.text.match(/^ +/)
  if (leadingSpaces) {
    const wordClassName = `activation-token ${token.activation_value ? 'activation-token--activated' : ''} ${token.is_max ? 'activation-token--max' : ''} ${hasWordUnderline ? 'activation-token--ngram' : ''} ${hasInterfeatureHighlight ? 'activation-token--interfeature' : ''}`
    return (
      <React.Fragment key={tokenIdx}>
        <span className="activation-token"><span>{leadingSpaces[0]}</span></span>
        <span className={wordClassName} style={{ '--activation-color': bgColor } as React.CSSProperties}>
          {renderTokenContent(token.text.slice(leadingSpaces[0].length), token.is_newline, charOffset !== null ? charOffset - leadingSpaces[0].length : charOffset, ngramLength)}
        </span>
      </React.Fragment>
    )
  }

  return (
    <span key={tokenIdx} className={className} style={{ '--activation-color': bgColor } as React.CSSProperties}>
      {renderTokenContent(token.text, token.is_newline, charOffset, ngramLength)}
    </span>
  )
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
  onHoverChange,
  numQuantiles = 3,  // Default to 3 quantiles for tables, override to 4 for feature split
  examplesPerQuantile,  // Custom examples per quantile, e.g., [2, 2, 1, 1]
  disableHover = false,  // Disable hover popover
  disableNgramHighlight = false  // Disable feature-specific n-gram highlighting
}) => {
  // All hooks must be called unconditionally before any early returns
  const [showPopover, setShowPopover] = useState<boolean>(false)
  const [popoverPosition, setPopoverPosition] = useState<'above' | 'below'>('below')
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)

  // Check if we have empty examples (used for conditional rendering below)
  const hasExamples = examples?.quantile_examples && examples.quantile_examples.length > 0

  // Show popover if either locally hovered or parent says this pair is hovered (unless disabled)
  const effectiveShowPopover = !disableHover && (showPopover || (isHovered ?? false))

  // Detect popover position (above/below) and calculate fixed coordinates
  const detectPopoverPosition = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()

    // Estimated popover height ~200px
    const spaceBelow = window.innerHeight - rect.bottom
    const position = spaceBelow < 200 ? 'above' : 'below'
    setPopoverPosition(position)

    // Calculate fixed position coordinates
    const style: React.CSSProperties = {
      left: `${rect.left}px`,
      width: `${rect.width}px`
    }

    if (position === 'below') {
      style.top = `${rect.top}px`
    } else {
      style.bottom = `${window.innerHeight - rect.bottom}px`
    }

    setPopoverStyle(style)
  }, [])

  // containerWidth is passed directly to formatTokensWithEllipsis as pixel budget

  // Get the n-gram length for precise highlighting (backend provides this)
  // For char n-grams: number of characters; for word n-grams: not used (whole token highlighted)
  const ngramLength = useMemo(() => {
    if (!hasExamples) return 0
    // For char n-grams, ngram_length is the character count
    // For word n-grams, we don't need the length (whole token is highlighted via CSS)
    return examples.ngram_type === 'char' ? examples.ngram_length : 0
  }, [examples?.ngram_type, examples?.ngram_length, hasExamples])

  // Group examples by quantile_index (memoized for performance)
  // Prioritize examples with n-gram positions
  const quantileGroups = useMemo(() => {
    if (!hasExamples) return []
    const groups = Array.from({ length: numQuantiles }, (_, qIndex) => {
      const filtered = examples.quantile_examples.filter(ex => ex.quantile_index === qIndex)
      // Sort to put examples with positions first
      const sorted = [...filtered].sort((a, b) => {
        const aHasPositions = (a.ngram_positions?.length ?? 0) > 0
        const bHasPositions = (b.ngram_positions?.length ?? 0) > 0
        return bHasPositions === aHasPositions ? 0 : (bHasPositions ? 1 : -1)
      })
      return sorted.slice(0, 2)
    })
    return groups
  }, [examples, hasExamples, numQuantiles])

  // Recalculate popover position when isHovered becomes true
  // This handles the case where the main feature's popover is shown
  // when hovering a similar feature (via parent's isHovered prop)
  useEffect(() => {
    if (isHovered && !showPopover) {
      // Parent is triggering hover, but we haven't calculated position yet
      detectPopoverPosition()
    }
  }, [isHovered, showPopover, detectPopoverPosition])

  // Calculate total rows to determine CSS class
  // If examplesPerQuantile is provided, sum it; otherwise use numQuantiles
  const totalRows = examplesPerQuantile
    ? examplesPerQuantile.reduce((sum, n) => sum + n, 0)
    : numQuantiles

  // Handle empty activating examples (features with 0 activations)
  if (!hasExamples) {
    return (
      <div className="activation-example activation-example--empty">
        <span className="activation-example__empty-text">No activation example</span>
      </div>
    )
  }

  // Determine CSS class based on total rows
  // Use rows-N for custom row counts, otherwise fall back to quantiles-based class
  const heightClass = totalRows === 8
    ? 'activation-example--rows-8'
    : totalRows === 6
      ? 'activation-example--rows-6'
      : `activation-example--quantiles-${numQuantiles}`

  return (
    <div
      ref={containerRef}
      className={`activation-example ${heightClass}${disableHover ? ' activation-example--no-hover' : ''}`}
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
      {/* Default view: Configurable quantiles, character-based truncation */}
      {/* If examplesPerQuantile is provided, show multiple examples per quantile */}
      {Array.from({ length: numQuantiles }, (_, qIndex) => {
        const numExamples = examplesPerQuantile?.[qIndex] ?? 1
        const examples_to_show = quantileGroups[qIndex]?.slice(0, numExamples) || []

        return examples_to_show.map((example, exampleIdx) => {
          if (!example) return null

          // Pass all tokens - use 2x length to ensure symmetric window covers full array
          const tokens = buildActivationTokens(example, example.prompt_tokens.length * 2)

          // Truncate based on available width (symmetric around max token with full tokens)
          const { displayTokens } = formatTokensWithEllipsis(tokens, containerWidth)

          return (
            <div
              key={`${qIndex}-${exampleIdx}`}
              className="activation-example__quantile"
            >
              {displayTokens.map((token, tokenIdx) => {
                return renderActivationToken(token, tokenIdx, example, ngramLength, interFeaturePositions, disableNgramHighlight)
              })}
            </div>
          )
        })
      }).flat()}

      {/* Hover popover: All 8 examples (2 per quantile) - shows when this row is hovered */}
      {effectiveShowPopover && (
        <div
          className={`activation-example__popover activation-example__popover--${popoverPosition}`}
          style={popoverStyle}
        >
          <div className="activation-example__popover-content">
            {quantileGroups.map((group, qIdx) => (
              <div key={qIdx} className="activation-example__popover-quantile-group">
                {group.map((example, exIdx) => {
                  // Pass all tokens - use 2x length to ensure symmetric window covers full array
                  const tokens = buildActivationTokens(example, example.prompt_tokens.length * 2)
                  const { displayTokens } = formatTokensWithEllipsis(tokens, containerWidth)

                  return (
                    <div key={exIdx} className="activation-example__popover-row">
                              {displayTokens.map((token, tokenIdx) => {
                        return renderActivationToken(token, tokenIdx, example, ngramLength, interFeaturePositions, disableNgramHighlight)
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
