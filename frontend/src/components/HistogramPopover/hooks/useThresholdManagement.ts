import { useMemo, useCallback } from 'react'
import { useVisualizationStore } from '../../../stores/visualizationStore'
import { getThresholdGroupId } from '../../../services/types'
import type { MetricType, HistogramData } from '../../../services/types'

interface UseThresholdManagementProps {
  popoverData: {
    nodeId: string
    parentNodeId?: string
    metrics: string[]
  } | null
  histogramData: Record<string, HistogramData> | null
}

interface ThresholdGroupInfo {
  groups: Record<MetricType, {
    groupId: string | null
    affectedNodes: string[]
    isGrouped: boolean
  }>
  hasAnyGroups: boolean
}

interface UseThresholdManagementReturn {
  currentThresholds: Record<string, number | undefined>
  thresholdGroupInfo: ThresholdGroupInfo
  handleSingleThresholdChange: (newThreshold: number) => void
  handleMultiThresholdChange: (metric: string, newThreshold: number) => void
  getEffectiveThreshold: (metric: string) => number
}

export const useThresholdManagement = ({
  popoverData,
  histogramData
}: UseThresholdManagementProps): UseThresholdManagementReturn => {
  const allNodeThresholds = useVisualizationStore((state) => state.nodeThresholds)
  const hierarchicalThresholds = useVisualizationStore((state) => state.hierarchicalThresholds)
  const getEffectiveThresholdForNode = useVisualizationStore((state) => state.getEffectiveThresholdForNode)
  const { setNodeThreshold, setThresholdGroup, setThresholds, getNodesInSameThresholdGroup } = useVisualizationStore()

  const thresholdNodeId = popoverData?.parentNodeId || popoverData?.nodeId || ''

  const thresholdGroupInfo = useMemo((): ThresholdGroupInfo => {
    if (!popoverData?.nodeId || !popoverData?.metrics) {
      return { groups: {} as any, hasAnyGroups: false }
    }

    const groups: Record<MetricType, {
      groupId: string | null
      affectedNodes: string[]
      isGrouped: boolean
    }> = {} as any

    let hasAnyGroups = false

    for (const metric of popoverData.metrics) {
      const groupId = getThresholdGroupId(popoverData.nodeId, metric)
      const affectedNodes = getNodesInSameThresholdGroup(popoverData.nodeId, metric)
      const isGrouped = groupId !== null && affectedNodes.length > 1

      groups[metric as MetricType] = {
        groupId,
        affectedNodes,
        isGrouped
      }

      if (isGrouped) {
        hasAnyGroups = true
      }
    }

    return { groups, hasAnyGroups }
  }, [popoverData?.nodeId, popoverData?.metrics, getNodesInSameThresholdGroup])

  const currentThresholds = useMemo(() => {
    const thresholds: Record<string, number | undefined> = {}

    if (popoverData?.metrics && popoverData?.nodeId) {
      popoverData.metrics.forEach(metric => {
        const effectiveValue = getEffectiveThresholdForNode(popoverData.nodeId, metric as MetricType)

        if (effectiveValue !== undefined && effectiveValue !== null) {
          thresholds[metric] = effectiveValue
        } else {
          thresholds[metric] = allNodeThresholds[thresholdNodeId]?.[metric]
        }
      })
    }

    return thresholds
  }, [popoverData?.metrics, popoverData?.nodeId, allNodeThresholds, thresholdNodeId, getEffectiveThresholdForNode, hierarchicalThresholds])

  const handleMultiThresholdChange = useCallback((metric: string, newThreshold: number) => {
    if (!histogramData || !popoverData) return

    const metricData = histogramData[metric as MetricType]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    const groupInfo = thresholdGroupInfo.groups[metric as MetricType] || null
    if (groupInfo?.isGrouped && groupInfo.groupId) {
      if (groupInfo.groupId === 'feature_splitting_global') {
        console.log(`🎯 Setting global threshold: ${metric} = ${clampedThreshold}`)
        setThresholds({ [metric]: clampedThreshold })
      } else {
        console.log(`🎯 Setting threshold group: ${groupInfo.groupId}.${metric} = ${clampedThreshold} (affects ${groupInfo.affectedNodes.length} nodes)`)
        setThresholdGroup(groupInfo.groupId, metric as MetricType, clampedThreshold)
      }
    } else {
      console.log(`🎯 Setting individual node threshold: ${thresholdNodeId}.${metric} = ${clampedThreshold}`)
      setNodeThreshold(thresholdNodeId, metric as MetricType, clampedThreshold)
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setNodeThreshold, setThresholdGroup, setThresholds, thresholdNodeId])

  const handleSingleThresholdChange = useCallback((newThreshold: number) => {
    if (!histogramData || !popoverData || !popoverData.metrics?.[0]) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    const groupInfo = thresholdGroupInfo.groups[singleMetric as MetricType] || null
    if (groupInfo?.isGrouped && groupInfo.groupId) {
      if (groupInfo.groupId === 'feature_splitting_global') {
        console.log(`🎯 Setting global threshold: ${singleMetric} = ${clampedThreshold}`)
        setThresholds({ [singleMetric]: clampedThreshold })
      } else {
        console.log(`🎯 Setting threshold group: ${groupInfo.groupId}.${singleMetric} = ${clampedThreshold} (affects ${groupInfo.affectedNodes.length} nodes)`)
        setThresholdGroup(groupInfo.groupId, singleMetric as MetricType, clampedThreshold)
      }
    } else {
      console.log(`🎯 Setting individual node threshold: ${thresholdNodeId}.${singleMetric} = ${clampedThreshold}`)
      setNodeThreshold(thresholdNodeId, singleMetric as MetricType, clampedThreshold)
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setNodeThreshold, setThresholdGroup, setThresholds, thresholdNodeId])

  const getEffectiveThreshold = useCallback((metric: string): number => {
    if (currentThresholds[metric] !== undefined) {
      return currentThresholds[metric]!
    }
    if (histogramData && histogramData[metric]) {
      return histogramData[metric].statistics.mean
    }
    return 0.5
  }, [currentThresholds, histogramData])

  return {
    currentThresholds,
    thresholdGroupInfo,
    handleSingleThresholdChange,
    handleMultiThresholdChange,
    getEffectiveThreshold
  }
}