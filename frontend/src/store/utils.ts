import type { Filters, SankeyStructure, D3SankeyNode, D3SankeyLink } from '../types'

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
