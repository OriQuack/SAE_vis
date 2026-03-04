import React, { useState, useCallback, useMemo } from 'react'
import chroma from 'chroma-js'
import type { ConsensusResponse, ConsensusItem } from '../types'
import { getTagColor } from '../lib/tag-system'
import '../styles/ConsensusSection.css'

// ============================================================================
// CONSENSUS SECTION - Displays clustered explanation phrases as pills
// ============================================================================
// Pure render component that receives consensus data as prop.
// Parent components (QualityView, CauseView) handle data fetching and subheader.
// Hover shows tooltip with all cluster phrases.

interface ConsensusSectionProps {
  consensus: ConsensusResponse | null
  onPhraseHover?: (phrases: string[] | null) => void
}

interface TooltipData {
  position: { x: number; y: number }
  item: ConsensusItem
}

// Quality color: discrete 6-step interpolation between Need Revision and Well-Explained
const NR_COLOR = getTagColor('quality', 'Need Revision') ?? '#9c755f'
const WE_COLOR = getTagColor('quality', 'Well-Explained') ?? '#59a14f'

const QUALITY_STEPS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] as const
const QUALITY_COLORS = QUALITY_STEPS.map(t => chroma.mix(NR_COLOR, WE_COLOR, t, 'lab').hex())

function getQualityColor(qualityScore: number): string {
  let t: number
  if (qualityScore < 0.5)      t = 0.0
  else if (qualityScore < 0.6) t = 0.2
  else if (qualityScore < 0.7) t = 0.4
  else if (qualityScore < 0.8) t = 0.6
  else if (qualityScore < 0.9) t = 0.8
  else                         t = 1.0
  return chroma.mix(NR_COLOR, WE_COLOR, t, 'lab').hex()
}

// Consensus opacity: discrete 6-step mapping from score range [0, 3]
const OPACITY_STEPS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] as const

function getConsensusOpacity(consensusScore: number): number {
  if (consensusScore < 0.5)      return 0.0
  else if (consensusScore < 1.0) return 0.2
  else if (consensusScore < 1.5) return 0.4
  else if (consensusScore < 2.0) return 0.6
  else if (consensusScore < 2.5) return 0.8
  else                           return 1.0
}

// ============================================================================
// CONSENSUS LEGEND - Compact inline legend for subheader row
// ============================================================================

