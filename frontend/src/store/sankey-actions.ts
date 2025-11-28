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
  updateStageThreshold as updateThresholdInStructure
} from '../lib/sankey-builder'
import { convertToD3Format } from '../lib/sankey-utils'
import { getStageConfig } from '../lib/sankey-stages'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'
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
    if (!stage1Segment.threshold || !stage2Segment.threshold) return undefined

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
   * Expands the Stage 1 segment into Monosemantic + Fragmented nodes,
   * with a Quality segment on Monosemantic.
   *
   * Uses actual tagged feature states (from pairSelectionStates) to determine
   * which features are Fragmented vs Monosemantic, NOT the threshold-based segments.
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
      // This ensures Fragmented/Monosemantic split is based on actual user tags, not threshold
      let stage2Structure: SankeyStructure

      if (allClusterPairs && allClusterPairs.length > 0 && pairSelectionStates.size > 0) {
        // Use tagged states for the split
        console.log('[activateStage2] Using tagged states for Fragmented/Monosemantic split')
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
      // Build Stage 3 from current structure
      const stage3Structure = buildStage3(sankeyStructure)

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
