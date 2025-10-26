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
  const sortedIds = Array.from(featureIds).sort((a, b) => a - b)
  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLUListElement>(null)
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
      <ul className="selected-features-list__list" ref={listRef}>
        {sortedIds.map(id => (
          <li key={id} className="selected-features-list__item">
            Feature {id}
          </li>
        ))}
      </ul>
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
  onSignatureChange: (signature: MetricSignature) => void
  width: number
  height: number
  className?: string
}

const TagRadarView: React.FC<TagRadarViewProps> = ({
  selectedFeatures,
  signature,
  onSignatureChange,
  width,
  height,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingAxis, setDraggingAxis] = useState<{ index: number; bound: 'min' | 'max' } | null>(null)

  // Calculate responsive radar size from props (use 70% width for radar chart)
  const radarSize = useMemo(() => {
    const radarWidth = width * 0.6
    return {
      width: radarWidth,
      height: height,
      margin: 30  // Margin for radar chart padding
    }
  }, [width, height])

  // Calculate layout using responsive size
  const layout = calculateRadarLayout(radarSize.width, radarSize.height, radarSize.margin)
  const { min, max } = signatureToRadarValues(signature)

  // Extract individual feature metrics for polygon rendering
  const featureMetrics = selectedFeatures.map(feature => extractMetricValues(feature))

  // Handle mouse/touch events for interactive editing
  const handlePointerDown = (e: React.PointerEvent, axisIndex: number, bound: 'min' | 'max') => {
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
    value = Math.round(value * 10) / 10

    const metricKey = RADAR_METRICS[draggingAxis.index].key as keyof MetricSignature
    const currentRange = signature[metricKey]

    if (draggingAxis.bound === 'min') {
      const newMin = Math.min(value, currentRange.max - 0.1)
      onSignatureChange({
        ...signature,
        [metricKey]: { ...currentRange, min: Math.max(0, newMin) }
      })
    } else {
      const newMax = Math.max(value, currentRange.min + 0.1)
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

  // Generate paths for boundary
  const minPath = pointsToPath(
    min.map((value, i) => {
      const angle = (360 / 6) * i
      const radius = value * layout.radius
      const angleRad = (angle - 90) * Math.PI / 180
      return {
        x: layout.centerX + radius * Math.cos(angleRad),
        y: layout.centerY + radius * Math.sin(angleRad)
      }
    })
  )

  const maxPath = pointsToPath(
    max.map((value, i) => {
      const angle = (360 / 6) * i
      const radius = value * layout.radius
      const angleRad = (angle - 90) * Math.PI / 180
      return {
        x: layout.centerX + radius * Math.cos(angleRad),
        y: layout.centerY + radius * Math.sin(angleRad)
      }
    })
  )

  const areaPath = calculateRangeAreaPath(min, max, layout.centerX, layout.centerY, layout.radius)

  const featureToRadarPath = (metrics: ReturnType<typeof extractMetricValues>) => {
    const values = [
      metrics.feature_splitting,
      metrics.embedding,
      metrics.fuzz,
      metrics.detection,
      metrics.semantic_similarity,
      metrics.quality_score
    ]

    const points = values.map((value, i) => {
      const angle = (360 / 6) * i
      const radius = value * layout.radius
      const angleRad = (angle - 90) * Math.PI / 180
      return {
        x: layout.centerX + radius * Math.cos(angleRad),
        y: layout.centerY + radius * Math.sin(angleRad)
      }
    })

    return pointsToPath(points)
  }

  return (
    <div className={`tag-radar-view ${className}`}>
      {/* Left: Radar Chart */}
      <div className="tag-radar-view__chart">
        <svg
          ref={svgRef}
          width={radarSize.width}
          height={radarSize.height}
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
            d={featureToRadarPath(metrics)}
            fill="#6366f1"
            fillOpacity="0.08"
            stroke="#6366f1"
            strokeWidth="1"
            strokeOpacity="0.2"
          />
        ))}

        {/* Range area */}
        <path
          d={areaPath}
          fill="#3b82f6"
          fillOpacity="0.15"
          stroke="none"
          fillRule="evenodd"
        />

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
                style={{ cursor: 'grab' }}
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
                style={{ cursor: 'grab' }}
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
        </svg>
      </div>
    </div>
  )
}

