/**
 * Shared constants for SAE Feature Visualization Frontend
 *
 * This file contains constants that are used across multiple files (4+ references).
 * Component-specific constants should be co-located with their usage.
 * Maintains alignment with backend constants for better maintainability.
 */

// ============================================================================
// CATEGORY TYPES - Must match backend data_constants.py
// Used across: types.ts, utils.ts, threshold-utils.ts, d3-sankey-utils.ts, split-rule-builders.ts (5+ files)
// ============================================================================
export const CATEGORY_ROOT = "root"
export const CATEGORY_FEATURE_SPLITTING = "feature_splitting"
export const CATEGORY_SEMANTIC_SIMILARITY = "semantic_similarity"
export const CATEGORY_CONSISTENCY = "consistency"

export const CATEGORY_TYPES = {
  ROOT: CATEGORY_ROOT,
  FEATURE_SPLITTING: CATEGORY_FEATURE_SPLITTING,
  SEMANTIC_SIMILARITY: CATEGORY_SEMANTIC_SIMILARITY,
  CONSISTENCY: CATEGORY_CONSISTENCY
} as const

// ============================================================================
// SPLIT RULE TYPES - Must match backend data_constants.py
// Used across: types.ts, threshold-utils.ts, dynamic-tree-builder.ts (3+ files)
// ============================================================================
export const SPLIT_TYPE_RANGE = "range"
export const SPLIT_TYPE_PATTERN = "pattern"
export const SPLIT_TYPE_EXPRESSION = "expression"

export const SPLIT_TYPES = {
  RANGE: SPLIT_TYPE_RANGE,
  PATTERN: SPLIT_TYPE_PATTERN,
  EXPRESSION: SPLIT_TYPE_EXPRESSION
} as const

// ============================================================================
// PATTERN MATCH STATES - Must match backend data_constants.py
// Used across: types.ts and other pattern-related files
// ============================================================================
export const PATTERN_STATE_HIGH = "high"
export const PATTERN_STATE_LOW = "low"
export const PATTERN_STATE_IN_RANGE = "in_range"
export const PATTERN_STATE_OUT_RANGE = "out_range"

export const PATTERN_STATES = {
  HIGH: PATTERN_STATE_HIGH,
  LOW: PATTERN_STATE_LOW,
  IN_RANGE: PATTERN_STATE_IN_RANGE,
  OUT_RANGE: PATTERN_STATE_OUT_RANGE
} as const

// ============================================================================
// METRIC TYPES - Must match backend data_constants.py
// Used across: types.ts, utils.ts, threshold-utils.ts, store.ts (5+ files)
// ============================================================================
export const METRIC_FEATURE_SPLITTING = "feature_splitting"
export const METRIC_SEMSIM_MEAN = "semsim_mean"
export const METRIC_SEMSIM_MAX = "semsim_max"
export const METRIC_SCORE_FUZZ = "score_fuzz"
export const METRIC_SCORE_SIMULATION = "score_simulation"
export const METRIC_SCORE_DETECTION = "score_detection"
export const METRIC_SCORE_EMBEDDING = "score_embedding"

export const METRIC_TYPES = {
  FEATURE_SPLITTING: METRIC_FEATURE_SPLITTING,
  SEMSIM_MEAN: METRIC_SEMSIM_MEAN,
  SEMSIM_MAX: METRIC_SEMSIM_MAX,
  SCORE_FUZZ: METRIC_SCORE_FUZZ,
  SCORE_SIMULATION: METRIC_SCORE_SIMULATION,
  SCORE_DETECTION: METRIC_SCORE_DETECTION,
  SCORE_EMBEDDING: METRIC_SCORE_EMBEDDING
} as const

// ============================================================================
// PANEL CONFIGURATION
// Used across: types.ts, SankeyDiagram.tsx, store.ts (3+ files)
// ============================================================================
export const PANEL_LEFT = "left"
export const PANEL_RIGHT = "right"

export const PANEL_SIDES = {
  LEFT: PANEL_LEFT,
  RIGHT: PANEL_RIGHT
} as const

