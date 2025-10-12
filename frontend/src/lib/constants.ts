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
export const CATEGORY_SCORE_AGREEMENT = "score_agreement"

export const CATEGORY_TYPES = {
  ROOT: CATEGORY_ROOT,
  FEATURE_SPLITTING: CATEGORY_FEATURE_SPLITTING,
  SEMANTIC_SIMILARITY: CATEGORY_SEMANTIC_SIMILARITY,
  SCORE_AGREEMENT: CATEGORY_SCORE_AGREEMENT
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
// DISPLAY NAMES - Centralized UI string mappings
// Used across: utils.ts, HistogramPopover.tsx, and other UI components (3+ files)
// ============================================================================
export const CATEGORY_DISPLAY_NAMES = {
  [CATEGORY_ROOT]: "All Features",
  [CATEGORY_FEATURE_SPLITTING]: "Feature Splitting",
  [CATEGORY_SEMANTIC_SIMILARITY]: "Semantic Similarity",
  [CATEGORY_SCORE_AGREEMENT]: "Score Agreement"
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
// METRIC-SPECIFIC COLORS - Solid colors for metrics without gradients
// Based on Okabe-Ito colorblind-safe palette with custom shades
// ============================================================================
export const METRIC_COLORS = {
  // Feature Splitting - Dark Bluish Green
  FEATURE_SPLITTING: OKABE_ITO_PALETTE.BLUISH_GREEN,  

  // Semantic Similarity - Medium Vermillion
  SEMANTIC_SIMILARITY: OKABE_ITO_PALETTE.VERMILLION + '99',  // Okabe-Ito Vermillion (medium shade)

  // Score metrics - Sky Blue variants
  SCORE_FUZZ: OKABE_ITO_PALETTE.SKY_BLUE + 48,          
  SCORE_DETECTION: OKABE_ITO_PALETTE.SKY_BLUE + 48,      
  SCORE_EMBEDDING: OKABE_ITO_PALETTE.SKY_BLUE + '99',      
} as const

// ============================================================================
// COMPONENT TYPE COLORS - Centralized color mapping for SAE components
// Updated to use neutral grayscale for UI elements (Explainer, Scorer)
// Vibrant colors reserved for data encoding only
// Used across: FlowPanel.tsx, HistogramPanel.tsx, d3-flow-utils.ts (3+ files)
// ============================================================================
export const COMPONENT_COLORS = {
  DECODER: NEUTRAL_ICON_COLORS.ICON_FILL,
  EXPLAINER: NEUTRAL_ICON_COLORS.ICON_FILL,  // Changed to neutral gray
  SCORER: NEUTRAL_ICON_COLORS.ICON_FILL,     // Changed to neutral gray
  EMBEDDER: NEUTRAL_ICON_COLORS.ICON_FILL,  

  // Metric-specific colors (solid, no gradients)
  FEATURE_SPLITTING: METRIC_COLORS.FEATURE_SPLITTING,      // #006B52 - Dark bluish green
  SEMANTIC_SIMILARITY: METRIC_COLORS.SEMANTIC_SIMILARITY,  // #D55E00 - Medium vermillion
  SCORE_FUZZ: METRIC_COLORS.SCORE_FUZZ,                    // #87CEEB - Light sky blue
  SCORE_DETECTION: METRIC_COLORS.SCORE_DETECTION,          // #87CEEB - Light sky blue
  SCORE_EMBEDDING: METRIC_COLORS.SCORE_EMBEDDING,          // #56B4E9 - Medium sky blue
} as const

/**
 * Get component color by type
 * @param type - Component type identifier
 * @returns Colorblind-safe color from Okabe-Ito or Paul Tol palette
 */
export const getComponentColor = (type: 'decoder' | 'explainer' | 'scorer' | 'embedder' | 'feature_splitting'): string => {
  const colorMap = {
    decoder: COMPONENT_COLORS.DECODER,
    explainer: COMPONENT_COLORS.EXPLAINER,
    scorer: COMPONENT_COLORS.SCORER,
    embedder: COMPONENT_COLORS.EMBEDDER,
    feature_splitting: COMPONENT_COLORS.FEATURE_SPLITTING
  }
  return colorMap[type] || '#6b7280'
}

/**
 * Get metric color by type (solid colors, no gradients)
 * @param metric - Metric type identifier
 * @returns Colorblind-safe solid color
 */
export const getMetricColor = (metric: MetricTypeValue): string => {
  const colorMap = {
    feature_splitting: METRIC_COLORS.FEATURE_SPLITTING,
    semantic_similarity: METRIC_COLORS.SEMANTIC_SIMILARITY,
    semsim_mean: METRIC_COLORS.SEMANTIC_SIMILARITY,
    semsim_max: METRIC_COLORS.SEMANTIC_SIMILARITY,
    score_fuzz: METRIC_COLORS.SCORE_FUZZ,
    score_detection: METRIC_COLORS.SCORE_DETECTION,
    score_embedding: METRIC_COLORS.SCORE_EMBEDDING,
    score_simulation: METRIC_COLORS.SCORE_EMBEDDING,
  }
  return colorMap[metric] || '#6b7280'
}

/**
 * Get background color with opacity for component types
 * @param type - Component type identifier
 * @param opacity - Opacity value as hex (default: '30' for 30/255 ≈ 19%)
 * @returns Color with opacity suffix
 */
export const getComponentBackgroundColor = (type: 'decoder' | 'explainer' | 'scorer' | 'embedder', opacity: string = '30'): string => {
  return `${getComponentColor(type)}${opacity}`
}

// ============================================================================
// SANKEY DIAGRAM CONFIGURATION
// Used across: SankeyDiagram.tsx, d3-sankey-utils.ts (2+ files, visualization-specific)
// ============================================================================
export const SANKEY_COLORS: Record<string, string> = {
  [CATEGORY_ROOT]: EUROVIS_PALETTE.PRIMARY_PURPLE,        // #CC79A7 - Reddish Purple
  [CATEGORY_FEATURE_SPLITTING]: EUROVIS_PALETTE.SECONDARY_CYAN,  // #66CCEE - Cyan
  [CATEGORY_SEMANTIC_SIMILARITY]: EUROVIS_PALETTE.PRIMARY_BLUE,    // #0072B2 - Blue
  [CATEGORY_SCORE_AGREEMENT]: EUROVIS_PALETTE.PRIMARY_GREEN      // #009E73 - Bluish Green
} as const

// ============================================================================
// LEGEND CONFIGURATION - Using centralized display names
// Used across: SankeyDiagram.tsx, AlluvialDiagram.tsx (2+ files, visualization-specific)
// ============================================================================
export const LEGEND_ITEMS = [
  { key: CATEGORY_ROOT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_ROOT] },
  { key: CATEGORY_FEATURE_SPLITTING, label: CATEGORY_DISPLAY_NAMES[CATEGORY_FEATURE_SPLITTING] },
  { key: CATEGORY_SEMANTIC_SIMILARITY, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SEMANTIC_SIMILARITY] },
  { key: CATEGORY_SCORE_AGREEMENT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SCORE_AGREEMENT] }
] as const

