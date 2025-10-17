import { scaleLinear } from 'd3-scale'
import type { FeatureTableRow, MetricNormalizationStats, ConsistencyType } from '../types'
import { CONSISTENCY_COLORS, SCORE_COLORS } from './constants'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HeaderCell {
  label: string
  title?: string  // Full name for hover tooltip
  colSpan: number
  rowSpan: number
  type: 'explainer' | 'metric' | 'scorer'
  explainerId?: string
  metricType?: 'explanation' | 'embedding' | 'fuzz' | 'detection'
  scorerId?: 's1' | 's2' | 's3'
}

export interface HeaderStructure {
  row1: HeaderCell[]  // Explainer names
  row2: HeaderCell[]  // Metric names
  row3: HeaderCell[]  // Scorer labels
}

export interface TableLayout {
  columnWidth: number
  totalColumns: number
  headerStructure: HeaderStructure
}

// ============================================================================
// MODEL NAME MAPPING
// ============================================================================

const MODEL_NAME_MAP: Record<string, string> = {
  'llama': 'Llama',
  'qwen': 'Qwen',
  'openai': 'OpenAI'
}

export function getExplainerDisplayName(explainerId: string): string {
  return MODEL_NAME_MAP[explainerId] || explainerId
}

// ============================================================================
// HELPER FUNCTIONS (INTERNAL UTILITIES)
// ============================================================================

/**
 * Calculate average of non-null values
 *
 * This helper consolidates the repeated averaging pattern used throughout the file.
 *
 * @param values - Array of values (may contain nulls)
 * @returns Average of non-null values, or null if no valid values
 */
function averageNonNull(values: (number | null)[]): number | null {
  const valid = values.filter(v => v !== null) as number[]
  if (valid.length === 0) return null
  return valid.reduce((sum, v) => sum + v, 0) / valid.length
}

/**
 * Normalize a score value using min-max normalization
 *
 * @param value - Raw score value
 * @param stats - Statistics containing min/max
 * @returns Normalized value (0-1) or null if range is invalid
 */
function normalizeScore(value: number, stats: MetricNormalizationStats): number | null {
  const { min, max } = stats
  const range = max - min
  if (range <= 0) return null
  return (value - min) / range
}

/**
 * Extract LLM scorer consistency (average of fuzz and detection consistency)
 *
 * @param explainerData - Explainer data containing scorer_consistency
 * @returns Average scorer consistency or null
 */
function extractScorerConsistency(explainerData: any): number | null {
  if (!explainerData.scorer_consistency) return null

  const values: number[] = []
  if (explainerData.scorer_consistency.fuzz) {
    values.push(explainerData.scorer_consistency.fuzz.value)
  }
  if (explainerData.scorer_consistency.detection) {
    values.push(explainerData.scorer_consistency.detection.value)
  }

  return averageNonNull(values)
}

/**
 * Extract cross-explainer metric consistency (average of embedding, fuzz, detection)
 *
 * @param explainerData - Explainer data containing cross_explainer_metric_consistency
 * @returns Average cross-explainer consistency or null
 */
function extractCrossExplainerConsistency(explainerData: any): number | null {
  if (!explainerData.cross_explainer_metric_consistency) return null

  const cem = explainerData.cross_explainer_metric_consistency
  const values: number[] = []

  if (cem.embedding) values.push(cem.embedding.value)
  if (cem.fuzz) values.push(cem.fuzz.value)
  if (cem.detection) values.push(cem.detection.value)

  return averageNonNull(values)
}


// ============================================================================
// DATA EXTRACTION HELPERS
// ============================================================================

/**
 * Extract score value from feature row for specific explainer, metric, and scorer
 *
 * @param row - Feature table row
 * @param explainerId - Explainer ID (llama, qwen, openai)
 * @param metricType - Metric type (embedding, fuzz, detection)
 * @param scorerId - Scorer ID (s1, s2, s3) - optional. If not provided for fuzz/detection, returns average
 * @returns Score value or null
 */
