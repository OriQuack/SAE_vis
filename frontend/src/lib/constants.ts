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
// TAG CATEGORY SYSTEM - Fixed 4-stage Sankey structure
// Configuration for tag-based feature categorization
// ============================================================================

/** Color assignment mode for tag categories */
export type TagColorMode = 'hierarchical' | 'constant' | 'treecolors'

// Tag Category IDs
export const TAG_CATEGORY_FEATURE_SPLITTING = "feature_splitting" as const
export const TAG_CATEGORY_QUALITY = "quality" as const
export const TAG_CATEGORY_CAUSE = "cause" as const
export const TAG_CATEGORY_TEMP = "temp" as const

// Table Panel Titles - Display names for table panels corresponding to each stage
export const TAG_CATEGORY_TABLE_TITLES: Record<string, string> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]: "Feature Splitting Detection",
  [TAG_CATEGORY_QUALITY]: "Quality Assessment",
  [TAG_CATEGORY_CAUSE]: "Root Cause Analysis",
  [TAG_CATEGORY_TEMP]: "Temp Analysis"
}

// Table Panel Instructions - Instruction text shown below table panel titles
export const TAG_CATEGORY_TABLE_INSTRUCTIONS: Record<string, string> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]: "Select table feature columns to tag",
  [TAG_CATEGORY_QUALITY]: "Select feature table rows to tag",
  [TAG_CATEGORY_CAUSE]: "Select feature table rows to tag",
  [TAG_CATEGORY_TEMP]: "Experimental analysis placeholder"
}

// Tag Category Configuration Interface
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
  /** Which tag from this category is parent of all next stage tags (null if none) */
  parentTagForNextStage: string | null
  /** User-facing instruction text displayed in the UI */
  instruction: string
  /** Pre-computed colors for each tag (tag name → hex color) */
  tagColors: Record<string, string>
  /** Parent tag from previous stage (null for stage 1) */
  parentTag: string | null
}

/**
 * TAG CATEGORIES - Complete configuration for the 4-stage Sankey structure
 * Colors are populated at runtime by tag-system.ts
 */
export const TAG_CATEGORIES: Record<string, TagCategoryConfig> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]: {
    id: TAG_CATEGORY_FEATURE_SPLITTING,
    label: "Detect Feature Splitting",
    stageOrder: 1,
    metric: METRIC_DECODER_SIMILARITY,
    defaultThresholds: [0.4],
    showHistogram: true,
    tags: [
      "Monosemantic",       // Group 0 (< 0.4, LOW decoder similarity)
      "Fragmented"    // Group 1 (≥ 0.4, HIGH decoder similarity)
    ],
    relatedMetrics: [
      METRIC_DECODER_SIMILARITY,
      "inter_feature_similarity"
    ],
    description: "Identifies whether a feature represents a single semantic concept or multiple overlapping concepts",
    parentTagForNextStage: "Monosemantic",
    instruction: "Fragmented or Monosemantic Feature?",
    tagColors: {},  // Populated by tag-system.ts
    parentTag: null  // Stage 1 has no parent
  },

  [TAG_CATEGORY_QUALITY]: {
    id: TAG_CATEGORY_QUALITY,
    label: "Assess Quality",
    stageOrder: 2,
    metric: METRIC_QUALITY_SCORE,
    defaultThresholds: [0.6],
    showHistogram: true,
    tags: [
      "Need Revision",       // Group 0 (< threshold, LOW quality score)
      "Well-Explained"       // Group 1 (≥ threshold, HIGH quality score)
    ],
    relatedMetrics: [
      METRIC_SCORE_EMBEDDING,
      METRIC_SCORE_FUZZ,
      METRIC_SCORE_DETECTION,
      METRIC_QUALITY_SCORE,
      METRIC_SEMANTIC_SIMILARITY,
    ],
    description: "Assesses the overall quality of the feature explanation based on multiple scoring metrics",
    parentTagForNextStage: "Need Revision",
    instruction: "Assess LLM generated explanation quality",
    tagColors: {},  // Populated by tag-system.ts
    parentTag: "Monosemantic"  // Children of Monosemantic from stage 1
  },

  [TAG_CATEGORY_CAUSE]: {
    id: TAG_CATEGORY_CAUSE,
    label: "Determine Cause",
    stageOrder: 3,
    metric: null,  // Pre-defined groups, not metric-based
    defaultThresholds: [],
    showHistogram: false,
    tags: [
      "Noisy Activation",
      "Missed Context",
      "Missed N-gram"
    ],
    relatedMetrics: [
      // Noisy Activation indicators
      "intra_feature_similarity",
      METRIC_SEMANTIC_SIMILARITY,
      // Missed Context indicators
      METRIC_SCORE_DETECTION,
      METRIC_SCORE_EMBEDDING,
      // Missed N-gram indicators
      METRIC_SCORE_FUZZ
    ],
    description: "Categorizes the root cause of explanation issues for features that need revision",
    parentTagForNextStage: null,
    instruction: "Determine root cause for poor explanation quality",
    tagColors: {},  // Populated by tag-system.ts
    parentTag: "Need Revision"  // Children of Need Revision from stage 2
  },

  [TAG_CATEGORY_TEMP]: {
    id: TAG_CATEGORY_TEMP,
    label: "Temp",
    stageOrder: 4,
    metric: null,  // Placeholder, no metric-based logic
    defaultThresholds: [],
    showHistogram: false,
    tags: [],  // No tags - only stage tab
    relatedMetrics: [],
    description: "Temporary placeholder stage for testing",
    parentTagForNextStage: null,
    instruction: "Placeholder stage",
    tagColors: {},  // Populated by tag-system.ts
    parentTag: null  // Placeholder, no parent relationship
  }
} as const

