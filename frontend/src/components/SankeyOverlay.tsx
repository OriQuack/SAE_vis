import React, { useMemo, useState, useRef, useEffect } from 'react'
import type { D3SankeyNode, D3SankeyLink, HistogramData, SankeyLayout, SankeyTreeNode } from '../types'
import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  CONSISTENCY_THRESHOLDS,
  getThresholdRegionColors
} from '../lib/constants'
import {
  calculateNodeHistogramLayout,
  shouldDisplayNodeHistogram,
  getNodeHistogramMetric,
  hasOutgoingLinks,
  calculateHistogramYAxisTicks
} from '../lib/d3-sankey-histogram-utils'
import { getNodeThresholds, getExactMetricFromPercentile } from '../lib/threshold-utils'
import { calculateHorizontalBarSegments } from '../lib/d3-histogram-utils'
import { scaleLinear } from 'd3-scale'
import { ThresholdHandles } from './ThresholdHandles'

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

// Simple stage configuration for inline selector
interface StageOption {
  id: string
  name: string
  description: string
  metric: string
  thresholds: readonly number[]
  category: 'Decoder Similarity' | 'Score'
}

// DEPRECATED: Legacy stage configuration kept for backward compatibility with threshold handles
// TODO: Replace with tag category system
// eslint-disable-next-line react-refresh/only-export-components
export const AVAILABLE_STAGES: StageOption[] = [
  {
    id: 'decoder_similarity',
    name: 'Decoder Similarity',
    description: 'Feature Splitting',
    metric: METRIC_DECODER_SIMILARITY,
    thresholds: [0.4],
    category: 'Decoder Similarity'
  },
  {
    id: 'overall_score',
    name: 'Quality Score',
    description: 'Quality Assessment',
    metric: METRIC_QUALITY_SCORE,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_QUALITY_SCORE],
    category: 'Score'
  }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine if node should show threshold slider handles
 * Shows handles when node has a metric and children
 */
