import { useMemo, useCallback } from 'react'
import { useVisualizationStore } from '../../../../stores/store'
import { getThresholdGroupId } from '../../../../services/types'
import type { MetricType, HistogramData } from '../../../../services/types'

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
  const hierarchicalThresholds = useVisualizationStore((state) => state.hierarchicalThresholds)
  const getEffectiveThresholdForNode = useVisualizationStore((state) => state.getEffectiveThresholdForNode)
  const { setThresholdGroup, setThresholds, getNodesInSameThresholdGroup } = useVisualizationStore()

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
    console.log('📊 [useThresholdManagement] Calculating currentThresholds')

    const thresholds: Record<string, number | undefined> = {}

    if (popoverData?.metrics && popoverData?.nodeId) {
      popoverData.metrics.forEach(metric => {
        const effectiveValue = getEffectiveThresholdForNode(popoverData.nodeId, metric as MetricType)
        thresholds[metric] = effectiveValue
        console.log('📈 [useThresholdManagement] Current threshold:', { metric, effectiveValue })
      })
    }

    console.log('📋 [useThresholdManagement] Final currentThresholds:', thresholds)
    return thresholds
  }, [popoverData?.metrics, popoverData?.nodeId, getEffectiveThresholdForNode, hierarchicalThresholds])

  const handleMultiThresholdChange = useCallback((metric: string, newThreshold: number) => {
    console.log('🔄 [MultiThreshold] Change detected:', { metric, newThreshold })

    if (!histogramData || !popoverData) {
      console.log('❌ [MultiThreshold] Missing data:', { histogramData: !!histogramData, popoverData: !!popoverData })
      return
    }

    const metricData = histogramData[metric as MetricType]
    if (!metricData) {
      console.log('❌ [MultiThreshold] No metric data for:', metric)
      return
    }

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    // Keep original metric name - setThresholdGroup will handle score_high mapping internally
    console.log('🔀 [MultiThreshold] Keeping original metric:', { metric, clampedThreshold })

    const groupInfo = thresholdGroupInfo.groups[metric as MetricType] || null
    console.log('📊 [MultiThreshold] Group info:', { groupInfo })

    if (groupInfo?.groupId) {
      console.log('🎯 [MultiThreshold] Using group threshold')
      if (groupInfo.groupId === 'feature_splitting_global') {
        console.log('🌍 [MultiThreshold] Setting global threshold:', { [metric]: clampedThreshold })
        setThresholds({ [metric]: clampedThreshold })
      } else {
        console.log('👥 [MultiThreshold] Setting group threshold:', { groupId: groupInfo.groupId, metric, threshold: clampedThreshold })
        setThresholdGroup(groupInfo.groupId, metric as MetricType, clampedThreshold)
      }
    } else {
      console.log('⚡ [MultiThreshold] Setting direct threshold (fallback):', { [metric]: clampedThreshold })
      setThresholds({ [metric]: clampedThreshold })
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setThresholdGroup, setThresholds])

  const handleSingleThresholdChange = useCallback((newThreshold: number) => {
    if (!histogramData || !popoverData || !popoverData.metrics?.[0]) return

    const singleMetric = popoverData.metrics[0]
    const metricData = histogramData[singleMetric]
    if (!metricData) return

    const clampedThreshold = Math.max(
      metricData.statistics.min,
      Math.min(metricData.statistics.max, newThreshold)
    )

    // Keep original metric name - setThresholdGroup will handle score_high mapping internally
    const groupInfo = thresholdGroupInfo.groups[singleMetric as MetricType] || null
    if (groupInfo?.groupId) {
      if (groupInfo.groupId === 'feature_splitting_global') {
        setThresholds({ [singleMetric]: clampedThreshold })
      } else {
        setThresholdGroup(groupInfo.groupId, singleMetric as MetricType, clampedThreshold)
      }
    } else {
      // Fallback: directly set the threshold if no group info
      setThresholds({ [singleMetric]: clampedThreshold })
    }
  }, [histogramData, popoverData, thresholdGroupInfo, setThresholdGroup, setThresholds])

  const getEffectiveThreshold = useCallback((metric: string): number => {
    // Check if we have a direct threshold for this metric
    if (currentThresholds[metric] !== undefined) {
      return currentThresholds[metric]!
    }

    // Map score_fuzz to score_high for threshold lookup
    const thresholdMetric = metric === 'score_fuzz' ? 'score_high' : metric
    if (currentThresholds[thresholdMetric] !== undefined) {
      return currentThresholds[thresholdMetric]!
    }

    // Fallback to histogram mean
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