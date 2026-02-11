/**
 * Simplified Sankey Actions - Fixed 3-Stage Architecture
 *
 * Replaces complex tree-based actions with stage-based actions:
 * - initializeSankey(): Load root + auto-build Stage 1
 * - activateStage2(): Expand to Quality stage
 * - activateStage3(): Expand to Cause stage
 * - updateStageThreshold(): Update threshold without rebuilding downstream
 * - recomputeD3Structure(): Convert to D3 format
 */

import type { SankeyStructure, ThresholdPathConstraint, SegmentSankeyNode } from '../types'
import {
  buildStage1,
  buildStage2,
  buildStage2FromTaggedStates,
  buildStage3,
  buildStage3FromTaggedStates,
  buildStage4FromTaggedStates,
  updateStageThreshold as updateThresholdInStructure
} from '../lib/sankey-builder'
import { convertToD3Format } from '../lib/sankey-utils'
import { PANEL_LEFT, PANEL_RIGHT, getStageConfig } from '../lib/constants'
import * as api from '../api'
import { processFeatureGroupResponse } from '../lib/threshold-utils'

type PanelSide = typeof PANEL_LEFT | typeof PANEL_RIGHT

/**
 * Get threshold path for v2 segment nodes to enable histogram filtering.
 * Returns the sequence of metric constraints from root to this node.
 */
function getThresholdPath(nodeId: string, structure: SankeyStructure): ThresholdPathConstraint[] | undefined {
  // Stage 1 segment: no constraints (shows all root features)
  if (nodeId === 'stage1_segment') {
    return undefined
  }

  // Stage 2 segment: constrained by Stage 1 (monosemantic only)
  if (nodeId === 'stage2_segment') {
    const stage1Segment = structure.nodes.find(n => n.id === 'stage1_segment') as SegmentSankeyNode
    if (!stage1Segment || !stage1Segment.threshold) return undefined

    // Monosemantic = first segment (< threshold)
    return [{
      metric: 'decoder_similarity',
      rangeLabel: `< ${stage1Segment.threshold.toFixed(2)}`
    }]
  }

  // Stage 3 segment: constrained by Stage 1 and Stage 2 (need revision only)
  if (nodeId === 'stage3_segment') {
    const stage1Segment = structure.nodes.find(n => n.id === 'stage1_segment') as SegmentSankeyNode
    const stage2Segment = structure.nodes.find(n => n.id === 'stage2_segment') as SegmentSankeyNode
    if (!stage1Segment || !stage2Segment) return undefined
    if (stage1Segment.threshold == null || stage2Segment.threshold == null) return undefined

    return [
      {
        metric: 'decoder_similarity',
        rangeLabel: `< ${stage1Segment.threshold.toFixed(2)}`
      },
      {
        metric: 'quality_score',
        rangeLabel: `< ${stage2Segment.threshold.toFixed(2)}`
      }
    ]
  }

  return undefined
}

/**
 * Factory function to create simplified Sankey actions
 */
