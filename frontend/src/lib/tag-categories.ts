// ============================================================================
// TAG CATEGORY SYSTEM - Fixed 3-stage Sankey structure
// Central configuration for tag-based feature categorization
// ============================================================================

import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_FUZZ,
  METRIC_SEMANTIC_SIMILARITY
} from './constants'

// ============================================================================
// TAG CATEGORY IDs
// ============================================================================
export const TAG_CATEGORY_FEATURE_SPLITTING = "feature_splitting" as const
export const TAG_CATEGORY_QUALITY = "quality" as const
export const TAG_CATEGORY_CAUSE = "cause" as const

// ============================================================================
// TAG CATEGORY CONFIGURATION
// Single source of truth for all tag category metadata
// ============================================================================

export interface TagCategoryConfig {
  /** Unique identifier for this category */
  id: string

  /** Display name shown in UI */
  label: string

  /** Stage order in the fixed Sankey structure (1-3) */
  stageOrder: number

  /** Primary metric used for grouping features (null for pre-defined groups) */
  metric: string | null

  /** Default thresholds for metric-based splitting */
  defaultThresholds: number[]

  /** Whether to show histogram visualization on Sankey nodes */
  showHistogram: boolean

  /** Tag values for this category */
  tags: string[]

  /** Related metrics for reference and future analysis */
  relatedMetrics: string[]

  /** Description of what this category represents */
  description: string
}

/**
 * TAG CATEGORIES - Complete configuration for the 3-stage Sankey structure
 *
 * This is the single source of truth for:
 * - Stage order in Sankey (Root → Feature Splitting → Quality → Cause)
 * - Grouping metrics and thresholds
 * - Histogram visibility
 * - Tag assignments
 * - Related metrics for each category
 */
export const TAG_CATEGORIES: Record<string, TagCategoryConfig> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]: {
    id: TAG_CATEGORY_FEATURE_SPLITTING,
    label: "Feature Splitting",
    stageOrder: 1,
    metric: METRIC_DECODER_SIMILARITY,
    defaultThresholds: [0.4],
    showHistogram: true,
    tags: [
      "single-latent",       // Group 0 (< 0.4, LOW decoder similarity)
      "feature splitting"    // Group 1 (≥ 0.4, HIGH decoder similarity)
    ],
    relatedMetrics: [
      METRIC_DECODER_SIMILARITY,
      "inter_feature_similarity"  // Note: Not yet in backend data
    ],
    description: "Identifies whether a feature represents a single semantic concept or multiple overlapping concepts"
  },

  [TAG_CATEGORY_QUALITY]: {
    id: TAG_CATEGORY_QUALITY,
    label: "Quality",
    stageOrder: 2,
    metric: METRIC_QUALITY_SCORE,
    defaultThresholds: [0.7],
    showHistogram: true,
    tags: [
      "need revision",       // Group 0 (< 0.5, LOW quality score)
      "well-explained"       // Group 1 (≥ 0.5, HIGH quality score)
    ],
    relatedMetrics: [
      METRIC_SCORE_EMBEDDING,
      METRIC_SCORE_FUZZ,
      METRIC_SCORE_DETECTION,
      METRIC_QUALITY_SCORE
    ],
    description: "Assesses the overall quality of the feature explanation based on multiple scoring metrics"
  },

  [TAG_CATEGORY_CAUSE]: {
    id: TAG_CATEGORY_CAUSE,
    label: "Cause",
    stageOrder: 3,
    metric: null,  // Pre-defined groups, not metric-based
    defaultThresholds: [],
    showHistogram: false,
    tags: [
      "Missed Context",
      "Missed Lexicon",
      "Noisy Activation",
      "Unsure"
    ],
    relatedMetrics: [
      // Missed Context indicators
      METRIC_SCORE_DETECTION,
      METRIC_SCORE_EMBEDDING,
      // Missed Lexicon indicators
      METRIC_SCORE_FUZZ,
      // Noisy Activation indicators
      "intra_feature_similarity",  // Note: Not yet in backend data
      METRIC_SEMANTIC_SIMILARITY
    ],
    description: "Categorizes the root cause of explanation issues for features that need revision"
  }
} as const

