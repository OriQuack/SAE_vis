// TypeScript interfaces for SAE Feature Visualization API

// ============================================================================
// FILTER AND REQUEST TYPES
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
  score_high: number
}

// Legacy parent-node-based threshold system (for backward compatibility)
export interface NodeThresholds {
  [parentNodeId: string]: {
    [metric in MetricType]?: number
  }
}

// New hierarchical threshold system
export interface HierarchicalThresholds {
  global_thresholds: Thresholds

  // Feature splitting threshold groups: can be customized by different conditions
  // Key format: "condition" -> feature splitting threshold for that condition
  feature_splitting_groups?: {
    [condition: string]: number
  }

  // Semantic distance thresholds grouped by splitting parent
  // Key format: "split_{true/false}" -> threshold value for all semantic distance nodes under this splitting parent
  semantic_distance_groups?: {
    [splittingParentId: string]: number
  }

  // Score thresholds grouped by semantic distance parent
  // Key format: "split_{true/false}_semdist_{high/low}" -> score threshold values for all score nodes under this semantic distance parent
  score_agreement_groups?: {
    [semanticParentId: string]: {
      score_fuzz?: number
      score_simulation?: number
      score_detection?: number
    }
  }
}

// Threshold group types for UI management
export type ThresholdGroupType = 'semantic_distance' | 'score_agreement'

export interface ThresholdGroup {
  id: string                      // Group identifier (e.g., "split_true", "split_true_semdist_high")
  type: ThresholdGroupType        // Type of threshold group
  name: string                    // Display name for UI
  nodeIds: string[]              // List of node IDs that share this threshold group
  metrics: MetricType[]          // Which metrics this group controls
  parentGroupId?: string         // Parent group ID for hierarchical display
}

// Utility functions for threshold group management
export interface ThresholdGroupUtils {
  getGroupsForNode(nodeId: string): ThresholdGroup[]
  getSharedNodesForGroup(groupId: string): string[]
  isNodeInGroup(nodeId: string, groupId: string): boolean
  getEffectiveThreshold(nodeId: string, metric: MetricType, hierarchicalThresholds: HierarchicalThresholds): number
}

// Utility function to extract parent node ID from score agreement node
export function getParentNodeId(scoreAgreementNodeId: string): string | null {
  // Score agreement nodes have format: split_{true/false}_semdist_{high/low}_{agreement}
  // We want to extract: split_{true/false}_semdist_{high/low}
  const match = scoreAgreementNodeId.match(/^(split_\w+_semdist_\w+)_agree_\w+$/)
  return match ? match[1] : null
}

// Check if a node is a score agreement node
export function isScoreAgreementNode(nodeId: string): boolean {
  return nodeId.includes('_agree_')
}

// Check if a node is a semantic distance node
export function isSemanticDistanceNode(nodeId: string): boolean {
  return nodeId.includes('_semdist_') && !nodeId.includes('_agree_')
}

