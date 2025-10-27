// ============================================================================
// TAG CANDIDATE METHOD COMPONENT
// Candidate discovery methods: Range-Based Filtering and Weighted Distance
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import type { MetricSignature, MetricWeights, FeatureTableRow } from '../types'
import { extractMetricValues } from '../lib/tag-utils'
import {
  calculateRadarLayout,
  pointsToPath,
  signatureToRadarValues,
  valuesToRadarPoints,
  metricsToRadarPath,
  RADAR_METRICS
} from '../lib/d3-radar-utils'
import '../styles/TagCandidateMethod.css'

// ============================================================================
// TAG RADAR VIEW SUB-COMPONENT
// ============================================================================

interface TagRadarViewProps {
  selectedFeatures: FeatureTableRow[]
  signature: MetricSignature
  inferredSignature: MetricSignature
  onSignatureChange: (signature: MetricSignature) => void
  width: number
  height: number
  activeTagId: string | null
  className?: string
}

const TagRadarView: React.FC<TagRadarViewProps> = ({
  selectedFeatures,
  signature,
  onSignatureChange,
  width,
  height,
  activeTagId,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingAxis, setDraggingAxis] = useState<{ index: number; bound: 'min' | 'max' } | null>(null)
  const candidateMethod = useVisualizationStore(state => state.candidateMethod)

  // Define explicit margins for radar chart positioning
  const radarMargins = useMemo(() => ({
    top: 25,
    bottom: 55,
    left: 0,
    right: 130
  }), [])

  // Full range signature for when range filter is disabled
  const fullRangeSignature: MetricSignature = useMemo(() => ({
    feature_splitting: { min: 0.0, max: 1.0 },
    embedding: { min: 0.0, max: 1.0 },
    fuzz: { min: 0.0, max: 1.0 },
    detection: { min: 0.0, max: 1.0 },
    semantic_similarity: { min: 0.0, max: 1.0 },
    quality_score: { min: 0.0, max: 1.0 }
  }), [])

  // When range filter is disabled, always show full range (min: 0.0, max: 1.0)
  // Otherwise, use the provided signature
  const displaySignature = !candidateMethod.useRangeFilter ? fullRangeSignature : signature

  // Calculate layout using full width/height with explicit margins
  const layout = calculateRadarLayout(width, height, radarMargins)
  const { min, max } = signatureToRadarValues(displaySignature)

  // Extract individual feature metrics for polygon rendering
  const featureMetrics = selectedFeatures.map(feature => extractMetricValues(feature))

  // Legend positioning constants (dependent on container)
  const legendConfig = useMemo(() => ({
    containerX: width - 135,  // 60px from right edge
    containerY: 125,           // 5px from top
    containerWidth: 40,
    containerHeight: 35,
    circleX: width - 125,     // 10px inside container
    minCircleY: 135,
    maxCircleY: 150,
    textX: width - 117,       // 10px right of circle
    minTextY: 138,
    maxTextY: 153
  }), [width])

  // Handle mouse/touch events for interactive editing
  const handlePointerDown = (e: React.PointerEvent, axisIndex: number, bound: 'min' | 'max') => {
    if (!activeTagId) return  // Disable interaction when no tag is selected
    e.preventDefault()
    setDraggingAxis({ index: axisIndex, bound })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingAxis || !svgRef.current) return

    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const dx = x - layout.centerX
    const dy = y - layout.centerY
    const distance = Math.sqrt(dx * dx + dy * dy)

    let value = Math.max(0, Math.min(1, distance / layout.radius))
    value = Math.round(value * 20) / 20  // 0.05 step size

    const metricKey = RADAR_METRICS[draggingAxis.index].key as keyof MetricSignature
    const currentRange = displaySignature[metricKey]

    if (draggingAxis.bound === 'min') {
      const newMin = Math.min(value, currentRange.max - 0.05)
      onSignatureChange({
        ...displaySignature,
        [metricKey]: { ...currentRange, min: Math.max(0, newMin) }
      })
    } else {
      const newMax = Math.max(value, currentRange.min + 0.05)
      onSignatureChange({
        ...displaySignature,
        [metricKey]: { ...currentRange, max: Math.min(1, newMax) }
      })
    }
  }

  const handlePointerUp = () => {
    setDraggingAxis(null)
  }

  useEffect(() => {
    const handleGlobalPointerUp = () => setDraggingAxis(null)
    document.addEventListener('pointerup', handleGlobalPointerUp)
    return () => document.removeEventListener('pointerup', handleGlobalPointerUp)
  }, [])

  // Generate paths for boundary (using D3 utility for calculation)
  const minPath = pointsToPath(valuesToRadarPoints(min, layout))
  const maxPath = pointsToPath(valuesToRadarPoints(max, layout))

  return (
    <div className={`tag-radar-view ${className}`}>
      {/* Left: Radar Chart */}
      <div className="tag-radar-view__chart">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="tag-radar-view__svg"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none', userSelect: 'none' }}
        >
        {/* Background grid */}
        {layout.levels.map((level) => (
          <g key={level.level}>
            <polygon
              points={level.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          </g>
        ))}

        {/* Axes */}
        {layout.axes.map((axis) => (
          <g key={axis.key}>
            <line
              x1={layout.centerX}
              y1={layout.centerY}
              x2={axis.lineEnd.x}
              y2={axis.lineEnd.y}
              stroke="#d1d5db"
              strokeWidth="1"
            />
            <text
              x={axis.labelPosition.x}
              y={axis.labelPosition.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill={axis.color}
            >
              {axis.label}
            </text>
          </g>
        ))}

        {/* Individual feature polygons */}
        {featureMetrics.map((metrics, idx) => (
          <path
            key={`feature-${idx}`}
            d={metricsToRadarPath(metrics, layout)}
            fill="#6366f1"
            fillOpacity="0.08"
            stroke="#6366f1"
            strokeWidth="1"
            strokeOpacity="0.2"
          />
        ))}

        {/* Min boundary */}
        <path
          d={minPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="4 2"
        />

        {/* Max boundary */}
        <path
          d={maxPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1"
        />

        {/* Interactive handles on min boundary */}
        {min.map((value, i) => {
          const angle = (360 / 6) * i
          const radius = value * layout.radius
          const angleRad = (angle - 90) * Math.PI / 180
          const x = layout.centerX + radius * Math.cos(angleRad)
          const y = layout.centerY + radius * Math.sin(angleRad)
          const isDragging = draggingAxis?.index === i && draggingAxis.bound === 'min'
          const metricColor = layout.axes[i].color  // Get color from metric

          return (
            <g key={`min-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={isDragging ? 5 : 3}
                fill="white"
                stroke={metricColor}
                strokeWidth="2"
                style={{ cursor: activeTagId ? 'grab' : 'not-allowed', opacity: activeTagId ? 1 : 0.5 }}
                onPointerDown={(e) => handlePointerDown(e, i, 'min')}
              />
              {isDragging && (
                <>
                  <rect
                    x={x - 20}
                    y={y - 24}
                    width={40}
                    height={18}
                    rx={4}
                    fill="#1f2937"
                    opacity={0.9}
                  />
                  <text
                    x={x}
                    y={y - 13}
                    textAnchor="middle"
                    fontSize="11"
                    fill="white"
                    fontWeight="600"
                    pointerEvents="none"
                  >
                    {value.toFixed(2)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Interactive handles on max boundary */}
        {max.map((value, i) => {
          const angle = (360 / 6) * i
          const radius = value * layout.radius
          const angleRad = (angle - 90) * Math.PI / 180
          const x = layout.centerX + radius * Math.cos(angleRad)
          const y = layout.centerY + radius * Math.sin(angleRad)
          const isDragging = draggingAxis?.index === i && draggingAxis.bound === 'max'
          const metricColor = layout.axes[i].color  // Get color from metric

          return (
            <g key={`max-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={isDragging ? 5 : 3}
                fill={metricColor}
                stroke={metricColor}
                strokeWidth="2"
                style={{ cursor: activeTagId ? 'grab' : 'not-allowed', opacity: activeTagId ? 1 : 0.5 }}
                onPointerDown={(e) => handlePointerDown(e, i, 'max')}
              />
              {isDragging && (
                <>
                  <rect
                    x={x - 20}
                    y={y + 8}
                    width={40}
                    height={18}
                    rx={4}
                    fill="#1f2937"
                    opacity={0.9}
                  />
                  <text
                    x={x}
                    y={y + 19}
                    textAnchor="middle"
                    fontSize="11"
                    fill="white"
                    fontWeight="600"
                    pointerEvents="none"
                  >
                    {value.toFixed(2)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Legend - Positioned relative to container */}
        <g className="radar-legend">
          {/* Legend container background */}
          <rect
            x={legendConfig.containerX}
            y={legendConfig.containerY}
            width={legendConfig.containerWidth}
            height={legendConfig.containerHeight}
            rx={4}
            fill="white"
            stroke="#d1d5db"
            strokeWidth="1"
            opacity="0.95"
          />

          {/* Min threshold example */}
          <circle
            cx={legendConfig.circleX}
            cy={legendConfig.minCircleY}
            r={2.5}
            fill="white"
            stroke="#9ca3af"
            strokeWidth="1.5"
          />
          <text
            x={legendConfig.textX}
            y={legendConfig.minTextY}
            fontSize="9"
            fill="#6b7280"
            fontWeight="500"
          >
            Min
          </text>

          {/* Max threshold example */}
          <circle
            cx={legendConfig.circleX}
            cy={legendConfig.maxCircleY}
            r={2.5}
            fill="#9ca3af"
            stroke="#9ca3af"
            strokeWidth="1.5"
          />
          <text
            x={legendConfig.textX}
            y={legendConfig.maxTextY}
            fontSize="9"
            fill="#6b7280"
            fontWeight="500"
          >
            Max
          </text>
        </g>
        </svg>
      </div>
    </div>
  )
}

// ============================================================================
// METRIC WEIGHTS PANEL SUB-COMPONENT
// ============================================================================

interface MetricWeightsPanelProps {
  signature: MetricSignature
  activeTagId: string | null
  selectedFeatureCount: number
  className?: string
}

const MetricWeightsPanel: React.FC<MetricWeightsPanelProps> = ({
  signature,
  activeTagId,
  selectedFeatureCount,
  className = ''
}) => {
  const activeTag = useVisualizationStore(state =>
    state.tags.find(t => t.id === activeTagId)
  )
  const currentWeights = useVisualizationStore(state => state.currentWeights)
  const candidateMethod = useVisualizationStore(state => state.candidateMethod)
  const updateMetricWeight = useVisualizationStore(state => state.updateMetricWeight)

  // Equal weights for when < 3 features (unstable inference)
  const equalWeights: MetricWeights = {
    feature_splitting: 1.0,
    embedding: 1.0,
    fuzz: 1.0,
    detection: 1.0,
    semantic_similarity: 1.0,
    quality_score: 1.0
  }

  // Compute auto-inferred weights from signature (only when >= 3 features)
  const autoWeights = useMemo(() => {
    if (selectedFeatureCount < 3) return equalWeights

    // inferMetricWeights from tag-utils
    const inferMetricWeights = (sig: MetricSignature): MetricWeights => {
      const ranges = Object.entries(sig).map(([key, range]) => ({
        key: key as keyof MetricSignature,
        range: range.max - range.min
      }))

      const minRange = Math.min(...ranges.map(r => r.range))
      const maxRange = Math.max(...ranges.map(r => r.range))

      const weights: Partial<MetricWeights> = {}
      ranges.forEach(({ key, range }) => {
        if (maxRange === minRange) {
          weights[key] = 1.0
        } else {
          weights[key] = 1.0 + (2.0 * (1 - (range - minRange) / (maxRange - minRange)))
        }
      })

      return weights as MetricWeights
    }

    return inferMetricWeights(signature)
  }, [signature, selectedFeatureCount])

  // When weighted distance is disabled, always show uniform 1.0 weights
  // Otherwise, use tag's custom weights or auto-inferred weights
  const displayWeights: MetricWeights = !candidateMethod.useWeightedDistance
    ? equalWeights
    : (activeTag?.metricWeights || currentWeights || autoWeights)

  // Determine if showing equal weights due to insufficient features
  const isEqualWeights = selectedFeatureCount < 3 && !activeTag?.metricWeights

  const handleWeightChange = (metric: keyof MetricWeights, value: number) => {
    updateMetricWeight(metric, value)
  }

  return (
    <div className={`metric-weights-panel ${className}`}>
      <div className="metric-weights-panel__header">
        <h5 className="metric-weights-panel__title">Metric Weights</h5>
      </div>
      <div className="metric-weight-list">
        {RADAR_METRICS.map((metric) => {
          const metricKey = metric.key as keyof MetricWeights
          const weight = displayWeights[metricKey]
          const isCustom = activeTag?.metricWeights?.[metricKey] !== undefined

          return (
            <div key={metric.key} className="metric-weight-item">
              <div className="metric-weight-item__label" style={{ color: metric.color }}>
                {metric.label}
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.05"
                value={weight}
                onChange={(e) => handleWeightChange(metricKey, parseFloat(e.target.value))}
                className="metric-weight-item__slider"
                disabled={!activeTagId}
              />
              <div className="metric-weight-item__value">
                {weight.toFixed(2)}
                {!isCustom && <span className="metric-weight-item__auto"> (Auto)</span>}
              </div>
            </div>
          )
        })}
      </div>
      {isEqualWeights && (
        <div className="metric-weights-panel__info">
          Using equal weights (1.0) - select 3+ features for auto-inferred weights
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN TAG CANDIDATE METHOD COMPONENT
// ============================================================================

interface TagCandidateMethodProps {
  selectedFeatures: FeatureTableRow[]
  inferredSignature: MetricSignature
  manualSignature: MetricSignature
  onSignatureChange: (signature: MetricSignature) => void
  onResetSignature: () => void
  columnDimensions: {
    radarWidth: number
    radarHeight: number
  }
  className?: string
}

const TagCandidateMethod: React.FC<TagCandidateMethodProps> = ({
  selectedFeatures,
  inferredSignature,
  manualSignature,
  onSignatureChange,
  onResetSignature,
  columnDimensions,
  className = ''
}) => {
  // Store state
  const activeTagId = useVisualizationStore(state => state.activeTagId)
  const candidateMethod = useVisualizationStore(state => state.candidateMethod)
  const stdMultiplier = useVisualizationStore(state => state.stdMultiplier)
  const activeTag = useVisualizationStore(state =>
    state.tags.find(t => t.id === state.activeTagId)
  )

  // Store actions
  const toggleRangeFilter = useVisualizationStore(state => state.toggleRangeFilter)
  const toggleWeightedDistance = useVisualizationStore(state => state.toggleWeightedDistance)
  const setStdMultiplier = useVisualizationStore(state => state.setStdMultiplier)
  const resetWeightsToAuto = useVisualizationStore(state => state.resetWeightsToAuto)

  // Local state
  const [showRangeInfo, setShowRangeInfo] = useState(false)
  const [showWeightInfo, setShowWeightInfo] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popovers on ESC key
  useEffect(() => {
    if (!showRangeInfo && !showWeightInfo) return

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowRangeInfo(false)
        setShowWeightInfo(false)
      }
    }

    document.addEventListener('keydown', handleEscKey)

    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [showRangeInfo, showWeightInfo])

  // Check if signature has been manually modified
  const hasManualChanges = useMemo(() => {
    return JSON.stringify(manualSignature) !== JSON.stringify(inferredSignature)
  }, [manualSignature, inferredSignature])

  return (
    <div className={`tag-panel__column tag-panel__discovery ${className}`}>
      <h4 className="tag-panel__column-title">Candidate Discovery Methods</h4>

      <div className="tag-panel__discovery-container">
        {/* Left section: Range-Based Filtering */}
        <div className={`tag-panel__discovery-section tag-panel__discovery-section--radar ${!candidateMethod.useRangeFilter ? 'tag-panel__discovery-section--dimmed' : ''}`}>
          <div className="tag-panel__section-header-row">
            <h5 className="tag-panel__discovery-section-header">Range-Based Filtering</h5>
            <div className="header-controls">
              <button
                className="info-btn"
                onClick={() => setShowRangeInfo(!showRangeInfo)}
                title="Configure range calculation"
              >
                ?
              </button>
              <button
                className={`method-status-btn ${candidateMethod.useRangeFilter ? 'method-status-btn--active' : ''}`}
                onClick={toggleRangeFilter}
                title={candidateMethod.useRangeFilter ? "Disable Range-Based Filtering" : "Enable Range-Based Filtering"}
              >
                {candidateMethod.useRangeFilter ? '✓' : '○'}
              </button>
            </div>
          </div>
          <button
            className="radar-reset-button"
            onClick={onResetSignature}
            disabled={!hasManualChanges || !activeTagId}
            title={hasManualChanges ? "Reset thresholds to auto-inferred values" : "Thresholds are already at auto-inferred values"}
          >
            Reset Auto
          </button>
          {showRangeInfo && (
            <div className="range-info-popover" ref={popoverRef}>
              <div className="range-info-popover__header">
                <h6 className="range-info-popover__title">Range Calculation</h6>
                <button
                  className="range-info-popover__close"
                  onClick={() => setShowRangeInfo(false)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <p className="range-info-popover__formula">
                <strong>mean ± n·std</strong>
              </p>
              <div className="range-multiplier-control">
                <label className="range-multiplier-control__label">Multiplier (n):</label>
                <select
                  className="range-multiplier-control__select"
                  value={stdMultiplier.toFixed(1)}
                  onChange={(e) => {
                    e.stopPropagation()
                    const newValue = parseFloat(e.target.value)
                    setStdMultiplier(newValue)
                  }}
                >
                  <option value="1.0">1.0 std (~68%)</option>
                  <option value="1.5">1.5 std (~87%)</option>
                  <option value="2.0">2.0 std (~95%)</option>
                  <option value="2.5">2.5 std (~99%)</option>
                  <option value="3.0">3.0 std (~99.7%)</option>
                </select>
              </div>
            </div>
          )}
          <TagRadarView
            selectedFeatures={selectedFeatures}
            signature={manualSignature}
            inferredSignature={inferredSignature}
            onSignatureChange={onSignatureChange}
            width={columnDimensions.radarWidth}
            height={columnDimensions.radarHeight}
            activeTagId={activeTagId}
          />
        </div>

        {/* Vertical separator */}
        <div className="tag-panel__discovery-divider"></div>

        {/* Right section: Weighted Distance */}
        <div className={`tag-panel__discovery-section tag-panel__discovery-section--weights ${!candidateMethod.useWeightedDistance ? 'tag-panel__discovery-section--dimmed' : ''}`}>
          <div className="tag-panel__section-header-row">
            <h5 className="tag-panel__discovery-section-header">Weighted Distance</h5>
            <div className="header-controls">
              <button
                className="info-btn"
                onClick={() => setShowWeightInfo(!showWeightInfo)}
                title="How weighted distance works"
              >
                ?
              </button>
              <button
                className={`method-status-btn ${candidateMethod.useWeightedDistance ? 'method-status-btn--active' : ''}`}
                onClick={toggleWeightedDistance}
                title={candidateMethod.useWeightedDistance ? "Disable Weighted Distance" : "Enable Weighted Distance"}
              >
                {candidateMethod.useWeightedDistance ? '✓' : '○'}
              </button>
            </div>
          </div>
          <button
            className="metric-weights-panel__reset"
            onClick={resetWeightsToAuto}
            disabled={!activeTag?.metricWeights}
            title="Reset to auto-inferred weights"
          >
            Reset Auto
          </button>
          {showWeightInfo && (
            <div className="range-info-popover" ref={popoverRef}>
              <div className="range-info-popover__header">
                <h6 className="range-info-popover__title">Weighted Distance Calculation</h6>
                <button
                  className="range-info-popover__close"
                  onClick={() => setShowWeightInfo(false)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <p className="range-info-popover__formula">
                <strong>d = √(Σ w<sub>i</sub> · (x<sub>i</sub> - μ<sub>i</sub>)<sup>2</sup>)</strong>
              </p>
              <p className="range-info-popover__description">
                Calculates weighted Euclidean distance in metric space:
              </p>
              <ul className="range-info-popover__list">
                <li><strong>w<sub>i</sub></strong>: metric weight (importance)</li>
                <li><strong>x<sub>i</sub></strong>: feature metric value</li>
                <li><strong>μ<sub>i</sub></strong>: signature center (mean)</li>
              </ul>
            </div>
          )}
          <MetricWeightsPanel
            signature={manualSignature}
            activeTagId={activeTagId}
            selectedFeatureCount={selectedFeatures.length}
          />
        </div>
      </div>
    </div>
  )
}

export default TagCandidateMethod
