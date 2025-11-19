import * as api from '../api'
import type { MetricType, SankeyTreeNode } from '../types'
import {
  processFeatureGroupResponse,
  convertTreeToSankeyStructure,
  calculateThresholdFromPercentile,
  calculatePercentileFromThreshold,
  getFeatureMetricValues,
  precomputePercentileMap,
  groupFeaturesByThresholds
} from '../lib/threshold-utils'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-constants'
import { HierarchicalColorAssigner } from '../lib/hierarchical-colors'

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
   * Initialize Sankey tree with root node only.
   * Stages are built on-demand when user clicks category tabs.
   */
  initializeFixedSankeyTree: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[Store.initializeFixedSankeyTree] 🚀 Initializing root node for ${panel}`)

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Initialize and load root features only
      get().initializeSankeyTree(panel)
      await get().loadRootFeatures(panel)

      state.setLoading(loadingKey, false)
      console.log('[Store.initializeFixedSankeyTree] ✅ Root initialized - stages build on-demand')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Sankey tree'
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

      // Local feature grouping using pre-loaded tableData (no backend call)
      console.log(`[Store.addStageToNodeInternal] 🚀 Local grouping for ${metric}:${defaultThresholds.join(',')}`)
      const groups = groupFeaturesByThresholds(node.featureIds, metric, defaultThresholds, tableData)

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

        // Create normal child node at depth + 1
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

      // Auto-activate table if this is Feature Splitting stage
      if (categoryId === TAG_CATEGORY_FEATURE_SPLITTING && panel === PANEL_LEFT) {
        // Get the newly created children from the updated tree
        const updatedTree = get()[panelKey].sankeyTree
        const parentNode = updatedTree?.get(nodeId)

        if (parentNode && parentNode.children.length > 0) {
          const lastChildId = parentNode.children[parentNode.children.length - 1]
          console.log('[Store.addStageToNodeInternal] 🎯 Auto-activating decoder similarity table for leaf node:', lastChildId)
          get().selectSingleNode(lastChildId)
          get().setActiveStageNode(lastChildId, TAG_CATEGORY_FEATURE_SPLITTING)
        }
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
   * Build a stage on-demand for a specific category.
   * Incrementally builds only the requested stage instead of building all stages upfront.
   *
   * @param categoryId - Category ID (TAG_CATEGORY_FEATURE_SPLITTING, TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE)
   * @param panel - Which panel to build in
   */
  buildStageForCategory: async (categoryId: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    if (!sankeyTree) {
      console.error(`[Store.buildStageForCategory] ❌ No tree found for ${panel}`)
      return
    }

    const category = TAG_CATEGORIES[categoryId]
    if (!category) {
      console.error(`[Store.buildStageForCategory] ❌ Invalid category: ${categoryId}`)
      return
    }

    console.log(`[Store.buildStageForCategory] 📊 Building ${category.label} stage (order=${category.stageOrder})`)

    // Determine parent depth (nodes we'll add children to)
    const parentDepth = category.stageOrder - 1

    if (categoryId === TAG_CATEGORY_CAUSE) {
      // Cause category: Add to all depth=2 nodes (Quality children) without Cause children
      const qualityNodes = Array.from(sankeyTree.values()).filter(
        node => node.depth === parentDepth && node.children.length === 0 && node.stage !== 3
      )

      console.log(`[Store.buildStageForCategory] 🎯 Found ${qualityNodes.length} quality nodes for Cause stage`)

      for (const node of qualityNodes) {
        await get().addCauseStage(node.id, panel)
      }
    } else {
      // Metric-based category (Feature Splitting, Quality)
      const parentNodes = Array.from(sankeyTree.values()).filter(node => {
        // Find nodes at correct depth without this category's metric already applied
        return node.depth === parentDepth && node.metric !== category.metric
      })

      console.log(`[Store.buildStageForCategory] 🎯 Found ${parentNodes.length} parent nodes for ${category.label} stage`)

      for (const parentNode of parentNodes) {
        // Skip terminal nodes (marked with stage override)
        if (parentNode.stage !== undefined && parentNode.stage !== parentNode.depth) {
          console.log(`[Store.buildStageForCategory] ⏭️  Skipping terminal node ${parentNode.id}`)
          continue
        }

        await get().addStageToNodeInternal(parentNode.id, categoryId, panel)

        // Mark terminal nodes after building
        if (categoryId === TAG_CATEGORY_FEATURE_SPLITTING) {
          // Mark last child (high similarity) as terminal
          const updatedTree = get()[panelKey].sankeyTree
          const updatedParent = updatedTree?.get(parentNode.id)
          if (updatedParent && updatedParent.children.length > 0) {
            const lastChildId = updatedParent.children[updatedParent.children.length - 1]
            const lastChild = updatedTree?.get(lastChildId)
            if (lastChild) {
              lastChild.stage = 3
              updatedTree?.set(lastChildId, { ...lastChild })
              console.log(`[Store.buildStageForCategory] 🎯 Marked ${lastChildId} as terminal (high similarity)`)
            }
          }
        } else if (categoryId === TAG_CATEGORY_QUALITY) {
          // Mark last child (high quality) as terminal
          const updatedTree = get()[panelKey].sankeyTree
          const updatedParent = updatedTree?.get(parentNode.id)
          if (updatedParent && updatedParent.children.length > 0) {
            const lastChildId = updatedParent.children[updatedParent.children.length - 1]
            const lastChild = updatedTree?.get(lastChildId)
            if (lastChild) {
              lastChild.stage = 3
              updatedTree?.set(lastChildId, { ...lastChild })
              console.log(`[Store.buildStageForCategory] 🎯 Marked ${lastChildId} as terminal (high quality)`)
            }
          }
        }
      }
    }

    console.log(`[Store.buildStageForCategory] ✅ ${category.label} stage built successfully`)
  },

  /**
   * Update thresholds for a node.
   * Updates the node's children based on new threshold values using local feature grouping.
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

      // Local feature grouping using pre-loaded tableData (no backend call)
      console.log(`[Store.updateNodeThresholds] 🚀 Local grouping for ${node.metric}:${thresholds.join(',')}`)
      const groups = groupFeaturesByThresholds(node.featureIds, node.metric, thresholds, tableData)

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

      // Recompute Sankey structure
      get().recomputeSankeyTree(panel)
      state.setLoading(loadingKey, false)
      console.log(`[Store.updateNodeThresholds] ✅ Thresholds updated successfully`)

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
    const { activeStageCategory } = state

    console.log(`[Store.recomputeSankeyTree] 🔄 Called for ${panel}:`, {
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size,
      activeStageCategory
    })

    if (!sankeyTree) {
      console.warn('[Store.recomputeSankeyTree] ⚠️  No tree available')
      return
    }

    try {
      // Assign hierarchical colors to tree nodes
      const colorAssigner = new HierarchicalColorAssigner()
      colorAssigner.assignColors(sankeyTree, 'root')
      console.log(`[Store.recomputeSankeyTree] 🎨 Assigned hierarchical colors to tree`)

      // Determine max visible stage based on active category
      let maxVisibleStage: number | undefined
      if (activeStageCategory && TAG_CATEGORIES[activeStageCategory]) {
        maxVisibleStage = TAG_CATEGORIES[activeStageCategory].stageOrder
        console.log(`[Store.recomputeSankeyTree] 📊 Using maxVisibleStage=${maxVisibleStage} from category "${activeStageCategory}"`)
      } else {
        console.log(`[Store.recomputeSankeyTree] 📊 No active stage category, showing all stages`)
      }

      // Use the utility function to convert tree to Sankey structure
      const computedSankey = convertTreeToSankeyStructure(sankeyTree, maxVisibleStage)

      console.log(`[Store.recomputeSankeyTree] ✅ Computed Sankey for ${panel}:`, {
        nodes: computedSankey.nodes.length,
        links: computedSankey.links.length,
        maxDepth: computedSankey.maxDepth,
        maxVisibleStage
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
  },

  /**
   * Get current thresholds from a stage's children to preserve user settings.
   * Examines the first child to extract the metric and thresholds used.
   */
  getStageThresholds: (parentNodeId: string, panel: PanelSide = PANEL_LEFT): { metric: string | null, thresholds: number[] } => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    if (!sankeyTree || !sankeyTree.has(parentNodeId)) {
      return { metric: null, thresholds: [] }
    }

    const parentNode = sankeyTree.get(parentNodeId)!

    // Return the metric and thresholds stored on the parent node
    return {
      metric: parentNode.metric,
      thresholds: parentNode.thresholds || []
    }
  },

  /**
   * Extract current cause assignments from stage 3 nodes for preservation.
   * Returns a map of featureId → causeCategory.
   */
  getCauseAssignments: (qualityNodeId: string, panel: PanelSide = PANEL_LEFT): Map<number, string> => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    const assignments = new Map<number, string>()

    if (!sankeyTree || !sankeyTree.has(qualityNodeId)) {
      return assignments
    }

    const qualityNode = sankeyTree.get(qualityNodeId)!

    // Iterate through cause children (stage 3)
    for (const causeNodeId of qualityNode.children) {
      const causeNode = sankeyTree.get(causeNodeId)
      if (!causeNode) continue

      const causeCategory = causeNode.rangeLabel // "Missed Context", "Unsure", etc.

      // Map each feature to its cause category
      for (const featureId of causeNode.featureIds) {
        assignments.set(featureId, causeCategory)
      }
    }

    return assignments
  },

  /**
   * Add the Cause stage with preservation of previous assignments.
   * Similar to addCauseStage but distributes features based on previous assignments.
   */
  rebuildCauseStageWithPreservation: async (
    nodeId: string,
    previousAssignments: Map<number, string>,
    panel: PanelSide = PANEL_LEFT
  ) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.rebuildCauseStageWithPreservation] 🎯 Rebuilding Cause stage for ${nodeId} with preserved assignments`)

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.rebuildCauseStageWithPreservation] ❌ Node ${nodeId} not found in tree`)
      return
    }

    const category = TAG_CATEGORIES[TAG_CATEGORY_CAUSE]
    const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
    const parentNode = newTree.get(nodeId)!

    // Delete old children if any
    parentNode.children.forEach(childId => newTree.delete(childId))
    parentNode.children = []

    // Create feature distribution based on previous assignments
    const featureDistribution = new Map<string, Set<number>>()

    // Initialize empty sets for all cause categories
    category.tags.forEach(tag => {
      featureDistribution.set(tag, new Set<number>())
    })

    // Distribute features based on previous assignments
    for (const featureId of parentNode.featureIds) {
      const previousCategory = previousAssignments.get(featureId)

      if (previousCategory && featureDistribution.has(previousCategory)) {
        // Preserve previous assignment
        featureDistribution.get(previousCategory)!.add(featureId)
      } else {
        // New feature or unknown category → goes to "Unsure"
        featureDistribution.get('Unsure')!.add(featureId)
      }
    }

    // Create child nodes with distributed features
    category.tags.forEach(tag => {
      const childId = `${nodeId}_stage${parentNode.depth + 1}_${tag.toLowerCase().replace(/\s+/g, '_')}`
      const features = featureDistribution.get(tag) || new Set<number>()

      const childNode: SankeyTreeNode = {
        id: childId,
        parentId: nodeId,
        metric: null,
        thresholds: [],
        depth: parentNode.depth + 1,
        children: [],
        featureIds: features,
        featureCount: features.size,
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

    console.log(`[Store.rebuildCauseStageWithPreservation] 🌳 Rebuilt ${category.tags.length} Cause groups with preserved assignments`)

    // Recompute Sankey structure
    get().recomputeSankeyTree(panel)

    console.log(`[Store.rebuildCauseStageWithPreservation] ✅ Cause stage rebuilt successfully`)
  }
})
