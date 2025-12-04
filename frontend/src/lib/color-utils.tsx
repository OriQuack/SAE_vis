// ============================================================================
// COLOR UTILITIES - Centralized color logic for all components
// Merged from constants.ts and table-color-utils.ts for clear separation
// ============================================================================

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
 * Get stage-specific selection colors based on tag colors
 *
 * @param stage - The stage ('stage1' | 'stage2' | 'stage3')
 * @returns Object mapping selection categories to hex colors
 */
export function getSelectionColors(stage: TableStage): {
  confirmed: string
  expanded: string
  rejected: string
  autoRejected: string
  unsure: string
} {

  if (stage === 'stage1') {
    // Stage 1: Feature Splitting (pairs)
    const colors = getBadgeColors(TAG_CATEGORY_FEATURE_SPLITTING)
    return {
      confirmed: colors['Fragmented'] || '#F0E442',          // Yellow
      expanded: colors['Fragmented'] || '#F0E442',           // Yellow (stripe added in render)
      rejected: colors['Monosemantic'] || '#999999',         // Gray
      autoRejected: colors['Monosemantic'] || '#999999',     // Gray (stripe added in render)
      unsure: UNSURE_GRAY
    }
  } else if (stage === 'stage2') {
    // Stage 2: Quality Assessment (features)
    const colors = getBadgeColors(TAG_CATEGORY_QUALITY)
    return {
      confirmed: colors['Well-Explained'] || '#009E73',      // Green
      expanded: colors['Well-Explained'] || '#009E73',       // Green (stripe added in render)
      rejected: colors['Need Revision'] || '#999999',        // Gray
      autoRejected: colors['Need Revision'] || '#999999',    // Gray (stripe added in render)
      unsure: UNSURE_GRAY
    }
  } else {
    // Stage 3: Cause Analysis - TODO: implement stage 3 colors
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
 * Table stage types
 * - stage1: Feature Splitting (pairs)
 * - stage2: Quality Assessment (features)
 * - stage3: Cause Analysis (features) - TODO
 */
export type TableStage = 'stage1' | 'stage2' | 'stage3'

/**
 * @deprecated Use TableStage instead
 */
export type TableMode = TableStage

/**
 * Selection state types
 */
export type SelectionState = 'selected' | 'rejected' | null | undefined

/**
 * Selection source types
 */
export type SelectionSource = 'manual' | 'auto' | null | undefined

/**
 * Get row background color based on selection state and source using stage-specific tag colors
 *
 * Color Rules:
 * - Confirmed (manual selected): Stage-specific confirmed color (tag color)
 * - Expanded (auto selected): Stage-specific expanded color (same as confirmed, stripe added via CSS)
 * - Rejected (manual rejected): Stage-specific rejected color (tag color)
 * - Auto-Rejected: Stage-specific auto-rejected color (same as rejected, stripe added via CSS)
 * - Unsure: null (no background color)
 *
 * @param selectionState - The selection state ('selected', 'rejected', or null)
 * @param selectionSource - The source ('manual', 'auto', or null)
 * @param stage - The table stage ('stage1', 'stage2', or 'stage3')
 * @returns The hex color string or null if unsure
 */
export function getRowBackgroundColor(
  selectionState: SelectionState,
  selectionSource: SelectionSource,
  stage: TableStage
): string | null {
  const colors = getSelectionColors(stage)

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
// SEMANTIC SIMILARITY COLORS
// ============================================================================

/**
 * Color scale for semantic similarity scores (0-1)
 * Used in ExplainerComparisonGrid and TableExplanation for highlighting
 *
 * Design: Teal tones (blue-shifted green) - softer than cyan, distinct from tag green
 */
export const SEMANTIC_SIMILARITY_COLORS = {
  HIGH: '#1a8a8a',      // ≥ 0.85 - Deep blue-teal (high match)
  MEDIUM: '#5ab5a8',    // ≥ 0.70 - Medium teal-green
  LOW: '#c2e4dc',       // ≥ 0.60 - Pale seafoam
  NONE: '#f3f4f6'       // < 0.60 - Default gray
}

/**
 * Get color for semantic similarity score
 * Used for explainer comparison grid diamonds and explanation segment highlights
 *
 * @param similarity - Similarity score (0-1)
 * @returns CSS color string
 */
export function getSemanticSimilarityColor(similarity: number): string {
  if (similarity >= 0.85) {
    return SEMANTIC_SIMILARITY_COLORS.HIGH
  } else if (similarity >= 0.7) {
    return SEMANTIC_SIMILARITY_COLORS.MEDIUM
  } else if (similarity >= 0.6) {
    return SEMANTIC_SIMILARITY_COLORS.LOW
  } else {
    return SEMANTIC_SIMILARITY_COLORS.NONE
  }
}

// ============================================================================
// STRIPE PATTERN UTILITIES
// ============================================================================

/**
 * Stripe pattern configuration - single source of truth for all stripe patterns
 * Used in SelectionBar and ScrollableItemList for CSS gradient stripes
 */
export const STRIPE_PATTERN = {
  width: 12,
  height: 12,
  stripeWidth: 6,
  rotation: 45,
  opacity: 0.3
}
