import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { BimodalityInfo } from '../types'
import '../styles/BimodalityIndicator.css'

interface BimodalityIndicatorProps {
  bimodality: BimodalityInfo | null | undefined
}

// Level configuration (from bottom to top: 1-6)
const LEVELS = [
  { level: 1, label: 'Unimodal', threshold: 0 },
  { level: 2, label: 'Likely Unimodal', threshold: 0.17 },
  { level: 3, label: 'Uncertain', threshold: 0.33 },
  { level: 4, label: 'Likely Bimodal', threshold: 0.5 },
  { level: 5, label: 'Bimodal', threshold: 0.67 },
  { level: 6, label: 'Strongly Bimodal', threshold: 0.83 },
] as const

// Colors for filled levels (gradient from light to dark blue)
const LEVEL_COLORS = {
  1: '#bfdbfe',  // very light blue
  2: '#93c5fd',  // lighter blue
  3: '#60a5fa',  // light blue
  4: '#3b82f6',  // medium blue
  5: '#2563eb',  // blue
  6: '#1e40af',  // dark blue
} as const

const UNFILLED_COLOR = '#e5e7eb'  // gray

/**
 * Calculate unified bimodality score (0-1) from raw data
 * Uses geometric mean of: dip p-value, BIC difference, mean separation
 * Geometric mean ensures ALL components must be high for a high score
 */
export function calculateBimodalityScore(bimodality: BimodalityInfo): {
  score: number
  dipScore: number
  bicScore: number
  meanScore: number
  meanSeparation: number
  bicDiff: number
} {
  // Handle insufficient data
  if (bimodality.sample_size < 10) {
    return { score: 0, dipScore: 0, bicScore: 0, meanScore: 0, meanSeparation: 0, bicDiff: 0 }
  }

  // Component 1: Dip Test Score
  // Lower p-value = more bimodal (p < 0.05 is standard statistical significance)
  const dipScore = 1 - Math.min(bimodality.dip_pvalue / 0.05, 1)

  // Component 2: BIC Score
  // Lower BIC for k=2 = more bimodal
  const bicDiff = bimodality.bic_k1 - bimodality.bic_k2
  const relativeBicDiff = bimodality.bic_k1 !== 0
    ? bicDiff / Math.abs(bimodality.bic_k1)
    : 0
  const bicScore = Math.max(0, Math.min(1, relativeBicDiff * 10))

  // Component 3: Mean Separation Score (1/3 weight)
  // Larger separation between GMM means = more bimodal
  const meanDiff = Math.abs(
    bimodality.gmm_components[1].mean - bimodality.gmm_components[0].mean
  )
  const avgVariance = (
    bimodality.gmm_components[0].variance +
    bimodality.gmm_components[1].variance
  ) / 2
  const avgStd = Math.sqrt(Math.max(avgVariance, 0.0001))  // Prevent division by zero
  const meanSeparation = meanDiff / avgStd  // Cohen's d-like measure
  const meanScore = Math.min(meanSeparation / 3, 1)  // separation ≥ 3 stddev → 1.0 (stricter)

  // Final score: geometric mean (penalizes any low component heavily)
  const score = Math.pow(dipScore * bicScore * meanScore, 1/3)

  return { score, dipScore, bicScore, meanScore, meanSeparation, bicDiff }
}

/**
 * Get the level (1-6) based on score
 */
export function getScoreLevel(score: number): number {
  if (score >= 0.83) return 6
  if (score >= 0.67) return 5
  if (score >= 0.5) return 4
  if (score >= 0.33) return 3
  if (score >= 0.17) return 2
  return 1
}

/**
 * Check if bimodality score indicates strongly bimodal distribution
 * Used by FeatureSplitView to enable/disable Tag All button
 */
export function isBimodalScore(bimodality: BimodalityInfo | null | undefined): boolean {
  if (!bimodality) return false
  const { score } = calculateBimodalityScore(bimodality)
  return score >= 0.83  // Level 6 (Strongly Bimodal) only
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
  // level 0 means no data / nothing selected
  const { score, level, meanSeparation, bicDiff } = useMemo(() => {
    if (!displayBimodality) {
      return { score: 0, level: 0, meanSeparation: 0, bicDiff: 0 }  // No selection when no data
    }
    if (displayBimodality.sample_size < 10) {
      return { score: 0, level: 1, meanSeparation: 0, bicDiff: 0 }  // Unimodal for insufficient data
    }

    const result = calculateBimodalityScore(displayBimodality)
    return {
      score: result.score,
      level: getScoreLevel(result.score),
      meanSeparation: result.meanSeparation,
      bicDiff: result.bicDiff
    }
  }, [displayBimodality])

  // Check if strongly bimodal (for visual connection to button)
  const isStronglyBimodal = level === 6

  // Check if we have data for tooltip
  const hasData = !!displayBimodality

  return (
    <div
      className={`bimodality-indicator ${isStronglyBimodal ? 'bimodality-indicator--active' : ''}`}
      onMouseEnter={() => hasData && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
    >
      <div className="bimodality-indicator__title">Histogram Status</div>

      <div className="bimodality-indicator__bar">
        {/* Render levels from top (1: Unimodal) to bottom (6: Strongly Bimodal) */}
        {LEVELS.map((levelConfig, index) => {
          const isFilled = levelConfig.level <= level
          const isCurrentLevel = levelConfig.level === level
          const isLastItem = index === LEVELS.length - 1

          return (
            <div key={levelConfig.level} className="bimodality-indicator__level">
              {/* Circle */}
              <div
                className={`bimodality-indicator__circle ${isCurrentLevel ? 'bimodality-indicator__circle--current' : ''}`}
                style={{
                  backgroundColor: isFilled ? LEVEL_COLORS[levelConfig.level as keyof typeof LEVEL_COLORS] : UNFILLED_COLOR
                }}
              />

              {/* Line connecting to next circle (or to button for last item when active) */}
              <div
                className={`bimodality-indicator__line ${isLastItem ? 'bimodality-indicator__line--connector' : ''}`}
                style={{
                  backgroundColor: isLastItem
                    ? (isStronglyBimodal ? LEVEL_COLORS[6] : 'transparent')
                    : (levelConfig.level < level ? LEVEL_COLORS[(levelConfig.level + 1) as keyof typeof LEVEL_COLORS] : UNFILLED_COLOR)
                }}
              />

              {/* Label */}
              <span
                className={`bimodality-indicator__label ${isCurrentLevel ? 'bimodality-indicator__label--current' : ''}`}
              >
                {levelConfig.label}
              </span>
            </div>
          )
        })}
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
