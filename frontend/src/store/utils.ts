import type { Filters, SankeyTreeNode } from '../types'
import {
  METRIC_FEATURE_SPLITTING,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION
} from '../lib/constants'

// ============================================================================
// METRIC MAPPING UTILITIES
// ============================================================================

/**
 * Maps table sort keys to Sankey metrics
 * Returns null if no mapping exists
 */
export const mapTableSortToSankeyMetric = (sortBy: string | null): string | null => {
  if (!sortBy) return null

  const mappings: Record<string, string> = {
    [METRIC_FEATURE_SPLITTING]: METRIC_FEATURE_SPLITTING,
    [METRIC_SEMANTIC_SIMILARITY]: METRIC_SEMANTIC_SIMILARITY,
    [METRIC_QUALITY_SCORE]: METRIC_QUALITY_SCORE,
    [METRIC_SCORE_EMBEDDING]: METRIC_SCORE_EMBEDDING,
    [METRIC_SCORE_FUZZ]: METRIC_SCORE_FUZZ,
    [METRIC_SCORE_DETECTION]: METRIC_SCORE_DETECTION
  }

  return mappings[sortBy] || null
}

/**
 * Maps Sankey metrics to table sort keys
 * Returns null if no mapping exists
 */
export const mapSankeyMetricToTableSort = (metric: string | null): string | null => {
  if (!metric) return null

  const mappings: Record<string, string> = {
    [METRIC_FEATURE_SPLITTING]: METRIC_FEATURE_SPLITTING,
    [METRIC_SEMANTIC_SIMILARITY]: METRIC_SEMANTIC_SIMILARITY,
    [METRIC_QUALITY_SCORE]: METRIC_QUALITY_SCORE,
    [METRIC_SCORE_EMBEDDING]: METRIC_SCORE_EMBEDDING,
    [METRIC_SCORE_FUZZ]: METRIC_SCORE_FUZZ,
    [METRIC_SCORE_DETECTION]: METRIC_SCORE_DETECTION
  }

  return mappings[metric] || null
}

// ============================================================================
// PANEL STATE INITIALIZATION
// ============================================================================

export interface PanelState {
  filters: Filters
  histogramData: Record<string, any> | null
  sankeyTree: Map<string, SankeyTreeNode>
  computedSankey?: any
}

export const createInitialPanelState = (): PanelState => {
  // Initialize tree-based system with root node
  const rootNode: SankeyTreeNode = {
    id: 'root',
    parentId: null,
    metric: null,
    thresholds: [],
    depth: 0,
    children: [],
    featureIds: new Set(),
    featureCount: 0,
    rangeLabel: 'All Features'
  }

  return {
    filters: {
      sae_id: [],
      explanation_method: [],
      llm_explainer: [],
      llm_scorer: []
    },
    histogramData: null,
    sankeyTree: new Map([['root', rootNode]])
  }
}