/** Compact legend showing quality color ramp + consensus opacity ramp */
export const ConsensusLegend: React.FC = React.memo(() => (
  <div className="consensus-legend">
    <span className="consensus-legend__group">
      <span className="consensus-legend__label">Quality</span>
      <span className="consensus-legend__ramp">
        {QUALITY_COLORS.map((color, i) => (
          <span key={i} className="consensus-legend__swatch" style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="consensus-legend__range">NR — WE</span>
    </span>
    <span className="consensus-legend__group">
      <span className="consensus-legend__label">Consensus</span>
      <span className="consensus-legend__ramp">
        {OPACITY_STEPS.map((op, i) => (
          <span
            key={i}
            className="consensus-legend__swatch"
            style={{ backgroundColor: `rgba(100,100,100,${op})`, border: op === 0 ? '1px solid #ccc' : 'none' }}
          />
        ))}
      </span>
      <span className="consensus-legend__range">0 — 3</span>
    </span>
  </div>
))

// ============================================================================
// CONSENSUS SECTION
// ============================================================================

const ConsensusSection: React.FC<ConsensusSectionProps> = ({ consensus, onPhraseHover }) => {
  // Local state for tooltip on hover
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null)

  // Handle mouse enter on item
  const handleMouseEnter = useCallback((e: React.MouseEvent, item: ConsensusItem) => {
    setTooltipData({
      position: { x: e.clientX, y: e.clientY },
      item
    })
    if (onPhraseHover) {
      const phrases = item.is_outlier
        ? [item.phrase]
        : item.cluster_phrases?.map(p => p.text) || [item.phrase]
      onPhraseHover(phrases)
    }
  }, [onPhraseHover])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltipData(null)
    onPhraseHover?.(null)
  }, [onPhraseHover])

  // Get pill visual encoding for an item
  const getPillStyle = useCallback((item: ConsensusItem): React.CSSProperties => {
    const quality = item.is_outlier
      ? (item.quality_score ?? 0)
      : (item.avg_quality_score ?? 0)
    const color = getQualityColor(quality)
    const c = chroma(color)

    if (item.is_outlier) {
      return {
        '--pill-border-color': c.css(),
        '--pill-hover-bg': c.alpha(0.1).css(),
      } as React.CSSProperties
    }

    const consensusScore = item.cluster_score ?? 0
    const alpha = getConsensusOpacity(consensusScore)
    return {
      '--pill-bg': c.alpha(alpha).css(),
      '--pill-hover-bg': c.alpha(Math.min(alpha + 0.15, 1)).css(),
    } as React.CSSProperties
  }, [])

  // Split items into clusters and outliers
  const { clusters, outliers } = useMemo(() => {
    if (!consensus?.items) return { clusters: [] as ConsensusItem[], outliers: [] as ConsensusItem[] }
    return {
      clusters: consensus.items.filter(item => !item.is_outlier),
      outliers: consensus.items.filter(item => item.is_outlier)
    }
  }, [consensus?.items])

  // Return null if no data - parent handles empty state in subheader
  if (!consensus || consensus.items.length === 0) {
    return null
  }

  const renderPill = (item: ConsensusItem, idx: number) => (
    <div
      key={`${item.cluster_id}-${idx}`}
      className={`consensus-item__pill ${item.is_outlier ? 'consensus-item__pill--outlier' : 'consensus-item__pill--medoid'}`}
      style={getPillStyle(item)}
      onMouseEnter={(e) => handleMouseEnter(e, item)}
      onMouseLeave={handleMouseLeave}
    >
      <span className="consensus-item__phrase">{item.phrase}</span>
    </div>
  )

  return (
    <div className="consensus-section">
      <div className="consensus-section__column">
        <span className="consensus-section__column-label">Clusters</span>
        <div className="consensus-section__items">
          {clusters.map((item, idx) => renderPill(item, idx))}
        </div>
      </div>
      <div className="consensus-section__column consensus-section__column--outlier">
        <span className="consensus-section__column-label">Outliers</span>
        <div className="consensus-section__items">
          {outliers.map((item, idx) => renderPill(item, idx))}
        </div>
      </div>

      {/* Tooltip with all info */}
      {tooltipData && (
        <div
          className="consensus-tooltip"
          style={{
            left: tooltipData.position.x + 10,
            top: tooltipData.position.y + 10
          }}
        >
          <div className="consensus-tooltip__header">
            {tooltipData.item.is_outlier
              ? `Outlier`
              : `Cluster (${tooltipData.item.cluster_size} phrases)`}
          </div>
          <div className="consensus-tooltip__metrics">
            <span>Consensus: {tooltipData.item.is_outlier
              ? '0.00'
              : (tooltipData.item.cluster_score?.toFixed(2) ?? '0.00')}/3</span>
            <span>Quality: {(tooltipData.item.is_outlier
              ? tooltipData.item.quality_score
              : tooltipData.item.avg_quality_score
            )?.toFixed(2) ?? '0.00'}/1</span>
          </div>
          {/* Show all phrases for clusters */}
          {!onPhraseHover && !tooltipData.item.is_outlier && tooltipData.item.cluster_phrases && (
            <div className="consensus-tooltip__phrases">
              {tooltipData.item.cluster_phrases.map((phrase, pIdx) => (
                <span key={pIdx} className="consensus-tooltip__phrase">
                  {phrase.text}
                  {phrase.quality_score !== undefined && (
                    <span className="consensus-tooltip__phrase-weight">
                      (Q: {phrase.quality_score.toFixed(2)})
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default React.memo(ConsensusSection)
