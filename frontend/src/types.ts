// ============================================================================
// FILTER AND DATA TYPES
// ============================================================================

export interface Filters {
  sae_id?: string[]
  explanation_method?: string[]
  llm_explainer?: string[]
  llm_scorer?: string[]
}

// ============================================================================
// THRESHOLD SYSTEM
// ============================================================================

import {
  CATEGORY_ROOT, CATEGORY_DECODER_SIMILARITY, CATEGORY_SEMANTIC_SIMILARITY,
  METRIC_DECODER_SIMILARITY, METRIC_SEMANTIC_SIMILARITY, METRIC_QUALITY_SCORE,
  METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  PANEL_LEFT, PANEL_RIGHT
} from './lib/constants'

// Category Type Definition
export type CategoryType =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_DECODER_SIMILARITY
  | typeof CATEGORY_SEMANTIC_SIMILARITY

// ============================================================================
// NEW TREE-BASED THRESHOLD SYSTEM (Feature Group + Intersection)
// ============================================================================

/**
 * Stage Definition - Simplified stage configuration for new system
 */
export interface StageDefinition {
  index: number
  metric: string
  thresholds: number[]
}

/**
 * Feature Group - Group of features within threshold range
 */
export interface FeatureGroup {
  groupIndex: number
  rangeLabel: string
  featureIds: Set<number>
  featureCount: number
}

/**
 * Computed Sankey Structure - Result of local intersection computation
 */
export interface ComputedSankeyStructure {
  nodes: SankeyNode[]
  links: SankeyLink[]
  nodeFeatures: Map<string, Set<number>>
}

// ============================================================================
// TREE-BASED SANKEY SYSTEM (Node-specific stage addition)
// ============================================================================

/**
 * Sankey Tree Node - Represents a node in the tree-based Sankey structure
 * Supports branching where different nodes at the same depth can have different metrics
 */
export interface SankeyTreeNode {
  id: string                          // Unique node ID (e.g., "root", "stage0_group1", etc.)
  parentId: string | null             // Parent node ID (null for root)
  metric: string | null               // Metric used for this node's stage (null for root)
  thresholds: number[]                // Threshold values for this node (metric values)
  percentiles?: number[]              // Percentile positions (0-1) for visual splitting (e.g., [0.4, 0.8])
  thresholdSource?: 'percentile' | 'metric'  // How thresholds were set: visual (percentile) or exact (metric)
  depth: number                       // Depth in tree (0 for root)
  stage?: number                      // Explicit stage override (for terminal nodes at rightmost position)
  children: string[]                  // Child node IDs
  featureIds: Set<number>             // Feature IDs at this node
  featureCount: number                // Count of features
  rangeLabel: string                  // Display label (e.g., "< 0.5", "0.5-0.8", "> 0.8")
  percentileToMetricMap?: Map<number, number>  // Cached exact percentile to metric mappings
}

/**
 * Tree-based Sankey Structure - Complete tree representation for Sankey diagram
 */
export interface TreeBasedSankeyStructure {
  tree: Map<string, SankeyTreeNode>    // Node ID to node mapping
  nodes: SankeyNode[]                  // Flat array of nodes for D3 rendering
  links: SankeyLink[]                  // Links between nodes
  maxDepth: number                     // Maximum depth in the tree
}

export interface FilterOptions {
  sae_id: string[]
  explanation_method: string[]
  llm_explainer: string[]
  llm_scorer: string[]
}

// ============================================================================
// API REQUEST TYPES
// ============================================================================

/**
 * Threshold path constraint - represents one step in the path from root to node
 * Each constraint filters features by a metric range from parent nodes
 */
export interface ThresholdPathConstraint {
  metric: string      // Metric name (e.g., "decoder_similarity", "quality_score")
  rangeLabel: string  // Display label (e.g., "[0, 0.3)", ">= 0.5", "< 0.5")
}

