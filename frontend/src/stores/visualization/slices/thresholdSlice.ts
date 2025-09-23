import type { StateCreator } from 'zustand'
import type { ThresholdSlice, VisualizationState } from '../types'
import {
  INITIAL_THRESHOLDS,
  INITIAL_HIERARCHICAL_THRESHOLDS,
  API_CONFIG
} from '../constants'
import { logThresholdUpdate, logThresholdState, hasActiveFilters, DebounceManager } from '../utils'
import {
  getThresholdGroupId,
  getNodesInThresholdGroup,
  getEffectiveThreshold
} from '../../../services/types'

export const createThresholdSlice: StateCreator<
  VisualizationState,
  [],
  [],
  ThresholdSlice
> = (set, get) => {
  // Dedicated debounce manager for threshold-related operations
  const debounceManager = new DebounceManager()

  const debouncedSankeyUpdate = () => {
    debounceManager.debounce(
      'sankey-update',
      () => {
        get().fetchSankeyData(false)
      },
      API_CONFIG.DEBOUNCE_DELAY
    )
  }

  return {
    // ============================================================================
    // THRESHOLD STATE
    // ============================================================================

    thresholds: INITIAL_THRESHOLDS,
    hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,

    // ============================================================================
    // BASIC THRESHOLD ACTIONS
    // ============================================================================

    setThresholds: (newThresholds) => {
      set((state) => {
        // Schedule debounced Sankey refresh if filters are active
        const isFiltersActive = hasActiveFilters(state.filters)
        if (isFiltersActive) {
          debouncedSankeyUpdate()
        }

        // Update both legacy thresholds and hierarchical thresholds to keep them in sync
        const updatedThresholds = { ...state.thresholds, ...newThresholds }
        const updatedHierarchicalThresholds = {
          ...state.hierarchicalThresholds,
          global_thresholds: updatedThresholds
        }

        return {
          thresholds: updatedThresholds,
          hierarchicalThresholds: updatedHierarchicalThresholds,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    resetThresholds: () => {
      set((state) => ({
        thresholds: INITIAL_THRESHOLDS,
        hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,
        errors: { ...state.errors, sankey: null }
      }))
    },

    // ============================================================================
    // NODE THRESHOLD ACTIONS
    // ============================================================================

    setNodeThreshold: (nodeId, metric, threshold) => {
      // Convert to group-based logic internally
      const groupId = `node_${nodeId}`
      logThresholdUpdate('node', groupId, metric, threshold)

      set((state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        // Ensure individual_node_groups exists
        if (!newHierarchical.individual_node_groups) {
          newHierarchical.individual_node_groups = {}
        }

        // Update the individual node group
        newHierarchical.individual_node_groups = {
          ...newHierarchical.individual_node_groups,
          [groupId]: {
            ...newHierarchical.individual_node_groups[groupId],
            [metric]: threshold
          }
        }

        logThresholdState(newHierarchical, 'hierarchicalThresholds')

        // Schedule debounced Sankey refresh if filters are active
        const isFiltersActive = hasActiveFilters(state.filters)
        if (isFiltersActive) {
          debouncedSankeyUpdate()
        }

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    clearNodeThreshold: (nodeId, metric) => {
      // Convert to group-based logic internally
      const groupId = `node_${nodeId}`

      set((state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        if (!newHierarchical.individual_node_groups) {
          return state // Nothing to clear
        }

        const individualGroups = { ...newHierarchical.individual_node_groups }

        if (metric) {
          // Clear specific metric for individual node
          if (individualGroups[groupId]) {
            const updatedGroup = { ...individualGroups[groupId] }
            delete updatedGroup[metric]

            if (Object.keys(updatedGroup).length === 0) {
              delete individualGroups[groupId]
            } else {
              individualGroups[groupId] = updatedGroup
            }
          }
        } else {
          // Clear all thresholds for individual node
          delete individualGroups[groupId]
        }

        newHierarchical.individual_node_groups = individualGroups

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    resetNodeThresholds: () => {
      set((state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }
        // Clear all individual node groups
        newHierarchical.individual_node_groups = {}

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    // ============================================================================
    // HIERARCHICAL THRESHOLD ACTIONS
    // ============================================================================

    setThresholdGroup: (groupId, metric, threshold) => {
      logThresholdUpdate('group', groupId, metric, threshold)

      set((state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        // Handle feature splitting threshold groups
        if (metric === 'feature_splitting') {
          newHierarchical.feature_splitting_groups = {
            ...newHierarchical.feature_splitting_groups,
            [groupId]: threshold
          }
        }
        // Handle semantic distance threshold groups
        else if (metric === 'semdist_mean' && groupId.startsWith('split_') && !groupId.includes('_semdist_')) {
          newHierarchical.semantic_distance_groups = {
            ...newHierarchical.semantic_distance_groups,
            [groupId]: threshold
          }
        }
        // Handle score agreement threshold groups
        else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                 groupId.includes('_semdist_')) {
          // Get existing scores - only update the specific metric being changed
          const existingScores = newHierarchical.score_agreement_groups?.[groupId] || {}

          // Only update the specific metric that's being changed
          newHierarchical.score_agreement_groups = {
            ...newHierarchical.score_agreement_groups,
            [groupId]: {
              ...existingScores,
              [metric]: threshold
            }
          }
        }

        logThresholdState(newHierarchical, 'hierarchicalThresholds')

        // Schedule debounced Sankey refresh if filters are active
        const isFiltersActive = hasActiveFilters(state.filters)
        if (isFiltersActive) {
          debouncedSankeyUpdate()
        }

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    clearThresholdGroup: (groupId, metric) => {
      set((state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        if (metric) {
          // Clear specific metric for the group
          if (metric === 'feature_splitting' && newHierarchical.feature_splitting_groups?.[groupId]) {
            const { [groupId]: _removed, ...rest } = newHierarchical.feature_splitting_groups
            newHierarchical.feature_splitting_groups = rest
          } else if (metric === 'semdist_mean' && newHierarchical.semantic_distance_groups?.[groupId]) {
            const { [groupId]: _removed, ...rest } = newHierarchical.semantic_distance_groups
            newHierarchical.semantic_distance_groups = rest
          } else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                     newHierarchical.score_agreement_groups?.[groupId]) {
            const groupScores = { ...newHierarchical.score_agreement_groups[groupId] }
            delete groupScores[metric]

            if (Object.keys(groupScores).length === 0) {
              const { [groupId]: _removed, ...rest } = newHierarchical.score_agreement_groups
              newHierarchical.score_agreement_groups = rest
            } else {
              newHierarchical.score_agreement_groups = {
                ...newHierarchical.score_agreement_groups,
                [groupId]: groupScores
              }
            }
          }
        } else {
          // Clear all thresholds for the group
          if (newHierarchical.feature_splitting_groups?.[groupId]) {
            const { [groupId]: _removed, ...rest } = newHierarchical.feature_splitting_groups
            newHierarchical.feature_splitting_groups = rest
          }
          if (newHierarchical.semantic_distance_groups?.[groupId]) {
            const { [groupId]: _removed, ...rest } = newHierarchical.semantic_distance_groups
            newHierarchical.semantic_distance_groups = rest
          }
          if (newHierarchical.score_agreement_groups?.[groupId]) {
            const { [groupId]: _removed, ...rest } = newHierarchical.score_agreement_groups
            newHierarchical.score_agreement_groups = rest
          }
        }

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      })
    },

    // ============================================================================
    // THRESHOLD GETTERS
    // ============================================================================

    getEffectiveThresholdForNode: (nodeId, metric) => {
      const { hierarchicalThresholds } = get()
      return getEffectiveThreshold(nodeId, metric, hierarchicalThresholds)
    },

    getNodesInSameThresholdGroup: (nodeId, metric) => {
      const { sankeyData } = get()
      if (!sankeyData) return []

      const groupId = getThresholdGroupId(nodeId, metric)
      if (!groupId) return [nodeId] // Node doesn't belong to a group, only itself

      return getNodesInThresholdGroup(groupId, sankeyData.nodes, metric)
    }
  }
}