// ============================================================================
// METRIC WEIGHTS PANEL SUB-COMPONENT (Stage 2)
// ============================================================================

interface MetricWeightsPanelProps {
  signature: MetricSignature
  activeTagId: string | null
  className?: string
}

const MetricWeightsPanel: React.FC<MetricWeightsPanelProps> = ({
  signature,
  activeTagId,
  className = ''
}) => {
  const activeTag = useVisualizationStore(state =>
    state.tags.find(t => t.id === activeTagId)
  )
  const currentWeights = useVisualizationStore(state => state.currentWeights)
  const updateMetricWeight = useVisualizationStore(state => state.updateMetricWeight)
  const resetWeightsToAuto = useVisualizationStore(state => state.resetWeightsToAuto)

  // Compute auto-inferred weights from signature
  const autoWeights = useMemo(() => inferMetricWeights(signature), [signature])

  // Use tag's custom weights or auto-inferred weights
  const displayWeights: MetricWeights = activeTag?.metricWeights || currentWeights || autoWeights

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
                min="0.1"
                max="3.0"
                step="0.1"
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
              <div className="candidate-item__info">
                <div className="candidate-item__id">Feature {candidate.featureId}</div>
                <div
                  className="candidate-item__score"
                  style={{
                    color: candidate.score > 0.7 ? '#10b981' : candidate.score > 0.4 ? '#f59e0b' : '#ef4444'
                  }}
                >
                  {candidate.score.toFixed(2)}
                </div>
              </div>
              <div className="candidate-item__metrics">
                Emb: {candidate.metricValues.embedding.toFixed(2)} |
                Fuzz: {candidate.metricValues.fuzz.toFixed(2)} |
                Det: {candidate.metricValues.detection.toFixed(2)}
              </div>
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

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLUListElement>(null)
  const rafIdRef = useRef<number | null>(null)

  const activeTag = tags.find(t => t.id === activeTagId)
  const rejectedIds = Array.from(activeTag?.rejectedFeatureIds || []).sort((a, b) => a - b)

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
      <ul className="rejected-list" ref={listRef}>
        {rejectedIds.map(id => (
          <li key={id} className="rejected-item">
            <span className="rejected-item__id">Feature {id}</span>
            <button
              className="rejected-item__undo"
              onClick={() => activeTagId && undoRejection(activeTagId, id)}
              title="Undo rejection"
            >
              ↩
            </button>
          </li>
        ))}
      </ul>
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

  // Local state for adding new tags
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
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
        feature_splitting: { min: 0.1, max: 1.0 },
        embedding: { min: 0.1, max: 1.0 },
        fuzz: { min: 0.1, max: 1.0 },
        detection: { min: 0.1, max: 1.0 },
        semantic_similarity: { min: 0.1, max: 1.0 },
        quality_score: { min: 0.1, max: 1.0 }
      }
    }
    return inferMetricSignature(selectedFeatures)
  }, [selectedFeatures])

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
            <div className="tag-panel__discovery-section tag-panel__discovery-section--radar">
              <h5 className="tag-panel__discovery-section-header">Range-Based Filtering</h5>
              <TagRadarView
                selectedFeatures={selectedFeatures}
                signature={manualSignature}
                onSignatureChange={handleSignatureChange}
                width={columnDimensions.radarWidth}
                height={columnDimensions.radarHeight}
              />
            </div>

            {/* Vertical separator */}
            <div className="tag-panel__discovery-divider"></div>

            {/* Right section: Weighted Distance */}
            <div className="tag-panel__discovery-section tag-panel__discovery-section--weights">
              <h5 className="tag-panel__discovery-section-header">Weighted Distance</h5>
              <MetricWeightsPanel
                signature={manualSignature}
                activeTagId={activeTagId}
              />
            </div>
          </div>
        </div>

        {/* Column 4: Feature Lists */}
        <div className="tag-panel__column tag-panel__features">
          <h4 className="tag-panel__column-title">Validation</h4>
          <div className="feature-lists">
            <div className="feature-list feature-list--selected">
              <h5 className="feature-list__title">Selected ({selectedFeatureIds.size})</h5>
              <SelectedFeaturesList featureIds={selectedFeatureIds} />
            </div>
            <div className="feature-list feature-list--candidates">
              <h5 className="feature-list__title">Candidates ({candidateFeatures.length})</h5>
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
