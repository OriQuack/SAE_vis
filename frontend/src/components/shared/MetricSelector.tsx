import React from 'react'
import type { MetricType } from '../../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface MetricSelectorProps {
  currentMetric: MetricType
  onChange: (metric: MetricType) => void
  disabled?: boolean
  className?: string
  label?: string
}

interface MetricOption {
  value: MetricType
  label: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const METRIC_OPTIONS: MetricOption[] = [
  { value: 'semdist_mean', label: 'Semantic Distance (Mean)' },
  { value: 'semdist_max', label: 'Semantic Distance (Max)' },
  { value: 'score_fuzz', label: 'Fuzz Score' },
  { value: 'score_simulation', label: 'Simulation Score' },
  { value: 'score_detection', label: 'Detection Score' },
  { value: 'score_embedding', label: 'Embedding Score' }
]

// ============================================================================
// METRIC SELECTOR COMPONENT
// ============================================================================

export const MetricSelector: React.FC<MetricSelectorProps> = ({
  currentMetric,
  onChange,
  disabled = false,
  className = '',
  label = 'Metric:'
}) => (
  <div className={`metric-selector ${className}`}>
    <label className="metric-selector__label">{label}</label>
    <select
      className="metric-selector__select"
      value={currentMetric}
      onChange={(e) => onChange(e.target.value as MetricType)}
      disabled={disabled}
    >
      {METRIC_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  </div>
)

export default MetricSelector