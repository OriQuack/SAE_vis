import * as api from '../api'
import type { MetricType, SankeyTreeNode, FeatureGroup } from '../types'
import { processFeatureGroupResponse, convertTreeToSankeyStructure } from '../lib/threshold-utils'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'

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
   * Add a new unsplit stage to a specific node in the tree.
   * Creates a single child node with all parent features, without splitting by thresholds.
   * User can later set thresholds via histogram to split the node.
   */
  addUnsplitStageToNode: async (nodeId: string, metric: string, panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const { sankeyTree } = state[panelKey]

    console.log(`[Store.addUnsplitStageToNode] 🎯 Called for ${panel}:`, {
      nodeId,
      metric,
      hasSankeyTree: !!sankeyTree,
      treeSize: sankeyTree?.size
    })

    if (!sankeyTree || !sankeyTree.has(nodeId)) {
      console.error(`[Store.addUnsplitStageToNode] ❌ Node ${nodeId} not found in tree`)
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      const parentNode = sankeyTree.get(nodeId)!
      const newDepth = parentNode.depth + 1
      const newTree = new Map(sankeyTree)

      // Create a single child node with all parent features (no splitting)
      const childId = `${nodeId}_stage${newDepth}_group0`
      const childNode: SankeyTreeNode = {
        id: childId,
        parentId: nodeId,
        metric: null, // Child has no metric (not being split)
        thresholds: [], // Empty thresholds - no split yet
        depth: newDepth,
        children: [],
        featureIds: new Set(parentNode.featureIds), // Copy all parent features
        featureCount: parentNode.featureCount,
        rangeLabel: 'All' // Label for unsplit node
      }

      newTree.set(childId, childNode)

      // Update parent's children AND set the metric/thresholds on parent
      parentNode.children = [childId]
      parentNode.metric = metric           // Set metric on parent (how parent splits)
      parentNode.thresholds = []           // Empty thresholds (unsplit state)
      newTree.set(nodeId, { ...parentNode })

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      console.log(`[Store.addUnsplitStageToNode] 🌳 Tree updated with 1 unsplit child for node ${nodeId}`)

      // Fetch histogram data for the new metric (for node overlay visualization)
      // This displays small histogram bars on the node, but does NOT open the popover
      console.log(`[Store.addUnsplitStageToNode] 📊 Fetching histogram data for metric: ${metric}`)
      try {
        await state.fetchHistogramData(metric as MetricType, nodeId, panel)
        console.log(`[Store.addUnsplitStageToNode] ✅ Histogram data fetched for metric: ${metric}`)
      } catch (error) {
        console.warn(`[Store.addUnsplitStageToNode] ⚠️ Failed to fetch histogram data:`, error)
        // Don't fail the entire operation if histogram fetch fails
      }

      // Recompute Sankey structure
      console.log(`[Store.addUnsplitStageToNode] 🔄 Now calling recomputeSankeyTree...`)
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
      console.log(`[Store.addUnsplitStageToNode] ✅ Unsplit stage addition complete!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add unsplit stage'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
    }
  },

  /**
   * Update thresholds for a node and its descendants.
   * Uses cached groups for instant updates.
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
      // Create cache key
      const cacheKey = `${node.metric}:${thresholds.join(',')}`

      let groups: FeatureGroup[]

      // Check cache first
      if (state.cachedGroups[cacheKey]) {
        groups = state.cachedGroups[cacheKey]
        console.log(`[Store.updateNodeThresholds] Using cached groups for ${cacheKey}`)
      } else {
        // Fetch new groups
        const response = await api.getFeatureGroups({ filters, metric: node.metric, thresholds })
        groups = processFeatureGroupResponse(response)

        // Cache them
        set((state: any) => ({
          cachedGroups: {
            ...state.cachedGroups,
            [cacheKey]: groups
          }
        }))
      }

      // Interface to capture entire subtree structure before deletion
      interface SubtreeSplitState {
        nodeId: string
        metric: string | null
        thresholds: number[]
        featureIds: Set<number>
        rangeLabel: string
        children: SubtreeSplitState[]
      }

      // Helper to collect entire subtree structure before any modifications
      const collectSubtreeStructure = (tree: Map<string, SankeyTreeNode>, nodeId: string): SubtreeSplitState[] => {
        const node = tree.get(nodeId)
        if (!node || node.children.length === 0) return []

        return node.children.map(childId => {
          const child = tree.get(childId)
          if (!child) return null

          return {
            nodeId: childId,
            metric: child.metric,
            thresholds: child.thresholds,
            featureIds: new Set(child.featureIds),
            rangeLabel: child.rangeLabel,
            children: collectSubtreeStructure(tree, childId) // Recursively collect grandchildren
          }
        }).filter((item): item is SubtreeSplitState => item !== null)
      }

      // Rebuild this node and its descendants
      const rebuildNodeAndDescendants = async (
        tree: Map<string, SankeyTreeNode>,
        nodeId: string,
        newGroups: FeatureGroup[],
        oldSubtreeStructure?: SubtreeSplitState[]
      ): Promise<Array<{nodeId: string, metric: string}>> => {
        const node = tree.get(nodeId)!

        // Track nodes that need histogram refresh
        const nodesToRefreshHistograms: Array<{nodeId: string, metric: string}> = []

        // Collect structure ONLY if not provided (this is the root call)
        const subtreeStructure = oldSubtreeStructure !== undefined
          ? oldSubtreeStructure
          : collectSubtreeStructure(tree, nodeId)

        // Recursively delete all descendants
        const deleteDescendants = (targetNodeId: string) => {
          const targetNode = tree.get(targetNodeId)
          if (!targetNode) return
          targetNode.children.forEach(childId => {
            deleteDescendants(childId)
            tree.delete(childId)
          })
        }
        node.children.forEach(childId => {
          deleteDescendants(childId)
          tree.delete(childId)
        })
        node.children = []

        // Step 2: Build new children and match with old structure
        for (const [index, group] of newGroups.entries()) {
          const intersectedFeatures = new Set<number>()

          if (node.id === 'root' || node.featureCount === 0) {
            // Root node - use all features from group
            group.featureIds.forEach(id => intersectedFeatures.add(id))
          } else {
            // Intersect with CURRENT node's features (not parent's!)
            // This ensures children only contain features from their parent's subset
            for (const id of group.featureIds) {
              if (node.featureIds.has(id)) {
                intersectedFeatures.add(id)
              }
            }
          }

          const childId = `${nodeId}_stage${node.depth + 1}_group${index}`
          const childNode: SankeyTreeNode = {
            id: childId,
            parentId: nodeId,
            metric: null,  // Child has no metric initially (not being split yet)
            thresholds: [],  // Children don't need thresholds initially
            depth: node.depth + 1,
            children: [],
            featureIds: intersectedFeatures,
            featureCount: intersectedFeatures.size,
            rangeLabel: group.rangeLabel
          }

          tree.set(childId, childNode)
          node.children.push(childId)

          // Step 3: Find best matching old child by feature overlap (not by index!)
          let bestMatch: SubtreeSplitState | null = null
          let bestOverlap = 0

          for (const oldChild of subtreeStructure) {
            // Calculate overlap between new child's features and old child's features
            const overlap = [...intersectedFeatures].filter(id => oldChild.featureIds.has(id)).length
            if (overlap > bestOverlap) {
              bestOverlap = overlap
              bestMatch = oldChild
            }
          }

          // Step 4: If found matching old child with splits, rebuild recursively
          if (bestMatch && bestMatch.metric && bestOverlap > 0) {
            const cacheKey = `${bestMatch.metric}:${bestMatch.thresholds.join(',')}`

            // Get cached groups or fetch if not cached
            let childGroups = state.cachedGroups[cacheKey]
            if (!childGroups) {
              console.log(`[updateNodeThresholds.rebuild] Fetching groups for child: ${cacheKey}`)
              const response = await api.getFeatureGroups({
                filters,
                metric: bestMatch.metric,
                thresholds: bestMatch.thresholds
              })
              childGroups = processFeatureGroupResponse(response)

              // Update cache
              set((currentState: any) => ({
                cachedGroups: {
                  ...currentState.cachedGroups,
                  [cacheKey]: childGroups
                }
              }))
            } else {
              console.log(`[updateNodeThresholds.rebuild] Using cached groups for child: ${cacheKey}`)
            }

            // Set metric on child before recursive rebuild
            childNode.metric = bestMatch.metric
            // Temporarily restore old thresholds - we'll check if they're valid after rebuilding
            childNode.thresholds = bestMatch.thresholds
            tree.set(childId, childNode)

            // Track this node for histogram refresh
            nodesToRefreshHistograms.push({nodeId: childId, metric: bestMatch.metric})

            // Recursively rebuild this child's children WITH its subtree structure
            console.log(`[updateNodeThresholds.rebuild] Recursively rebuilding child: ${childId} with ${bestMatch.children.length} old grandchildren`)
            const grandchildrenToRefresh = await rebuildNodeAndDescendants(tree, childId, childGroups, bestMatch.children)

            // NOW check if the rebuilt child has only 0-1 grandchildren (unsplit after intersection)
            // This detects nodes that had thresholds but became unsplit due to parent feature changes
            const rebuiltChild = tree.get(childId)!
            if (rebuiltChild.children.length <= 1 && rebuiltChild.thresholds.length > 0) {
              // Node had thresholds but resulted in 0-1 non-empty children after rebuild
              // This means thresholds were boundary values or became invalid - reset them
              rebuiltChild.thresholds = []
              tree.set(childId, rebuiltChild)
              console.log(`[updateNodeThresholds.rebuild] Reset boundary thresholds for child: ${childId} (${rebuiltChild.children.length} children after rebuild)`)
            }

            // Collect histogram refresh requests from recursive calls
            nodesToRefreshHistograms.push(...grandchildrenToRefresh)
          }
        }

        // Update the node's thresholds
        node.thresholds = thresholds

        // Return list of nodes that need histogram refresh
        return nodesToRefreshHistograms
      }

      // Update the tree
      const newTree = new Map<string, SankeyTreeNode>(sankeyTree)
      // Collect entire subtree structure BEFORE any modifications
      const subtreeStructure = collectSubtreeStructure(newTree, nodeId)
      console.log(`[updateNodeThresholds] Collected subtree structure with ${subtreeStructure.length} direct children`)
      const nodesToRefresh = await rebuildNodeAndDescendants(newTree, nodeId, groups, subtreeStructure)

      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyTree: newTree
        }
      }))

      // Refresh histogram data for all rebuilt nodes with metrics
      // This ensures slider positioning is correct after parent threshold changes
      if (nodesToRefresh.length > 0) {
        console.log(`[updateNodeThresholds] Refreshing histograms for ${nodesToRefresh.length} nodes`)
        await Promise.all(
          nodesToRefresh.map(({nodeId: refreshNodeId, metric}) => {
            console.log(`[updateNodeThresholds] Refreshing histogram for node ${refreshNodeId}, metric ${metric}`)
            return state.fetchHistogramData(metric as MetricType, refreshNodeId, panel)
          })
        )
      }

      // Recompute Sankey
      get().recomputeSankeyTree(panel)

      state.setLoading(loadingKey, false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update thresholds'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
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

      // Sync table sort with max stage (only for left panel)
      if (panel === PANEL_LEFT) {
        get().syncTableSortWithMaxStage()
      }
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
