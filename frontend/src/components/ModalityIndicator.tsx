import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { BimodalityInfo, MultiModalityInfo } from '../types'
import { calculateBimodalityScore, calculateMultiModalityScore } from '../lib/modality-utils'
import '../styles/ModalityIndicator.css'

interface ModalityIndicatorProps {
  // Existing bimodality prop (for backward compatibility)
  bimodality?: BimodalityInfo | null | undefined
  // New multi-modality prop
  multimodality?: MultiModalityInfo | null | undefined
}

const ModalityIndicator: React.FC<ModalityIndicatorProps> = ({ bimodality, multimodality }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Determine mode based on which prop is provided
  const isMultiMode = !!multimodality

  // Keep previous data to prevent flickering during reload
  const prevBimodalityRef = useRef<BimodalityInfo | null>(null)
  const prevMultimodalityRef = useRef<MultiModalityInfo | null>(null)

  // Update refs when we have valid data
  useEffect(() => {
    if (bimodality) {
      prevBimodalityRef.current = bimodality
    }
  }, [bimodality])

  useEffect(() => {
    if (multimodality) {
      prevMultimodalityRef.current = multimodality
    }
  }, [multimodality])

  // Use current data or fall back to previous
  const displayBimodality = bimodality || prevBimodalityRef.current
  const displayMultimodality = multimodality || prevMultimodalityRef.current

  // Track mouse position for tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Calculate score and derived values based on mode
  const scoreData = useMemo(() => {
    if (isMultiMode && displayMultimodality) {
      const result = calculateMultiModalityScore(displayMultimodality)
      return {
        score: result.aggregateScore,
        categoryDetails: result.categoryDetails,
        sampleSize: displayMultimodality.sample_size
      }
    } else if (displayBimodality) {
      if (displayBimodality.sample_size < 10) {
        return { score: 0, meanSeparation: 0, bicDiff: 0, dipPvalue: 1.0, sampleSize: displayBimodality.sample_size }
      }
      const result = calculateBimodalityScore(displayBimodality)
      return {
        score: result.score,
        meanSeparation: result.meanSeparation,
        bicDiff: result.bicDiff,
        dipPvalue: displayBimodality.dip_pvalue,
        sampleSize: displayBimodality.sample_size
      }
    }
    return { score: 0, sampleSize: 0 }
  }, [isMultiMode, displayBimodality, displayMultimodality])

  // Calculate fill color based on score position in full-height gradient
  // Red (#ef4444) at score 0 (top/unimodal), Green (#22c55e) at score 1 (bottom/multimodal)
  const fillColor = useMemo(() => {
    const score = scoreData.score
    const r = Math.round(239 + (34 - 239) * score)   // 239 -> 34
    const g = Math.round(68 + (197 - 68) * score)    // 68 -> 197
    const b = Math.round(68 + (94 - 68) * score)     // 68 -> 94
    return `rgb(${r}, ${g}, ${b})`
  }, [scoreData.score])

  // Check if we have data for tooltip
  const hasData = isMultiMode ? !!displayMultimodality : !!displayBimodality

  // Labels based on mode
  const bottomLabel = isMultiMode ? 'Multimodal' : 'Bimodal'

  // Show placeholder for multi-mode when no data
  if (isMultiMode && !displayMultimodality) {
    return (
      <div className="bimodality-indicator bimodality-indicator--placeholder">
        <div className="bimodality-indicator__placeholder">
          <div className="bimodality-indicator__placeholder-text">
            Tag 1+ features in 2+ categories
          </div>
        </div>
      </div>
    )
  }

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
            style={{ height: `${scoreData.score * 100}%`, backgroundColor: fillColor }}
          />
        </div>

        {/* Bottom label */}
        <div className="bimodality-indicator__endpoint">{bottomLabel}</div>
      </div>

      {/* Tooltip - follows mouse, only show when we have data */}
      {showTooltip && hasData && (
        <div
          className="bimodality-indicator__tooltip"
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
          }}
        >
          <div className="bimodality-indicator__tooltip-score">
            Score: {scoreData.score.toFixed(2)}
          </div>
          <div className="bimodality-indicator__tooltip-divider" />

          {/* Multi-modality mode: show per-category breakdown */}
          {isMultiMode && scoreData.categoryDetails && (
            <>
              {Object.entries(scoreData.categoryDetails).map(([category, details]) => (
                <div key={category} className="bimodality-indicator__tooltip-category">
                  <div className="bimodality-indicator__tooltip-category-name">
                    {category}
                  </div>
                  <div className="bimodality-indicator__tooltip-row">
                    <span>Score:</span>
                    <span>{details.score.toFixed(2)}</span>
                  </div>
                  <div className="bimodality-indicator__tooltip-row">
                    <span>Dip p-value:</span>
                    <span>{details.dipPvalue?.toFixed(3) ?? 'N/A'}</span>
                  </div>
                  <div className="bimodality-indicator__tooltip-row">
                    <span>BIC diff:</span>
                    <span>{details.bicDiff !== undefined ? `${details.bicDiff >= 0 ? '+' : ''}${details.bicDiff.toFixed(1)}` : 'N/A'}</span>
                  </div>
                  <div className="bimodality-indicator__tooltip-row">
                    <span>Mean sep:</span>
                    <span>{details.meanSeparation?.toFixed(1) ?? 'N/A'}σ</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Bimodality mode: show standard breakdown */}
          {!isMultiMode && displayBimodality && (
            <>
              <div className="bimodality-indicator__tooltip-row">
                <span>Dip p-value:</span>
                <span>{scoreData.dipPvalue?.toFixed(3) ?? 'N/A'}</span>
              </div>
              <div className="bimodality-indicator__tooltip-row">
                <span>BIC diff:</span>
                <span>{scoreData.bicDiff !== undefined ? `${scoreData.bicDiff >= 0 ? '+' : ''}${scoreData.bicDiff.toFixed(1)}` : 'N/A'}</span>
              </div>
              <div className="bimodality-indicator__tooltip-row">
                <span>Mean sep:</span>
                <span>{scoreData.meanSeparation?.toFixed(1) ?? 'N/A'}σ</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Export as both default and named for backward compatibility
export default ModalityIndicator
export { ModalityIndicator }

// Also keep the old name for backward compatibility
export const BimodalityIndicator = ModalityIndicator
