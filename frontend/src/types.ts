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

// Category Type Definition
export enum CategoryType {
  ROOT = "root",
  FEATURE_SPLITTING = "feature_splitting",
  SEMANTIC_DISTANCE = "semantic_distance",
  SCORE_AGREEMENT = "score_agreement"
}

// Split Rule Definitions
export interface RangeSplitRule {
  type: 'range'
  metric: string
  thresholds: number[]
}

export interface PatternSplitRule {
  type: 'pattern'
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
      [metric: string]: 'high' | 'low' | 'in_range' | 'out_range' | undefined
    }
    child_id: string
    description?: string
  }>
  default_child_id?: string
}

export interface ExpressionSplitRule {
  type: 'expression'
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
    type: 'range' | 'pattern' | 'expression'
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
export interface ThresholdTreeV2 {
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
  thresholdTree?: ThresholdTreeV2
}

export interface SankeyDataRequest {
  filters: Filters
  thresholdTree: ThresholdTreeV2
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
    applied_thresholds: ThresholdTreeV2
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
  | 'feature_splitting'
  | 'semdist_mean'
  | 'semdist_max'
  | 'score_fuzz'
  | 'score_simulation'
  | 'score_detection'
  | 'score_embedding'

export type NodeCategory =
  | 'root'
  | 'feature_splitting'
  | 'semantic_distance'
  | 'score_agreement'

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
  parentNodeId?: string
  parentNodeName?: string
  metrics: MetricType[]
  position: {
    x: number
    y: number
  }
  visible: boolean
  panel?: 'left' | 'right'
}

export interface PopoverState {
  histogram: HistogramPopoverData | null
}

// ============================================================================
// COMPONENT PROP TYPES (Essential only)
// ============================================================================

export interface FilterPanelProps {
  filters: Filters
  filterOptions: FilterOptions | null
  loading: boolean
  onFiltersChange: (filters: Partial<Filters>) => void
}

export interface SankeyDiagramProps {
  data: SankeyData | null
  loading: boolean
  error: string | null
  width?: number
  height?: number
  onNodeClick?: (node: SankeyNode) => void
  onLinkClick?: (link: SankeyLink) => void
}

export interface HistogramSliderProps {
  histogramData: HistogramData | null
  threshold: number
  loading: boolean
  error: string | null
  onThresholdChange: (threshold: number) => void
  onRefresh: () => void
}


// ============================================================================
// CONSTANTS (Simplified)
// ============================================================================

export const INITIAL_FILTERS: Filters = {
  sae_id: [],
  explanation_method: [],
  llm_explainer: [],
  llm_scorer: []
}

export const INITIAL_LOADING: LoadingStates = {
  filters: false,
  histogram: false,
  sankey: false,
  sankeyLeft: false,
  sankeyRight: false,
  comparison: false
}

export const INITIAL_ERRORS: ErrorStates = {
  filters: null,
  histogram: null,
  sankey: null,
  sankeyLeft: null,
  sankeyRight: null,
  comparison: null
}

export const INITIAL_POPOVER_STATE: PopoverState = {
  histogram: null
}