export const createSimplifiedSankeyActions = (set: any, get: any) => ({
  /**
   * Build Sankey from pre-fetched feature IDs (optimized for parallel init).
   *
   * This variant of initializeSankey uses feature IDs that were already fetched,
   * avoiding a duplicate API call during parallel initialization.
   *
   * Used by initializeWithDefaultFilters() for parallel loading:
   * - Feature IDs fetched once upfront
   * - Passed to both buildSankeyFromFeatureIds() and fetchAllActivationsChunked()
   *
   * @param featureIds - Array of all feature IDs (pre-fetched)
   * @param panel - Which panel to initialize
   */
  buildSankeyFromFeatureIds: async (featureIds: number[], panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[buildSankeyFromFeatureIds] 🚀 Building Sankey for ${panel} with ${featureIds.length} pre-fetched features`)

    // Get panel filters
    const { filters } = state[panelKey]

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Convert array to Set (expected by buildStage1)
      const allFeatures = new Set(featureIds)
      console.log(`[buildSankeyFromFeatureIds] 📊 Building Stage 1 with ${allFeatures.size} features`)

      // Build Stage 1 automatically (NO API call needed - using pre-fetched IDs!)
      const stage1Structure = await buildStage1(filters, allFeatures)

      console.log(`[buildSankeyFromFeatureIds] ✅ Stage 1 built:`, {
        nodes: stage1Structure.nodes.length,
        links: stage1Structure.links.length,
        currentStage: stage1Structure.currentStage
      })

      // Store the structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: stage1Structure,
          rootFeatureIds: allFeatures
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      // Fetch histogram data for Stage 1 segment node
      const stage1Config = getStageConfig(1)
      if (stage1Config.metric) {
        const nodeId = 'stage1_segment'
        const thresholdPath = getThresholdPath(nodeId, stage1Structure)
        console.log(`[buildSankeyFromFeatureIds] 📊 Fetching histogram for ${stage1Config.metric} on ${nodeId}`, { thresholdPath })

        // Fetch histogram using API directly
        try {
          const histogramData = await api.getHistogramData({
            filters,
            metric: stage1Config.metric,
            nodeId,
            thresholdPath,
            bins: 50
          })
          state.setHistogramData({ [stage1Config.metric]: histogramData }, panel, nodeId)
        } catch (error) {
          console.error(`[buildSankeyFromFeatureIds] Failed to fetch histogram:`, error)
        }
      }

      state.setLoading(loadingKey, false)
      console.log('[buildSankeyFromFeatureIds] ✅ Sankey built successfully from pre-fetched IDs')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to build Sankey'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[buildSankeyFromFeatureIds] ❌ Error:', error)
    }
  },

  /**
   * Initialize Sankey with root node and auto-build Stage 1 (Feature Splitting).
   * This replaces initializeFixedSankeyTree and auto-activates Stage 1.
   */
  initializeSankey: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[initializeSankey] 🚀 Initializing Sankey for ${panel}`)

    // Get panel filters
    const { filters } = state[panelKey]

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Call API to get ALL features matching filters (like loadRootFeatures)
      console.log(`[initializeSankey] 🌱 Loading features from API with filters:`, filters)
      const response = await api.getFeatureGroups({
        filters,
        metric: 'root',
        thresholds: []
      })

      // Process response to extract feature IDs
      const groups = processFeatureGroupResponse(response)
      if (groups.length === 0) {
        throw new Error('No features returned from API')
      }

      const allFeatures = groups[0].featureIds  // Set<number>
      console.log(`[initializeSankey] ✅ Loaded ${allFeatures.size} features from API`)
      console.log(`[initializeSankey] 📊 Building Stage 1 with ${allFeatures.size} features`)

      // Build Stage 1 automatically (NO tableData dependency!)
      const stage1Structure = await buildStage1(filters, allFeatures)

      console.log(`[initializeSankey] ✅ Stage 1 built:`, {
        nodes: stage1Structure.nodes.length,
        links: stage1Structure.links.length,
        currentStage: stage1Structure.currentStage
      })

      // Store the structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: stage1Structure,
          rootFeatureIds: allFeatures
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      // Fetch histogram data for Stage 1 segment node
      const stage1Config = getStageConfig(1)
      if (stage1Config.metric) {
        const nodeId = 'stage1_segment'
        const thresholdPath = getThresholdPath(nodeId, stage1Structure)
        console.log(`[initializeSankey] 📊 Fetching histogram for ${stage1Config.metric} on ${nodeId}`, { thresholdPath })

        // Fetch histogram using API directly (bypassing legacy fetchHistogramData)
        try {
          const histogramData = await api.getHistogramData({
            filters,
            metric: stage1Config.metric,
            nodeId,
            thresholdPath,
            bins: 50
          })
          state.setHistogramData({ [stage1Config.metric]: histogramData }, panel, nodeId)
        } catch (error) {
          console.error(`[initializeSankey] Failed to fetch histogram:`, error)
        }
      }

      state.setLoading(loadingKey, false)
      console.log('[initializeSankey] ✅ Sankey initialized successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Sankey'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[initializeSankey] ❌ Error:', error)
    }
  },

  /**
   * Activate Stage 2: Quality Assessment
   * Expands the Stage 1 segment into Monosemantic + Incoherent Splitting nodes,
   * with a Quality segment on Monosemantic.
   *
   * Uses actual tagged feature states (from pairSelectionStates) to determine
   * which features are Incoherent Splitting vs Monosemantic, NOT the threshold-based segments.
   */
  activateStage2: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure, filters } = state[panelKey]
    const { allClusterPairs, pairSelectionStates } = state
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[activateStage2] 🚀 Activating Stage 2 for ${panel}`)

    if (!sankeyStructure) {
      console.error('[activateStage2] ❌ No Sankey structure found')
      state.setError(errorKey, 'Sankey not initialized')
      return
    }

    if (sankeyStructure.currentStage >= 2) {
      console.log('[activateStage2] ⚠️  Stage 2 already active')
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Build Stage 2 using tagged feature states from pair selections
      // This ensures Incoherent Splitting/Monosemantic split is based on actual user tags, not threshold
      let stage2Structure: SankeyStructure

      if (allClusterPairs && allClusterPairs.length > 0 && pairSelectionStates.size > 0) {
        // Use tagged states for the split
        console.log('[activateStage2] Using tagged states for Incoherent Splitting/Monosemantic split')
        stage2Structure = await buildStage2FromTaggedStates(
          filters,
          sankeyStructure,
          allClusterPairs,
          pairSelectionStates
        )
      } else {
        // Fallback to threshold-based split (for initialization or when no tags exist)
        console.log('[activateStage2] Fallback: Using threshold-based split (no pair selections)')
        stage2Structure = await buildStage2(filters, sankeyStructure)
      }

      console.log(`[activateStage2] ✅ Stage 2 built:`, {
        nodes: stage2Structure.nodes.length,
        links: stage2Structure.links.length,
        currentStage: stage2Structure.currentStage
      })

      // Store the updated structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: stage2Structure
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      // Fetch histogram data for Stage 2 segment node
      const stage2Config = getStageConfig(2)
      if (stage2Config.metric) {
        const nodeId = 'stage2_segment'
        const thresholdPath = getThresholdPath(nodeId, stage2Structure)
        console.log(`[activateStage2] 📊 Fetching histogram for ${stage2Config.metric} on ${nodeId}`, { thresholdPath })

        // Fetch histogram using API directly
        try {
          const histogramData = await api.getHistogramData({
            filters,
            metric: stage2Config.metric,
            nodeId,
            thresholdPath,
            bins: 50
          })
          state.setHistogramData({ [stage2Config.metric]: histogramData }, panel, nodeId)
        } catch (error) {
          console.error(`[activateStage2] Failed to fetch histogram:`, error)
        }
      }

      state.setLoading(loadingKey, false)
      console.log('[activateStage2] ✅ Stage 2 activated successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate Stage 2'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[activateStage2] ❌ Error:', error)
    }
  },

  /**
   * Activate Stage 3: Cause Determination
   * Expands the Stage 2 segment into Need Revision + Well-Explained nodes,
   * with a Cause segment on Need Revision (4 pre-defined groups).
   */
  activateStage3: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure } = state[panelKey]
    const { featureSelectionStates } = state
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[activateStage3] 🚀 Activating Stage 3 for ${panel}`)

    if (!sankeyStructure) {
      console.error('[activateStage3] ❌ No Sankey structure found')
      state.setError(errorKey, 'Sankey not initialized')
      return
    }

    if (sankeyStructure.currentStage < 2) {
      console.error('[activateStage3] ❌ Must activate Stage 2 first')
      state.setError(errorKey, 'Stage 2 must be active before Stage 3')
      return
    }

    if (sankeyStructure.currentStage >= 3) {
      console.log('[activateStage3] ⚠️  Stage 3 already active')
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Build Stage 3 using tagged feature states OR fallback to threshold-based
      let stage3Structure: SankeyStructure

      // Get monosemantic node to know which features to consider
      const monosematicNode = sankeyStructure.nodes.find((n: { id: string }) => n.id === 'monosemantic')

      console.log('[activateStage3] DEBUG: Feature selection states:', {
        size: featureSelectionStates.size,
        monosematicFeatures: monosematicNode?.featureCount || 0
      })

      if (monosematicNode && featureSelectionStates.size > 0) {
        // Use tagged states for the Well-Explained/Need Revision split
        console.log('[activateStage3] Using tagged states for Well-Explained/Need Revision split')
        stage3Structure = buildStage3FromTaggedStates(
          sankeyStructure,
          featureSelectionStates,
          monosematicNode.featureIds
        )
      } else {
        // Fallback to threshold-based split (for initialization or when no tags exist)
        console.log('[activateStage3] Fallback: Using threshold-based split (no feature selections)')
        stage3Structure = buildStage3(sankeyStructure)
      }

      console.log(`[activateStage3] ✅ Stage 3 built:`, {
        nodes: stage3Structure.nodes.length,
        links: stage3Structure.links.length,
        currentStage: stage3Structure.currentStage
      })

      // Store the updated structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: stage3Structure
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      state.setLoading(loadingKey, false)
      console.log('[activateStage3] ✅ Stage 3 activated successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate Stage 3'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[activateStage3] ❌ Error:', error)
    }
  },

  /**
   * Activate Stage 4: Summary
   * Expands the Stage 3 segment into terminal nodes for each cause category,
   * using actual cause selection states (from CauseView tagging).
   */
  activateStage4: async (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure } = state[panelKey]
    const { causeSelectionStates } = state
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[activateStage4] 🚀 Activating Stage 4 for ${panel}`)

    if (!sankeyStructure) {
      console.error('[activateStage4] ❌ No Sankey structure found')
      state.setError(errorKey, 'Sankey not initialized')
      return
    }

    if (sankeyStructure.currentStage < 3) {
      console.error('[activateStage4] ❌ Must activate Stage 3 first')
      state.setError(errorKey, 'Stage 3 must be active before Stage 4')
      return
    }

    if (sankeyStructure.currentStage >= 4) {
      console.log('[activateStage4] ⚠️  Stage 4 already active')
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Build Stage 4 from cause selection states
      const stage4Structure = buildStage4FromTaggedStates(
        sankeyStructure,
        causeSelectionStates
      )

      console.log(`[activateStage4] ✅ Stage 4 built:`, {
        nodes: stage4Structure.nodes.length,
        links: stage4Structure.links.length,
        currentStage: stage4Structure.currentStage
      })

      // Store the updated structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: stage4Structure
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      state.setLoading(loadingKey, false)
      console.log('[activateStage4] ✅ Stage 4 activated successfully')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate Stage 4'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[activateStage4] ❌ Error:', error)
    }
  },

  /**
   * Update Stage 3 Sankey structure when user verifies well-explained features.
   * Merges verified features into well_explained_terminal node and creates
   * a link from need_revision → well_explained_terminal.
   *
   * @param verifiedFeatureIds - Feature IDs verified as well-explained
   * @param panel - Which panel to update
   */
  updateStage3WithVerifiedWellExplained: (
    verifiedFeatureIds: Set<number>,
    panel: PanelSide = PANEL_LEFT
  ) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure } = state[panelKey]

    console.log('[updateStage3WithVerifiedWellExplained] 🔄 Updating Sankey with verified features:', {
      verifiedCount: verifiedFeatureIds.size
    })

    if (!sankeyStructure || verifiedFeatureIds.size === 0) {
      console.warn('[updateStage3WithVerifiedWellExplained] ⚠️ No structure or no features to verify')
      return
    }

    // Find relevant nodes
    const wellExplainedTerminal = sankeyStructure.nodes.find((n: { id: string }) => n.id === 'well_explained_terminal')

    if (!wellExplainedTerminal) {
      console.warn('[updateStage3WithVerifiedWellExplained] ⚠️ well_explained_terminal node not found')
      return
    }

    // 1. Merge verified features into well_explained_terminal
    const mergedFeatureIds = new Set([...wellExplainedTerminal.featureIds, ...verifiedFeatureIds])

    // 2. Update stage3_segment.segments[1] to remove verified features (if exists)
    let updatedNodes = sankeyStructure.nodes.map((node: any) => {
      if (node.id === 'well_explained_terminal') {
        return {
          ...node,
          featureIds: mergedFeatureIds,
          featureCount: mergedFeatureIds.size
        }
      }
      if (node.id === 'stage3_segment' && node.type === 'segment' && node.segments) {
        // Remove verified features from segments[1] (above threshold / well-explained candidates)
        const updatedSegments = node.segments.map((seg: any, idx: number) => {
          if (idx === 1) {
            const remainingFeatures = new Set<number>()
            seg.featureIds.forEach((id: number) => {
              if (!verifiedFeatureIds.has(id)) {
                remainingFeatures.add(id)
              }
            })
            return {
              ...seg,
              featureIds: remainingFeatures,
              featureCount: remainingFeatures.size
            }
          }
          return seg
        })
        return {
          ...node,
          segments: updatedSegments
        }
      }
      return node
    })

    // 3. Add link from need_revision → well_explained_terminal if not exists
    let updatedLinks = [...sankeyStructure.links]
    const existingLink = updatedLinks.find(
      l => l.source === 'need_revision' && l.target === 'well_explained_terminal'
    )

    if (existingLink) {
      // Update existing link value
      existingLink.value += verifiedFeatureIds.size
    } else {
      // Add new link
      updatedLinks.push({
        source: 'need_revision',
        target: 'well_explained_terminal',
        value: verifiedFeatureIds.size
      })
    }

    // Store updated structure
    set((storeState: any) => ({
      [panelKey]: {
        ...storeState[panelKey],
        sankeyStructure: {
          ...sankeyStructure,
          nodes: updatedNodes,
          links: updatedLinks
        }
      }
    }))

    // Recompute D3 layout
    get().recomputeD3StructureV2(panel)

    console.log('[updateStage3WithVerifiedWellExplained] ✅ Sankey updated:', {
      wellExplainedCount: mergedFeatureIds.size,
      newLinkAdded: !existingLink
    })
  },

  /**
   * Update threshold for a specific stage without rebuilding downstream stages.
   * Only recalculates segments for the affected stage.
   *
   * @param stageNumber - Stage to update (1 or 2, not 3 since it has no threshold)
   * @param newThreshold - New threshold value
   * @param panel - Which panel to update
   */
  updateStageThreshold: async (
    stageNumber: 1 | 2,
    newThreshold: number,
    panel: PanelSide = PANEL_LEFT
  ) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure, filters } = state[panelKey]
    const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
    const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

    console.log(`[updateStageThreshold] 🎯 Updating Stage ${stageNumber} threshold to ${newThreshold}`)

    if (!sankeyStructure) {
      console.error('[updateStageThreshold] ❌ No Sankey structure found')
      state.setError(errorKey, 'Sankey not initialized')
      return
    }

    state.setLoading(loadingKey, true)
    state.clearError(errorKey)

    try {
      // Update threshold in structure (NO tableData dependency!)
      const updatedStructure = await updateThresholdInStructure(
        filters,
        sankeyStructure,
        stageNumber,
        newThreshold
      )

      console.log(`[updateStageThreshold] ✅ Threshold updated for Stage ${stageNumber}`)

      // Store the updated structure
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          sankeyStructure: updatedStructure
        }
      }))

      // Recompute D3 layout
      get().recomputeD3StructureV2(panel)

      // Re-fetch histogram data for the updated stage
      const config = getStageConfig(stageNumber)
      const nodeId = `stage${stageNumber}_segment`
      if (config.metric) {
        const thresholdPath = getThresholdPath(nodeId, updatedStructure)
        console.log(`[updateStageThreshold] 📊 Re-fetching histogram for ${config.metric} on ${nodeId}`, { thresholdPath })

        // Fetch histogram using API directly
        try {
          const histogramData = await api.getHistogramData({
            filters,
            metric: config.metric,
            nodeId,
            thresholdPath,
            bins: 50
          })
          state.setHistogramData({ [config.metric]: histogramData }, panel, nodeId)
        } catch (error) {
          console.error(`[updateStageThreshold] Failed to fetch histogram:`, error)
        }
      }

      state.setLoading(loadingKey, false)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update threshold'
      state.setError(errorKey, errorMessage)
      state.setLoading(loadingKey, false)
      console.error('[updateStageThreshold] ❌ Error:', error)
    }
  },

  /**
   * Recompute D3 structure from the simplified Sankey structure.
   * Converts the structure to D3-compatible format for rendering.
   */
  recomputeD3StructureV2: (panel: PanelSide = PANEL_LEFT) => {
    const state = get()
    const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
    const { sankeyStructure } = state[panelKey]

    console.log(`[recomputeD3StructureV2] 🔄 Recomputing D3 structure for ${panel}`)

    if (!sankeyStructure) {
      console.warn('[recomputeD3StructureV2] ⚠️  No Sankey structure available')
      return
    }

    try {
      // Convert to D3 format (assumes default dimensions, will be recalculated in component)
      const d3Layout = convertToD3Format(sankeyStructure, 800, 800)

      console.log(`[recomputeD3StructureV2] ✅ D3 structure computed:`, {
        nodes: d3Layout.nodes.length,
        links: d3Layout.links.length
      })

      // Store D3 layout
      set((state: any) => ({
        [panelKey]: {
          ...state[panelKey],
          d3Layout
        }
      }))

    } catch (error) {
      console.error('[recomputeD3StructureV2] ❌ Failed to compute D3 structure:', error)
    }
  }
})
