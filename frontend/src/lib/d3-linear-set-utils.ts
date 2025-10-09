import { COMPONENT_COLORS } from './constants'

// ============================================================================
// CONSTANTS
// ============================================================================

export const TOTAL_FEATURES = 1648

export const LINEAR_SET_METRICS = [
  { key: 'feature_splitting', label: 'Feature Splitting', color: COMPONENT_COLORS.FEATURE_SPLITTING },
  { key: 'semsim_mean', label: 'Semantic Similarity', color: COMPONENT_COLORS.SEMANTIC_SIMILARITY },
  { key: 'score_embedding', label: 'Embedding Score', color: COMPONENT_COLORS.SCORE_EMBEDDING },
  { key: 'score_fuzz', label: 'Fuzz Score', color: COMPONENT_COLORS.SCORE_FUZZ },
  { key: 'score_detection', label: 'Detection Score', color: COMPONENT_COLORS.SCORE_DETECTION }
] as const

export const DEFAULT_LINEAR_SET_DIMENSIONS = {
  width: 1000,
  height: 70,
margin: { top: 0, right: 0, bottom: 0, left: 120 },
  lineHeight: 8
} as const

// ============================================================================
// TYPES
// ============================================================================

// Local type definitions (matching store.ts structure)
interface ThresholdSelection {
  metricType: string
  featureIds?: number[]
}

interface ThresholdGroup {
  visible: boolean
  selections: ThresholdSelection[]
}

interface FeatureGroup {
  metrics: Set<string>
  count: number
  featureIds: number[]
}

interface LineSegment {
  startX: number
  endX: number
}

interface GroupPosition {
  start: number
  end: number
}

export interface Dimensions {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  lineHeight: number
}

interface LinearSetLayout {
  featureGroups: FeatureGroup[]
  metricSegments: Map<string, LineSegment[]>
  groupPositions: GroupPosition[]
  totalFeatures: number
  innerWidth: number
  innerHeight: number
  rowHeight: number
  lineHeight: number
  xScale: (featureCount: number) => number
}

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Build metric → feature ID sets from threshold groups
 */
function buildMetricFeatureSets(
  thresholdGroups: ThresholdGroup[],
  totalFeatures: number
): Map<string, Set<number>> {
  const sets = new Map<string, Set<number>>()

  // Initialize sets for all metrics
  LINEAR_SET_METRICS.forEach(metric => {
    sets.set(metric.key, new Set<number>())
  })

  // Process all visible groups
  thresholdGroups.forEach(group => {
    if (!group.visible) return

    group.selections.forEach(selection => {
      const featureSet = sets.get(selection.metricType)
      if (featureSet && selection.featureIds) {
        selection.featureIds.forEach(featureId => {
          if (featureId < totalFeatures) {
            featureSet.add(featureId)
          }
        })
      }
    })
  })

  return sets
}

/**
 * Group features by their metric membership pattern
 * Sorts from most overlapped (most metrics) to least overlapped
 */
function buildFeatureGroups(
  metricFeatureSets: Map<string, Set<number>>,
  totalFeatures: number
): FeatureGroup[] {
  const groupMap = new Map<string, FeatureGroup>()
  const featureToMetrics = new Map<number, Set<string>>()

  // Build feature → metrics map
  metricFeatureSets.forEach((featureSet, metricKey) => {
    featureSet.forEach(featureId => {
      if (!featureToMetrics.has(featureId)) {
        featureToMetrics.set(featureId, new Set())
      }
      featureToMetrics.get(featureId)!.add(metricKey)
    })
  })

  // Add features without any thresholds
  for (let featureId = 0; featureId < totalFeatures; featureId++) {
    if (!featureToMetrics.has(featureId)) {
      featureToMetrics.set(featureId, new Set())
    }
  }

  // Group features by metric membership pattern
  featureToMetrics.forEach((metrics, featureId) => {
    const key = Array.from(metrics).sort().join(',')

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        metrics,
        count: 0,
        featureIds: []
      })
    }

    const group = groupMap.get(key)!
    group.count++
    group.featureIds.push(featureId)
  })

  // Sort: most overlapped first (descending by metric count)
  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    if (a.metrics.size !== b.metrics.size) {
      return b.metrics.size - a.metrics.size
    }
    const aFirst = Array.from(a.metrics).sort()[0]
    const bFirst = Array.from(b.metrics).sort()[0]
    if (aFirst && bFirst) {
      return aFirst.localeCompare(bFirst)
    }
    return 0
  })

  return groups
}

/**
 * Calculate group positions and line segments for each metric
 */
function calculateSegments(featureGroups: FeatureGroup[]): {
  metricSegments: Map<string, LineSegment[]>
  groupPositions: GroupPosition[]
} {
  // Calculate cumulative positions
  let cumulative = 0
  const groupPositions: GroupPosition[] = []

  featureGroups.forEach(group => {
    groupPositions.push({ start: cumulative, end: cumulative + group.count })
    cumulative += group.count
  })

  // Calculate line segments for each metric
  const metricSegments = new Map<string, LineSegment[]>()

  LINEAR_SET_METRICS.forEach(metric => {
    const segments: LineSegment[] = []
    let inSegment = false
    let segmentStartX = 0

    featureGroups.forEach((group, index) => {
      if (group.metrics.has(metric.key)) {
        if (!inSegment) {
          inSegment = true
          segmentStartX = groupPositions[index].start
        }
      } else if (inSegment) {
        segments.push({
          startX: segmentStartX,
          endX: groupPositions[index - 1].end
        })
        inSegment = false
      }
    })

    // Handle segment extending to end
    if (inSegment) {
      segments.push({
        startX: segmentStartX,
        endX: groupPositions[groupPositions.length - 1].end
      })
    }

    metricSegments.set(metric.key, segments)
  })

  return { metricSegments, groupPositions }
}

// ============================================================================
// MAIN LAYOUT CALCULATION
// ============================================================================

/**
 * Calculate complete linear set diagram layout
 */
export function calculateLinearSetLayout(
  thresholdGroups: ThresholdGroup[],
  dimensions: Dimensions = DEFAULT_LINEAR_SET_DIMENSIONS
): LinearSetLayout {
  const { width, height, margin, lineHeight } = dimensions
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const rowHeight = innerHeight / LINEAR_SET_METRICS.length

  // Build data structures
  const metricFeatureSets = buildMetricFeatureSets(thresholdGroups, TOTAL_FEATURES)
  const featureGroups = buildFeatureGroups(metricFeatureSets, TOTAL_FEATURES)
  const { metricSegments, groupPositions } = calculateSegments(featureGroups)

  // Calculate total features
  const totalFeatures = featureGroups.reduce((sum, group) => sum + group.count, 0)

  // Create scale function
  const xScale = (featureCount: number) => {
    if (totalFeatures === 0) return 0
    return (featureCount / totalFeatures) * innerWidth
  }

  return {
    featureGroups,
    metricSegments,
    groupPositions,
    totalFeatures,
    innerWidth,
    innerHeight,
    rowHeight,
    lineHeight,
    xScale
  }
}
