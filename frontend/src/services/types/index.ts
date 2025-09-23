// ============================================================================
// API TYPES
// ============================================================================
export type {
  Filters,
  Thresholds,
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
  SankeyData,
  SankeyDataRequest,
  SankeyNode,
  SankeyLink,
  ComparisonData,
  ComparisonDataRequest,
  ComparisonFlow,
  FeatureDetail
} from './api'

// ============================================================================
// UI TYPES
// ============================================================================
export type {
  LoadingState,
  ErrorState,
  HistogramBin,
  IndividualHistogramLayout,
  MultiHistogramLayout,
  ThresholdSliderProps,
  FilterPanelProps,
  HistogramSliderProps,
  SankeyDiagramProps,
  SankeyViewProps,
  TooltipData,
  MetricType,
  HistogramPopoverData,
  PopoverState,
  NodeCategory,
  ColorScale
} from './ui'

// ============================================================================
// VISUALIZATION TYPES
// ============================================================================
export type {
  D3SankeyNode,
  D3SankeyLink
} from './visualization'

// ============================================================================
// THRESHOLD UTILITIES
// ============================================================================
export type {
  NodeThresholds,
  HierarchicalThresholds,
  ThresholdGroupType,
  ThresholdGroup,
  ThresholdGroupUtils
} from './threshold-utils'

export {
  getParentNodeId,
  isScoreAgreementNode,
  isSemanticDistanceNode,
  getSplittingParentId,
  getFeatureSplittingParentId,
  getSemanticDistanceParentId,
  getThresholdGroupId,
  getNodesInThresholdGroup,
  getEffectiveThreshold,
  createHierarchicalThresholds
} from './threshold-utils'