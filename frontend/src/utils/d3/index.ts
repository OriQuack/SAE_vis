// Main d3 utilities index - Backward compatible exports
// This file maintains the same API as the original d3-helpers.ts

// ============================================================================
// HISTOGRAM EXPORTS (backward compatible)
// ============================================================================

// Core histogram functions
export {
  calculateHistogramLayout,
  calculateMultiHistogramLayout,
  calculateThresholdLine,
  clearHistogramCache
} from './histogram'

// Histogram formatting
export {
  getBarColor,
  formatMetricTitle,
  formatTooltipContent,
  formatThresholdTooltip
} from './histogram'

// Histogram validation
export {
  validateHistogramData
} from './histogram'

// Histogram types and constants
export type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  HistogramData,
  ThresholdLineData
} from './histogram'

export {
  HISTOGRAM_COLORS,
  DEFAULT_HISTOGRAM_MARGIN,
  MULTI_HISTOGRAM_LAYOUT,
  METRIC_TITLES
} from './histogram'

// ============================================================================
// SANKEY EXPORTS (backward compatible)
// ============================================================================

// Core sankey functions
export {
  calculateSankeyLayout,
  clearSankeyCache,
  getSankeyCacheStats
} from './sankey'

// Sankey paths and colors
export {
  getSankeyPath,
  getNodeColor,
  getLinkColor
} from './sankey'

// Sankey validation
export {
  validateSankeyData
} from './sankey'

// Sankey types and constants
export type {
  SankeyNode,
  D3SankeyNode,
  SankeyLink,
  D3SankeyLink,
  SankeyLayout,
  NodeSortConfig,
  SankeyData,
  NodeCategory
} from './sankey'

export {
  SANKEY_COLORS,
  DEFAULT_SANKEY_MARGIN,
  SANKEY_LAYOUT_CONFIG,
  SCORE_AGREEMENT_SORT_ORDER
} from './sankey'

// ============================================================================
// SLIDER EXPORTS (backward compatible)
// ============================================================================

export {
  valueToPosition,
  positionToValue,
  snapToNearestTick
} from './slider'

export {
  SLIDER_TRACK
} from './slider'

// ============================================================================
// TOOLTIP & ACCESSIBILITY EXPORTS (backward compatible)
// ============================================================================

// Note: These functions were renamed for clarity but maintain backward compatibility
export {
  generateHistogramBinAriaLabel as generateAriaLabel,
  generateSliderAriaLabel
} from './tooltips'

// ============================================================================
// ANIMATION EXPORTS (backward compatible)
// ============================================================================

export {
  createTransition
} from './animation'

// ============================================================================
// SHARED EXPORTS (backward compatible)
// ============================================================================

export {
  validateDimensions
} from './shared'

export {
  DEFAULT_ANIMATION,
  COMMON_COLORS
} from './shared'

export type {
  AnimationConfig,
  TooltipData,
  LayoutMargin
} from './shared'

// ============================================================================
// MODULE EXPORTS (for new modular usage)
// ============================================================================

// Re-export all modules for users who want to use the new modular structure
export * as histogram from './histogram'
export * as sankey from './sankey'
export * as slider from './slider'
export * as tooltips from './tooltips'
export * as animation from './animation'
export * as shared from './shared'