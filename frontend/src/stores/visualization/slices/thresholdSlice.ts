import type { StateCreator } from 'zustand'
import type { ThresholdSlice, VisualizationState } from '../types'
import {
  INITIAL_THRESHOLDS,
  INITIAL_NODE_THRESHOLDS,
  INITIAL_HIERARCHICAL_THRESHOLDS
} from '../constants'
import { logThresholdUpdate, logThresholdState, hasActiveFilters } from '../utils'
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
> = (set, get) => ({
  // ============================================================================
  // THRESHOLD STATE
  // ============================================================================

  thresholds: INITIAL_THRESHOLDS,
  nodeThresholds: INITIAL_NODE_THRESHOLDS,
  hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,

  // ============================================================================
  // BASIC THRESHOLD ACTIONS
  // ============================================================================

  setThresholds: (newThresholds) => {
    set(
      (state) => ({
        thresholds: { ...state.thresholds, ...newThresholds },
        errors: { ...state.errors, sankey: null }
      }),
      false,
      'setThresholds'
    )
  },

  resetThresholds: () => {
    set(
      (state) => ({
        thresholds: INITIAL_THRESHOLDS,
        nodeThresholds: INITIAL_NODE_THRESHOLDS,
        hierarchicalThresholds: INITIAL_HIERARCHICAL_THRESHOLDS,
        errors: { ...state.errors, sankey: null }
      }),
      false,
      'resetThresholds'
    )
  },

  // ============================================================================
  // NODE THRESHOLD ACTIONS
  // ============================================================================

  setNodeThreshold: (parentNodeId, metric, threshold) => {
    logThresholdUpdate('node', parentNodeId, metric, threshold)

    set(
      (state) => {
        const newNodeThresholds = {
          ...state.nodeThresholds,
          [parentNodeId]: {
            ...state.nodeThresholds[parentNodeId],
            [metric]: threshold
          }
        }

        logThresholdState(newNodeThresholds, 'nodeThresholds')

        // Schedule Sankey refresh if filters are active
        const isFiltersActive = hasActiveFilters(state.filters)
        if (isFiltersActive) {
          // Use a more reliable approach than setTimeout
          Promise.resolve().then(() => {
            get().fetchSankeyData(false, newNodeThresholds)
          })
        }

        return {
          nodeThresholds: newNodeThresholds,
          errors: { ...state.errors, sankey: null }
        }
      },
      false,
      'setNodeThreshold'
    )
  },

  clearNodeThreshold: (parentNodeId, metric) => {
    set(
      (state) => {
        const nodeThresholds = { ...state.nodeThresholds }

        if (metric) {
          // Clear specific metric for parent node
          if (nodeThresholds[parentNodeId]) {
            const updatedNode = { ...nodeThresholds[parentNodeId] }
            delete updatedNode[metric]

            if (Object.keys(updatedNode).length === 0) {
              delete nodeThresholds[parentNodeId]
            } else {
              nodeThresholds[parentNodeId] = updatedNode
            }
          }
        } else {
          // Clear all thresholds for parent node
          delete nodeThresholds[parentNodeId]
        }

        return {
          nodeThresholds,
          errors: { ...state.errors, sankey: null }
        }
      },
      false,
      'clearNodeThreshold'
    )
  },

  resetNodeThresholds: () => {
    set(
      (state) => ({
        nodeThresholds: INITIAL_NODE_THRESHOLDS,
        errors: { ...state.errors, sankey: null }
      }),
      false,
      'resetNodeThresholds'
    )
  },

  // ============================================================================
  // HIERARCHICAL THRESHOLD ACTIONS
  // ============================================================================

  setThresholdGroup: (groupId, metric, threshold) => {
    logThresholdUpdate('group', groupId, metric, threshold)

    set(
      (state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        // Handle semantic distance threshold groups
        if (metric === 'semdist_mean' && groupId.startsWith('split_') && !groupId.includes('_semdist_')) {
          newHierarchical.semantic_distance_groups = {
            ...newHierarchical.semantic_distance_groups,
            [groupId]: threshold
          }
        }
        // Handle score agreement threshold groups
        else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                 groupId.includes('_semdist_')) {
          // Get existing scores or use global defaults
          const existingScores = newHierarchical.score_agreement_groups?.[groupId] || {}
          const globalScore = state.thresholds.score_high

          // Set all three scores - use existing values or global defaults
          newHierarchical.score_agreement_groups = {
            ...newHierarchical.score_agreement_groups,
            [groupId]: {
              score_fuzz: existingScores.score_fuzz ?? globalScore,
              score_simulation: existingScores.score_simulation ?? globalScore,
              score_detection: existingScores.score_detection ?? globalScore,
              // Update the specific metric with the new threshold
              [metric]: threshold
            }
          }
        }

        logThresholdState(newHierarchical, 'hierarchicalThresholds')

        // Schedule Sankey refresh if filters are active
        const isFiltersActive = hasActiveFilters(state.filters)
        if (isFiltersActive) {
          Promise.resolve().then(() => {
            get().fetchSankeyData(false)
          })
        }

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      },
      false,
      'setThresholdGroup'
    )
  },

  clearThresholdGroup: (groupId, metric) => {
    set(
      (state) => {
        const newHierarchical = { ...state.hierarchicalThresholds }

        if (metric) {
          // Clear specific metric for the group
          if (metric === 'semdist_mean' && newHierarchical.semantic_distance_groups?.[groupId]) {
            const { [groupId]: removed, ...rest } = newHierarchical.semantic_distance_groups
            newHierarchical.semantic_distance_groups = rest
          } else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                     newHierarchical.score_agreement_groups?.[groupId]) {
            const groupScores = { ...newHierarchical.score_agreement_groups[groupId] }
            delete groupScores[metric]

            if (Object.keys(groupScores).length === 0) {
              const { [groupId]: removed, ...rest } = newHierarchical.score_agreement_groups
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
          if (newHierarchical.semantic_distance_groups?.[groupId]) {
            const { [groupId]: removed, ...rest } = newHierarchical.semantic_distance_groups
            newHierarchical.semantic_distance_groups = rest
          }
          if (newHierarchical.score_agreement_groups?.[groupId]) {
            const { [groupId]: removed, ...rest } = newHierarchical.score_agreement_groups
            newHierarchical.score_agreement_groups = rest
          }
        }

        return {
          hierarchicalThresholds: newHierarchical,
          errors: { ...state.errors, sankey: null }
        }
      },
      false,
      'clearThresholdGroup'
    )
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
})