// ============================================================================
// CATEGORY TYPES - Must match backend data_constants.py
// Used across: types.ts, utils.ts, threshold-utils.ts, d3-sankey-utils.ts, split-rule-builders.ts (5+ files)
// ============================================================================
export const CATEGORY_ROOT = "root"
export const CATEGORY_DECODER_SIMILARITY = "decoder_similarity"
export const CATEGORY_SEMANTIC_SIMILARITY = "semantic_similarity"

// ============================================================================
// METRIC TYPES - Must match backend data_constants.py
// Used across: types.ts, utils.ts, threshold-utils.ts, store.ts (5+ files)
// ============================================================================
export const METRIC_DECODER_SIMILARITY = "decoder_similarity"
export const METRIC_SEMANTIC_SIMILARITY = "semantic_similarity"
export const METRIC_SCORE_FUZZ = "score_fuzz"
export const METRIC_SCORE_DETECTION = "score_detection"
export const METRIC_SCORE_EMBEDDING = "score_embedding"

// Computed metric
export const METRIC_QUALITY_SCORE = "quality_score"

export const METRIC_TYPES = {
  DECODER_SIMILARITY: METRIC_DECODER_SIMILARITY,
  SEMANTIC_SIMILARITY: METRIC_SEMANTIC_SIMILARITY,
  SCORE_FUZZ: METRIC_SCORE_FUZZ,
  SCORE_DETECTION: METRIC_SCORE_DETECTION,
  SCORE_EMBEDDING: METRIC_SCORE_EMBEDDING,
  QUALITY_SCORE: METRIC_QUALITY_SCORE
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
// CUSTOM THRESHOLDS - Per-metric custom threshold configurations
// Used for creating custom value splits with explicit threshold boundaries
// ============================================================================
export const CONSISTENCY_THRESHOLDS = {
  [METRIC_QUALITY_SCORE]: [0.5]  // 2 bins for Quality Score (computed metric)
} as const

// ============================================================================
// DISPLAY NAMES - Centralized UI string mappings
// Used across: utils.ts, HistogramPopover.tsx, and other UI components (3+ files)
// ============================================================================
export const CATEGORY_DISPLAY_NAMES = {
  [CATEGORY_ROOT]: "All Features",
  [CATEGORY_DECODER_SIMILARITY]: "Decoder Similarity",
  [CATEGORY_SEMANTIC_SIMILARITY]: "Semantic Similarity"
} as const

export const METRIC_DISPLAY_NAMES = {
  [METRIC_DECODER_SIMILARITY]: "Decoder Similarity",
  [METRIC_SEMANTIC_SIMILARITY]: "Semantic Similarity",
  [METRIC_SCORE_FUZZ]: "Fuzz Score",
  [METRIC_SCORE_DETECTION]: "Detection Score",
  [METRIC_SCORE_EMBEDDING]: "Embedding Score",
  [METRIC_QUALITY_SCORE]: "Quality Score"
} as const

// ============================================================================
// ACADEMIC VISUALIZATION COLOR SCHEMES (EuroVIS/IEEE VIS Standards)
// Colorblind-friendly palettes for research papers and conference demonstrations
// ============================================================================
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
// THRESHOLD REGION COLORS - User-friendly colors for histogram threshold regions
// Used to indicate good/bad feature quality based on metric type
// Uses lower opacity (60%) for subtle visual distinction
//
// @deprecated - Now using hierarchical color system with perceptually-optimized palettes.
// Child nodes get colors from HierarchicalColorAssigner based on parent color spheres.
// Kept for backward compatibility only.
// ============================================================================
export const THRESHOLD_COLORS = {
  RED: PAUL_TOL_BRIGHT.RED + 'FF',      // Normal red with 60% opacity - Used for "bad" regions
  GREEN: OKABE_ITO_PALETTE.BLUISH_GREEN + 'FF'    // Green with 60% opacity - Used for "good" regions
} as const

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

// ============================================================================
// METRIC-SPECIFIC COLORS - Opacity-based gradients for score metrics
// Based on Okabe-Ito colorblind-safe palette
// Uses same opacity pattern as consistency colors: white (low) → color (high)
//
// NOTE: With hierarchical color system, these are now primarily used as fallback colors.
// Sankey nodes and histogram segments use colors from HierarchicalColorAssigner.
// Still used for: threshold lines, node borders, and when hierarchical colors unavailable.
// ============================================================================
export const METRIC_COLORS = {
  DECODER_SIMILARITY: PAUL_TOL_BRIGHT.BLUE,

  SEMANTIC_SIMILARITY: PAUL_TOL_BRIGHT.GREEN,

  // Embedding Score: Blue gradient (Okabe-Ito Blue)
  SCORE_EMBEDDING: {
    LOW: PAUL_TOL_BRIGHT.PURPLE + '00',    // 0% opacity (transparent/white)
    MEDIUM: PAUL_TOL_BRIGHT.PURPLE + '80', // 50% opacity (light blue)
    HIGH: PAUL_TOL_BRIGHT.PURPLE + 'FF'    // 100% opacity (full blue #0072B2)
  },

  // Fuzz Score: Orange-Red gradient (Okabe-Ito Vermillion)
  SCORE_FUZZ: {
    LOW: PAUL_TOL_BRIGHT.YELLOW + '00',    // 0% opacity (transparent/white)
    MEDIUM: PAUL_TOL_BRIGHT.YELLOW + '80', // 50% opacity (light orange-red)
    HIGH: PAUL_TOL_BRIGHT.YELLOW + 'FF'    // 100% opacity (full vermillion #D55E00)
  },

  // Detection Score: Green gradient (Paul Tol Green)
  SCORE_DETECTION: {
    LOW: PAUL_TOL_BRIGHT.CYAN + '00',    // 0% opacity (transparent/white)
    MEDIUM: PAUL_TOL_BRIGHT.CYAN + '80', // 50% opacity (light green)
    HIGH: PAUL_TOL_BRIGHT.CYAN + 'FF'    // 100% opacity (full green #228833)
  },

  QUALITY_SCORE_COLORS: {
    LOW: PAUL_TOL_BRIGHT.GRAY + '00',    // 0% opacity (transparent/white) - 0.0 score
    MEDIUM: PAUL_TOL_BRIGHT.GRAY + '80', // 50% opacity (medium gray) - 0.5 score
    HIGH: PAUL_TOL_BRIGHT.GRAY + 'FF'   // 100% opacity (dark gray) - 1.0 score
  }
} as const

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
    case METRIC_SEMANTIC_SIMILARITY:
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
// COMPONENT TYPE COLORS - Centralized color mapping for SAE components
// Updated to use neutral grayscale for UI elements (Explainer, Scorer)
// Vibrant colors reserved for data encoding only
// Used across: FlowPanel.tsx, HistogramPanel.tsx, d3-flow-utils.ts (3+ files)
// ============================================================================
export const COMPONENT_COLORS = {
  // Metric-specific colors (full opacity for FlowPanel node backgrounds)
  DECODER_SIMILARITY: METRIC_COLORS.DECODER_SIMILARITY,
  SEMANTIC_SIMILARITY: METRIC_COLORS.SEMANTIC_SIMILARITY,
  SCORE_EMBEDDING: METRIC_COLORS.SCORE_EMBEDDING.HIGH,     // Full blue
  SCORE_FUZZ: METRIC_COLORS.SCORE_FUZZ.HIGH,               // Full orange-red
  SCORE_DETECTION: METRIC_COLORS.SCORE_DETECTION.HIGH,     // Full green
  QUALITY_SCORE: METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH,  // Full dark gray
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