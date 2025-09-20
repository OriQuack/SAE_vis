import { SANKEY_COLORS } from '../../../utils/d3-helpers'

export interface ThresholdGroupInfo {
  hasGroup: boolean
  groupSize: number
  primaryMetric?: string
}

export interface SankeyNodeProps {
  onHover: (event: React.MouseEvent, node: any) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, node: any) => void
}

export interface SankeyLinkProps {
  onHover: (event: React.MouseEvent, link: any) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, link: any) => void
}

export const STAGE_LABELS = [
  'All Features',
  'Feature Splitting',
  'Semantic Distance',
  'Score Agreement'
]

export const LEGEND_ITEMS = [
  { key: 'root', label: 'All Features' },
  { key: 'feature_splitting', label: 'Feature Splitting' },
  { key: 'semantic_distance', label: 'Semantic Distance' },
  { key: 'score_agreement', label: 'Score Agreement' }
] as const

export { SANKEY_COLORS }