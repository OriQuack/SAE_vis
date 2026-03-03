import React, { useState, useCallback, useMemo } from 'react'
import type { ConsensusResponse, ConsensusItem } from '../types'
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

  // Calculate opacity based on consensus score (cluster_score)
  // Range 0–3 mapped linearly to opacity 0.35–1.0
  // Outliers always get minimum opacity (cluster_score=0 by design)
  const getOpacity = useCallback((item: ConsensusItem): number => {
    if (item.is_outlier) return 0.35
    const score = item.cluster_score ?? 0
    return 0.35 + Math.min(score, 3) / 3 * 0.65
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
      style={{ '--pill-alpha': getOpacity(item) } as React.CSSProperties}
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
