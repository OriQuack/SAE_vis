import { scaleLinear } from 'd3-scale'
import type { SetVisualizationData, CategoryGroup } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

export const LINEAR_DIAGRAM_MARGIN = {
  top: 20,
  right: 20,
  bottom: 20,
  left: 70
} as const

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LinearDiagramColumn {
  id: string                    // child_id like "all_3_high"
  label: string                 // display label
  featureCount: number          // count for this intersection
  x: number                     // start x position
  width: number                 // proportional to featureCount
  metricsHigh: string[]        // which metrics are high in this column
}

export interface LineSegment {
  x: number
  width: number
  columnId: string
}

export interface LinearDiagramRow {
  metric: string
  metricLabel: string
  y: number
  height: number
  lineSegments: LineSegment[]
  color: string
}

export interface CategoryArea {
  id: string                    // column id
  label: string                 // display label
  x: number                     // left edge
  width: number                 // width
  topY: number                  // top edge (first row top)
  bottomY: number               // bottom edge (last row bottom + 30px)
  color: string                 // unique color for this category
}

export interface ColumnIndicator {
  x: number
  width: number
  columnId: string
}

export interface GroupBar {
  id: string                    // group id
  name: string                  // group name
  y: number                     // vertical position
  height: number                // bar height
  color: string                 // group color
  columnIds: string[]          // columns in this group
  columnIndicators: ColumnIndicator[]  // visual indicators for each column
}

