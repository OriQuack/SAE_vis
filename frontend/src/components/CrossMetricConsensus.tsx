import React, { useState } from 'react'
import type { FeatureTableRow, ExplainerScoreData, ScorerScoreSet } from '../types'
import { scoreToColor, METRIC_GRADIENT } from '../lib/color-utils'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import { Tooltip } from './Tooltip'
import '../styles/CrossMetricConsensus.css'

interface CrossMetricConsensusProps {
  explainerIds: string[]
  featureRow: FeatureTableRow | null
}

// Layout constants
const METRICS = ['embedding', 'fuzz', 'detection'] as const
type MetricKey = typeof METRICS[number]
const METRIC_LABELS: Record<MetricKey, string> = {
  embedding: 'Embedding',
  fuzz: 'Fuzz',
  detection: 'Detection',
}

const BAR_MAX_W = 80
const BAR_H = 7
const BAR_GAP = 0
const EXPLAINER_GAP = 6
const LEFT_PAD = 1
const SVG_W = LEFT_PAD + BAR_MAX_W + 1

function avgScorerSet(s: ScorerScoreSet): number | null {
  const vals = [s.s1, s.s2, s.s3].filter((v): v is number => v !== null && v !== undefined)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function getMetricScore(data: ExplainerScoreData, metric: MetricKey): number | null {
  if (metric === 'embedding') return data.embedding ?? null
  if (metric === 'fuzz') return avgScorerSet(data.fuzz)
  return avgScorerSet(data.detection)
}

// Compact inline legend with true continuous gradient
export const CrossMetricLegend: React.FC = React.memo(() => (
  <div className="legend-group">
    <div className="legend-item">
      <span className="legend-label">Metric Score:</span>
    </div>
    <div className="legend-item">
      <span className="legend-range">0</span>
      <span className="cross-metric-consensus__gradient-bar-wrapper">
        <span
          className="cross-metric-consensus__gradient-bar"
          style={{ background: METRIC_GRADIENT }}
        />
        <svg className="cross-metric-consensus__gradient-bar-baseline">
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#B22222" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      </span>
      <span className="legend-range">1</span>
      <span className="legend-hint">(higher = better)</span>
    </div>
    <div className="legend-item" style={{ marginLeft: 4 }}>
      <svg width="6" height="12" style={{ verticalAlign: 'middle' }}>
        <line x1="3" y1="0" x2="3" y2="12" stroke="#B22222" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <span className="legend-range">Random</span>
    </div>
  </div>
))

interface HoverData {
  explainerId: string
  data: ExplainerScoreData
}

const CrossMetricConsensus: React.FC<CrossMetricConsensusProps> = ({ explainerIds, featureRow }) => {
  const hasData = featureRow && explainerIds.length > 0
  const numExplainers = Math.max(explainerIds.length, 1)
  const groupH = METRICS.length * (BAR_H + BAR_GAP) - BAR_GAP
  const totalHeight = numExplainers * groupH + (numExplainers - 1) * EXPLAINER_GAP

  const [hovered, setHovered] = useState<HoverData | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  return (
    <div className="cross-metric-consensus">
      <svg width={SVG_W} height={totalHeight} viewBox={`0 0 ${SVG_W} ${totalHeight}`}>
        {explainerIds.map((eid, ei) => {
          const groupY = ei * (groupH + EXPLAINER_GAP)
          const data = hasData ? featureRow.explainers?.[eid] : undefined

          return (
            <g key={eid} transform={`translate(0, ${groupY})`}
              style={{ cursor: data ? 'pointer' : 'default' }}
              onMouseEnter={(e) => {
                if (!data) return
                setHovered({ explainerId: eid, data })
                setTooltipPos({ x: e.clientX, y: e.clientY })
              }}
              onMouseMove={(e) => {
                if (!data) return
                setTooltipPos({ x: e.clientX, y: e.clientY })
              }}
              onMouseLeave={() => {
                setHovered(null)
                setTooltipPos(null)
              }}
            >
              {METRICS.map((metric, mi) => {
                const score = data ? getMetricScore(data, metric) : null
                const y = mi * (BAR_H + BAR_GAP)
                const barW = score != null ? score * BAR_MAX_W : 0
                const barX = LEFT_PAD

                return (
                  <g key={metric}>
                    {/* Background track */}
                    <rect
                      x={barX} y={y}
                      width={BAR_MAX_W} height={BAR_H}
                      fill="#f3f4f6"
                      stroke="#e5e7eb"
                      strokeWidth={0.5}
                    />
                    {/* Score bar */}
                    {score != null && barW > 0 && (
                      <rect
                        x={barX} y={y}
                        width={barW} height={BAR_H}
                        fill={scoreToColor(score)}
                      />
                    )}
                  </g>
                )
              })}
              {/* Separator line between explainer groups */}
              {ei < explainerIds.length - 1 && (
                <line
                  x1={LEFT_PAD} y1={groupH + EXPLAINER_GAP / 2}
                  x2={LEFT_PAD + BAR_MAX_W} y2={groupH + EXPLAINER_GAP / 2}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
              )}
            </g>
          )
        })}
        {/* Random baseline dotted line at 0.5 (rendered last = on top) */}
        <line
          x1={LEFT_PAD + 0.5 * BAR_MAX_W}
          y1={0}
          x2={LEFT_PAD + 0.5 * BAR_MAX_W}
          y2={totalHeight}
          stroke="#B22222"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      </svg>
      {hovered && tooltipPos && (
        <Tooltip position={tooltipPos}>
          <Tooltip.Header>{getExplainerDisplayName(hovered.explainerId)}</Tooltip.Header>
          {METRICS.map(metric => {
            const score = getMetricScore(hovered.data, metric)
            return (
              <div key={metric} className="tooltip__row" style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                <span>{METRIC_LABELS[metric]}: {score?.toFixed(2) ?? '—'}</span>
              </div>
            )
          })}
        </Tooltip>
      )}
    </div>
  )
}

export default React.memo(CrossMetricConsensus)