export interface HistogramDataRequest {
  filters: Filters
  metric: string
  bins?: number
  nodeId?: string
  fixedDomain?: [number, number]  // Optional fixed domain for histogram bins, e.g., [0.0, 1.0]
  thresholdPath?: ThresholdPathConstraint[]  // Optional array of parent node constraints for filtering
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface HistogramData {
  metric: string
  histogram: {
    bins: number[]
    counts: number[]
    bin_edges: number[]
  }
  statistics: {
    min: number
    max: number
    mean: number
    median: number
    std: number
  }
  total_features: number
}

export interface SankeyNode {
  id: string
  name: string
  stage: number
  depth?: number  // Tree depth (for sorting terminal nodes at same stage)
  feature_count: number
  category: NodeCategory
  metric?: string | null  // Metric used for this node's stage (null for root)
  feature_ids?: number[]
  node_type?: 'standard' | 'vertical_bar'
}

export interface D3SankeyNode extends SankeyNode {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  depth?: number
  height?: number
  index?: number
  originalIndex?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
  featureIds?: Set<number>  // Converted from feature_ids for easier lookup in scroll indicator
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface D3SankeyLink {
  source: D3SankeyNode | number
  target: D3SankeyNode | number
  value: number
  width?: number
  y0?: number
  y1?: number
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  metadata: {
    total_features: number
    applied_filters: Filters
  }
}

export interface AlluvialFlowData {
  source_node: string
  target_node: string
  feature_count: number
  feature_ids: number[]
}

export interface AlluvialFlow {
  source: string
  target: string
  value: number
  feature_ids: number[]
  sourceCategory: string
  targetCategory: string
}

export interface AlluvialData {
  flows: AlluvialFlowData[]
  summary: {
    total_overlapping_features: number
    total_flows: number
    consistency_metrics: {
      same_final_category: number
      different_final_category: number
      consistency_rate: number
    }
  }
}

export interface FeatureDetail {
  feature_id: number
  sae_id: string
  explanation_method: string
  llm_explainer: string
  llm_scorer: string
  decoder_similarity: number
  semsim_mean: number
  semsim_max: number
  scores: {
    fuzz: number
    simulation: number
    detection: number
    embedding: number
  }
  details_path: string
}


// ============================================================================
// UI AND STATE TYPES
// ============================================================================

export interface LoadingStates {
  filters: boolean
  histogram: boolean
  sankey: boolean
  sankeyLeft: boolean
  sankeyRight: boolean
  comparison: boolean
  table: boolean
}

export interface ErrorStates {
  filters: string | null
  histogram: string | null
  sankey: string | null
  sankeyLeft: string | null
  sankeyRight: string | null
  comparison: string | null
  table: string | null
}

export type MetricType =
  | typeof METRIC_DECODER_SIMILARITY
  | typeof METRIC_SEMANTIC_SIMILARITY
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_DETECTION
  | typeof METRIC_SCORE_EMBEDDING

export type NodeCategory =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_DECODER_SIMILARITY
  | typeof CATEGORY_SEMANTIC_SIMILARITY

// ============================================================================
// VISUALIZATION TYPES
// ============================================================================

export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

export interface HistogramChart {
  bins: HistogramBin[]
  xScale: any // D3 scale function
  yScale: any // D3 scale function
  width: number
  height: number
  margin: LayoutMargin
  metric: string
  yOffset: number
  chartTitle: string
}

export interface HistogramLayout {
  charts: HistogramChart[]
  totalWidth: number
  totalHeight: number
  spacing: number
}

export interface LayoutMargin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ThresholdLineData {
  x: number
  y1: number
  y2: number
  value: number
}

export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: LayoutMargin
}

export interface PopoverPosition {
  x: number
  y: number
  transform: string
}

export interface PopoverSize {
  width: number
  height: number
}

// ============================================================================
// POPOVER TYPES
// ============================================================================

export interface HistogramPopoverData {
  nodeId: string | undefined
  nodeName: string
  nodeCategory?: NodeCategory
  parentNodeId?: string
  parentNodeName?: string
  metrics: MetricType[]
  position: {
    x: number
    y: number
  }
  visible: boolean
  panel?: typeof PANEL_LEFT | typeof PANEL_RIGHT
}

export interface PopoverState {
  histogram: HistogramPopoverData | null
}

// ============================================================================
// ALLUVIAL DIAGRAM TYPES
// ============================================================================

export interface AlluvialSankeyNode {
  id: string
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  label: string
  featureCount: number
  height?: number
  width?: number
}

export interface AlluvialSankeyLink {
  source: AlluvialSankeyNode | number
  target: AlluvialSankeyNode | number
  value: number
  y0?: number
  y1?: number
  width?: number
  flow: AlluvialFlow
  color: string
  opacity: number
  id: string
}

export interface AlluvialLayoutData {
  flows: AlluvialSankeyLink[]
  leftNodes: AlluvialSankeyNode[]
  rightNodes: AlluvialSankeyNode[]
  sankeyGenerator: any
  stats: {
    totalFlows: number
    consistentFlows: number
    totalFeatures: number
    consistencyRate: number
  } | null
}

// ============================================================================
// TABLE TYPES (Feature-Level Table with 824 rows)
// ============================================================================

export interface ScorerScoreSet {
  s1: number | null
  s2: number | null
  s3: number | null
}

export interface HighlightSegment {
  text: string
  highlight: boolean
  color?: string  // Unused - background color calculated on frontend based on similarity
  style?: 'bold'  // All semantic matches are bold
  metadata?: {
    match_type: 'semantic'  // Only semantic matches supported
    similarity?: number     // Semantic similarity score (0.7 - 1.0)
    shared_with: number[]  // Explainer indices sharing this match
  }
}

export interface HighlightedExplanation {
  segments: HighlightSegment[]
}

export interface ExplainerScoreData {
  embedding: number | null
  quality_score: number | null
  fuzz: ScorerScoreSet
  detection: ScorerScoreSet
  explanation_text?: string | null  // Explanation text for this explainer
  highlighted_explanation?: HighlightedExplanation | null  // Highlighted explanation with syntax highlighting
  semantic_similarity?: Record<string, number> | null  // Pairwise cosine similarity to other explainers (e.g., {"qwen": 0.931, "openai": 0.871})
}

// Inter-feature similarity information for decoder-similar features
export interface InterFeatureSimilarityInfo {
  pattern_type: 'Semantic' | 'Lexical' | 'Both' | 'None'
  semantic_similarity?: number | null
  char_jaccard?: number | null
  word_jaccard?: number | null
  max_char_ngram?: string | null
  max_word_ngram?: string | null
  // V4.0 position tracking fields
  main_char_ngram_positions?: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset: number}>}> | null
  similar_char_ngram_positions?: Array<{prompt_id: number, positions: Array<{token_position: number, char_offset: number}>}> | null
  main_word_ngram_positions?: Array<{prompt_id: number, positions: number[]}> | null
  similar_word_ngram_positions?: Array<{prompt_id: number, positions: number[]}> | null
}

