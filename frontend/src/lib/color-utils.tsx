// ============================================================================
// COLOR UTILITIES - Centralized color logic for all components
// Merged from constants.ts and table-color-utils.ts for clear separation
// ============================================================================

import React from 'react'
import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  THRESHOLD_COLORS,
  METRIC_COLORS,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_CAUSE,
  UNSURE_GRAY
} from './constants'
import { getBadgeColors } from './tag-system'

// ============================================================================
// METRIC COLOR UTILITIES (from constants.ts)
// ============================================================================

/**
 * Get threshold region colors for a metric based on its interpretation
 * - decoder_similarity: Above threshold (solid) = RED (bad/split), Below (stripes) = GREEN (good/consistent)
 * - quality_score: Above threshold (solid) = GREEN (good quality), Below (stripes) = RED (bad quality)
 * - Other metrics: null (use default metric colors)
 *
 * @deprecated - Now using hierarchical color system. Histogram segments use child node colors.
 * @param metric - Metric type
 * @returns Object with 'above' and 'below' colors, or null for default behavior
 */
export function getThresholdRegionColors(metric: string): { above: string; below: string } | null {
  switch (metric) {
    case METRIC_DECODER_SIMILARITY:
      // Feature splitting: high values indicate split/inconsistent features (bad)
      return { above: THRESHOLD_COLORS.RED, below: THRESHOLD_COLORS.GREEN }
    case METRIC_QUALITY_SCORE:
      // Quality: high values indicate good quality features
      return { above: THRESHOLD_COLORS.GREEN, below: THRESHOLD_COLORS.RED }
    default:
      // Other metrics use default metric-specific colors
      return null
  }
}

/**
 * Get the base 6-digit hex color for a metric (without alpha channel)
 * Handles both simple colors and gradient objects
 *
 * Single source of truth for metric colors - change colors in METRIC_COLORS
 * and all visualizations update automatically
 *
 * @param metric - Metric type
 * @returns 6-digit hex color string (e.g., '#0072B2')
 */
export function getMetricBaseColor(metric: string): string {
  switch (metric) {
    case METRIC_DECODER_SIMILARITY:
      return METRIC_COLORS.DECODER_SIMILARITY
    case 'semantic_similarity':
      return METRIC_COLORS.SEMANTIC_SIMILARITY
    case METRIC_SCORE_EMBEDDING:
      // Extract base color from HIGH value (strip 'FF' alpha)
      return METRIC_COLORS.SCORE_EMBEDDING.HIGH.slice(0, 7)
    case METRIC_SCORE_FUZZ:
      return METRIC_COLORS.SCORE_FUZZ.HIGH.slice(0, 7)
    case METRIC_SCORE_DETECTION:
      return METRIC_COLORS.SCORE_DETECTION.HIGH.slice(0, 7)
    case METRIC_QUALITY_SCORE:
      return METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH.slice(0, 7)
    default:
      return '#6b7280'  // Default gray
  }
}

// ============================================================================
// SELECTION STATE COLORS
// ============================================================================

/**
 * Get mode-specific selection colors based on tag colors
 *
 * @param mode - The table mode (feature/pair/cause)
 * @returns Object mapping selection categories to hex colors
 */
export function getSelectionColors(mode: TableMode): {
  confirmed: string
  expanded: string
  rejected: string
  autoRejected: string
  unsure: string
} {

  if (mode === 'feature') {
    // Quality Assessment stage
    const colors = getBadgeColors(TAG_CATEGORY_QUALITY)
    return {
      confirmed: colors['Well-Explained'] || '#009E73',      // Green
      expanded: colors['Well-Explained'] || '#009E73',       // Green (stripe added in render)
      rejected: colors['Need Revision'] || '#999999',        // Gray
      autoRejected: colors['Need Revision'] || '#999999',    // Gray (stripe added in render)
      unsure: UNSURE_GRAY
    }
  } else if (mode === 'pair') {
    // Feature Splitting stage
    const colors = getBadgeColors(TAG_CATEGORY_FEATURE_SPLITTING)
    return {
      confirmed: colors['Fragmented'] || '#F0E442',          // Yellow
      expanded: colors['Fragmented'] || '#F0E442',           // Yellow (stripe added in render)
      rejected: colors['Monosemantic'] || '#999999',         // Gray
      autoRejected: colors['Monosemantic'] || '#999999',     // Gray (stripe added in render)
      unsure: UNSURE_GRAY
    }
  } else {
    // Cause Analysis stage - 3 cause categories
    const colors = getBadgeColors(TAG_CATEGORY_CAUSE)
    return {
      confirmed: colors['Noisy Activation'] || '#CC79A7',    // Purple
      expanded: colors['Missed Lexicon'] || '#E69F00',       // Orange
      rejected: colors['Missed Context'] || '#D55E00',       // Vermillion
      autoRejected: colors['Missed Context'] || '#D55E00',   // Vermillion
      unsure: UNSURE_GRAY
    }
  }
}

