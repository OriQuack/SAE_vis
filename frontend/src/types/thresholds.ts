/**
 * Threshold-related type definitions
 */

import { MetricType } from './common'

export interface Thresholds {
  semdist_mean: number
  score_high: number
}

export interface HierarchicalThresholds {
  global_thresholds: Thresholds
  semantic_distance_groups?: Record<string, number>
  score_agreement_groups?: Record<string, Record<string, number>>
}

export interface NodeThresholds {
  [nodeId: string]: {
    [metric in MetricType]?: number
  }
}

export interface ThresholdGroup {
  groupId: string | null
  affectedNodes: string[]
  isGrouped: boolean
}

export interface ThresholdGroupInfo {
  groups: Record<MetricType, ThresholdGroup>
  hasAnyGroups: boolean
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  semdist_mean: 0.15,
  score_high: 0.8
}

export const DEFAULT_HIERARCHICAL_THRESHOLDS: HierarchicalThresholds = {
  global_thresholds: DEFAULT_THRESHOLDS
}