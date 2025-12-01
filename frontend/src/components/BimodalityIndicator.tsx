import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { BimodalityInfo } from '../types'
import { calculateBimodalityScore, getScoreLevel } from '../lib/bimodality-utils'
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
