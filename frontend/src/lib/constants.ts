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
export const CATEGORY_SEMANTIC_DISTANCE = "semantic_distance"
export const CATEGORY_SCORE_AGREEMENT = "score_agreement"

export const CATEGORY_TYPES = {
  ROOT: CATEGORY_ROOT,
  FEATURE_SPLITTING: CATEGORY_FEATURE_SPLITTING,
  SEMANTIC_DISTANCE: CATEGORY_SEMANTIC_DISTANCE,
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
export const METRIC_SEMDIST_MEAN = "semdist_mean"
export const METRIC_SEMDIST_MAX = "semdist_max"
export const METRIC_SCORE_FUZZ = "score_fuzz"
export const METRIC_SCORE_SIMULATION = "score_simulation"
export const METRIC_SCORE_DETECTION = "score_detection"
export const METRIC_SCORE_EMBEDDING = "score_embedding"

export const METRIC_TYPES = {
  FEATURE_SPLITTING: METRIC_FEATURE_SPLITTING,
  SEMDIST_MEAN: METRIC_SEMDIST_MEAN,
  SEMDIST_MAX: METRIC_SEMDIST_MAX,
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
  [CATEGORY_SEMANTIC_DISTANCE]: "Semantic Distance",
  [CATEGORY_SCORE_AGREEMENT]: "Score Agreement"
} as const

export const METRIC_DISPLAY_NAMES = {
  [METRIC_FEATURE_SPLITTING]: "Feature Splitting",
  [METRIC_SEMDIST_MEAN]: "Semantic Distance (Mean)",
  [METRIC_SEMDIST_MAX]: "Semantic Distance (Max)",
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
// EuroVIS colorblind-safe palette for different component types
// Used across: FlowPanel.tsx, HistogramPanel.tsx, d3-flow-utils.ts (3+ files)
// ============================================================================
export const COMPONENT_COLORS = {
  DECODER: OKABE_ITO_PALETTE.BLUISH_GREEN,   
  EXPLAINER: OKABE_ITO_PALETTE.REDDISH_PURPLE,        
  SCORER: OKABE_ITO_PALETTE.BLUE,            
  EMBEDDER: OKABE_ITO_PALETTE.ORANGE,  

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
    semdist_mean: METRIC_COLORS.SEMANTIC_SIMILARITY,
    semdist_max: METRIC_COLORS.SEMANTIC_SIMILARITY,
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
  [CATEGORY_SEMANTIC_DISTANCE]: EUROVIS_PALETTE.PRIMARY_BLUE,    // #0072B2 - Blue
  [CATEGORY_SCORE_AGREEMENT]: EUROVIS_PALETTE.PRIMARY_GREEN      // #009E73 - Bluish Green
} as const

// ============================================================================
// LEGEND CONFIGURATION - Using centralized display names
// Used across: SankeyDiagram.tsx, AlluvialDiagram.tsx (2+ files, visualization-specific)
// ============================================================================
export const LEGEND_ITEMS = [
  { key: CATEGORY_ROOT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_ROOT] },
  { key: CATEGORY_FEATURE_SPLITTING, label: CATEGORY_DISPLAY_NAMES[CATEGORY_FEATURE_SPLITTING] },
  { key: CATEGORY_SEMANTIC_DISTANCE, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SEMANTIC_DISTANCE] },
  { key: CATEGORY_SCORE_AGREEMENT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SCORE_AGREEMENT] }
] as const

// ============================================================================
// LLM ICON SVG PATHS - Reusable icon definitions for LLM components
// Used across: FlowPanel.tsx, LLMComparisonSelection.tsx
// ============================================================================

