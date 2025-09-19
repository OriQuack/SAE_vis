/**
 * API request and response type definitions
 */

import { Filters, Thresholds, NodeThresholds, HierarchicalThresholds } from './thresholds'
import { SankeyData } from './sankey'
import { HistogramData } from './histogram'

export interface SankeyRequest {
  filters: Filters
  thresholds: Thresholds
  nodeThresholds?: NodeThresholds
  hierarchicalThresholds?: HierarchicalThresholds
}

export interface HistogramRequest {
  filters: Filters
  metric: string
  nodeId?: string
  bins?: number
}

export interface ComparisonRequest {
  filters1: Filters
  filters2: Filters
  thresholds: Thresholds
}

export interface ComparisonData {
  sankey1: SankeyData
  sankey2: SankeyData
  comparison_metrics: Record<string, number>
}

export interface FeatureDetails {
  feature_id: string
  explanations: Record<string, string>
  scores: Record<string, number>
  metadata: Record<string, unknown>
}

export interface ApiError {
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  }
}