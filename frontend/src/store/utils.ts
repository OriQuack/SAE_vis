import type { Filters, SankeyStructure, D3SankeyNode, D3SankeyLink } from '../types'

// ============================================================================
// CAUSE SIGNATURE UTILITY
// ============================================================================

const CAUSE_CATEGORIES_FOR_SIGNATURE = ['noisy-activation', 'missed-N-gram', 'missed-context']

/**
 * Compute a stable signature for cause classification state.
 * Only tracks cause-category IDs (click/threshold + CAUSE_CATEGORIES).
 * Well-explained tags are excluded because they don't affect SVM training data,
 * so tagging well-explained should not trigger reclassification.
 */
export function computeCauseSignature(
  states: Map<number, string>,
  sources: Map<number, string>
): string {
  const manualIds: number[] = []
  states.forEach((category, featureId) => {
    const source = sources.get(featureId)
    if ((source === 'click' || source === 'threshold') && CAUSE_CATEGORIES_FOR_SIGNATURE.includes(category)) {
      manualIds.push(featureId)
    }
  })
  return manualIds.sort((a, b) => a - b).join(',')
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
