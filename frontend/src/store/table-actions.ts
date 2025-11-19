import * as api from '../api'
import type { SortBy, SortDirection, SankeyTreeNode } from '../types'
import {
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_DECODER_SIMILARITY,
  PANEL_LEFT
} from '../lib/constants'
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-constants'

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
  selectSingleNode: (nodeId: string | null, segmentIndex?: number | null) => {
    if (nodeId === null) {
      // Deselect: clear selection
      set({ tableSelectedNodeIds: [], selectedSegment: null })
      console.log('[Store.selectSingleNode] Cleared selection')
    } else {
      // Select: replace array with single node
      set({ tableSelectedNodeIds: [nodeId] })

      // V2: If segment index provided, also set selectedSegment
      if (segmentIndex !== undefined && segmentIndex !== null) {
        set({ selectedSegment: { nodeId, segmentIndex } })
        console.log('[Store.selectSingleNode] Selected node with segment:', nodeId, 'segment:', segmentIndex)
      } else {
        set({ selectedSegment: null })
        console.log('[Store.selectSingleNode] Selected node:', nodeId)
      }
    }

    // No need to re-fetch - TablePanel will filter based on new selection
  },

  // V2: Segment-specific selection actions
  selectSegment: (nodeId: string, segmentIndex: number) => {
    set({
      selectedSegment: { nodeId, segmentIndex },
      tableSelectedNodeIds: [nodeId]
    })
    console.log('[Store.selectSegment] Selected segment:', { nodeId, segmentIndex })
  },

  clearSegmentSelection: () => {
    set({ selectedSegment: null, tableSelectedNodeIds: [] })
    console.log('[Store.clearSegmentSelection] Cleared segment selection')
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
    const { tableSelectedNodeIds, leftPanel, selectedSegment } = state

    if (tableSelectedNodeIds.length === 0) {
      return null // No selection - show all features
    }

    // V2: If a specific segment is selected, return only that segment's features
    if (selectedSegment && leftPanel.sankeyStructure) {
      const segmentNode = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === selectedSegment.nodeId)

      if (segmentNode && segmentNode.type === 'segment' && segmentNode.segments) {
        const segment = segmentNode.segments[selectedSegment.segmentIndex]
        if (segment) {
          console.log('[Store.getSelectedNodeFeatures] V2: Got features from selected segment:', {
            nodeId: selectedSegment.nodeId,
            segmentIndex: selectedSegment.segmentIndex,
            segmentTag: segment.tagName,
            featureCount: segment.featureIds.size
          })
          return segment.featureIds
        }
      }
    }

    // Legacy: Collect feature IDs from all selected nodes
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

    // Trigger Sankey recompute to update visible stages
    console.log('[Store.setActiveStageNode] 🔄 Triggering Sankey recompute for left panel')
    get().recomputeD3StructureV2('left')
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

    // Trigger Sankey recompute to show all stages
    console.log('[Store.clearActiveStageNode] 🔄 Triggering Sankey recompute to show all stages')
    get().recomputeD3StructureV2('left')
  },

  /**
   * Activate table view for a specific tag category
   * Maps category ID to the appropriate node and sets active stage state
   * Builds the stage on-demand if it doesn't exist yet
   * Selects the LEAF NODE for table filtering (not the parent node!)
   * (bidirectional linking)
   */
  activateCategoryTable: async (categoryId: string) => {
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

    const tree = get().leftPanel.sankeyTree

    // V2: Check if stage is already active in v2 system, activate if needed
    const sankeyStructure = get().leftPanel.sankeyStructure
    const currentStage = sankeyStructure?.currentStage || 1

    // Map category to stage number
    const stageNumber = category.stageOrder  // 1, 2, or 3

    // Check if we need to activate this stage
    if (stageNumber > currentStage) {
      console.log(`[Store.activateCategoryTable] 📊 Stage ${stageNumber} not active yet (current: ${currentStage}), activating ${category.label} stage...`)

      // Activate stages sequentially up to the target
      if (stageNumber === 2 && currentStage === 1) {
        await get().activateStage2(PANEL_LEFT)
      } else if (stageNumber === 3) {
        // Need to activate Stage 2 first if not already active
        if (currentStage === 1) {
          await get().activateStage2(PANEL_LEFT)
        }
        // Then activate Stage 3
        await get().activateStage3(PANEL_LEFT)
      }

      console.log(`[Store.activateCategoryTable] ✅ Stage ${stageNumber} activated, now activating table`)
    }

    // Special handling for Cause category (pre-defined groups)
    if (categoryId === TAG_CATEGORY_CAUSE) {
      console.log('[Store.activateCategoryTable] 📌 Cause category detected - selecting "unsure" node')

      // Find the "unsure" node in the tree at depth 3
      let unsureNodeId: string | null = null

      if (tree) {
        for (const [nodeId, node] of tree.entries()) {
          // Check if node is at depth 3 (cause stage) and ends with "_unsure"
          if (node.depth === 3 && nodeId.endsWith('_unsure')) {
            unsureNodeId = nodeId
            console.log('[Store.activateCategoryTable] ✅ Found unsure node:', nodeId)
            break
          }
        }
      }

      if (!unsureNodeId) {
        console.warn('[Store.activateCategoryTable] ⚠️  No "unsure" node found, using root as fallback')
        unsureNodeId = 'root'
      }

      // Select the unsure node
      get().selectSingleNode(unsureNodeId)
      get().setActiveStageNode(unsureNodeId, categoryId)

      console.log('[Store.activateCategoryTable] ✅ Cause table activated with unsure node:', unsureNodeId)
      return
    }

    // V2: Find the segment node and specific segment index for this stage
    let selectedNodeId: string
    let segmentIndex: number

    // Select terminal segments: Fragmented (Stage 1), Well-Explained (Stage 2)
    if (stageNumber === 1) {
      selectedNodeId = 'stage1_segment'
      segmentIndex = 1  // Fragmented (second segment, >= 0.4)
    } else if (stageNumber === 2) {
      selectedNodeId = 'stage2_segment'
      segmentIndex = 1  // Well-Explained (second segment, >= 0.7)
    } else if (stageNumber === 3) {
      selectedNodeId = 'stage3_segment'
      segmentIndex = 3  // Unsure (fourth segment)
    } else {
      selectedNodeId = 'root'  // Fallback
      segmentIndex = 0
    }

    console.log('[Store.activateCategoryTable] ✅ V2 Activating with segment selection:', {
      categoryId,
      stageNumber,
      selectedNodeId,
      segmentIndex,
      metric: category.metric
    })

    // BIDIRECTIONAL LINKING: 1. Select the specific segment for table filtering
    get().selectSingleNode(selectedNodeId, segmentIndex)

    // BIDIRECTIONAL LINKING: 2. Set active stage node with the category ID
    get().setActiveStageNode(selectedNodeId, categoryId)

    console.log('[Store.activateCategoryTable] ✅ Leaf node selected and category activated')
  },

  /**
   * Move to the next stage in the workflow (e.g., from Feature Splitting to Quality)
   */
  moveToNextStep: () => {
    const state = get()
    const { activeStageCategory } = state

    console.log('[Store.moveToNextStep] Moving to next step from category:', activeStageCategory)

    if (activeStageCategory === TAG_CATEGORY_FEATURE_SPLITTING) {
      // This is the feature split table (pair selection)
      // Freeze the current pair selection states
      // COMMENTED OUT: Thick border indicator for previously tagged rows
      // const frozenPairStates = new Map(pairSelectionStates)
      // set({ donePairSelectionStates: frozenPairStates })

      // Next step is Quality
      console.log('[Store.moveToNextStep] Transitioning from Feature Splitting to Quality')
      state.activateCategoryTable(TAG_CATEGORY_QUALITY)
    } else if (activeStageCategory === TAG_CATEGORY_QUALITY) {
      // This is the quality table (feature selection)
      // Freeze the current feature selection states
      // COMMENTED OUT: Thick border indicator for previously tagged rows
      // const frozenFeatureStates = new Map(featureSelectionStates)
      // set({ doneFeatureSelectionStates: frozenFeatureStates })

      // Next step is Cause
      console.log('[Store.moveToNextStep] Transitioning from Quality to Cause')
      state.activateCategoryTable(TAG_CATEGORY_CAUSE)
    } else {
      console.log('[Store.moveToNextStep] No next step defined for category:', activeStageCategory)
    }
  },

  // ============================================================================
  // SIMILARITY SORT ACTION
  // ============================================================================

  sortBySimilarity: async () => {
    const state = get()
    const { featureSelectionStates, featureSelectionSources, tableData } = state

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

    // Extract selected and rejected IDs (ONLY manually labeled features)
    const selectedIds: number[] = []
    const rejectedIds: number[] = []

    featureSelectionStates.forEach((selectionState: string, featureId: number) => {
      const source = featureSelectionSources.get(featureId)
      // Only use manually labeled features for similarity sorting
      if (source === 'manual') {
        if (selectionState === 'selected') {
          selectedIds.push(featureId)
        } else if (selectionState === 'rejected') {
          rejectedIds.push(featureId)
        }
      }
    })

    console.log('[Store.sortBySimilarity] Selection counts (manual only):', {
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
    const { pairSelectionStates, pairSelectionSources } = state

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

    // Extract selected and rejected pair keys (ONLY manually labeled pairs)
    const selectedPairKeys: string[] = []
    const rejectedPairKeys: string[] = []

    pairSelectionStates.forEach((selectionState: string, pairKey: string) => {
      const source = pairSelectionSources.get(pairKey)
      // Only use manually labeled pairs for similarity sorting
      if (source === 'manual') {
        if (selectionState === 'selected') {
          selectedPairKeys.push(pairKey)
        } else if (selectionState === 'rejected') {
          rejectedPairKeys.push(pairKey)
        }
      }
    })

    console.log('[Store.sortPairsBySimilarity] Selection counts (manual only):', {
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

      // Debug: Log sample of stored keys
      const sampleKeys = Array.from(scoresMap.keys()).slice(0, 5)
      console.log('[Store.sortPairsBySimilarity] Sample stored keys:', sampleKeys)

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

  /**
   * Sort cause table by similarity scores (multi-category with One-vs-Rest SVM)
   */
  sortCauseBySimilarity: async () => {
    const state = get()
    const { causeSelectionStates, causeSelectionSources, tableData } = state

    console.log('[Store.sortCauseBySimilarity] Starting cause similarity sort:', {
      selectionStatesSize: causeSelectionStates.size,
      hasTableData: !!tableData
    })

    // Validate: need at least 2 different cause categories selected
    if (causeSelectionStates.size < 1) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  No cause categories selected for similarity sort')
      return
    }

    if (!tableData?.features) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  No table data available')
      return
    }

    // Count features per cause category (ONLY manually labeled)
    const categoryCounts: Record<string, number> = {
      'noisy-activation': 0,
      'missed-lexicon': 0,
      'missed-context': 0
    }

    causeSelectionStates.forEach((category: 'noisy-activation' | 'missed-lexicon' | 'missed-context', featureId: number) => {
      const source = causeSelectionSources.get(featureId)
      // Only count manually labeled features
      if (source === 'manual') {
        categoryCounts[category]++
      }
    })

    const categoriesWithFeatures = Object.values(categoryCounts).filter(c => c > 0).length

    console.log('[Store.sortCauseBySimilarity] Category counts (manual only):', categoryCounts, {
      categoriesWithFeatures
    })

    // Need at least 2 different categories for meaningful sort
    if (categoriesWithFeatures < 2) {
      console.warn('[Store.sortCauseBySimilarity] ⚠️  Need at least 2 different cause categories selected (manual only)')
      return
    }

    try {
      set({ isCauseSimilaritySortLoading: true })

      // Convert Map to plain object for API (ONLY manually labeled)
      const causeSelections: Record<number, string> = {}
      causeSelectionStates.forEach((category: string, featureId: number) => {
        const source = causeSelectionSources.get(featureId)
        // Only use manually labeled features for similarity sorting
        if (source === 'manual') {
          causeSelections[featureId] = category
        }
      })

      // Get all feature IDs
      const allFeatureIds = tableData.features.map((f: any) => f.feature_id)

      console.log('[Store.sortCauseBySimilarity] Calling API:', {
        taggedFeatures: Object.keys(causeSelections).length,
        totalFeatures: allFeatureIds.length,
        categories: Array.from(new Set(Object.values(causeSelections)))
      })

      // Call new multi-class OvR endpoint
      const response = await api.getCauseSimilaritySort(
        causeSelections,
        allFeatureIds
      )

      console.log('[Store.sortCauseBySimilarity] API response:', {
        sortedFeaturesCount: response.sorted_features.length,
        totalFeatures: response.total_features
      })

      // Store per-category confidences in a nested map
      const categoryConfidences = new Map<number, Record<string, number>>()
      response.sorted_features.forEach((fs) => {
        categoryConfidences.set(fs.feature_id, fs.category_confidences)
      })

      // Store in state
      set({
        causeCategoryConfidences: categoryConfidences,
        tableSortBy: 'cause_similarity',
        tableSortDirection: 'desc',
        isCauseSimilaritySortLoading: false
      })

      console.log('[Store.sortCauseBySimilarity] ✅ Cause similarity sort complete:', {
        confidencesMapSize: categoryConfidences.size,
        sortBy: 'cause_similarity'
      })

    } catch (error) {
      console.error('[Store.sortCauseBySimilarity] ❌ Failed to calculate cause similarity sort:', error)
      set({ isCauseSimilaritySortLoading: false })
    }
  },

  /**
   * Set which category to use for cause similarity sorting
   * @param category - 'noisy-activation', 'missed-lexicon', 'missed-context', or null for max confidence
   */
  setCauseSortCategory: (category: string | null) => {
    set({ causeSortCategory: category })
    console.log('[Store.setCauseSortCategory] Cause sort category updated:', category)
  },

  // ============================================================================
  // SIMILARITY TAGGING ACTIONS (automatic tagging based on histogram)
  // ============================================================================

  showSimilarityTaggingPopover: async (mode: 'feature' | 'pair' | 'cause', position: { x: number; y: number }, tagLabel: string) => {
    console.log(`[Store.showSimilarityTaggingPopover] Opening ${mode} tagging popover with label: ${tagLabel}`)

    // Extract selection states based on mode
    const { featureSelectionStates, pairSelectionStates, tableData } = get()

    try {
      // Set loading state
      set({
        similarityTaggingPopover: {
          visible: true,
          minimized: false,
          mode,
          position,
          histogramData: null,
          selectThreshold: 0.1,
          rejectThreshold: -0.1,
          tagLabel,
          isLoading: true
        }
      })

      if (mode === 'feature') {
        // Extract selected and rejected feature IDs
        const selectedIds: number[] = []
        const rejectedIds: number[] = []
        const allFeatureIds: number[] = []

        featureSelectionStates.forEach((state: string | null, featureId: number) => {
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

        // Calculate dynamic thresholds based on data range
        // Use 1/2 of max value for initial select threshold (positive)
        // Use -1/2 of max value for initial reject threshold (negative)
        const { statistics } = histogramData
        const maxAbsValue = Math.max(
          Math.abs(statistics.min || 0),
          Math.abs(statistics.max || 0)
        )
        // Default to 0.2 if data has no range or invalid values
        const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
        const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

        // Update state with histogram data
        // Initialize with dual thresholds for auto-selecting and auto-rejecting
        set({
          similarityTaggingPopover: {
            visible: true,
            minimized: false,
            mode,
            position,
            histogramData,
            selectThreshold,
            rejectThreshold,
            tagLabel,
            isLoading: false
          }
        })

      } else if (mode === 'pair') {
        // Extract selected and rejected pair keys
        const selectedPairKeys: string[] = []
        const rejectedPairKeys: string[] = []
        const allPairKeys: string[] = []

        pairSelectionStates.forEach((state: string | null, pairKey: string) => {
          if (state === 'selected') selectedPairKeys.push(pairKey)
          else if (state === 'rejected') rejectedPairKeys.push(pairKey)
        })

        // Get all pair keys from current table view
        // This would need to be passed from the component or computed from tableData
        // For now, use the pairs that have been displayed
        pairSelectionStates.forEach((_: string | null, pairKey: string) => {
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

        // Calculate dynamic thresholds based on data range
        // Use 1/2 of max value for initial select threshold (positive)
        // Use -1/2 of max value for initial reject threshold (negative)
        const { statistics } = histogramData
        const maxAbsValue = Math.max(
          Math.abs(statistics.min || 0),
          Math.abs(statistics.max || 0)
        )
        // Default to 0.2 if data has no range or invalid values
        const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
        const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

        // Update state with histogram data
        // Initialize with dual thresholds for auto-selecting and auto-rejecting
        set({
          similarityTaggingPopover: {
            visible: true,
            minimized: false,
            mode,
            position,
            histogramData,
            selectThreshold,
            rejectThreshold,
            tagLabel,
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

  updateSimilarityThresholds: (selectThreshold: number) => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        selectThreshold
      }
    })
  },

  updateBothSimilarityThresholds: (selectThreshold: number, rejectThreshold: number) => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        selectThreshold,
        rejectThreshold
      }
    })
  },

  applySimilarityTags: () => {
    const { similarityTaggingPopover, featureSelectionStates, featureSelectionSources, pairSelectionStates, pairSelectionSources } = get()

    if (!similarityTaggingPopover || !similarityTaggingPopover.histogramData) {
      console.warn('[Store.applySimilarityTags] No popover data available')
      return
    }

    const { mode, selectThreshold, rejectThreshold, histogramData } = similarityTaggingPopover
    const scores = histogramData.scores

    console.log(`[Store.applySimilarityTags] Applying ${mode} tags with thresholds:`, {
      select: selectThreshold,
      reject: rejectThreshold
    })

    if (mode === 'feature') {
      // Apply tags to features (dual thresholds: auto-select and auto-reject)
      const newSelectionStates = new Map(featureSelectionStates)
      const newSelectionSources = new Map(featureSelectionSources)
      let selectedCount = 0
      let rejectedCount = 0
      let untaggedCount = 0

      Object.entries(scores).forEach(([idStr, score]) => {
        const featureId = parseInt(idStr, 10)

        // Skip if already manually tagged
        if (featureSelectionStates.has(featureId)) {
          return
        }

        // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
        if (typeof score === 'number') {
          if (score >= selectThreshold) {
            // Blue zone: auto-select
            newSelectionStates.set(featureId, 'selected')
            newSelectionSources.set(featureId, 'auto')
            selectedCount++
          } else if (score <= rejectThreshold) {
            // Light red zone: auto-reject
            newSelectionStates.set(featureId, 'rejected')
            newSelectionSources.set(featureId, 'auto')
            rejectedCount++
          } else {
            // Middle zone: leave untagged
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

      set({
        featureSelectionStates: newSelectionStates,
        featureSelectionSources: newSelectionSources
      })

    } else if (mode === 'pair') {
      // Apply tags to pairs (dual thresholds: auto-select and auto-reject)
      const newPairSelectionStates = new Map(pairSelectionStates)
      const newPairSelectionSources = new Map(pairSelectionSources)
      let selectedCount = 0
      let rejectedCount = 0
      let untaggedCount = 0

      Object.entries(scores).forEach(([pairKey, score]) => {
        // Skip if already manually tagged
        if (pairSelectionStates.has(pairKey)) {
          return
        }

        // Apply dual threshold logic: auto-select above threshold, auto-reject below threshold
        if (typeof score === 'number') {
          if (score >= selectThreshold) {
            // Blue zone: auto-select
            newPairSelectionStates.set(pairKey, 'selected')
            newPairSelectionSources.set(pairKey, 'auto')
            selectedCount++
          } else if (score <= rejectThreshold) {
            // Light red zone: auto-reject
            newPairSelectionStates.set(pairKey, 'rejected')
            newPairSelectionSources.set(pairKey, 'auto')
            rejectedCount++
          } else {
            // Middle zone: leave untagged
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

      set({
        pairSelectionStates: newPairSelectionStates,
        pairSelectionSources: newPairSelectionSources
      })
    }

    // Close popover after applying
    set({ similarityTaggingPopover: null })
  },

  /**
   * Sort table by selection category
   * Order: Confirmed -> Expanded -> Unsure -> Rejected (or clicked category first)
   * If similarity sort is active, use it as secondary sort within each category
   */
  sortTableByCategory: (category: 'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure', mode: 'feature' | 'pair' | 'cause') => {
    const {
      tableData,
      featureSelectionStates,
      featureSelectionSources,
      pairSelectionStates,
      pairSelectionSources,
      similarityScores,
      pairSimilarityScores
    } = get()

    if (!tableData) {
      console.warn('[Store.sortTableByCategory] No table data available')
      return
    }

    console.log(`[Store.sortTableByCategory] Sorting by category: ${category}, mode: ${mode}`)

    // Define category order with clicked category first
    const categoryOrder: Array<'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure'> = (() => {
      const baseOrder: Array<'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure'> = ['confirmed', 'expanded', 'unsure', 'rejected', 'autoRejected']
      // Move clicked category to front
      return [category, ...baseOrder.filter(c => c !== category)]
    })()

    // Helper function to get category for a feature/pair
    const getCategory = (id: number | string, isFeature: boolean): 'confirmed' | 'expanded' | 'rejected' | 'autoRejected' | 'unsure' => {
      if (isFeature) {
        const featureId = id as number
        const selectionState = featureSelectionStates.get(featureId)
        const source = featureSelectionSources.get(featureId)

        if (selectionState === 'selected') {
          return source === 'auto' ? 'expanded' : 'confirmed'
        } else if (selectionState === 'rejected') {
          return source === 'auto' ? 'autoRejected' : 'rejected'
        } else {
          return 'unsure'
        }
      } else {
        const pairKey = id as string
        const selectionState = pairSelectionStates.get(pairKey)
        const source = pairSelectionSources.get(pairKey)

        if (selectionState === 'selected') {
          return source === 'auto' ? 'expanded' : 'confirmed'
        } else if (selectionState === 'rejected') {
          return source === 'auto' ? 'autoRejected' : 'rejected'
        } else {
          return 'unsure'
        }
      }
    }

    if (mode === 'feature' && tableData.features) {
      // Sort features by category
      const sortedFeatures = [...tableData.features].sort((a, b) => {
        const categoryA = getCategory(a.feature_id, true)
        const categoryB = getCategory(b.feature_id, true)

        const categoryIndexA = categoryOrder.indexOf(categoryA)
        const categoryIndexB = categoryOrder.indexOf(categoryB)

        // Primary sort: by category order
        if (categoryIndexA !== categoryIndexB) {
          return categoryIndexA - categoryIndexB
        }

        // Secondary sort: by similarity score if available (descending)
        const scoreA = similarityScores.get(a.feature_id) ?? -1
        const scoreB = similarityScores.get(b.feature_id) ?? -1

        if (scoreA !== scoreB && (scoreA >= 0 || scoreB >= 0)) {
          return scoreB - scoreA // descending
        }

        // Tertiary sort: by feature_id (ascending)
        return a.feature_id - b.feature_id
      })

      set({
        tableData: {
          ...tableData,
          features: sortedFeatures
        }
      })

      console.log('[Store.sortTableByCategory] Features sorted by category')

    } else if (mode === 'pair' && tableData.pairs) {
      // Sort pairs by category
      const sortedPairs = [...tableData.pairs].sort((a, b) => {
        const categoryA = getCategory(a.pairKey, false)
        const categoryB = getCategory(b.pairKey, false)

        const categoryIndexA = categoryOrder.indexOf(categoryA)
        const categoryIndexB = categoryOrder.indexOf(categoryB)

        // Primary sort: by category order
        if (categoryIndexA !== categoryIndexB) {
          return categoryIndexA - categoryIndexB
        }

        // Secondary sort: by similarity score if available (descending)
        const scoreA = pairSimilarityScores.get(a.pairKey) ?? -1
        const scoreB = pairSimilarityScores.get(b.pairKey) ?? -1

        if (scoreA !== scoreB && (scoreA >= 0 || scoreB >= 0)) {
          return scoreB - scoreA // descending
        }

        // Tertiary sort: by pairKey (ascending)
        return a.pairKey.localeCompare(b.pairKey)
      })

      set({
        tableData: {
          ...tableData,
          pairs: sortedPairs
        }
      })

      console.log('[Store.sortTableByCategory] Pairs sorted by category')
    }
  },

  /**
   * Minimize the similarity tagging popover
   */
  minimizeSimilarityTaggingPopover: () => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        minimized: true
      }
    })
    console.log('[Store.minimizeSimilarityTaggingPopover] Popover minimized')
  },

  /**
   * Restore the similarity tagging popover from minimized state
   */
  restoreSimilarityTaggingPopover: () => {
    const { similarityTaggingPopover } = get()
    if (!similarityTaggingPopover) return

    set({
      similarityTaggingPopover: {
        ...similarityTaggingPopover,
        minimized: false
      }
    })
    console.log('[Store.restoreSimilarityTaggingPopover] Popover restored')
  },

  /**
   * Show thresholds on table - sorts by similarity and shows threshold lines
   */
  showThresholdsOnTable: async () => {
    const { similarityTaggingPopover, tableData } = get()
    if (!similarityTaggingPopover) {
      console.warn('[Store.showThresholdsOnTable] No popover state available')
      return
    }

    const { mode, selectThreshold, rejectThreshold } = similarityTaggingPopover

    console.log('[Store.showThresholdsOnTable] Showing thresholds on table:', {
      mode,
      selectThreshold,
      rejectThreshold
    })

    try {
      // Step 1: Trigger appropriate sort function
      if (mode === 'feature') {
        await get().sortBySimilarity()
      } else if (mode === 'pair') {
        // Extract all pair keys from table data
        const allPairKeys: string[] = []
        if (tableData && tableData.features) {
          tableData.features.forEach((feature: any) => {
            if (feature.decoder_similarity && Array.isArray(feature.decoder_similarity)) {
              feature.decoder_similarity.slice(0, 4).forEach((similarItem: any) => {
                const mainId = feature.feature_id
                const similarId = similarItem.feature_id
                // Use canonical format (smaller ID first)
                const pairKey = mainId < similarId
                  ? `${mainId}-${similarId}`
                  : `${similarId}-${mainId}`
                if (!allPairKeys.includes(pairKey)) {
                  allPairKeys.push(pairKey)
                }
              })
            }
          })
        }
        await get().sortPairsBySimilarity(allPairKeys)
      } else if (mode === 'cause') {
        await get().sortCauseBySimilarity()
      }

      // Step 2: Calculate threshold positions
      const { similarityScores, pairSimilarityScores, causeCategoryConfidences, causeSortCategory } = get()

      let selectPosition: number | null = null
      let rejectPosition: number | null = null

      if (mode === 'feature') {
        // Get table data and replicate the sorting logic from QualityTable.tsx
        const updatedTableData = get().tableData
        const { featureSelectionStates, sortedBySelectionStates } = get()

        if (updatedTableData && updatedTableData.features) {
          const features = updatedTableData.features

          // Replicate the three-tier sorting logic from QualityTable.tsx (lines 274-310)
          const selected: any[] = []
          const rejected: any[] = []
          const unselected: any[] = []

          // Use frozen selection states if available (from similarity sort)
          const groupingStates = sortedBySelectionStates || featureSelectionStates

          // Separate into three groups
          features.forEach((feature: any) => {
            const selectionState = groupingStates.get(feature.feature_id)
            if (selectionState === 'selected') {
              selected.push(feature)
            } else if (selectionState === 'rejected') {
              rejected.push(feature)
            } else {
              unselected.push(feature)
            }
          })

          // Sort unselected by similarity score (descending)
          unselected.sort((a, b) => {
            const scoreA = similarityScores.get(a.feature_id) ?? -Infinity
            const scoreB = similarityScores.get(b.feature_id) ?? -Infinity
            return scoreB - scoreA
          })

          // Create sorted features array in display order
          const sortedFeatures = [...selected, ...unselected, ...rejected]

          // Find position of select threshold (blue line)
          // This is the last feature with score >= selectThreshold
          for (let i = 0; i < sortedFeatures.length; i++) {
            const score = similarityScores.get(sortedFeatures[i].feature_id)
            if (score !== undefined && score >= selectThreshold) {
              selectPosition = i
            } else if (selectPosition !== null) {
              break // Stop when we pass the threshold
            }
          }

          // Find position of reject threshold (red line)
          // This is the last feature with score >= rejectThreshold
          for (let i = 0; i < sortedFeatures.length; i++) {
            const score = similarityScores.get(sortedFeatures[i].feature_id)
            if (score !== undefined && score >= rejectThreshold) {
              rejectPosition = i
            } else if (rejectPosition !== null) {
              break
            }
          }
        }
      } else if (mode === 'pair') {
        // Get sorted pair list from tableData
        const updatedTableData = get().tableData
        if (updatedTableData && updatedTableData.pairs) {
          const pairs = updatedTableData.pairs

          for (let i = 0; i < pairs.length; i++) {
            const score = pairSimilarityScores.get(pairs[i].pairKey)
            if (score !== undefined && score >= selectThreshold) {
              selectPosition = i
            } else if (selectPosition !== null) {
              break
            }
          }

          for (let i = 0; i < pairs.length; i++) {
            const score = pairSimilarityScores.get(pairs[i].pairKey)
            if (score !== undefined && score >= rejectThreshold) {
              rejectPosition = i
            } else if (rejectPosition !== null) {
              break
            }
          }
        }
      } else if (mode === 'cause') {
        // For cause mode, replicate CauseTable sorting logic
        const updatedTableData = get().tableData
        if (updatedTableData && updatedTableData.features) {
          const features = [...updatedTableData.features]

          // Sort by confidence scores (descending) to match CauseTable display
          const sorted = features.sort((a, b) => {
            const confidencesA = causeCategoryConfidences.get(a.feature_id)
            const confidencesB = causeCategoryConfidences.get(b.feature_id)

            let scoreA = -Infinity
            let scoreB = -Infinity

            if (confidencesA) {
              if (causeSortCategory && confidencesA[causeSortCategory] !== undefined) {
                scoreA = confidencesA[causeSortCategory] as number
              } else {
                scoreA = Math.max(...Object.values(confidencesA) as number[])
              }
            }

            if (confidencesB) {
              if (causeSortCategory && confidencesB[causeSortCategory] !== undefined) {
                scoreB = confidencesB[causeSortCategory] as number
              } else {
                scoreB = Math.max(...Object.values(confidencesB) as number[])
              }
            }

            return scoreB - scoreA  // Descending order
          })

          // Find threshold positions in sorted array
          for (let i = 0; i < sorted.length; i++) {
            const confidences = causeCategoryConfidences.get(sorted[i].feature_id)
            let score = -Infinity
            if (confidences) {
              if (causeSortCategory) {
                score = (confidences[causeSortCategory] as number) ?? -Infinity
              } else {
                score = Math.max(...Object.values(confidences) as number[])
              }
            }

            if (score >= selectThreshold) {
              selectPosition = i
            } else if (selectPosition !== null) {
              break
            }
          }

          for (let i = 0; i < sorted.length; i++) {
            const confidences = causeCategoryConfidences.get(sorted[i].feature_id)
            let score = -Infinity
            if (confidences) {
              if (causeSortCategory) {
                score = (confidences[causeSortCategory] as number) ?? -Infinity
              } else {
                score = Math.max(...Object.values(confidences) as number[])
              }
            }

            if (score >= rejectThreshold) {
              rejectPosition = i
            } else if (rejectPosition !== null) {
              break
            }
          }
        }
      }

      // Step 2.5: Calculate preview sets (which items would be auto-tagged)
      const previewAutoSelected = new Set<number | string>()
      const previewAutoRejected = new Set<number | string>()

      if (mode === 'feature') {
        const { featureSelectionStates } = get()
        // Check each feature with a similarity score
        similarityScores.forEach((score: any, featureId: any) => {
          const isAlreadyTagged = featureSelectionStates.has(featureId)
          if (!isAlreadyTagged) {
            if (score >= selectThreshold) {
              previewAutoSelected.add(featureId)
            } else if (score <= rejectThreshold) {
              previewAutoRejected.add(featureId)
            }
          }
        })
      } else if (mode === 'pair') {
        const { pairSelectionStates } = get()
        // Check each pair with a similarity score
        pairSimilarityScores.forEach((score: any, pairKey: any) => {
          const isAlreadyTagged = pairSelectionStates.has(pairKey)
          if (!isAlreadyTagged) {
            if (score >= selectThreshold) {
              previewAutoSelected.add(pairKey)
            } else if (score <= rejectThreshold) {
              previewAutoRejected.add(pairKey)
            }
          }
        })
      } else if (mode === 'cause') {
        const { causeSelectionStates } = get()
        // Check each feature with confidence scores
        causeCategoryConfidences.forEach((confidences: any, featureId: any) => {
          const isAlreadyTagged = causeSelectionStates.has(featureId)
          if (!isAlreadyTagged) {
            let score = -Infinity
            if (causeSortCategory && confidences[causeSortCategory] !== undefined) {
              score = confidences[causeSortCategory] as number
            } else {
              score = Math.max(...Object.values(confidences) as number[])
            }
            if (score >= selectThreshold) {
              previewAutoSelected.add(featureId)
            } else if (score <= rejectThreshold) {
              previewAutoRejected.add(featureId)
            }
          }
        })
      }

      console.log('[Store.showThresholdsOnTable] Preview sets calculated:', {
        autoSelected: previewAutoSelected.size,
        autoRejected: previewAutoRejected.size
      })

      // Step 3: Store visualization state
      // Note: Setting positions to null - stripe patterns are sufficient for preview
      set({
        thresholdVisualization: {
          visible: true,
          mode,
          selectThreshold,
          rejectThreshold,
          selectPosition: null,
          rejectPosition: null,
          previewAutoSelected,
          previewAutoRejected
        }
      })

      // Step 4: Minimize popover
      get().minimizeSimilarityTaggingPopover()

      console.log('[Store.showThresholdsOnTable] Thresholds displayed:', {
        selectPosition,
        rejectPosition
      })

    } catch (error) {
      console.error('[Store.showThresholdsOnTable] Failed to show thresholds:', error)
    }
  },

  /**
   * Hide thresholds from table
   */
  hideThresholdsOnTable: () => {
    set({ thresholdVisualization: null })
    console.log('[Store.hideThresholdsOnTable] Thresholds hidden')
  },

  /**
   * Fetch evenly distributed features for pair viewer
   * Uses K-Means clustering in 9D metric space to select n distributed features
   */
  fetchDistributedPairs: async (n: number = 30) => {
    const { tableData } = get()

    console.log('[Store.fetchDistributedPairs] Starting distributed pair fetch:', { n })

    if (!tableData?.rows) {
      console.warn('[Store.fetchDistributedPairs] ⚠️  No table data available')
      return
    }

    try {
      set({ isLoadingDistributedPairs: true })

      // Extract all feature IDs from table data
      const featureIds = tableData.rows.map((row: any) => row.feature_id)

      console.log('[Store.fetchDistributedPairs] Calling API:', {
        totalFeatures: featureIds.length,
        requestedN: n
      })

      // Call API to get distributed features
      const response = await api.getDistributedFeatures(featureIds, n)

      console.log('[Store.fetchDistributedPairs] API response:', {
        selectedCount: response.selected_features.length,
        totalAvailable: response.total_available,
        method: response.method_used
      })

      set({
        distributedPairFeatureIds: response.selected_features,
        isLoadingDistributedPairs: false
      })

      console.log('[Store.fetchDistributedPairs] ✅ Distributed pairs loaded successfully')

    } catch (error) {
      console.error('[Store.fetchDistributedPairs] ❌ Failed to fetch distributed features:', error)
      set({
        distributedPairFeatureIds: null,
        isLoadingDistributedPairs: false
      })
    }
  },

  /**
   * Clear distributed pairs
   */
  clearDistributedPairs: () => {
    set({ distributedPairFeatureIds: null })
    console.log('[Store.clearDistributedPairs] Distributed pairs cleared')
  }
})
