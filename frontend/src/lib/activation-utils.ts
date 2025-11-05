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
  const { tokens, startIndex, endIndex } = extractTokenWindow(
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
 * Format tokens with ellipsis (like explanation display)
 *
 * Truncates token display if total length exceeds maxLength,
 * adding "..." at the end.
 *
 * IMPORTANT: Always includes the max activation token to ensure it's visible.
 */
export function formatTokensWithEllipsis(
  tokens: ActivationToken[],
  maxLength: number = 50
): { displayTokens: ActivationToken[], hasEllipsis: boolean } {
  const joined = tokens.map(t => t.text).join('')

  if (joined.length <= maxLength) {
    return { displayTokens: tokens, hasEllipsis: false }
  }

  // Find max token position
  const maxTokenIdx = tokens.findIndex(t => t.is_max)

  // Truncate and add ellipsis, but always include tokens up to max token
  let currentLength = 0
  const displayTokens: ActivationToken[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    // Always include tokens up to and including the max token
    if (i <= maxTokenIdx) {
      displayTokens.push(token)
      currentLength += token.text.length
    }
    // After max token, only add if within character limit
    else if (currentLength + token.text.length <= maxLength - 3) {
      displayTokens.push(token)
      currentLength += token.text.length
    }
    // Stop if we exceed the limit
    else {
      break
    }
  }

  return { displayTokens, hasEllipsis: displayTokens.length < tokens.length }
}
