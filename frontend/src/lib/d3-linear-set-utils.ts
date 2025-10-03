import { scaleLinear } from 'd3-scale'
import type { SetVisualizationData } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

export const LINEAR_DIAGRAM_MARGIN = {
  top: 20,
  right: 8,
  bottom: 20,
  left: 80
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

export interface LinearSetLayout {
  columns: LinearDiagramColumn[]
  rows: LinearDiagramRow[]
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
function createColumnLabel(childId: string, metricsHigh: string[], totalMetrics: number): string {
  const highCount = metricsHigh.length

  if (highCount === totalMetrics) {
    return 'All High'
  }

  if (highCount === 0) {
    return 'All Low'
  }

  if (highCount === 1) {
    return getMetricLabel(metricsHigh[0])
  }

  // Multiple metrics high - show abbreviations
  const abbrevs = metricsHigh.map(m => getMetricLabel(m)[0]).join('+')
  return abbrevs
}

/**
 * Order columns by intersection pattern for visual clarity
 * All high → N-1 high → ... → 1 high → All low
 */
function orderColumns(columns: LinearDiagramColumn[], totalMetrics: number): LinearDiagramColumn[] {
  return [...columns].sort((a, b) => {
    const aHighCount = a.metricsHigh.length
    const bHighCount = b.metricsHigh.length

    // Primary sort: descending by number of high metrics
    if (aHighCount !== bHighCount) {
      return bHighCount - aHighCount
    }

    // Secondary sort: by feature count (larger first)
    return b.featureCount - a.featureCount
  })
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate linear set diagram layout from set visualization data
 * Columns = set intersections with proportional widths
 * Rows = metrics with line segments over relevant columns
 */
export function calculateLinearSetLayout(
  data: SetVisualizationData | null,
  selectedMetrics: string[],
  containerWidth: number,
  containerHeight: number,
  margin = LINEAR_DIAGRAM_MARGIN
): LinearSetLayout {
  if (!data || selectedMetrics.length === 0) {
    return {
      columns: [],
      rows: [],
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

  return {
    columns: orderedColumns,
    rows,
    totalWidth: containerWidth,
    totalHeight: containerHeight
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
