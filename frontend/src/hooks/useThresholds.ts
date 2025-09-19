/**
 * Custom hook for threshold management
 * Encapsulates all threshold-related logic
 */

import { useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import { MetricType, HierarchicalThresholds, ThresholdGroupInfo } from '../types'
import {
  getThresholdGroupId,
  getSplittingParentId,
  getSemanticDistanceParentId,
  getEffectiveThreshold
} from '../utils/threshold-helpers'

export function useThresholds() {
  const store = useVisualizationStore()
  const {
    thresholds,
    hierarchicalThresholds,
    nodeThresholds,
    setThreshold,
    setThresholdGroup,
    setNodeThreshold,
    clearNodeThreshold,
    clearThresholdGroup,
    getNodesInSameThresholdGroup,
    getEffectiveThresholdForNode
  } = store

  const updateThreshold = useCallback((
    nodeId: string,
    metric: MetricType,
    value: number,
    isGrouped: boolean = false,
    groupId?: string
  ) => {
    const clampedValue = Math.max(0, Math.min(1, value))

    if (isGrouped && groupId) {
      setThresholdGroup(groupId, metric, clampedValue)
    } else {
      setNodeThreshold(nodeId, metric, clampedValue)
    }
  }, [setThresholdGroup, setNodeThreshold])

  const getThresholdInfo = useCallback((
    nodeId: string,
    metrics: MetricType[]
  ): ThresholdGroupInfo => {
    const groups: Record<MetricType, any> = {} as Record<MetricType, any>
    let hasAnyGroups = false

    for (const metric of metrics) {
      const groupId = getThresholdGroupId(nodeId, metric)
      const affectedNodes = getNodesInSameThresholdGroup(nodeId, metric)
      const isGrouped = groupId !== null && affectedNodes.length > 1

      groups[metric] = {
        groupId,
        affectedNodes,
        isGrouped
      }

      if (isGrouped) {
        hasAnyGroups = true
      }
    }

    return { groups, hasAnyGroups }
  }, [getNodesInSameThresholdGroup])

  const getNodeThreshold = useCallback((
    nodeId: string,
    metric: MetricType
  ): number => {
    return getEffectiveThresholdForNode(nodeId, metric)
  }, [getEffectiveThresholdForNode])

  const resetThresholds = useCallback(() => {
    // Reset to default thresholds
    setThreshold('semdist_mean', 0.15)
    setThreshold('score_high', 0.8)

    // Clear all node and group thresholds
    Object.keys(nodeThresholds).forEach(nodeId => {
      clearNodeThreshold(nodeId)
    })

    if (hierarchicalThresholds.semantic_distance_groups) {
      Object.keys(hierarchicalThresholds.semantic_distance_groups).forEach(groupId => {
        clearThresholdGroup(groupId, 'semdist_mean')
      })
    }

    if (hierarchicalThresholds.score_agreement_groups) {
      Object.keys(hierarchicalThresholds.score_agreement_groups).forEach(groupId => {
        clearThresholdGroup(groupId)
      })
    }
  }, [
    setThreshold,
    nodeThresholds,
    hierarchicalThresholds,
    clearNodeThreshold,
    clearThresholdGroup
  ])

  return {
    thresholds,
    hierarchicalThresholds,
    nodeThresholds,
    updateThreshold,
    getThresholdInfo,
    getNodeThreshold,
    resetThresholds
  }
}

export function useNodeThreshold(nodeId: string, metric: MetricType): number | undefined {
  return useVisualizationStore(state => {
    // Check node-specific thresholds first
    if (state.nodeThresholds[nodeId]?.[metric] !== undefined) {
      return state.nodeThresholds[nodeId][metric]
    }

    // Then check hierarchical thresholds
    return getEffectiveThreshold(nodeId, metric, state.hierarchicalThresholds)
  })
}