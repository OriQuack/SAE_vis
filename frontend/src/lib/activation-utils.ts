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
    // Check if token contains newlines, carriage returns, or tabs
    const containsWhitespace = /[\n\r\t]/.test(text) || text === '\\n' || text === '\\r' || text === '\\t'
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
 * Get border style based on cross-example similarity
 *
 * Border represents how similar the activation examples are to each other:
 * - Green (3px): High semantic similarity (>0.7)
 * - Blue (3px): High lexical pattern (>0.5)
 * - Purple (2px): Moderate similarity (>0.3)
 * - Gray (1px): Low similarity
 */
export function getBorderStyle(
  semanticSim: number,
  maxJaccard: number
): { color: string, width: string, style: string } {
  // High similarity → stronger border
  if (semanticSim > 0.7) {
    return { color: '#10b981', width: '3px', style: 'solid' }  // Green
  } else if (maxJaccard > 0.5) {
    return { color: '#3b82f6', width: '3px', style: 'solid' }  // Blue
  } else if (semanticSim > 0.3 || maxJaccard > 0.3) {
    return { color: '#8b5cf6', width: '2px', style: 'solid' }  // Purple
  } else {
    return { color: '#d1d5db', width: '1px', style: 'solid' }  // Gray
  }
}

/**
 * Format tokens with ellipsis - SYMMETRIC TRUNCATION
 *
 * Truncates token display if total length exceeds maxLength,
 * centering the max activation token with equal amounts before/after.
 *
 * Returns left and right ellipsis flags for symmetric display.
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
    // No max token found, fallback to simple truncation
    let currentLength = 0
    const displayTokens: ActivationToken[] = []
    for (const token of tokens) {
      if (currentLength + token.text.length > maxLength - 3) break
      displayTokens.push(token)
      currentLength += token.text.length
    }
    return { displayTokens, hasLeftEllipsis: false, hasRightEllipsis: true }
  }

  // Reserve space for ellipsis (3 chars each side if needed)
  const reservedSpace = 6
  const availableSpace = maxLength - reservedSpace

  // Symmetric expansion from max token
  const selected = new Set<number>([maxTokenIdx])
  let currentLength = tokens[maxTokenIdx].text.length
  let leftIdx = maxTokenIdx - 1
  let rightIdx = maxTokenIdx + 1

  // Expand symmetrically until we run out of space
  while ((leftIdx >= 0 || rightIdx < tokens.length) && currentLength < availableSpace) {
    // Try to add from left
    if (leftIdx >= 0) {
      const leftToken = tokens[leftIdx]
      if (currentLength + leftToken.text.length <= availableSpace) {
        selected.add(leftIdx)
        currentLength += leftToken.text.length
        leftIdx--
      } else {
        leftIdx = -1 // Can't add more from left
      }
    }

    // Try to add from right
    if (rightIdx < tokens.length && currentLength < availableSpace) {
      const rightToken = tokens[rightIdx]
      if (currentLength + rightToken.text.length <= availableSpace) {
        selected.add(rightIdx)
        currentLength += rightToken.text.length
        rightIdx++
      } else {
        rightIdx = tokens.length // Can't add more from right
      }
    }

    // If both sides exhausted, break
    if (leftIdx < 0 && rightIdx >= tokens.length) break
  }

  // Build display tokens in order
  const displayTokens = tokens.filter((_, idx) => selected.has(idx))
  const hasLeftEllipsis = leftIdx + 1 > 0
  const hasRightEllipsis = rightIdx < tokens.length

  return { displayTokens, hasLeftEllipsis, hasRightEllipsis }
}
