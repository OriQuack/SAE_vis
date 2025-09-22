// Sankey-specific constants

import type { NodeCategory } from '../shared'

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