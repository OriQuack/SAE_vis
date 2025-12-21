// ============================================================================
// CAUSE METRIC BARS DETAIL
// Detailed bar chart visualization for root cause metric scores
// ============================================================================
// Displays individual metrics as horizontal bars with full name labels.
// - Quality Score (black)
// - Activation Example Similarity (Noisy Activation color)
// - LLM Explainer Semantic Similarity (Noisy Activation color)
// - Detection (Context Miss color)
// - Fuzz (Pattern Miss color)
// This is the detailed version - for compact inline bars see CauseMetricBars in Indicators.tsx

import React from 'react'
import { TAG_CATEGORY_CAUSE, NEUTRAL_ICON_COLORS } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'
import '../styles/CauseMetricBarsDetail.css'

// ============================================================================
// TYPES
// ============================================================================

export interface CauseMetricBarsDetailProps {
  /** Cause metric scores to display */
  scores: CauseMetricScores | null
  /** Quality score from best explanation */
  qualityScore?: number
  /** Optional className for container */
  className?: string
}

interface MetricRow {
  key: string
  label: string
  score: number | null
  color: string
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CauseMetricBarsDetail - Displays cause metric scores as horizontal bars with details
 *
 * Shows five metric rows:
 * - Quality Score (black)
 * - Activation Example Similarity (Noisy Activation color)
 * - LLM Explainer Semantic Similarity (Noisy Activation color)
 * - Detection (Missed Context color)
 * - Fuzz (Missed N-gram color)
 */
export const CauseMetricBarsDetail: React.FC<CauseMetricBarsDetailProps> = ({
  scores,
  qualityScore,
  className = ''
}) => {
  // Get colors from tag system for each metric
  const noisyColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const contextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Context Miss') || '#9ca3af'
  const ngramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Pattern Miss') || '#9ca3af'

  if (!scores) {
    return (
      <div className={`cause-metric-bars-detail ${className}`.trim()}>
        <div className="cause-metric-bars-detail__placeholder">No scores available</div>
      </div>
    )
  }

  // Define all metric rows including quality score
  const metricRows: MetricRow[] = [
    ...(qualityScore !== undefined ? [{
      key: 'qualityScore',
      label: 'Quality Score',
      score: qualityScore,
      color: NEUTRAL_ICON_COLORS.ICON_STROKE  // Dark gray (#475569)
    }] : []),
    {
      key: 'intraFeatureSim',
      label: 'Activation Example Sim.',
      score: scores.intraFeatureSim,
      color: noisyColor
    },
    {
      key: 'explainerSemanticSim',
      label: 'LLM Explainer Semantic Sim.',
      score: scores.explainerSemanticSim,
      color: noisyColor
    },
    {
      key: 'detection',
      label: 'Detection Score',
      score: scores.detection,
      color: contextColor
    },
    {
      key: 'fuzz',
      label: 'Fuzz Score',
      score: scores.fuzz,
      color: ngramColor
    }
  ]

  // Find minimum score (excluding quality score) to indicate root cause
  const causeMetrics = metricRows.filter(m => m.key !== 'qualityScore' && m.score !== null)
  const minMetric = causeMetrics.length > 0
    ? causeMetrics.reduce((min, m) => (m.score! < min.score! ? m : min))
    : null

  return (
    <div className={`cause-metric-bars-detail ${className}`.trim()}>
      {metricRows.map(({ key, label, score, color }) => (
        <div key={key} className="cause-metric-bars-detail__row">
          <span className="cause-metric-bars-detail__label">{label}</span>
          <div className="cause-metric-bars-detail__bars">
            <div className="cause-metric-bars-detail__bar-row">
              <div
                className="cause-metric-bars-detail__bar-container"
                data-tooltip={`${label}: ${score !== null ? score.toFixed(3) : 'N/A'}`}
              >
                <div
                  className="cause-metric-bars-detail__bar"
                  style={{
                    width: score !== null ? `${score * 100}%` : '0%',
                    backgroundColor: color
                  }}
                />
              </div>
            </div>
          </div>
          <span className="cause-metric-bars-detail__score">
            {score !== null ? score.toFixed(2) : '—'}
          </span>
        </div>
      ))}
      {minMetric && (
        <div className="cause-metric-bars-detail__indicator">
          ▼ min = root cause
        </div>
      )}
    </div>
  )
}

export default CauseMetricBarsDetail
