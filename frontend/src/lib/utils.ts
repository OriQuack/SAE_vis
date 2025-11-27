// Consolidated general utilities and custom hooks
// Simplified implementation for research prototype

import { useRef, useEffect, useState, useCallback } from 'react'
import { scaleLinear } from 'd3-scale'
import {
  METRIC_COLORS
} from './constants'

// ============================================================================
// TYPES
// ============================================================================

// Hook Types
interface Size {
  width: number
  height: number
}

interface UseResizeObserverOptions {
  defaultWidth?: number
  defaultHeight?: number
  debounceMs?: number
  debugId?: string
}

interface UseResizeObserverReturn<T extends HTMLElement = HTMLElement> {
  ref: (node: T | null) => void
  size: Size
  hasMeasured: boolean  // True after at least one real measurement has been applied
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook to observe element size changes with debouncing
 */
export const useResizeObserver = <T extends HTMLElement = HTMLElement>({
  defaultWidth = 0,
  defaultHeight = 0,
  debounceMs = 100,
  debugId = 'unknown'
}: UseResizeObserverOptions = {}): UseResizeObserverReturn<T> => {
  const [size, setSize] = useState<Size>({ width: defaultWidth, height: defaultHeight })
  const [hasMeasured, setHasMeasured] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)
  const observerRef = useRef<ResizeObserver | null>(null)
  const debugIdRef = useRef(debugId)

  // Update debugId ref when it changes
  debugIdRef.current = debugId

