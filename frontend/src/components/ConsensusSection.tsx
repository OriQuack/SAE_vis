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

  // Calculate opacity based on consensus score (cluster_score / phrase_weight)
  // Range 0–3 mapped linearly to opacity 0.35–1.0
  const getOpacity = useCallback((item: ConsensusItem): number => {
    const score = item.is_outlier
      ? (item.phrase_weight ?? 0)
      : (item.cluster_score ?? 0)

    return 0.35 + Math.min(score, 3) / 3 * 0.65
  }, [])

  // Memoized opacity calculator using current items
  const opacityMap = useMemo(() => {
    if (!consensus?.items) return new Map<number, number>()

    const map = new Map<number, number>()
    consensus.items.forEach((item, idx) => {
      map.set(idx, getOpacity(item))
    })
    return map
  }, [consensus?.items, getOpacity])

  // Return null if no data - parent handles empty state in subheader
  if (!consensus || consensus.items.length === 0) {
    return null
  }

  return (
    <div className="consensus-section">
      <div className="consensus-section__items">
        {consensus.items.map((item, idx) => {
          const opacity = opacityMap.get(idx) ?? 1

          return (
            <div
              key={`${item.cluster_id}-${idx}`}
              className={`consensus-item__pill ${item.is_outlier ? 'consensus-item__pill--outlier' : 'consensus-item__pill--medoid'}`}
              style={{ '--pill-alpha': opacity } as React.CSSProperties}
              onMouseEnter={(e) => handleMouseEnter(e, item)}
              onMouseLeave={handleMouseLeave}
            >
              <span className="consensus-item__phrase">{item.phrase}</span>
            </div>
          )
        })}
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
            <span>Consensus: {(tooltipData.item.is_outlier
              ? tooltipData.item.phrase_weight
              : tooltipData.item.cluster_score
            )?.toFixed(2) ?? '0.00'}/3</span>
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