// ============================================================================
// CONSISTENCY TYPES - Table consistency type identifiers
// Used across: types.ts, d3-table-utils.ts, TablePanel.tsx, ConsistencyPanel.tsx, threshold-utils.ts, store.ts (6+ files)
// ============================================================================
export const CONSISTENCY_TYPE_NONE = "none"
export const CONSISTENCY_TYPE_LLM_SCORER = "llm_scorer_consistency"
export const CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC = "within_explanation_metric_consistency"
export const CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC = "cross_explanation_metric_consistency"
export const CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE = "cross_explanation_overall_score_consistency"
export const CONSISTENCY_TYPE_LLM_EXPLAINER = "llm_explainer_consistency"

export const CONSISTENCY_TYPES = {
  NONE: CONSISTENCY_TYPE_NONE,
  LLM_SCORER: CONSISTENCY_TYPE_LLM_SCORER,
  WITHIN_EXPLANATION_METRIC: CONSISTENCY_TYPE_WITHIN_EXPLANATION_METRIC,
  CROSS_EXPLANATION_METRIC: CONSISTENCY_TYPE_CROSS_EXPLANATION_METRIC,
  CROSS_EXPLANATION_OVERALL_SCORE: CONSISTENCY_TYPE_CROSS_EXPLANATION_OVERALL_SCORE,
  LLM_EXPLAINER: CONSISTENCY_TYPE_LLM_EXPLAINER
} as const

// ============================================================================
// DISPLAY NAMES - Centralized UI string mappings
// Used across: utils.ts, HistogramPopover.tsx, and other UI components (3+ files)
// ============================================================================
export const CATEGORY_DISPLAY_NAMES = {
  [CATEGORY_ROOT]: "All Features",
  [CATEGORY_FEATURE_SPLITTING]: "Feature Splitting",
  [CATEGORY_SEMANTIC_SIMILARITY]: "Semantic Similarity",
  [CATEGORY_CONSISTENCY]: "Consistency"
} as const

export const METRIC_DISPLAY_NAMES = {
  [METRIC_FEATURE_SPLITTING]: "Feature Splitting",
  [METRIC_SEMSIM_MEAN]: "Semantic Similarity (Mean)",
  [METRIC_SEMSIM_MAX]: "Semantic Similarity (Max)",
  [METRIC_SCORE_FUZZ]: "Fuzz Score",
  [METRIC_SCORE_SIMULATION]: "Simulation Score",
  [METRIC_SCORE_DETECTION]: "Detection Score",
  [METRIC_SCORE_EMBEDDING]: "Embedding Score"
} as const

// ============================================================================
// ACADEMIC VISUALIZATION COLOR SCHEMES (EuroVIS/IEEE VIS Standards)
// Colorblind-friendly palettes for research papers and conference demonstrations
// ============================================================================

/**
 * Okabe-Ito Palette (Recommended for EuroVIS/IEEE VIS submissions)
 * Source: Masataka Okabe and Kei Ito, Color Universal Design (CUD)
 * - Accessible to people with all forms of color vision deficiency
 * - 8 vivid colors corresponding to major primary and secondary colors
 */
export const OKABE_ITO_PALETTE = {
  BLACK: '#000000',
  ORANGE: '#E69F00',
  SKY_BLUE: '#56B4E9',
  BLUISH_GREEN: '#009E73',
  YELLOW: '#F0E442',
  BLUE: '#0072B2',
  VERMILLION: '#D55E00',
  REDDISH_PURPLE: '#CC79A7',
  GRAY: '#999999'
} as const

/**
 * Paul Tol Bright Palette (Recommended for EuroVIS/IEEE VIS submissions)
 * Source: Paul Tol's Technical Note (SRON)
 * - Colorblind-safe qualitative scheme with 7 colors
 * - Distinct for all viewers including colorblind readers
 * - Optimized for both screen and print
 */