// Histogram popover state
export interface HistogramPopoverData {
  nodeId: string
  nodeName: string
  parentNodeId?: string  // For score agreement nodes, this is the semantic distance parent
  parentNodeName?: string  // Display name for the parent node
  metrics: MetricType[]  // Changed from single metric to array to support multiple histograms
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
// API REQUEST BODIES
// ============================================================================

export interface HistogramDataRequest {
  filters: Filters
  metric: string
  bins?: number
  nodeId?: string  // Optional: for node-specific histogram data
}

export interface SankeyDataRequest {
  filters: Filters
  thresholds: Thresholds  // Keep for backward compatibility
  nodeThresholds?: NodeThresholds  // Legacy per-node threshold support
  hierarchicalThresholds?: HierarchicalThresholds  // New hierarchical threshold system
}

export interface ComparisonDataRequest {
  sankey_left: SankeyDataRequest
  sankey_right: SankeyDataRequest
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface FilterOptions {
  sae_id: string[]
  explanation_method: string[]
  llm_explainer: string[]
  llm_scorer: string[]
}

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
  category: string
  parent_path?: string[]
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  metadata: {
    total_features: number
    applied_filters: Filters
    applied_thresholds: Thresholds
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
// ERROR HANDLING
// ============================================================================

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

export type ApiErrorCode =
  | 'INVALID_FILTERS'
  | 'INVALID_THRESHOLDS'
  | 'INVALID_METRIC'
  | 'INSUFFICIENT_DATA'
  | 'FEATURE_NOT_FOUND'
  | 'INTERNAL_ERROR'

// ============================================================================
// ENHANCED D3 TYPES FOR SANKEY VISUALIZATION
// ============================================================================

export interface D3SankeyNode extends SankeyNode {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
}

export interface D3SankeyLink {
  source: D3SankeyNode | string
  target: D3SankeyNode | string
  value: number
  y0?: number
  y1?: number
  width?: number
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface LoadingState {
  filters: boolean
  histogram: boolean
  sankey: boolean
  comparison: boolean
}

export interface ErrorState {
  filters: string | null
  histogram: string | null
  sankey: string | null
  comparison: string | null
}

// ============================================================================
// HISTOGRAM VISUALIZATION TYPES
// ============================================================================

export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

export interface IndividualHistogramLayout {
  bins: HistogramBin[]
  xScale: any // D3 scale function
  yScale: any // D3 scale function
  width: number
  height: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
  metric: string
  yOffset: number
  chartTitle: string
}

export interface MultiHistogramLayout {
  charts: IndividualHistogramLayout[]
  totalWidth: number
  totalHeight: number
  spacing: number
}

export interface ThresholdSliderProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

export interface FilterPanelProps {
  filters: Filters
  filterOptions: FilterOptions | null
  loading: boolean
  onFiltersChange: (filters: Partial<Filters>) => void
}

export interface HistogramSliderProps {
  histogramData: HistogramData | null
  threshold: number
  loading: boolean
  error: string | null
  onThresholdChange: (threshold: number) => void
  onRefresh: () => void
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

export interface SankeyViewProps {
  className?: string
}

// ============================================================================
// TOOLTIP TYPES
// ============================================================================

export interface TooltipData {
  x: number
  y: number
  title: string
  content: Array<{ label: string; value: string | number }>
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

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

export interface ColorScale {
  [key: string]: string
}

// ============================================================================
// API CLIENT CONFIGURATION
// ============================================================================

export interface ApiClientConfig {
  baseURL: string
  healthURL?: string  // Optional separate health endpoint URL
  timeout: number
  debounceMs: number
}

export interface ApiResponse<T> {
  data: T
  status: number
  statusText: string
}

export interface ApiClient {
  getFilterOptions(): Promise<FilterOptions>
  getHistogramData(request: HistogramDataRequest): Promise<HistogramData>
  getSankeyData(request: SankeyDataRequest): Promise<SankeyData>
  getComparisonData(request: ComparisonDataRequest): Promise<ComparisonData>
  getFeatureDetail(featureId: number, params?: Partial<Filters>): Promise<FeatureDetail>
}

// ============================================================================
// THRESHOLD GROUP UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract splitting parent ID from node ID
 * e.g., "split_true_semdist_high" -> "split_true"
 */
export function getSplittingParentId(nodeId: string): string | null {
  const match = nodeId.match(/^(split_(?:true|false))/)
  return match ? match[1] : null
}

/**
 * Extract feature splitting parent ID from node ID
 * Feature splitting is the top-level split, so we return null to use global thresholds
 */
export function getFeatureSplittingParentId(nodeId: string): string | null {
  // Feature splitting nodes should use global thresholds
  return null
}

/**
 * Extract semantic distance parent ID from score agreement node ID
 * e.g., "split_true_semdist_high_agree_all" -> "split_true_semdist_high"
 */
export function getSemanticDistanceParentId(nodeId: string): string | null {
  if (nodeId.includes('_agree_')) {
    const parts = nodeId.split('_')
    const parentParts = parts.slice(0, -2) // Remove "_agree_{type}" suffix
    return parentParts.join('_')
  }
  return null
}


/**
 * Get threshold group ID for a node based on its type
 */
export function getThresholdGroupId(nodeId: string, metric: MetricType): string | null {
  if (metric === 'feature_splitting' && (nodeId === 'split_true' || nodeId === 'split_false')) {
    // Feature splitting nodes share the same global threshold
    return 'feature_splitting_global'
  } else if (isSemanticDistanceNode(nodeId) && metric === 'semdist_mean') {
    // Semantic distance nodes share thresholds by splitting parent
    return getSplittingParentId(nodeId)
  } else if (isScoreAgreementNode(nodeId) && (metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection')) {
    // Score agreement nodes share thresholds by semantic distance parent
    return getSemanticDistanceParentId(nodeId)
  }
  return null
}

/**
 * Get all nodes that share the same threshold group
 */
export function getNodesInThresholdGroup(groupId: string, allNodes: SankeyNode[], metric: MetricType): string[] {
  return allNodes
    .filter(node => getThresholdGroupId(node.id, metric) === groupId)
    .map(node => node.id)
}

/**
 * Get effective threshold value for a node and metric using hierarchical thresholds
 */
export function getEffectiveThreshold(
  nodeId: string,
  metric: MetricType,
  hierarchicalThresholds: HierarchicalThresholds
): number {
  // For feature splitting metrics
  if (metric === 'feature_splitting') {
    // Check if there's a feature splitting group override for the parent node
    const splittingParent = getFeatureSplittingParentId(nodeId)
    if (splittingParent && hierarchicalThresholds.feature_splitting_groups?.[splittingParent]) {
      return hierarchicalThresholds.feature_splitting_groups[splittingParent]
    }
    return hierarchicalThresholds.global_thresholds.feature_splitting
  }

  // For semantic distance metrics
  if (metric === 'semdist_mean') {
    const splittingParent = getSplittingParentId(nodeId)
    if (splittingParent && hierarchicalThresholds.semantic_distance_groups?.[splittingParent]) {
      return hierarchicalThresholds.semantic_distance_groups[splittingParent]
    }
    return hierarchicalThresholds.global_thresholds.semdist_mean
  }

  // For score metrics
  if (metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') {
    const semanticParent = getSemanticDistanceParentId(nodeId)
    if (semanticParent && hierarchicalThresholds.score_agreement_groups?.[semanticParent]) {
      const groupThresholds = hierarchicalThresholds.score_agreement_groups[semanticParent]
      const thresholdValue = groupThresholds[metric]
      if (thresholdValue !== undefined) {
        return thresholdValue
      }
    }
    return hierarchicalThresholds.global_thresholds.score_high
  }

  // Default fallback
  return hierarchicalThresholds.global_thresholds.score_high
}

/**
 * Create hierarchical thresholds from legacy node thresholds
 */
export function createHierarchicalThresholds(
  globalThresholds: Thresholds,
  nodeThresholds?: NodeThresholds
): HierarchicalThresholds {
  const hierarchical: HierarchicalThresholds = {
    global_thresholds: globalThresholds
  }

  if (!nodeThresholds) {
    return hierarchical
  }

  const semanticGroups: { [key: string]: number } = {}
  const scoreGroups: { [key: string]: { [key: string]: number } } = {}

  // Convert legacy nodeThresholds to hierarchical format
  for (const [nodeId, metrics] of Object.entries(nodeThresholds)) {
    // Handle semantic distance nodes
    if (isSemanticDistanceNode(nodeId) && metrics.semdist_mean !== undefined) {
      const splittingParent = getSplittingParentId(nodeId)
      if (splittingParent) {
        semanticGroups[splittingParent] = metrics.semdist_mean
      }
    }

    // Handle score agreement nodes
    if (isScoreAgreementNode(nodeId)) {
      const semanticParent = getSemanticDistanceParentId(nodeId)
      if (semanticParent) {
        if (!scoreGroups[semanticParent]) {
          scoreGroups[semanticParent] = {}
        }

        if (metrics.score_fuzz !== undefined) {
          scoreGroups[semanticParent].score_fuzz = metrics.score_fuzz
        }
        if (metrics.score_simulation !== undefined) {
          scoreGroups[semanticParent].score_simulation = metrics.score_simulation
        }
        if (metrics.score_detection !== undefined) {
          scoreGroups[semanticParent].score_detection = metrics.score_detection
        }
      }
    }
  }

  if (Object.keys(semanticGroups).length > 0) {
    hierarchical.semantic_distance_groups = semanticGroups
  }
  if (Object.keys(scoreGroups).length > 0) {
    hierarchical.score_agreement_groups = scoreGroups
  }

  return hierarchical
}