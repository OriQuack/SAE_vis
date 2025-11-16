/**
 * Activation Example Utilities
 *
 * Functions for extracting, highlighting, and rendering activation tokens
 * with color coding based on activation strength.
 */

import { scaleLinear } from 'd3-scale'
import type { QuantileExample, ActivationToken } from '../types'

/**
 * Extract N-token window around max activation position
 *
 * Uses symmetric window: centerPos ± halfWindow
 */
export function extractTokenWindow(
  tokens: string[],
  centerPos: number,
  windowSize: number
): { tokens: string[], startIndex: number, endIndex: number } {
  const halfWindow = Math.floor(windowSize / 2)
  const startIndex = Math.max(0, centerPos - halfWindow)
  const endIndex = Math.min(tokens.length, centerPos + halfWindow + 1)

  return {
    tokens: tokens.slice(startIndex, endIndex),
    startIndex,
    endIndex
  }
}

/**
 * Build activation token array with highlighting metadata
 *
 * Creates array of tokens with their positions, activation values,
 * and whether they are the max activation token.
 */
export function buildActivationTokens(
  example: QuantileExample,
  windowSize: number = 10
): ActivationToken[] {
  const { tokens, startIndex } = extractTokenWindow(
    example.prompt_tokens,
    example.max_activation_position,
    windowSize
  )

  // Create lookup map for activation values
  const activationMap = new Map<number, number>()
  example.activation_pairs.forEach(pair => {
    activationMap.set(pair.token_position, pair.activation_value)
  })

  // Build token array with activation metadata
  return tokens.map((text, relativeIdx) => {
    const absolutePos = startIndex + relativeIdx
    // Check if token contains whitespace: newlines, carriage returns, tabs, or spaces
    const containsWhitespace = /[\n\r\t ]/.test(text) || text === '\\n' || text === '\\r' || text === '\\t' || text === ' '
    return {
      text,
      position: absolutePos,
      activation_value: activationMap.get(absolutePos),
      is_max: absolutePos === example.max_activation_position,
      is_newline: containsWhitespace
    }
  })
}

/**
 * Get background color based on activation strength
 *
 * Uses orange gradient: white (0) → light orange (0.5) → full orange (1.0)
 */
export function getActivationColor(
  activationValue: number,
  maxActivation: number
): string {
  const normalized = activationValue / maxActivation  // 0-1 scale

  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range(['#ffffff', '#fed7aa', '#fb923c'])  // white → light orange → orange

  return colorScale(normalized)
}

/**
 * Format tokens with ellipsis - SIMPLIFIED CENTERING
 *
 * Positions max activation token in the middle and expands symmetrically.
 * Uses character width to calculate positions and always shows full tokens.
 * Adjusts preview length based on available character budget.
 *
 * Algorithm:
 * 1. Start with max activation token (always fully shown)
 * 2. Expand symmetrically left/right, adding full tokens alternating
 * 3. Stop when adding next full token would exceed character budget
 * 4. Return display tokens with ellipsis flags for truncation indicators
 */
