import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { BimodalityInfo } from '../types'
import { calculateBimodalityScore } from '../lib/bimodality-utils'
import '../styles/BimodalityIndicator.css'

interface BimodalityIndicatorProps {
  bimodality: BimodalityInfo | null | undefined
}

const BimodalityIndicator: React.FC<BimodalityIndicatorProps> = ({ bimodality }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Keep previous bimodality data to prevent flickering during reload
  const prevBimodalityRef = useRef<BimodalityInfo | null>(null)

  // Update ref when we have valid data
  useEffect(() => {
    if (bimodality) {
      prevBimodalityRef.current = bimodality
    }
  }, [bimodality])

  // Use current data or fall back to previous
  const displayBimodality = bimodality || prevBimodalityRef.current

  // Track mouse position for tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Calculate score and derived values
  const { score, meanSeparation, bicDiff } = useMemo(() => {
    if (!displayBimodality) {
      return { score: 0, meanSeparation: 0, bicDiff: 0 }
    }
    if (displayBimodality.sample_size < 10) {
      return { score: 0, meanSeparation: 0, bicDiff: 0 }
    }

    const result = calculateBimodalityScore(displayBimodality)
    return {
      score: result.score,
      meanSeparation: result.meanSeparation,
      bicDiff: result.bicDiff
    }
  }, [displayBimodality])

  // Calculate fill color based on score position in full-height gradient
  // Red (#ef4444) at score 0 (top/unimodal), Green (#22c55e) at score 1 (bottom/bimodal)
  const fillColor = useMemo(() => {
    const r = Math.round(239 + (34 - 239) * score)   // 239 -> 34
    const g = Math.round(68 + (197 - 68) * score)    // 68 -> 197
    const b = Math.round(68 + (94 - 68) * score)     // 68 -> 94
    return `rgb(${r}, ${g}, ${b})`
  }, [score])

  // Check if we have data for tooltip
  const hasData = !!displayBimodality

  return (
    <div
      className="bimodality-indicator"
      onMouseEnter={() => hasData && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
    >
      <div className="bimodality-indicator__content">
        {/* Top label */}
        <div className="bimodality-indicator__endpoint">Unimodal</div>

        {/* Bar with fill */}
        <div className="bimodality-indicator__bar">
          <div className="bimodality-indicator__track" />
          <div
            className="bimodality-indicator__fill"
            style={{ height: `${score * 100}%`, backgroundColor: fillColor }}
          />
        </div>

        {/* Bottom label */}
        <div className="bimodality-indicator__endpoint">Bimodal</div>
      </div>

      {/* Simplified Tooltip - follows mouse, only show when we have data */}
      {showTooltip && hasData && displayBimodality && (
        <div
          className="bimodality-indicator__tooltip"
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
          }}
        >
          <div className="bimodality-indicator__tooltip-score">
            Score: {score.toFixed(2)}
          </div>
          <div className="bimodality-indicator__tooltip-divider" />
          <div className="bimodality-indicator__tooltip-row">
            <span>Dip p-value:</span>
            <span>{displayBimodality.dip_pvalue.toFixed(3)}</span>
          </div>
          <div className="bimodality-indicator__tooltip-row">
            <span>BIC diff:</span>
            <span>{bicDiff >= 0 ? '+' : ''}{bicDiff.toFixed(1)}</span>
          </div>
          <div className="bimodality-indicator__tooltip-row">
            <span>Mean sep:</span>
            <span>{meanSeparation.toFixed(1)}σ</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default BimodalityIndicator
