// Histogram-specific constants

import { COMMON_COLORS } from '../shared'

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

// Cache configuration
export const HISTOGRAM_CACHE_CONFIG = {
  maxEntries: 50,           // Maximum cache entries
  ttlMs: 30000             // Cache TTL in milliseconds (30 seconds)
} as const