import * as api from '../api'
import type { SortBy, SortDirection, SankeyTreeNode } from '../types'
import {
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION
} from '../lib/constants'
import { TAG_CATEGORIES } from '../lib/tag-categories'

// ============================================================================
// TABLE DATA ACTIONS
// ============================================================================

/**
 * Factory function to create table-related actions for the store
 */
export const createTableActions = (set: any, get: any) => ({
  /**
   * Toggle node selection for table filtering
   */
  toggleNodeSelection: (nodeId: string) => {
    const state = get()
    const { tableSelectedNodeIds } = state

    const isSelected = tableSelectedNodeIds.includes(nodeId)

    if (isSelected) {
      // Deselect node
      set({
        tableSelectedNodeIds: tableSelectedNodeIds.filter((id: string) => id !== nodeId)
      })
      console.log('[Store.toggleNodeSelection] Deselected node:', nodeId)
    } else {
      // Select node
      set({
        tableSelectedNodeIds: [...tableSelectedNodeIds, nodeId]
      })
      console.log('[Store.toggleNodeSelection] Selected node:', nodeId)
    }

    // No need to re-fetch - TablePanel will filter existing data via useMemo
    // based on tableSelectedNodeIds state change
  },

  /**
   * Clear all node selections
   */
  clearNodeSelection: () => {
    set({ tableSelectedNodeIds: [] })
    console.log('[Store.clearNodeSelection] Cleared all selections')

    // No need to re-fetch - TablePanel will show all features automatically
  },

  /**
   * Get feature IDs from all selected nodes
   */
  getSelectedNodeFeatures: () => {
    const state = get()
    const { tableSelectedNodeIds, leftPanel } = state

    if (tableSelectedNodeIds.length === 0) {
      return null // No selection - show all features
    }

    // Collect feature IDs from all selected nodes
    const featureIds = new Set<number>()

    for (const nodeId of tableSelectedNodeIds) {
      const node = leftPanel.sankeyTree.get(nodeId)
      if (node?.featureIds) {
        node.featureIds.forEach((id: number) => featureIds.add(id))
      }
    }

    console.log('[Store.getSelectedNodeFeatures] Got features from selection:', {
      nodeCount: tableSelectedNodeIds.length,
      featureCount: featureIds.size
    })

    return featureIds
  },


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

      // Store all data - filtering by selection happens in TablePanel component
      set((state: any) => ({
        tableData,
        loading: { ...state.loading, table: false }
      }))

      // 🚀 SMART PRE-FETCHING: Immediately fetch ALL activation examples
      // This batches main features + similar features into ONE API call
      // so components render instantly from cache (no loading states)
      console.log('[Store.fetchTableData] Table data loaded, starting pre-fetch of activation examples')
      const updatedState = get()
      await updatedState.prefetchAllActivationData()
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
   * Set table sort state - reorders table display only (does NOT modify Sankey)
   */
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null) => {
    // Update table sort state
    set({
      tableSortBy: sortBy,
      tableSortDirection: sortDirection
    })

    console.log('[Store.setTableSort] Table sort updated (display only):', { sortBy, sortDirection })
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
  },

  // ============================================================================
  // STAGE TABLE ACTIONS (Dedicated stage-specific table views)
  // ============================================================================

  /**
   * Set active stage node for dedicated stage table view
   */
  setActiveStageNode: (nodeId: string | null, category?: string | null) => {
    console.log('[Store.setActiveStageNode] 🔍 DEBUG: Called with:', { nodeId, category })

    set({
      activeStageNodeId: nodeId,
      activeStageCategory: category || null
    })

    const state = get()
    console.log('[Store.setActiveStageNode] 🔍 DEBUG: State after set:', {
      activeStageNodeId: state.activeStageNodeId,
      activeStageCategory: state.activeStageCategory
    })
    console.log('[Store.setActiveStageNode] ✅ Set active stage node:', nodeId, 'category:', category)
  },

  /**
   * Clear active stage node and return to normal table view
   */
  clearActiveStageNode: () => {
    set({
      activeStageNodeId: null,
      activeStageCategory: null
    })
    console.log('[Store.clearActiveStageNode] Cleared active stage node')
  },

  /**
   * Activate table view for a specific tag category
   * Maps category ID to the appropriate node and sets active stage state
   */
  activateCategoryTable: (categoryId: string) => {
    const category = TAG_CATEGORIES[categoryId]

    if (!category) {
      console.error('[Store.activateCategoryTable] ❌ Invalid category:', categoryId)
      return
    }

    console.log('[Store.activateCategoryTable] 🎯 Activating category:', {
      categoryId,
      label: category.label,
      metric: category.metric
    })

    // Find node with this category's metric in left panel
    let nodeId: string | null = null

    if (category.metric) {
      // For metric-based categories (Feature Splitting, Quality), find node with that metric
      nodeId = get().findNodeWithMetric(category.metric)

      if (!nodeId) {
        console.warn('[Store.activateCategoryTable] ⚠️  No node found with metric:', category.metric)
        console.warn('[Store.activateCategoryTable] Using fallback nodeId: root')
        nodeId = 'root'  // Fallback to root
      }
    } else {
      // For non-metric categories (Cause), use root as fallback
      nodeId = 'root'
    }

    console.log('[Store.activateCategoryTable] ✅ Activating:', {
      categoryId,
      nodeId,
      metric: category.metric
    })

    // Set active stage node with the category ID
    get().setActiveStageNode(nodeId, categoryId)
  }
})