export const PAUL_TOL_BRIGHT = {
  BLUE: '#4477AA',
  CYAN: '#66CCEE',
  GREEN: '#228833',
  YELLOW: '#CCBB44',
  RED: '#EE6677',
  PURPLE: '#AA3377',
  GRAY: '#BBBBBB'
} as const

/**
 * EuroVIS Research Palette (Custom for this project)
 * Based on colorblind-friendly principles using Okabe-Ito and Paul Tol colors
 */
export const EUROVIS_PALETTE = {
  // Primary colors from Okabe-Ito
  PRIMARY_BLUE: OKABE_ITO_PALETTE.BLUE,           // #0072B2
  PRIMARY_ORANGE: OKABE_ITO_PALETTE.ORANGE,       // #E69F00
  PRIMARY_GREEN: OKABE_ITO_PALETTE.BLUISH_GREEN,  // #009E73
  PRIMARY_PURPLE: OKABE_ITO_PALETTE.REDDISH_PURPLE, // #CC79A7

  // Secondary colors from Paul Tol
  SECONDARY_CYAN: PAUL_TOL_BRIGHT.CYAN,           // #66CCEE
  SECONDARY_YELLOW: PAUL_TOL_BRIGHT.YELLOW,       // #CCBB44
  SECONDARY_RED: PAUL_TOL_BRIGHT.RED,             // #EE6677

  // Neutral colors
  NEUTRAL_GRAY: OKABE_ITO_PALETTE.GRAY,           // #999999
  NEUTRAL_BLACK: OKABE_ITO_PALETTE.BLACK          // #000000
} as const

/**
 * Neutral Icon Colors for UI Elements
 * Used for icons, badges, and UI components to avoid competing with data visualization colors
 *
 * COLOR USAGE HIERARCHY:
 * - Vibrant colors (Okabe-Ito/Paul Tol): Reserved for data encoding (metrics, categories, flows)
 * - Neutral colors (grayscale): Used for UI elements, icons, controls, labels
 *
 * This separation ensures color remains an effective encoding channel for data visualization
 */
export const NEUTRAL_ICON_COLORS = {
  // Icon fills and strokes
  ICON_FILL: '#6b7280',        // Medium gray - main icon color
  ICON_STROKE: '#475569',      // Dark gray - icon outlines
  ICON_LIGHT: '#94a3b8',       // Light gray - secondary elements

  // Backgrounds
  BACKGROUND_LIGHT: '#f8fafc', // Very light gray - icon backgrounds
  BACKGROUND_MEDIUM: '#f1f5f9', // Light gray - card backgrounds

  // Borders
  BORDER_LIGHT: '#e2e8f0',     // Light gray - subtle borders
  BORDER_MEDIUM: '#cbd5e1',    // Medium gray - default borders

  // Badges and labels
  BADGE_BACKGROUND: '#475569', // Dark gray - badge backgrounds
  BADGE_TEXT: '#ffffff',       // White - badge text

  // Text
  TEXT_PRIMARY: '#1f2937',     // Near black - primary text
  TEXT_SECONDARY: '#64748b'    // Medium gray - secondary text
} as const

// ============================================================================
// METRIC-SPECIFIC COLORS - Opacity-based gradients for score metrics
// Based on Okabe-Ito colorblind-safe palette
// Uses same opacity pattern as consistency colors: white (low) → color (high)
// ============================================================================

/**
 * Metric score gradient colors: white (low) → color (high)
 * Each metric has its own distinct color gradient using opacity
 *
 * Uses hex color with alpha channel for systematic color blending:
 * - LOW: 00 (0% opacity - transparent, white background shows through)
 * - MEDIUM: 80 (50% opacity - blended with white background)
 * - HIGH: FF (100% opacity - full color)
 *
 * Format: PALETTE.COLOR + hex_alpha → #RRGGBBAA
 */
