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
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-categories'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

// ============================================================================
// TREE-BASED THRESHOLD SYSTEM ACTIONS
// ============================================================================

/**
 * Helper function to find nodes containing any of the specified feature IDs
 * @param sankeyTree - The tree to search
 * @param featureIds - Set of feature IDs to search for
 * @returns Array of node IDs that contain any of the specified features
 */
export const getNodesContainingFeatures = (
  sankeyTree: Map<string, SankeyTreeNode> | null | undefined,
  featureIds: Set<number>
): string[] => {
  if (!sankeyTree || featureIds.size === 0) {
    return []
  }

  const matchingNodeIds: string[] = []

  for (const [nodeId, node] of sankeyTree.entries()) {
    // Check if any selected feature is in this node's feature set
    for (const featureId of featureIds) {
      if (node.featureIds.has(featureId)) {
        matchingNodeIds.push(nodeId)
        break // Found a match, no need to check more features for this node
      }
    }
  }

  return matchingNodeIds
}

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
   * Initialize the fixed 3-stage Sankey tree structure.
   * Automatically expands the tree to: Root → Feature Splitting → Quality → Cause
   *
   * Terminal nodes (high similarity, high quality) are marked with stage=3 and not expanded.
   * This replaces the old interactive "add stage" workflow with a fixed structure
   * based on tag categories.
   */
  initializeFixedSankeyTree: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[Store.initializeFixedSankeyTree] 🚀 Initializing fixed 3-stage structure for ${panel}`)

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Stage 1: Initialize and load root features
      get().initializeSankeyTree(panel)
      await get().loadRootFeatures(panel)

      // Get updated state after root loading
      const currentState = get()
      const { sankeyTree } = currentState[panelKey]

      if (!sankeyTree || !sankeyTree.has('root')) {
        throw new Error('Root node not initialized')
      }

      // Stage 2: Expand Feature Splitting stage (decoder_similarity, threshold [0.4])
      console.log('[Store.initializeFixedSankeyTree] 📊 Building Stage 1: Feature Splitting')
      await get().addStageToNodeInternal('root', TAG_CATEGORY_FEATURE_SPLITTING, panel)

      // Mark high similarity nodes (last group) as terminal
      const afterStage1 = get()
      const stage1Tree = afterStage1[panelKey].sankeyTree
      const rootNode = stage1Tree?.get('root')

      if (rootNode && rootNode.children.length > 0) {
        const highSimilarityNodeId = rootNode.children[rootNode.children.length - 1]
        const highSimilarityNode = stage1Tree?.get(highSimilarityNodeId)
        if (highSimilarityNode) {
          // Mark as terminal at stage 3
          highSimilarityNode.stage = 3
          stage1Tree?.set(highSimilarityNodeId, { ...highSimilarityNode })
          console.log(`[Store.initializeFixedSankeyTree] 🎯 Marked high similarity node ${highSimilarityNodeId} as terminal (stage=3)`)
        }
      }

      // Stage 3: Expand Quality stage for non-terminal Feature Splitting children
      console.log('[Store.initializeFixedSankeyTree] 📊 Building Stage 2: Quality')
      const afterMarkingStage1 = get()
      const updatedStage1Tree = afterMarkingStage1[panelKey].sankeyTree
      const updatedRootNode = updatedStage1Tree?.get('root')

      if (updatedRootNode && updatedRootNode.children.length > 0) {
        // Add Quality stage only to non-terminal children (all except last)
        for (let i = 0; i < updatedRootNode.children.length - 1; i++) {
          const childId = updatedRootNode.children[i]
          await get().addStageToNodeInternal(childId, TAG_CATEGORY_QUALITY, panel)
        }
      }

      // Mark high quality nodes (last group of each quality split) as terminal
      const afterStage2 = get()
      const stage2Tree = afterStage2[panelKey].sankeyTree

      if (stage2Tree && updatedRootNode) {
        // For each non-terminal Feature Splitting child
        for (let i = 0; i < updatedRootNode.children.length - 1; i++) {
          const featureSplittingNodeId = updatedRootNode.children[i]
          const featureSplittingNode = stage2Tree.get(featureSplittingNodeId)

          if (featureSplittingNode && featureSplittingNode.children.length > 0) {
            const highQualityNodeId = featureSplittingNode.children[featureSplittingNode.children.length - 1]
            const highQualityNode = stage2Tree.get(highQualityNodeId)
            if (highQualityNode) {
              // Mark as terminal at stage 3
              highQualityNode.stage = 3
              stage2Tree.set(highQualityNodeId, { ...highQualityNode })
              console.log(`[Store.initializeFixedSankeyTree] 🎯 Marked high quality node ${highQualityNodeId} as terminal (stage=3)`)
            }
          }
        }
      }

      // Stage 4: Expand Cause stage for non-terminal Quality children
      console.log('[Store.initializeFixedSankeyTree] 📊 Building Stage 3: Cause')
      const afterMarkingStage2 = get()
      const updatedStage2Tree = afterMarkingStage2[panelKey].sankeyTree

      if (updatedStage2Tree) {
        // Find all nodes at depth 2 without stage override (non-terminal quality nodes)
        const allNodes = Array.from(updatedStage2Tree.values()) as SankeyTreeNode[]
        const depth2Nodes = allNodes.filter(
          node => node.depth === 2 && node.stage === undefined
        )

        for (const node of depth2Nodes) {
          await get().addCauseStage(node.id, panel)
        }
      }

      state.setLoading(loadingKey, false)
      console.log('[Store.initializeFixedSankeyTree] ✅ Fixed 3-stage tree initialized successfully!')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize fixed Sankey tree'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[Store.initializeFixedSankeyTree] ❌ Error:', error)
    }
  },

  /**
   * Internal function to add a metric-based stage to a node.
   * Used by initializeFixedSankeyTree for Feature Splitting and Quality stages.
   */
  addStageToNodeInternal: async (nodeId: string, categoryId: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { filters, sankeyTree } = state[panelKey]

    const category = TAG_CATEGORIES[categoryId]
    if (!category || !category.metric) {
      console.error(`[Store.addStageToNodeInternal] ❌ Invalid category or no metric: ${categoryId}`)
      return
    }

    const metric = category.metric
    const defaultThresholds = category.defaultThresholds

    console.log(`[Store.addStageToNodeInternal] 🎯 Adding ${category.label} stage to ${nodeId}`)
    console.log(`[Store.addStageToNodeInternal] 📐 Using metric: ${metric}, thresholds: ${defaultThresholds.join(', ')}`)

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addStageToNodeInternal] ❌ Node ${nodeId} not found in tree`)
      return
    }

    try {
      const node = sankeyTree.get(nodeId)!

      // Table data should already be loaded by initializeWithDefaultFilters()
      let { tableData } = state
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.error('[Store.addStageToNodeInternal] ❌ Table data not loaded - should be fetched before tree building')
        throw new Error('Table data must be loaded before building Sankey tree. Call fetchTableData() first.')
      }

      // Fetch feature groups from backend with default thresholds
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

            console.log(`[Store.addStageToNodeInternal] ✓ Percentiles: ${percentiles.map(p => p.toFixed(2)).join(', ')}`)
          }
        } catch (error) {
          console.error('[Store.addStageToNodeInternal] ❌ Failed to compute percentiles:', error)
          throw new Error('Failed to compute percentile mappings')
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
      }
      newTree.set(nodeId, { ...parentNode })

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      console.log(`[Store.addStageToNodeInternal] 🌳 Tree updated with ${groups.length} children for node ${nodeId}`)

      // Fetch histogram data if this category shows histograms
      if (category.showHistogram) {
        console.log(`[Store.addStageToNodeInternal] 📊 Fetching histogram data for metric: ${metric}`)
        try {
          await state.fetchHistogramData(metric as MetricType, nodeId, panel)
        } catch (error) {
          console.warn(`[Store.addStageToNodeInternal] ⚠️ Failed to fetch histogram data:`, error)
        }
      }

      // Recompute Sankey structure
      get().recomputeSankeyTree(panel)

      // Auto-activate decoder similarity table if this is Feature Splitting stage
      if (categoryId === TAG_CATEGORY_FEATURE_SPLITTING && panel === PANEL_LEFT) {
        console.log('[Store.addStageToNodeInternal] 🎯 Auto-activating decoder similarity table for node:', nodeId)
        get().setActiveStageNode(nodeId, TAG_CATEGORY_FEATURE_SPLITTING)
      }

      console.log(`[Store.addStageToNodeInternal] ✅ ${category.label} stage added successfully`)
    } catch (error) {
      console.error('[Store.addStageToNodeInternal] ❌ Error:', error)
      throw error
    }
  },

  /**
   * Add the Cause stage with pre-defined tag groups (no metric-based splitting).
   * All features initially go into the "Unsure" group.
   */
  addCauseStage: async (nodeId: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.addCauseStage] 🎯 Adding Cause stage to ${nodeId}`)

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addCauseStage] ❌ Node ${nodeId} not found in tree`)
      return
    }

    const category = TAG_CATEGORIES[TAG_CATEGORY_CAUSE]
    const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
    const parentNode = newTree.get(nodeId)!

    // Delete old children if any
    parentNode.children.forEach(childId => newTree.delete(childId))
    parentNode.children = []

    // Create 4 pre-defined groups: Missed Context, Missed Lexicon, Noisy Activation, Unsure
    // Initially, all features go into "Unsure" group
    category.tags.forEach((tag, _index) => {
      const childId = `${nodeId}_stage${parentNode.depth + 1}_${tag.toLowerCase().replace(/\s+/g, '_')}`

      const childNode: SankeyTreeNode = {
        id: childId,
        parentId: nodeId,
        metric: null,
        thresholds: [],
        depth: parentNode.depth + 1,
        children: [],
        featureIds: tag === 'Unsure' ? new Set(parentNode.featureIds) : new Set<number>(),
        featureCount: tag === 'Unsure' ? parentNode.featureCount : 0,
        rangeLabel: tag
      }

      newTree.set(childId, childNode)
      parentNode.children.push(childId)
    })

    // Mark parent as having Cause category (no metric, no thresholds)
    parentNode.metric = null
    parentNode.thresholds = []
    newTree.set(nodeId, { ...parentNode })

    set((state: any) => ({
      [panelKey]: {
        ...state[panelKey],
        sankeyTree: newTree
      }
    }))

    console.log(`[Store.addCauseStage] 🌳 Created ${category.tags.length} Cause groups (all features in "Unsure")`)

    // Recompute Sankey structure
    get().recomputeSankeyTree(panel)

    console.log(`[Store.addCauseStage] ✅ Cause stage added successfully`)
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
      // Table data should already be loaded by initialization
      let { tableData } = state
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.error('[Store.updateNodeThresholds] ❌ Table data not loaded - cannot update thresholds')
        throw new Error('Table data must be loaded before updating thresholds')
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

      // Table data should already be loaded by initialization
      if (!tableData || !tableData.features || tableData.features.length === 0) {
        console.error('[Store.updateNodeThresholdsByPercentile] ❌ Table data not loaded - cannot update thresholds by percentile')
        throw new Error('Table data must be loaded before updating thresholds by percentile')
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
