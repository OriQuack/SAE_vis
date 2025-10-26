// ============================================================================
// TAG MANAGEMENT PANEL COMPONENT
// Main orchestrator for tag assignment workflow with pre-defined templates
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import type { MetricSignature, MetricWeights, FeatureTableRow } from '../types'
import { inferMetricSignature, extractMetricValues, inferMetricWeights } from '../lib/tag-utils'
import { useResizeObserver } from '../lib/utils'
import {
  calculateRadarLayout,
  pointsToPath,
  calculateRangeAreaPath,
  signatureToRadarValues,
  valuesToRadarPoints,
  metricsToRadarPath,
  RADAR_METRICS
} from '../lib/d3-radar-utils'
import '../styles/TagManagementPanel.css'

// ============================================================================
// SELECTED FEATURES LIST SUB-COMPONENT
// ============================================================================

interface SelectedFeaturesListProps {
  featureIds: Set<number>
  className?: string
}

const SelectedFeaturesList: React.FC<SelectedFeaturesListProps> = ({
  featureIds,
  className = ''
}) => {
  const removeFromSelection = useVisualizationStore(state => state.removeFromSelection)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)

  const sortedIds = useMemo(() => Array.from(featureIds).sort((a, b) => a - b), [featureIds])
  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    // Throttled scroll handler using requestAnimationFrame
    const handleScroll = () => {
      if (rafIdRef.current !== null) return // Already scheduled

      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    // Initial measurement (immediate)
    updateScrollState()

    // Scroll events (throttled with RAF)
    list.addEventListener('scroll', handleScroll)

    // Resize events (immediate, since they're infrequent)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [sortedIds])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  if (sortedIds.length === 0) {
    return (
      <div className={`selected-features-list ${className}`}>
        <p className="selected-features-list__empty">
          No features selected. Select features from the table below.
        </p>
      </div>
    )
  }

  return (
    <div className={`selected-features-list ${className}`}>
      <div className="selected-features-list__list" ref={listRef}>
        {sortedIds.map(id => (
          <div
            key={id}
            className="selected-item"
            onClick={() => setHighlightedFeature(id)}
            style={{ cursor: 'pointer' }}
            title="Click to jump to feature in table"
          >
            <span className="selected-item__id">F{id}</span>
            <button
              className="selected-item__btn"
              onClick={(e) => {
                e.stopPropagation()
                removeFromSelection(id)
              }}
              title="Remove from selection"
            >
              ✗
            </button>
          </div>
        ))}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TAG RADAR VIEW SUB-COMPONENT
// ============================================================================

interface TagRadarViewProps {
  selectedFeatures: FeatureTableRow[]
  signature: MetricSignature
  inferredSignature: MetricSignature
  onSignatureChange: (signature: MetricSignature) => void
  onResetToAuto: () => void
  width: number
  height: number
  activeTagId: string | null
  className?: string
}

const TagRadarView: React.FC<TagRadarViewProps> = ({
  selectedFeatures,
  signature,
  inferredSignature,
  onSignatureChange,
  onResetToAuto,
  width,
  height,
  activeTagId,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingAxis, setDraggingAxis] = useState<{ index: number; bound: 'min' | 'max' } | null>(null)

  // Define explicit margins for radar chart positioning
  const radarMargins = useMemo(() => ({
    top: 25,
    bottom: 55,
    left: 0,
    right: 130
  }), [])

  // Calculate layout using full width/height with explicit margins
  const layout = calculateRadarLayout(width, height, radarMargins)
  const { min, max } = signatureToRadarValues(signature)

  // Extract individual feature metrics for polygon rendering
  const featureMetrics = selectedFeatures.map(feature => extractMetricValues(feature))

  // Check if signature has been manually modified
  const hasManualChanges = useMemo(() => {
    return JSON.stringify(signature) !== JSON.stringify(inferredSignature)
  }, [signature, inferredSignature])

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
    const currentRange = signature[metricKey]

    if (draggingAxis.bound === 'min') {
      const newMin = Math.min(value, currentRange.max - 0.05)
      onSignatureChange({
        ...signature,
        [metricKey]: { ...currentRange, min: Math.max(0, newMin) }
      })
    } else {
      const newMax = Math.max(value, currentRange.min + 0.05)
      onSignatureChange({
        ...signature,
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
          strokeWidth="2"
          strokeDasharray="4 2"
        />

        {/* Max boundary */}
        <path
          d={maxPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
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
                r={isDragging ? 6 : 4}
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
                r={isDragging ? 6 : 4}
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
            r={3}
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
            r={3}
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
      {/* Reset to Auto button */}
      <button
        className="radar-reset-button"
        onClick={onResetToAuto}
        disabled={!hasManualChanges || !activeTagId}
        title={hasManualChanges ? "Reset thresholds to auto-inferred values" : "Thresholds are already at auto-inferred values"}
      >
        Reset to Auto
      </button>
    </div>
  )
}

// ============================================================================
// METRIC WEIGHTS PANEL SUB-COMPONENT (Stage 2)
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
  const updateMetricWeight = useVisualizationStore(state => state.updateMetricWeight)
  const resetWeightsToAuto = useVisualizationStore(state => state.resetWeightsToAuto)

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
  const autoWeights = useMemo(() =>
    selectedFeatureCount >= 3 ? inferMetricWeights(signature) : equalWeights,
    [signature, selectedFeatureCount]
  )

  // Use tag's custom weights or auto-inferred weights
  const displayWeights: MetricWeights = activeTag?.metricWeights || currentWeights || autoWeights

  // Determine if showing equal weights due to insufficient features
  const isEqualWeights = selectedFeatureCount < 3 && !activeTag?.metricWeights

  const handleWeightChange = (metric: keyof MetricWeights, value: number) => {
    updateMetricWeight(metric, value)
  }

  return (
    <div className={`metric-weights-panel ${className}`}>
      <div className="metric-weights-panel__header">
        <h5 className="metric-weights-panel__title">Metric Weights</h5>
        <button
          className="metric-weights-panel__reset"
          onClick={resetWeightsToAuto}
          disabled={!activeTag?.metricWeights}
          title="Reset to auto-inferred weights"
        >
          Reset to Auto
        </button>
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
// CANDIDATES LIST SUB-COMPONENT (Stage 2)
// ============================================================================

interface CandidatesListProps {
  className?: string
}

const CandidatesList: React.FC<CandidatesListProps> = ({ className = '' }) => {
  const candidateFeatures = useVisualizationStore(state => state.candidateFeatures)
  const candidateStates = useVisualizationStore(state => state.candidateStates)
  const acceptCandidate = useVisualizationStore(state => state.acceptCandidate)
  const rejectCandidate = useVisualizationStore(state => state.rejectCandidate)
  const markCandidateUnsure = useVisualizationStore(state => state.markCandidateUnsure)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    const handleScroll = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    updateScrollState()
    list.addEventListener('scroll', handleScroll)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [candidateFeatures])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  if (candidateFeatures.length === 0) {
    return (
      <div className={`candidate-list ${className}`}>
        <p className="candidate-list__empty">
          No candidates found. Select features to find similar patterns.
        </p>
      </div>
    )
  }

  return (
    <div className={`candidate-list-wrapper ${className}`}>
      <div className="candidate-list" ref={listRef}>
        {candidateFeatures.map(candidate => {
          const state = candidateStates.get(candidate.featureId) || 'pending'

          return (
            <div
              key={candidate.featureId}
              className={`candidate-item candidate-item--${state}`}
              onClick={() => setHighlightedFeature(candidate.featureId)}
            >
              <span className="candidate-item__id">F{candidate.featureId}</span>
              <span
                className="candidate-item__score"
                style={{
                  color: candidate.score > 0.7 ? '#10b981' : candidate.score > 0.4 ? '#f59e0b' : '#ef4444'
                }}
              >
                {candidate.score.toFixed(2)}
              </span>
              <span className="candidate-item__metrics">
                E:{candidate.metricValues.embedding.toFixed(2)} F:{candidate.metricValues.fuzz.toFixed(2)} D:{candidate.metricValues.detection.toFixed(2)}
              </span>
              <div className="candidate-item__actions">
                <button
                  className="candidate-item__btn candidate-item__btn--accept"
                  onClick={(e) => {
                    e.stopPropagation()
                    acceptCandidate(candidate.featureId)
                  }}
                  title="Accept candidate"
                >
                  ✓
                </button>
                <button
                  className="candidate-item__btn candidate-item__btn--unsure"
                  onClick={(e) => {
                    e.stopPropagation()
                    markCandidateUnsure(candidate.featureId)
                  }}
                  title="Mark as unsure"
                >
                  ?
                </button>
                <button
                  className="candidate-item__btn candidate-item__btn--reject"
                  onClick={(e) => {
                    e.stopPropagation()
                    rejectCandidate(candidate.featureId)
                  }}
                  title="Reject candidate"
                >
                  ✗
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// REJECTED LIST SUB-COMPONENT (Stage 2)
// ============================================================================

interface RejectedListProps {
  className?: string
}

const RejectedList: React.FC<RejectedListProps> = ({ className = '' }) => {
  const activeTagId = useVisualizationStore(state => state.activeTagId)
  const tags = useVisualizationStore(state => state.tags)
  const undoRejection = useVisualizationStore(state => state.undoRejection)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  const activeTag = tags.find(t => t.id === activeTagId)
  const rejectedIds = useMemo(() => Array.from(activeTag?.rejectedFeatureIds || []).sort((a, b) => a - b), [activeTag?.rejectedFeatureIds])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    const handleScroll = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    updateScrollState()
    list.addEventListener('scroll', handleScroll)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [rejectedIds])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  if (rejectedIds.length === 0) {
    return (
      <div className={`rejected-list ${className}`}>
        <p className="rejected-list__empty">
          No rejected features yet.
        </p>
      </div>
    )
  }

  return (
    <div className={`rejected-list-wrapper ${className}`}>
      <div className="rejected-list" ref={listRef}>
        {rejectedIds.map(id => (
          <div
            key={id}
            className="rejected-item"
            onClick={() => setHighlightedFeature(id)}
            style={{ cursor: 'pointer' }}
            title="Click to jump to feature in table"
          >
            <span className="rejected-item__id">F{id}</span>
            <button
              className="rejected-item__btn"
              onClick={(e) => {
                e.stopPropagation()
                activeTagId && undoRejection(activeTagId, id)
              }}
              title="Move to candidates"
            >
              ←
            </button>
          </div>
        ))}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TagManagementPanel: React.FC = () => {
  // Store state
  const tags = useVisualizationStore(state => state.tags)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const activeTagId = useVisualizationStore(state => state.activeTagId)
  const tableData = useVisualizationStore(state => state.tableData)
  const candidateFeatures = useVisualizationStore(state => state.candidateFeatures)

  // Store actions
  const createTag = useVisualizationStore(state => state.createTag)
  const setActiveTag = useVisualizationStore(state => state.setActiveTag)
  const assignFeaturesToTag = useVisualizationStore(state => state.assignFeaturesToTag)
  const refreshCandidates = useVisualizationStore(state => state.refreshCandidates)

  // Method selection
  const candidateMethod = useVisualizationStore(state => state.candidateMethod)
  const toggleRangeFilter = useVisualizationStore(state => state.toggleRangeFilter)
  const toggleWeightedDistance = useVisualizationStore(state => state.toggleWeightedDistance)
  const stdMultiplier = useVisualizationStore(state => state.stdMultiplier)
  const setStdMultiplier = useVisualizationStore(state => state.setStdMultiplier)

  // Local state for adding new tags
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [showRangeInfo, setShowRangeInfo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get active tag
  const activeTag = tags.find(t => t.id === activeTagId)

  // Get selected features from table data
  const selectedFeatures = useMemo(() => {
    if (!tableData || !tableData.features) return []
    return tableData.features.filter((f: FeatureTableRow) =>
      selectedFeatureIds.has(f.feature_id)
    )
  }, [tableData, selectedFeatureIds])

// Infer signature from selected features
  const inferredSignature = useMemo(() => {
    if (selectedFeatures.length === 0) {
      return {
        feature_splitting: { min: 0.0, max: 1.0 },
        embedding: { min: 0.0, max: 1.0 },
        fuzz: { min: 0.0, max: 1.0 },
        detection: { min: 0.0, max: 1.0 },
        semantic_similarity: { min: 0.0, max: 1.0 },
        quality_score: { min: 0.0, max: 1.0 }
      }
    }
    return inferMetricSignature(selectedFeatures, stdMultiplier)
  }, [selectedFeatures, stdMultiplier])

  // Local state for manually adjusted signature
  const [manualSignature, setManualSignature] = React.useState<MetricSignature>(inferredSignature)

  // Update manual signature when inferred changes
  React.useEffect(() => {
    setManualSignature(inferredSignature)
  }, [inferredSignature])

  // Scroll tracking for template tags list
  const [tagListScrollState, setTagListScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const tagListRef = useRef<HTMLDivElement>(null)
  const tagListRafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const list = tagListRef.current
    if (!list) return

    const updateScrollState = () => {
      setTagListScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    // Throttled scroll handler using requestAnimationFrame
    const handleScroll = () => {
      if (tagListRafIdRef.current !== null) return // Already scheduled

      tagListRafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        tagListRafIdRef.current = null
      })
    }

    // Initial measurement (immediate)
    updateScrollState()

    // Scroll events (throttled with RAF)
    list.addEventListener('scroll', handleScroll)

    // Resize events (immediate, since they're infrequent)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (tagListRafIdRef.current !== null) {
        cancelAnimationFrame(tagListRafIdRef.current)
      }
    }
  }, [tags])

  // Resize observer for responsive layout
  const containerElementRef = React.useRef<HTMLDivElement | null>(null)
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 1920,
    defaultHeight: 540,
    debounceMs: 16,
    debugId: 'tag-panel'
  })

  // Combined ref callback
  const setContainerRef = React.useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node
    containerRef(node)
  }, [containerRef])

  // Calculate column dimensions from container size
  const columnDimensions = useMemo(() => {
    const columnWidth = (containerSize.width) / 4

    const panelVerticalPadding = 2 * 8
    const columnHeight = containerSize.height - panelVerticalPadding

    const columnBorder = 2
    const titleHeight = 24
    const radarWidth = columnWidth
    const radarHeight = columnHeight - columnBorder - titleHeight

    return {
      columnWidth,
      columnHeight,
      radarWidth,
      radarHeight
    }
  }, [containerSize.width, containerSize.height])

  // Handle signature manual adjustment
  const handleSignatureChange = (signature: MetricSignature) => {
    setManualSignature(signature)
  }

  // Handle reset thresholds to auto
  const handleResetThresholdsToAuto = () => {
    setManualSignature(inferredSignature)
  }

  // Handle tag assignment
  const handleAssignFeatures = () => {
    if (!activeTagId) {
      alert('Please select a tag first')
      return
    }

    if (selectedFeatureIds.size === 0) {
      alert('No features selected. Please select features from the table.')
      return
    }

    assignFeaturesToTag(activeTagId)
    alert(`Assigned ${selectedFeatureIds.size} features to tag "${activeTag?.name}"`)
  }

  // Handle add tag button click
  const handleAddTagClick = () => {
    setIsAddingTag(true)
    setNewTagName('')
  }

  // Handle creating new tag
  const handleCreateTag = () => {
    const trimmedName = newTagName.trim()
    if (trimmedName === '') {
      setIsAddingTag(false)
      setNewTagName('')
      return
    }

    const newTagId = createTag(trimmedName)
    setActiveTag(newTagId)
    setIsAddingTag(false)
    setNewTagName('')
  }

  // Handle input key press
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateTag()
    } else if (e.key === 'Escape') {
      setIsAddingTag(false)
      setNewTagName('')
    }
  }

  // Auto-focus input when entering add mode
  React.useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingTag])

  // Auto-refresh candidates when selection or active tag changes (Stage 2)
  React.useEffect(() => {
    // Debounce to avoid excessive computation
    const timeoutId = setTimeout(() => {
      refreshCandidates()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [selectedFeatureIds, activeTagId, refreshCandidates])

  // Calculate scroll indicator position for template tags list
  const tagListMaxScroll = tagListScrollState.scrollHeight - tagListScrollState.clientHeight
  const tagListScrollPercent = tagListMaxScroll > 0 ? tagListScrollState.scrollTop / tagListMaxScroll : 0
  const tagListIsScrollable = tagListScrollState.scrollHeight > tagListScrollState.clientHeight

  // Get counts for Column 3 titles
  const rejectedCount = activeTag?.rejectedFeatureIds?.size || 0

  return (
    <div className="tag-management-panel" ref={setContainerRef}>
      <div className="tag-panel__grid">
        {/* Column 1: Template Tags */}
        <div className="tag-panel__column tag-panel__templates">
          <h4 className="tag-panel__column-title">Tags</h4>
          <div className="template-tags-list-wrapper">
            <div className="template-tags-list" ref={tagListRef}>
              {tags.map(tag => (
                <div
                  key={tag.id}
                  className={`template-tag-card ${activeTagId === tag.id ? 'template-tag-card--active' : ''}`}
                  onClick={() => setActiveTag(activeTagId === tag.id ? null : tag.id)}
                  title={activeTagId === tag.id ? 'Click to deselect' : `Click to select ${tag.name}`}
                >
                  <div className="template-tag-card__info">
                    <div className="template-tag-card__name">{tag.name}</div>
                    <div className="template-tag-card__count">
                      {tag.featureIds.size} feature{tag.featureIds.size !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add new tag button/input */}
              {isAddingTag ? (
                <div className="template-tag-card template-tag-card--add-mode">
                  <input
                    ref={inputRef}
                    type="text"
                    className="template-tag-card__input"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onBlur={handleCreateTag}
                    placeholder="Enter tag name..."
                    maxLength={50}
                  />
                </div>
              ) : (
                <div
                  className="template-tag-card template-tag-card--add"
                  onClick={handleAddTagClick}
                  title="Add new tag"
                >
                  <div className="template-tag-card__info">
                    <div className="template-tag-card__name template-tag-card__name--add">
                      + Add New Tag
                    </div>
                  </div>
                </div>
              )}
            </div>
            {tagListIsScrollable && (
              <div className="scroll-indicator">
                <div
                  className="scroll-indicator__thumb"
                  style={{
                    height: `${(tagListScrollState.clientHeight / tagListScrollState.scrollHeight) * 100}%`,
                    top: `${tagListScrollPercent * (100 - (tagListScrollState.clientHeight / tagListScrollState.scrollHeight) * 100)}%`
                  }}
                />
              </div>
            )}
          </div>

          {/* Assign Button - always visible with different states */}
          <button
            className="assign-button"
            onClick={handleAssignFeatures}
            disabled={!activeTagId || selectedFeatureIds.size === 0}
            title={
              !activeTagId
                ? 'Select a tag first'
                : selectedFeatureIds.size === 0
                ? 'Select features from the table first'
                : `Assign ${selectedFeatureIds.size} features to ${activeTag?.name}`
            }
          >
            {!activeTagId
              ? 'Select a Tag'
              : `Add ${selectedFeatureIds.size} Feature${selectedFeatureIds.size !== 1 ? 's' : ''}`
            }
          </button>
        </div>

        {/* Column 2 & 3 MERGED: Candidate Discovery Methods */}
        <div className="tag-panel__column tag-panel__discovery">
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
              {showRangeInfo && (
                <div className="range-info-popover">
                  <h6 className="range-info-popover__title">Range Calculation</h6>
                  <p className="range-info-popover__formula">
                    Metric ranges are calculated as:<br/>
                    <strong>μ ± n·σ</strong>
                  </p>
                  <p className="range-info-popover__description">
                    where μ is mean, σ is standard deviation,<br/>
                    and n controls the range width.
                  </p>
                  <div className="range-multiplier-control">
                    <label className="range-multiplier-control__label">Multiplier (n):</label>
                    <select
                      className="range-multiplier-control__select"
                      value={stdMultiplier}
                      onChange={(e) => setStdMultiplier(parseFloat(e.target.value))}
                    >
                      <option value="1.0">1.0σ (~68%)</option>
                      <option value="1.5">1.5σ (~87%)</option>
                      <option value="2.0">2.0σ (~95%)</option>
                      <option value="2.5">2.5σ (~99%)</option>
                      <option value="3.0">3.0σ (~99.7%)</option>
                    </select>
                  </div>
                  <div className="range-info-popover__current">
                    Current: μ ± {stdMultiplier}σ
                  </div>
                </div>
              )}
              <TagRadarView
                selectedFeatures={selectedFeatures}
                signature={manualSignature}
                inferredSignature={inferredSignature}
                onSignatureChange={handleSignatureChange}
                onResetToAuto={handleResetThresholdsToAuto}
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
                <button
                  className={`method-status-btn ${candidateMethod.useWeightedDistance ? 'method-status-btn--active' : ''}`}
                  onClick={toggleWeightedDistance}
                  title={candidateMethod.useWeightedDistance ? "Disable Weighted Distance" : "Enable Weighted Distance"}
                >
                  {candidateMethod.useWeightedDistance ? '✓' : '○'}
                </button>
              </div>
              <MetricWeightsPanel
                signature={manualSignature}
                activeTagId={activeTagId}
                selectedFeatureCount={selectedFeatures.length}
              />
            </div>
          </div>
        </div>

        {/* Column 4: Feature Lists */}
        <div className="tag-panel__column tag-panel__features">
          <h4 className="tag-panel__column-title">Validation</h4>
          <div className={`feature-lists ${!activeTagId ? 'feature-lists--disabled' : ''}`}>
            <div className="feature-list feature-list--selected">
              <h5 className="feature-list__title">Selected ({selectedFeatureIds.size})</h5>
              <SelectedFeaturesList featureIds={selectedFeatureIds} />
            </div>
            <div className="feature-list feature-list--candidates">
              <h5 className="feature-list__title">
                Top Candidates ({candidateFeatures.length})
                <span className="feature-list__subtitle">up to 20 shown</span>
              </h5>
              <CandidatesList />
            </div>
            <div className="feature-list feature-list--rejected">
              <h5 className="feature-list__title">Rejected ({rejectedCount})</h5>
              <RejectedList />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TagManagementPanel
