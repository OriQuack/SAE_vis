import type { Filters, SankeyTreeNode, SankeyStructure, D3SankeyNode, D3SankeyLink } from '../types'
import {
  METRIC_DECODER_SIMILARITY,
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
    [METRIC_DECODER_SIMILARITY]: METRIC_DECODER_SIMILARITY,
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
    [METRIC_DECODER_SIMILARITY]: METRIC_DECODER_SIMILARITY,
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

  // Simplified 3-stage architecture
  sankeyStructure?: SankeyStructure  // Simplified structure (Stage 1/2/3)
  rootFeatureIds?: Set<number>  // All features after filtering
  d3Layout?: { nodes: D3SankeyNode[], links: D3SankeyLink[] }  // D3 layout cache
}

export const createInitialPanelState = (): PanelState => {
  return {
    filters: {
      sae_id: [],
      explanation_method: [],
      llm_explainer: [],
      llm_scorer: []
    },
    histogramData: null
  }
}