// Decoder similar feature with inter-feature similarity info
export interface DecoderSimilarFeature {
  feature_id: number
  cosine_similarity: number
  inter_feature_similarity?: InterFeatureSimilarityInfo
}

export interface FeatureTableRow {
  feature_id: number
  decoder_similarity?: Array<DecoderSimilarFeature> | null  // List of top similar features with cosine similarity scores
  explainers: Record<string, ExplainerScoreData>
  // NEW: Activation examples (lazy loaded)
  activation_examples?: ActivationExamples
}

// ============================================================================
// ACTIVATION EXAMPLE TYPES
// ============================================================================

/**
 * Activation examples for a feature with dual n-gram pattern analysis
 */
export interface ActivationExamples {
  quantile_examples: QuantileExample[]  // 4 quantiles (Q1-Q4)
  semantic_similarity: number           // Average pairwise semantic similarity (0-1)
  // Dual n-gram fields (character + word patterns)
  char_ngram_max_jaccard: number       // Character n-gram Jaccard similarity (0-1)
  word_ngram_max_jaccard: number       // Word n-gram Jaccard similarity (0-1)
  top_char_ngram_text: string | null   // Most frequent character n-gram (e.g., "ing")
  top_word_ngram_text: string | null   // Most frequent word n-gram (e.g., "observation")
  pattern_type: string                 // Pattern categorization: 'None' | 'Semantic' | 'Lexical' | 'Both'
}

