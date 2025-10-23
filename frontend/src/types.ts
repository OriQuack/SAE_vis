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
  CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_SIMILARITY,
  METRIC_FEATURE_SPLITTING, METRIC_SEMSIM_MEAN,
  METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  PANEL_LEFT, PANEL_RIGHT
} from './lib/constants'

// Category Type Definition
export type CategoryType =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_FEATURE_SPLITTING
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
  thresholds: number[]                // Threshold values for this node
  depth: number                       // Depth in tree (0 for root)
  children: string[]                  // Child node IDs
  featureIds: Set<number>             // Feature IDs at this node
  featureCount: number                // Count of features
  rangeLabel: string                  // Display label (e.g., "< 0.5", "0.5-0.8", "> 0.8")
}

/**
 * Cached Feature Groups - Global cache for feature groups to avoid redundant backend calls
 * Key format: "metric:threshold1,threshold2,..."
 */
export interface CachedFeatureGroups {
  [key: string]: FeatureGroup[]      // Cached groups indexed by metric and thresholds
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
  metric: string      // Metric name (e.g., "feature_splitting", "overall_score")
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
  feature_splitting: number
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
  | typeof METRIC_FEATURE_SPLITTING
  | typeof METRIC_SEMSIM_MEAN
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_DETECTION
  | typeof METRIC_SCORE_EMBEDDING

export type NodeCategory =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_FEATURE_SPLITTING
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

export interface ConsistencyScore {
  value: number  // 0-1 range
  method: string  // e.g., "coefficient_variation", "normalized_std"
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
  fuzz: ScorerScoreSet
  detection: ScorerScoreSet
  explanation_text?: string | null  // Explanation text for this explainer
  highlighted_explanation?: HighlightedExplanation | null  // Highlighted explanation with syntax highlighting
  llm_scorer_consistency?: Record<string, ConsistencyScore>  // Per-metric std (fuzz, detection)
  within_explanation_metric_consistency?: ConsistencyScore  // Cross-metric std
  llm_explainer_consistency?: ConsistencyScore  // Semantic consistency (avg pairwise cosine)
  cross_explanation_metric_consistency?: Record<string, ConsistencyScore>  // Per-metric inverse std across explainers (embedding, fuzz, detection)
  cross_explanation_overall_score_consistency?: ConsistencyScore  // Quality score inverse std across explainers (same value for all explainers within a feature)
}

export interface FeatureTableRow {
  feature_id: number
  explainers: Record<string, ExplainerScoreData>
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
  | 'overallScore'
  | typeof METRIC_SCORE_DETECTION
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_EMBEDDING
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

