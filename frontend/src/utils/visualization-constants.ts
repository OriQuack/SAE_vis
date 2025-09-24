// Consolidated visualization constants
// All D3 and visualization-related constants in one place

import type { AnimationConfig, NodeCategory } from './visualization-types'

// =============================================================================
// COMMON / SHARED CONSTANTS
// =============================================================================

// Default animation configuration
export const DEFAULT_ANIMATION: AnimationConfig = {
  duration: 300,
  easing: 'ease-out'
} as const

// Common dimension constraints
export const MIN_DIMENSIONS = {
  width: 200,
  height: 150
} as const

// Common color values used across modules
export const COMMON_COLORS = {
  background: '#f8fafc',
  grid: '#e2e8f0',
  text: '#374151',
  axis: '#6b7280',
  primary: '#3b82f6',
  success: '#10b981',
  neutral: '#6b7280'
} as const

// =============================================================================
// HISTOGRAM CONSTANTS
// =============================================================================

// Histogram color scheme
export const HISTOGRAM_COLORS = {
  bars: '#94a3b8',          // Neutral slate-400 for below threshold
  barsHover: '#64748b',     // Darker slate-500
  threshold: '#10b981',     // Green (emerald-500) for above threshold
  thresholdHover: '#059669', // Darker green (emerald-600)
  background: COMMON_COLORS.background,
  grid: COMMON_COLORS.grid,
  text: COMMON_COLORS.text,
  axis: COMMON_COLORS.axis,
  sliderHandle: COMMON_COLORS.primary,
  sliderTrackFilled: COMMON_COLORS.primary,
  sliderTrackUnfilled: '#cbd5e1'   // Light gray for unfilled portion
} as const

// Default layout margins for histograms
export const DEFAULT_HISTOGRAM_MARGIN = {
  top: 20,
  right: 30,
  bottom: 70,  // Increased to accommodate separate slider track
  left: 50
} as const

// Multi-histogram layout constants
export const MULTI_HISTOGRAM_LAYOUT = {
  spacing: 16,              // Space between charts
  chartTitleHeight: 28,     // Height for chart title
  chartMarginTop: 12,       // Additional top margin for each chart
  minChartHeight: 120       // Minimum height for individual charts
} as const

// Metric display titles mapping
export const METRIC_TITLES: Record<string, string> = {
  score_detection: 'Detection Score',
  score_fuzz: 'Fuzz Score',
  score_simulation: 'Simulation Score',
  semdist_mean: 'Semantic Distance (Mean)',
  semdist_max: 'Semantic Distance (Max)',
  score_embedding: 'Embedding Score'
} as const

// Cache configuration for histograms
export const HISTOGRAM_CACHE_CONFIG = {
  maxEntries: 50,           // Maximum cache entries
  ttlMs: 30000             // Cache TTL in milliseconds (30 seconds)
} as const

// =============================================================================
// SANKEY CONSTANTS
// =============================================================================

// Sankey color scheme by node category
export const SANKEY_COLORS: Record<NodeCategory, string> = {
  root: '#8b5cf6',              // Purple
  feature_splitting: '#06b6d4', // Cyan
  semantic_distance: '#3b82f6', // Blue
  score_agreement: '#10b981'    // Green
} as const

// Default sankey layout margins
export const DEFAULT_SANKEY_MARGIN = {
  top: 80,
  right: 20,
  bottom: 20,
  left: 80
} as const

// Sankey layout parameters
export const SANKEY_LAYOUT_CONFIG = {
  nodeWidth: 15,
  nodePadding: 10,
  linkOpacity: 0.5  // Transparency for links
} as const

// Stage 4 score agreement node sorting order
export const SCORE_AGREEMENT_SORT_ORDER: Record<string, number> = {
  'all 3 scores high': 0,
  '2 of 3 scores high': 1,
  '1 of 3 scores high': 2,
  'all scores low': 3
} as const

// Cache configuration for sankey calculations
export const SANKEY_CACHE_CONFIG = {
  maxEntries: 30,           // Maximum cache entries
  ttlMs: 60000,            // Cache TTL in milliseconds (60 seconds)
  sortingMaxEntries: 20,   // Maximum sorting cache entries
  sortingTtlMs: 30000      // Sorting cache TTL (30 seconds)
} as const

// Default fallback color for unknown categories
export const DEFAULT_NODE_COLOR = '#6b7280'

// =============================================================================
// SLIDER CONSTANTS
// =============================================================================

// Slider track dimensions and styling
export const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,  // Distance below x-axis labels
  cornerRadius: 3
} as const

// Default snapping configuration
export const SLIDER_SNAP_CONFIG = {
  defaultTickCount: 10,
  snapThreshold: 0.05  // 5% of range for snap sensitivity
} as const

// =============================================================================
// ANIMATION / TRANSITION CONSTANTS
// =============================================================================

// Common transition durations
export const TRANSITION_DURATIONS = {
  fast: 150,
  normal: 300,
  slow: 500
} as const

// =============================================================================
// TOOLTIP CONSTANTS
// =============================================================================

// Tooltip positioning and styling
export const TOOLTIP_CONFIG = {
  offset: 10,
  maxWidth: 300,
  delay: 100
} as const