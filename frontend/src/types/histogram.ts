/**
 * Histogram-related type definitions
 */

import { Statistics, MetricType } from './common'

export interface HistogramBin {
  start: number
  end: number
  count: number
}

export interface HistogramInfo {
  bins: HistogramBin[]
  bin_width: number
  total_count: number
}

export interface HistogramData {
  [metric: string]: {
    histogram: HistogramInfo
    statistics: Statistics
    total_features: number
  }
}

export interface HistogramRequest {
  filters: Record<string, string[]>
  metric: MetricType
  nodeId?: string
  bins?: number
}