import React, { useMemo, useState, useRef, useCallback } from 'react'
import type { D3SankeyNode, D3SankeyLink, HistogramData, SankeyLayout } from '../types'
import {
  METRIC_FEATURE_SPLITTING,
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
import { getNodeThresholds } from '../lib/threshold-utils'

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
  category: 'Feature Splitting' | 'Score'
}

// Available stages for the NEW system - categorized by type
export const AVAILABLE_STAGES: StageOption[] = [
  // Feature Splitting (1 metric)
  {
    id: 'feature_splitting',
    name: 'Feature Splitting',
    description: 'Split by feature splitting score',
    metric: METRIC_FEATURE_SPLITTING,
    thresholds: [0.3],
    category: 'Feature Splitting'
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

  // Score metrics (4 metrics)
  {
    id: 'fuzz_score',
    name: 'Fuzz Score',
    description: 'Split by fuzz score',
    metric: METRIC_SCORE_FUZZ,
    thresholds: [0.5],
    category: 'Score'
  },
  {
    id: 'detection_score',
    name: 'Detection Score',
    description: 'Split by detection score',
    metric: METRIC_SCORE_DETECTION,
    thresholds: [0.5],
    category: 'Score'
  },
  {
    id: 'embedding_score',
    name: 'Embedding Score',
    description: 'Split by embedding score',
    metric: METRIC_SCORE_EMBEDDING,
    thresholds: [0.5],
    category: 'Score'
  },
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
    case METRIC_FEATURE_SPLITTING:
      return METRIC_COLORS.FEATURE_SPLITTING
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
 * Maps threshold value to Y coordinate on node
 */
function calculateHandleYFromThreshold(
  threshold: number,
  metricMin: number,
  metricMax: number,
  nodeY0: number,
  nodeY1: number
): number {
  const ratio = (threshold - metricMin) / (metricMax - metricMin)
  return nodeY0 + ratio * (nodeY1 - nodeY0)
}

/**
 * Maps Y coordinate to threshold value
 */
function calculateThresholdFromHandleY(
  y: number,
  metricMin: number,
  metricMax: number,
  nodeY0: number,
  nodeY1: number
): number {
  const ratio = (y - nodeY0) / (nodeY1 - nodeY0)
  return metricMin + ratio * (metricMax - metricMin)
}

/**
 * Determine if node should show threshold slider handles
 */
function shouldShowHandles(
  node: D3SankeyNode,
  sankeyTree: Map<string, any> | null
): boolean {
  if (!sankeyTree) return false

  const treeNode = sankeyTree.get(node.id)
  if (!treeNode) return false

  return treeNode.children.length > 0  // Has been split
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface NodeThresholdSlidersProps {
  node: D3SankeyNode
  thresholds: number[]
  metricMin: number
  metricMax: number
  onThresholdUpdate: (nodeId: string, newThresholds: number[]) => void
}

const NodeThresholdSliders: React.FC<NodeThresholdSlidersProps> = ({
  node,
  thresholds,
  metricMin,
  metricMax,
  onThresholdUpdate
}) => {
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null)
  const [tempThresholds, setTempThresholds] = useState<number[]>(thresholds)
  const rafIdRef = useRef<number | null>(null)

  // Update temp thresholds when props change
  React.useEffect(() => {
    if (draggingHandle === null) {
      setTempThresholds(thresholds)
    }
  }, [thresholds, draggingHandle])

  const handleMouseDown = useCallback((handleIndex: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()  // Prevent text selection

    // Disable selection globally during drag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'

    setDraggingHandle(handleIndex)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingHandle === null || !node.y0 || !node.y1) return

    e.preventDefault()  // Prevent any default drag behavior

    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      // Get SVG element to calculate correct coordinates
      const svgElement = (e.target as Element).closest('svg')
      if (!svgElement) return

      const svgRect = svgElement.getBoundingClientRect()
      const svgY = e.clientY - svgRect.top

      // Account for margin transform (get margin from parent g element)
      const parentG = (e.target as Element).closest('g[transform]')
      let marginTop = 0
      if (parentG) {
        const transform = parentG.getAttribute('transform')
        const match = transform?.match(/translate\([^,]+,\s*(\d+)\)/)
        if (match) {
          marginTop = parseInt(match[1])
        }
      }

      const adjustedY = svgY - marginTop

      // Clamp Y within node bounds
      const clampedY = Math.max(node.y0!, Math.min(node.y1!, adjustedY))

      // Convert to threshold value
      const newThreshold = calculateThresholdFromHandleY(
        clampedY,
        metricMin,
        metricMax,
        node.y0!,
        node.y1!
      )

      // Update temp thresholds with constraints
      setTempThresholds(prev => {
        const updated = [...prev]
        updated[draggingHandle] = newThreshold

        // Ensure thresholds stay ordered
        if (draggingHandle === 0 && updated.length > 1) {
          // Top handle: must be less than bottom handle
          updated[0] = Math.min(updated[0], updated[1] - 0.01)
        } else if (draggingHandle === 1 && updated.length > 1) {
          // Bottom handle: must be greater than top handle
          updated[1] = Math.max(updated[1], updated[0] + 0.01)
        }

        return updated
      })
    })
  }, [draggingHandle, node, metricMin, metricMax])

  const handleMouseUp = useCallback(() => {
    if (draggingHandle === null) return

    // Restore global styles
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    // Call update with final thresholds
    onThresholdUpdate(node.id || '', tempThresholds)
    setDraggingHandle(null)
  }, [draggingHandle, tempThresholds, onThresholdUpdate, node.id])

  // Global mouse event listeners during drag
  React.useEffect(() => {
    if (draggingHandle === null) return

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp])

  if (!node.x0 || !node.y0 || !node.y1) {
    return null
  }

  const displayThresholds = draggingHandle !== null ? tempThresholds : thresholds

  return (
    <g className="sankey-threshold-sliders">
      {displayThresholds.map((threshold, index) => {
        const y = calculateHandleYFromThreshold(
          threshold,
          metricMin,
          metricMax,
          node.y0!,
          node.y1!
        )
        const isHovered = draggingHandle === index

        return (
          <g key={index}>
            {/* Horizontal line */}
            <line
              x1={node.x0!}
              y1={y}
              x2={node.x0! - 10}
              y2={y}
              stroke="#3b82f6"
              strokeWidth={2}
              opacity={isHovered ? 1 : 0.8}
              style={{ pointerEvents: 'none' }}
            />

            {/* Drag handle */}
            <circle
              cx={node.x0! - 10}
              cy={y}
              r={8}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={2}
              opacity={isHovered ? 0.9 : 0.8}
              style={{ cursor: 'ns-resize' }}
              onMouseDown={handleMouseDown(index)}
            />

            {/* Threshold value label (show when dragging) */}
            {isHovered && (
              <text
                x={node.x0! - 25}
                y={y}
                dy="0.35em"
                fontSize="11"
                fontFamily="monospace"
                fill="#1f2937"
                textAnchor="end"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {threshold.toFixed(3)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

interface SankeyNodeHistogramProps {
  node: D3SankeyNode
  histogramData: HistogramData | null
  links: D3SankeyLink[]
  animationDuration: number
}

const SankeyNodeHistogram: React.FC<SankeyNodeHistogramProps> = ({
  node,
  histogramData,
  links,
  animationDuration
}) => {
  // Calculate histogram layout
  const layout = useMemo(() => {
    if (!histogramData) return null
    return calculateNodeHistogramLayout(node, histogramData, links)
  }, [node, histogramData, links])

  if (!layout) return null

  return (
    <g
      transform={`translate(${layout.x}, ${layout.y})`}
      style={{
        pointerEvents: 'none', // Don't interfere with interactions
        transition: `opacity ${animationDuration}ms ease-out`
      }}
    >
      {/* Render horizontal histogram bars */}
      {layout.bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y - layout.y}  // Adjust y relative to group transform
          width={bar.width}
          height={bar.height}
          fill={bar.color}
          fillOpacity={0.75}
          stroke="white"
          strokeWidth={0.3}
          strokeOpacity={0.6}
        />
      ))}
    </g>
  )
}

interface MetricOverlayPanelProps {
  rootNode: D3SankeyNode
  availableStages: StageOption[]
  onMetricClick: (metric: string) => void
}

const MetricOverlayPanel: React.FC<MetricOverlayPanelProps> = ({
  rootNode,
  availableStages,
  onMetricClick
}) => {
  const [hoveredMetric, setHoveredMetric] = React.useState<string | null>(null)

  // Group stages by category (for metric overlay panel)
  const categories: Array<{ name: string; stages: StageOption[] }> = [
    {
      name: 'FEATURE SPLITTING',
      stages: availableStages.filter(s => s.category === 'Feature Splitting')
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

  // Position overlay to the right of root node
  const overlayX = (rootNode.x1 || 0) + 30
  const totalHeight = instructionHeight + instructionSpacing + containerHeight
  const overlayY = ((rootNode.y0 || 0) + (rootNode.y1 || 0)) / 2 - totalHeight / 2

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
// MAIN COMPONENT
// ============================================================================

interface SankeyOverlayProps {
  layout: SankeyLayout | null
  histogramData: Record<string, HistogramData> | null
  animationDuration: number
  sankeyTree: Map<string, any> | null
  onMetricClick: (metric: string) => void
  onThresholdUpdate: (nodeId: string, newThresholds: number[]) => void
}

export const SankeyOverlay: React.FC<SankeyOverlayProps> = ({
  layout,
  histogramData,
  animationDuration,
  sankeyTree,
  onMetricClick,
  onThresholdUpdate
}) => {
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

          // Get histogram data for the metric
          const metricHistogramData = histogramData?.[metric] || null

          // Only render if we should display histogram for this node
          if (!shouldDisplayNodeHistogram(node, layout.links, histogramData)) return null

          return (
            <SankeyNodeHistogram
              key={`node-histogram-${node.id}`}
              node={node}
              histogramData={metricHistogramData}
              links={layout.links}
              animationDuration={animationDuration}
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

          // Get histogram data for min/max values
          const metricHistogramData = histogramData?.[metric]

          if (!metricHistogramData) {
            return null
          }

          // Get thresholds for this node
          const thresholds = getNodeThresholds(node.id || '', sankeyTree)
          const { min, max } = metricHistogramData.statistics

          // ALWAYS show exactly 2 sliders (top and bottom handles)
          let displayThresholds: number[]
          let metricMin = min
          let metricMax = max

          if (!thresholds || thresholds.length < 2) {
            // No thresholds or less than 2: place handles beyond data range to prevent accidental splits
            // Top handle at min - 0.01, bottom handle at max + 0.01
            displayThresholds = [min - 0.01, max + 0.01]
            metricMin = min - 0.01
            metricMax = max + 0.01
          } else {
            // Use first two thresholds only (always exactly 2 sliders)
            displayThresholds = [thresholds[0], thresholds[1]]
          }

          return (
            <NodeThresholdSliders
              key={`sliders-${node.id}`}
              node={node}
              thresholds={displayThresholds}
              metricMin={metricMin}
              metricMax={metricMax}
              onThresholdUpdate={onThresholdUpdate}
            />
          )
        })}
      </g>

      {/* Metric Overlay Panel - Visible only when root has no children (initial state) */}
      {(() => {
        const rootNode = layout.nodes.find(n => n.id === 'root')
        if (!rootNode || !sankeyTree) return null

        const treeNode = sankeyTree.get('root')
        if (!treeNode) return null

        // Only show when root has no children (initial state)
        if (treeNode.children.length > 0) return null

        const availableStages = AVAILABLE_STAGES // Could be filtered based on tree state

        return (
          <MetricOverlayPanel
            rootNode={rootNode}
            availableStages={availableStages}
            onMetricClick={onMetricClick}
          />
        )
      })()}
    </>
  )
}

export default SankeyOverlay
