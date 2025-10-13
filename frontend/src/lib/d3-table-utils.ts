/**
 * D3 Table Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for table data transformation and calculations.
 */

import type { ScorerScoreSet, ExplainerScoreData, FeatureTableRow } from '../types'

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
      // Row 1: Explainer name (spans 7 columns)
      row1.push({
        label: getExplainerDisplayName(explainerId),
        colSpan: 7,
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

      // Fuzz (3 columns)
      row2.push({
        label: 'Fuzz',
        colSpan: 3,
        rowSpan: 1,
        type: 'metric',
        explainerId,
        metricType: 'fuzz'
      })

      // Detection (3 columns)
      row2.push({
        label: 'Detection',
        colSpan: 3,
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

      // Scorer names for fuzz (use short names for display, full names for hover)
      for (let i = 0; i < 3; i++) {
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

      // Scorer names for detection (use short names for display, full names for hover)
      for (let i = 0; i < 3; i++) {
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
 *   [llama_embedding, llama_fuzz_s1, llama_fuzz_s2, llama_fuzz_s3,
 *    llama_det_s1, llama_det_s2, llama_det_s3, ...]
 *
 * When isAveraged = true (2+ explainers):
 *   [llama_embedding, llama_fuzz_avg, llama_det_avg,
 *    qwen_embedding, qwen_fuzz_avg, qwen_det_avg, ...]
 *
 * @param row - Feature table row
 * @param explainerIds - Array of explainer IDs in display order
 * @param isAveraged - Whether scores are averaged across scorers
 * @returns Array of score values in column order
 */
export function extractRowScores(
  row: FeatureTableRow,
  explainerIds: string[],
  isAveraged: boolean = false
): (number | null)[] {
  const scores: (number | null)[] = []

  for (const explainerId of explainerIds) {
    const explainerData = row.explainers[explainerId]

    if (!explainerData) {
      // Fill with nulls if explainer data is missing
      if (isAveraged) {
        scores.push(null, null, null)  // embedding, fuzz_avg, detection_avg
      } else {
        scores.push(null, null, null, null, null, null, null)  // embedding + 3 fuzz + 3 detection
      }
      continue
    }

    if (isAveraged) {
      // Averaged mode: 3 columns per explainer
      scores.push(explainerData.embedding)
      scores.push(explainerData.fuzz.s1)  // s1 contains the average
      scores.push(explainerData.detection.s1)  // s1 contains the average
    } else {
      // Individual scorer mode: 7 columns per explainer
      // Embedding
      scores.push(explainerData.embedding)

      // Fuzz s1, s2, s3
      scores.push(explainerData.fuzz.s1)
      scores.push(explainerData.fuzz.s2)
      scores.push(explainerData.fuzz.s3)

      // Detection s1, s2, s3
      scores.push(explainerData.detection.s1)
      scores.push(explainerData.detection.s2)
      scores.push(explainerData.detection.s3)
    }
  }

  return scores
}