export interface LinearSetLayout {
  columns: LinearDiagramColumn[]
  rows: LinearDiagramRow[]
  categoryAreas: CategoryArea[]  // Added for shaded backgrounds
  groupBars: GroupBar[]          // Added for user-defined groups
  totalWidth: number
  totalHeight: number
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

const METRIC_COLORS: Record<string, string> = {
  score_fuzz: '#ec4899',           // Pink
  score_detection: '#8b5cf6',       // Purple
  score_simulation: '#3b82f6',      // Blue
  score_embedding: '#10b981'        // Green
}

export function getMetricColor(metric: string): string {
  return METRIC_COLORS[metric] || '#6b7280' // Default gray
}

/**
 * Get category color based on how many metrics are "high"
 * Uses distinct colors for each category to improve cognitive comprehension
 * Color scheme emphasizes agreement patterns with clear visual distinction
 */
export function getCategoryColor(metricsHigh: string[], totalMetrics: number): string {
  const highCount = metricsHigh.length

  // Use distinct colors based on exact count of high metrics
  // This provides clear visual separation for each agreement category
  if (highCount === 0) {
    // All Low - Red (indicates no agreement/all metrics below threshold)
    return '#fecaca' // Red 200 - Softer red for better readability
  } else if (highCount === 1) {
    // Single High - Orange (partial agreement with 1 metric)
    return '#fed7aa' // Orange 200 - Warm, distinct from red
  } else if (highCount === 2 && totalMetrics >= 3) {
    // Two High (when 3+ metrics) - Yellow (moderate agreement)
    return '#fde68a' // Yellow 200 - Clear distinction from orange
  } else if (highCount === 3 && totalMetrics === 4) {
    // Three of Four High - Light Blue (strong but not perfect agreement)
    return '#bfdbfe' // Blue 200 - Cool color for higher agreement
  } else if (highCount === totalMetrics - 1 && totalMetrics > 2) {
    // N-1 High - Light Blue (very strong agreement, one dissenter)
    return '#bfdbfe' // Blue 200 - Same as 3/4 for consistency
  } else if (highCount === totalMetrics) {
    // All High - Green (perfect agreement/all metrics above threshold)
    return '#bbf7d0' // Green 200 - Distinct success color
  } else {
    // Fallback for majority (but not all/N-1)
    return '#e0e7ff' // Indigo 100 - Neutral moderate agreement
  }
}

// ============================================================================
// LABEL FORMATTING
// ============================================================================

const METRIC_LABELS: Record<string, string> = {
  score_fuzz: 'Fuzz',
  score_detection: 'Detection',
  score_simulation: 'Simulation',
  score_embedding: 'Embedding'
}

export function getMetricLabel(metric: string): string {
  return METRIC_LABELS[metric] || metric.replace('score_', '')
}

// ============================================================================
// DEFAULT GROUP GENERATION
// ============================================================================

const GROUP_COLORS = [
  '#bbf7d0', // Green 200 - All High
  '#bfdbfe', // Blue 200 - N-1 High
  '#fde68a', // Yellow 200 - 2 High (for 3+ metrics)
  '#fed7aa', // Orange 200 - 1 High
  '#fecaca', // Red 200 - All Low
]

/**
 * Generate default category groups based on number of metrics
 * Creates (N+1) groups: All High, (N-1) High, ..., 1 High, All Low
 */
export function generateDefaultCategoryGroups(
  columns: LinearDiagramColumn[],
  totalMetrics: number
): CategoryGroup[] {
  const groups: CategoryGroup[] = []
  let groupIndex = 0

  // Group columns by count of high metrics
  for (let highCount = totalMetrics; highCount >= 0; highCount--) {
    const matchingColumns = columns.filter(col => col.metricsHigh.length === highCount)

    if (matchingColumns.length > 0) {
      const groupId = `group_${groupIndex}`
      let groupName = ''

      if (highCount === totalMetrics) {
        groupName = 'All High'
      } else if (highCount === 0) {
        groupName = 'All Low'
      } else if (highCount === 1) {
        groupName = '1 High'
      } else {
        groupName = `${highCount} High`
      }

      // Assign color based on position
      const colorIndex = totalMetrics - highCount
      const color = GROUP_COLORS[colorIndex] || '#e5e7eb' // Fallback gray

      groups.push({
        id: groupId,
        name: groupName,
        columnIds: matchingColumns.map(col => col.id),
        color
      })

      groupIndex++
    }
  }

  return groups
}

// ============================================================================
// COLUMN PARSING AND ORDERING
// ============================================================================

/**
 * Parse which metrics are "high" from a child_id
 * Child ID format examples:
 * - "all_3_high" → all metrics high
 * - "all_3_low" → no metrics high
 * - "2_of_3_high_fuzz_det" → fuzz and detection high
 * - "1_of_3_high_fuzz" → only fuzz high
 */
function parseHighMetricsFromChildId(
  childId: string,
  selectedMetrics: string[]
): string[] {
  // Handle "all_N_high" case
  if (childId.startsWith('all_') && childId.endsWith('_high')) {
    return [...selectedMetrics]
  }

  // Handle "all_N_low" case
  if (childId.startsWith('all_') && childId.endsWith('_low')) {
    return []
  }

  // Handle "K_of_N_high_metrics" format
  const match = childId.match(/\d+_of_\d+_high_(.+)/)
  if (match) {
    const metricsPart = match[1]
    const shortNames = metricsPart.split('_')

    // Convert short names (fuzz, det, sim, emb) back to full metric names
    return shortNames
      .map(shortName => selectedMetrics.find(m => m.includes(shortName)))
      .filter((m): m is string => m !== undefined)
  }

  return []
}

/**
 * Create display label for a column
 */
function createColumnLabel(_childId: string, metricsHigh: string[], totalMetrics: number): string {
  const highCount = metricsHigh.length

  if (highCount === totalMetrics) {
    return 'All High'
  }

  if (highCount === 0) {
    return 'All Low'
  }

  if (highCount === 1) {
    return `${getMetricLabel(metricsHigh[0])} High`
  }

  // Multiple metrics high - show full names
  const metricNames = metricsHigh.map(m => getMetricLabel(m))

  // Join with "and" for the last item, commas for others
  if (metricNames.length === 2) {
    return `${metricNames[0]} & ${metricNames[1]} High`
  } else {
    const lastMetric = metricNames[metricNames.length - 1]
    const otherMetrics = metricNames.slice(0, -1).join(', ')
    return `${otherMetrics}, & ${lastMetric} High`
  }
}

/**
 * Calculate Jaccard similarity between two sets
 * J(A,B) = |A ∩ B| / |A ∪ B|
 * Returns value between 0 (no overlap) and 1 (identical sets)
 */
function calculateJaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 1 // Both empty = identical

  const setBSet = new Set(setB)

  // Calculate intersection
  const intersection = setA.filter(item => setBSet.has(item)).length

  // Calculate union
  const union = new Set([...setA, ...setB]).size

  return union === 0 ? 0 : intersection / union
}

