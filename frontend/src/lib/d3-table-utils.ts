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

/**
 * Get short display name for LLM scorer (same logic as FlowPanel)
 * @param fullName - Full scorer name (e.g., "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4")
 * @returns Short name (e.g., "Llama")
 */
export function getScorerDisplayName(fullName: string): string {
  if (fullName.includes('Llama')) return 'Llama'
  if (fullName.includes('Qwen')) return 'Qwen'
  if (fullName.includes('openai') || fullName.includes('gpt')) return 'OpenAI'
  return fullName.split('/').pop() || fullName
}

// ============================================================================
// SCORE FORMATTING
// ============================================================================

/**
 * Format score value to 3 decimal places or '-' if null
 */
export function formatTableScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '-'
  }
  return score.toFixed(3)
}


// ============================================================================
// HEADER STRUCTURE GENERATION
// ============================================================================

/**
 * Extract scores in metric-first order (for cross-explanation view)
 *
 * Order: [emb_llama, emb_qwen, fuzz_llama, fuzz_qwen, det_llama, det_qwen, ...]
 *
 * @param row - Feature table row
 * @param explainerIds - Array of explainer IDs in display order
 * @param isAveraged - Whether scores are averaged
 * @returns Array of score values in metric-first order
 */
export function extractRowScoresMetricFirst(
  row: FeatureTableRow,
  explainerIds: string[],
  _isAveraged: boolean = true
): (number | null)[] {
  const scores: (number | null)[] = []

  // For each metric, iterate through all explainers
  const metrics: Array<'embedding' | 'fuzz' | 'detection'> = ['embedding', 'fuzz', 'detection']

  for (const metric of metrics) {
    for (const explainerId of explainerIds) {
      const explainerData = row.explainers[explainerId]

      if (!explainerData) {
        scores.push(null)
        continue
      }

      if (metric === 'embedding') {
        scores.push(explainerData.embedding)
      } else if (metric === 'fuzz') {
        scores.push(explainerData.fuzz.s1) // s1 contains average when averaged
      } else if (metric === 'detection') {
        scores.push(explainerData.detection.s1) // s1 contains average when averaged
      }
    }
  }

  return scores
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
  if (!explainerData) {
    return null
  }

  if (metricType === 'embedding') {
    return explainerData.embedding
  }

  if (metricType === 'fuzz') {
    if (scorerId) {
      return explainerData.fuzz[scorerId]
    } else {
      // No scorerId specified - return average of all available scorers
      const values: number[] = []
      if (explainerData.fuzz.s1 !== null) values.push(explainerData.fuzz.s1)
      if (explainerData.fuzz.s2 !== null) values.push(explainerData.fuzz.s2)
      if (explainerData.fuzz.s3 !== null) values.push(explainerData.fuzz.s3)
      if (values.length === 0) return null
      return values.reduce((sum, val) => sum + val, 0) / values.length
    }
  }

  if (metricType === 'detection') {
    if (scorerId) {
      return explainerData.detection[scorerId]
    } else {
      // No scorerId specified - return average of all available scorers
      const values: number[] = []
      if (explainerData.detection.s1 !== null) values.push(explainerData.detection.s1)
      if (explainerData.detection.s2 !== null) values.push(explainerData.detection.s2)
      if (explainerData.detection.s3 !== null) values.push(explainerData.detection.s3)
      if (values.length === 0) return null
      return values.reduce((sum, val) => sum + val, 0) / values.length
    }
  }

  return null
}

/**
 * Extract all score values for a feature row in column order
 *
 * When isAveraged = false (1 explainer):
 *   [llama_embedding, llama_fuzz_s1, llama_fuzz_s2, ...,
 *    llama_det_s1, llama_det_s2, ...]
 *   Number of fuzz/detection columns = numScorers
 *
 * When isAveraged = true (2+ explainers):
 *   [llama_embedding, llama_fuzz_avg, llama_det_avg,
 *    qwen_embedding, qwen_fuzz_avg, qwen_det_avg, ...]
 *
 * @param row - Feature table row
 * @param explainerIds - Array of explainer IDs in display order
 * @param isAveraged - Whether scores are averaged across scorers
 * @param numScorers - Number of scorers (only used when isAveraged = false)
 * @returns Array of score values in column order
 */