export function formatTokensWithEllipsis(
  tokens: ActivationToken[],
  maxLength: number = 50
): { displayTokens: ActivationToken[], hasLeftEllipsis: boolean, hasRightEllipsis: boolean } {
  const totalLength = tokens.reduce((sum, t) => sum + t.text.length, 0)

  // If everything fits, return all tokens
  if (totalLength <= maxLength) {
    return { displayTokens: tokens, hasLeftEllipsis: false, hasRightEllipsis: false }
  }

  // Find max token position
  const maxTokenIdx = tokens.findIndex(t => t.is_max)
  if (maxTokenIdx === -1) {
    // No max token found, fallback to simple truncation from start
    let currentLength = 0
    const displayTokens: ActivationToken[] = []
    for (const token of tokens) {
      if (currentLength + token.text.length > maxLength) break
      displayTokens.push(token)
      currentLength += token.text.length
    }
    return {
      displayTokens,
      hasLeftEllipsis: false,
      hasRightEllipsis: displayTokens.length < tokens.length
    }
  }

  // Start with max token (always include it fully)
  const selected = new Set<number>([maxTokenIdx])
  let currentLength = tokens[maxTokenIdx].text.length
  let leftIdx = maxTokenIdx - 1
  let rightIdx = maxTokenIdx + 1

  // Expand symmetrically left and right
  // IMPORTANT:
  // - Left (first) tokens: Only add if they FULLY fit within budget (exclude if cut off)
  // - Right (last) tokens: Show full token even if it exceeds budget (always include complete token)
  while (leftIdx >= 0 || rightIdx < tokens.length) {
    let addedToken = false

    // Try to add from left
    // STRICT: Don't show first token if it doesn't fully fit in character budget
    if (leftIdx >= 0) {
      const leftToken = tokens[leftIdx]
      if (currentLength + leftToken.text.length <= maxLength) {
        selected.add(leftIdx)
        currentLength += leftToken.text.length
        leftIdx--
        addedToken = true
      } else {
        // Token doesn't fit - don't show it at all
        leftIdx = -1
      }
    }

    // Try to add from right
    // PERMISSIVE: Show last token in full even if it's cut off by character budget
    if (rightIdx < tokens.length) {
      const rightToken = tokens[rightIdx]
      // Try to fit within budget, but if we're at the end and can't expand left anymore,
      // we still add the right token to show it in full
      if (currentLength + rightToken.text.length <= maxLength) {
        selected.add(rightIdx)
        currentLength += rightToken.text.length
        rightIdx++
        addedToken = true
      } else if (leftIdx < 0) {
        // Can't expand left anymore, so add right token anyway (show full token)
        selected.add(rightIdx)
        currentLength += rightToken.text.length
        rightIdx++
        addedToken = true
      } else {
        // Still have room on left, so stop expanding right
        rightIdx = tokens.length
      }
    }

    // If both sides can't add, stop
    if (!addedToken) break
  }

  // Build display tokens in order
  const displayTokens = tokens.filter((_, idx) => selected.has(idx))
  const hasLeftEllipsis = leftIdx + 1 > 0
  const hasRightEllipsis = rightIdx < tokens.length

  return { displayTokens, hasLeftEllipsis, hasRightEllipsis }
}

// ============================================================================
// INTER-FEATURE PATTERN HIGHLIGHTING UTILITIES
// ============================================================================

/**
 * Determine n-gram type (char vs word) based on Jaccard scores
 * Returns the winning type and its score
 *
 * Used to decide whether to use char or word positions for inter-feature highlighting.
 * Chooses the type with the higher Jaccard similarity score.
 *
 * @param interfeatureData - Inter-feature similarity data from decoder similarity
 * @returns Object with winning type and its Jaccard score, or null if no pattern
 */
export function determineNgramType(
  interfeatureData: any
): { type: 'char' | 'word' | null, jaccard: number } {
  if (!interfeatureData || interfeatureData.pattern_type === 'None') {
    return { type: null, jaccard: 0 }
  }

  const charJaccard = interfeatureData.char_jaccard || 0
  const wordJaccard = interfeatureData.word_jaccard || 0

  if (charJaccard === 0 && wordJaccard === 0) {
    return { type: null, jaccard: 0 }
  }

  // Choose type with higher Jaccard score
  return charJaccard >= wordJaccard
    ? { type: 'char', jaccard: charJaccard }
    : { type: 'word', jaccard: wordJaccard }
}

/**
 * Extract n-gram positions for a feature pair from inter-feature similarity data
 * Automatically chooses char or word positions based on Jaccard scores
 *
 * Use this function to extract highlighting positions when displaying feature pairs
 * with inter-feature pattern matching (e.g., in FeatureSplitTable).
 *
 * @param interfeatureData - Inter-feature similarity data from decoder similarity
 * @returns Object with type and positions for both features, or null if no data
 */
