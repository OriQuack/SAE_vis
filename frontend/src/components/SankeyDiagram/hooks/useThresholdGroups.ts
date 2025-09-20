import { useMemo } from 'react'
import { getMetricsForNode } from '../utils/nodeMetrics'
import type { SankeyData } from '../../../services/types'

interface ThresholdGroupInfo {
  hasGroup: boolean
  groupSize: number
  primaryMetric?: string
}

interface UseThresholdGroupsProps {
  data: SankeyData | null
  layout: any | null
  getNodesInSameThresholdGroup: (nodeId: string, metric: string) => string[]
}

interface UseThresholdGroupsReturn {
  allNodeThresholdGroups: Map<string, ThresholdGroupInfo>
}

export const useThresholdGroups = ({
  data,
  layout,
  getNodesInSameThresholdGroup
}: UseThresholdGroupsProps): UseThresholdGroupsReturn => {
  // Calculate threshold group information for all nodes
  const allNodeThresholdGroups = useMemo(() => {
    if (!data || !layout) return new Map<string, ThresholdGroupInfo>()

    const nodeGroupMap = new Map<string, ThresholdGroupInfo>()

    for (const node of layout.nodes) {
      const metrics = getMetricsForNode(node)
      if (!metrics) {
        nodeGroupMap.set(node.id, { hasGroup: false, groupSize: 1 })
        continue
      }

      // Check each metric to see if this node belongs to a threshold group
      let found = false
      for (const metric of metrics) {
        const groupNodes = getNodesInSameThresholdGroup(node.id, metric)
        if (groupNodes.length > 1) {
          nodeGroupMap.set(node.id, {
            hasGroup: true,
            groupSize: groupNodes.length,
            primaryMetric: metric
          })
          found = true
          break
        }
      }

      if (!found) {
        nodeGroupMap.set(node.id, { hasGroup: false, groupSize: 1 })
      }
    }

    return nodeGroupMap
  }, [data, layout, getNodesInSameThresholdGroup])

  return {
    allNodeThresholdGroups
  }
}