/**
 * Single activation example from a quantile
 */
export interface QuantileExample {
  quantile_index: number               // 0-3 (Q1-Q4)
  prompt_id: number
  prompt_tokens: string[]              // All tokens (127)
  activation_pairs: Array<{
    token_position: number
    activation_value: number
  }>
  max_activation: number
  max_activation_position: number      // Where to center highlighting
  // Dual n-gram position data for precise highlighting
  char_ngram_positions: Array<{
    token_position: number             // Token index containing the n-gram
    char_offset: number                // Character offset within the token
  }>
  word_ngram_positions: number[]       // Token positions where word n-grams start
}

/**
 * Token with activation highlighting metadata
 */
export interface ActivationToken {
  text: string
  position: number
  activation_value?: number            // If activated
  is_max?: boolean                    // Is this the max activation token?
  is_newline?: boolean                // Is this a newline character?
}

export interface TableDataRequest {
  filters: Filters
}

export interface MetricNormalizationStats {
  mean: number
  std: number
  min: number
  max: number
  z_min: number  // Min z-score for min-max normalization
  z_max: number  // Max z-score for min-max normalization
}

export interface FeatureTableDataResponse {
  features: FeatureTableRow[]
  total_features: number
  explainer_ids: string[]
  scorer_ids: string[]
  global_stats: Record<string, MetricNormalizationStats>
}

// Table Sorting Types (simplified for new table structure)
export type SortDirection = 'asc' | 'desc' | null

export type SortBy =
  | 'featureId'
  | typeof METRIC_QUALITY_SCORE
  | typeof METRIC_SCORE_DETECTION
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_EMBEDDING
  | typeof METRIC_DECODER_SIMILARITY
  | typeof METRIC_SEMANTIC_SIMILARITY
  | null

// ============================================================================
// TABLE CELL SELECTION TYPES
// ============================================================================

/**
 * Cell Group - Represents a group of selected cells with same feature_id and explainer_id
 */
export interface CellGroup {
  id: string                  // Unique group ID: "{featureId}_{explainerId}"
  featureId: number          // Feature ID (row identifier)
  explainerId: string        // LLM Explainer ID (llama, qwen, openai)
  cellIndices: number[]      // Array of column indices in this group
  colorIndex: number         // Color index for visual distinction (0-2)
}

/**
 * Cell Selection State - Tracks selected cell groups and drag selection
 */
export interface CellSelectionState {
  groups: CellGroup[]        // Array of selected cell groups
  startRow: number | null    // Starting row index of drag selection
  startCol: number | null    // Starting column index of drag selection
  endRow: number | null      // Ending row index of drag selection
  endCol: number | null      // Ending column index of drag selection
}

/**
 * Saved Cell Group Selection - Named and saved cell group selections for future use
 */
export interface SavedCellGroupSelection {
  id: string                 // Unique ID (timestamp-based)
  name: string               // User-provided name
  groups: CellGroup[]        // Saved cell groups
  colorIndex: number         // Color index for badge display (0-5)
  timestamp: number          // Creation timestamp
}

// ============================================================================
// STAGE TABLE TYPES (Dedicated tables for Sankey stages)
// ============================================================================

/**
 * Decoder Stage Row - Row data for decoder similarity stage table
 */
export interface DecoderStageRow {
  feature_id: number
  decoder_similarity: number  // The feature's own decoder similarity score
  top_similar_features: Array<{
    feature_id: number
    cosine_similarity: number
    is_main?: boolean  // True for main feature (first row), false for similar features
    inter_feature_similarity?: any  // Inter-feature similarity data for pattern highlighting
  }>  // Main feature + top 4 most similar features by decoder weights
}

