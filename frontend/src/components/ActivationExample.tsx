import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { ActivationExamples, QuantileExample } from '../types'
import {
  buildActivationTokens,
  getActivationColor,
  formatTokensWithEllipsis
} from '../lib/activation-utils'
import '../styles/ActivationExample.css'

interface ActivationExampleProps {
  examples: ActivationExamples
  compact?: boolean  // Kept for backwards compatibility but not used
}

/**
 * Determine which n-gram type to use for underlining based on Jaccard scores
 * Only underline for Lexical or Both pattern types (not None or Semantic)
 */
const getNgramUnderlineType = (examples: ActivationExamples): 'char' | 'word' | null => {
  // Only show underlines for Lexical or Both patterns
  const patternType = examples.pattern_type.toLowerCase()
  if (patternType === 'none' || patternType === 'semantic') {
    return null
  }

  const charJaccard = examples.char_ngram_max_jaccard || 0
  const wordJaccard = examples.word_ngram_max_jaccard || 0

  if (charJaccard === 0 && wordJaccard === 0) return null
  return charJaccard >= wordJaccard ? 'char' : 'word'
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
  compact = true
}) => {
  const [showPopover, setShowPopover] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState<number>(630) // Default: 45% of ~1400px table

  // Measure container width dynamically
  useEffect(() => {
    if (!containerRef.current) return

    // Initial measurement
    const initialWidth = containerRef.current.getBoundingClientRect().width
    if (initialWidth > 0) {
      setAvailableWidth(initialWidth)
    }

    // Continue watching for resize events
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width
      if (width > 0) {  // Guard against zero-width measurements
        setAvailableWidth(width)
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Calculate max characters based on available width
  // Assume ~7px per character at 11px monospace font
  const maxLength = useMemo(() => Math.floor(availableWidth / 7), [availableWidth])

  // Group examples by quantile_index (memoized for performance)
  const quantileGroups = useMemo(() => {
    return [0, 1, 2, 3].map(qIndex =>
      examples.quantile_examples
        .filter(ex => ex.quantile_index === qIndex)
        .slice(0, 2)
    )
  }, [examples.quantile_examples])

  // Determine which n-gram type to underline (char vs word)
  const underlineType = useMemo(() => getNgramUnderlineType(examples), [examples])

  return (
    <div
      ref={containerRef}
      className="activation-example"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Default view: 3 quantiles (0, 1, 2), character-based truncation */}
      {[0, 1, 2].map(qIndex => {
        // Get first example from this quantile
        const example = examples.quantile_examples.find(ex => ex.quantile_index === qIndex)
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

              // Build title with activation and n-gram info
              let title = token.activation_value?.toFixed(3) || 'No activation'
              if (hasUnderline) {
                const ngramText = underlineType === 'char'
                  ? examples.top_char_ngram_text
                  : examples.top_word_ngram_text
                title += `\nN-gram pattern: "${ngramText}"`
              }

              return (
                <span
                  key={tokenIdx}
                  className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${hasUnderline ? 'activation-token--ngram-underline' : ''}`}
                  style={{
                    backgroundColor: token.activation_value
                      ? getActivationColor(token.activation_value, example.max_activation)
                      : 'transparent'
                  }}
                  title={title}
                >
                  {token.is_newline ? (
                    <>
                      <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
                      <span className="newline-actual">{token.text}</span>
                    </>
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

      {/* Hover popover: All 8 examples (2 per quantile) */}
      {showPopover && (
        <div className="activation-example__popover">
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

                        // Build title with activation and n-gram info
                        let title = token.activation_value?.toFixed(3) || 'No activation'
                        if (hasUnderline) {
                          const ngramText = underlineType === 'char'
                            ? examples.top_char_ngram_text
                            : examples.top_word_ngram_text
                          title += `\nN-gram pattern: "${ngramText}"`
                        }

                        return (
                          <span
                            key={tokenIdx}
                            className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${hasUnderline ? 'activation-token--ngram-underline' : ''}`}
                            style={{
                              backgroundColor: token.activation_value
                                ? getActivationColor(token.activation_value, example.max_activation)
                                : 'transparent'
                            }}
                            title={title}
                          >
                            {token.is_newline ? (
                              <>
                                <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
                                <span className="newline-actual">{token.text}</span>
                              </>
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
