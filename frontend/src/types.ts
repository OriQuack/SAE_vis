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
  METRIC_DECODER_SIMILARITY, METRIC_SEMANTIC_SIMILARITY,
  METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  PANEL_LEFT, PANEL_RIGHT
} from './lib/constants'

// ============================================================================
// NEW TREE-BASED THRESHOLD SYSTEM (Feature Group + Intersection)
// ============================================================================

/**
 * Stage Definition - Simplified stage configuration for new system
 */
/**
 * Feature Group - Group of features within threshold range
 */
export interface FeatureGroup {
  groupIndex: number
  rangeLabel: string
  featureIds: Set<number>
  featureCount: number
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
  color?: { L: number; a: number; b: number }  // CIELAB color for hierarchical coloring
  colorHex?: string                   // Cached hex color (converted from LAB)
}

// ============================================================================
// FIXED 3-STAGE SANKEY NODE TYPES (Simplified Architecture)
// ============================================================================

/**
 * Sankey node type for fixed 3-stage architecture
 */
export type SankeyNodeType = 'regular' | 'segment' | 'terminal'

/**
 * Node segment for progressive reveal - represents a hidden child in a segment node
 */
export interface NodeSegment {
  tagName: string         // Tag name (e.g., "Monosemantic", "Fragmented")
  featureIds: Set<number> // Features in this segment
  featureCount: number    // Number of features
  color: string          // Hex color for this tag
  height: number         // Visual height (0-1, proportional)
  yPosition: number      // Y position (0-1, normalized)
}

/**
 * Base properties for all Sankey nodes
 */
export interface BaseSankeyNode {
  id: string
  type: SankeyNodeType
  featureIds: Set<number>
  featureCount: number
  parentId: string | null
  depth: number
  tagName?: string
  color?: string
}

/**
 * Regular Sankey node - standard rectangle
 */
export interface RegularSankeyNode extends BaseSankeyNode {
  type: 'regular'
}

/**
 * Terminal Sankey node - solid vertical bar at rightmost position (no further expansion)
 */
export interface TerminalSankeyNode extends BaseSankeyNode {
  type: 'terminal'
  position: 'rightmost'
}

/**
 * Segment Sankey node - single vertical bar with colored segments representing hidden children
 */
export interface SegmentSankeyNode extends BaseSankeyNode {
  type: 'segment'
  metric: string | null
  threshold: number | null
  segments: NodeSegment[]
}

/**
 * Union type for all node types
 */
export type SimplifiedSankeyNode = RegularSankeyNode | TerminalSankeyNode | SegmentSankeyNode

/**
 * Simplified Sankey structure for fixed 3-stage system
 */
