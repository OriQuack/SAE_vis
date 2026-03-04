import React from 'react'
import chroma from 'chroma-js'
import type { FeatureTableRow, ExplainerScoreData, ScorerScoreSet } from '../types'
import { getTagColor } from '../lib/tag-system'
import '../styles/CrossMetricConsensus.css'

interface CrossMetricConsensusProps {
  explainerIds: string[]
  featureRow: FeatureTableRow | null
}

// Score range buckets — spaced to fit a square layout
const BUCKETS = [
  { label: '<0.5', cx: 15 },
  { label: '0.5–0.75', cx: 44 },
  { label: '≥0.75', cx: 73 },
] as const

const CIRCLE_R = 12
const SVG_WIDTH = 88
const ROW_HEIGHT = 28

const STAMP_COLOR = '#374151'  // gray-700, uniform for all stamps

// Bucket circle fill colors: NR → interpolated → WE (same pattern as ConsensusSection)
const NR_COLOR = getTagColor('quality', 'Need Revision') ?? '#9c755f'
const WE_COLOR = getTagColor('quality', 'Well-Explained') ?? '#59a14f'
const BUCKET_COLORS = [
  chroma.mix(NR_COLOR, WE_COLOR, 0.0, 'lab').hex(),   // <0.5 = Need Revision
  chroma.mix(NR_COLOR, WE_COLOR, 0.5, 'lab').hex(),   // 0.5–0.75 = middle
  chroma.mix(NR_COLOR, WE_COLOR, 1.0, 'lab').hex(),   // ≥0.75 = Well-Explained
] as const

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

// Render stamp shapes. Fixed nesting order (outside→inside): square embedding → diamond detection → circle fuzz
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

  // Diamond (detection) — rotated square for perfect 90° angles, rendered first so it appears behind square
  if (hasDetection) {
    const side = DIAMOND_D * Math.SQRT2
    stamps.push(
      <rect key="det" x={cx - side / 2} y={cy - side / 2} width={side} height={side}
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
  // Circle (fuzz) — innermost, smallest
  if (hasFuzz) {
    stamps.push(
      <circle key="fuzz" cx={cx} cy={cy} r={CIRCLE_STAMP_R}
        fill="none" stroke={STAMP_COLOR} strokeWidth={1.8} />
    )
  }

  return stamps
}

// Compact inline legend matching activation panel legend-item / legend-label style
export const CrossMetricLegend: React.FC = React.memo(() => (
  <div className="legend-group">
    <div className="legend-item">
      <span className="legend-label">Metric:</span>
    </div>
    <div className="legend-item">
      <svg className="cross-metric-legend__swatch" width={12} height={12} viewBox="0 0 12 12">
        <rect x={1} y={1} width={10} height={10} fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="legend-label">Embed</span>
    </div>
    <div className="legend-item">
      <svg className="cross-metric-legend__swatch" width={12} height={12} viewBox="0 0 12 12">
        <rect x={2.5} y={2.5} width={7} height={7} transform="rotate(45 6 6)"
          fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="legend-label">Detect</span>
    </div>
    <div className="legend-item">
      <svg className="cross-metric-legend__swatch" width={12} height={12} viewBox="0 0 12 12">
        <circle cx={6} cy={6} r={4} fill="none" stroke={STAMP_COLOR} strokeWidth={1.5} />
      </svg>
      <span className="legend-label">Fuzz</span>
    </div>
    <div className="legend-separator" />
    <div className="legend-item">
      <span className="legend-label">Metric Score:</span>
    </div>
    {BUCKETS.map((b, i) => (
      <div key={i} className="legend-item">
        <span className="legend-swatch" style={{ backgroundColor: BUCKET_COLORS[i] }} />
        <span className="legend-range">{b.label}</span>
      </div>
    ))}
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
                strokeWidth={3}
              />
              {/* Bucket circles — colored by score range */}
              {BUCKETS.map((b, bi) => (
                <circle key={bi} cx={b.cx} cy={cy} r={CIRCLE_R}
                  fill={isEmpty ? 'white' : BUCKET_COLORS[bi]}
                  fillOpacity={1}
                  stroke={isEmpty ? '#d1d5db' : BUCKET_COLORS[bi]}
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