export const METRIC_COLORS = {
  FEATURE_SPLITTING: OKABE_ITO_PALETTE.GRAY,

  SEMANTIC_SIMILARITY: OKABE_ITO_PALETTE.GRAY,

  // Embedding Score: Blue gradient (Okabe-Ito Blue)
  SCORE_EMBEDDING: {
    LOW: OKABE_ITO_PALETTE.BLUE + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.BLUE + '80', // 50% opacity (light blue)
    HIGH: OKABE_ITO_PALETTE.BLUE + 'FF'    // 100% opacity (full blue #0072B2)
  },

  // Fuzz Score: Orange-Red gradient (Okabe-Ito Vermillion)
  SCORE_FUZZ: {
    LOW: OKABE_ITO_PALETTE.ORANGE + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.ORANGE + '80', // 50% opacity (light orange-red)
    HIGH: OKABE_ITO_PALETTE.ORANGE + 'FF'    // 100% opacity (full vermillion #D55E00)
  },

  // Detection Score: Green gradient (Paul Tol Green)
  SCORE_DETECTION: {
    LOW: PAUL_TOL_BRIGHT.GREEN + '00',    // 0% opacity (transparent/white)
    MEDIUM: PAUL_TOL_BRIGHT.GREEN + '80', // 50% opacity (light green)
    HIGH: PAUL_TOL_BRIGHT.GREEN + 'FF'    // 100% opacity (full green #228833)
  }
} as const

// ============================================================================
// CONSISTENCY COLORS - Professional single-color gradients (white to color)
// Used for visualizing consistency metrics in TablePanel
// Based on colorblind-friendly Okabe-Ito and Paul Tol palettes
// ============================================================================

/**
 * Consistency gradient colors: white (low) → color (high)
 * Each consistency type has its own distinct single-color gradient using opacity
 * Following professional visualization conference standards
 *
 * Uses hex color with alpha channel for systematic color blending:
 * - LOW: 00 (0% opacity - transparent, white background shows through)
 * - MEDIUM: 80 (50% opacity - blended with white background)
 * - HIGH: FF (100% opacity - full color)
 *
 * Format: PALETTE.COLOR + hex_alpha → #RRGGBBAA
 */
export const CONSISTENCY_COLORS = {
  // LLM Scorer Consistency: Sky Blue gradient (Okabe-Ito Sky Blue)
  LLM_SCORER: {
    LOW: OKABE_ITO_PALETTE.SKY_BLUE + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.SKY_BLUE + '80', // 50% opacity (light blue)
    HIGH: OKABE_ITO_PALETTE.SKY_BLUE + 'FF'    // 100% opacity (full sky blue)
  },

  // Within-explanation Score Consistency: Purple gradient (Okabe-Ito Reddish Purple)
  WITHIN_EXPLANATION: {
    LOW: OKABE_ITO_PALETTE.REDDISH_PURPLE + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.REDDISH_PURPLE + '80', // 50% opacity (light purple)
    HIGH: OKABE_ITO_PALETTE.REDDISH_PURPLE + 'FF'    // 100% opacity (full reddish purple)
  },

  // Cross-explanation Score Consistency: Orange gradient (Okabe-Ito Orange)
  CROSS_EXPLANATION: {
    LOW: OKABE_ITO_PALETTE.VERMILLION + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.VERMILLION + '80', // 50% opacity (light orange)
    HIGH: OKABE_ITO_PALETTE.VERMILLION + 'FF'    // 100% opacity (full orange)
  },

  // Cross-explanation Overall Score Consistency: Yellow gradient (Okabe-Ito Yellow)
  CROSS_EXPLANATION_OVERALL: {
    LOW: OKABE_ITO_PALETTE.YELLOW + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.YELLOW + '80', // 50% opacity (light yellow)
    HIGH: OKABE_ITO_PALETTE.YELLOW + 'FF'    // 100% opacity (full yellow)
  },

  // LLM Explainer Consistency: Green gradient (Okabe-Ito Bluish Green)
  LLM_EXPLAINER: {
    LOW: OKABE_ITO_PALETTE.BLUISH_GREEN + '00',    // 0% opacity (transparent/white)
    MEDIUM: OKABE_ITO_PALETTE.BLUISH_GREEN + '80', // 50% opacity (light green)
    HIGH: OKABE_ITO_PALETTE.BLUISH_GREEN + 'FF'    // 100% opacity (full bluish green)
  }
} as const

