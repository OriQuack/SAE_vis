// Shared types and interfaces for d3 utilities

import type { HistogramData, SankeyData, NodeCategory } from '../../../services/types'

// Common layout margin interface
export interface LayoutMargin {
  top: number
  right: number
  bottom: number
  left: number
}

// Common animation configuration
export interface AnimationConfig {
  duration: number
  easing: string
}

// Common tooltip data structure
export interface TooltipData {
  x: number
  y: number
  title: string
  content: Array<{ label: string; value: string | number }>
}

// Threshold line data for visualizations
export interface ThresholdLineData {
  x: number
  y1: number
  y2: number
  value: number
}

// Re-export types that are commonly used across modules
export type { HistogramData, SankeyData, NodeCategory }