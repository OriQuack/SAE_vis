import { scaleLinear } from 'd3-scale'
import type { FeatureTableRow, MetricNormalizationStats, ConsistencyType } from '../types'
import { CONSISTENCY_COLORS } from './constants'

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
// COLUMN WIDTH CALCULATION
// ============================================================================

/**
 * Calculate equal column width for all columns
 *
 * @param containerWidth - Total container width in pixels
 * @param numExplainers - Number of explainers (typically 3)
 * @returns Column width in pixels
 */
export function calculateColumnWidth(containerWidth: number, numExplainers: number = 3): number {
  const totalColumns = numExplainers * 7  // 7 columns per explainer (1 embedding + 3 fuzz + 3 detection)
  return containerWidth / totalColumns
}

// ============================================================================
// HEADER STRUCTURE GENERATION
// ============================================================================

/**
 * Build header structure for table (2-row or 3-row based on averaging)
 *
 * When isAveraged = false (1 explainer):
 *   Row 1: Explainer names (each spanning 8 columns)
 *   Row 2: Metric names (Explanation: 1 col, Embedding: 1 col, Fuzz: 3 cols, Detection: 3 cols)
 *   Row 3: Scorer labels (empty, empty, scorer1/scorer2/scorer3, scorer1/scorer2/scorer3)
 *
 * When isAveraged = true (2+ explainers):
 *   Row 1: Explainer names (each spanning 4 columns)
 *   Row 2: Metric names (Explanation: 1 col, Embedding: 1 col, Fuzz: 1 col, Detection: 1 col)
 *   Row 3: [] (empty)
 *
 * @param explainerIds - Array of explainer IDs (e.g., ['llama', 'qwen', 'openai'])
 * @param isAveraged - Whether scores are averaged across scorers
 * @param scorerIds - Array of scorer IDs (e.g., ['scorer1', 'scorer2', 'scorer3']) for row 3 labels
 * @returns Header structure with 2 or 3 rows
 */
export function buildHeaderStructure(
  explainerIds: string[],
  isAveraged: boolean = false,
  scorerIds: string[] = []
): HeaderStructure {
  const row1: HeaderCell[] = []
  const row2: HeaderCell[] = []
  const row3: HeaderCell[] = []

  for (const explainerId of explainerIds) {
    if (isAveraged) {
      // 2-row header: Averaged mode (2+ explainers)
      // Row 1: Explainer name (spans 4 columns)
      row1.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: 4,
        rowSpan: 1,
        type: 'explainer',
        explainerId
      })

      // Row 2: Metric names (1 column each) - abbreviated for multiple LLMs
      // Add explanation column first
      row2.push({
        label: 'Expl.',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'explanation'
      })

      row2.push({
        label: 'Emb.',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'embedding'
      })

      row2.push({
        label: 'Fuzz',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'fuzz'
      })

      row2.push({
        label: 'Det.',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'detection'
      })

      // Row 3: Empty (no scorers shown)
    } else {
      // 3-row header: Individual scorer mode (1 explainer)
      const numScorers = scorerIds.length
      const totalColumns = 1 + 1 + (numScorers * 2)  // 1 explanation + 1 embedding + numScorers fuzz + numScorers detection

      // Row 1: Explainer name (spans all columns)
      row1.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: totalColumns,
        rowSpan: 1,
        type: 'explainer',
        explainerId
      })

      // Row 2: Metric names - abbreviated
      // Explanation (1 column)
      row2.push({
        label: 'Expl.',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'explanation'
      })

      // Embedding (1 column)
      row2.push({
        label: 'Emb.',
        colSpan: 1,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'embedding'
      })

      // Fuzz (dynamic columns based on scorer count)
      row2.push({
        label: 'Fuzz',
        colSpan: numScorers,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'fuzz'
      })

      // Detection (dynamic columns based on scorer count)
      row2.push({
        label: 'Detection',
        colSpan: numScorers,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'detection'
      })

      // Row 3: Scorer labels
      // Empty cell for explanation
      row3.push({
        label: '',
        colSpan: 1,
        rowSpan: 1,
        type: 'scorer',
        explainerId,
        metricType: 'explanation'
      })

      // Empty cell for embedding
      row3.push({
        label: '',
        colSpan: 1,
        rowSpan: 1,
        type: 'scorer',
        explainerId,
        metricType: 'embedding'
      })

      // Scorer names for fuzz (dynamic based on selected scorers)
      for (let i = 0; i < numScorers; i++) {
        const fullName = scorerIds[i] || `S${i + 1}`
        const shortName = getScorerDisplayName(fullName)
        const scorerId = (['s1', 's2', 's3'] as const)[i]
        row3.push({
          label: shortName,
          title: fullName,  // Full name for hover tooltip
          colSpan: 1,
          rowSpan: 1,
          type: 'scorer',
          explainerId,
          metricType: 'fuzz',
          scorerId: scorerId
        })
      }

      // Scorer names for detection (dynamic based on selected scorers)
      for (let i = 0; i < numScorers; i++) {
        const fullName = scorerIds[i] || `S${i + 1}`
        const shortName = getScorerDisplayName(fullName)
        const scorerId = (['s1', 's2', 's3'] as const)[i]
        row3.push({
          label: shortName,
          title: fullName,  // Full name for hover tooltip
          colSpan: 1,
          rowSpan: 1,
          type: 'scorer',
          explainerId,
          metricType: 'detection',
          scorerId: scorerId
        })
      }
    }
  }

  return { row1, row2, row3 }
}