export const LLM_EXPLAINER_ICON_SVG = `
  <!-- Cute robot head -->
  <rect x="25" y="35" width="50" height="45" rx="12" fill="${COMPONENT_COLORS.EXPLAINER}" />

  <!-- Eyes - friendly teacher look -->
  <circle cx="38" cy="53" r="6" fill="white" />
  <circle cx="62" cy="53" r="6" fill="white" />
  <circle cx="38" cy="53" r="3" fill="#1f2937" />
  <circle cx="62" cy="53" r="3" fill="#1f2937" />

  <!-- Neutral mouth -->
  <line x1="40" y1="65" x2="60" y2="65" stroke="white" stroke-width="3" stroke-linecap="round" />

  <!-- Glasses - teacher style -->
  <circle cx="38" cy="53" r="8" stroke="#1f2937" stroke-width="2" fill="none" />
  <circle cx="62" cy="53" r="8" stroke="#1f2937" stroke-width="2" fill="none" />
  <line x1="46" y1="53" x2="54" y2="53" stroke="#1f2937" stroke-width="2" />

  <!-- Graduation cap -->
  <rect x="35" y="25" width="30" height="6" rx="1" fill="#1f2937" />
  <path d="M 30 25 L 70 25 L 68 20 L 32 20 Z" fill="#1f2937" />
  <line x1="65" y1="20" x2="68" y2="15" stroke="#1f2937" stroke-width="1.5" />
  <circle cx="68" cy="14" r="2" fill="${OKABE_ITO_PALETTE.YELLOW}" />

  <!-- Book/document - teaching symbol -->
  <rect x="70" y="40" width="18" height="24" rx="2" fill="white" stroke="${COMPONENT_COLORS.EXPLAINER}" stroke-width="2" />
  <line x1="73" y1="47" x2="85" y2="47" stroke="${COMPONENT_COLORS.EXPLAINER}" stroke-width="1.5" />
  <line x1="73" y1="52" x2="85" y2="52" stroke="${COMPONENT_COLORS.EXPLAINER}" stroke-width="1.5" />
  <line x1="73" y1="57" x2="85" y2="57" stroke="${COMPONENT_COLORS.EXPLAINER}" stroke-width="1.5" />
`

export const LLM_SCORER_ICON_SVG = `
  <!-- Cute robot head -->
  <rect x="25" y="35" width="50" height="45" rx="12" fill="${COMPONENT_COLORS.SCORER}" />

  <!-- Eyes - focused student look -->
  <circle cx="38" cy="53" r="6" fill="white" />
  <circle cx="62" cy="53" r="6" fill="white" />
  <circle cx="40" cy="53" r="3" fill="#1f2937" />
  <circle cx="64" cy="53" r="3" fill="#1f2937" />

  <!-- Sad expression - linear mouth -->
  <line x1="38" y1="66" x2="62" y2="66" stroke="white" stroke-width="3" stroke-linecap="round" />

  <!-- Cute antenna -->
  <line x1="50" y1="35" x2="50" y2="22" stroke="#1f2937" stroke-width="2" stroke-linecap="round" />
  <circle cx="50" cy="18" r="4" fill="${OKABE_ITO_PALETTE.YELLOW}" stroke="#1f2937" stroke-width="1.5" />

  <!-- Pencil - upside down -->
  <polygon points="78,30 75,35 81,35" fill="#1f2937" />
  <rect x="75" y="35" width="6" height="26" rx="1" fill="${OKABE_ITO_PALETTE.YELLOW}" />
  <rect x="75" y="61" width="6" height="2" fill="#9CA3AF" />
  <rect x="75" y="63" width="6" height="5" fill="#FF6B9D" />
`

// ============================================================================
// TYPE EXPORTS - For better TypeScript integration
// ============================================================================
export type CategoryTypeValue = typeof CATEGORY_TYPES[keyof typeof CATEGORY_TYPES]
export type SplitTypeValue = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES]
export type PatternStateValue = typeof PATTERN_STATES[keyof typeof PATTERN_STATES]
export type MetricTypeValue = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]
export type PanelSideValue = typeof PANEL_SIDES[keyof typeof PANEL_SIDES]