// ============================================================================
// TABLE COLOR UTILITIES (from table-color-utils.ts)
// ============================================================================

/**
 * Table mode types
 */
export type TableMode = 'feature' | 'pair' | 'cause'

/**
 * Selection state types
 */
export type SelectionState = 'selected' | 'rejected' | null | undefined

/**
 * Selection source types
 */
export type SelectionSource = 'manual' | 'auto' | null | undefined

/**
 * Get row background color based on selection state and source using mode-specific tag colors
 *
 * Color Rules:
 * - Confirmed (manual selected): Mode-specific confirmed color (tag color)
 * - Expanded (auto selected): Mode-specific expanded color (same as confirmed, stripe added via CSS)
 * - Rejected (manual rejected): Mode-specific rejected color (tag color)
 * - Auto-Rejected: Mode-specific auto-rejected color (same as rejected, stripe added via CSS)
 * - Unsure: null (no background color)
 *
 * @param selectionState - The selection state ('selected', 'rejected', or null)
 * @param selectionSource - The source ('manual', 'auto', or null)
 * @param mode - The table mode ('feature', 'pair', or 'cause')
 * @returns The hex color string or null if unsure
 */
export function getRowBackgroundColor(
  selectionState: SelectionState,
  selectionSource: SelectionSource,
  mode: TableMode
): string | null {
  const colors = getSelectionColors(mode)

  if (selectionState === 'selected') {
    // Manual or auto selected
    if (selectionSource === 'auto') {
      return colors.expanded
    } else {
      return colors.confirmed
    }
  } else if (selectionState === 'rejected') {
    // Manual or auto rejected
    if (selectionSource === 'auto') {
      return colors.autoRejected
    } else {
      return colors.rejected
    }
  }

  // Unsure state - no background color
  return null
}

/**
 * Add opacity to a hex color
 * Converts #RRGGBB to #RRGGBBAA (hex with alpha)
 *
 * @param hex - The hex color string (e.g., '#3b82f6')
 * @param opacity - Opacity value 0-1 (e.g., 0.3 for 30%)
 * @returns Hex color with alpha channel (e.g., '#3b82f64D')
 */
export function addOpacityToHex(hex: string, opacity: number): string {
  // Remove '#' if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex

  // Convert opacity (0-1) to hex (00-FF)
  const alpha = Math.round(opacity * 255)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()

  return `#${cleanHex}${alphaHex}`
}

/**
 * Generate CSS custom properties for row styling
 * Used to set both border color (full opacity) and background color (30% opacity)
 *
 * @param color - The base hex color (e.g., '#3b82f6')
 * @returns Object with CSS custom property values
 */
export function getRowStyleProperties(color: string | null): {
  '--row-color': string
  '--row-bg-color': string
} {
  if (!color) {
    // No color - return transparent
    return {
      '--row-color': 'transparent',
      '--row-bg-color': 'transparent'
    }
  }

  return {
    '--row-color': color,                      // Full opacity for borders
    '--row-bg-color': addOpacityToHex(color, 0.3)  // 30% opacity for background
  }
}

/**
 * Get CSS class name for row based on selection state
 *
 * @param selectionState - The selection state
 * @param selectionSource - The source
 * @returns CSS class name (e.g., 'table-panel__sub-row--confirmed')
 */
export function getRowCategoryClass(
  selectionState: SelectionState,
  selectionSource: SelectionSource
): string {
  if (selectionState === 'selected') {
    return selectionSource === 'auto'
      ? 'table-panel__sub-row--expanded'
      : 'table-panel__sub-row--confirmed'
  } else if (selectionState === 'rejected') {
    return selectionSource === 'auto'
      ? 'table-panel__sub-row--autoRejected'
      : 'table-panel__sub-row--rejected'
  }
  return ''  // No class for unsure state
}

// ============================================================================
// STRIPE PATTERN UTILITIES
// ============================================================================

/**
 * Generate an SVG stripe pattern for auto-tagging preview indicators
 * Used in SelectionBar and ScrollableItemList headers
 *
 * @param patternId - Unique ID for the SVG pattern (must be unique per page)
 * @param stripeColor - Color of the stripes (typically UNSURE_GRAY)
 * @returns JSX element with SVG pattern overlay
 */
export function createStripePattern(
  patternId: string,
  stripeColor: string
): React.ReactElement {
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="8" fill={stripeColor} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
