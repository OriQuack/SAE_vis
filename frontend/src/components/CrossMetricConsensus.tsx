import React from 'react'
import type { FeatureTableRow, ExplainerScoreData, ScorerScoreSet } from '../types'
import '../styles/CrossMetricConsensus.css'

interface CrossMetricConsensusProps {
  explainerIds: string[]
  featureRow: FeatureTableRow | null
}

// Score range buckets — spaced to fit a square layout
const BUCKETS = [
  { label: '<0.5', cx: 16 },
  { label: '0.5–0.75', cx: 48 },
  { label: '≥0.75', cx: 80 },
] as const

const CIRCLE_R = 13
const SVG_WIDTH = 96
const ROW_HEIGHT = 30

const STAMP_COLOR = '#374151'  // gray-700, uniform for all stamps

function avgScorerSet(s: ScorerScoreSet): number | null {
  const vals = [s.s1, s.s2, s.s3].filter((v): v is number => v !== null && v !== undefined)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function toBucket(score: number): number {
  if (score < 0.5) return 0
  if (score < 0.75) return 1
  return 2
}

interface MetricPlacement {
  metric: 'embedding' | 'fuzz' | 'detection'
  bucket: number
}

function getMetricPlacements(data: ExplainerScoreData | undefined): MetricPlacement[] {
  if (!data) return []
  const placements: MetricPlacement[] = []

  if (data.embedding !== null && data.embedding !== undefined) {
    placements.push({ metric: 'embedding', bucket: toBucket(data.embedding) })
  }
  const fuzzAvg = avgScorerSet(data.fuzz)
  if (fuzzAvg !== null) {
    placements.push({ metric: 'fuzz', bucket: toBucket(fuzzAvg) })
  }
  const detAvg = avgScorerSet(data.detection)
  if (detAvg !== null) {
    placements.push({ metric: 'detection', bucket: toBucket(detAvg) })
  }

  return placements
}

// Render stamp shapes. Fixed nesting order (outside→inside): square embedding → diamond fuzz → circle detection
// All rendered concentrically in the same bucket circle.
function renderStamps(placements: MetricPlacement[], bucketIdx: number, cy: number) {
  const inBucket = placements.filter(p => p.bucket === bucketIdx)
  if (inBucket.length === 0) return null

  const cx = BUCKETS[bucketIdx].cx
  const stamps: React.ReactElement[] = []

  const hasEmbedding = inBucket.some(p => p.metric === 'embedding')
  const hasFuzz = inBucket.some(p => p.metric === 'fuzz')
  const hasDetection = inBucket.some(p => p.metric === 'detection')

  // Fixed sizes — square > diamond > circle, always nest cleanly
  const SQUARE_HALF = 8
  const DIAMOND_D = 8
  const CIRCLE_STAMP_R = 4

  // Diamond (fuzz) — rotated square for perfect 90° angles, rendered first so it appears behind square
  if (hasFuzz) {
    const side = DIAMOND_D * Math.SQRT2  // side length so diagonal = DIAMOND_D * 2
    stamps.push(
      <rect key="fuzz" x={cx - side / 2} y={cy - side / 2} width={side} height={side}
        transform={`rotate(45 ${cx} ${cy})`}
        fill="none" stroke={STAMP_COLOR} strokeWidth={1.8} />
    )
  }
  // Square (embedding) — outermost, rendered on top of diamond
  if (hasEmbedding) {
    stamps.push(
      <rect key="emb" x={cx - SQUARE_HALF} y={cy - SQUARE_HALF} width={SQUARE_HALF * 2} height={SQUARE_HALF * 2}
        fill="none" stroke={STAMP_COLOR} strokeWidth={1.8} />
    )
  }
  // Circle (detection) — innermost, smallest
  if (hasDetection) {
    stamps.push(
      <circle key="det" cx={cx} cy={cy} r={CIRCLE_STAMP_R}
        fill="none" stroke={STAMP_COLOR} strokeWidth={1.8} />
    )
  }

  return stamps
}

// Compact inline legend matching consensus-legend style
export const CrossMetricLegend: React.FC = React.memo(() => (
  <div className="cross-metric-legend">
    <span className="cross-metric-legend__group">
      <svg width={12} height={12} viewBox="0 0 12 12">
        <rect x={1} y={1} width={10} height={10} fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="cross-metric-legend__label">Embed</span>
    </span>
    <span className="cross-metric-legend__group">
      <svg width={12} height={12} viewBox="0 0 12 12">
        <rect x={2.5} y={2.5} width={7} height={7} transform="rotate(45 6 6)"
          fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="cross-metric-legend__label">Fuzz</span>
    </span>
    <span className="cross-metric-legend__group">
      <svg width={12} height={12} viewBox="0 0 12 12">
        <circle cx={6} cy={6} r={4} fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="cross-metric-legend__label">Detect</span>
    </span>
  </div>
))

const CrossMetricConsensus: React.FC<CrossMetricConsensusProps> = ({ explainerIds, featureRow }) => {
  const hasData = featureRow && explainerIds.length > 0
  const topPad = CIRCLE_R + 1  // first circle center
  const rowSpacing = ROW_HEIGHT
  const totalHeight = topPad + (Math.max(explainerIds.length, 1) - 1) * rowSpacing + CIRCLE_R + 1

  return (
    <div className="cross-metric-consensus">
      <svg width={SVG_WIDTH} height={totalHeight} viewBox={`0 0 ${SVG_WIDTH} ${totalHeight}`}>
        {explainerIds.map((explainerId, rowIdx) => {
          const cy = topPad + rowIdx * rowSpacing
          const data = hasData ? featureRow.explainers?.[explainerId] : undefined
          const placements = getMetricPlacements(data)
          const isEmpty = placements.length === 0

          return (
            <g key={explainerId}>
              {/* Connecting line */}
              <line
                x1={BUCKETS[0].cx} y1={cy}
                x2={BUCKETS[2].cx} y2={cy}
                stroke={isEmpty ? '#d1d5db' : '#9ca3af'}
                strokeWidth={1}
              />
              {/* Bucket circles */}
              {BUCKETS.map((b, bi) => (
                <circle key={bi} cx={b.cx} cy={cy} r={CIRCLE_R}
                  fill="white"
                  stroke={isEmpty ? '#d1d5db' : '#9ca3af'}
                  strokeWidth={1}
                />
              ))}
              {/* Metric stamps */}
              {!isEmpty && BUCKETS.map((_, bi) => renderStamps(placements, bi, cy))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default React.memo(CrossMetricConsensus)
