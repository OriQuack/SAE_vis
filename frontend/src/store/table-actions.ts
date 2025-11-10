import * as api from '../api'
import type { SortBy, SortDirection, SankeyTreeNode } from '../types'
import {
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_DECODER_SIMILARITY
} from '../lib/constants'
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY
} from '../lib/tag-categories'

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
   * Select a single node (replaces previous selection with new one)
   * Part of new single-select behavior where only one node can be selected at a time
   */
  selectSingleNode: (nodeId: string | null) => {
    if (nodeId === null) {
      // Deselect: clear selection
      set({ tableSelectedNodeIds: [] })
      console.log('[Store.selectSingleNode] Cleared selection')
    } else {
      // Select: replace array with single node
      set({ tableSelectedNodeIds: [nodeId] })
      console.log('[Store.selectSingleNode] Selected node:', nodeId)
    }

    // No need to re-fetch - TablePanel will filter based on new selection
  },

  /**
   * Determine the category of a node based on its parent's metric
   * Used to automatically activate the correct tag category when clicking a node
   */
  getNodeCategory: (nodeId: string): string | null => {
    const state = get()
    const { leftPanel } = state

    if (!leftPanel.sankeyTree) {
      console.warn('[Store.getNodeCategory] No Sankey tree available')
      return null
    }

    const node = leftPanel.sankeyTree.get(nodeId)
    if (!node) {
      console.warn('[Store.getNodeCategory] Node not found:', nodeId)
      return null
    }

    if (!node.parentId) {
      console.warn('[Store.getNodeCategory] Node has no parent:', nodeId)
      return null
    }

    const parent = leftPanel.sankeyTree.get(node.parentId)
    if (!parent) {
      console.warn('[Store.getNodeCategory] Parent not found:', node.parentId)
      return null
    }

    // Determine category based on parent's metric
    if (parent.metric === METRIC_DECODER_SIMILARITY) {
      return TAG_CATEGORY_FEATURE_SPLITTING
    } else if (parent.metric === METRIC_QUALITY_SCORE) {
      return TAG_CATEGORY_QUALITY
    }

    console.warn('[Store.getNodeCategory] Unknown metric:', parent.metric)
    return null
  },

  /**
   * Select a node and activate its corresponding category
   * Unified action that combines node selection with category activation
   */
  selectNodeWithCategory: (nodeId: string, categoryId: string) => {
    const state = get()

    // 1. Select the single node
    state.selectSingleNode(nodeId)

    // 2. Activate the category and table
    state.setActiveStageNode(nodeId, categoryId)

    console.log(`[Store.selectNodeWithCategory] Selected node ${nodeId} with category ${categoryId}`)
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
    // Clear frozen selection states when switching away from similarity sort
    const shouldClearFrozenStates = sortBy !== 'similarity'

    // Update table sort state
    set({
      tableSortBy: sortBy,
      tableSortDirection: sortDirection,
      ...(shouldClearFrozenStates && { sortedBySelectionStates: null })
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
   * Selects the LEAF NODE for table filtering (not the parent node!)
   * (bidirectional linking)
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

    // Find parent node with this category's metric in left panel
    let parentNodeId: string | null = null

    if (category.metric) {
      // For metric-based categories (Feature Splitting, Quality), find node with that metric
      parentNodeId = get().findNodeWithMetric(category.metric)

      if (!parentNodeId) {
        console.warn('[Store.activateCategoryTable] ⚠️  No node found with metric:', category.metric)
        console.warn('[Store.activateCategoryTable] Using fallback nodeId: root')
        parentNodeId = 'root'  // Fallback to root
      }
    } else {
      // For non-metric categories (Cause), use root as fallback
      parentNodeId = 'root'
    }

    console.log('[Store.activateCategoryTable] ✅ Activating:', {
      categoryId,
      parentNodeId,
      metric: category.metric
    })

    // IMPORTANT: Select the LEAF NODE (last child), not the parent node!
    const tree = get().leftPanel.sankeyTree
    const parentNode = tree?.get(parentNodeId)
    let selectedNodeId = parentNodeId

    if (parentNode && parentNode.children.length > 0) {
      // Select the last leaf node (highest quality/well-explained)
      selectedNodeId = parentNode.children[parentNode.children.length - 1]
      console.log('[Store.activateCategoryTable] 🎯 Selecting leaf node:', selectedNodeId)
    }

    // BIDIRECTIONAL LINKING: 1. Select the leaf node for table filtering
    get().selectSingleNode(selectedNodeId)

    // BIDIRECTIONAL LINKING: 2. Set active stage node with the category ID
    get().setActiveStageNode(selectedNodeId, categoryId)

    console.log('[Store.activateCategoryTable] ✅ Leaf node selected and category activated')
  },

  // ============================================================================
  // SIMILARITY SORT ACTION
  // ============================================================================

  sortBySimilarity: async () => {
    const state = get()
    const { featureSelectionStates, tableData } = state

    console.log('[Store.sortBySimilarity] Starting similarity sort:', {
      selectionStatesSize: featureSelectionStates.size,
      hasTableData: !!tableData
    })

    // Validate: need at least 1 selected or rejected feature
    if (featureSelectionStates.size < 1) {
      console.warn('[Store.sortBySimilarity] ⚠️  No features selected for similarity sort')
      return
    }

    if (!tableData?.features) {
      console.warn('[Store.sortBySimilarity] ⚠️  No table data available')
      return
    }

    // Extract selected and rejected IDs
    const selectedIds: number[] = []
    const rejectedIds: number[] = []

    featureSelectionStates.forEach((selectionState: string, featureId: number) => {
      if (selectionState === 'selected') {
        selectedIds.push(featureId)
      } else if (selectionState === 'rejected') {
        rejectedIds.push(featureId)
      }
    })

    console.log('[Store.sortBySimilarity] Selection counts:', {
      selected: selectedIds.length,
      rejected: rejectedIds.length
    })

    // Need at least one of each for meaningful sort
    if (selectedIds.length === 0 && rejectedIds.length === 0) {
      console.warn('[Store.sortBySimilarity] ⚠️  Need at least one selected or rejected feature')
      return
    }

    // Get all feature IDs from table data
    const allFeatureIds = tableData.features.map((f: any) => f.feature_id)

    try {
      set({ isSimilaritySortLoading: true })

      console.log('[Store.sortBySimilarity] Calling API:', {
        selectedIds: selectedIds.length,
        rejectedIds: rejectedIds.length,
        totalFeatures: allFeatureIds.length
      })

      // Call API
      const response = await api.getSimilaritySort(
        selectedIds,
        rejectedIds,
        allFeatureIds
      )

      console.log('[Store.sortBySimilarity] API response:', {
        sortedFeaturesCount: response.sorted_features.length,
        totalFeatures: response.total_features,
        weightsCount: response.weights_used.length
      })

      // Convert to Map for easy lookup
      const scoresMap = new Map<number, number>()
      response.sorted_features.forEach((fs) => {
        scoresMap.set(fs.feature_id, fs.score)
      })

      // Generate selection signature to track this sort state
      // Format: "selected:[ids]|rejected:[ids]"
      const selectedSig = selectedIds.sort((a, b) => a - b).join(',')
      const rejectedSig = rejectedIds.sort((a, b) => a - b).join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(featureSelectionStates)

      // Store scores and set sort mode
      set({
        similarityScores: scoresMap,
        tableSortBy: 'similarity',
        tableSortDirection: 'desc',
        isSimilaritySortLoading: false,
        lastSortedSelectionSignature: selectionSignature,
        sortedBySelectionStates: frozenSelectionStates
      })

      console.log('[Store.sortBySimilarity] ✅ Similarity sort complete:', {
        scoresMapSize: scoresMap.size,
        sortBy: 'similarity',
        selectionSignature
      })

    } catch (error) {
      console.error('[Store.sortBySimilarity] ❌ Failed to calculate similarity sort:', error)
      set({ isSimilaritySortLoading: false })
    }
  },

  // ============================================================================
  // PAIR SIMILARITY SORT ACTION
  // ============================================================================

  sortPairsBySimilarity: async (allPairKeys: string[]) => {
    const state = get()
    const { pairSelectionStates } = state

    console.log('[Store.sortPairsBySimilarity] Starting pair similarity sort:', {
      selectionStatesSize: pairSelectionStates.size,
      allPairKeysCount: allPairKeys.length
    })

    // Validate: need at least 1 selected or rejected pair
    if (pairSelectionStates.size < 1) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  No pairs selected for similarity sort')
      return
    }

    if (!allPairKeys || allPairKeys.length === 0) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  No pair keys available')
      return
    }

    // Extract selected and rejected pair keys
    const selectedPairKeys: string[] = []
    const rejectedPairKeys: string[] = []

    pairSelectionStates.forEach((selectionState: string, pairKey: string) => {
      if (selectionState === 'selected') {
        selectedPairKeys.push(pairKey)
      } else if (selectionState === 'rejected') {
        rejectedPairKeys.push(pairKey)
      }
    })

    console.log('[Store.sortPairsBySimilarity] Selection counts:', {
      selected: selectedPairKeys.length,
      rejected: rejectedPairKeys.length
    })

    // Need at least one of each for meaningful sort
    if (selectedPairKeys.length === 0 && rejectedPairKeys.length === 0) {
      console.warn('[Store.sortPairsBySimilarity] ⚠️  Need at least one selected or rejected pair')
      return
    }

    console.log('[Store.sortPairsBySimilarity] Total pairs:', allPairKeys.length)

    try {
      set({ isPairSimilaritySortLoading: true })

      console.log('[Store.sortPairsBySimilarity] Calling API:', {
        selectedPairKeys: selectedPairKeys.length,
        rejectedPairKeys: rejectedPairKeys.length,
        totalPairs: allPairKeys.length
      })

      // Call API
      const response = await api.getPairSimilaritySort(
        selectedPairKeys,
        rejectedPairKeys,
        allPairKeys
      )

      console.log('[Store.sortPairsBySimilarity] API response:', {
        sortedPairsCount: response.sorted_pairs.length,
        totalPairs: response.total_pairs,
        weightsCount: response.weights_used.length
      })

      // Convert to Map for easy lookup
      const scoresMap = new Map<string, number>()
      response.sorted_pairs.forEach((ps) => {
        scoresMap.set(ps.pair_key, ps.score)
      })

      // Generate selection signature to track this sort state
      // Format: "selected:[keys]|rejected:[keys]"
      const selectedSig = selectedPairKeys.sort().join(',')
      const rejectedSig = rejectedPairKeys.sort().join(',')
      const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

      // Freeze the current selection states for grouping
      const frozenSelectionStates = new Map(pairSelectionStates)

      // Store scores and set sort mode
      set({
        pairSimilarityScores: scoresMap,
        tableSortBy: 'pair_similarity',
        tableSortDirection: 'desc',
        isPairSimilaritySortLoading: false,
        lastPairSortedSelectionSignature: selectionSignature,
        pairSortedBySelectionStates: frozenSelectionStates
      })

      console.log('[Store.sortPairsBySimilarity] ✅ Pair similarity sort complete:', {
        scoresMapSize: scoresMap.size,
        sortBy: 'pair_similarity',
        selectionSignature
      })

    } catch (error) {
      console.error('[Store.sortPairsBySimilarity] ❌ Failed to calculate pair similarity sort:', error)
      set({ isPairSimilaritySortLoading: false })
    }
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (automatic tagging based on histogram)
  // ============================================================================

  showSimilarityTaggingPopover: async (mode: 'feature' | 'pair', position: { x: number; y: number }) => {
    console.log(`[Store.showSimilarityTaggingPopover] Opening ${mode} tagging popover`)

    // Extract selection states based on mode
    const { featureSelectionStates, pairSelectionStates, tableData } = get()

    try {
      // Set loading state
      set({
        similarityTaggingPopover: {
          visible: true,
          mode,
          position,
          histogramData: null,
          threshold: 0, // Start at center (0)
          isLoading: true
        }
      })

      if (mode === 'feature') {
        // Extract selected and rejected feature IDs
        const selectedIds: number[] = []
        const rejectedIds: number[] = []
        const allFeatureIds: number[] = []

        featureSelectionStates.forEach((state, featureId) => {
          if (state === 'selected') selectedIds.push(featureId)
          else if (state === 'rejected') rejectedIds.push(featureId)
        })

        // Get all feature IDs from table data
        if (tableData && tableData.features) {
          tableData.features.forEach((feature: any) => {
            allFeatureIds.push(feature.feature_id)
          })
        }

        console.log('[Store.showSimilarityTaggingPopover] Fetching feature histogram:', {
          selected: selectedIds.length,
          rejected: rejectedIds.length,
          total: allFeatureIds.length
        })

        // Fetch histogram data
        const histogramData = await api.getSimilarityScoreHistogram(
          selectedIds,
          rejectedIds,
          allFeatureIds
        )

        // Update state with histogram data
        // Initialize with symmetric thresholds: reject=-0.2, select=+0.2
        set({
          similarityTaggingPopover: {
            visible: true,
            mode,
            position,
            histogramData,
            rejectThreshold: -0.2,
            selectThreshold: 0.2,
            isLoading: false
          }
        })

      } else if (mode === 'pair') {
        // Extract selected and rejected pair keys
        const selectedPairKeys: string[] = []
        const rejectedPairKeys: string[] = []
        const allPairKeys: string[] = []

        pairSelectionStates.forEach((state, pairKey) => {
          if (state === 'selected') selectedPairKeys.push(pairKey)
          else if (state === 'rejected') rejectedPairKeys.push(pairKey)
        })

        // Get all pair keys from current table view
        // This would need to be passed from the component or computed from tableData
        // For now, use the pairs that have been displayed
        pairSelectionStates.forEach((_, pairKey) => {
          allPairKeys.push(pairKey)
        })

        // Also add pairs that exist in table but not yet selected
        if (tableData && tableData.features) {
          tableData.features.forEach((feature: any) => {
            if (feature.decoder_similarity && Array.isArray(feature.decoder_similarity)) {
              feature.decoder_similarity.slice(0, 4).forEach((similarItem: any) => {
                const pairKey = `${feature.feature_id}-${similarItem.feature_id}`
                if (!allPairKeys.includes(pairKey)) {
                  allPairKeys.push(pairKey)
                }
              })
            }
          })
        }

        console.log('[Store.showSimilarityTaggingPopover] Fetching pair histogram:', {
          selected: selectedPairKeys.length,
          rejected: rejectedPairKeys.length,
          total: allPairKeys.length
        })

        // Fetch histogram data
        const histogramData = await api.getPairSimilarityScoreHistogram(
          selectedPairKeys,
          rejectedPairKeys,
          allPairKeys
        )

        // Update state with histogram data
        // Initialize with symmetric thresholds: reject=-0.2, select=+0.2
        set({
          similarityTaggingPopover: {
            visible: true,
            mode,
            position,
            histogramData,
            rejectThreshold: -0.2,
            selectThreshold: 0.2,
            isLoading: false
          }
        })
      }

    } catch (error) {
      console.error('[Store.showSimilarityTaggingPopover] ❌ Failed to fetch histogram:', error)
      set({ similarityTaggingPopover: null })
    }
  },

  hideSimilarityTaggingPopover: () => {
    console.log('[Store.hideSimilarityTaggingPopover] Closing tagging popover')
    set({ similarityTaggingPopover: null })
  },

  updateSimilarityThresholds: (rejectThreshold: number, selectThreshold: number) => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    // Enforce constraint: rejectThreshold must be < selectThreshold
    // Clamp values to ensure valid state
    let finalReject = rejectThreshold
    let finalSelect = selectThreshold

    if (finalReject >= finalSelect) {
      // If reject tries to exceed select, push select forward
      finalSelect = finalReject + 0.01
    }

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        rejectThreshold: finalReject,
        selectThreshold: finalSelect
      }
    })
  },

  applySimilarityTags: () => {
    const { similarityTaggingPopover, featureSelectionStates, pairSelectionStates } = get()

    if (!similarityTaggingPopover || !similarityTaggingPopover.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, rejectThreshold, selectThreshold, histogramData } = similarityTaggingPopover
    const scores = histogramData.scores

    console.log(`[Store.applySimilarityTags] Applying ${mode} tags with thresholds:`, {
      reject: rejectThreshold,
      select: selectThreshold
    })

    if (mode === 'feature') {
      // Apply tags to features (three-way logic)
      const newSelectionStates = new Map(featureSelectionStates)
      let selectedCount = 0
      let rejectedCount = 0
      let untaggedCount = 0

      Object.entries(scores).forEach(([idStr, score]) => {
        const featureId = parseInt(idStr, 10)

        // Skip if already manually tagged
        if (featureSelectionStates.has(featureId)) {
          return
        }

        // Apply three-way threshold logic
        if (typeof score === 'number') {
          if (score < rejectThreshold) {
            // Red zone: reject
            newSelectionStates.set(featureId, 'rejected')
            rejectedCount++
          } else if (score >= selectThreshold) {
            // Green zone: select
            newSelectionStates.set(featureId, 'selected')
            selectedCount++
          } else {
            // Grey zone: leave untagged
            untaggedCount++
          }
        }
      })

      console.log('[Store.applySimilarityTags] Feature tags applied:', {
        selected: selectedCount,
        rejected: rejectedCount,
        untagged: untaggedCount,
        preserved: featureSelectionStates.size
      })

      set({ featureSelectionStates: newSelectionStates })

    } else if (mode === 'pair') {
      // Apply tags to pairs (three-way logic)
      const newPairSelectionStates = new Map(pairSelectionStates)
      let selectedCount = 0
      let rejectedCount = 0
      let untaggedCount = 0

      Object.entries(scores).forEach(([pairKey, score]) => {
        // Skip if already manually tagged
        if (pairSelectionStates.has(pairKey)) {
          return
        }

        // Apply three-way threshold logic
        if (typeof score === 'number') {
          if (score < rejectThreshold) {
            // Red zone: reject
            newPairSelectionStates.set(pairKey, 'rejected')
            rejectedCount++
          } else if (score >= selectThreshold) {
            // Green zone: select
            newPairSelectionStates.set(pairKey, 'selected')
            selectedCount++
          } else {
            // Grey zone: leave untagged
            untaggedCount++
          }
        }
      })

      console.log('[Store.applySimilarityTags] Pair tags applied:', {
        selected: selectedCount,
        rejected: rejectedCount,
        untagged: untaggedCount,
        preserved: pairSelectionStates.size
      })

      set({ pairSelectionStates: newPairSelectionStates })
    }

    // Close popover after applying
    set({ similarityTaggingPopover: null })
  }
})
