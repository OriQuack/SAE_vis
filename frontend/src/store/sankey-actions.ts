import * as api from '../api'
import type { MetricType, SankeyTreeNode } from '../types'
import {
  processFeatureGroupResponse,
  convertTreeToSankeyStructure,
  calculateThresholdFromPercentile,
  calculatePercentileFromThreshold,
  getFeatureMetricValues,
  precomputePercentileMap
} from '../lib/threshold-utils'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'
import { AVAILABLE_STAGES } from '../components/SankeyOverlay'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

// ============================================================================
// TREE-BASED THRESHOLD SYSTEM ACTIONS
// ============================================================================

/**
 * Factory function to create tree-based actions for the store
 */
export const createTreeActions = (set: any, get: any) => ({
  /**
   * Initialize the Sankey tree with root node containing all features.
   * Gets initial feature count from filters.
   */
  initializeSankeyTree: (panel: PanelSide = PANEL_LEFT) => {
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'

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

    set((state: any) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: new Map([['root', rootNode]])
      }
    }))
  },

  /**
   * Load actual feature IDs for the root node from the backend.
   * Calls /api/feature-groups with empty thresholds to get all features.
   */
  loadRootFeatures: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, sankeyTree } = state[panelKey]

    console.log(`[Store.loadRootFeatures] 🌱 Loading root features for ${panel}`)

    if (!sankeyTree || !sankeyTree.has('root')) {
      console.error('[Store.loadRootFeatures] ❌ Root node not found in tree')
      return
    }

    try {
      // Call API with empty thresholds to get all features
      const response = await api.getFeatureGroups({
        filters,
        metric: 'root',
        thresholds: []
      })

      // Process response - should have single group with all features
      const groups = processFeatureGroupResponse(response)
      if (groups.length === 0) {
        console.warn('[Store.loadRootFeatures] ⚠️  No groups returned from API')
        return
      }

      const rootGroup = groups[0]
      console.log(`[Store.loadRootFeatures] ✅ Loaded ${rootGroup.featureCount} features for root node`)

      // Update root node with actual feature IDs
      const updatedRoot: SankeyTreeNode = {
        ...sankeyTree.get('root')!,
        featureIds: rootGroup.featureIds,
        featureCount: rootGroup.featureCount
      }

      const newTree = new Map(sankeyTree)
      newTree.set('root', updatedRoot)

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Compute Sankey tree to activate tree-based system immediately
      console.log(`[Store.loadRootFeatures] 🔄 Computing Sankey tree to activate tree-based system...`)
      get().recomputeSankeyTree(panel)
      console.log(`[Store.loadRootFeatures] ✅ Tree-based system now active - old API will be skipped`)
    } catch (error) {
      console.error('[Store.loadRootFeatures] ❌ Failed to load root features:', error)
    }
  },

  /**
   * Add a new stage to a node by immediately splitting it with default thresholds.
   * Gets default thresholds from AVAILABLE_STAGES config and creates split children.
   */
  addStageToNode: async (nodeId: string, metric: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { filters, sankeyTree } = state[panelKey]

    console.log(`[Store.addStageToNode] 🎯 Called for ${panel}:`, {
      nodeId,
      metric,
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addStageToNode] ❌ Node ${nodeId} not found in tree`)
      return
    }

    // Get default thresholds from AVAILABLE_STAGES config
    const stageConfig = AVAILABLE_STAGES.find(s => s.metric === metric)
    if (!stageConfig || !stageConfig.thresholds || stageConfig.thresholds.length === 0) {
      console.error(`[Store.addStageToNode] ❌ No default thresholds found for metric: ${metric}`)
      return
    }

    const defaultThresholds = [...stageConfig.thresholds]
    console.log(`[Store.addStageToNode] 📐 Using default thresholds: ${defaultThresholds.join(', ')}`)

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      const node = sankeyTree.get(nodeId)!

      // Fetch table data if not cached
      let { tableData } = state
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.log('[Store.addStageToNode] Fetching table data...')
        await get().fetchTableData()
        tableData = get().tableData
      }

      // Fetch feature groups from backend with default thresholds
      console.log(`[Store.addStageToNode] 🔍 Fetching groups for ${metric}:${defaultThresholds.join(',')}`)
      const response = await api.getFeatureGroups({ filters, metric, thresholds: defaultThresholds })
      const groups = processFeatureGroupResponse(response)

      const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
      const parentNode = newTree.get(nodeId)!

      // Calculate percentiles and pre-compute mappings for handle positioning
      let percentiles: number[] | undefined = undefined
      let percentileMap: Map<number, number> | undefined = undefined

      if (tableData && tableData.features) {
        try {
          const metricValues = await getFeatureMetricValues(node.featureIds, metric, tableData)

          if (metricValues.length > 0) {
            percentiles = defaultThresholds.map(threshold =>
              calculatePercentileFromThreshold(metricValues, threshold)
            )

            percentileMap = precomputePercentileMap(metricValues,
              [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
               0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])

            console.log(`[Store.addStageToNode] ✓ Percentiles: ${percentiles.map(p => p.toFixed(2)).join(', ')}`)
            console.log(`[Store.addStageToNode] ✓ PercentileMap computed with ${percentileMap.size} entries`)
          }
        } catch (error) {
          console.error('[Store.addStageToNode] ❌ Failed to compute percentiles:', error)
          throw new Error('Failed to compute percentile mappings - cannot proceed without exact threshold calculations')
        }
      }

      // Delete old children if any
      parentNode.children.forEach(childId => newTree.delete(childId))
      parentNode.children = []

      // Create new children from groups
      for (const [index, group] of groups.entries()) {
        const intersectedFeatures = new Set<number>()

        if (parentNode.id === 'root' || parentNode.featureCount === 0) {
          // Root node - use all features from group
          group.featureIds.forEach(id => intersectedFeatures.add(id))
        } else {
          // Intersect with parent node's features
          for (const id of group.featureIds) {
            if (parentNode.featureIds.has(id)) {
              intersectedFeatures.add(id)
            }
          }
        }

        const childId = `${nodeId}_stage${parentNode.depth + 1}_group${index}`
        const childNode: SankeyTreeNode = {
          id: childId,
          parentId: nodeId,
          metric: null,
          thresholds: [],
          depth: parentNode.depth + 1,
          children: [],
          featureIds: intersectedFeatures,
          featureCount: intersectedFeatures.size,
          rangeLabel: group.rangeLabel
        }

        newTree.set(childId, childNode)
        parentNode.children.push(childId)
      }

      // Update parent's metric, thresholds, and percentile metadata
      parentNode.metric = metric
      parentNode.thresholds = defaultThresholds
      if (percentiles && percentiles.length > 0) {
        parentNode.percentiles = percentiles
        parentNode.thresholdSource = 'metric'
      }
      if (percentileMap) {
        parentNode.percentileToMetricMap = percentileMap
      } else {
        console.error('[Store.addStageToNode] ❌ PercentileMap is missing - this should never happen!')
      }
      newTree.set(nodeId, { ...parentNode })

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      console.log(`[Store.addStageToNode] 🌳 Tree updated with ${groups.length} children for node ${nodeId}`)

      // Fetch histogram data for the new metric (for node overlay visualization)
      console.log(`[Store.addStageToNode] 📊 Fetching histogram data for metric: ${metric}`)
      try {
        await state.fetchHistogramData(metric as MetricType, nodeId, panel)
        console.log(`[Store.addStageToNode] ✅ Histogram data fetched`)
      } catch (error) {
        console.warn(`[Store.addStageToNode] ⚠️ Failed to fetch histogram data:`, error)
      }

      // Recompute Sankey structure
      console.log(`[Store.addStageToNode] 🔄 Calling recomputeSankeyTree...`)
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
      console.log(`[Store.addStageToNode] ✅ Stage addition complete with immediate split!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add stage'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[Store.addStageToNode] ❌ Error:', error)
    }
  },

  /**
   * Update thresholds for a rightmost stage node.
   * Only nodes whose children are all leaf nodes can have their thresholds updated.
   * This simplification eliminates the need for complex subtree rebuilding.
   */
  updateNodeThresholds: async (nodeId: string, thresholds: number[], panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { filters, sankeyTree } = state[panelKey]

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.updateNodeThresholds] Node ${nodeId} not found`)
      return
    }

    const node = sankeyTree.get(nodeId)!
    if (!node.metric) {
      console.error(`[Store.updateNodeThresholds] Node ${nodeId} has no metric`)
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Fetch table data if not cached
      let { tableData } = state
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.log('[Store.updateNodeThresholds] Fetching table data...')
        await get().fetchTableData()
        tableData = get().tableData
      }

      // Fetch new groups from API
      console.log(`[Store.updateNodeThresholds] Fetching groups for ${node.metric}:${thresholds.join(',')}`)
      const response = await api.getFeatureGroups({ filters, metric: node.metric, thresholds })
      const groups = processFeatureGroupResponse(response)

      const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
      const parentNode = newTree.get(nodeId)!

      // Calculate percentiles and pre-compute mappings for handle positioning
      let percentiles: number[] | undefined = undefined
      let percentileMap: Map<number, number> | undefined = undefined

      if (tableData && tableData.features) {
        try {
          const metricValues = await getFeatureMetricValues(node.featureIds, node.metric, tableData)

          if (metricValues.length > 0) {
            percentiles = thresholds.map(threshold =>
              calculatePercentileFromThreshold(metricValues, threshold)
            )

            percentileMap = precomputePercentileMap(metricValues,
              [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
               0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])

            console.log(`[Store.updateNodeThresholds] Percentiles: ${percentiles.map(p => p.toFixed(2)).join(', ')}`)
          }
        } catch (error) {
          console.warn('[Store.updateNodeThresholds] Failed to compute percentiles:', error)
        }
      }

      // Delete old children (no recursion needed - children are guaranteed to be leaves)
      parentNode.children.forEach(childId => newTree.delete(childId))
      parentNode.children = []

      // Create new children from groups
      for (const [index, group] of groups.entries()) {
        const intersectedFeatures = new Set<number>()

        if (parentNode.id === 'root' || parentNode.featureCount === 0) {
          // Root node - use all features from group
          group.featureIds.forEach(id => intersectedFeatures.add(id))
        } else {
          // Intersect with parent node's features
          for (const id of group.featureIds) {
            if (parentNode.featureIds.has(id)) {
              intersectedFeatures.add(id)
            }
          }
        }

        const childId = `${nodeId}_stage${parentNode.depth + 1}_group${index}`
        const childNode: SankeyTreeNode = {
          id: childId,
          parentId: nodeId,
          metric: null,
          thresholds: [],
          depth: parentNode.depth + 1,
          children: [],
          featureIds: intersectedFeatures,
          featureCount: intersectedFeatures.size,
          rangeLabel: group.rangeLabel
        }

        newTree.set(childId, childNode)
        parentNode.children.push(childId)
      }

      // Update parent's thresholds and percentile metadata
      parentNode.thresholds = thresholds
      if (percentiles && percentiles.length > 0) {
        parentNode.percentiles = percentiles
        parentNode.thresholdSource = 'metric'
      }
      if (percentileMap) {
        parentNode.percentileToMetricMap = percentileMap
      }
      newTree.set(nodeId, { ...parentNode })

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Recompute Sankey
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
      console.log(`[Store.updateNodeThresholds] ✅ Threshold update complete`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update thresholds'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
    }
  },

  /**
   * Update thresholds for a node using percentile-based positioning.
   *
   * This enables visual/percentile-based splitting where users position handles
   * visually (e.g., 40% of node height) and we calculate the metric thresholds
   * that split features at those percentiles.
   *
   * @param nodeId - Node ID to update
   * @param percentiles - Percentile positions (0-1 array, e.g., [0.4, 0.8])
   * @param panel - Which panel (left or right)
   */
  updateNodeThresholdsByPercentile: async (nodeId: string, percentiles: number[], panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]
    let { tableData } = state

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.updateNodeThresholdsByPercentile] Node ${nodeId} not found`)
      return
    }

    const node = sankeyTree.get(nodeId)!
    if (!node.metric) {
      console.error(`[Store.updateNodeThresholdsByPercentile] Node ${nodeId} has no metric`)
      return
    }

    try {
      console.log(`[Store.updateNodeThresholdsByPercentile] Converting percentiles ${percentiles.join(',')} to thresholds for ${node.metric}`)

      // Fetch table data if not cached
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.log('[Store.updateNodeThresholdsByPercentile] Fetching table data...')
        await get().fetchTableData()
        tableData = get().tableData

        if (!tableData || !tableData.features) {
          console.error('[Store.updateNodeThresholdsByPercentile] Failed to fetch table data')
          return
        }
      }

      // Get metric values and compute percentile mappings
      const metricValues = await getFeatureMetricValues(node.featureIds, node.metric, tableData)

      if (metricValues.length === 0) {
        console.error(`[Store.updateNodeThresholdsByPercentile] No metric values found for node ${nodeId}`)
        return
      }

      const percentileMap = precomputePercentileMap(metricValues,
        [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
         0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])

      const thresholds = percentiles.map(percentile =>
        calculateThresholdFromPercentile(metricValues, percentile)
      )

      console.log(`[Store.updateNodeThresholdsByPercentile] Thresholds: ${thresholds.join(', ')}`)

      // Store percentile metadata in node
      const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
      const updatedNode = newTree.get(nodeId)!
      updatedNode.percentiles = percentiles
      updatedNode.thresholdSource = 'percentile'
      updatedNode.percentileToMetricMap = percentileMap

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Call standard threshold update with calculated metric values
      await get().updateNodeThresholds(nodeId, thresholds, panel)

      // Re-apply percentile metadata (updateNodeThresholds creates new tree)
      const finalState = get()
      const finalTree = new Map<string, SankeyTreeNode>(finalState[panelKey].sankeyTree)
      const finalNode = finalTree.get(nodeId)
      if (finalNode) {
        finalNode.percentiles = percentiles
        finalNode.thresholdSource = 'percentile'
        finalNode.percentileToMetricMap = percentileMap
        set((state: any) => ({
          [panelKey]: {
            ...state[panelKey],
            sankeyTree: finalTree
          }
        }))
      }

      console.log(`[Store.updateNodeThresholdsByPercentile] ✅ Update complete`)
    } catch (error) {
      console.error(`[Store.updateNodeThresholdsByPercentile] Error:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update thresholds by percentile'
      const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
      state.setError(errorKey, errorMessage)
    }
  },

  /**
   * Recompute Sankey structure from the tree.
   * Converts tree to flat nodes and links for D3 rendering.
   */
  recomputeSankeyTree: (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.recomputeSankeyTree] 🔄 Called for ${panel}:`, {
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree) {
      console.warn('[Store.recomputeSankeyTree] ⚠️  No tree available')
      return
    }

    try {
      // Use the utility function to convert tree to Sankey structure
      const computedSankey = convertTreeToSankeyStructure(sankeyTree)

      console.log(`[Store.recomputeSankeyTree] ✅ Computed Sankey for ${panel}:`, {
        nodes: computedSankey.nodes.length,
        links: computedSankey.links.length,
        maxDepth: computedSankey.maxDepth
      })

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          computedSankey
        }
      }))

      console.log(`[Store.recomputeSankeyTree] 💾 Stored computedSankey in ${panelKey}`)

      // Update alluvial flows if both panels have data
      get().updateAlluvialFlows()
    } catch (error) {
      console.error('[Store.recomputeSankeyTree] ❌ Failed to recompute Sankey:', error)
    }
  },

  /**
   * Remove a node's children (stage removal).
   * Removes all descendants of the specified node.
   */
  removeNodeStage: (nodeId: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.removeNodeStage] Node ${nodeId} not found`)
      return
    }

    const newTree = new Map<string, SankeyTreeNode>(sankeyTree)

    // Recursive function to remove all descendants
    const removeDescendants = (nodeId: string) => {
      const node = newTree.get(nodeId)
      if (!node) return

      node.children.forEach((childId: string) => {
        removeDescendants(childId)
        newTree.delete(childId)
      })
      node.children = []
    }

    // Remove all descendants
    removeDescendants(nodeId)

    // Clear metric and thresholds from parent node
    const parentNode = newTree.get(nodeId)
    if (parentNode) {
      parentNode.metric = null
      parentNode.thresholds = []
      newTree.set(nodeId, { ...parentNode })
    }

    set((state: any) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: newTree,
        // Also clear histogram data for this node
        histogramData: Object.fromEntries(
          Object.entries(state[panelKey].histogramData || {}).filter(
            ([key]) => !key.startsWith(`${nodeId}_`)
          )
        )
      }
    }))

    // Recompute Sankey
    get().recomputeSankeyTree(panel)
  }
})