export function extractInterFeaturePositions(
  interfeatureData: any
): {
  type: 'char' | 'word' | null
  mainPositions: any
  similarPositions: any
} | null {
  if (!interfeatureData || interfeatureData.pattern_type === 'None') {
    return null
  }

  const { type } = determineNgramType(interfeatureData)
  if (!type) return null

  // Extract positions based on winning type
  const mainPositions = type === 'char'
    ? interfeatureData.main_char_ngram_positions
    : interfeatureData.main_word_ngram_positions

  const similarPositions = type === 'char'
    ? interfeatureData.similar_char_ngram_positions
    : interfeatureData.similar_word_ngram_positions

  if (!mainPositions || !similarPositions) return null

  return { type, mainPositions, similarPositions }
}

/**
 * Normalize position data to unified char format
 * Handles both char positions (with offset) and word positions (without offset)
 *
 * Char format: Array<{ token_position: number, char_offset?: number }>
 * Word format: Array<number> (just token positions)
 *
 * This normalization enables merging highlights from different n-gram types.
 *
 * @param type - Position type ('char' or 'word')
 * @param positions - Raw position data
 * @returns Normalized positions in char format
 */
export function normalizePositionsToCharFormat(
  type: 'char' | 'word',
  positions: any
): Array<{token_position: number, char_offset?: number}> {
  if (type === 'char') {
    // Already in char format with optional char_offset
    return positions as Array<{token_position: number, char_offset?: number}>
  } else {
    // Convert word positions (number[]) to char format (without offset)
    return (positions as number[]).map(tokenPos => ({
      token_position: tokenPos,
      char_offset: undefined
    }))
  }
}

/**
 * Merge multiple inter-feature highlights into a single position set
 * Handles deduplication by token_position and normalizes to char format
 *
 * Use case: When a feature appears in multiple pairs, merge all highlights to show
 * combined pattern matches. Also used to merge clicked and hovered highlights.
 *
 * Algorithm:
 * 1. Group positions by prompt_id
 * 2. Normalize all positions to char format
 * 3. Deduplicate within each prompt by token_position
 * 4. Return merged result
 *
 * @param highlights - Array of highlight objects with type and positions
 * @returns Merged positions in char format, or undefined if no highlights
 */
export function mergeInterFeaturePositions(
  highlights: Array<{
    type: 'char' | 'word'
    positions: any
  }>
): {
  type: 'char',
  positions: Array<{
    prompt_id: number,
    positions: Array<{token_position: number, char_offset?: number}>
  }>
} | undefined {
  if (highlights.length === 0) return undefined

  // Map: prompt_id -> { prompt_id, positions }
  const mergedPositionsMap = new Map<number, {
    prompt_id: number,
    positions: Array<{token_position: number, char_offset?: number}>
  }>()

  highlights.forEach(({ type, positions }) => {
    if (positions) {
      positions.forEach((promptData: any) => {
        const existing = mergedPositionsMap.get(promptData.prompt_id)

        // Normalize to char format
        const normalizedPositions = normalizePositionsToCharFormat(type, promptData.positions)

        if (existing) {
          // Merge and deduplicate by token_position
          const posMap = new Map<number, {token_position: number, char_offset?: number}>()
          existing.positions.forEach(p => posMap.set(p.token_position, p))
          normalizedPositions.forEach(p => {
            if (!posMap.has(p.token_position)) {
              posMap.set(p.token_position, p)
            }
          })
          existing.positions = Array.from(posMap.values())
        } else {
          // Add new prompt_id entry
          mergedPositionsMap.set(promptData.prompt_id, {
            prompt_id: promptData.prompt_id,
            positions: [...normalizedPositions]
          })
        }
      })
    }
  })

  return {
    type: 'char',
    positions: Array.from(mergedPositionsMap.values())
  }
}
