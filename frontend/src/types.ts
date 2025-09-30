// ============================================================================
// CONSOLIDATED TYPES FOR SAE FEATURE VISUALIZATION
// Simplified for research prototype - merged from 8 separate type files
// ============================================================================

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
// THRESHOLD TREE SYSTEM
// ============================================================================

// ============================================================================
// THRESHOLD SYSTEM
// ============================================================================

import {
  CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT,
  SPLIT_TYPE_RANGE, SPLIT_TYPE_PATTERN, SPLIT_TYPE_EXPRESSION,
  PATTERN_STATE_HIGH, PATTERN_STATE_LOW, PATTERN_STATE_IN_RANGE, PATTERN_STATE_OUT_RANGE,
  METRIC_FEATURE_SPLITTING, METRIC_SEMDIST_MEAN, METRIC_SEMDIST_MAX,
  METRIC_SCORE_FUZZ, METRIC_SCORE_SIMULATION, METRIC_SCORE_DETECTION, METRIC_SCORE_EMBEDDING,
  PANEL_LEFT, PANEL_RIGHT
} from './lib/constants'

// Category Type Definition
export enum CategoryType {
  ROOT = CATEGORY_ROOT,
  FEATURE_SPLITTING = CATEGORY_FEATURE_SPLITTING,
  SEMANTIC_DISTANCE = CATEGORY_SEMANTIC_DISTANCE,
  SCORE_AGREEMENT = CATEGORY_SCORE_AGREEMENT
}

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
  version: 2
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
}

export interface SankeyDataRequest {
  filters: Filters
  thresholdTree: ThresholdTree
  version?: number
}

export interface ComparisonDataRequest {
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

export interface ComparisonFlow {
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

export interface ComparisonData {
  flows: ComparisonFlow[]
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
  semdist_mean: number
  semdist_max: number
  scores: {
    fuzz: number
    simulation: number
    detection: number
    embedding: number
  }
  details_path: string
}

// ============================================================================
// UI AND STATE TYPES (Simplified)
// ============================================================================

export interface LoadingStates {
  filters: boolean
  histogram: boolean
  sankey: boolean
  sankeyLeft: boolean
  sankeyRight: boolean
  comparison: boolean
}

export interface ErrorStates {
  filters: string | null
  histogram: string | null
  sankey: string | null
  sankeyLeft: string | null
  sankeyRight: string | null
  comparison: string | null
}

export type ViewState = 'empty' | 'filtering' | 'visualization'

export type MetricType =
  | typeof METRIC_FEATURE_SPLITTING
  | typeof METRIC_SEMDIST_MEAN
  | typeof METRIC_SEMDIST_MAX
  | typeof METRIC_SCORE_FUZZ
  | typeof METRIC_SCORE_SIMULATION
  | typeof METRIC_SCORE_DETECTION
  | typeof METRIC_SCORE_EMBEDDING

export type NodeCategory =
  | typeof CATEGORY_ROOT
  | typeof CATEGORY_FEATURE_SPLITTING
  | typeof CATEGORY_SEMANTIC_DISTANCE
  | typeof CATEGORY_SCORE_AGREEMENT

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

export interface TooltipData {
  x: number
  y: number
  title: string
  content: Array<{ label: string; value: string | number }>
}

export interface ThresholdLineData {
  x: number
  y1: number
  y2: number
  value: number
}

// ============================================================================
// POPOVER TYPES (Simplified)
// ============================================================================

export interface HistogramPopoverData {
  nodeId: string
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

// // ============================================================================
// // COMPONENT PROP TYPES (Essential only)
// // ============================================================================

// export interface FilterPanelProps {
//   filters: Filters
//   filterOptions: FilterOptions | null
//   loading: boolean
//   onFiltersChange: (filters: Partial<Filters>) => void
// }

// export interface SankeyDiagramProps {
//   data: SankeyData | null
//   loading: boolean
//   error: string | null
//   width?: number
//   height?: number
//   onNodeClick?: (node: SankeyNode) => void
//   onLinkClick?: (link: SankeyLink) => void
// }

// export interface HistogramSliderProps {
//   histogramData: HistogramData | null
//   threshold: number
//   loading: boolean
//   error: string | null
//   onThresholdChange: (threshold: number) => void
//   onRefresh: () => void
// }