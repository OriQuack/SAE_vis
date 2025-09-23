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

// ============================================================================
// API REQUEST BODIES
// ============================================================================

export interface HistogramDataRequest {
  filters: Filters
  metric: string
  bins?: number
  nodeId?: string
}

export interface SankeyDataRequest {
  filters: Filters
  thresholds: Thresholds
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