export function getScoreValue(
  row: FeatureTableRow,
  explainerId: string,
  metricType: 'embedding' | 'fuzz' | 'detection',
  scorerId?: 's1' | 's2' | 's3'
): number | null {
  const explainerData = row.explainers[explainerId]
  if (!explainerData) return null

  if (metricType === 'embedding') {
    return explainerData.embedding
  }

  const scores = metricType === 'fuzz' ? explainerData.fuzz : explainerData.detection

  if (scorerId) {
    return scores[scorerId]
  }

  // No scorerId specified - return average of all available scorers
  return averageNonNull([scores.s1, scores.s2, scores.s3])
}

// ============================================================================
// CONSISTENCY COLOR BAR
// ============================================================================

export interface ColorBarLayout {
  width: number
  height: number
  barX: number
  barY: number
  barWidth: number
  barHeight: number
  leftLabelX: number
  leftLabelY: number
  rightLabelX: number
  rightLabelY: number
  gradientStops: Array<{
    offset: string
    color: string
  }>
}

/**
 * Calculate color bar layout with inline labels
 *
 * Following project pattern: D3 calculations in utils, React renders the result
 *
 * @param containerWidth - Total width available for the color bar and labels
 * @param barHeight - Height of the gradient bar
 * @param consistencyType - Type of consistency for color selection
 * @returns Layout calculations for rendering
 */
export function calculateColorBarLayout(
  containerWidth: number = 400,
  barHeight: number = 12,
  consistencyType: ConsistencyType = 'none'
): ColorBarLayout {
  const labelWidth = 35  // Width reserved for each label ("0 Low", "1 High")
  const labelGap = 8     // Gap between label and bar

  // Calculate bar width (total - labels - gaps)
  const barWidth = containerWidth - (labelWidth * 2) - (labelGap * 2)
  const barX = labelWidth + labelGap
  const barY = 0

  // Label positions (vertically centered with bar)
  const labelY = barHeight / 2

  return {
    width: containerWidth,
    height: barHeight,
    barX,
    barY,
    barWidth,
    barHeight,
    leftLabelX: 0,
    leftLabelY: labelY,
    rightLabelX: containerWidth - labelWidth,
    rightLabelY: labelY,
    gradientStops: getConsistencyGradientStops(consistencyType)
  }
}

/**
 * Get consistency color gradient definition based on consistency type
 *
 * @param consistencyType - Type of consistency metric
 * @returns Color gradient definition (LOW, MEDIUM, HIGH)
 */
function getConsistencyColorGradient(consistencyType: ConsistencyType): { LOW: string; MEDIUM: string; HIGH: string } {
  switch (consistencyType) {
    case 'llm_scorer_consistency':
      return CONSISTENCY_COLORS.LLM_SCORER
    case 'within_explanation_score':
      return CONSISTENCY_COLORS.WITHIN_EXPLANATION
    case 'cross_explanation_score':
      return CONSISTENCY_COLORS.CROSS_EXPLANATION
    case 'llm_explainer_consistency':
      return CONSISTENCY_COLORS.LLM_EXPLAINER
    case 'none':
    default:
      // Default to white (no coloring)
      return { LOW: '#FFFFFF', MEDIUM: '#FFFFFF', HIGH: '#FFFFFF' }
  }
}

/**
 * Get color for a consistency value (0-1)
 *
 * Uses single-color gradient (white to color) based on consistency type.
 * Can be used for coloring table cells, charts, etc.
 *
 * @param value - Consistency value between 0 and 1
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns RGB color string (e.g., "#4477AA")
 */
export function getConsistencyColor(value: number, consistencyType: ConsistencyType = 'none'): string {
  // Clamp value between 0 and 1
  const clampedValue = Math.max(0, Math.min(1, value))

  // Get color gradient for this consistency type
  const gradient = getConsistencyColorGradient(consistencyType)

  // Create D3 color scale: white (0) → light color (0.5) → full color (1.0)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([gradient.LOW, gradient.MEDIUM, gradient.HIGH])

  return colorScale(clampedValue)
}

