// Histogram-specific types and interfaces

import { scaleLinear } from 'd3-scale'
import type { HistogramData, LayoutMargin, ThresholdLineData } from '../shared'

// Individual histogram bin data
export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

// Basic histogram layout
export interface HistogramLayout {
  bins: HistogramBin[]
  xScale: ReturnType<typeof scaleLinear>
  yScale: ReturnType<typeof scaleLinear>
  width: number
  height: number
  margin: LayoutMargin
}

// Individual histogram within a multi-histogram layout
export interface IndividualHistogramLayout extends HistogramLayout {
  metric: string
  yOffset: number  // Y offset for positioning in multi-histogram mode
  chartTitle: string
}

// Multi-histogram layout container
export interface MultiHistogramLayout {
  charts: IndividualHistogramLayout[]
  totalWidth: number
  totalHeight: number
  spacing: number
}

// Memoization cache entries
export interface HistogramLayoutCacheEntry {
  layout: HistogramLayout
  key: string
  timestamp: number
}

export interface MultiHistogramLayoutCacheEntry {
  layout: MultiHistogramLayout
  key: string
  timestamp: number
}

// Re-export commonly used types
export type { HistogramData, ThresholdLineData }