// ============================================================================
// OVERALL SCORE COLORS - Performance gradient for overall scores
// Used in simplified TablePanel for displaying overall scores
// White (low performance) → Dark Gray (high performance)
// ============================================================================

/**
 * Overall score gradient colors: white (low) → dark gray (high)
 * Used for visualizing overall scores (0-1 range)
 * Higher overall scores = more intense dark gray color
 *
 * Uses hex color with alpha channel for opacity encoding:
 * - LOW: 00 (0% opacity - transparent, white background shows through)
 * - MEDIUM: 80 (50% opacity - medium gray)
 * - HIGH: FF (100% opacity - full dark gray)
 */
export const OVERALL_SCORE_COLORS = {
  LOW: '#1f293700',    // 0% opacity (transparent/white) - 0.0 score
  MEDIUM: '#1f293780', // 50% opacity (medium gray) - 0.5 score
  HIGH: '#1f2937FF'    // 100% opacity (dark gray) - 1.0 score
} as const

// ============================================================================
// COMPONENT TYPE COLORS - Centralized color mapping for SAE components
// Updated to use neutral grayscale for UI elements (Explainer, Scorer)
// Vibrant colors reserved for data encoding only
// Used across: FlowPanel.tsx, HistogramPanel.tsx, d3-flow-utils.ts (3+ files)
// ============================================================================
export const COMPONENT_COLORS = {
  // Metric-specific colors (full opacity for FlowPanel node backgrounds)
  FEATURE_SPLITTING: METRIC_COLORS.FEATURE_SPLITTING,
  SEMANTIC_SIMILARITY: METRIC_COLORS.SEMANTIC_SIMILARITY,
  SCORE_EMBEDDING: METRIC_COLORS.SCORE_EMBEDDING.HIGH,     // Full blue
  SCORE_FUZZ: METRIC_COLORS.SCORE_FUZZ.HIGH,               // Full orange-red
  SCORE_DETECTION: METRIC_COLORS.SCORE_DETECTION.HIGH,     // Full green
} as const

// ============================================================================
// LLM ICON SVG PATHS - Reusable icon definitions for LLM components
// Used across: FlowPanel.tsx
// ============================================================================

export const LLM_EXPLAINER_ICON_SVG = `
  <!-- Simple speech bubble - selection indicator for LLM Explainer -->
  <!-- Bubble body (24x18 rounded rectangle centered at origin) -->
  <rect x="-12" y="-12" width="24" height="18" rx="4" fill="#3b82f6" />
  <!-- Bubble tail (triangle pointing to left bottom corner) -->
  <path d="M -3 6 L -6 12 L 1 6 Z" fill="#3b82f6" />
`

export const LLM_SCORER_ICON_SVG = `
  <!-- Simple puzzle piece - selection indicator for LLM Scorer -->
  <!-- Single path defining entire puzzle piece outline with concave bottom -->
  <!-- 24x24 square with deeper arms (radius 5), whole piece shifted up 1px, right arm additional 2px up -->
  <path d="
    M -12 -15
    L -5 -15
    A 5 5 0 0 0 5 -15
    L 12 -15
    L 12 -8
    A 5 5 0 0 1 12 2
    L 12 9
    L 5 9
    A 5 5 0 0 1 -5 9
    L -12 9
    Z
  " fill="#3b82f6" />
`

// ============================================================================
// TYPE EXPORTS - For better TypeScript integration
// ============================================================================
export type CategoryTypeValue = typeof CATEGORY_TYPES[keyof typeof CATEGORY_TYPES]
export type SplitTypeValue = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES]
export type PatternStateValue = typeof PATTERN_STATES[keyof typeof PATTERN_STATES]
export type MetricTypeValue = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]
export type PanelSideValue = typeof PANEL_SIDES[keyof typeof PANEL_SIDES]
export type ConsistencyTypeValue = typeof CONSISTENCY_TYPES[keyof typeof CONSISTENCY_TYPES]