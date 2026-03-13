import React, { useState, useCallback, useMemo } from 'react'
import chroma from 'chroma-js'
import type { ConsensusResponse, ConsensusItem } from '../types'
import { D3_SCHEME_TABLEAU10 } from '../lib/constants'
import { scoreToColor, METRIC_GRADIENT } from '../lib/color-utils'
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
  offsets?: { start: number; end: number }[]  // Multi-range offsets (new pipeline)
}

interface ConsensusSectionProps {
  consensus: ConsensusResponse | null
  onPhraseHover?: (data: PhraseHighlightData[] | null) => void
  expanded?: boolean
  hasNoActivations?: boolean
}

interface TooltipData {
  position: { x: number; y: number }
  item: ConsensusItem
}

// Base teal color for consensus encoding
const TEAL_CHROMA = chroma(D3_SCHEME_TABLEAU10.TEAL)

// Continuous teal scale: consensus score [0, 3] → light teal to full teal
const TEAL_SCALE = chroma.scale(['white', TEAL_CHROMA]).mode('lab')
const TEAL_GRADIENT = `linear-gradient(to right, ${TEAL_SCALE(0).hex()} 0%, ${TEAL_SCALE(1).hex()} 100%)`

function consensusScoreToColor(score: number): string {
  return TEAL_SCALE(Math.min(1, Math.max(0, score / 3))).hex()
}

// ============================================================================
// CONSENSUS LEGEND - Compact inline legend for subheader row
// ============================================================================

/** Compact legend with gradient-filled pill + label */
export const ConsensusLegend: React.FC = React.memo(() => (
  <div className="consensus-legend">
    <div className="consensus-legend__side">
      <span className="consensus-legend__pill consensus-legend__pill--fill" style={{ background: METRIC_GRADIENT }} />
      <span className="legend-label">: Explainer Consensus</span>
      <span className="legend-hint">(higher = more agreement)</span>
    </div>
    <div className="legend-separator" />
    <div className="consensus-legend__side">
      <span className="consensus-legend__pill consensus-legend__pill--right" style={{ background: TEAL_GRADIENT }} />
      <span className="legend-label">: Metric Score</span>
      <span className="legend-hint">(higher = better)</span>
    </div>
  </div>
))

// ============================================================================
// CONSENSUS SECTION
// ============================================================================