export interface SankeyStructure {
  nodes: SimplifiedSankeyNode[]
  links: SankeyLink[]
  currentStage: 1 | 2 | 3 | 4
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
  colorHex?: string  // Hierarchical color (from HierarchicalColorAssigner)
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

export interface AlluvialFlow {
  source: string
  target: string
  value: number
  feature_ids: number[]
  sourceCategory: string
  targetCategory: string
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

export type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

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

export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: LayoutMargin
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
  // NEW: Longest n-gram above threshold (preferred for display)
  best_char_ngram_text?: string | null // Longest char n-gram above Jaccard threshold
  best_word_ngram_text?: string | null // Longest word n-gram above Jaccard threshold
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

export interface TableDataRequest {
  filters: Filters
}

export interface MetricNormalizationStats {
  min: number
  max: number
}

export interface FeatureTableDataResponse {
  features: FeatureTableRow[]
  total_features: number
  explainer_ids: string[]
  scorer_ids: string[]
  global_stats: Record<string, MetricNormalizationStats>
}

// ============================================================================
// SIMILARITY SORT TYPES
// ============================================================================

/**
 * Tag Source - How a tag was created
 * 'click' = Direct user click (full weight in SVM)
 * 'threshold' = Applied via threshold batch (reduced weight in SVM)
 * 'predicted' = SVM prediction (not sent to backend)
 */
export type TagSource = 'click' | 'threshold' | 'predicted'

/**
 * Weighted Feature ID - Feature ID with source for SVM sample weighting
 */
export interface WeightedFeatureId {
  id: number
  source: 'click' | 'threshold'  // Only 'click' and 'threshold' sent to backend
}

/**
 * Weighted Pair Key - Pair key with source for SVM sample weighting
 */
export interface WeightedPairKey {
  key: string
  source: 'click' | 'threshold'  // Only 'click' and 'threshold' sent to backend
}

/**
 * Cause Selection Item - Cause category with source for SVM sample weighting
 */
export interface CauseSelectionItem {
  category: string
  source: 'click' | 'threshold'  // Only 'click' and 'threshold' sent to backend
}

/**
 * Similarity Sort Request - Request for similarity-based feature sorting
 */
export interface SimilaritySortRequest {
  selected_items: WeightedFeatureId[]    // Feature items marked as selected (✓)
  rejected_items: WeightedFeatureId[]    // Feature items marked as rejected (✗)
  feature_ids: number[]                  // All feature IDs in current table view
}

/**
 * Feature Score - Feature ID with similarity score
 */
export interface FeatureScore {
  feature_id: number
  score: number  // Higher = more similar to selected, less similar to rejected
}

/**
 * Similarity Sort Response - Response from similarity sort API
 */
export interface SimilaritySortResponse {
  sorted_features: FeatureScore[]
  total_features: number
  weights_used: number[]  // Normalized weights for each metric
}

/**
 * Pair Similarity Sort Request - Sort pairs by similarity
 * Uses 19-dimensional vectors: 9 metrics (main) + 9 metrics (similar) + 1 pair metric
 */
export interface PairSimilaritySortRequest {
  selected_items: WeightedPairKey[]  // Pair items marked as selected (✓)
  rejected_items: WeightedPairKey[]  // Pair items marked as rejected (✗)
  pair_keys: string[]                // All pair keys in current table view
}

/**
 * Pair Score - Pair key with similarity score
 */
export interface PairScore {
  pair_key: string  // Format: "main_id-similar_id"
  score: number     // Higher = more similar to selected, less similar to rejected
}

/**
 * Pair Similarity Sort Response - Response from pair similarity sort API
 */
export interface PairSimilaritySortResponse {
  sorted_pairs: PairScore[]
  total_pairs: number
  weights_used: number[]  // 10 weights: 9 feature metrics (applied to both) + 1 pair metric
}

// ============================================================================
// SIMILARITY HISTOGRAM TYPES (for automatic tagging)
// ============================================================================

/**
 * Histogram Data Structure
 */
export interface SimilarityHistogramData {
  bins: number[]       // Bin centers
  counts: number[]     // Count in each bin
  bin_edges: number[]  // Bin edge values (length = bins.length + 1)
}

/**
 * Histogram Statistics
 */
export interface SimilarityHistogramStatistics {
  min: number
  max: number
  mean: number
  median: number
}

/**
 * GMM Component - Single Gaussian Mixture Model component parameters
 */
export interface GMMComponent {
  mean: number
  variance: number
  weight: number
}

/**
 * Bimodality Info - Raw data from bimodality detection (state determined by frontend)
 */
export interface BimodalityInfo {
  dip_pvalue: number           // P-value from Hartigan's Dip test
  bic_k1: number               // BIC for 1-component GMM
  bic_k2: number               // BIC for 2-component GMM
  gmm_components: [GMMComponent, GMMComponent]  // 2 components sorted by mean (ascending)
  sample_size: number          // Number of data points used in analysis
}

/**
 * Category Bimodality Info - Bimodality info for a single category's SVM decision margins
 */
export interface CategoryBimodalityInfo {
  category: string
  bimodality: BimodalityInfo
}

/**
 * Multi-Modality Info - Aggregate multi-modality across all categories
 */
export interface MultiModalityInfo {
  category_results: CategoryBimodalityInfo[]
  aggregate_score: number  // Combined score (0-1 normalized)
  sample_size: number
}

/**
 * Multi-Modality Response - Response from multi-modality test API
 */
export interface MultiModalityResponse {
  multimodality: MultiModalityInfo
}

/**
 * Committee Vote Info - Vote information from Query by Committee (QBC) approach
 */
export interface CommitteeVoteInfo {
  svm_prediction: 0 | 1         // SVM prediction (0 or 1)
  rf_prediction: 0 | 1          // Random Forest prediction (0 or 1)
  mlp_prediction: 0 | 1         // MLP prediction (0 or 1)
  vote_entropy: number          // Vote entropy (0 to ~1.58 for 3 models)
}

/**
 * Similarity Score Histogram Response - Distribution of similarity scores
 */
export interface SimilarityScoreHistogramResponse {
  scores: Record<string, number>  // Map of feature_id/pair_key to similarity score
  histogram: SimilarityHistogramData
  statistics: SimilarityHistogramStatistics
  total_items: number
  bimodality?: BimodalityInfo  // Bimodality detection results
  committee_votes?: Record<string, CommitteeVoteInfo> | null  // Vote info from RF/MLP committee (QBC)
}

/**
 * Flip Tracking Info - Tracks decision boundary stability over tagging iterations
 */
export interface FlipTrackingInfo {
  flipHistory: Array<{
    flipRate: number
    isBatch: boolean
    iteration: number
    predictionCounts?: Record<string, number>  // { selected: 450, rejected: 120 } or cause categories
    flipTransitions?: Record<string, number>   // { 'selected→rejected': 10, 'rejected→selected': 5 }
  }>  // max 10 iterations
  totalIterations: number       // Total iterations so far (for x-axis after window slides)
  flippedBins: Set<number>      // Bin indices with flips (current iteration)
  previousPredictions: Map<number | string, 'selected' | 'rejected'>  // For next flip calc
}

/**
 * Similarity Histogram Request - Request for feature similarity histogram
 */
export interface SimilarityHistogramRequest {
  selected_items: WeightedFeatureId[]  // Feature items marked as selected (✓)
  rejected_items: WeightedFeatureId[]  // Feature items marked as rejected (✗)
  feature_ids: number[]                // All feature IDs to compute scores for
}

/**
 * Pair Similarity Histogram Request - Request for pair similarity histogram
 */
export interface PairSimilarityHistogramRequest {
  selected_items: WeightedPairKey[]  // Pair items marked as selected (✓)
  rejected_items: WeightedPairKey[]  // Pair items marked as rejected (✗)
  // Legacy flow: explicit pair keys
  pair_keys?: string[]          // All pair keys to compute scores for
  // Simplified flow: feature IDs + threshold to generate pairs server-side
  feature_ids?: number[]        // Feature IDs (backend generates pairs)
  threshold?: number            // Clustering threshold for pair generation
}

// ============================================================================
// CAUSE SIMILARITY TYPES (Multi-class One-vs-Rest SVM)
// ============================================================================
// SANKEY TO SELECTION FLOW TYPES (Flow visualization from Sankey segments to SelectionBar)
// ============================================================================

/**
 * Sankey Segment Selection - Identifies a selected segment in the Sankey diagram
 */
export interface SankeySegmentSelection {
  nodeId: string          // Sankey node ID
  segmentIndex: number    // Index of segment within node (0-based)
  panel: typeof PANEL_LEFT | typeof PANEL_RIGHT  // Which panel the segment is from
}

/**
 * Selection Category Type - Categories in the SelectionBar
 * - confirmed: manually selected
 * - autoSelected: auto-selected via threshold (preview only, becomes manual after Apply)
 * - rejected: manually rejected
 * - autoRejected: auto-rejected via threshold (preview only, becomes manual after Apply)
 * - unsure: not tagged
 */
export type SelectionCategory = 'confirmed' | 'autoSelected' | 'rejected' | 'autoRejected' | 'unsure'

/**
 * Sankey To Selection Flow - Represents a flow from a Sankey segment to a SelectionBar category
 */
export interface SankeyToSelectionFlow {
  id: string                        // Unique flow ID: "{nodeId}_{segmentIndex}_to_{category}"
  sourceNodeId: string             // Source Sankey node ID
  sourceSegmentIndex: number       // Source segment index
  targetCategory: SelectionCategory  // Target SelectionBar category
  featureCount: number             // Number of features flowing
  featureIds: number[]             // Feature IDs in this flow
  color: string                    // Flow color (from segment color)
  opacity: number                  // Flow opacity (0-1)
}

/**
 * Flow Path Data - Contains calculated path and position data for rendering
 */
export interface FlowPathData extends SankeyToSelectionFlow {
  pathD: string                    // SVG path data (d attribute)
  strokeWidth: number              // Calculated stroke width based on feature count
  sourceX: number                  // Source position X (in overlay coordinates)
  sourceY: number                  // Source position Y (in overlay coordinates)
  targetX: number                  // Target position X (in overlay coordinates)
  targetY: number                  // Target position Y (in overlay coordinates)
}

// ============================================================================
// UMAP PROJECTION TYPES
// ============================================================================

/**
 * Position for a single explainer (for detail view)
 */
export interface ExplainerPosition {
  explainer: string
  x: number
  y: number
  nearest_anchor?: string
  score_embedding?: number
  score_fuzz?: number
  score_detection?: number
  avg_score?: number
  is_best: boolean
}

/**
 * UMAP Point - Single point in UMAP 2D projection (best explainer position)
 */
export interface UmapPoint {
  feature_id: number
  x: number  // Best explainer X
  y: number  // Best explainer Y
  cluster_id: number  // HDBSCAN cluster ID (-1 for noise)
  decision_margin?: number  // Min distance to decision boundary (only for SVM classification)
  nearest_anchor?: string   // Nearest anchor of best explainer
  explainer_positions?: ExplainerPosition[]  // All explainer positions (for detail view)
}

/**
 * Cause Classification Request - Classify features using OvR SVM
 */
export interface CauseClassificationRequest {
  feature_ids: number[]
  cause_selections: Record<number, string>  // Map of feature_id to cause category (manual tags only)
}

/**
 * Cause Classification Result - SVM classification for a single feature
 */
export interface CauseClassificationResult {
  feature_id: number
  predicted_category: string
  decision_margin: number
  decision_scores: Record<string, number>  // per-category SVM decision function values
}

/**
 * Cause Classification Response - Classification results for features
 */
export interface CauseClassificationResponse {
  results: CauseClassificationResult[]
  total_features: number
  category_counts: Record<string, number>
  // Committee votes for disagreement highlighting (optional - only returned if QBC is enabled)
  committee_votes?: Record<number, {
    svm_category: string
    rf_category: string
    mlp_category: string
  }>
}

// ============================================================================
// STAGE 3 QUALITY SCORES TYPES (Using Stage 2 SVM)
// ============================================================================

/**
 * Stage 3 Quality Scores Request - Request for Stage 3 quality histogram
 *
 * Trains an SVM on Stage 2's final Well-Explained vs Need Revision selections,
 * then scores all specified feature_ids to determine their proximity to the
 * Well-Explained decision boundary.
 */
export interface Stage3QualityScoresRequest {
  well_explained_items: WeightedFeatureId[]  // Stage 2 selected with sources (SVM positive class)
  need_revision_items: WeightedFeatureId[]   // Stage 2 rejected with sources (SVM negative class)
  feature_ids: number[]                      // Features to score (typically = need_revision_ids)
}

// Stage3QualityScoresResponse reuses SimilarityScoreHistogramResponse
// (same structure: scores, histogram, statistics, bimodality, total_items)

// ============================================================================
// CONSENSUS TYPES (for explanation consensus visualization)
// ============================================================================

/**
 * Single phrase within a cluster
 */
export interface ClusterPhrase {
  text: string
  explainer: string
  distance_to_medoid: number
  activation_similarity: number
}

/**
 * Single item in consensus results (medoid or outlier)
 */
export interface ConsensusItem {
  cluster_id: number              // -1 for outliers
  phrase: string
  explainer: string
  activation_similarity: number
  is_outlier: boolean
  cluster_size?: number           // Only for clusters
  cluster_coherence?: number      // Only for clusters
  cluster_phrases?: ClusterPhrase[]  // Only for clusters
}

/**
 * Response from feature consensus API
 */
export interface ConsensusResponse {
  feature_id: number
  consensus_score: number
  num_clusters: number
  num_outliers: number
  items: ConsensusItem[]
}
