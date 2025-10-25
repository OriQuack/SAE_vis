import * as api from '../api'
import type { SortBy, SortDirection, SankeyTreeNode } from '../types'
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
    const allNodes = Array.from(leftPanel.sankeyTree.values()) as SankeyTreeNode[]
    const nodesWithChildren = allNodes.filter(
      (node) => node.children.length > 0
    )

    if (nodesWithChildren.length === 0) {
      return null
    }

    // Find maximum depth among parent nodes
    const maxDepth = Math.max(...nodesWithChildren.map((n) => n.depth))

    // Get parent nodes at max depth
    const maxDepthParents = nodesWithChildren.filter((n) => n.depth === maxDepth)

    // Return their metric (all should have same metric at a given depth)
    return maxDepthParents[0]?.metric || null
  },

  /**
   * Find the rightmost node that contains the most visible table features.
   * This is the node where new stages should be added when table is sorted.
   * Uses scroll state to determine which vertical bar node is most visible.
   */
  getRightmostNodeWithScrollIndicator: () => {
    const state = get()
    const { leftPanel, tableScrollState } = state

    if (!leftPanel.computedSankey || !tableScrollState) {
      return 'root' // Fallback to root if no scroll state
    }

    // Get all vertical bar nodes (rightmost stage)
    const verticalBarNodes = leftPanel.computedSankey.nodes.filter(
      (n: any) => n.node_type === 'vertical_bar'
    )

    if (verticalBarNodes.length === 0) {
      return 'root'
    }

    // Calculate which node contains the most visible features
    const totalFeatureCount = leftPanel.computedSankey.nodes[0]?.feature_count || 0
    const scrollPercentage = tableScrollState.scrollTop /
      (tableScrollState.scrollHeight - tableScrollState.clientHeight)
    const visiblePercentage = tableScrollState.clientHeight / tableScrollState.scrollHeight

    const visibleStart = Math.floor(scrollPercentage * totalFeatureCount)
    const visibleEnd = Math.ceil((scrollPercentage + visiblePercentage) * totalFeatureCount)

    let maxOverlap = 0
    let targetNodeId = 'root'
    let currentIndex = 0

    for (const node of verticalBarNodes) {
      const nodeStartIndex = currentIndex
      const nodeEndIndex = nodeStartIndex + node.feature_count

      // Calculate overlap with visible range
      const overlapStart = Math.max(visibleStart, nodeStartIndex)
      const overlapEnd = Math.min(visibleEnd, nodeEndIndex)
      const overlap = Math.max(0, overlapEnd - overlapStart)

      if (overlap > maxOverlap) {
        maxOverlap = overlap
        targetNodeId = node.id
      }

      currentIndex = nodeEndIndex
    }

    // Verify the target node exists in the tree
    // (placeholder_vertical_bar only exists in computedSankey, not in tree)
    if (!leftPanel.sankeyTree.has(targetNodeId)) {
      console.log('[Store.getRightmostNodeWithScrollIndicator] Target node not in tree, using root:', targetNodeId)
      return 'root'
    }

    return targetNodeId
  },

  /**
   * Find a node with the specified metric anywhere in the tree.
   * Returns the node ID where the metric is found, or null if not found.
   */
  findNodeWithMetric: (metric: string) => {
    const state = get()
    const tree = state.leftPanel.sankeyTree

    for (const [nodeId, node] of tree.entries()) {
      if (node.metric === metric) {
        return nodeId
      }
    }

    return null
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
   * Set table sort state - with Sankey synchronization.
   * If the metric is new, adds it to the rightmost node with scroll indicator.
   * If the metric already exists, resets the tree and adds the metric to root.
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
        // Check if metric already exists in tree
        const existingNodeId = state.findNodeWithMetric(sankeyMetric)

        if (existingNodeId) {
          // Metric exists - reset tree and add to root
          console.log('[Store.setTableSort] Metric exists, resetting tree and adding to root:', {
            metric: sankeyMetric,
            existingNode: existingNodeId
          })

          // Get thresholds from existing node (if any)
          const tree = state.leftPanel.sankeyTree
          const existingNode = tree.get(existingNodeId)
          const preservedThresholds = existingNode?.thresholds || []

          // Reset: remove all stages from root (clears entire tree)
          state.removeNodeStage('root', PANEL_LEFT)

          // Add metric to root
          if (preservedThresholds.length > 0) {
            state.addUnsplitStageToNode('root', sankeyMetric, PANEL_LEFT).then(() => {
              state.updateNodeThresholds('root', preservedThresholds, PANEL_LEFT)
            })
          } else {
            state.addUnsplitStageToNode('root', sankeyMetric, PANEL_LEFT)
          }
        } else {
          // New metric - add to rightmost node with scroll indicator
          const targetNodeId = state.getRightmostNodeWithScrollIndicator()

          console.log('[Store.setTableSort] Adding new stage to node with scroll indicator:', {
            metric: sankeyMetric,
            targetNode: targetNodeId
          })

          state.addUnsplitStageToNode(targetNodeId, sankeyMetric, PANEL_LEFT)
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