/**
 * Get color for an overall score value (0-1)
 *
 * Uses performance gradient: white (poor) → green (good) with increasing opacity
 * Designed for displaying overall scores in the simplified table.
 *
 * @param score - Overall score value between 0 and 1
 * @returns RGB color string with alpha
 */
export function getOverallScoreColor(score: number): string {
  // Clamp value between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score))

  // Create performance color scale: white (0) → light green (0.5) → full green (1)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([SCORE_COLORS.LOW, SCORE_COLORS.MEDIUM, SCORE_COLORS.HIGH])

  return colorScale(clampedScore)
}

/**
 * Get gradient stops for consistency color scale
 *
 * Returns array of gradient stops that can be used in SVG linearGradient
 *
 * @param consistencyType - Type of consistency metric (determines color)
 * @returns Array of gradient stop objects
 */
export function getConsistencyGradientStops(consistencyType: ConsistencyType = 'none'): Array<{ offset: string; color: string }> {
  const gradient = getConsistencyColorGradient(consistencyType)

  return [
    { offset: '0%', color: gradient.LOW },      // White (low consistency at 0)
    { offset: '50%', color: gradient.MEDIUM },  // Light color (medium)
    { offset: '100%', color: gradient.HIGH }    // Full color (high consistency at 1)
  ]
}

// ============================================================================
// TABLE SORTING UTILITIES
// ============================================================================

/**
 * Get consistency value for sorting purposes
 *
 * For some consistency types, we need to aggregate multiple values
 * (e.g., LLM Scorer may have both fuzz and detection consistency)
 *
 * @param row - Feature table row
 * @param consistencyType - Type of consistency to extract
 * @param explainerIds - Array of explainer IDs (for averaging across explainers)
 * @returns Average consistency value or null
 */
export function getConsistencyValueForSorting(
  row: FeatureTableRow,
  consistencyType: string,
  explainerIds: string[]
): number | null {
  // No consistency - return null (no sorting by consistency)
  if (consistencyType === 'none') {
    return null
  }

  const values: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = row.explainers[explainerId]
    if (!explainerData) continue

    if (consistencyType === 'llm_scorer_consistency') {
      values.push(extractScorerConsistency(explainerData))
    } else if (consistencyType === 'within_explanation_score') {
      if (explainerData.metric_consistency) {
        values.push(explainerData.metric_consistency.value)
      }
    } else if (consistencyType === 'cross_explanation_score') {
      values.push(extractCrossExplainerConsistency(explainerData))
    } else if (consistencyType === 'llm_explainer_consistency') {
      if (explainerData.explainer_consistency) {
        values.push(explainerData.explainer_consistency.value)
      }
    }
  }

  // Return average of collected values, or null if no values
  return averageNonNull(values)
}

/**
 * Compare two values for sorting with proper null handling
 *
 * Null values are always placed at the end regardless of sort direction
 *
 * @param a - First value
 * @param b - Second value
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Comparison result (-1, 0, or 1)
 */
export function compareValues(
  a: number | null,
  b: number | null,
  direction: 'asc' | 'desc'
): number {
  // Handle null cases - always push to end
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1

  // Both values are numbers
  if (direction === 'asc') {
    return a - b
  } else {
    return b - a
  }
}

// ============================================================================
// OVERALL SCORE CALCULATION (FOR NEW TABLE LAYOUT)
// ============================================================================

/**
 * Calculate overall score from embedding, fuzz, and detection
 *
 * Process:
 * 1. Normalize each score using global stats: (value - min) / (max - min)
 * 2. Average the three normalized scores
 *
 * @param embedding - Embedding score
 * @param fuzzScores - Fuzz scores from scorers (s1, s2, s3)
 * @param detectionScores - Detection scores from scorers (s1, s2, s3)
 * @param globalStats - Global normalization statistics
 * @returns Overall score (0-1) or null if insufficient data
 */
