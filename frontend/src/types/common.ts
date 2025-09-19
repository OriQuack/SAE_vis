/**
 * Common type definitions used across the application
 */

export type MetricType =
  | 'semdist_mean'
  | 'score_fuzz'
  | 'score_simulation'
  | 'score_detection'

export type NodeType =
  | 'root'
  | 'splitting'
  | 'semantic_distance'
  | 'score_agreement'

export interface Statistics {
  min: number
  max: number
  mean: number
  std: number
  q1: number
  median: number
  q3: number
}

export interface ErrorState {
  message: string
  code?: string
  details?: Record<string, unknown>
}

export interface LoadingState {
  filters: boolean
  histogram: boolean
  sankey: boolean
}

export interface Metadata {
  filters_applied: Record<string, string[]>
  thresholds_used: Record<string, number>
  total_features: number
  timestamp: string
}