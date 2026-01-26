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
}

interface TooltipData {
  position: { x: number; y: number }
  item: ConsensusItem
}

const ConsensusSection: React.FC<ConsensusSectionProps> = ({ consensus }) => {
  // Local state for tooltip on hover
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null)

  // Handle mouse enter on item
  const handleMouseEnter = useCallback((e: React.MouseEvent, item: ConsensusItem) => {
    setTooltipData({
      position: { x: e.clientX, y: e.clientY },
      item
    })
  }, [])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltipData(null)
  }, [])

  // Calculate opacity based on activation similarity
  const getOpacity = useCallback((activationSimilarity: number, items: ConsensusItem[]): number => {
    if (items.length === 0) return 1

    const maxSim = Math.max(...items.map(i => i.activation_similarity))
    const minSim = Math.min(...items.map(i => i.activation_similarity))

    if (maxSim === minSim) return 1

    // Map to 0.4 - 1.0 range
    const normalized = (activationSimilarity - minSim) / (maxSim - minSim)
    return 0.4 + normalized * 0.6
  }, [])

  // Memoized opacity calculator using current items
  const opacityMap = useMemo(() => {
    if (!consensus?.items) return new Map<number, number>()

    const map = new Map<number, number>()
    consensus.items.forEach((item, idx) => {
      map.set(idx, getOpacity(item.activation_similarity, consensus.items))
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
              style={{ opacity }}
              onMouseEnter={(e) => handleMouseEnter(e, item)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Phrase text */}
              <span className="consensus-item__phrase">{item.phrase}</span>

              {/* Cluster badge (for non-outliers) */}
              {!item.is_outlier && item.cluster_size && (
                <span className="consensus-item__badge">
                  {item.cluster_size}
                </span>
              )}
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
              ? `Outlier (1 phrase)`
              : `Cluster (${tooltipData.item.cluster_size} phrases)`}
            <span className="consensus-tooltip__score">
              {tooltipData.item.activation_similarity.toFixed(2)}
            </span>
          </div>
          {/* Show all phrases for clusters */}
          {!tooltipData.item.is_outlier && tooltipData.item.cluster_phrases && (
            <div className="consensus-tooltip__phrases">
              {tooltipData.item.cluster_phrases.map((phrase, pIdx) => (
                <span key={pIdx} className="consensus-tooltip__phrase">
                  {phrase.text}
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