function shouldShowHandles(
  node: D3SankeyNode,
  sankeyTree: Map<string, any> | null
): boolean {
  if (!sankeyTree) return false

  const treeNode = sankeyTree.get(node.id)
  if (!treeNode || treeNode.children.length === 0) return false

  // Show handles if node has a metric set (regardless of whether children have their own children)
  if (!treeNode.metric) return false

  return true
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SankeyNodeHistogramProps {
  node: D3SankeyNode
  histogramData: HistogramData | null
  links: D3SankeyLink[]
  sankeyTree: Map<string, SankeyTreeNode> | null
  animationDuration: number
  dragThresholds?: number[] | null  // Preview thresholds during drag (from parent)
}

const SankeyNodeHistogram: React.FC<SankeyNodeHistogramProps> = ({
  node,
  histogramData,
  links,
  sankeyTree,
  animationDuration,
  dragThresholds: dragThresholdsFromParent
}) => {
  // Cache the percentileToMetricMap to prevent loss during tree updates
  const percentileMapRef = useRef<Map<number, number> | undefined>(undefined)

  // Update cached map when tree node changes (but keep old one if new one is missing)
  useEffect(() => {
    const treeNode = sankeyTree?.get(node.id || '')
    if (treeNode?.percentileToMetricMap && treeNode.percentileToMetricMap.size > 0) {
      percentileMapRef.current = treeNode.percentileToMetricMap
    }
  }, [sankeyTree, node.id])

  // Calculate histogram layout
  const layout = useMemo(() => {
    if (!histogramData) return null
    return calculateNodeHistogramLayout(node, histogramData, links)
  }, [node, histogramData, links])

  // Get node thresholds for pattern generation
  const committedThresholds = useMemo(() => {
    if (!sankeyTree || !node.id) return []
    return getNodeThresholds(node.id, sankeyTree)
  }, [sankeyTree, node.id])

  // Convert percentile drag thresholds to metric values for histogram rendering
  // Only depend on dragThresholdsFromParent and histogramData, not sankeyTree
  // This prevents recalculation and potential null returns during tree updates
  const dragThresholdsInMetricSpace = useMemo(() => {
    if (!dragThresholdsFromParent || !histogramData) return null

    // Use cached percentileToMetricMap to avoid losing it during tree updates
    const percentileMap = percentileMapRef.current

    if (!percentileMap || percentileMap.size === 0) {
      console.warn('[SankeyNodeHistogram] percentileToMetricMap not available for drag conversion')
      return null
    }

    return dragThresholdsFromParent.map(percentile => {
      return getExactMetricFromPercentile(percentile, percentileMap)
    })
  }, [dragThresholdsFromParent, histogramData]) // Remove sankeyTree and node.id from deps

  // Use converted drag thresholds during drag, otherwise use committed thresholds
  const thresholds = dragThresholdsInMetricSpace ?? committedThresholds

  // Create Y scale for horizontal bar segment calculation
  // For horizontal bars, Y axis represents the metric values
  const yScale = useMemo(() => {
    if (!histogramData || !layout) return null
    const binEdges = histogramData.histogram.bin_edges
    if (!binEdges || binEdges.length < 2) return null

    return scaleLinear()
      .domain([binEdges[0], binEdges[binEdges.length - 1]])
      .range([0, layout.height])  // Map metric values to node height
  }, [histogramData, layout])

  // Calculate bar segments for split pattern rendering (horizontal bars)
  const barSegments = useMemo(() => {
    if (!layout || !yScale || thresholds.length === 0) {
      // No thresholds or no scale - return bars as single segments
      return layout?.bars.map((bar) => [{
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        patternIndex: 0
      }]) || []
    }

    // Calculate segments for each horizontal bar
    return layout.bars.map((bar) => calculateHorizontalBarSegments(bar, thresholds, yScale))
  }, [layout, thresholds, yScale])

  // Calculate y-axis ticks for metric value labels
  const yAxisTicks = useMemo(() => {
    if (!histogramData || !layout) return []
    return calculateHistogramYAxisTicks(histogramData, node, 10)
  }, [histogramData, node, layout])

  if (!layout) return null

  // Get bar color for patterns (metric-specific color for background)
  const barColor = layout.bars[0]?.color || '#94a3b8'

  // Get metric for this node to determine if we should use threshold colors
  const metric = getNodeHistogramMetric(node, links)
  const thresholdColors = metric ? getThresholdRegionColors(metric) : null

  return (
    <g
      transform={`translate(${layout.x}, ${layout.y})`}
      style={{
        pointerEvents: 'none', // Don't interfere with interactions
        transition: `opacity ${animationDuration}ms ease-out`
      }}
    >
      {/* Pattern definitions for threshold regions */}
      <defs>
        {/* Metric-specific striped pattern (for metrics without threshold colors) */}
        <pattern
          id={`sankey-histogram-pattern-striped-${node.id}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="none"/>
          <line x1="0" y1="0" x2="0" y2="6" stroke={barColor} strokeWidth="2" opacity="1.0"/>
          <line x1="3" y1="0" x2="3" y2="6" stroke={barColor} strokeWidth="2" opacity="1.0"/>
          <line x1="6" y1="0" x2="6" y2="6" stroke={barColor} strokeWidth="2" opacity="1.0"/>
        </pattern>

        {/* Red striped pattern (for decoder_similarity above threshold) */}
        {thresholdColors && (
          <pattern
            id={`sankey-histogram-pattern-red-${node.id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="none"/>
            <line x1="0" y1="0" x2="0" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
            <line x1="3" y1="0" x2="3" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
            <line x1="6" y1="0" x2="6" y2="6" stroke={thresholdColors.above} strokeWidth="2" opacity="1.0"/>
          </pattern>
        )}
      </defs>

      {/* Render horizontal histogram bars - as segments for split patterns */}
      {barSegments.map((segments, barIndex) => (
        <g key={barIndex}>
          {segments.map((segment, segmentIndex) => {
            // Even regions (0, 2, 4...): Solid fill (below threshold)
            // Odd regions (1, 3, 5...): Striped pattern (above threshold)
            const isAboveThreshold = segment.patternIndex % 2 === 1

            // Determine fill color based on metric type and threshold position
            let fillColor: string
            if (thresholdColors) {
              // Use red/green colors for decoder_similarity and quality_score
              // Above threshold uses red/green striped pattern, below uses solid fill
              if (isAboveThreshold) {
                fillColor = `url(#sankey-histogram-pattern-red-${node.id})`
              } else {
                fillColor = thresholdColors.below
              }
            } else {
              // Use default metric color or striped pattern for other metrics
              const useStripes = segment.patternIndex % 2 === 0
              fillColor = useStripes
                ? `url(#sankey-histogram-pattern-striped-${node.id})`
                : barColor
            }

            return (
              <rect
                key={`${barIndex}-${segmentIndex}`}
                x={segment.x}
                y={segment.y - layout.y}  // Adjust y relative to group transform
                width={segment.width}
                height={segment.height}
                fill={fillColor}
                fillOpacity={1.0}
                stroke="white"
                strokeWidth={0.3}
                strokeOpacity={0.6}
              />
            )
          })}
        </g>
      ))}

      {/* Threshold lines - horizontal lines at threshold Y positions */}
      {yScale && thresholds.length > 0 && thresholds.map((threshold, index) => {
        const thresholdY = yScale(threshold)

        return (
          <line
            key={`threshold-${index}`}
            x1={0}
            y1={thresholdY}
            x2={layout.width * 0.8}
            y2={thresholdY}
            stroke={barColor}
            strokeWidth={1.5}
            strokeDasharray="4,3"
            opacity={0.6}
            style={{
              pointerEvents: 'none'
            }}
          />
        )
      })}

      {/* Y-axis: metric value labels and ticks */}
      {yAxisTicks.length > 0 && (
        <g>
          {/* Vertical axis line */}
          <line
            x1={0}
            x2={0}
            y1={0}
            y2={layout.height}
            stroke={'#000000'}
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />

          {/* Tick marks and labels */}
          {yAxisTicks.map((tick) => (
            <g
              key={tick.value}
              transform={`translate(0, ${tick.position - layout.y})`}
              style={{ pointerEvents: 'none' }}
            >
              {/* Tick mark - 3px line extending left */}
              <line
                x1={-4}
                x2={0}
                y1={0}
                y2={0}
                stroke={'#000000'}
                strokeWidth={1}
              />

              {/* Tick label - vertical (90 degrees), smaller font */}
              <text
                x={-2}
                y={11}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8}
                fill={'#000000ff'}
                transform="rotate(90)"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>
      )}
    </g>
  )
}

// REMOVED: MetricOverlayPanel and SankeyInlineSelector components
// These are no longer needed with the fixed 3-stage auto-expansion architecture

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create percentile-to-metric converter function.
 * Uses exact cached mappings - no fallback.
 */
function createPercentileToMetric(
  node: SankeyTreeNode | undefined
): (percentile: number) => number {
  return (percentile: number) => {
    if (!node?.percentileToMetricMap || node.percentileToMetricMap.size === 0) {
      console.error('[createPercentileToMetric] percentileToMetricMap is missing! This should never happen.')
      return 0  // Return error value
    }

    return getExactMetricFromPercentile(percentile, node.percentileToMetricMap)
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SankeyOverlayProps {
  layout: SankeyLayout | null
  histogramData: Record<string, HistogramData> | null
  animationDuration: number
  sankeyTree: Map<string, any> | null
  // onMetricClick: (metric: string) => void // REMOVED: No longer needed with auto-expansion
  onThresholdUpdate: (nodeId: string, newThresholds: number[]) => void
  onThresholdUpdateByPercentile: (nodeId: string, percentiles: number[]) => void
}

export const SankeyOverlay: React.FC<SankeyOverlayProps> = ({
  layout,
  histogramData,
  animationDuration,
  sankeyTree,
  // onMetricClick, // REMOVED
  onThresholdUpdate: _onThresholdUpdate,
  onThresholdUpdateByPercentile
}) => {
  // Track drag preview thresholds by node ID (for live histogram updates without committing)
  const [nodeDragThresholds, setNodeDragThresholds] = useState<Record<string, number[]>>({})

  // Cleanup: Clear drag thresholds when committed thresholds update to match
  // IMPORTANT: Only run when sankeyTree changes (after commit), not during drag.
  // We must verify the tree update is COMPLETE before clearing drag state.
  // The tree updates multiple times during async operations, and clearing too early
  // causes the histogram to jump back to old thresholds.
  React.useEffect(() => {
    if (!sankeyTree) return

    // Use a small delay to ensure all tree updates have completed
    // This prevents clearing drag state during intermediate tree updates
    const timeoutId = setTimeout(() => {
      setNodeDragThresholds(prev => {
        // Early return if no drag thresholds to cleanup
        if (Object.keys(prev).length === 0) return prev

        const updated = { ...prev }
        let hasChanges = false

        for (const nodeId in prev) {
          const treeNode = sankeyTree.get(nodeId)
          if (!treeNode || !treeNode.percentiles) continue

          const committedPercentiles = treeNode.percentiles
          const dragPercentiles = prev[nodeId]

          // Only clear drag state if:
          // 1. Percentiles match (indicating update started), AND
          // 2. Node has children (indicating update completed) OR no metric (stage removed)
          // This prevents clearing during intermediate metadata-only updates
          const hasChildren = treeNode.children && treeNode.children.length > 0
          const noMetric = !treeNode.metric
          const updateComplete = hasChildren || noMetric

          if (committedPercentiles.length === dragPercentiles.length && updateComplete) {
            const matches = committedPercentiles.every((cp: number, i: number) => {
              return Math.abs(cp - dragPercentiles[i]) < 0.001
            })

            if (matches) {
              delete updated[nodeId]
              hasChanges = true
            }
          }
        }

        return hasChanges ? updated : prev
      })
    }, 100) // 100ms delay to allow async updates to complete

    return () => clearTimeout(timeoutId)
  }, [sankeyTree]) // Only sankeyTree - NOT nodeDragThresholds (would cause jump during drag)

  if (!layout) return null

  return (
    <>
      {/* Node Histograms - One per source node */}
      <g className="sankey-diagram__node-histograms">
        {layout.nodes.map((node) => {
          // Only render histogram for nodes with outgoing links
          if (!hasOutgoingLinks(node, layout.links)) return null

          // Get metric for this node
          const metric = getNodeHistogramMetric(node, layout.links)

          if (!metric) return null

          // Get histogram data for the metric using composite key (metric:nodeId)
          const compositeKey = `${metric}:${node.id}`
          const metricHistogramData = histogramData?.[compositeKey] || null

          // Only render if we should display histogram for this node
          if (!shouldDisplayNodeHistogram(node, layout.links, histogramData)) return null

          return (
            <SankeyNodeHistogram
              key={`node-histogram-${node.id}`}
              node={node}
              histogramData={metricHistogramData}
              links={layout.links}
              sankeyTree={sankeyTree}
              animationDuration={animationDuration}
              dragThresholds={nodeDragThresholds[node.id || '']}
            />
          )
        })}
      </g>

      {/* Threshold Sliders - For nodes with children (split nodes) */}
      <g className="sankey-threshold-sliders-group">
        {layout.nodes.map((node) => {
          // Only show handles for split nodes with metrics
          const shouldShow = shouldShowHandles(node, sankeyTree)

          if (!shouldShow || !sankeyTree) {
            return null
          }

          // Get metric from children (same logic as histograms)
          const metric = getNodeHistogramMetric(node, layout.links)

          if (!metric) {
            return null
          }

          // Get histogram data for min/max values using composite key (metric:nodeId)
          const compositeKey = `${metric}:${node.id}`
          const metricHistogramData = histogramData?.[compositeKey]

          if (!metricHistogramData) {
            return null
          }

          // Get thresholds for this node
          const thresholds = getNodeThresholds(node.id || '', sankeyTree)
          const { min, max } = metricHistogramData.statistics

          // Dynamic handle count based on metric configuration
          let displayThresholds: number[]

          // Extend range slightly to prevent edge cases
          const metricMin = min - 0.01
          const metricMax = max + 0.01

          // Check if node has percentiles stored (from percentile-based updates)
          const treeNode = sankeyTree.get(node.id || '')
          const nodePercentiles = treeNode?.percentiles

          if (nodePercentiles && nodePercentiles.length > 0) {
            // Use stored percentiles for rendering
            displayThresholds = [...nodePercentiles]
          } else if (!thresholds || thresholds.length === 0) {
            // No thresholds: initialize with metric-specific defaults
            // Find the stage configuration for this metric
            const stageConfig = AVAILABLE_STAGES.find(s => s.metric === metric)
            if (stageConfig && stageConfig.thresholds.length > 0) {
              // Convert metric defaults to percentiles for consistent percentile-based rendering
              displayThresholds = stageConfig.thresholds.map(t => {
                const clampedT = Math.max(metricMin, Math.min(metricMax, t))
                // Convert metric value to percentile (0-1 range)
                return (clampedT - metricMin) / (metricMax - metricMin)
              })
            } else {
              // Fallback: single handle at midpoint (50% percentile)
              displayThresholds = [0.5]
            }
          } else {
            // Convert metric thresholds to percentiles for rendering
            displayThresholds = thresholds.map(t =>
              (t - metricMin) / (metricMax - metricMin)
            )
          }

          // Always use percentile mode for Sankey vertical handles
          const usePercentilesMode = true

          // Create conversion function using exact mappings from treeNode
          const percentileToMetric = createPercentileToMetric(treeNode)

          return (
            <ThresholdHandles
              key={`sliders-${node.id}`}
              orientation="vertical"
              bounds={{ min: 0, max: (node.y1 || 0) - (node.y0 || 0) }}
              thresholds={displayThresholds}
              metricRange={{ min: metricMin, max: metricMax }}
              position={{ x: node.x0 || 0, y: node.y0 || 0 }}
              parentOffset={{ x: layout.margin.left, y: layout.margin.top }}
              showThresholdLine={false}
              showDragTooltip={false}
              usePercentiles={usePercentilesMode}
              percentileToMetric={percentileToMetric}
              onUpdate={(values) => {
                // DON'T clear drag state immediately - keep it until committed thresholds update
                // This prevents histogram from jumping back to old values during async store update

                // Always use percentile-based splitting for vertical Sankey handles
                onThresholdUpdateByPercentile(node.id || '', values)
              }}
              onDragUpdate={(values) => {
                // Live preview: update drag thresholds without committing
                setNodeDragThresholds(prev => ({
                  ...prev,
                  [node.id || '']: values
                }))
              }}
            />
          )
        })}
      </g>

      {/* REMOVED: Metric Overlay Panel - No longer needed with auto-expansion */}
    </>
  )
}

export default SankeyOverlay
