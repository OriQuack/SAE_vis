// Backward compatibility layer for d3-helpers.ts
// This file maintains the exact same API as the original but delegates to the new modular structure
// Updated: Refactored to modular architecture for better performance and maintainability

// Re-export everything from the new modular d3 utilities
export * from './d3'

// Legacy compatibility - ensure all original exports are available
// This preserves the exact import statements used throughout the codebase
export {
  // Histogram exports
  calculateHistogramLayout,
  calculateMultiHistogramLayout,
  calculateThresholdLine,
  getBarColor,
  formatMetricTitle,
  formatTooltipContent,
  formatThresholdTooltip,
  validateHistogramData,
  HISTOGRAM_COLORS,

  // Sankey exports
  calculateSankeyLayout,
  getSankeyPath,
  getNodeColor,
  getLinkColor,
  validateSankeyData,
  SANKEY_COLORS,

  // Slider exports
  valueToPosition,
  positionToValue,
  snapToNearestTick,
  SLIDER_TRACK,

  // Animation exports
  createTransition,
  DEFAULT_ANIMATION,

  // Tooltip/Accessibility exports
  generateAriaLabel,
  generateSliderAriaLabel,

  // Validation exports
  validateDimensions
} from './d3'

// Re-export types to maintain TypeScript compatibility
export type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  ThresholdLineData,
  SankeyLayout,
  D3SankeyNode,
  D3SankeyLink,
  TooltipData,
  AnimationConfig
} from './d3'