/**
 * Build header structure with metrics first, then explainers (for cross-explanation view)
 *
 * Used when comparing explainers across the same metric (cross-explanation consistency).
 *
 * Row 1: Metric names (Embedding, Fuzz, Detection) - each spanning N explainer columns
 * Row 2: Explainer names (repeated for each metric)
 *
 * @param explainerIds - Array of explainer IDs
 * @param isAveraged - Whether scores are averaged (should be true for this view)
 * @returns Header structure with metrics first
 */
export function buildMetricFirstHeaderStructure(
  explainerIds: string[],
  _isAveraged: boolean = true
): HeaderStructure {
  const row1: HeaderCell[] = []
  const row2: HeaderCell[] = []
  const row3: HeaderCell[] = [] // Empty for this view

  const numExplainers = explainerIds.length

  // Row 1: Metric names (each spanning number of explainers)
  row1.push({
    label: 'Emb.',
    colSpan: numExplainers,
    rowSpan: 1,
    type: 'metric',
    metricType: 'embedding'
  })

  row1.push({
    label: 'Fuzz',
    colSpan: numExplainers,
    rowSpan: 1,
    type: 'metric',
    metricType: 'fuzz'
  })

  row1.push({
    label: 'Detection',
    colSpan: numExplainers,
    rowSpan: 1,
    type: 'metric',
    metricType: 'detection'
  })

  // Row 2: Explainer names (repeated for each metric)
  const metrics: Array<'embedding' | 'fuzz' | 'detection'> = ['embedding', 'fuzz', 'detection']
  for (let metricIdx = 0; metricIdx < 3; metricIdx++) {
    const metricType = metrics[metricIdx]
    for (const explainerId of explainerIds) {
      row2.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: 1,
        rowSpan: 1,
        type: 'explainer',
        explainerId,
        metricType  // Add metricType so consistency lookup works
      })
    }
  }

  return { row1, row2, row3 }
}

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
// TABLE LAYOUT CALCULATION
// ============================================================================

/**
 * Calculate complete table layout including column widths and header structure
 *
 * @param containerWidth - Container width in pixels
 * @param explainerIds - Array of explainer IDs
 * @returns Complete table layout configuration
 */
export function calculateTableLayout(
  containerWidth: number,
  explainerIds: string[]
): TableLayout {
  const numExplainers = explainerIds.length
  const columnWidth = calculateColumnWidth(containerWidth, numExplainers)
  const totalColumns = numExplainers * 7
  const headerStructure = buildHeaderStructure(explainerIds)

  return {
    columnWidth,
    totalColumns,
    headerStructure
  }
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
