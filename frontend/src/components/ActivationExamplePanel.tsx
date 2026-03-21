import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { ActivationExamples, QuantileExample, ContextSpan, SyntaxNgramSet, SyntaxParseSet } from '../types'
import {
  buildActivationTokens,
  getActivationColor,
  formatTokensWithEllipsis
} from '../lib/activation-utils'
import { addOpacityToHex } from '../lib/color-utils'
import '../styles/ActivationExamplePanel.css'

interface ActivationExampleProps {
  examples: ActivationExamples
  containerWidth: number  // Width of container passed from parent (eliminates measurement shift)
  // Inter-feature pattern highlighting (optional, from decoder similarity table)
  interFeaturePositions?: {
    type: 'char' | 'word'
    positions: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset?: number}> | number[]}>
    ngramLength?: number  // From best_ngram_text.length, for char-level border highlighting
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
  // Highlight mode: 'syntax' or 'context' for per-component highlighting
  // When set, uses highlights data instead of ngram_positions
  highlightMode?: 'syntax' | 'context'
  // Show orange activation strength overlay (default true)
  showActivation?: boolean
}

// Highlight colors from cause category palette (D3_SCHEME_TABLEAU10)
const SYNTAX_HIGHLIGHT_COLOR = '#af7aa1'  // PURPLE = Missed Syntax
const CONTEXT_HIGHLIGHT_COLOR = '#edc949' // YELLOW = Missed Context

/** Build tooltip text describing which highlight sets cover a token */
function buildSyntaxTooltip(
  ngrams: SyntaxNgramSet[],
  deps: SyntaxParseSet[],
  asts: SyntaxParseSet[],
): string | undefined {
  const parts: string[] = []
  for (const n of ngrams) {
    parts.push(`"${n.ngram}"`)
  }
  for (const d of deps) {
    parts.push(`${d.relation} [${d.direction}]`)
  }
  for (const a of asts) {
    parts.push(`${a.relation} → ${a.direction}`)
  }
  return parts.length > 0 ? parts.join(', ') : undefined
}