export function calculateOverallScore(
  embedding: number | null,
  fuzzScores: { s1: number | null; s2: number | null; s3: number | null },
  detectionScores: { s1: number | null; s2: number | null; s3: number | null },
  globalStats: Record<string, MetricNormalizationStats>
): number | null {
  const normalizedScores: (number | null)[] = []

  // Normalize embedding
  if (embedding !== null && globalStats.embedding) {
    normalizedScores.push(normalizeScore(embedding, globalStats.embedding))
  }

  // Normalize fuzz (average across scorers first)
  const fuzzAvg = averageNonNull([fuzzScores.s1, fuzzScores.s2, fuzzScores.s3])
  if (fuzzAvg !== null && globalStats.fuzz) {
    normalizedScores.push(normalizeScore(fuzzAvg, globalStats.fuzz))
  }

  // Normalize detection (average across scorers first)
  const detectionAvg = averageNonNull([detectionScores.s1, detectionScores.s2, detectionScores.s3])
  if (detectionAvg !== null && globalStats.detection) {
    normalizedScores.push(normalizeScore(detectionAvg, globalStats.detection))
  }

  // Average the normalized scores
  return averageNonNull(normalizedScores)
}

/**
 * Calculate overall consistency from 4 consistency types (minimum value)
 *
 * Consistency types:
 * 1. LLM Scorer consistency (average of fuzz and detection)
 * 2. Within-explanation metric consistency
 * 3. Cross-explanation score consistency (average of embedding, fuzz, detection)
 * 4. LLM Explainer consistency
 *
 * @param row - Feature table row
 * @param explainerId - Explainer ID
 * @returns Overall consistency value (0-1) or null if no consistency data
 */
export function calculateOverallConsistency(
  row: FeatureTableRow,
  explainerId: string
): number | null {
  const explainerData = row.explainers[explainerId]
  if (!explainerData) return null

  const consistencyValues: (number | null)[] = []

  // 1. LLM Scorer consistency (average of fuzz and detection)
  consistencyValues.push(extractScorerConsistency(explainerData))

  // 2. Within-explanation metric consistency
  if (explainerData.metric_consistency) {
    consistencyValues.push(explainerData.metric_consistency.value)
  }

  // 3. Cross-explanation score consistency (average of embedding, fuzz, detection)
  consistencyValues.push(extractCrossExplainerConsistency(explainerData))

  // 4. LLM Explainer consistency
  if (explainerData.explainer_consistency) {
    consistencyValues.push(explainerData.explainer_consistency.value)
  }

  // Return minimum of all consistency values
  const validValues = consistencyValues.filter(v => v !== null) as number[]
  if (validValues.length === 0) return null
  return Math.min(...validValues)
}

// ============================================================================
// SCORE CIRCLE VISUALIZATION (Z-SCORE COLORING)
// ============================================================================

export interface ScoreCircleData {
  value: number | null
  normalizedScore: number  // z-score
  color: string
  scorerId?: 's1' | 's2' | 's3'
}

/**
 * Calculate z-score using backend-provided global statistics
 *
 * @param value - Raw score value
 * @param mean - Global mean for this metric
 * @param std - Global standard deviation for this metric
 * @returns Z-score (number of standard deviations from mean)
 */
export function calculateZScore(
  value: number,
  mean: number,
  std: number
): number {
  // Handle edge case: if std is 0, all values are the same
  if (std === 0 || isNaN(std)) {
    return 0
  }
  return (value - mean) / std
}

/**
 * Map z-score to color using diverging scale (blue → white → red)
 *
 * Color encoding:
 * - Blue (#3b82f6): Below average (z < -1)
 * - Light gray (#e5e7eb): Average (z ≈ 0)
 * - Red (#ef4444): Above average (z > 1)
 *
 * @param zScore - Z-score value
 * @returns RGB color string
 */
export function getScoreCircleColor(zScore: number): string {
  // Create diverging color scale
  // Domain: [-2, 0, 2] with clamping for outliers
  const colorScale = scaleLinear<string>()
    .domain([-2, 0, 2])
    .range(['#3b82f6', '#e5e7eb', '#ef4444'])  // Blue → Light Gray → Red
    .clamp(true)  // Clamp values outside domain

  return colorScale(zScore)
}

