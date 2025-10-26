// ============================================================================
// TAG MANAGEMENT PANEL COMPONENT
// Main orchestrator for tag assignment workflow with pre-defined templates
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import type { MetricSignature, FeatureTableRow, Tag, FeatureMatch } from '../types'
import { inferMetricSignature, extractMetricValues, featureMatchesSignature } from '../lib/tag-utils'
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
      <ul className="selected-features-list__list">
        {sortedIds.map(id => (
          <li key={id} className="selected-features-list__item">
            Feature {id}
          </li>
        ))}
      </ul>
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

  // Calculate responsive radar size from props
  const radarSize = useMemo(() => {
    return {
      width: width,
      height: height,
      margin: 95  // Margin for radar chart padding
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
  )
}

// ============================================================================
// TAG STATISTICS VIEW SUB-COMPONENT
// ============================================================================

interface TagStatisticsViewProps {
  tag: Tag
  candidates?: FeatureMatch[]
  className?: string
}

const TagStatisticsView: React.FC<TagStatisticsViewProps> = ({
  tag,
  candidates = [],
  className = ''
}) => {
  const tableData = useVisualizationStore(state => state.tableData)

  const stats = useMemo(() => {
    if (!tableData) {
      return {
        totalFeatures: 0,
        taggedCount: tag.featureIds.size,
        matchingCount: 0,
        coverage: 0,
        avgQuality: 0
      }
    }

    const totalFeatures = tableData.features.length
    const taggedCount = tag.featureIds.size

    let matchingCount = 0
    let qualitySum = 0
    let qualityCount = 0

    tableData.features.forEach((feature: FeatureTableRow) => {
      const metrics = extractMetricValues(feature)

      if (featureMatchesSignature(metrics, tag.metricSignature)) {
        matchingCount++
        qualitySum += metrics.quality_score
        qualityCount++
      }
    })

    const coverage = totalFeatures > 0 ? (matchingCount / totalFeatures) * 100 : 0
    const avgQuality = qualityCount > 0 ? qualitySum / qualityCount : 0

    return {
      totalFeatures,
      taggedCount,
      matchingCount,
      coverage,
      avgQuality
    }
  }, [tableData, tag])

  return (
    <div className={`tag-statistics-view ${className}`}>
      <h3 className="tag-statistics-view__title">
        Tag Statistics
      </h3>

      <div className="tag-statistics-view__overview">
        <div className="stat-card">
          <div className="stat-card__value">{stats.taggedCount}</div>
          <div className="stat-card__label">Seed Features</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value">{stats.matchingCount}</div>
          <div className="stat-card__label">Matching Features</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value">{stats.coverage.toFixed(1)}%</div>
          <div className="stat-card__label">Coverage</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value">{stats.avgQuality.toFixed(2)}</div>
          <div className="stat-card__label">Avg Quality</div>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="tag-statistics-view__candidates">
          <h4 className="tag-statistics-view__subtitle">
            Top {candidates.length} Candidate Features
          </h4>

          <div className="candidates-list">
            {candidates.map((candidate, index) => (
              <div key={candidate.featureId} className="candidate-item">
                <div className="candidate-item__rank">#{index + 1}</div>
                <div className="candidate-item__info">
                  <div className="candidate-item__id">
                    Feature {candidate.featureId}
                  </div>
                  <div className="candidate-item__metrics">
                    <span className="metric-badge">
                      Q: {candidate.metricValues.quality_score.toFixed(2)}
                    </span>
                    <span className="metric-badge">
                      Emb: {candidate.metricValues.embedding.toFixed(2)}
                    </span>
                    <span className="metric-badge">
                      Fuzz: {candidate.metricValues.fuzz.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="candidate-item__score">
                  <div className="score-bar">
                    <div
                      className="score-bar__fill"
                      style={{ width: `${candidate.score * 100}%` }}
                    ></div>
                  </div>
                  <span className="score-value">{(candidate.score * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="tag-statistics-view__hint">
            💡 These candidates will be available for verification in Stage 2
          </div>
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

  // Store actions
  const setActiveTag = useVisualizationStore(state => state.setActiveTag)
  const assignFeaturesToTag = useVisualizationStore(state => state.assignFeaturesToTag)
  const findCandidates = useVisualizationStore(state => state.findCandidates)

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

  // Get candidates for active tag
  const activeCandidates = activeTag ? findCandidates(activeTag.id, 10) : []

  return (
    <div className="tag-management-panel" ref={setContainerRef}>
      <div className="tag-panel__grid">
        {/* Column 1: Template Tags */}
        <div className="tag-panel__column tag-panel__templates">
          <h4 className="tag-panel__column-title">Template Tags</h4>
          <div className="template-tags-list">
            {tags.map(tag => (
              <div
                key={tag.id}
                className={`template-tag-card ${activeTagId === tag.id ? 'template-tag-card--active' : ''}`}
                onClick={() => setActiveTag(tag.id)}
                title={`Click to select ${tag.name}`}
              >
                <div className="template-tag-card__info">
                  <div className="template-tag-card__name">{tag.name}</div>
                  <div className="template-tag-card__count">
                    {tag.featureIds.size} feature{tag.featureIds.size !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Radar Chart */}
        <div className="tag-panel__column tag-panel__radar">
          <h4 className="tag-panel__column-title">Metric Signature</h4>
          <TagRadarView
            selectedFeatures={selectedFeatures}
            signature={manualSignature}
            onSignatureChange={handleSignatureChange}
            width={columnDimensions.radarWidth}
            height={columnDimensions.radarHeight}
          />
        </div>

        {/* Column 3: Feature Lists */}
        <div className="tag-panel__column tag-panel__features">
          <h4 className="tag-panel__column-title">Features</h4>
          <div className="feature-lists">
            <div className="feature-list feature-list--selected">
              <h5 className="feature-list__title">Selected ({selectedFeatureIds.size})</h5>
              <SelectedFeaturesList featureIds={selectedFeatureIds} />
            </div>
            <div className="feature-list feature-list--candidates">
              <h5 className="feature-list__title">Candidates (Stage 2)</h5>
              <p className="feature-list__placeholder">Coming soon</p>
            </div>
          </div>

          {/* Assign Button */}
          <button
            className="assign-button"
            onClick={handleAssignFeatures}
            disabled={!activeTagId || selectedFeatureIds.size === 0}
            title={
              !activeTagId
                ? 'Select a tag first'
                : selectedFeatureIds.size === 0
                ? 'Select features from the table'
                : `Assign ${selectedFeatureIds.size} features to ${activeTag?.name}`
            }
          >
            Assign Selected Features
          </button>
        </div>

        {/* Column 4: Statistics */}
        <div className="tag-panel__column tag-panel__stats">
          <h4 className="tag-panel__column-title">Tag Statistics</h4>
          {activeTag ? (
            <TagStatisticsView
              tag={activeTag}
              candidates={activeCandidates}
            />
          ) : (
            <p className="tag-panel__no-selection">
              Select a tag to view statistics
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default TagManagementPanel