function buildContextTooltip(
  spans: ContextSpan[],
  discScore: number | undefined,
): string | undefined {
  const parts: string[] = []
  for (const s of spans) {
    parts.push(`Span (${s.span_size} tokens): sim ${s.score.toFixed(2)}`)
  }
  if (discScore != null && discScore > 0) {
    parts.push(`Discriminative (IDF): ${discScore.toFixed(2)}`)
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

/** Build position → [{comp, score}] lookup from highlights data (used for disc_idf in context mode) */
function buildHighlightLookup(
  highlights: Record<string, [number, number][]> | undefined
): Map<number, Array<{comp: string, score: number}>> {
  const map = new Map<number, Array<{comp: string, score: number}>>()
  if (!highlights) return map
  for (const [comp, entries] of Object.entries(highlights)) {
    if (comp !== 'disc_idf' || !Array.isArray(entries)) continue
    for (const [pos, score] of entries) {
      const existing = map.get(pos)
      if (existing) {
        existing.push({ comp, score })
      } else {
        map.set(pos, [{ comp, score }])
      }
    }
  }
  return map
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
 * Render an activation token with per-component highlight support.
 */
const renderActivationToken = (
  token: { text: string; activation_value?: number; is_max?: boolean; is_newline?: boolean; position: number },
  tokenIdx: number,
  example: QuantileExample,
  ngramLength: number,
  disableNgramHighlight?: boolean,
  maxActivation?: number,
  highlightMode?: 'syntax' | 'context',
  highlightLookup?: Map<number, Array<{comp: string, score: number}>>,
  hoveredHighlight?: {comp: string, promptId: number} | null,
  onTokenHover?: (comp: string | null, promptId: number) => void,
  promptId?: number,
  showActivation?: boolean,
): React.ReactNode => {
  // Context highlighting: span-based regions
  if (highlightMode === 'context') {
    const contextSpans: ContextSpan[] = example.highlights?.context_spans ?? []
    // Also include disc_idf per-token data from highlightLookup
    const discEntries = highlightLookup?.get(token.position)?.filter(e => e.comp === 'disc_idf') ?? []

    // Find which context span(s) this token falls within
    const matchingSpans = contextSpans.filter(s => token.position >= s.start && token.position < s.end)

    const highlightColor = CONTEXT_HIGHLIGHT_COLOR
    const isActivated = showActivation !== false && (token.activation_value ?? 0) >= example.max_activation * 0.05

    // Hover group: spans use cross-example hover (same set_index across all examples),
    // disc_idf uses cross-example hover (same token highlighted across all examples in feature)
    const isInHoverGroup = hoveredHighlight != null && (
      matchingSpans.some(s => hoveredHighlight.comp === `context_span_${s.set_index}`) ||
      (hoveredHighlight.comp === 'disc_idf' && discEntries.length > 0)
    )

    const className = `activation-token${isActivated ? ' activation-token--activated' : ''}${token.is_max ? ' activation-token--max' : ''}${token.is_newline ? ' activation-token--newline' : ''}${isInHoverGroup ? ' activation-token--hover-group' : ''}`
    const bgColor = isActivated
      ? getActivationColor(token.activation_value!, maxActivation ?? example.max_activation)
      : undefined

    const style: React.CSSProperties = isActivated ? { '--activation-color': bgColor } as React.CSSProperties : {}

    // Apply span highlight (use best score if multiple spans overlap)
    if (matchingSpans.length > 0) {
      const bestScore = Math.max(...matchingSpans.map(s => s.score))
      const opacity = 0.75
      style.backgroundColor = addOpacityToHex(highlightColor, opacity)
    } else if (discEntries.length > 0) {
      // Fallback to disc_idf if no span covers this token
      const bestScore = Math.max(...discEntries.map(e => e.score))
      const opacity = 0.75
      style.backgroundColor = addOpacityToHex(highlightColor, opacity)
    }

    const hasHighlight = matchingSpans.length > 0 || discEntries.length > 0
    const hoverComp = matchingSpans.length > 0 ? `context_span_${matchingSpans[0].set_index}` : discEntries.length > 0 ? 'disc_idf' : null
    const hoverProps = hasHighlight && onTokenHover && promptId != null ? {
      onMouseEnter: () => onTokenHover(hoverComp, promptId),
      onMouseLeave: () => onTokenHover(null, promptId),
    } : undefined

    // Tooltip showing context highlight type
    const discScore = discEntries.length > 0 ? Math.max(...discEntries.map(e => e.score)) : undefined
    const ctxTooltipText = hasHighlight ? buildContextTooltip(matchingSpans, discScore) : undefined
    const ctxTooltipProps = ctxTooltipText ? { 'data-tooltip': ctxTooltipText, 'data-tooltip-below': true } as Record<string, unknown> : {}

    if (token.is_newline) {
      return (
        <span key={tokenIdx} className={className} style={style} {...hoverProps} {...ctxTooltipProps}>
          <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
        </span>
      )
    }

    const leadingSpaces = isActivated && token.text.match(/^ +/)
    if (leadingSpaces) {
      const spaceLen = leadingSpaces[0].length
      return (
        <React.Fragment key={tokenIdx}>
          <span className="activation-token"><span>{leadingSpaces[0]}</span></span>
          <span className={className} style={style} {...hoverProps} {...ctxTooltipProps}>{token.text.slice(spaceLen)}</span>
        </React.Fragment>
      )
    }

    return <span key={tokenIdx} className={className} style={style} {...hoverProps} {...ctxTooltipProps}>{token.text}</span>
  }

  // Syntax highlighting: set-based (ngram + dep + ast) with cross-example hover
  if (highlightMode === 'syntax') {
    const highlightColor = SYNTAX_HIGHLIGHT_COLOR

    // Find ALL syntax sets covering this token position
    const ngramSets: SyntaxNgramSet[] = example.highlights?.syntax_ngram_sets ?? []
    const depSets: SyntaxParseSet[] = example.highlights?.syntax_dep_sets ?? []
    const astSets: SyntaxParseSet[] = example.highlights?.syntax_ast_sets ?? []

    const posInSpan = (s: { start: number, end: number }) => token.position >= s.start && token.position < s.end

    const coveringNgrams = ngramSets.filter(ns => ns.spans.some(posInSpan))
    const coveringDeps = depSets.filter(ds => ds.spans.some(posInSpan))
    const coveringAsts = astSets.filter(as => as.spans.some(posInSpan))

    const hasAnyCovering = coveringNgrams.length > 0 || coveringDeps.length > 0 || coveringAsts.length > 0

    // Best score for background opacity (Jaccard for ngrams, rate for parse)
    const bestScore = Math.max(
      ...coveringNgrams.map(n => n.jaccard),
      ...coveringDeps.map(d => d.rate),
      ...coveringAsts.map(a => a.rate),
      0
    )

    const isActivated = showActivation !== false && (token.activation_value ?? 0) >= example.max_activation * 0.05

    // Build covering set identifiers for hover (prefixed to avoid collisions)
    const coveringIds: string[] = [
      ...coveringNgrams.map(n => `ngram_${n.set_index}`),
      ...coveringDeps.map(d => `dep_${d.set_index}`),
      ...coveringAsts.map(a => `ast_${a.set_index}`),
    ]

    // Check if hovered set matches any covering set
    const hoveredIds = hoveredHighlight?.comp.startsWith('syntax_set_')
      ? new Set(hoveredHighlight.comp.replace('syntax_set_', '').split(','))
      : null
    const isInHoverGroup = hoveredIds != null && coveringIds.some(id => hoveredIds.has(id))

    const className = `activation-token${isActivated ? ' activation-token--activated' : ''}${token.is_max ? ' activation-token--max' : ''}${token.is_newline ? ' activation-token--newline' : ''}${isInHoverGroup ? ' activation-token--hover-group' : ''}`
    const bgColor = isActivated
      ? getActivationColor(token.activation_value!, maxActivation ?? example.max_activation)
      : undefined

    const style: React.CSSProperties = isActivated ? { '--activation-color': bgColor } as React.CSSProperties : {}
    if (hasAnyCovering && bestScore > 0) {
      const opacity = 0.75
      style.backgroundColor = addOpacityToHex(highlightColor, opacity)
    }

    // Hover emits all covering set IDs
    const hoverComp = coveringIds.length > 0 ? `syntax_set_${coveringIds.join(',')}` : null
    const hoverProps = hasAnyCovering && onTokenHover && promptId != null ? {
      onMouseEnter: () => onTokenHover(hoverComp, promptId),
      onMouseLeave: () => onTokenHover(null, promptId),
    } : undefined

    // Tooltip showing what type of highlight covers this token
    const tooltipText = hasAnyCovering ? buildSyntaxTooltip(coveringNgrams, coveringDeps, coveringAsts) : undefined
    const tooltipProps = tooltipText ? { 'data-tooltip': tooltipText, 'data-tooltip-below': true } as Record<string, unknown> : {}

    if (token.is_newline) {
      return (
        <span key={tokenIdx} className={className} style={style} {...hoverProps} {...tooltipProps}>
          <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
        </span>
      )
    }

    const leadingSpaces = isActivated && token.text.match(/^ +/)
    if (leadingSpaces) {
      const spaceLen = leadingSpaces[0].length
      return (
        <React.Fragment key={tokenIdx}>
          <span className="activation-token"><span>{leadingSpaces[0]}</span></span>
          <span className={className} style={style} {...hoverProps} {...tooltipProps}>{token.text.slice(spaceLen)}</span>
        </React.Fragment>
      )
    }

    return <span key={tokenIdx} className={className} style={style} {...hoverProps} {...tooltipProps}>{token.text}</span>
  }

  // Legacy: binary ngram_positions highlighting
  const intra = disableNgramHighlight
    ? { highlight: false, charOffset: null }
    : getTokenHighlight(token.position, example)

  let effectiveCharOffset: number | null = null
  let effectiveNgramLength = 0
  if (intra.highlight && intra.charOffset !== null) {
    effectiveCharOffset = intra.charOffset
    effectiveNgramLength = ngramLength
  }

  const hasWordUnderline = intra.highlight && intra.charOffset === null

  // Filter out low activations: tokens below 5% of per-example max are treated as non-activated
  const isActivated = (token.activation_value ?? 0) >= example.max_activation * 0.05

  const className = `activation-token ${isActivated ? 'activation-token--activated' : ''} ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''} ${hasWordUnderline ? 'activation-token--ngram' : ''}`
  const bgColor = isActivated
    ? getActivationColor(token.activation_value!, maxActivation ?? example.max_activation)
    : undefined

  // Split leading spaces from activated tokens to prevent merged highlights
  const leadingSpaces = isActivated && token.text.match(/^ +/)
  if (leadingSpaces) {
    const spaceLen = leadingSpaces[0].length
    const wordClassName = `activation-token ${isActivated ? 'activation-token--activated' : ''} ${token.is_max ? 'activation-token--max' : ''} ${hasWordUnderline ? 'activation-token--ngram' : ''}`
    return (
      <React.Fragment key={tokenIdx}>
        <span className="activation-token"><span>{leadingSpaces[0]}</span></span>
        <span className={wordClassName} style={{ '--activation-color': bgColor } as React.CSSProperties}>
          {renderTokenContent(token.text.slice(spaceLen), token.is_newline, effectiveCharOffset !== null ? effectiveCharOffset - spaceLen : effectiveCharOffset, effectiveNgramLength)}
        </span>
      </React.Fragment>
    )
  }

  return (
    <span key={tokenIdx} className={className} style={{ '--activation-color': bgColor } as React.CSSProperties}>
      {renderTokenContent(token.text, token.is_newline, effectiveCharOffset, effectiveNgramLength)}
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
  interFeaturePositions: _interFeaturePositions, // commented out: inter-feature highlighting
  isHovered,
  onHoverChange,
  numQuantiles = 3,  // Default to 3 quantiles for tables, override to 4 for feature split
  examplesPerQuantile,  // Custom examples per quantile, e.g., [2, 2, 1, 1]
  disableHover = false,  // Disable hover popover
  disableNgramHighlight = false,  // Disable feature-specific n-gram highlighting
  highlightMode,  // Per-component highlighting: 'syntax' or 'context'
  showActivation = true,  // Show orange activation strength overlay
}) => {
  // All hooks must be called unconditionally before any early returns
  const [showPopover, setShowPopover] = useState<boolean>(false)
  const [popoverPosition, setPopoverPosition] = useState<'above' | 'below'>('below')
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const [hoveredHighlight, setHoveredHighlight] = useState<{comp: string, promptId: number} | null>(null)
  const handleTokenHover = useCallback((comp: string | null, promptId: number) => {
    setHoveredHighlight(comp ? { comp, promptId } : null)
  }, [])
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

  // Feature-level max activation for consistent color scaling across all examples
  const featureMaxActivation = useMemo(() => {
    if (!hasExamples) return 1
    return Math.max(...examples.quantile_examples.map(ex => ex.max_activation))
  }, [examples, hasExamples])

  // Pre-build highlight lookups for all examples (keyed by prompt_id)
  const highlightLookups = useMemo(() => {
    if (!hasExamples || !highlightMode) return new Map<number, Map<number, Array<{comp: string, score: number}>>>()
    const map = new Map<number, Map<number, Array<{comp: string, score: number}>>>()
    for (const ex of examples.quantile_examples) {
      map.set(ex.prompt_id, buildHighlightLookup(ex.highlights))
    }
    return map
  }, [examples, hasExamples, highlightMode])

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
        setHoveredHighlight(null)
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

          const lookup = highlightLookups.get(example.prompt_id)

          return (
            <div
              key={`${qIndex}-${exampleIdx}`}
              className="activation-example__quantile"
            >
              {displayTokens.map((token, tokenIdx) => {
                return renderActivationToken(token, tokenIdx, example, ngramLength, disableNgramHighlight, featureMaxActivation, highlightMode, lookup, hoveredHighlight, handleTokenHover, example.prompt_id, showActivation)
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
                  const lookup = highlightLookups.get(example.prompt_id)

                  return (
                    <div key={exIdx} className="activation-example__popover-row">
                              {displayTokens.map((token, tokenIdx) => {
                        return renderActivationToken(token, tokenIdx, example, ngramLength, disableNgramHighlight, featureMaxActivation, highlightMode, lookup, hoveredHighlight, handleTokenHover, example.prompt_id, showActivation)
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