  const callbackRef = useCallback((node: T | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      // Immediate measurement
      const rect = node.getBoundingClientRect()
      const newSize = {
        width: rect.width || defaultWidth,
        height: rect.height || defaultHeight
      }
      // Batch both updates together so they trigger a single re-render
      setSize(newSize)
      setHasMeasured(true)

      // Set up observer for future changes
      observerRef.current = new ResizeObserver(() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(() => {
          const rect = node.getBoundingClientRect()
          const newSize = {
            width: rect.width || defaultWidth,
            height: rect.height || defaultHeight
          }
        //   console.log(`[useResizeObserver ${debugIdRef.current}] Resize detected:`, newSize)
          setSize(newSize)
        }, debounceMs)
      })
      observerRef.current.observe(node)
    } else {
      // Node detached, reset hasMeasured
      setHasMeasured(false)
    }
  }, [defaultWidth, defaultHeight, debounceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { ref: callbackRef, size, hasMeasured }
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

// ============================================================================
// COLOR ENCODING UTILITIES (for scores)
// ============================================================================

/**
 * Get color for a quality score value (0-1)
 *
 * Uses performance gradient: white (poor) → green (good) with increasing opacity
 * Designed for displaying quality scores in the simplified table.
 *
 * @param score - Quality score value between 0 and 1
 * @returns RGB color string with alpha
 */
export function getQualityScoreColor(score: number): string {
  // Clamp value between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Create performance color scale: white (0) → light green (0.5) → full green (1)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([METRIC_COLORS.QUALITY_SCORE_COLORS.LOW, METRIC_COLORS.QUALITY_SCORE_COLORS.MEDIUM, METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH])

  return colorScale(clampedScore)
}

/**
 * Get metric-specific gradient color for score circles based on score value
 *
 * Uses distinct colorblind-safe colors for each metric type with opacity encoding:
 * - Low scores (0.0): Transparent/white
 * - Medium scores (0.5): 50% opacity
 * - High scores (1.0): Full color opacity
 *
 * Metric colors:
 * - Embedding: Blue gradient (#0072B2)
 * - Fuzz: Orange-red gradient (#E69F00)
 * - Detection: Green gradient (#228833)
 * - Decoder Similarity: Cyan gradient (#66CCEE)
 * - Semantic Similarity: Gray gradient (#999999)
 *
 * @param metricType - Type of metric (embedding, fuzz, detection, decoder_similarity, semantic_similarity)
 * @param score - Score value (0-1 range, normalized)
 * @param solidColor - If true, return solid base color without opacity gradient (default: false)
 * @returns RGB color string with opacity (or solid if solidColor=true)
 */
export function getMetricColor(
  metricType: 'embedding' | 'fuzz' | 'detection' | 'decoder_similarity' | 'semantic_similarity',
  score: number,
  solidColor: boolean = false
): string {
  // If solid color requested, return base color without opacity gradient
  if (solidColor) {
    switch (metricType) {
      case 'embedding':
        return METRIC_COLORS.SCORE_EMBEDDING.HIGH.slice(0, 7)  // Remove opacity suffix
      case 'fuzz':
        return METRIC_COLORS.SCORE_FUZZ.HIGH.slice(0, 7)
      case 'detection':
        return METRIC_COLORS.SCORE_DETECTION.HIGH.slice(0, 7)
      case 'decoder_similarity':
        return METRIC_COLORS.DECODER_SIMILARITY  // Already solid
      case 'semantic_similarity':
        return METRIC_COLORS.SEMANTIC_SIMILARITY  // Already solid
      default:
        return '#e5e7eb'  // Default gray
    }
  }

  // Original gradient-based color encoding
  // Clamp score between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Get color gradient for this metric type
  let gradient: { LOW: string; MEDIUM: string; HIGH: string }

  switch (metricType) {
    case 'embedding':
      gradient = METRIC_COLORS.SCORE_EMBEDDING
      break
    case 'fuzz':
      gradient = METRIC_COLORS.SCORE_FUZZ
      break
    case 'detection':
      gradient = METRIC_COLORS.SCORE_DETECTION
      break
    case 'decoder_similarity':
      // Create gradient inline for decoder similarity (cyan)
      gradient = {
        LOW: METRIC_COLORS.DECODER_SIMILARITY + '00',    // 0% opacity
        MEDIUM: METRIC_COLORS.DECODER_SIMILARITY + '80', // 50% opacity
        HIGH: METRIC_COLORS.DECODER_SIMILARITY + 'FF'    // 100% opacity
      }
      break
    case 'semantic_similarity':
      // Create gradient inline for semantic similarity (gray)
      gradient = {
        LOW: METRIC_COLORS.SEMANTIC_SIMILARITY + '00',    // 0% opacity
        MEDIUM: METRIC_COLORS.SEMANTIC_SIMILARITY + '80', // 50% opacity
        HIGH: METRIC_COLORS.SEMANTIC_SIMILARITY + 'FF'    // 100% opacity
      }
      break
    default:
      return '#e5e7eb'  // Default gray
  }

  // Create D3 color scale: white (0) → light color (0.5) → full color (1.0)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([gradient.LOW, gradient.MEDIUM, gradient.HIGH])

  return colorScale(clampedScore)
}

// ============================================================================
// SAE METADATA PARSING
// ============================================================================

/**
 * Parse SAE identifier to extract metadata components
 * @param saeId SAE identifier (e.g., "google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120")
 * @returns Parsed SAE metadata
 */
export function parseSAEId(saeId: string): {
  modelName: string
  layer: number | null
  width: string | null
  organization: string
} {
  const parts = saeId.split('/')

  // Extract model name (e.g., "gemma-scope-9b-pt-res" → "Gemma Scope 9B")
  const modelRaw = parts[1] || ''
  const modelName = formatModelName(modelRaw)

  // Extract layer (e.g., "layer_30" → 30)
  const layer = parts[2] ? parseInt(parts[2].replace('layer_', '')) : null

  // Extract width (e.g., "width_16k" → "16384")
  let width: string | null = null
  if (parts[3]) {
    const widthStr = parts[3].replace('width_', '')
    // Expand "k" suffix to full number (e.g., "16k" → "16384")
    if (widthStr.endsWith('k')) {
      const numValue = parseFloat(widthStr.slice(0, -1))
      width = (numValue * 1024).toString()
    } else {
      width = widthStr
    }
  }
  
  return {
    modelName,
    layer,
    width,
    organization: parts[0] || ''
  }
}

/**
 * Format model name from SAE identifier component to human-readable format
 * @param raw Raw model name (e.g., "gemma-scope-9b-pt-res")
 * @returns Formatted model name (e.g., "Gemma Scope 9B")
 */
function formatModelName(raw: string): string {
  return raw
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => {
      // Capitalize first letter, keep rest as-is (to preserve "9b" → "9B" style patterns)
      if (word.length === 0) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Get display names for LLM explainers from explainer IDs
 * @param explainerIds Explainer IDs (e.g., ["llama", "qwen", "openai"])
 * @returns Comma-separated display names (e.g., "Llama, Qwen, OpenAI")
 */
export function getLLMExplainerNames(explainerIds: string[]): string {
  const names = explainerIds.map(id => {
    const lowerCaseId = id.toLowerCase()
    if (lowerCaseId.includes('llama')) return 'Llama'
    if (lowerCaseId.includes('qwen')) return 'Qwen'
    if (lowerCaseId.includes('openai') || lowerCaseId.includes('gpt')) return 'OpenAI'
    // Fallback: capitalize first letter
    return id.charAt(0).toUpperCase() + id.slice(1)
  })
  return names.join(', ')
}

