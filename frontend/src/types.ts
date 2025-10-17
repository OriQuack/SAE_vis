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
  CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_SIMILARITY, CATEGORY_CONSISTENCY,
  SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
  PATTERN_STATE_HIGH, PATTERN_STATE_LOW, PATTERN_STATE_IN_RANGE, PATTERN_STATE_OUT_RANGE,
  METRIC_FEATURE_SPLITTING, METRIC_SEMSIM_MEAN, METRIC_SEMSIM_MAX,
  METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  PANEL_LEFT, PANEL_RIGHT
} from './lib/constants'

// Category Type Definition
export type CategoryType =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_FEATURE_SPLITTING
  | typeof CATEGORY_SEMANTIC_SIMILARITY
  | typeof CATEGORY_CONSISTENCY

// Split Rule Definitions
export interface RangeSplitRule {
  type: typeof SPLIT_TYPE_RANGE
  metric: string
  thresholds: number[]
}

export interface PatternSplitRule {
  type: typeof SPLIT_TYPE_PATTERN
  conditions: {
    [metric: string]: {
      threshold?: number
      min?: number
      max?: number
      operator?: '>' | '>=' | '<' | '<=' | '==' | '!='
    }
  }
  patterns: Array<{
    match: {
      [metric: string]: typeof PATTERN_STATE_HIGH | typeof PATTERN_STATE_LOW | typeof PATTERN_STATE_IN_RANGE | typeof PATTERN_STATE_OUT_RANGE | undefined
    }
    child_id: string
    description?: string
  }>
  default_child_id?: string
}

export interface ExpressionSplitRule {
  type: typeof SPLIT_TYPE_EXPRESSION
  available_metrics?: string[]
  branches: Array<{
    condition: string
    child_id: string
    description?: string
  }>
  default_child_id: string
}

export type SplitRule = RangeSplitRule | PatternSplitRule | ExpressionSplitRule

// Parent Path Information
export interface ParentPathInfo {
  parent_id: string
  parent_split_rule: {
    type: typeof SPLIT_TYPE_RANGE | typeof SPLIT_TYPE_PATTERN | typeof SPLIT_TYPE_EXPRESSION
    range_info?: { metric: string; thresholds: number[] }
    pattern_info?: { pattern_index: number; pattern_description?: string }
    expression_info?: { branch_index: number; condition: string; description?: string }
  }
  branch_index: number
  triggering_values?: { [metric: string]: number }
}

// Main Node Definition
export interface SankeyThreshold {
  id: string
  stage: number
  category: CategoryType
  parent_path: ParentPathInfo[]
  split_rule: SplitRule | null
  children_ids: string[]
}

// New Threshold Tree Structure for V2
export interface ThresholdTree {
  nodes: SankeyThreshold[]
  metrics: string[]
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

export interface HistogramDataRequest {
  filters: Filters
  metric: string
  bins?: number
  nodeId?: string
  thresholdTree?: ThresholdTree
  groupBy?: string  // Optional grouping field, e.g., 'llm_explainer'
  averageBy?: string | null  // Optional averaging field, e.g., 'llm_explainer' or 'llm_scorer'
  fixedDomain?: [number, number]  // Optional fixed domain for histogram bins, e.g., [0.0, 1.0]
  selectedLLMExplainers?: string[]  // Optional list of 1 or 2 selected LLM explainers from LLM Comparison panel
}

export interface SankeyDataRequest {
  filters: Filters
  thresholdTree: ThresholdTree
}

export interface AlluvialDataRequest {
  sankey_left: SankeyDataRequest
  sankey_right: SankeyDataRequest
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
  feature_ids?: number[]
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
    applied_thresholds: ThresholdTree
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
  | typeof METRIC_SEMSIM_MAX
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_SIMULATION
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
// DYNAMIC TREE BUILDER TYPES
// ============================================================================

export interface StageTypeConfig {
  id: string
  name: string
  description: string
  category: CategoryType
  defaultSplitRule: 'range' | 'pattern' | 'expression'
  defaultMetric?: string
  defaultThresholds?: number[]
}

export interface AddStageConfig {
  stageType: string
  splitRuleType: 'range' | 'pattern' | 'expression'
  metric?: string
  thresholds?: number[]
  selectedScoreMetrics?: string[]
  customConfig?: any
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
  flow: AlluvialFlowData
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

export interface ExplainerScoreData {
  embedding: number | null
  fuzz: ScorerScoreSet
  detection: ScorerScoreSet
  explanation_text?: string | null  // Explanation text for this explainer
  scorer_consistency?: Record<string, ConsistencyScore>  // Per-metric std (fuzz, detection)
  metric_consistency?: ConsistencyScore  // Cross-metric std
  explainer_consistency?: ConsistencyScore  // Semantic consistency (avg pairwise cosine)
  cross_explainer_metric_consistency?: Record<string, ConsistencyScore>  // Per-metric inverse std across explainers
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
}

export interface FeatureTableDataResponse {
  features: FeatureTableRow[]
  total_features: number
  explainer_ids: string[]
  scorer_ids: string[]
  is_averaged: boolean
  global_stats: Record<string, MetricNormalizationStats>
}

// Consistency Type for Table Header
export type ConsistencyType =
  | 'none'                           // No consistency coloring
  | 'llm_scorer_consistency'         // LLM Scorer Consistency (within-metric consistency)
  | 'within_explanation_score'       // Within-explanation score consistency
  | 'cross_explanation_score'        // Cross-explanation score consistency (individual metrics)
  | 'cross_explanation_overall_score' // Cross-explanation overall score consistency
  | 'llm_explainer_consistency'      // LLM Explainer consistency (semantic consistency)

// Table Sorting Types (simplified for new table structure)
export type SortDirection = 'asc' | 'desc' | null

export type SortBy =
  | 'featureId'
  | 'overallScore'
  | 'minConsistency'
  | 'llm_scorer_consistency'
  | 'within_explanation_score'
  | 'cross_explanation_score'
  | 'cross_explanation_overall_score'
  | 'llm_explainer_consistency'
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

/**
 * Min Consistency Result - Includes both value and type of weakest consistency
 */
export interface MinConsistencyResult {
  value: number              // Min consistency value (0-1), minimum of all types
  weakestType: ConsistencyType  // Type of consistency that had the minimum value
}