// ============================================================================
// TABLE SORTING (CONSOLIDATED FROM table-sort-utils.ts)
// ============================================================================

/**
 * Calculate average overall score across all explainers for a feature
 *
 * @param feature - Feature row
 * @param globalStats - Global normalization statistics
 * @returns Average overall score or null
 */
function calculateAvgOverallScore(
  feature: FeatureTableRow,
  globalStats: Record<string, MetricNormalizationStats> | undefined
): number | null {
  if (!globalStats) return null

  const explainerIds = Object.keys(feature.explainers)
  const scores: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateOverallScore(
      explainerData.embedding,
      explainerData.fuzz,
      explainerData.detection,
      globalStats
    )

    scores.push(score)
  }

  return averageNonNull(scores)
}

/**
 * Calculate minimum overall consistency across all explainers for a feature
 *
 * @param feature - Feature row
 * @returns Minimum overall consistency or null
 */
function calculateMinOverallConsistency(
  feature: FeatureTableRow
): number | null {
  const explainerIds = Object.keys(feature.explainers)
  const consistencies: (number | null)[] = []

  for (const explainerId of explainerIds) {
    consistencies.push(calculateOverallConsistency(feature, explainerId))
  }

  const validConsistencies = consistencies.filter(c => c !== null) as number[]
  if (validConsistencies.length === 0) return null
  return Math.min(...validConsistencies)
}

/**
 * Sort features based on simplified sort configuration
 *
 * Supports sorting by:
 * - featureId: Sort by feature ID number
 * - overallScore: Sort by overall score across all explainers
 * - overallConsistency: Sort by overall consistency across all explainers
 * - llm_scorer_consistency: Sort by LLM Scorer consistency
 * - within_explanation_score: Sort by Within-explanation score consistency
 * - cross_explanation_score: Sort by Cross-explanation score consistency
 * - llm_explainer_consistency: Sort by LLM Explainer consistency
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort key
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (global stats, explainer IDs)
 * @returns Sorted copy of features array
 */
export function sortFeatures(
  features: FeatureTableRow[],
  sortBy: 'featureId' | 'overallScore' | 'overallConsistency' | string | null,
  sortDirection: 'asc' | 'desc' | null,
  tableData: { explainer_ids?: string[]; global_stats?: Record<string, MetricNormalizationStats> } | null
): FeatureTableRow[] {
  // If no sort config or no features, return as-is
  if (!sortBy || !sortDirection || !features || features.length === 0) {
    return features
  }

  // Create a copy to avoid mutating original
  const sortedFeatures = [...features]

  sortedFeatures.sort((a, b) => {
    if (sortBy === 'featureId') {
      // Sort by feature ID (numeric)
      return sortDirection === 'asc'
        ? a.feature_id - b.feature_id
        : b.feature_id - a.feature_id
    }

    if (sortBy === 'overallScore') {
      // Calculate overall score across all explainers
      const overallScoreA = calculateAvgOverallScore(a, tableData?.global_stats)
      const overallScoreB = calculateAvgOverallScore(b, tableData?.global_stats)
      return compareValues(overallScoreA, overallScoreB, sortDirection)
    }

    if (sortBy === 'overallConsistency') {
      // Calculate overall consistency across all explainers
      const overallConsistencyA = calculateMinOverallConsistency(a)
      const overallConsistencyB = calculateMinOverallConsistency(b)
      return compareValues(overallConsistencyA, overallConsistencyB, sortDirection)
    }

    // Individual consistency metric sorting
    if (sortBy === 'llm_scorer_consistency') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'llm_scorer_consistency', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'llm_scorer_consistency', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'within_explanation_score') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'within_explanation_score', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'within_explanation_score', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'cross_explanation_score') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'cross_explanation_score', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'cross_explanation_score', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'llm_explainer_consistency') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'llm_explainer_consistency', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'llm_explainer_consistency', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    return 0
  })

  return sortedFeatures
}