export function extractRowScores(
  row: FeatureTableRow,
  explainerIds: string[],
  isAveraged: boolean = false,
  numScorers: number = 3
): (number | null)[] {
  const scores: (number | null)[] = []
  const scorerKeys: Array<'s1' | 's2' | 's3'> = ['s1', 's2', 's3']

  for (const explainerId of explainerIds) {
    const explainerData = row.explainers[explainerId]

    if (!explainerData) {
      // Fill with nulls if explainer data is missing
      if (isAveraged) {
        scores.push(null, null, null)  // embedding, fuzz_avg, detection_avg
      } else {
        const nullCount = 1 + (numScorers * 2)  // embedding + numScorers fuzz + numScorers detection
        for (let i = 0; i < nullCount; i++) {
          scores.push(null)
        }
      }
      continue
    }

    if (isAveraged) {
      // Averaged mode: 3 columns per explainer
      scores.push(explainerData.embedding)
      scores.push(explainerData.fuzz.s1)  // s1 contains the average
      scores.push(explainerData.detection.s1)  // s1 contains the average
    } else {
      // Individual scorer mode: dynamic columns based on numScorers
      // Embedding
      scores.push(explainerData.embedding)

      // Fuzz scores (s1, s2, s3 based on numScorers)
      for (let i = 0; i < numScorers; i++) {
        scores.push(explainerData.fuzz[scorerKeys[i]])
      }

      // Detection scores (s1, s2, s3 based on numScorers)
      for (let i = 0; i < numScorers; i++) {
        scores.push(explainerData.detection[scorerKeys[i]])
      }
    }
  }

  return scores
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
// CONSISTENCY SCORE EXTRACTION
// ============================================================================

/**
 * Get consistency score for a specific table cell
 *
 * @param row - Feature table row
 * @param explainerId - Explainer ID (llama, qwen, openai)
 * @param metricType - Metric type (embedding, fuzz, detection)
 * @param consistencyType - Type of consistency to retrieve
 * @returns Consistency score value (0-1) or null if not available
 */
export function getConsistencyForCell(
  row: FeatureTableRow,
  explainerId: string,
  metricType: 'embedding' | 'fuzz' | 'detection',
  consistencyType: string
): number | null {
  const explainerData = row.explainers[explainerId]
  if (!explainerData) {
    return null
  }

  // No consistency coloring
  if (consistencyType === 'none') {
    return null
  }

  // LLM Scorer Consistency: Coefficient of variation across scorers for a metric
  if (consistencyType === 'llm_scorer_consistency') {
    if (!explainerData.scorer_consistency) {
      return null
    }

    // Only fuzz and detection have scorer consistency
    if (metricType === 'fuzz' && explainerData.scorer_consistency.fuzz) {
      return explainerData.scorer_consistency.fuzz.value
    }
    if (metricType === 'detection' && explainerData.scorer_consistency.detection) {
      return explainerData.scorer_consistency.detection.value
    }

    return null
  }

  // Within-explanation Scoring Metric Consistency: Normalized std across metrics
  if (consistencyType === 'within_explanation_score') {
    if (!explainerData.metric_consistency) {
      return null
    }
    return explainerData.metric_consistency.value
  }

  // Cross-explanation Score Consistency: Inverse CV of each metric across explainers
  if (consistencyType === 'cross_explanation_score') {
    if (!explainerData.cross_explainer_metric_consistency) {
      return null
    }
    // Extract consistency for the specific metric
    const consistencyScore = explainerData.cross_explainer_metric_consistency[metricType]
    return consistencyScore?.value || null
  }

  // LLM Explainer Consistency: Average pairwise cosine similarity between explainers
  if (consistencyType === 'llm_explainer_consistency') {
    if (!explainerData.explainer_consistency) {
      return null
    }
    return explainerData.explainer_consistency.value
  }

  return null
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

  const values: number[] = []

  for (const explainerId of explainerIds) {
    const explainerData = row.explainers[explainerId]
    if (!explainerData) continue

    if (consistencyType === 'llm_scorer_consistency') {
      // Average fuzz and detection scorer consistency
      if (explainerData.scorer_consistency?.fuzz) {
        values.push(explainerData.scorer_consistency.fuzz.value)
      }
      if (explainerData.scorer_consistency?.detection) {
        values.push(explainerData.scorer_consistency.detection.value)
      }
    } else if (consistencyType === 'within_explanation_score') {
      // Within-explanation metric consistency
      if (explainerData.metric_consistency) {
        values.push(explainerData.metric_consistency.value)
      }
    } else if (consistencyType === 'cross_explanation_score') {
      // Average across all three metrics
      if (explainerData.cross_explainer_metric_consistency) {
        const cem = explainerData.cross_explainer_metric_consistency
        if (cem.embedding) values.push(cem.embedding.value)
        if (cem.fuzz) values.push(cem.fuzz.value)
        if (cem.detection) values.push(cem.detection.value)
      }
    } else if (consistencyType === 'llm_explainer_consistency') {
      // LLM explainer semantic consistency
      if (explainerData.explainer_consistency) {
        values.push(explainerData.explainer_consistency.value)
      }
    }
  }

  // Return average of collected values, or null if no values
  if (values.length === 0) return null
  return values.reduce((sum, val) => sum + val, 0) / values.length
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
  const values: number[] = []

  // Normalize embedding
  if (embedding !== null && globalStats.embedding) {
    const { min, max } = globalStats.embedding
    const range = max - min
    if (range > 0) {
      const normalized = (embedding - min) / range
      values.push(normalized)
    }
  }

  // Normalize fuzz (average across scorers first)
  const fuzzValues = [fuzzScores.s1, fuzzScores.s2, fuzzScores.s3].filter(v => v !== null) as number[]
  if (fuzzValues.length > 0 && globalStats.fuzz) {
    const fuzzAvg = fuzzValues.reduce((sum, v) => sum + v, 0) / fuzzValues.length
    const { min, max } = globalStats.fuzz
    const range = max - min
    if (range > 0) {
      const normalized = (fuzzAvg - min) / range
      values.push(normalized)
    }
  }

  // Normalize detection (average across scorers first)
  const detectionValues = [detectionScores.s1, detectionScores.s2, detectionScores.s3].filter(v => v !== null) as number[]
  if (detectionValues.length > 0 && globalStats.detection) {
    const detectionAvg = detectionValues.reduce((sum, v) => sum + v, 0) / detectionValues.length
    const { min, max } = globalStats.detection
    const range = max - min
    if (range > 0) {
      const normalized = (detectionAvg - min) / range
      values.push(normalized)
    }
  }

  // Average the normalized scores
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
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

  const consistencyValues: number[] = []

  // 1. LLM Scorer consistency (average of fuzz and detection)
  if (explainerData.scorer_consistency) {
    const scorerValues: number[] = []
    if (explainerData.scorer_consistency.fuzz) {
      scorerValues.push(explainerData.scorer_consistency.fuzz.value)
    }
    if (explainerData.scorer_consistency.detection) {
      scorerValues.push(explainerData.scorer_consistency.detection.value)
    }
    if (scorerValues.length > 0) {
      const avgScorerConsistency = scorerValues.reduce((sum, v) => sum + v, 0) / scorerValues.length
      consistencyValues.push(avgScorerConsistency)
    }
  }

  // 2. Within-explanation metric consistency
  if (explainerData.metric_consistency) {
    consistencyValues.push(explainerData.metric_consistency.value)
  }

  // 3. Cross-explanation score consistency (average of embedding, fuzz, detection)
  if (explainerData.cross_explainer_metric_consistency) {
    const crossValues: number[] = []
    if (explainerData.cross_explainer_metric_consistency.embedding) {
      crossValues.push(explainerData.cross_explainer_metric_consistency.embedding.value)
    }
    if (explainerData.cross_explainer_metric_consistency.fuzz) {
      crossValues.push(explainerData.cross_explainer_metric_consistency.fuzz.value)
    }
    if (explainerData.cross_explainer_metric_consistency.detection) {
      crossValues.push(explainerData.cross_explainer_metric_consistency.detection.value)
    }
    if (crossValues.length > 0) {
      const avgCrossConsistency = crossValues.reduce((sum, v) => sum + v, 0) / crossValues.length
      consistencyValues.push(avgCrossConsistency)
    }
  }

  // 4. LLM Explainer consistency
  if (explainerData.explainer_consistency) {
    consistencyValues.push(explainerData.explainer_consistency.value)
  }

  // Return minimum of all consistency values
  if (consistencyValues.length === 0) return null
  return Math.min(...consistencyValues)
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

/**
 * Extract circle data for a specific table cell
 *
 * This function determines which circles to show based on:
 * - Column header structure (which explainer + metric)
 * - Averaged mode (1 circle for embedding, 3 circles for fuzz/detection)
 * - Individual mode (1 circle per cell)
 *
 * @param row - Feature table row
 * @param colIndex - Column index in table
 * @param headerStructure - Header structure for column mapping
 * @param globalStats - Global normalization statistics
 * @param isAveraged - Whether scores are averaged
 * @returns Array of circle data (1 or 3 circles)
 */
export function extractCellScoreCircles(
  row: FeatureTableRow,
  colIndex: number,
  headerStructure: HeaderStructure,
  globalStats: Record<string, MetricNormalizationStats>,
  isAveraged: boolean
): ScoreCircleData[] {
  // Determine which header cell this column belongs to
  const headerCell = !isAveraged && headerStructure.row3.length > 0
    ? headerStructure.row3[colIndex]  // Individual mode: use row3
    : headerStructure.row2[colIndex]   // Averaged mode: use row2

  if (!headerCell || !headerCell.explainerId || !headerCell.metricType) {
    return []
  }

  const explainerId = headerCell.explainerId
  const metricType = headerCell.metricType
  const explainerData = row.explainers[explainerId]

  if (!explainerData) {
    return []
  }

  // Get global stats for this metric type
  const stats = globalStats[metricType]
  if (!stats) {
    return []
  }

  const circles: ScoreCircleData[] = []

  if (isAveraged) {
    // Averaged mode: Show 3 circles for fuzz/detection (one per scorer), 1 for embedding
    if (metricType === 'embedding') {
      // Embedding: single circle
      const value = explainerData.embedding
      if (value !== null) {
        const zScore = calculateZScore(value, stats.mean, stats.std)
        circles.push({
          value,
          normalizedScore: zScore,
          color: getScoreCircleColor(zScore)
        })
      }
    } else if (metricType === 'fuzz' || metricType === 'detection') {
      // Fuzz/Detection: 3 circles (s1, s2, s3)
      // Note: In averaged mode, backend stores individual scores in s1/s2/s3 even though display shows average
      const scorerSet = metricType === 'fuzz' ? explainerData.fuzz : explainerData.detection
      const scorerIds: Array<'s1' | 's2' | 's3'> = ['s1', 's2', 's3']

      for (const scorerId of scorerIds) {
        const value = scorerSet[scorerId]
        if (value !== null) {
          const zScore = calculateZScore(value, stats.mean, stats.std)
          circles.push({
            value,
            normalizedScore: zScore,
            color: getScoreCircleColor(zScore),
            scorerId
          })
        }
      }
    }
  } else {
    // Individual mode: single circle per cell
    let value: number | null = null

    if (metricType === 'embedding') {
      value = explainerData.embedding
    } else if (metricType === 'fuzz' && headerCell.scorerId) {
      value = explainerData.fuzz[headerCell.scorerId]
    } else if (metricType === 'detection' && headerCell.scorerId) {
      value = explainerData.detection[headerCell.scorerId]
    }

    if (value !== null) {
      const zScore = calculateZScore(value, stats.mean, stats.std)
      circles.push({
        value,
        normalizedScore: zScore,
        color: getScoreCircleColor(zScore),
        scorerId: headerCell.scorerId
      })
    }
  }

  return circles
}
