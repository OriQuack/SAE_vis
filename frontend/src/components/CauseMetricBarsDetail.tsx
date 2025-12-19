// ============================================================================
// CAUSE METRIC BARS DETAIL
// Detailed bar chart visualization for root cause metric scores
// ============================================================================
// Displays cause metrics (Noisy Activation, Missed Context, Missed N-gram)
// as horizontal bars with labels, component scores, and tooltips.
// The metric with the minimum score is highlighted as the root cause.
// This is the detailed version - for compact inline bars see CauseMetricBars in Indicators.tsx

import React from 'react'
import { TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import type { CauseMetricScores } from '../lib/cause-tagging-utils'
import '../styles/CauseMetricBarsDetail.css'

// ============================================================================
// TYPES
// ============================================================================

export interface CauseMetricBarsDetailProps {
  /** Cause metric scores to display */
  scores: CauseMetricScores | null
  /** Optional className for container */
  className?: string
}

interface MetricComponent {
  key: string
  name: string
  score: number | null
}

interface MetricGroup {
  key: string
  label: string
  aggregateScore: number | null
  color: string
  components: MetricComponent[]
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CauseMetricBarsDetail - Displays cause metric scores as horizontal bars with details
 *
 * Shows three metric groups:
 * - Noisy Activation: Avg(intraFeatureSim, explainerSemanticSim)
 * - Missed Context: Avg(embedding, detection)
 * - Missed N-gram: fuzz
 *
 * Each group displays component scores as stacked horizontal bars with tooltips.
 * The group with the minimum aggregated score is highlighted as the root cause.
 */
export const CauseMetricBarsDetail: React.FC<CauseMetricBarsDetailProps> = ({
  scores,
  className = ''
}) => {
  // Get colors from tag system for each metric
  const noisyColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const contextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'
  const ngramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed N-gram') || '#9ca3af'

  if (!scores) {
    return (
      <div className={`cause-metric-bars-detail ${className}`.trim()}>
        <div className="cause-metric-bars-detail__placeholder">No scores available</div>
      </div>
    )
  }

  // Define metric groups with their component scores
  const metricGroups: MetricGroup[] = [
    {
      key: 'noisyActivation',
      label: 'Noisy Activation',
      aggregateScore: scores.noisyActivation,
      color: noisyColor,
      components: [
        { key: 'intraFeatureSim', name: 'Activation Eample Similarity', score: scores.intraFeatureSim },
        { key: 'explainerSemanticSim', name: 'LLM Explainer Semantic Similarity', score: scores.explainerSemanticSim }
      ]
    },
    {
      key: 'missedContext',
      label: 'Missed Context',
      aggregateScore: scores.missedContext,
      color: contextColor,
      components: [
        { key: 'embedding', name: 'Embedding Score', score: scores.embedding },
        { key: 'detection', name: 'Detection Score', score: scores.detection }
      ]
    },
    {
      key: 'missedNgram',
      label: 'Missed N-gram',
      aggregateScore: scores.missedNgram,
      color: ngramColor,
      components: [
        { key: 'fuzz', name: 'Fuzz Score', score: scores.fuzz }
      ]
    }
  ]

  // Determine minimum aggregated score (root cause)
  const validGroups = metricGroups.filter(g => g.aggregateScore !== null)
  const minKey = validGroups.length > 0
    ? validGroups.reduce((min, g) => (g.aggregateScore! < min.aggregateScore! ? g : min)).key
    : null

  return (
    <div className={`cause-metric-bars-detail ${className}`.trim()}>
      {metricGroups.map(({ key, label, aggregateScore, color, components }) => {
        const isMin = key === minKey
        return (
          <div
            key={key}
            className={`cause-metric-bars-detail__group ${isMin ? 'cause-metric-bars-detail__group--highlighted' : ''}`}
            style={isMin ? { backgroundColor: `${color}40` } : undefined}
          >
            <span className="cause-metric-bars-detail__label">{label}</span>
            <div className="cause-metric-bars-detail__bars">
              {components.map(({ key: compKey, name, score }) => (
                <div key={compKey} className="cause-metric-bars-detail__bar-row">
                  <div
                    className="cause-metric-bars-detail__bar-container"
                    data-tooltip={`${name}: ${score !== null ? score.toFixed(3) : 'N/A'}`}
                  >
                    <div
                      className="cause-metric-bars-detail__bar"
                      style={{
                        width: score !== null ? `${score * 100}%` : '0%',
                        backgroundColor: color,
                        opacity: isMin ? 1 : 0.6
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <span className="cause-metric-bars-detail__score">
              {aggregateScore !== null ? aggregateScore.toFixed(2) : '—'}
            </span>
          </div>
        )
      })}
      {minKey && (
        <div className="cause-metric-bars-detail__indicator">
          ▼ Lowest = Root cause
        </div>
      )}
    </div>
  )
}

export default CauseMetricBarsDetail
