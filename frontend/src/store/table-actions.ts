import * as api from '../api'
import type { SortBy, SortDirection } from '../types'
import { mapTableSortToSankeyMetric, mapSankeyMetricToTableSort } from './utils'
import {
  PANEL_LEFT,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION
} from '../lib/constants'

// ============================================================================
// TABLE DATA ACTIONS
// ============================================================================

/**
 * Factory function to create table-related actions for the store
 */
export const createTableActions = (set: any, get: any) => ({
  /**
   * Get feature IDs from rightmost stage nodes for table filtering
   */
  getRightmostStageFeatureIds: () => {
    const state = get()
    const { leftPanel } = state

    // Use left panel's computed Sankey (main visualization)
    if (!leftPanel.computedSankey) {
      return null
    }

    // Find rightmost stage (maximum stage number)
    const nodes = leftPanel.computedSankey.nodes
    const maxStage = Math.max(...nodes.map((n: any) => n.stage))

    // Get all nodes at rightmost stage
    const rightmostNodes = nodes.filter((n: any) => n.stage === maxStage)

    // Collect all feature IDs from rightmost nodes
    const featureIds = new Set<number>()
    rightmostNodes.forEach((node: any) => {
      if (node.feature_ids) {
        node.feature_ids.forEach((id: number) => featureIds.add(id))
      }
    })

    return featureIds
  },

  /**
   * Get the metric used by the maximum stage nodes
   */
  getMaxStageMetric: () => {
    const state = get()
    const { leftPanel } = state

    if (!leftPanel.sankeyTree || leftPanel.sankeyTree.size === 0) {
      return null
    }

    // Find nodes that have children - these are parent nodes with metrics
    const nodesWithChildren = Array.from(leftPanel.sankeyTree.values()).filter(
      node => node.children.length > 0
    )

    if (nodesWithChildren.length === 0) {
      return null
    }

    // Find maximum depth among parent nodes
    const maxDepth = Math.max(...nodesWithChildren.map(n => n.depth))

    // Get parent nodes at max depth
    const maxDepthParents = nodesWithChildren.filter(n => n.depth === maxDepth)

    // Return their metric (all should have same metric at a given depth)
    return maxDepthParents[0]?.metric || null
  },

  /**
   * Synchronize table sort with the maximum Sankey stage
   */
  syncTableSortWithMaxStage: () => {
    const state = get()
    const maxStageMetric = state.getMaxStageMetric()

    if (!maxStageMetric) {
      console.log('[Store.syncTableSortWithMaxStage] No max stage metric found - clearing table sort')
      state.setTableSort(null, null, true)
      return
    }

    // Map metric to table sort key
    const tableSortKey = mapSankeyMetricToTableSort(maxStageMetric)

    if (!tableSortKey) {
      console.log('[Store.syncTableSortWithMaxStage] Metric not mappable to table sort:', maxStageMetric)
      return
    }

    console.log('[Store.syncTableSortWithMaxStage] Syncing table sort to max stage:', {
      maxStageMetric,
      tableSortKey
    })

    // Swap the metric display to show the selected metric prominently
    state.swapMetricDisplay(tableSortKey as typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION)

    // Update table sort, skip Sankey sync to prevent recursion
    state.setTableSort(tableSortKey as SortBy, 'asc', true)
  },

  /**
   * Fetch table data
   */
  fetchTableData: async () => {
    const state = get()
    const { leftPanel, rightPanel } = state

    // Collect all selected LLM explainers from both panels
    const explainers = new Set<string>()
    if (leftPanel.filters.llm_explainer) {
      leftPanel.filters.llm_explainer.forEach((e: string) => explainers.add(e))
    }
    if (rightPanel.filters.llm_explainer) {
      rightPanel.filters.llm_explainer.forEach((e: string) => explainers.add(e))
    }

    // Collect all selected LLM scorers from both panels
    const scorers = new Set<string>()
    if (leftPanel.filters.llm_scorer) {
      leftPanel.filters.llm_scorer.forEach((s: string) => scorers.add(s))
    }
    if (rightPanel.filters.llm_scorer) {
      rightPanel.filters.llm_scorer.forEach((s: string) => scorers.add(s))
    }

    // If no explainers selected, don't fetch
    if (explainers.size === 0) {
      set({ tableData: null })
      return
    }

    // Set loading state
    set((state: any) => ({
      loading: { ...state.loading, table: true },
      errors: { ...state.errors, table: null }
    }))

    try {
      // Create filter with all selected explainers and scorers
      const filters = {
        sae_id: [],
        explanation_method: [],
        llm_explainer: Array.from(explainers),
        llm_scorer: Array.from(scorers)
      }

      const tableData = await api.getTableData({ filters })
      set((state: any) => ({
        tableData,
        loading: { ...state.loading, table: false }
      }))
    } catch (error) {
      console.error('Failed to fetch table data:', error)
      set((state: any) => ({
        tableData: null,
        loading: { ...state.loading, table: false },
        errors: { ...state.errors, table: error instanceof Error ? error.message : 'Failed to fetch table data' }
      }))
    }
  },

  /**
   * Set table scroll state
   */
  setTableScrollState: (state: { scrollTop: number; scrollHeight: number; clientHeight: number } | null) => {
    set({ tableScrollState: state })
  },

  /**
   * Set table sort state - with optional Sankey synchronization
   */
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null, skipSankeySync = false) => {
    const state = get()

    // Update table sort state
    set({
      tableSortBy: sortBy,
      tableSortDirection: sortDirection
    })

    // Sync with Sankey if sorting by a mappable metric (unless skipped to prevent recursion)
    if (!skipSankeySync && sortBy && sortDirection) {
      const sankeyMetric = mapTableSortToSankeyMetric(sortBy)
      if (sankeyMetric) {
        // Check if left panel already has this metric in its tree
        const leftPanelTree = state.leftPanel.sankeyTree
        const hasMetricInTree = Array.from(leftPanelTree.values()).some(
          (node: any) => node.metric === sankeyMetric
        )

        // If metric not already in tree, add it to root node
        if (!hasMetricInTree) {
          console.log('[Store.setTableSort] Adding Sankey stage for table sort:', {
            metric: sankeyMetric
          })
          // Add unsplit stage to root node in left panel
          state.addUnsplitStageToNode('root', sankeyMetric, PANEL_LEFT)
        }
      }
    }
  },

  /**
   * Swap the metric display in the table column
   */
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION) => {
    const state = get()

    // Store the current display metric
    const currentDisplay = state.scoreColumnDisplay

    // Set the new display metric
    set({
      scoreColumnDisplay: newMetric as typeof state.scoreColumnDisplay
    })

    console.log('[Store.swapMetricDisplay] Swapped score column:', {
      from: currentDisplay,
      to: newMetric
    })
  }
})
