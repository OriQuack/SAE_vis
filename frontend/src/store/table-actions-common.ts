import * as api from '../api'
import type { SortBy, SortDirection } from '../types'
import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  PANEL_LEFT
} from '../lib/constants'
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-constants'

// ============================================================================
// COMMON TABLE ACTIONS (shared by all stages)
// ============================================================================

/**
 * Factory function to create common table-related actions for the store
 */
export const createCommonTableActions = (set: any, get: any) => ({
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
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_QUALITY_SCORE | typeof METRIC_QUALITY_SCORE | typeof METRIC_QUALITY_SCORE) => {
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
      // Next step is Quality
      console.log('[Store.moveToNextStep] Transitioning from Feature Splitting to Quality')
      state.activateCategoryTable(TAG_CATEGORY_QUALITY)
    } else if (activeStageCategory === TAG_CATEGORY_QUALITY) {
      // This is the quality table (feature selection)
      // Next step is Cause
      console.log('[Store.moveToNextStep] Transitioning from Quality to Cause')
      state.activateCategoryTable(TAG_CATEGORY_CAUSE)
    } else {
      console.log('[Store.moveToNextStep] No next step defined for category:', activeStageCategory)
    }
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
  }
})
