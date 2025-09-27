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

/**
 * Represents a node in the hierarchical threshold tree.
 * A node can be a final category (a leaf) or it can be split further (a branch).
 */
export interface ThresholdNode {
  /**
   * A unique identifier or name for this category/node.
   * e.g., 'root', 'split_true', 'split_true_semdist_high', etc.
   */
  id: string

  /**
   * Optional metric name this node uses for evaluation.
   * Used for histogram display and threshold visualization.
   */
  metric?: string

  /**
   * The rule for splitting this node into children.
   * If this property is undefined or null, the node is considered a "leaf" node,
   * representing a final category with no further subdivisions.
   */
  split?: {
    /**
     * An ordered array of threshold values. The number of thresholds determines
     * the number of resulting child branches.
     * - 1 threshold (e.g., [50]) creates 2 branches (<50, >=50).
     * - 2 thresholds (e.g., [30, 80]) create 3 branches (<30, 30-80, >=80).
     * - 3 thresholds (e.g., [10, 20, 30]) create 4 branches.
     */
    thresholds: number[]

    /**
     * The child nodes that result from applying the thresholds.
     *
     * IMPORTANT: The length of this array must be exactly `thresholds.length + 1`.
     *
     * The order is significant and maps directly to the ranges created by the thresholds:
     * - `children[0]` is for values < `thresholds[0]`
     * - `children[i]` is for values >= `thresholds[i-1]` and < `thresholds[i]`
     * - The last child is for values >= the last threshold.
     */
    children: ThresholdNode[]
  }
}

/**
 * Complete threshold tree structure with metadata
 */
export interface ThresholdTree {
  root: ThresholdNode
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
}

export interface SankeyDataRequest {
  filters: Filters
  thresholdTree: ThresholdTree
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