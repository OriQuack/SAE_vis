/**
 * Centralized constants for SAE Feature Visualization Frontend
 *
 * This file provides consistent string constants across the frontend
 * and maintains alignment with backend constants for better maintainability.
 */

// ============================================================================
// CATEGORY TYPES - Must match backend data_constants.py
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
// ============================================================================
export const PANEL_LEFT = "left"
export const PANEL_RIGHT = "right"

export const PANEL_SIDES = {
  LEFT: PANEL_LEFT,
  RIGHT: PANEL_RIGHT
} as const

// ============================================================================
// NODE IDENTIFIERS
// ============================================================================
export const NODE_ROOT_ID = "root"

// ============================================================================
// API CONFIGURATION
// ============================================================================
export const API_BASE_URL = "/api"

export const API_ENDPOINTS = {
  FILTER_OPTIONS: "/filter-options",
  HISTOGRAM_DATA: "/histogram-data",
  SANKEY_DATA: "/sankey-data",
  COMPARISON_DATA: "/comparison-data",
  FEATURE_DETAIL: "/feature"
} as const

// ============================================================================
// DISPLAY NAMES - Centralized UI string mappings
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
// SANKEY DIAGRAM CONFIGURATION
// ============================================================================
export const SANKEY_COLORS: Record<string, string> = {
  [CATEGORY_ROOT]: '#8b5cf6',
  [CATEGORY_FEATURE_SPLITTING]: '#06b6d4',
  [CATEGORY_SEMANTIC_DISTANCE]: '#3b82f6',
  [CATEGORY_SCORE_AGREEMENT]: '#10b981'
} as const

// ============================================================================
// LEGEND CONFIGURATION - Using centralized display names
// ============================================================================
export const LEGEND_ITEMS = [
  { key: CATEGORY_ROOT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_ROOT] },
  { key: CATEGORY_FEATURE_SPLITTING, label: CATEGORY_DISPLAY_NAMES[CATEGORY_FEATURE_SPLITTING] },
  { key: CATEGORY_SEMANTIC_DISTANCE, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SEMANTIC_DISTANCE] },
  { key: CATEGORY_SCORE_AGREEMENT, label: CATEGORY_DISPLAY_NAMES[CATEGORY_SCORE_AGREEMENT] }
] as const

// ============================================================================
// TYPE EXPORTS - For better TypeScript integration
// ============================================================================
export type CategoryTypeValue = typeof CATEGORY_TYPES[keyof typeof CATEGORY_TYPES]
export type SplitTypeValue = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES]
export type PatternStateValue = typeof PATTERN_STATES[keyof typeof PATTERN_STATES]
export type MetricTypeValue = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]
export type PanelSideValue = typeof PANEL_SIDES[keyof typeof PANEL_SIDES]