/**
 * Stage Table Context - Metadata for the currently selected stage
 */
export interface StageTableContext {
  nodeId: string       // Sankey tree node ID
  metric: string       // Metric used for this stage (e.g., "decoder_similarity")
  rangeLabel: string   // Display label (e.g., ">= 0.40")
  featureCount: number // Number of features in this stage
}

// ============================================================================
// TAG SYSTEM TYPES (Stage 1: Tag Definition & Seed Selection)
// ============================================================================

/**
 * Metric Range - Min/max range for a single metric
 */
export interface MetricRange {
  min: number  // Minimum value (0-1 scale)
  max: number  // Maximum value (0-1 scale)
}

/**
 * Metric Signature - Pattern definition for a tag
 * Defines acceptable ranges for each metric
 */
export interface MetricSignature {
  decoder_similarity: MetricRange       // SAE decoder similarity (low=good, high=over-split)
  embedding: MetricRange                // Explanation-activation alignment
  fuzz: MetricRange                     // Robustness to perturbations
  detection: MetricRange                // Predictive utility
  semantic_similarity: MetricRange      // Inter-explainer agreement
  quality_score: MetricRange            // Composite metric
}

/**
 * Metric Weights - Weights for each metric in distance calculation
 * Higher weight = metric is more important for similarity
 * Typically auto-inferred from signature ranges (tighter range = higher weight)
 */
export interface MetricWeights {
  decoder_similarity: number
  embedding: number
  fuzz: number
  detection: number
  semantic_similarity: number
  quality_score: number
}

/**
 * Tag - User-defined semantic label with metric signature
 */
export interface Tag {
  id: string                            // Unique tag ID (UUID)
  name: string                          // User-defined name (e.g., "Syntactic Feature")
  createdAt: number                     // Creation timestamp
  updatedAt: number                     // Last modification timestamp
  metricSignature: MetricSignature      // Pattern definition
  featureIds: Set<number>               // Tagged features (seed features)
  rejectedFeatureIds?: Set<number>      // Features rejected for this tag (Stage 2)
  metricWeights?: MetricWeights         // Custom weights (undefined = auto-inferred)
  color: string                         // Display color (hex)
  templateSource?: string               // Template name if created from template

  // Working state fields (auto-saved when switching tags)
  workingFeatureIds?: Set<number>       // Currently selected features for this tag
  savedManualSignature?: MetricSignature // Manually adjusted signature (radar chart thresholds)
  savedCandidateStates?: Map<number, CandidateVerificationState> // Candidate verification states
}

/**
 * Feature Match - Feature matching a tag signature with similarity score
 * Used for candidate discovery in Stage 2
 */
export interface FeatureMatch {
  featureId: number                     // Feature ID
  distance: number                      // Weighted distance in metric space
  score: number                         // Similarity score (0-1, higher=better)
  metricValues: {                       // Actual metric values for this feature
    decoder_similarity: number
    embedding: number
    fuzz: number
    detection: number
    semantic_similarity: number
    quality_score: number
  }
}

/**
 * Candidate Verification State - User's verification status for a candidate
 * Used in Stage 2 workflow
 */
export type CandidateVerificationState = 'pending' | 'accepted' | 'rejected' | 'unsure'

/**
 * Tag Creation Mode - Method for defining metric signature
 */
export type TagCreationMode = 'template' | 'visual' | 'inference' | null

/**
 * Tag Template - Pre-defined tag pattern from tag.md
 */
export interface TagTemplate {
  name: string                          // Template name
  description: string                   // Description of pattern
  signature: MetricSignature            // Pre-defined metric ranges
  color: string                         // Display color
}

/**
 * Feature List Type - Used for tracking group expansion state
 */
export type FeatureListType = 'selected' | 'candidates' | 'rejected'

/**
 * Group Expansion State - Tracks which score range groups are expanded
 * Key: `${listType}:${rangeLabel}` (e.g., "candidates:1.00 - 0.95")
 * Value: boolean (true = expanded, false = collapsed)
 */
export type GroupExpansionState = Map<string, boolean>