// ============================================================================
// LLM ICON SVG PATHS - Reusable icon definitions for LLM components
// Used across: FlowPanel.tsx, LLMComparisonSelection.tsx
// ============================================================================

export const LLM_EXPLAINER_ICON_SVG = `
  <!-- Speech bubble icon - represents explanation/communication -->
  <!-- Main bubble body -->
  <rect x="25" y="30" width="50" height="35" rx="6" fill="white" stroke="${NEUTRAL_ICON_COLORS.ICON_FILL}" stroke-width="2" />

  <!-- Speech bubble tail -->
  <path d="M 40 65 L 35 75 L 45 65 Z" fill="white" stroke="${NEUTRAL_ICON_COLORS.ICON_FILL}" stroke-width="2" stroke-linejoin="round" />

  <!-- Text lines inside bubble (representing explanation text) -->
  <line x1="33" y1="40" x2="67" y2="40" stroke="${NEUTRAL_ICON_COLORS.ICON_LIGHT}" stroke-width="2" stroke-linecap="round" />
  <line x1="33" y1="48" x2="67" y2="48" stroke="${NEUTRAL_ICON_COLORS.ICON_LIGHT}" stroke-width="2" stroke-linecap="round" />
  <line x1="33" y1="56" x2="55" y2="56" stroke="${NEUTRAL_ICON_COLORS.ICON_LIGHT}" stroke-width="2" stroke-linecap="round" />
`

export const LLM_SCORER_ICON_SVG = `
  <!-- Pencil icon at 45 degrees, tip pointing to bottom left - represents solving exam problems -->
  <g transform="rotate(45 50 50)">
    <!-- Pencil body (main shaft) -->
    <rect x="42" y="25" width="16" height="45" rx="2" fill="white" stroke="${NEUTRAL_ICON_COLORS.ICON_FILL}" stroke-width="2" />

    <!-- Wooden sharpened part (spiky triangular section) -->
    <path d="M 42 70 L 50 80 L 58 70 Z" fill="${NEUTRAL_ICON_COLORS.ICON_LIGHT}" stroke="${NEUTRAL_ICON_COLORS.ICON_FILL}" stroke-width="2" stroke-linejoin="miter" />

    <!-- Graphite tip (dark triangular point) -->
    <path d="M 47 77 L 50 83 L 53 77 Z" fill="${NEUTRAL_ICON_COLORS.ICON_STROKE}" />

    <!-- Eraser end (pink/light gray cap) -->
    <rect x="42" y="21" width="16" height="6" rx="1" fill="${NEUTRAL_ICON_COLORS.ICON_LIGHT}" stroke="${NEUTRAL_ICON_COLORS.ICON_FILL}" stroke-width="2" />

    <!-- Metal ferrule (band holding eraser) -->
    <rect x="42" y="25" width="16" height="3" fill="${NEUTRAL_ICON_COLORS.ICON_STROKE}" />
  </g>
`

// ============================================================================
// TYPE EXPORTS - For better TypeScript integration
// ============================================================================
export type CategoryTypeValue = typeof CATEGORY_TYPES[keyof typeof CATEGORY_TYPES]
export type SplitTypeValue = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES]
export type PatternStateValue = typeof PATTERN_STATES[keyof typeof PATTERN_STATES]
export type MetricTypeValue = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]
export type PanelSideValue = typeof PANEL_SIDES[keyof typeof PANEL_SIDES]