// ============================================================================
// TAG CATEGORY HELPERS
// Utility functions for working with tag categories
// ============================================================================

/**
 * Get tag categories in stage order (1 → 2 → 3)
 */
export function getTagCategoriesInOrder(): TagCategoryConfig[] {
  return Object.values(TAG_CATEGORIES).sort((a, b) => a.stageOrder - b.stageOrder)
}

/**
 * Get tag category configuration by ID
 */
export function getTagCategory(categoryId: string): TagCategoryConfig | undefined {
  return TAG_CATEGORIES[categoryId]
}

/**
 * Get the representative metric to display for a category
 * (This is the metric used in histograms if showHistogram is true)
 */
export function getRepresentativeMetric(categoryId: string): string | null {
  const category = TAG_CATEGORIES[categoryId]
  return category?.metric ?? null
}

/**
 * Check if a category should show histogram visualization
 */
export function shouldShowHistogram(categoryId: string): boolean {
  const category = TAG_CATEGORIES[categoryId]
  return category?.showHistogram ?? false
}

/**
 * Get default thresholds for a category
 */
export function getDefaultThresholds(categoryId: string): number[] {
  const category = TAG_CATEGORIES[categoryId]
  return category?.defaultThresholds ?? []
}

/**
 * Check if a category uses metric-based grouping
 */
export function isMetricBasedCategory(categoryId: string): boolean {
  const category = TAG_CATEGORIES[categoryId]
  return category?.metric !== null
}

/**
 * Check if a category uses pre-defined tag groups
 */
export function isPreDefinedGroupCategory(categoryId: string): boolean {
  return !isMetricBasedCategory(categoryId)
}

// ============================================================================
// CAUSE CATEGORY DETAILED MAPPING
// Detailed breakdown of which metrics relate to which cause tags
// ============================================================================

export interface CauseMetricMapping {
  tag: string
  description: string
  indicatorMetrics: string[]
}

/**
 * CAUSE_METRIC_MAPPINGS - Detailed relationships between cause tags and metrics
 *
 * This provides the detailed rationale for each cause category:
 * - Which metrics indicate each type of issue
 * - How to interpret metric patterns for diagnosis
 */
export const CAUSE_METRIC_MAPPINGS: CauseMetricMapping[] = [
  {
    tag: "Missed Context",
    description: "Explanation fails to capture the full context of when the feature activates",
    indicatorMetrics: [
      METRIC_SCORE_DETECTION,    // Low detection = explanation doesn't predict activation well
      METRIC_SCORE_EMBEDDING      // Low embedding = semantic mismatch between explanation and activations
    ]
  },
  {
    tag: "Missed Lexicon",
    description: "Explanation uses incorrect or imprecise vocabulary to describe the feature",
    indicatorMetrics: [
      METRIC_SCORE_FUZZ          // Low fuzz = explanation not robust to perturbations
    ]
  },
  {
    tag: "Noisy Activation",
    description: "Feature activates on inconsistent or unrelated examples, making explanation difficult",
    indicatorMetrics: [
      "intra_feature_similarity",  // Low intra-feature = activations are dissimilar
      METRIC_SEMANTIC_SIMILARITY   // Low semantic = explanations from different LLMs disagree
    ]
  },
  {
    tag: "Unsure",
    description: "Cause of explanation issue is unclear or not yet determined by user analysis",
    indicatorMetrics: []  // Default category for unassigned features
  }
]

/**
 * Get cause metric mapping for a specific tag
 */
export function getCauseMetricMapping(tag: string): CauseMetricMapping | undefined {
  return CAUSE_METRIC_MAPPINGS.find(mapping => mapping.tag === tag)
}

// ============================================================================
// STAGE ORDER CONSTANTS
// For easy reference in components
// ============================================================================

export const STAGE_ORDER = {
  FEATURE_SPLITTING: 1,
  QUALITY: 2,
  CAUSE: 3
} as const

export const TOTAL_STAGES = 3