// ============================================================================
// CAUSE TAG METRICS - Configuration for auto-tagging in Stage 3
// Maps each cause category to its metrics, thresholds, and aggregation rules
// ============================================================================

export interface CauseTagMetricConfig {
  /** Metric field names used for this cause category */
  metrics: string[]
  /** How to aggregate multiple metrics: 'average', 'max', or 'single' */
  aggregation: 'average' | 'max' | 'single'
  /** Threshold value for assignment (only for threshold-based tags) */
  threshold?: number
  /** If true, tag is assigned when score < threshold (lower is worse) */
  belowThreshold?: boolean
  /** If true, this is the default/fallback category */
  isDefault?: boolean
}

export const CAUSE_TAG_METRICS: Record<string, CauseTagMetricConfig> = {
  'noisy-activation': {
    // Noisy Activation: High intra-feature similarity + high explanation semantic similarity
    // Metrics: Max(char_ngram_max_jaccard, word_ngram_max_jaccard, semantic_similarity) from ActivationExamples
    //          + Avg(pairwise semantic_similarity) from ExplainerScoreData
    // Final score = average of the two components
    metrics: ['intra_feature_similarity', 'explanation_semantic_similarity'],
    aggregation: 'average',
    isDefault: true  // Fallback category when others don't match
  },
  'missed-context': {
    // Missed Context: Low embedding and detection scores
    // Score = Avg(embedding, detection) from ExplainerScoreData
    metrics: [METRIC_SCORE_EMBEDDING, METRIC_SCORE_DETECTION],
    aggregation: 'average',
    threshold: 0.5,
    belowThreshold: true  // Tag assigned when score < 0.5
  },
  'missed-N-gram': {
    // Missed N-gram (internal name: missed-lexicon): Low fuzz score
    // Score = fuzz from ExplainerScoreData
    metrics: [METRIC_SCORE_FUZZ],
    aggregation: 'single',
    threshold: 0.5,
    belowThreshold: true  // Tag assigned when score < 0.5
  }
} as const

/** Default threshold for cause tag assignment */
export const CAUSE_TAG_THRESHOLD = 0.5

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
// D3 COLOR SCHEMES
// Standard D3.js categorical color schemes for data visualization
// ============================================================================

/**
 * D3 Tableau10 color scheme - 10 categorical colors
 * Matches d3.schemeTableau10 from d3-scale-chromatic
 */
export const D3_SCHEME_TABLEAU10 = {
  BLUE: '#4e79a7',
  ORANGE: '#f28e2c',
  RED: '#e15759',
  TEAL: '#76b7b2',
  GREEN: '#59a14f',
  YELLOW: '#edc949',
  PURPLE: '#af7aa1',
  PINK: '#ff9da7',
  BROWN: '#9c755f',
  GRAY: '#bab0ab'
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

/**
 * Centralized unsure/untagged color used across all components
 * Used for: badges, buttons, bars, tags, table states
 */
export const UNSURE_GRAY = '#e0e0e0ff'

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

/**
 * Selection category type definition
 */
export type SelectionCategory = 'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure'

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