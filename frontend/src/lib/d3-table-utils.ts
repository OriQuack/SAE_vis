/**
 * D3 Table Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for table data transformation and calculations.
 */

import { scaleLinear } from 'd3-scale'
import type { FeatureTableRow } from '../types'

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
  metricType?: 'embedding' | 'fuzz' | 'detection'
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
 *   Row 1: Explainer names (each spanning 7 columns)
 *   Row 2: Metric names (Embedding: 1 col, Fuzz: 3 cols, Detection: 3 cols)
 *   Row 3: Scorer labels (empty, scorer1/scorer2/scorer3, scorer1/scorer2/scorer3)
 *
 * When isAveraged = true (2+ explainers):
 *   Row 1: Explainer names (each spanning 3 columns)
 *   Row 2: Metric names (Embedding: 1 col, Fuzz: 1 col, Detection: 1 col)
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
      // Row 1: Explainer name (spans 3 columns)
      row1.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: 3,
        rowSpan: 1,
        type: 'explainer',
        explainerId
      })

      // Row 2: Metric names (1 column each) - abbreviated for multiple LLMs
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
      const totalColumns = 1 + (numScorers * 2)  // 1 embedding + numScorers fuzz + numScorers detection

      // Row 1: Explainer name (spans all columns)
      row1.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: totalColumns,
        rowSpan: 1,
        type: 'explainer',
        explainerId
      })

      // Row 2: Metric names - full names for single LLM
      // Embedding (1 column)
      row2.push({
        label: 'Embedding',
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
    label: 'Embedding',
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
  for (let metricIdx = 0; metricIdx < 3; metricIdx++) {
    for (const explainerId of explainerIds) {
      row2.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: 1,
        rowSpan: 1,
        type: 'explainer',
        explainerId
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
 * @param scorerId - Scorer ID (s1, s2, s3) - only for fuzz/detection
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

  if (metricType === 'fuzz' && scorerId) {
    return explainerData.fuzz[scorerId]
  }

  if (metricType === 'detection' && scorerId) {
    return explainerData.detection[scorerId]
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
 * @returns Layout calculations for rendering
 */
export function calculateColorBarLayout(
  containerWidth: number = 400,
  barHeight: number = 12
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
    gradientStops: [
      { offset: '0%', color: '#ef4444' },   // Red (low consistency at 0)
      { offset: '50%', color: '#eab308' },  // Yellow (medium)
      { offset: '100%', color: '#22c55e' }  // Green (high consistency at 1)
    ]
  }
}

/**
 * Get color for a consistency value (0-1)
 *
 * Uses same gradient as the visualization color bar.
 * Can be used for coloring table cells, charts, etc.
 *
 * @param value - Consistency value between 0 and 1
 * @returns RGB color string (e.g., "#22c55e")
 */
export function getConsistencyColor(value: number): string {
  // Clamp value between 0 and 1
  const clampedValue = Math.max(0, Math.min(1, value))

  // Create D3 color scale
  // 0 = red (low consistency), 0.5 = yellow, 1 = green (high consistency)
  const colorScale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range(['#ef4444', '#eab308', '#22c55e'])  // Red -> Yellow -> Green

  return colorScale(clampedValue)
}

/**
 * Get gradient stops for consistency color scale
 *
 * Returns array of gradient stops that can be used in SVG linearGradient
 *
 * @returns Array of gradient stop objects
 */
export function getConsistencyGradientStops(): Array<{ offset: string; color: string }> {
  return [
    { offset: '0%', color: '#ef4444' },   // Red (low consistency at 0)
    { offset: '50%', color: '#eab308' },  // Yellow (medium)
    { offset: '100%', color: '#22c55e' }  // Green (high consistency at 1)
  ]
}
