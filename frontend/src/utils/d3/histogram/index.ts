// Histogram utilities main exports

// Core calculation functions
export {
  calculateHistogramLayout,
  calculateMultiHistogramLayout,
  calculateThresholdLine,
  clearHistogramCache
} from './calculations'

// Formatting utilities
export {
  getBarColor,
  formatMetricTitle,
  formatTooltipContent,
  formatThresholdTooltip
} from './formatters'

// Validation functions
export {
  validateHistogramData
} from './validation'

// Types and interfaces
export type {
  HistogramBin,
  HistogramLayout,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  HistogramData,
  ThresholdLineData
} from './types'

// Constants
export {
  HISTOGRAM_COLORS,
  DEFAULT_HISTOGRAM_MARGIN,
  MULTI_HISTOGRAM_LAYOUT,
  METRIC_TITLES
} from './constants'