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

export interface Thresholds {
  feature_splitting: number
  semdist_mean: number
  score_fuzz: number
  score_detection: number
  score_simulation: number
}

export interface HierarchicalThresholds {
  global_thresholds: Thresholds
  score_agreement_groups?: Record<string, Record<string, number>>
  individual_node_groups?: Record<string, Record<string, number>>
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
}

export interface SankeyDataRequest {
  filters: Filters
  hierarchicalThresholds: HierarchicalThresholds
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
  parent_path?: string[]
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
    applied_thresholds: HierarchicalThresholds
  }
}

export interface ComparisonFlow {
  source_node: string
  target_node: string
  feature_count: number
  feature_ids: number[]
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
  comparison: boolean
}

export interface ErrorStates {
  filters: string | null
  histogram: string | null
  sankey: string | null
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
// APP STATE TYPE (Simplified - No Slices)
// ============================================================================

export interface AppState {
  // Core data
  filters: Filters
  filterOptions: FilterOptions | null
  hierarchicalThresholds: HierarchicalThresholds
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null

  // UI state
  viewState: ViewState
  popoverState: PopoverState
  loading: LoadingStates
  errors: ErrorStates

  // Actions
  setFilters: (filters: Partial<Filters>) => void
  setGlobalThresholds: (thresholds: Partial<Thresholds>) => void
  setHistogramData: (data: Record<string, HistogramData> | null) => void
  setSankeyData: (data: SankeyData | null) => void
  setLoading: (key: keyof LoadingStates, value: boolean) => void
  setError: (key: keyof ErrorStates, error: string | null) => void
  showHistogramPopover: (
    nodeId: string,
    nodeName: string,
    metrics: MetricType[],
    position: { x: number; y: number },
    parentNodeId?: string,
    parentNodeName?: string
  ) => void
  hideHistogramPopover: () => void

  // API actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (metric: MetricType, nodeId?: string) => Promise<void>
  fetchSankeyData: () => Promise<void>
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

export const INITIAL_THRESHOLDS: Thresholds = {
  feature_splitting: 0.1,
  semdist_mean: 0.1,
  score_fuzz: 0.5,
  score_detection: 0.5,
  score_simulation: 0.2,
}

export const INITIAL_LOADING: LoadingStates = {
  filters: false,
  histogram: false,
  sankey: false,
  comparison: false
}

export const INITIAL_ERRORS: ErrorStates = {
  filters: null,
  histogram: null,
  sankey: null,
  comparison: null
}

export const INITIAL_POPOVER_STATE: PopoverState = {
  histogram: null
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Utility function to extract parent node ID from score agreement node
 */
export function getParentNodeId(scoreAgreementNodeId: string): string | undefined {
  // Score agreement nodes have format: split_{true/false}_semdist_{high/low}_{agreement}
  // We want to extract: split_{true/false}_semdist_{high/low}
  const match = scoreAgreementNodeId.match(/^(split_\w+_semdist_\w+)_agree_\w+$/)
  return match ? match[1] : undefined
}

/**
 * Check if a node is a score agreement node
 */
export function isScoreAgreementNode(nodeId: string): boolean {
  return nodeId.includes('_agree_')
}