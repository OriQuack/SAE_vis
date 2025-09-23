import type { Filters, FilterOptions, HistogramData, SankeyData, SankeyNode, SankeyLink } from './api'

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface LoadingState {
  filters: boolean
  histogram: boolean
  sankey: boolean
  comparison: boolean
}

export interface ErrorState {
  filters: string | null
  histogram: string | null
  sankey: string | null
  comparison: string | null
}

// ============================================================================
// HISTOGRAM VISUALIZATION TYPES
// ============================================================================

export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

export interface IndividualHistogramLayout {
  bins: HistogramBin[]
  xScale: any // D3 scale function
  yScale: any // D3 scale function
  width: number
  height: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
  metric: string
  yOffset: number
  chartTitle: string
}

export interface MultiHistogramLayout {
  charts: IndividualHistogramLayout[]
  totalWidth: number
  totalHeight: number
  spacing: number
}

export interface ThresholdSliderProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

export interface FilterPanelProps {
  filters: Filters
  filterOptions: FilterOptions | null
  loading: boolean
  onFiltersChange: (filters: Partial<Filters>) => void
}

export interface HistogramSliderProps {
  histogramData: HistogramData | null
  threshold: number
  loading: boolean
  error: string | null
  onThresholdChange: (threshold: number) => void
  onRefresh: () => void
}

export interface SankeyDiagramProps {
  data: SankeyData | null
  loading: boolean
  error: string | null
  width?: number
  height?: number
  onNodeClick?: (node: SankeyNode) => void
  onLinkClick?: (link: SankeyLink) => void
}

export interface SankeyViewProps {
  className?: string
}

// ============================================================================
// TOOLTIP TYPES
// ============================================================================

export interface TooltipData {
  x: number
  y: number
  title: string
  content: Array<{ label: string; value: string | number }>
}

// ============================================================================
// POPOVER TYPES
// ============================================================================

export type MetricType =
  | 'feature_splitting'
  | 'semdist_mean'
  | 'semdist_max'
  | 'score_fuzz'
  | 'score_simulation'
  | 'score_detection'
  | 'score_embedding'

export interface HistogramPopoverData {
  nodeId: string
  nodeName: string
  parentNodeId?: string
  parentNodeName?: string
  metrics: MetricType[]
  position: {
    x: number
    y: number
  }
  visible: boolean
}

export interface PopoverState {
  histogram: HistogramPopoverData | null
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type NodeCategory =
  | 'root'
  | 'feature_splitting'
  | 'semantic_distance'
  | 'score_agreement'

export interface ColorScale {
  [key: string]: string
}