import React, { useEffect, useMemo, useState, useRef } from 'react'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, ZoomTransform } from 'd3-zoom'
import { useResizeObserver } from '../lib/utils'
import { getUMAPData } from '../api'
import type { UMAPPoint, UMAPDataResponse, ClusterNode } from '../types'
import {
  getClusterLevelFromZoom,
  filterToMostSpecificLevel,
  getEffectiveClusters,
  getEffectivePoints,
  calculateClusterHulls,
  calculateClusterLabels,
  generateClusterColors,
  hullToPath,
  type ProcessedPoint
} from '../lib/d3-umap-utils'
import '../styles/UMAPPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface UMAPPanelProps {
  className?: string
}

// Colors for different sources
const SOURCE_COLORS: Record<string, string> = {
  'decoder': '#10b981',  // green
  'llama_e-llama_s': '#3b82f6',  // blue
  'gwen_e-llama_s': '#f59e0b',  // amber
  'openai_e-llama_s': '#8b5cf6'  // purple
}

const CLUSTER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
]

// ==================== SUB-COMPONENTS ====================

const UMAPSubPanel: React.FC<{
  title: string
  data: UMAPPoint[] | null
  clusterHierarchy: Record<string, Record<string, ClusterNode>> | null
  loading: boolean
  error: string | null
  colorBy: 'source' | 'cluster'
}> = ({ title, data, clusterHierarchy, loading, error, colorBy }) => {
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>({
    debugId: `umap-${title}`
  })
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(zoomIdentity)
  const [clusterLevel, setClusterLevel] = useState<number>(1)  // Start at level 1 (level 0 excluded)

  // Debounce timer for cluster level changes
  const levelChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculate SVG dimensions, scales, and points
  const { svgWidth, svgHeight, margin, points, xScale, yScale } = useMemo(() => {
    if (!data || data.length === 0 || size.width === 0 || size.height === 0) {
      return {
        svgWidth: 0,
        svgHeight: 0,
        margin: { top: 20, right: 20, bottom: 40, left: 50 },
        points: [],
        xScale: null,
        yScale: null
      }
    }

    // Keep each feature at its most specific (highest) level
    const mostSpecificData = filterToMostSpecificLevel(data)

    const margin = { top: 20, right: 20, bottom: 40, left: 50 }
    const svgWidth = size.width
    const svgHeight = size.height
    const plotWidth = svgWidth - margin.left - margin.right
    const plotHeight = svgHeight - margin.top - margin.bottom

    // Calculate data extents from ALL data for consistent scales
    const xExtent = [
      Math.min(...data.map(d => d.umap_x)),
      Math.max(...data.map(d => d.umap_x))
    ]
    const yExtent = [
      Math.min(...data.map(d => d.umap_y)),
      Math.max(...data.map(d => d.umap_y))
    ]

    // Add padding to extents
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1

    // Create scale functions
    const xScale = (x: number) => {
      return ((x - xExtent[0] + xPadding) / (xExtent[1] - xExtent[0] + 2 * xPadding)) * plotWidth
    }
    const yScale = (y: number) => {
      return plotHeight - ((y - yExtent[0] + yPadding) / (yExtent[1] - yExtent[0] + 2 * yPadding)) * plotHeight
    }

    // Generate point positions and colors
    const points = mostSpecificData.map((point) => {
      let color: string

      // Noise points are always gray
      if (point.cluster_label === 'noise') {
        color = '#94a3b8'  // Gray for noise
      } else if (colorBy === 'source') {
        color = SOURCE_COLORS[point.source || 'decoder'] || '#94a3b8'
      } else {
        // Color by cluster - use cluster_id hash for consistent colors
        const clusterIndex = point.cluster_id ? parseInt(point.cluster_id.replace(/\D/g, '')) % CLUSTER_COLORS.length : 0
        color = CLUSTER_COLORS[clusterIndex]
      }

      return {
        ...point,
        x: xScale(point.umap_x),
        y: yScale(point.umap_y),
        color
      }
    })

    return {
      svgWidth,
      svgHeight,
      margin,
      points,
      xScale,
      yScale
    }
  }, [data, size.width, size.height, colorBy])

  // Group points by cluster for performance optimization
  const pointsByCluster = useMemo(() => {
    const groups: Record<string, Array<typeof points[0]>> = {}
    points.forEach(point => {
      const clusterId = point.cluster_id
      if (!groups[clusterId]) {
        groups[clusterId] = []
      }
      groups[clusterId].push(point)
    })
    return groups
  }, [points])

  // Calculate cluster hulls based on current level with smart persistence
  const clusterHulls = useMemo(() => {
    if (!clusterHierarchy || !data || !xScale || !yScale) {
      return []
    }

    // Use panel-specific hierarchy based on title
    const hierarchyKey = title.includes('Feature') ? 'features' : 'explanations'
    const panelHierarchy = clusterHierarchy[hierarchyKey] || {}

    // Get effective clusters (target level + childless parents)
    const effectiveClusters = getEffectiveClusters(panelHierarchy, clusterLevel)

    // Get points for effective clusters at appropriate levels
    const effectiveData = getEffectivePoints(data, effectiveClusters)

    // Convert to ProcessedPoint format with pixel coordinates
    const processedPoints: ProcessedPoint[] = effectiveData.map(p => ({
      x: xScale(p.umap_x),
      y: yScale(p.umap_y),
      clusterId: p.cluster_id
    }))

    // Generate color map for clusters
    const clusterIds = effectiveClusters.map(c => c.cluster_id)
    const colorMap = generateClusterColors(clusterIds)

    // Calculate hulls (excluding noise clusters, pass data for labels)
    return calculateClusterHulls(processedPoints, effectiveClusters, colorMap, false, effectiveData)
  }, [clusterHierarchy, data, xScale, yScale, clusterLevel, title])

  // Calculate labels for Explanation UMAP only (zoom-aware)
  const clusterLabels = useMemo(() => {
    if (title.includes('Explanation')) {
      return calculateClusterLabels(clusterHulls, zoomTransform.k)
    }
    return []
  }, [clusterHulls, title, zoomTransform.k])

  // Reset hover state when cluster level changes
  useEffect(() => {
    setHoveredCluster(null)
    setTooltipPosition(null)
  }, [clusterLevel])

  // Setup d3-zoom behavior
  useEffect(() => {
    if (!svgRef.current) return

    const svg = select(svgRef.current)

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', (event: any) => {
        setZoomTransform(event.transform)

        // Determine new cluster level from zoom scale
        const newLevel = getClusterLevelFromZoom(event.transform.k)

        // Debounce level changes to avoid rapid recalculation
        if (newLevel !== clusterLevel) {
          if (levelChangeTimerRef.current) {
            clearTimeout(levelChangeTimerRef.current)
          }

          levelChangeTimerRef.current = setTimeout(() => {
            setClusterLevel(newLevel)
          }, 200)
        }
      })

    svg.call(zoomBehavior)

    // Cleanup
    return () => {
      svg.on('.zoom', null)
      if (levelChangeTimerRef.current) {
        clearTimeout(levelChangeTimerRef.current)
      }
    }
  }, [svgRef.current, clusterLevel])

  // Reset zoom when data changes
  useEffect(() => {
    if (svgRef.current) {
      select(svgRef.current).call(d3Zoom<SVGSVGElement, unknown>().transform, zoomIdentity)
      setZoomTransform(zoomIdentity)
      setClusterLevel(1)  // Reset to level 1 (level 0 excluded)
    }
  }, [data])

  // Loading state
  if (loading) {
    return (
      <div className="umap-panel__subpanel">
        <div className="umap-panel__header">
          <h3 className="umap-panel__title">{title}</h3>
        </div>
        <div className="umap-panel__content">
          <div className="umap-panel__loading">
            <div className="umap-panel__spinner" />
            <span>Loading UMAP data...</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="umap-panel__subpanel">
        <div className="umap-panel__header">
          <h3 className="umap-panel__title">{title}</h3>
        </div>
        <div className="umap-panel__content">
          <div className="umap-panel__error">
            <div className="umap-panel__error-icon">⚠️</div>
            <div className="umap-panel__error-message">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="umap-panel__subpanel">
        <div className="umap-panel__header">
          <h3 className="umap-panel__title">{title}</h3>
        </div>
        <div className="umap-panel__content">
          <div className="umap-panel__empty">
            <div className="umap-panel__empty-icon">📊</div>
            <div className="umap-panel__empty-message">No UMAP data available</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="umap-panel__subpanel">
      <div className="umap-panel__header">
        <h3 className="umap-panel__title">{title}</h3>
        <div className="umap-panel__info">
          Level {clusterLevel} • {clusterHulls.length} clusters • Zoom {zoomTransform.k.toFixed(2)}x
        </div>
      </div>
      <div className="umap-panel__content" ref={containerRef}>
        {svgWidth > 0 && svgHeight > 0 && (
          <div className="umap-panel__svg-container" style={{ position: 'relative' }}>
            <svg
              ref={svgRef}
              className="umap-panel__svg"
              width={svgWidth}
              height={svgHeight}
              style={{ display: 'block' }}
            >
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {/* Zoom transform group - contains both overlays and points */}
                <g className="umap-panel__zoom-group" transform={zoomTransform.toString()}>
                  {/* Cluster overlays (background layer) */}
                  {clusterHulls.map((hull) => (
                    <path
                      key={hull.clusterId}
                      className="umap-panel__cluster-overlay"
                      d={hullToPath(hull.points)}
                      fill={hull.color}
                      fillOpacity={hoveredCluster === hull.clusterId ? 0.25 : 0.15}
                      stroke={hull.color}
                      strokeWidth={hoveredCluster === hull.clusterId ? 2 : 1}
                      strokeOpacity={hoveredCluster === hull.clusterId ? 0.5 : 0.3}
                      pointerEvents="all"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        setHoveredCluster(hull.clusterId)
                        setTooltipPosition({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseMove={(e) => {
                        setTooltipPosition({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseLeave={() => {
                        setHoveredCluster(null)
                        setTooltipPosition(null)
                      }}
                    />
                  ))}

                  {/* Data points (middle layer) - grouped by cluster for performance */}
                  {Object.entries(pointsByCluster).map(([clusterId, clusterPoints]) => (
                    <g
                      key={clusterId}
                      className="umap-panel__point-group"
                      opacity={hoveredCluster ? (clusterId === hoveredCluster ? 0.8 : 0.15) : 0.6}
                    >
                      {clusterPoints.map((point, index) => (
                        <circle
                          key={index}
                          className="umap-panel__point"
                          cx={point.x}
                          cy={point.y}
                          r={1}
                          fill={point.color}
                          pointerEvents="none"
                        />
                      ))}
                    </g>
                  ))}

                  {/* Cluster labels (top layer) - fixed size regardless of zoom */}
                  {clusterLabels.map((label) => (
                    <text
                      key={label.clusterId}
                      x={label.x}
                      y={label.y}
                      fill={label.color}
                      fontSize={13 / zoomTransform.k}
                      fontWeight="600"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      pointerEvents="none"
                      style={{ textShadow: '0 0 4px black, 0 0 2px black', userSelect: 'none' }}
                    >
                      {label.text}
                    </text>
                  ))}
                </g>
              </g>
            </svg>

            {/* Legend */}
            {colorBy === 'source' && (
              <div className="umap-panel__legend">
                <div className="umap-panel__legend-title">Source</div>
                {Object.entries(SOURCE_COLORS).map(([source, color]) => (
                  <div key={source} className="umap-panel__legend-item">
                    <div className="umap-panel__legend-color" style={{ backgroundColor: color }} />
                    <div className="umap-panel__legend-label">{source}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cluster Tooltip */}
      {hoveredCluster && tooltipPosition && (
        <div
          className="umap-panel__cluster-tooltip"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y - 10}px`
          }}
        >
          <div className="umap-panel__cluster-tooltip-label">
            {hoveredCluster}
          </div>
          <div className="umap-panel__cluster-tooltip-info">
            {clusterHulls.find(h => h.clusterId === hoveredCluster)?.pointCount || 0} features
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== MAIN COMPONENT ====================
export const UMAPPanel: React.FC<UMAPPanelProps> = ({ className = '' }) => {
  const [umapData, setUmapData] = useState<UMAPDataResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch UMAP data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await getUMAPData({
          filters: {},
          umap_type: 'both',
          include_noise: true
        })
        setUmapData(response)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load UMAP data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className={`umap-panel ${className}`}>
      <UMAPSubPanel
        title="Feature UMAP"
        data={umapData?.features || null}
        clusterHierarchy={umapData?.metadata.cluster_hierarchy || null}
        loading={loading}
        error={error}
        colorBy="cluster"
      />
      <UMAPSubPanel
        title="Explanation UMAP"
        data={umapData?.explanations || null}
        clusterHierarchy={umapData?.metadata.cluster_hierarchy || null}
        loading={loading}
        error={error}
        colorBy="cluster"
      />
    </div>
  )
}

export default UMAPPanel
