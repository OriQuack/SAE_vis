import React, { useState } from 'react'
import type { BimodalityInfo } from '../types'
import '../styles/BimodalityIndicator.css'

interface BimodalityIndicatorProps {
  bimodality: BimodalityInfo | null | undefined
}

const STATE_CONFIG: Record<string, { label: string; color: string; bgColor: string; description: string }> = {
  bimodal: {
    label: 'Bimodal',
    color: '#166534',
    bgColor: '#dcfce7',
    description: 'Two distinct groups detected by both tests'
  },
  likely_bimodal: {
    label: 'Likely Bimodal',
    color: '#15803d',
    bgColor: '#d1fae5',
    description: 'GMM suggests two groups, but Dip Test is not significant'
  },
  uncertain: {
    label: 'Uncertain',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    description: 'Tests disagree on distribution shape'
  },
  likely_unimodal: {
    label: 'Likely Unimodal',
    color: '#9a3412',
    bgColor: '#fed7aa',
    description: 'Dip Test suggests multimodality, but GMM prefers one group'
  },
  unimodal: {
    label: 'Unimodal',
    color: '#c2410c',
    bgColor: '#ffedd5',
    description: 'Single group detected by both tests'
  },
  insufficient_data: {
    label: 'Insufficient Data',
    color: '#9ca3af',
    bgColor: '#f9fafb',
    description: 'Need at least 10 samples for analysis'
  }
}

const BimodalityIndicator: React.FC<BimodalityIndicatorProps> = ({ bimodality }) => {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!bimodality) return null

  const config = STATE_CONFIG[bimodality.state] || STATE_CONFIG.uncertain
  const dipSignificant = bimodality.dip_pvalue < 0.05

  // Format weights as percentages
  const weight1 = Math.round(bimodality.gmm_weights[0] * 100)
  const weight2 = Math.round(bimodality.gmm_weights[1] * 100)

  return (
    <div
      className="bimodality-indicator"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="bimodality-indicator__badge"
        style={{ color: config.color, backgroundColor: config.bgColor }}
      >
        {config.label}
      </span>

      {showTooltip && (
        <div className="bimodality-indicator__tooltip">
          <div className="bimodality-indicator__tooltip-title">Distribution Analysis</div>
          <div className="bimodality-indicator__tooltip-description">{config.description}</div>
          <div className="bimodality-indicator__tooltip-divider" />

          {/* Dip Test Section */}
          <div className="bimodality-indicator__tooltip-section">
            <div className="bimodality-indicator__tooltip-section-title">Hartigan's Dip Test</div>
            <div className="bimodality-indicator__tooltip-row">
              <span className="bimodality-indicator__tooltip-label">p-value:</span>
              <span className={`bimodality-indicator__tooltip-value ${dipSignificant ? 'bimodality-indicator__tooltip-value--significant' : ''}`}>
                {bimodality.dip_pvalue.toFixed(3)}
              </span>
            </div>
            <div className="bimodality-indicator__tooltip-hint">
              {dipSignificant ? '✓ Significant (p < 0.05): suggests multimodality' : '○ Not significant: consistent with unimodality'}
            </div>
          </div>

          {/* GMM Section */}
          <div className="bimodality-indicator__tooltip-section">
            <div className="bimodality-indicator__tooltip-section-title">Gaussian Mixture Model</div>
            <div className="bimodality-indicator__tooltip-row">
              <span className="bimodality-indicator__tooltip-label">Best fit:</span>
              <span className={`bimodality-indicator__tooltip-value ${bimodality.gmm_better_k === 2 ? 'bimodality-indicator__tooltip-value--significant' : ''}`}>
                {bimodality.gmm_better_k === 2 ? '2 components' : '1 component'}
              </span>
            </div>
            <div className="bimodality-indicator__tooltip-row">
              <span className="bimodality-indicator__tooltip-label">Group sizes:</span>
              <span className="bimodality-indicator__tooltip-value">
                {weight1}% / {weight2}%
              </span>
            </div>
            <div className="bimodality-indicator__tooltip-hint">
              {bimodality.gmm_better_k === 2
                ? '✓ Two balanced groups detected'
                : weight2 < 10
                  ? `○ Minor group too small (${weight2}% < 10% threshold)`
                  : '○ Single group fits better'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BimodalityIndicator