const ConsensusSection: React.FC<ConsensusSectionProps> = ({ consensus, onPhraseHover, expanded, hasNoActivations }) => {
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
          offsets: item.char_offsets,
        }])
      } else {
        const data = (item.cluster_phrases ?? []).map(p => ({
          text: p.text,
          explainer: p.explainer,
          start_char: p.start_char ?? 0,
          end_char: p.end_char ?? 0,
          offsets: p.char_offsets,
        }))
        onPhraseHover(data.length > 0 ? data : [{
          text: item.phrase,
          explainer: item.explainer,
          start_char: item.start_char ?? 0,
          end_char: item.end_char ?? 0,
          offsets: item.char_offsets,
        }])
      }
    }
  }, [onPhraseHover])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltipData(null)
    onPhraseHover?.(null)
  }, [onPhraseHover])

  // Split items into clusters and outliers
  const { clusters, outliers } = useMemo(() => {
    if (!consensus?.items) return { clusters: [] as ConsensusItem[], outliers: [] as ConsensusItem[] }
    return {
      clusters: consensus.items.filter(item => !item.is_outlier),
      outliers: consensus.items.filter(item => item.is_outlier)
        .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
    }
  }, [consensus?.items])

  // Handle mouse move on item — update tooltip position to follow cursor
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipData(prev => prev ? { ...prev, position: { x: e.clientX, y: e.clientY } } : null)
  }, [])

  if (hasNoActivations) {
    return (
      <div className="consensus-section">
        <span className="consensus-section__empty">No Explanation available</span>
      </div>
    )
  }

  if (!consensus || consensus.items.length === 0) {
    return (
      <div className="consensus-section">
        <span className="consensus-section__empty">No Concepts</span>
      </div>
    )
  }

  const renderPill = (item: ConsensusItem, idx: number) => {
    const qualityScore = item.is_outlier ? item.quality_score : item.avg_quality_score
    // Consensus → green scale (normalize 0–3 to 0–1)
    const consensusRaw = item.is_outlier ? 0 : (item.cluster_score ?? 0)
    const consensusColor = scoreToColor(Math.min(1, Math.max(0, consensusRaw / 3)))
    // Metric → teal scale
    const metricColor = qualityScore != null
      ? consensusScoreToColor(qualityScore * 3)
      : undefined

    // Expanded rendering for non-outlier cluster pills with sub-phrases
    if (expanded && !item.is_outlier && (item.cluster_phrases?.length ?? 0) > 0) {
      return (
        <div
          key={`${item.cluster_id}-${idx}`}
          className="consensus-item__pill--expanded"
          style={{ '--expanded-bg': chroma(consensusColor).alpha(0.25).css() } as React.CSSProperties}
          onMouseEnter={(e) => handleMouseEnter(e, item)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="consensus-item__expanded-content">
            {item.cluster_phrases!.map((phrase, pIdx) => (
              <span key={pIdx} className={`consensus-tooltip__phrase${phrase.text === item.phrase ? ' consensus-tooltip__phrase--medroid' : ''}`}>
                {phrase.text}
              </span>
            ))}
          </div>
          {metricColor && (
            <span className="consensus-item__tag consensus-item__tag--right" style={{ backgroundColor: metricColor }} />
          )}
        </div>
      )
    }

    return (
      <div
        key={`${item.cluster_id}-${idx}`}
        className={`consensus-item__pill ${item.is_outlier ? 'consensus-item__pill--outlier' : 'consensus-item__pill--medoid'}`}
        style={{ backgroundColor: consensusColor }}
        onMouseEnter={(e) => handleMouseEnter(e, item)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <span className="consensus-item__phrase">{item.phrase}</span>
        {metricColor && (
          <span className="consensus-item__tag consensus-item__tag--right" style={{ backgroundColor: metricColor }} />
        )}
      </div>
    )
  }

  return (
    <div className="consensus-section">
      <div className="consensus-section__column">
        <div className="consensus-section__header">
          <span className="instruction-subheader">Consensus-Reached Concepts</span>
          <span className="consensus-section__criteria">(consensus score &gt; 0)</span>
        </div>
        <div className="consensus-section__items">
          {clusters.length > 0
            ? clusters.map((item, idx) => renderPill(item, idx))
            : <span className="consensus-section__empty">No Concepts</span>
          }
        </div>
      </div>
      <div className="consensus-section__column consensus-section__column--outlier">
        <div className="consensus-section__header">
          <span className="instruction-subheader">Explainer-Specific Concepts</span>
          <span className="consensus-section__criteria">(consensus score = 0)</span>
        </div>
        <div className="consensus-section__items">
          {outliers.length > 0
            ? outliers.map((item, idx) => renderPill(item, idx))
            : <span className="consensus-section__empty">No outliers</span>
          }
        </div>
      </div>

      {/* Tooltip with all info */}
      <Tooltip position={tooltipData?.position ?? null}>
        <Tooltip.Header>
          {tooltipData?.item.is_outlier
            ? `Outlier`
            : `Cluster (${tooltipData?.item.cluster_size} phrases)`}
        </Tooltip.Header>
        <Tooltip.Summary showSeparator={!expanded && !onPhraseHover && !tooltipData?.item.is_outlier && !!tooltipData?.item.cluster_phrases}>
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
        {!expanded && !onPhraseHover && !tooltipData?.item.is_outlier && tooltipData?.item.cluster_phrases && (
          <div className="consensus-tooltip__phrases">
            {tooltipData.item.cluster_phrases.map((phrase, pIdx) => (
              <span key={pIdx} className="consensus-tooltip__phrase">
                {phrase.text}
              </span>
            ))}
          </div>
        )}
      </Tooltip>
    </div>
  )
}

export default React.memo(ConsensusSection)