/**
 * Order columns using greedy nearest-neighbor algorithm to minimize line segment splits
 *
 * Algorithm: Start with the column with most high metrics, then iteratively select
 * the unvisited column most similar (Jaccard similarity) to the current column.
 * This minimizes visual discontinuities in horizontal metric lines.
 *
 * Inspired by UpSet plot methodology and seriation algorithms for matrix reordering.
 * Complexity: O(n²) where n is number of columns (typically 4-16 for 2-4 metrics)
 */
function orderColumns(columns: LinearDiagramColumn[], _totalMetrics: number): LinearDiagramColumn[] {
  if (columns.length <= 1) return [...columns]

  const unvisited = new Set(columns)
  const ordered: LinearDiagramColumn[] = []

  // Step 1: Find starting column (most high metrics, then largest feature count)
  let current = columns.reduce((best, col) => {
    if (col.metricsHigh.length > best.metricsHigh.length) return col
    if (col.metricsHigh.length === best.metricsHigh.length && col.featureCount > best.featureCount) return col
    return best
  })

  ordered.push(current)
  unvisited.delete(current)

  // Step 2: Greedy nearest-neighbor selection
  while (unvisited.size > 0) {
    let bestNext: LinearDiagramColumn | null = null
    let bestSimilarity = -1

    // Find most similar unvisited column to current
    for (const candidate of unvisited) {
      const similarity = calculateJaccardSimilarity(current.metricsHigh, candidate.metricsHigh)

      // Select if better similarity, or same similarity but larger feature count
      if (similarity > bestSimilarity ||
          (similarity === bestSimilarity && bestNext && candidate.featureCount > bestNext.featureCount)) {
        bestNext = candidate
        bestSimilarity = similarity
      }
    }

    if (bestNext) {
      ordered.push(bestNext)
      unvisited.delete(bestNext)
      current = bestNext
    } else {
      // Fallback: should never happen, but handle gracefully
      const remaining = Array.from(unvisited)[0]
      ordered.push(remaining)
      unvisited.delete(remaining)
      current = remaining
    }
  }

  return ordered
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate linear set diagram layout from set visualization data
 * Columns = set intersections with proportional widths
 * Rows = metrics with line segments over relevant columns
 * Groups = user-defined category groupings
 */
export function calculateLinearSetLayout(
  data: SetVisualizationData | null,
  selectedMetrics: string[],
  containerWidth: number,
  containerHeight: number,
  categoryGroups: CategoryGroup[] = [],
  margin = LINEAR_DIAGRAM_MARGIN
): LinearSetLayout {
  if (!data || selectedMetrics.length === 0) {
    return {
      columns: [],
      rows: [],
      categoryAreas: [],
      groupBars: [],
      totalWidth: 0,
      totalHeight: 0
    }
  }

  const { set_counts, total_features } = data

  // Step 1: Parse set_counts to create columns
  const rawColumns: LinearDiagramColumn[] = Object.entries(set_counts).map(([childId, count]) => ({
    id: childId,
    label: '',  // Will be set after parsing
    featureCount: count,
    x: 0,       // Will be calculated
    width: 0,   // Will be calculated
    metricsHigh: parseHighMetricsFromChildId(childId, selectedMetrics)
  }))

  // Add labels
  rawColumns.forEach(col => {
    col.label = createColumnLabel(col.id, col.metricsHigh, selectedMetrics.length)
  })

  // Step 2: Order columns by intersection pattern
  const orderedColumns = orderColumns(rawColumns, selectedMetrics.length)

  // Step 3: Calculate proportional widths
  const availableWidth = containerWidth - margin.left - margin.right
  const widthScale = scaleLinear()
    .domain([0, total_features])
    .range([0, availableWidth])

  let currentX = margin.left
  orderedColumns.forEach(col => {
    col.x = currentX
    col.width = widthScale(col.featureCount)
    currentX += col.width
  })

  // Step 4: Create metric rows with line segments
  const availableHeight = containerHeight - margin.top - margin.bottom
  const rowHeight = Math.min(15, availableHeight / selectedMetrics.length - 3)  // Thinner lines
  const rowSpacing = 5  // Fixed small spacing between rows

  const rows: LinearDiagramRow[] = selectedMetrics.map((metric, index) => {
    // Find columns where this metric is high
    const relevantColumns = orderedColumns.filter(col => col.metricsHigh.includes(metric))

    // Create line segments
    const lineSegments: LineSegment[] = relevantColumns.map(col => ({
      x: col.x,
      width: col.width,
      columnId: col.id
    }))

    return {
      metric,
      metricLabel: getMetricLabel(metric),
      y: margin.top + rowSpacing + (index * (rowHeight + rowSpacing)),
      height: rowHeight,
      lineSegments,
      color: getMetricColor(metric)
    }
  })

  // Step 5: Create category areas (shaded backgrounds from top to bottom + 30px)
  const categoryAreas: CategoryArea[] = orderedColumns.map((col) => {
    const topY = rows.length > 0 ? rows[0].y : margin.top
    const bottomRow = rows.length > 0 ? rows[rows.length - 1] : null
    const bottomY = bottomRow ? bottomRow.y + bottomRow.height + 30 : margin.top + 30

    return {
      id: col.id,
      label: col.label,
      x: col.x,
      width: col.width,
      topY,
      bottomY,
      color: getCategoryColor(col.metricsHigh, selectedMetrics.length)
    }
  })

  // Step 6: Create separate group rows below metric rows
  const groupBarHeight = 18
  const groupBarMarginTop = 25
  const groupBarSpacing = 3
  const lastRowBottom = rows.length > 0 ? rows[rows.length - 1].y + rows[rows.length - 1].height : margin.top
  let currentGroupY = lastRowBottom + groupBarMarginTop

  const groupBars: GroupBar[] = categoryGroups.map((group) => {
    // Find columns in this group
    const groupColumns = orderedColumns.filter(col => group.columnIds.includes(col.id))

    // Create column indicators for each column in this group
    const columnIndicators: ColumnIndicator[] = groupColumns.map(col => ({
      x: col.x,
      width: col.width,
      columnId: col.id
    }))

    const bar = {
      id: group.id,
      name: group.name,
      y: currentGroupY,
      height: groupBarHeight,
      color: group.color,
      columnIds: group.columnIds,
      columnIndicators
    }

    // Move to next row position
    currentGroupY += groupBarHeight + groupBarSpacing

    return bar
  })

  return {
    columns: orderedColumns,
    rows,
    categoryAreas,
    groupBars,
    totalWidth: containerWidth,
    totalHeight: containerHeight
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse column ID to determine metric states (high/low)
 * Used for building CategoryGroup-based pattern rules
 *
 * @param columnId Child ID like "all_3_high", "2_of_3_high_fuzz_det", "1_of_3_high_sim"
 * @param metrics Array of metric names (e.g., ["score_fuzz", "score_detection", "score_simulation"])
 * @returns Record mapping each metric to "high" or "low"
 *
 * @example
 * parseColumnIdToMetricStates("all_3_high", ["score_fuzz", "score_detection", "score_simulation"])
 * // Returns: { score_fuzz: "high", score_detection: "high", score_simulation: "high" }
 *
 * parseColumnIdToMetricStates("2_of_3_high_fuzz_det", ["score_fuzz", "score_detection", "score_simulation"])
 * // Returns: { score_fuzz: "high", score_detection: "high", score_simulation: "low" }
 */
export function parseColumnIdToMetricStates(
  columnId: string,
  metrics: string[]
): Record<string, 'high' | 'low'> {
  // Handle "all_N_high" case
  if (columnId.startsWith('all_') && columnId.endsWith('_high')) {
    return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'high' as const }), {})
  }

  // Handle "all_N_low" case
  if (columnId.startsWith('all_') && columnId.endsWith('_low')) {
    return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'low' as const }), {})
  }

  // Handle "K_of_N_high_metrics" format
  const match = columnId.match(/\d+_of_\d+_high_(.+)/)
  if (match) {
    const metricsPart = match[1]
    const shortNames = metricsPart.split('_')

    // Convert short names (fuzz, det, sim, emb) to full metric names
    const highMetrics = new Set(
      shortNames
        .map(shortName => metrics.find(m => m.includes(shortName)))
        .filter((m): m is string => m !== undefined)
    )

    // Build result: high for matched metrics, low for others
    return metrics.reduce((acc, metric) => ({
      ...acc,
      [metric]: highMetrics.has(metric) ? 'high' as const : 'low' as const
    }), {})
  }

  // Fallback: all low (should not happen with valid column IDs)
  return metrics.reduce((acc, metric) => ({ ...acc, [metric]: 'low' as const }), {})
}

/**
 * Format count with thousands separator
 */
export function formatCount(count: number): string {
  return count.toLocaleString()
}

/**
 * Format percentage with one decimal place
 */
export function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`
}
