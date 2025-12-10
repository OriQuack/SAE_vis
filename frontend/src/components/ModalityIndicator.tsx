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

// Step thresholds for the 5-stage indicator
const STEP_THRESHOLDS = [0.2, 0.4, 0.6, 0.8, 1.0]

// Calculate which step is active based on score (1-5)
const getActiveStep = (score: number): number => {
  if (score < 0.2) return 1
  if (score < 0.4) return 2
  if (score < 0.6) return 3
  if (score < 0.8) return 4
  return 5
}

// Get color for a specific step (1-5)
// Red (#ef4444) at step 1, Yellow (#eab308) at step 3, Green (#22c55e) at step 5
const getStepColor = (step: number): string => {
  const t = (step - 1) / 4 // Normalize to 0-1
  if (t <= 0.5) {
    // Red to Yellow (step 1-3)
    const localT = t * 2
    const r = Math.round(239 + (234 - 239) * localT) // 239 -> 234
    const g = Math.round(68 + (179 - 68) * localT)   // 68 -> 179
    const b = Math.round(68 + (8 - 68) * localT)     // 68 -> 8
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Yellow to Green (step 3-5)
    const localT = (t - 0.5) * 2
    const r = Math.round(234 + (34 - 234) * localT)  // 234 -> 34
    const g = Math.round(179 + (197 - 179) * localT) // 179 -> 197
    const b = Math.round(8 + (94 - 8) * localT)      // 8 -> 94
    return `rgb(${r}, ${g}, ${b})`
  }
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

  // Calculate active step based on score
  const activeStep = useMemo(() => getActiveStep(scoreData.score), [scoreData.score])

  // Check if we have data for tooltip
  const hasData = isMultiMode ? !!displayMultimodality : !!displayBimodality

  // Labels based on mode
  const rightLabel = isMultiMode ? 'Multimodal' : 'Bimodal'

  // Show placeholder for multi-mode when no data
  if (isMultiMode && !displayMultimodality) {
    return (
      <div className="modality-indicator modality-indicator--placeholder">
        <div className="modality-indicator__placeholder">
          <div className="modality-indicator__placeholder-text">
            Tag 1+ features in 2+ categories
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="modality-indicator"
      onMouseEnter={() => hasData && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
    >
      {/* Labels row */}
      <div className="modality-indicator__labels">
        <span className="modality-indicator__label">Unimodal</span>
        <span className="modality-indicator__label">{rightLabel}</span>
      </div>

      {/* Dots and lines row - all direct siblings for proper connection */}
      <div className="modality-indicator__track">
        {STEP_THRESHOLDS.map((_, index) => {
          const stepNum = index + 1
          const isFilled = hasData && stepNum <= activeStep
          const isActive = hasData && stepNum === activeStep
          const stepColor = getStepColor(stepNum)

          return (
            <React.Fragment key={stepNum}>
              {index > 0 && (
                <div
                  className={`modality-indicator__line ${hasData && stepNum <= activeStep ? 'modality-indicator__line--filled' : ''}`}
                  style={hasData && stepNum <= activeStep ? { backgroundColor: getStepColor(stepNum - 1) } : undefined}
                />
              )}
              <div
                className={`modality-indicator__dot ${isFilled ? 'modality-indicator__dot--filled' : ''} ${isActive ? 'modality-indicator__dot--active' : ''}`}
                style={isFilled ? { backgroundColor: stepColor, borderColor: stepColor } : undefined}
              />
            </React.Fragment>
          )
        })}
      </div>

      {/* Tooltip - follows mouse, only show when we have data */}
      {showTooltip && hasData && (
        <div
          className="modality-indicator__tooltip"
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
          }}
        >
          <div className="modality-indicator__tooltip-score">
            Score: {scoreData.score.toFixed(2)}
          </div>
          <div className="modality-indicator__tooltip-divider" />

          {/* Multi-modality mode: show per-category breakdown */}
          {isMultiMode && scoreData.categoryDetails && (
            <>
              {Object.entries(scoreData.categoryDetails).map(([category, details]) => (
                <div key={category} className="modality-indicator__tooltip-category">
                  <div className="modality-indicator__tooltip-category-name">
                    {category}
                  </div>
                  <div className="modality-indicator__tooltip-row">
                    <span>Score:</span>
                    <span>{details.score.toFixed(2)}</span>
                  </div>
                  <div className="modality-indicator__tooltip-row">
                    <span>Dip p-value:</span>
                    <span>{details.dipPvalue?.toFixed(3) ?? 'N/A'}</span>
                  </div>
                  <div className="modality-indicator__tooltip-row">
                    <span>BIC diff:</span>
                    <span>{details.bicDiff !== undefined ? `${details.bicDiff >= 0 ? '+' : ''}${details.bicDiff.toFixed(1)}` : 'N/A'}</span>
                  </div>
                  <div className="modality-indicator__tooltip-row">
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
              <div className="modality-indicator__tooltip-row">
                <span>Dip p-value:</span>
                <span>{scoreData.dipPvalue?.toFixed(3) ?? 'N/A'}</span>
              </div>
              <div className="modality-indicator__tooltip-row">
                <span>BIC diff:</span>
                <span>{scoreData.bicDiff !== undefined ? `${scoreData.bicDiff >= 0 ? '+' : ''}${scoreData.bicDiff.toFixed(1)}` : 'N/A'}</span>
              </div>
              <div className="modality-indicator__tooltip-row">
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
