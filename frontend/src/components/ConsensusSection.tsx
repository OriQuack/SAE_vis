import React, { useState, useCallback, useMemo } from 'react'
import chroma from 'chroma-js'
import type { ConsensusResponse, ConsensusItem } from '../types'
import { D3_SCHEME_TABLEAU10 } from '../lib/constants'
import { Tooltip } from './Tooltip'
import '../styles/ConsensusSection.css'

// ============================================================================
// CONSENSUS SECTION - Displays clustered explanation phrases as pills
// ============================================================================
// Pure render component that receives consensus data as prop.
// Parent components (QualityView, CauseView) handle data fetching and subheader.
// Hover shows tooltip with all cluster phrases.

/** Phrase highlight data passed on hover — includes text + explainer + character offsets */
export interface PhraseHighlightData {
  text: string
  explainer: string
  start_char: number
  end_char: number
}

interface ConsensusSectionProps {
  consensus: ConsensusResponse | null
  onPhraseHover?: (data: PhraseHighlightData[] | null) => void
}

interface TooltipData {
  position: { x: number; y: number }
  item: ConsensusItem
}

// Base teal color for consensus encoding
const TEAL_CHROMA = chroma(D3_SCHEME_TABLEAU10.TEAL)

// Consensus opacity: discrete 5-step mapping from score range [0, 3]
const OPACITY_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0] as const

function getConsensusOpacity(consensusScore: number): number {
  if (consensusScore < 0.6)      return 0.2
  else if (consensusScore < 1.2) return 0.4
  else if (consensusScore < 1.8) return 0.6
  else if (consensusScore < 2.4) return 0.8
  else                           return 1.0
}

// ============================================================================
// CONSENSUS LEGEND - Compact inline legend for subheader row
// ============================================================================

/** Compact legend showing teal consensus opacity ramp */
export const ConsensusLegend: React.FC = React.memo(() => (
  <div className="legend-group">
    <div className="legend-item">
      <span className="legend-label">Explainer Consensus:</span>
      <span className="legend-ramp">
        {OPACITY_STEPS.map((op, i) => (
          <span
            key={i}
            className="legend-swatch"
            style={{ backgroundColor: TEAL_CHROMA.alpha(op).css() }}
          />
        ))}
      </span>
      <span className="legend-range">0–3</span>
    </div>
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
      if (item.is_outlier) {
        onPhraseHover([{
          text: item.phrase,
          explainer: item.explainer,
          start_char: item.start_char ?? 0,
          end_char: item.end_char ?? 0,
        }])
      } else {
        const data = (item.cluster_phrases ?? []).map(p => ({
          text: p.text,
          explainer: p.explainer,
          start_char: p.start_char ?? 0,
          end_char: p.end_char ?? 0,
        }))
        onPhraseHover(data.length > 0 ? data : [{
          text: item.phrase,
          explainer: item.explainer,
          start_char: item.start_char ?? 0,
          end_char: item.end_char ?? 0,
        }])
      }
    }
  }, [onPhraseHover])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltipData(null)
    onPhraseHover?.(null)
  }, [onPhraseHover])

  // Get pill visual encoding for an item
  const getPillStyle = useCallback((item: ConsensusItem): React.CSSProperties => {
    if (item.is_outlier) {
      return {
        '--pill-hover-bg': TEAL_CHROMA.alpha(0.1).css(),
      } as React.CSSProperties
    }

    const consensusScore = item.cluster_score ?? 0
    const alpha = getConsensusOpacity(consensusScore)
    return {
      '--pill-bg': TEAL_CHROMA.alpha(alpha).css(),
      '--pill-hover-bg': TEAL_CHROMA.alpha(Math.min(alpha + 0.15, 1)).css(),
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

  // Handle mouse move on item — update tooltip position to follow cursor
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipData(prev => prev ? { ...prev, position: { x: e.clientX, y: e.clientY } } : null)
  }, [])

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
      onMouseMove={handleMouseMove}
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
      <Tooltip position={tooltipData?.position ?? null}>
        <Tooltip.Header>
          {tooltipData?.item.is_outlier
            ? `Outlier`
            : `Cluster (${tooltipData?.item.cluster_size} phrases)`}
        </Tooltip.Header>
        <Tooltip.Summary showSeparator={!onPhraseHover && !tooltipData?.item.is_outlier && !!tooltipData?.item.cluster_phrases}>
          Consensus: {tooltipData?.item.is_outlier
            ? '0.00'
            : (tooltipData?.item.cluster_score?.toFixed(2) ?? '0.00')} / 3.00
          <br />
          Avg. Metric Score: {(tooltipData?.item.is_outlier
            ? tooltipData?.item.quality_score
            : tooltipData?.item.avg_quality_score
          )?.toFixed(2) ?? '0.00'} / 1.00
        </Tooltip.Summary>
        {/* Show all phrases for clusters */}
        {!onPhraseHover && !tooltipData?.item.is_outlier && tooltipData?.item.cluster_phrases && (
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
      </Tooltip>
    </div>
  )
}

export default React.memo(ConsensusSection)
