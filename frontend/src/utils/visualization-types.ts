// Consolidated visualization types
// All D3 and visualization-related TypeScript types in one place

import { scaleLinear } from 'd3-scale'

// Re-export types from services for convenience
export type {
  HistogramData,
  SankeyData,
  SankeyNode
} from '../services/types'

// NodeCategory type definition (consolidated from services/types)
export type NodeCategory = 'root' | 'feature_splitting' | 'semantic_distance' | 'score_agreement'

// =============================================================================
// COMMON / SHARED TYPES
// =============================================================================

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

// =============================================================================
// HISTOGRAM TYPES
// =============================================================================

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

// Histogram memoization cache entries
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

// =============================================================================
// SANKEY TYPES
// =============================================================================

// D3-enhanced sankey node (after d3-sankey processing)
export interface D3SankeyNode {
  id: string
  name: string
  category: NodeCategory
  stage: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
  sourceLinks?: D3SankeyLink[]
  targetLinks?: D3SankeyLink[]
}

// Sankey link from API (before d3-sankey processing)
export interface SankeyLink {
  source: string  // Node ID
  target: string  // Node ID
  value: number
}

// D3-enhanced sankey link (after d3-sankey processing)
export interface D3SankeyLink {
  source: D3SankeyNode | number
  target: D3SankeyNode | number
  value: number
  y0?: number
  y1?: number
  width?: number
}

// Complete sankey layout
export interface SankeyLayout {
  nodes: D3SankeyNode[]
  links: D3SankeyLink[]
  width: number
  height: number
  margin: LayoutMargin
}

// Node sorting utilities
export interface NodeSortConfig {
  stage4Enabled: boolean  // Whether to apply special stage 4 sorting
  preserveOriginalOrder: boolean  // Whether to preserve original order for other stages
}

// Sankey memoization cache entries
export interface SankeyLayoutCacheEntry {
  layout: SankeyLayout
  key: string
  timestamp: number
}

export interface NodeSortingCacheEntry {
  sortedNodes: any[]  // Using any to avoid circular imports for now
  key: string
  timestamp: number
}

// =============================================================================
// SLIDER TYPES
// =============================================================================

// Slider state and configuration
export interface SliderConfig {
  min: number
  max: number
  step: number
  value: number
}

// =============================================================================
// ANIMATION TYPES
// =============================================================================

// Transition configuration for animations
export interface TransitionConfig extends AnimationConfig {
  delay?: number
}

// =============================================================================
// TOOLTIP TYPES
// =============================================================================

// Enhanced tooltip configuration
export interface TooltipConfig {
  offset: number
  maxWidth: number
  delay: number
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}