import React, { useState, useCallback, useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import type { ConsensusResponse, ConsensusItem } from '../types'
import '../styles/ConsensusSection.css'

// Plot constants - square plot
const PLOT_SIZE = 90
const PLOT_MARGIN = { top: 8, right: 8, bottom: 18, left: 28 }

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

  // Calculate opacity based on cluster_score (for clusters) or phrase_weight (for outliers)
  // Higher scores = more explainers agree = more prominent
  // Falls back to activation_similarity for backward compatibility with old data
  const getOpacity = useCallback((item: ConsensusItem, items: ConsensusItem[]): number => {
    // Check if new scoring data is available
    const hasNewScoring = item.cluster_score !== undefined || item.phrase_weight !== undefined

    if (hasNewScoring) {
      // New scoring: use cluster_score for clusters, phrase_weight for outliers
      const score = item.is_outlier
        ? (item.phrase_weight ?? 0.1)
        : (item.cluster_score ?? 0.5)

      // Map score to opacity range [0.4, 1.0]
      // Max single cluster score is ~1.0 (if all 3 explainers agree on one phrase)
      const normalized = Math.min(score, 1.0)
      return 0.4 + normalized * 0.6
    } else {
      // Fallback: use activation_similarity (old scoring)
      if (items.length === 0) return 1

      const maxSim = Math.max(...items.map(i => i.activation_similarity))
      const minSim = Math.min(...items.map(i => i.activation_similarity))

      if (maxSim === minSim) return 1

      const normalized = (item.activation_similarity - minSim) / (maxSim - minSim)
      return 0.4 + normalized * 0.6
    }
  }, [])

  // Memoized opacity calculator using current items
  const opacityMap = useMemo(() => {
    if (!consensus?.items) return new Map<number, number>()

    const map = new Map<number, number>()
    consensus.items.forEach((item, idx) => {
      map.set(idx, getOpacity(item, consensus.items))
    })
    return map
  }, [consensus?.items, getOpacity])

  // Calculate scales and plot data for scatter plot
  const { xScale, yScale, plotData } = useMemo(() => {
    if (!consensus?.items) {
      return { xScale: null, yScale: null, plotData: [] }
    }

    const plotData = consensus.items.map((item, idx) => ({
      x: item.is_outlier ? (item.phrase_weight ?? 0) : (item.cluster_score ?? 0),
      y: item.weighted_quality_score ?? 0,
      item,
      idx
    }))

    const maxX = Math.max(...plotData.map(d => d.x), 0.1)
    const maxY = Math.max(...plotData.map(d => d.y), 0.1)

    const xScale = scaleLinear()
      .domain([0, maxX * 1.1])
      .range([PLOT_MARGIN.left, PLOT_SIZE - PLOT_MARGIN.right])

    const yScale = scaleLinear()
      .domain([0, maxY * 1.1])
      .range([PLOT_SIZE - PLOT_MARGIN.bottom, PLOT_MARGIN.top])

    return { xScale, yScale, plotData }
  }, [consensus?.items])

  // Return null if no data - parent handles empty state in subheader
  if (!consensus || consensus.items.length === 0) {
    return null
  }

  return (
    <div className="consensus-section">
      {/* Scatter plot: Consensus (x) vs Quality (y) */}
      {xScale && yScale && plotData.length > 0 && (
        <svg className="consensus-plot" width={PLOT_SIZE} height={PLOT_SIZE}>
          {/* X-axis */}
          <g transform={`translate(0,${PLOT_SIZE - PLOT_MARGIN.bottom})`}>
            <line
              x1={PLOT_MARGIN.left}
              x2={PLOT_SIZE - PLOT_MARGIN.right}
              stroke="var(--border-color, #e5e7eb)"
            />
            <text
              x={(PLOT_MARGIN.left + PLOT_SIZE - PLOT_MARGIN.right) / 2}
              y={13}
              textAnchor="middle"
              className="consensus-plot__label"
            >
              Consensus
            </text>
          </g>

          {/* Y-axis */}
          <g transform={`translate(${PLOT_MARGIN.left},0)`}>
            <line
              y1={PLOT_MARGIN.top}
              y2={PLOT_SIZE - PLOT_MARGIN.bottom}
              stroke="var(--border-color, #e5e7eb)"
            />
            <text
              x={-((PLOT_SIZE - PLOT_MARGIN.top - PLOT_MARGIN.bottom) / 2 + PLOT_MARGIN.top)}
              y={-16}
              textAnchor="middle"
              transform="rotate(-90)"
              className="consensus-plot__label"
            >
              Quality
            </text>
          </g>

          {/* Points */}
          {plotData.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d.x)}
              cy={yScale(d.y)}
              r={4}
              className={`consensus-plot__point ${d.item.is_outlier ? 'consensus-plot__point--outlier' : 'consensus-plot__point--medoid'}`}
              style={{ opacity: opacityMap.get(d.idx) ?? 1 }}
              onMouseEnter={(e) => handleMouseEnter(e, d.item)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </svg>
      )}

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

              {/* Cluster badge - show cluster_score + weighted_quality */}
              {!item.is_outlier && (
                <span className="consensus-item__badge">
                  {(item.cluster_score ?? 0).toFixed(2)} | Q:{(item.weighted_quality_score ?? 0).toFixed(2)}
                </span>
              )}
              {/* Outlier badge - show phrase_weight + weighted_quality */}
              {item.is_outlier && (
                <span className="consensus-item__badge consensus-item__badge--outlier">
                  {(item.phrase_weight ?? 0).toFixed(2)} | Q:{(item.weighted_quality_score ?? 0).toFixed(2)}
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
              ? `Outlier`
              : `Cluster (${tooltipData.item.cluster_size} phrases)`}
          </div>
          <div className="consensus-tooltip__metrics">
            <span>Score: {(tooltipData.item.is_outlier
              ? tooltipData.item.phrase_weight
              : tooltipData.item.cluster_score
            )?.toFixed(2) ?? '0.00'}</span>
            <span>Wtd. Quality: {tooltipData.item.weighted_quality_score?.toFixed(2) ?? '0.00'}</span>
          </div>
          {/* Show all phrases for clusters */}
          {!tooltipData.item.is_outlier && tooltipData.item.cluster_phrases && (
            <div className="consensus-tooltip__phrases">
              {tooltipData.item.cluster_phrases.map((phrase, pIdx) => (
                <span key={pIdx} className="consensus-tooltip__phrase">
                  {phrase.text}
                  {phrase.weighted_quality_score !== undefined && (
                    <span className="consensus-tooltip__phrase-weight">
                      (Q: {phrase.weighted_quality_score.toFixed(2)})
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
