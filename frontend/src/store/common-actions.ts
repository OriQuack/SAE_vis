import * as api from '../api'
import type { SankeySegmentSelection } from '../types'
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
} from '../lib/constants'

// ============================================================================
// MODULE-LEVEL CACHE
// ============================================================================

/**
 * Module-level cache for table data.
 *
 * This cache persists outside the React/Zustand lifecycle, surviving:
 * - React StrictMode double-renders
 * - Zustand store recreations
 * - Component remounts
 *
 * Only cleared on actual page reload or explicit clearTableDataCache() call.
 * This is critical because table data never changes during a session.
 */
let tableDataCache: any | null = null
let tableDataFetchInProgress = false

// Debug: Log when module is loaded (helps detect HMR reloads)
console.log('[common-actions] Module loaded/reloaded - cache initialized to null')

// ============================================================================
// COMMON ACTIONS (shared by all stages)
// ============================================================================

/**
 * Factory function to create common actions for the store
 */
export const createCommonActions = (set: any, get: any) => ({
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
      set({
        tableSelectedNodeIds: [],
        selectedSegment: null,
        // Also clear flow visualization
        selectedSankeySegment: null,
        sankeyToSelectionFlows: null
      })
      console.log('[Store.selectSingleNode] Cleared selection')
    } else {
      // Select: replace array with single node
      set({ tableSelectedNodeIds: [nodeId] })

      // V2: If segment index provided, also set selectedSegment and flow visualization
      if (segmentIndex !== undefined && segmentIndex !== null) {
        set({
          selectedSegment: { nodeId, segmentIndex },
          // Also set flow visualization
          selectedSankeySegment: { nodeId, segmentIndex, panel: 'left' },
          sankeyToSelectionFlows: null
        })
        console.log('[Store.selectSingleNode] Selected node with segment:', nodeId, 'segment:', segmentIndex)
      } else {
        set({
          selectedSegment: null,
          // Clear flow visualization when no segment
          selectedSankeySegment: null,
          sankeyToSelectionFlows: null
        })
        console.log('[Store.selectSingleNode] Selected node:', nodeId)
      }
    }

    // No need to re-fetch - TablePanel will filter based on new selection
  },

  // V2: Segment-specific selection actions
  selectSegment: (nodeId: string, segmentIndex: number) => {
    set({
      selectedSegment: { nodeId, segmentIndex },
      tableSelectedNodeIds: [nodeId],
      // Also set flow visualization for auto-selected segments
      selectedSankeySegment: { nodeId, segmentIndex, panel: 'left' },
      sankeyToSelectionFlows: null
    })
    console.log('[Store.selectSegment] Selected segment:', { nodeId, segmentIndex })
  },

  clearSegmentSelection: () => {
    set({
      selectedSegment: null,
      tableSelectedNodeIds: [],
      // Also clear flow visualization
      selectedSankeySegment: null,
      sankeyToSelectionFlows: null
    })
    console.log('[Store.clearSegmentSelection] Cleared segment selection')
  },

  // Sankey-to-Selection flow visualization actions
  setSelectedSankeySegment: (selection: SankeySegmentSelection | null) => {
    set({
      selectedSankeySegment: selection,
      sankeyToSelectionFlows: null  // Clear flows, will be recalculated by overlay component
    })
    console.log('[Store.setSelectedSankeySegment] Selected Sankey segment for flow:', selection)
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
    const { tableSelectedNodeIds, leftPanel, selectedSegment,
            isRevisitingStage1, stage1FinalCommit,
            isRevisitingStage2, stage2FinalCommit,
            isRevisitingStage3, stage3FinalCommit } = state

    // When revisiting Stage 1, use stored feature IDs
    if (isRevisitingStage1 && stage1FinalCommit?.featureIds) {
      console.log('[Store.getSelectedNodeFeatures] Using Stage 1 revisit feature IDs:', stage1FinalCommit.featureIds.size)
      return stage1FinalCommit.featureIds
    }

    // When revisiting Stage 2, use stored feature IDs
    if (isRevisitingStage2 && stage2FinalCommit?.featureIds) {
      console.log('[Store.getSelectedNodeFeatures] Using Stage 2 revisit feature IDs:', stage2FinalCommit.featureIds.size)
      return stage2FinalCommit.featureIds
    }

    // When revisiting Stage 3, use stored feature IDs
    if (isRevisitingStage3 && stage3FinalCommit?.featureIds) {
      console.log('[Store.getSelectedNodeFeatures] Using Stage 3 revisit feature IDs:', stage3FinalCommit.featureIds.size)
      return stage3FinalCommit.featureIds
    }

    if (tableSelectedNodeIds.length === 0) {
      return null // No selection - show all features
    }

    // Special case: Stage 3 node selected without specific segment
    // This happens when we want to select the entire stage3_segment node
    if (tableSelectedNodeIds.includes('stage3_segment') && leftPanel.sankeyStructure) {
      const needRevisionNode = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === 'need_revision')
      if (needRevisionNode && needRevisionNode.featureIds) {
        console.log('[Store.getSelectedNodeFeatures] V2: Stage 3 whole node - returning all need_revision features:', {
          featureCount: needRevisionNode.featureIds.size
        })
        return needRevisionNode.featureIds
      }
    }

    // V2: If a specific segment is selected, return only that segment's features
    if (selectedSegment && leftPanel.sankeyStructure) {
      const segmentNode = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === selectedSegment.nodeId)

      if (segmentNode && segmentNode.type === 'segment' && segmentNode.segments) {
        // Special case for Stage 3: Return ALL features from need_revision node
        // The threshold segments in stage3_segment are for visualization only.
        // CauseView should always work with all features flowing into Stage 3.
        if (selectedSegment.nodeId === 'stage3_segment') {
          const needRevisionNode = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === 'need_revision')
          if (needRevisionNode && needRevisionNode.featureIds) {
            console.log('[Store.getSelectedNodeFeatures] V2: Stage 3 - returning all need_revision features:', {
              featureCount: needRevisionNode.featureIds.size
            })
            return needRevisionNode.featureIds
          }
        }

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
   * Fetch table data with module-level caching.
   *
   * Uses a module-level cache to persist data across React StrictMode
   * double-renders and Zustand store recreations.
   */
  fetchTableData: async () => {
    // Debug: Log cache state
    console.log('[Store.fetchTableData] Cache check:', {
      hasCache: tableDataCache !== null,
      cacheFeatureCount: tableDataCache?.features?.length || 0,
      fetchInProgress: tableDataFetchInProgress
    })

    // Check module-level cache first (survives store recreation)
    if (tableDataCache !== null) {
      console.log('[Store.fetchTableData] Using module-level cache:', {
        featureCount: tableDataCache.features?.length || 0
      })
      set((state: any) => ({
        tableData: tableDataCache,
        loading: { ...state.loading, table: false }
      }))
      return
    }

    // Check module-level loading flag (prevents race condition across store recreations)
    if (tableDataFetchInProgress) {
      console.log('[Store.fetchTableData] Fetch already in progress (module-level), skipping')
      return
    }

    const state = get()
    const { leftPanel, rightPanel, loading } = state

    // Check store-level cache (fallback)
    if (state.tableData) {
      console.log('[Store.fetchTableData] Store cache already populated')
      // Also update module-level cache for future store recreations
      tableDataCache = state.tableData
      return
    }

    // 🚫 DEDUPLICATION: Skip if already loading to prevent redundant API calls
    if (loading.table) {
      console.log('[Store.fetchTableData] Already loading (store-level), skipping duplicate request')
      return
    }

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

    console.log('[Store.fetchTableData] Starting table data fetch...')

    // Set both module-level and store-level loading flags
    tableDataFetchInProgress = true
    set((state: any) => ({
      loading: { ...state.loading, table: true },
      errors: { ...state.errors, table: null }
    }))

    const startTime = performance.now()

    try {
      // Create filter with all selected explainers and scorers
      const filters = {
        sae_id: [],
        explanation_method: [],
        llm_explainer: Array.from(explainers),
        llm_scorer: Array.from(scorers)
      }

      const tableData = await api.getTableData({ filters })

      const duration = performance.now() - startTime
      console.log(`[Store.fetchTableData] ✅ Loaded ${tableData.features?.length || 0} features in ${duration.toFixed(0)}ms`)

      // Store in both module-level and store-level cache
      tableDataCache = tableData
      tableDataFetchInProgress = false

      // Debug: Confirm cache was set
      console.log('[Store.fetchTableData] Cache populated:', {
        hasCache: tableDataCache !== null,
        featureCount: tableDataCache?.features?.length || 0,
        cacheRef: tableDataCache === tableData ? 'same-ref' : 'different-ref'
      })

      set((state: any) => ({
        tableData,
        loading: { ...state.loading, table: false }
      }))
    } catch (error) {
      console.error('[Store.fetchTableData] Failed:', error)
      tableDataFetchInProgress = false
      set((state: any) => ({
        tableData: null,
        loading: { ...state.loading, table: false },
        errors: { ...state.errors, table: error instanceof Error ? error.message : 'Failed to fetch table data' }
      }))
    }
  },

  /**
   * Clear table data cache (for memory management or testing).
   * Clears both module-level and store-level caches.
   */
  clearTableDataCache: () => {
    console.log('[Store.clearTableDataCache] Clearing table data cache (both module and store level)')
    // Clear module-level cache
    tableDataCache = null
    tableDataFetchInProgress = false
    // Clear store-level cache
    set({ tableData: null })
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

    // V2: Find the segment node and specific segment index for this stage
    let selectedNodeId: string
    let segmentIndex: number

    // Select terminal segments: Fragmented (Stage 1), Well-Explained (Stage 2)
    if (stageNumber === 1) {
      // Check if we're in a later stage (stage1_segment no longer exists)
      if (currentStage >= 2) {
        // Stage 1 segment was replaced - select root to show all features
        selectedNodeId = 'root'
        segmentIndex = 0  // No segment selection needed
        // Set flag to indicate we're revisiting Stage 1
        set({ isRevisitingStage1: true })
        console.log('[Store.activateCategoryTable] Returning to Stage 1 from Stage 2+, selecting root, setting revisiting flag')
      } else {
        selectedNodeId = 'stage1_segment'
        segmentIndex = 1  // Fragmented (second segment, >= 0.4)
        // Clear flag when in normal Stage 1
        set({ isRevisitingStage1: false })
      }
    } else if (stageNumber === 2) {
      // Check if we're in a later stage (stage2_segment no longer exists)
      if (currentStage >= 3) {
        // Stage 2 segment was replaced - select root to show all features
        selectedNodeId = 'root'
        segmentIndex = 0  // No segment selection needed
        // Set flag to indicate we're revisiting Stage 2
        set({ isRevisitingStage1: false, isRevisitingStage2: true })
        console.log('[Store.activateCategoryTable] Returning to Stage 2 from Stage 3+, selecting root, setting revisiting flag')
      } else {
        selectedNodeId = 'stage2_segment'
        segmentIndex = 1  // Well-Explained (second segment, >= 0.7)
        // Clear Stage 1 revisiting flag when moving to Stage 2
        set({ isRevisitingStage1: false, isRevisitingStage2: false })
      }
    } else if (stageNumber === 3) {
      selectedNodeId = 'stage3_segment'
      segmentIndex = null  // Select entire node for Stage 3 (not individual segments)
      // Clear revisiting flags when moving to Stage 3
      set({ isRevisitingStage1: false, isRevisitingStage2: false })
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
})
