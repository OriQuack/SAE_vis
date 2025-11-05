import React, { useMemo, useState, useRef, useEffect } from 'react'
import type { D3SankeyNode, D3SankeyLink, HistogramData, SankeyLayout, SankeyTreeNode } from '../types'
import {
  METRIC_DECODER_SIMILARITY,
  METRIC_SEMANTIC_SIMILARITY,
  METRIC_SCORE_FUZZ,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_EMBEDDING,
  METRIC_QUALITY_SCORE,
  CONSISTENCY_THRESHOLDS,
  METRIC_COLORS
} from '../lib/constants'
import {
  calculateNodeHistogramLayout,
  shouldDisplayNodeHistogram,
  getNodeHistogramMetric,
  hasOutgoingLinks
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

// Available stages for the NEW system - categorized by type
// eslint-disable-next-line react-refresh/only-export-components
export const AVAILABLE_STAGES: StageOption[] = [
  // Decoder Similarity (1 handle at 0.4)
  {
    id: 'decoder_similarity',
    name: 'Decoder Similarity',
    description: 'Split by decoder similarity score',
    metric: METRIC_DECODER_SIMILARITY,
    thresholds: [0.4],
    category: 'Decoder Similarity'
  },

  // Semantic Similarity (1 metric)
  {
    id: 'semantic_similarity',
    name: 'Semantic Similarity',
    description: 'Split by semantic similarity score',
    metric: METRIC_SEMANTIC_SIMILARITY,
    thresholds: [0.5],
    category: 'Score'
  },

  // Score metrics (1 metric - Fuzz/Detection/Embedding commented out)
  // {
  //   id: 'fuzz_score',
  //   name: 'Fuzz Score',
  //   description: 'Split by fuzz score',
  //   metric: METRIC_SCORE_FUZZ,
  //   thresholds: [0.5],
  //   category: 'Score'
  // },
  // {
  //   id: 'detection_score',
  //   name: 'Detection Score',
  //   description: 'Split by detection score',
  //   metric: METRIC_SCORE_DETECTION,
  //   thresholds: [0.5],
  //   category: 'Score'
  // },
  // {
  //   id: 'embedding_score',
  //   name: 'Embedding Score',
  //   description: 'Split by embedding score',
  //   metric: METRIC_SCORE_EMBEDDING,
  //   thresholds: [0.5],
  //   category: 'Score'
  // },
  {
    id: 'overall_score',
    name: 'Quality Score',
    description: 'Split by quality score',
    metric: METRIC_QUALITY_SCORE,
    thresholds: CONSISTENCY_THRESHOLDS[METRIC_QUALITY_SCORE],
    category: 'Score'
  }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get display color for a metric in the stage selector
 * Maps metric constants to their corresponding HIGH color values from METRIC_COLORS
 */
function getMetricColorForDisplay(metric: string): string {
  switch (metric) {
    case METRIC_DECODER_SIMILARITY:
      return METRIC_COLORS.DECODER_SIMILARITY
    case METRIC_SEMANTIC_SIMILARITY:
      return METRIC_COLORS.SEMANTIC_SIMILARITY
    case METRIC_SCORE_FUZZ:
      return METRIC_COLORS.SCORE_FUZZ.HIGH
    case METRIC_SCORE_DETECTION:
      return METRIC_COLORS.SCORE_DETECTION.HIGH
    case METRIC_SCORE_EMBEDDING:
      return METRIC_COLORS.SCORE_EMBEDDING.HIGH
    case METRIC_QUALITY_SCORE:
      return METRIC_COLORS.QUALITY_SCORE_COLORS.HIGH
    default:
      return '#9ca3af' // Default gray
  }
}

/**
 * Determine if node should show threshold slider handles
 * Shows handles when node has a metric and children (even if not yet split)
 */
function shouldShowHandles(
  node: D3SankeyNode,
  sankeyTree: Map<string, any> | null
): boolean {
  if (!sankeyTree) return false

  const treeNode = sankeyTree.get(node.id)
  if (!treeNode || treeNode.children.length === 0) return false

  // Only show handles if node has a metric set (handles will use defaults if no thresholds)
  if (!treeNode.metric) return false

  // Check if ALL children are leaf nodes (no grandchildren exist)
  const allChildrenAreLeaves = treeNode.children.every((childId: string) => {
    const child = sankeyTree.get(childId)
    return child && child.children.length === 0
  })

  return allChildrenAreLeaves
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

  if (!layout) return null

  // Get bar color for patterns
  const barColor = layout.bars[0]?.color || '#94a3b8'

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
        {/* Striped pattern (for even regions: 0, 2, 4...) - 45 degree diagonal stripes */}
        <pattern
          id={`sankey-histogram-pattern-striped-${node.id}`}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="10" height="10" fill="none"/>
          {/* Vertical lines that become 45-degree diagonals after rotation */}
          <line x1="0" y1="0" x2="0" y2="10" stroke={barColor} strokeWidth="5" opacity="0.7"/>
          <line x1="10" y1="0" x2="10" y2="10" stroke={barColor} strokeWidth="5" opacity="0.7"/>
        </pattern>
      </defs>

      {/* Render horizontal histogram bars - as segments for split patterns */}
      {barSegments.map((segments, barIndex) => (
        <g key={barIndex}>
          {segments.map((segment, segmentIndex) => {
            // Even regions (0, 2, 4...): Striped pattern
            // Odd regions (1, 3, 5...): Solid fill
            const useStripes = segment.patternIndex % 2 === 0
            const fillColor = useStripes
              ? `url(#sankey-histogram-pattern-striped-${node.id})`
              : barColor

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
    </g>
  )
}

interface MetricOverlayPanelProps {
  layoutWidth: number
  layoutHeight: number
  availableStages: StageOption[]
  onMetricClick: (metric: string) => void
}

const MetricOverlayPanel: React.FC<MetricOverlayPanelProps> = ({
  layoutWidth,
  layoutHeight,
  availableStages,
  onMetricClick
}) => {
  const [hoveredMetric, setHoveredMetric] = React.useState<string | null>(null)

  // Group stages by category (for metric overlay panel)
  const categories: Array<{ name: string; stages: StageOption[] }> = [
    {
      name: 'DECODER SIMILARITY',
      stages: availableStages.filter(s => s.category === 'Decoder Similarity')
    },
    {
      name: 'SCORE',
      stages: availableStages.filter(s => s.category === 'Score')
    }
  ].filter(cat => cat.stages.length > 0)

  // Layout constants
  const itemHeight = 26
  const categoryPadding = 8
  const instructionHeight = 20
  const instructionSpacing = 16
  const categoryBoxWidth = 180

  // Calculate total height for single merged container
  const allStages = categories.flatMap(cat => cat.stages)
  const containerHeight = categoryPadding + (allStages.length * itemHeight) + categoryPadding
  const totalHeight = instructionHeight + instructionSpacing + containerHeight

  // Center the overlay in the middle of the Sankey diagram area
  const overlayX = layoutWidth / 2 - categoryBoxWidth / 2
  const overlayY = layoutHeight / 2 - totalHeight / 2

  return (
    <g className="sankey-metric-overlay">
      {/* Instruction header */}
      <text
        x={overlayX}
        y={overlayY}
        dy="0.8em"
        fontSize="14"
        fontWeight="600"
        fill="#374151"
        style={{ userSelect: 'none' }}
      >
        Select a metric to begin:
      </text>

      {/* Single container for all stages */}
      {categories.length > 0 && (() => {
        return (
          <g key="all-stages">
            {/* Single container */}
            <rect
              x={overlayX}
              y={overlayY + instructionHeight + instructionSpacing}
              width={categoryBoxWidth}
              height={containerHeight}
              fill="transparent"
              stroke="#d1d5db"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              rx="6"
            />

            {/* All stages in flat list */}
            {allStages.map((stage, stageIndex) => {
              const itemY = overlayY + instructionHeight + instructionSpacing + categoryPadding + (stageIndex * itemHeight)
              const isHovered = hoveredMetric === stage.id

              return (
                <g
                  key={stage.id}
                  className="sankey-metric-overlay__item"
                  onClick={() => onMetricClick(stage.metric)}
                  onMouseEnter={() => setHoveredMetric(stage.id)}
                  onMouseLeave={() => setHoveredMetric(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={overlayX + 4}
                    y={itemY}
                    width={categoryBoxWidth - 8}
                    height={itemHeight}
                    fill={isHovered ? '#eff6ff' : 'transparent'}
                    rx="3"
                  />
                  <circle
                    cx={overlayX + categoryPadding + 7}
                    cy={itemY + itemHeight / 2}
                    r="7"
                    fill={getMetricColorForDisplay(stage.metric)}
                    stroke="#d1d5db"
                    strokeWidth="0.5"
                  />
                  <text
                    x={overlayX + categoryPadding + 22}
                    y={itemY + itemHeight / 2}
                    dy="0.35em"
                    fontSize="12"
                    fontWeight="500"
                    fill="#1f2937"
                    style={{ userSelect: 'none' }}
                  >
                    {stage.name}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })()}
    </g>
  )
}

interface SankeyInlineSelectorProps {
  selector: {
    nodeId: string
    position: { x: number; y: number }
    availableStages: StageOption[]
  }
  onStageSelect: (stageTypeId: string) => void
  onClose: () => void
}

export const SankeyInlineSelector: React.FC<SankeyInlineSelectorProps> = ({
  selector,
  onStageSelect,
  onClose
}) => {
  return (
    <>
      <div
        className="sankey-stage-selector-overlay"
        onClick={onClose}
      />
      <div
        className="sankey-stage-selector"
        style={{
          left: Math.min(selector.position.x, window.innerWidth - 280),
          top: selector.position.y,
          transform: 'translateY(-50%)'
        }}
      >
        {/* Flat list of all available stages */}
        {selector.availableStages.map((stageType) => (
          <div
            key={stageType.id}
            onClick={() => onStageSelect(stageType.id)}
            className="sankey-stage-selector__item"
          >
            <div className="sankey-stage-selector__item-content">
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                className="sankey-stage-selector__item-circle"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill={getMetricColorForDisplay(stageType.metric)}
                  stroke="#d1d5db"
                  strokeWidth="1"
                />
              </svg>
              <div className="sankey-stage-selector__item-text">
                <div className="sankey-stage-selector__item-title">
                  {stageType.name}
                </div>
                <div className="sankey-stage-selector__item-description">
                  {stageType.description}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

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
  onMetricClick: (metric: string) => void
  onThresholdUpdate: (nodeId: string, newThresholds: number[]) => void
  onThresholdUpdateByPercentile: (nodeId: string, percentiles: number[]) => void
}

export const SankeyOverlay: React.FC<SankeyOverlayProps> = ({
  layout,
  histogramData,
  animationDuration,
  sankeyTree,
  onMetricClick,
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

      {/* Metric Overlay Panel - Visible only when root has no children (initial state) */}
      {(() => {
        if (!sankeyTree) return null

        const treeNode = sankeyTree.get('root')
        if (!treeNode) return null

        // Only show when root has no children (initial state)
        if (treeNode.children.length > 0) return null

        const availableStages = AVAILABLE_STAGES // Could be filtered based on tree state

        return (
          <MetricOverlayPanel
            layoutWidth={layout.width}
            layoutHeight={layout.height}
            availableStages={availableStages}
            onMetricClick={onMetricClick}
          />
        )
      })()}
    </>
  )
}

export default SankeyOverlay
