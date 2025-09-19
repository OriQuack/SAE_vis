/**
 * Threshold state management slice
 */

import { StateCreator } from 'zustand'
import {
  Thresholds,
  HierarchicalThresholds,
  NodeThresholds,
  MetricType,
  DEFAULT_THRESHOLDS,
  DEFAULT_HIERARCHICAL_THRESHOLDS
} from '../../types'
import { getEffectiveThreshold } from '../../utils/threshold-helpers'

export interface ThresholdSlice {
  // State
  thresholds: Thresholds
  hierarchicalThresholds: HierarchicalThresholds
  nodeThresholds: NodeThresholds

  // Actions
  setThreshold: (key: keyof Thresholds, value: number) => void
  setThresholds: (thresholds: Partial<Thresholds>) => void
  setNodeThreshold: (nodeId: string, metric: MetricType, value: number) => void
  clearNodeThreshold: (nodeId: string, metric?: MetricType) => void
  setThresholdGroup: (groupId: string, metric: MetricType, value: number) => void
  clearThresholdGroup: (groupId: string, metric?: MetricType) => void
  resetThresholds: () => void
  getEffectiveThresholdForNode: (nodeId: string, metric: MetricType) => number
}

export const createThresholdSlice: StateCreator<ThresholdSlice> = (set, get) => ({
  // Initial state
  thresholds: DEFAULT_THRESHOLDS,
  hierarchicalThresholds: DEFAULT_HIERARCHICAL_THRESHOLDS,
  nodeThresholds: {},

  // Actions
  setThreshold: (key, value) => {
    set(state => ({
      thresholds: {
        ...state.thresholds,
        [key]: value
      }
    }))
  },

  setThresholds: (newThresholds) => {
    set(state => ({
      thresholds: {
        ...state.thresholds,
        ...newThresholds
      }
    }))
  },

  setNodeThreshold: (nodeId, metric, value) => {
    set(state => ({
      nodeThresholds: {
        ...state.nodeThresholds,
        [nodeId]: {
          ...state.nodeThresholds[nodeId],
          [metric]: value
        }
      }
    }))
  },

  clearNodeThreshold: (nodeId, metric) => {
    set(state => {
      const nodeThresholds = { ...state.nodeThresholds }

      if (metric && nodeThresholds[nodeId]) {
        const { [metric]: removed, ...rest } = nodeThresholds[nodeId]
        if (Object.keys(rest).length > 0) {
          nodeThresholds[nodeId] = rest
        } else {
          delete nodeThresholds[nodeId]
        }
      } else {
        delete nodeThresholds[nodeId]
      }

      return { nodeThresholds }
    })
  },

  setThresholdGroup: (groupId, metric, value) => {
    set(state => {
      const newHierarchical = { ...state.hierarchicalThresholds }

      // Handle semantic distance threshold groups
      if (metric === 'semdist_mean' && groupId.startsWith('split_') && !groupId.includes('_semdist_')) {
        newHierarchical.semantic_distance_groups = {
          ...newHierarchical.semantic_distance_groups,
          [groupId]: value
        }
      }
      // Handle score agreement threshold groups
      else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
               groupId.includes('_semdist_')) {
        const existingScores = newHierarchical.score_agreement_groups?.[groupId] || {}
        const globalScore = state.thresholds.score_high

        newHierarchical.score_agreement_groups = {
          ...newHierarchical.score_agreement_groups,
          [groupId]: {
            score_fuzz: existingScores.score_fuzz ?? globalScore,
            score_simulation: existingScores.score_simulation ?? globalScore,
            score_detection: existingScores.score_detection ?? globalScore,
            [metric]: value
          }
        }
      }

      return { hierarchicalThresholds: newHierarchical }
    })
  },

  clearThresholdGroup: (groupId, metric) => {
    set(state => {
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

      return { hierarchicalThresholds: newHierarchical }
    })
  },

  resetThresholds: () => {
    set({
      thresholds: DEFAULT_THRESHOLDS,
      hierarchicalThresholds: DEFAULT_HIERARCHICAL_THRESHOLDS,
      nodeThresholds: {}
    })
  },

  getEffectiveThresholdForNode: (nodeId, metric) => {
    const state = get()

    // Check node-specific thresholds first
    if (state.nodeThresholds[nodeId]?.[metric] !== undefined) {
      return state.nodeThresholds[nodeId][metric]!
    }

    // Then use hierarchical thresholds
    return getEffectiveThreshold(nodeId, metric, state.hierarchicalThresholds)
  }
})