import React, { useState, useCallback, useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import type { ConsensusResponse, ConsensusItem } from '../types'
import '../styles/ConsensusSection.css'

// Plot constants - square plot
const PLOT_SIZE = 90
const PLOT_MARGIN = { top: 5, right: 5, bottom: 14, left: 14 }

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
  // Track which item is being hovered for cross-highlight between dots and pills
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null)

  // Handle mouse enter on item
  const handleMouseEnter = useCallback((e: React.MouseEvent, item: ConsensusItem, idx: number) => {
    setHoveredItemIndex(idx)
    setTooltipData({
      position: { x: e.clientX, y: e.clientY },
      item
    })
  }, [])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredItemIndex(null)
    setTooltipData(null)
  }, [])

  // Calculate opacity based on quality score
  // Items below random baseline (0.5) get lower opacity
  const getOpacity = useCallback((item: ConsensusItem): number => {
    const qualityScore = item.is_outlier
      ? (item.quality_score ?? 0.5)
      : (item.avg_quality_score ?? 0.5)

    // Items below 0.5 (random baseline) get lower opacity
    if (qualityScore < 0.5) {
      return 0.4
    }
    return 1.0
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

  // Calculate scales and plot data for scatter plot
  const { xScale, yScale, plotData } = useMemo(() => {
    if (!consensus?.items) {
      return { xScale: null, yScale: null, plotData: [] }
    }

    const plotData = consensus.items.map((item, idx) => ({
      x: item.is_outlier ? (item.phrase_weight ?? 0) : (item.cluster_score ?? 0),
      y: item.is_outlier ? (item.quality_score ?? 0) : (item.avg_quality_score ?? 0),
      item,
      idx
    }))

    // Fixed scales: Consensus (x) out of 3, Quality (y) out of 1
    const xScale = scaleLinear()
      .domain([0, 3])
      .range([PLOT_MARGIN.left, PLOT_SIZE - PLOT_MARGIN.right])

    const yScale = scaleLinear()
      .domain([0, 1])
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
            {/* X-axis label at origin */}
            <text
              x={PLOT_MARGIN.left}
              y={10}
              textAnchor="start"
              className="consensus-plot__label"
            >
              Consensus
            </text>
            {/* X-axis max tick */}
            <text
              x={PLOT_SIZE}
              y={10}
              textAnchor="end"
              className="consensus-plot__tick"
            >
              3
            </text>
          </g>

          {/* Y-axis */}
          <g transform={`translate(${PLOT_MARGIN.left},0)`}>
            <line
              y1={PLOT_MARGIN.top}
              y2={PLOT_SIZE - PLOT_MARGIN.bottom}
              stroke="var(--border-color, #e5e7eb)"
            />
            {/* Y-axis label at origin */}
            <text
              x={-(PLOT_SIZE - PLOT_MARGIN.bottom)}
              y={-5}
              textAnchor="start"
              transform="rotate(-90)"
              className="consensus-plot__label"
            >
              Quality
            </text>
            {/* Y-axis max tick */}
            <text
              x={-4}
              y={PLOT_MARGIN.top + 3}
              textAnchor="end"
              className="consensus-plot__tick"
            >
              1
            </text>
          </g>

          {/* Random baseline dotted line at quality = 0.5 */}
          <line
            x1={PLOT_MARGIN.left}
            y1={yScale(0.5)}
            x2={PLOT_SIZE - PLOT_MARGIN.right}
            y2={yScale(0.5)}
            stroke="#B22222"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* Points - outliers use smaller radius to compensate for stroke width */}
          {plotData.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d.x)}
              cy={yScale(d.y)}
              r={d.item.is_outlier ? 2.75 : 3.5}
              className={`consensus-plot__point ${d.item.is_outlier ? 'consensus-plot__point--outlier' : 'consensus-plot__point--medoid'}${hoveredItemIndex === d.idx ? ' consensus-plot__point--highlighted' : ''}`}
              style={{ fillOpacity: opacityMap.get(d.idx) ?? 1 }}
              onMouseEnter={(e) => handleMouseEnter(e, d.item, d.idx)}
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
              className={`consensus-item__pill ${item.is_outlier ? 'consensus-item__pill--outlier' : 'consensus-item__pill--medoid'}${hoveredItemIndex === idx ? ' consensus-item__pill--highlighted' : ''}`}
              style={{ opacity }}
              onMouseEnter={(e) => handleMouseEnter(e, item, idx)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Phrase text */}
              <span className="consensus-item__phrase">{item.phrase}</span>

              {/* Cluster badge - show cluster_score + avg_quality */}
              {!item.is_outlier && (
                <span className="consensus-item__badge">
                  C:{(item.cluster_score ?? 0).toFixed(2)} | Q:{(item.avg_quality_score ?? 0).toFixed(2)}
                </span>
              )}
              {/* Outlier badge - show phrase_weight + quality */}
              {item.is_outlier && (
                <span className="consensus-item__badge consensus-item__badge--outlier">
                  C:{(item.phrase_weight ?? 0).toFixed(2)} | Q:{(item.quality_score ?? 0).toFixed(2)}
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
          {!tooltipData.item.is_outlier && tooltipData.item.cluster_phrases && (
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
