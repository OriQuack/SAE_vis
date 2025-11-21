import React, { useMemo, useState, useRef } from 'react'
import type { D3SankeyNode, D3SankeyLink, HistogramData, SankeyLayout } from '../types'
import {
  calculateNodeHistogramLayout,
  hasOutgoingLinks,
  calculateHistogramYAxisTicks
} from '../lib/sankey-histogram-utils'
// Removed: getNodeThresholds, getExactMetricFromPercentile - using v2 simplified system
import { calculateHorizontalBarSegments } from '../lib/histogram-utils'
import { groupFeaturesByThresholds, calculateSegmentProportions } from '../lib/threshold-utils'
import { TAG_CATEGORIES } from '../lib/constants'
import { scaleLinear } from 'd3-scale'
import { ThresholdHandles } from './ThresholdHandles'
// Removed: TAG_CATEGORIES import - not needed in v2 (RE-ADDED for optimistic segments)

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

// REMOVED: AVAILABLE_STAGES - using fixed stage configs from lib/sankey-stages.ts

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a segment tag represents a terminal (end-of-pipeline) state
 * Terminal segments get striped pattern overlay
 */
const isTerminalSegment = (tagName: string): boolean => {
  const terminalTags = ['Fragmented', 'Well-Explained', 'Unsure']
  return terminalTags.includes(tagName)
}

// REMOVED: shouldShowHandles - v2 now shows handles on source nodes, not segment nodes

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SankeyNodeHistogramProps {
  node: D3SankeyNode
  histogramData: HistogramData | null
  links: D3SankeyLink[]
  sankeyStructure: any | null  // V2: simplified structure
  animationDuration: number
  dragThreshold?: number | null  // V2: single threshold for segment nodes
  metric: string  // V2: metric passed explicitly from parent
}

const SankeyNodeHistogram: React.FC<SankeyNodeHistogramProps> = ({
  node,
  histogramData,
  links,
  sankeyStructure,
  animationDuration,
  dragThreshold,
  metric
}) => {
  // V2: Find the target segment node to get committed threshold
  const targetSegmentNode = useMemo(() => {
    const outgoingLink = links.find(l => {
      const sourceNode = typeof l.source === 'object' ? l.source : null
      return sourceNode?.id === node.id
    })
    const targetNode = typeof outgoingLink?.target === 'object' ? outgoingLink?.target : null
    if (!targetNode) return null
    return sankeyStructure?.nodes.find((n: any) => n.id === targetNode.id)
  }, [node, links, sankeyStructure])

  const committedThreshold = targetSegmentNode?.threshold || null

  // Extract segment colors from target segment node
  const segmentColors = useMemo(() => {
    if (!targetSegmentNode || !targetSegmentNode.segments || targetSegmentNode.segments.length < 2) {
      return null
    }
    return {
      below: targetSegmentNode.segments[0].color,  // First segment (< threshold)
      above: targetSegmentNode.segments[1].color   // Second segment (>= threshold)
    }
  }, [targetSegmentNode])

  // Calculate histogram layout (V2: metric, threshold, and segment colors passed)
  const layout = useMemo(() => {
    if (!histogramData) return null
    return calculateNodeHistogramLayout(
      node,
      histogramData,
      links,
      metric,
      committedThreshold,
      segmentColors
    )
  }, [node, histogramData, links, metric, committedThreshold, segmentColors])

  // V2: Use single threshold (drag or committed)
  const threshold = dragThreshold ?? committedThreshold
  const thresholds = useMemo(() => threshold !== null ? [threshold] : [], [threshold])

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

  return (
    <g
      transform={`translate(${layout.x}, ${layout.y})`}
      style={{
        pointerEvents: 'none', // Don't interfere with interactions
        transition: `opacity ${animationDuration}ms ease-out`
      }}
    >

      {/* Render horizontal histogram bars - with fine-grained tag colors */}
      {barSegments.map((segments, barIndex) => {
        const bar = layout.bars[barIndex]
        if (!bar) return null

        return (
          <g key={barIndex}>
            {segments.map((segment, segmentIndex) => {
              // Calculate segment's midpoint Y position in metric space
              const segmentCenterY = segment.y + segment.height / 2

              // Determine color based on segment position relative to threshold
              let fillColor = bar.color || '#94a3b8'  // Fallback to bar's base color
              let segmentTagName: string | null = null

              if (threshold !== null && segmentColors && yScale) {
                // Get the metric value at this segment's center
                const metricValue = yScale.invert(segmentCenterY - layout.y)
                const isBelowThreshold = metricValue < threshold
                fillColor = isBelowThreshold ? segmentColors.below : segmentColors.above

                // Get the tag name for this segment
                if (targetSegmentNode && targetSegmentNode.segments) {
                  const segmentIndex = isBelowThreshold ? 0 : 1
                  segmentTagName = targetSegmentNode.segments[segmentIndex]?.tagName || null
                }
              }

              // Check if this is a terminal segment
              const isTerminal = segmentTagName ? isTerminalSegment(segmentTagName) : false

              return (
                <g key={`${barIndex}-${segmentIndex}`}>
                  {/* Base colored rectangle */}
                  <rect
                    x={segment.x}
                    y={segment.y - layout.y}  // Adjust y relative to group transform
                    width={segment.width}
                    height={segment.height}
                    fill={fillColor}
                    fillOpacity={0.85}
                    stroke="white"
                    strokeWidth={0.3}
                    strokeOpacity={0.6}
                  />
                  {/* Stripe overlay for terminal segments */}
                  {isTerminal && (
                    <rect
                      x={segment.x}
                      y={segment.y - layout.y}
                      width={segment.width}
                      height={segment.height}
                      fill="url(#terminal-stripes)"
                      stroke="none"
                      pointerEvents="none"
                    />
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Threshold lines and labels removed */}

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
                y={12}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
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

// REMOVED: MetricOverlayPanel, SankeyInlineSelector, createPercentileToMetric
// No longer needed with v2 fixed 3-stage architecture

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SankeyOverlayProps {
  layout: SankeyLayout | null
  histogramData: Record<string, HistogramData> | null
  animationDuration: number
  sankeyStructure: any | null  // V2: simplified structure
  onThresholdUpdate: (nodeId: string, newThreshold: number) => void
  tableData?: any | null  // For client-side segment calculation
  onOptimisticSegmentsChange?: (segments: Record<string, any[]>) => void  // Notify parent of preview segments
  onOptimisticThresholdsChange?: (thresholds: Record<string, number>) => void  // Notify parent of preview thresholds
}

export const SankeyOverlay: React.FC<SankeyOverlayProps> = ({
  layout,
  histogramData,
  animationDuration,
  sankeyStructure,
  onThresholdUpdate,
  tableData,
  onOptimisticSegmentsChange,
  onOptimisticThresholdsChange
}) => {
  // Track drag preview thresholds by node ID (for live histogram updates without committing)
  const [nodeDragThresholds, setNodeDragThresholds] = useState<Record<string, number[]>>({})

  // Debounce timer ref for smooth segment updates
  const segmentUpdateTimerRef = useRef<number | null>(null)

  // V2: Cleanup drag thresholds and optimistic segments when structure updates
  React.useEffect(() => {
    if (!sankeyStructure) return

    const timeoutId = setTimeout(() => {
      setNodeDragThresholds({})  // Simply clear all drag thresholds
      // Clear optimistic segments and thresholds in parent
      if (onOptimisticSegmentsChange) {
        onOptimisticSegmentsChange({})
      }
      if (onOptimisticThresholdsChange) {
        onOptimisticThresholdsChange({})
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [sankeyStructure, onOptimisticSegmentsChange, onOptimisticThresholdsChange])

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (segmentUpdateTimerRef.current) {
        clearTimeout(segmentUpdateTimerRef.current)
      }
    }
  }, [])

  if (!layout) return null

  return (
    <>
      {/* Node Histograms - On source nodes, using target segment metrics */}
      <g className="sankey-diagram__node-histograms">
        {layout.nodes.map((node) => {
          // Only render histogram for nodes with outgoing links
          if (!hasOutgoingLinks(node, layout.links)) return null

          // V2: Find the target segment node to get its metric
          const outgoingLink = layout.links.find(l => {
            const sourceNode = typeof l.source === 'object' ? l.source : null
            return sourceNode?.id === node.id
          })

          if (!outgoingLink) return null

          const targetNode = typeof outgoingLink.target === 'object' ? outgoingLink.target : null
          if (!targetNode) return null

          // Get the target segment node from structure to access its metric
          const targetStructureNode = sankeyStructure?.nodes.find((n: any) => n.id === targetNode.id)
          if (!targetStructureNode || targetStructureNode.type !== 'segment') return null

          const metric = targetStructureNode.metric
          if (!metric) return null

        // Look up histogram using target segment node's ID
          const compositeKey = `${metric}:${targetNode.id}`
          const metricHistogramData = histogramData?.[compositeKey] || null

          if (!metricHistogramData) return null

          return (
            <SankeyNodeHistogram
              key={`node-histogram-${node.id}`}
              node={node}
              histogramData={metricHistogramData}
              links={layout.links}
              sankeyStructure={sankeyStructure}
              animationDuration={animationDuration}
              dragThreshold={nodeDragThresholds[targetNode.id || '']?.[0] || null}
              metric={metric}
            />
          )
        })}
      </g>

      {/* Threshold Sliders - On source nodes (root), controlling target segments */}
      <g className="sankey-threshold-sliders-group">
        {layout.nodes.map((sourceNode) => {
          // V2: Show handles on SOURCE nodes that link to segment nodes
          if (!hasOutgoingLinks(sourceNode, layout.links)) return null

          // Find the target segment node
          const outgoingLink = layout.links.find(l => {
            const linkSourceNode = typeof l.source === 'object' ? l.source : null
            return linkSourceNode?.id === sourceNode.id
          })

          if (!outgoingLink) return null

          const targetNode = typeof outgoingLink.target === 'object' ? outgoingLink.target : null
          if (!targetNode) return null

          // Get the target segment node from structure
          const targetStructureNode = sankeyStructure?.nodes.find((n: any) => n.id === targetNode.id)
          if (!targetStructureNode || targetStructureNode.type !== 'segment') return null
          if (!targetStructureNode.metric) return null

          // Get histogram data for min/max values (using target node's ID)
          const compositeKey = `${targetStructureNode.metric}:${targetNode.id}`
          const metricHistogramData = histogramData?.[compositeKey]
          if (!metricHistogramData) return null

          // Use bin edges for metric range to match yScale domain in histogram
          const binEdges = metricHistogramData.histogram.bin_edges
          if (!binEdges || binEdges.length < 2) return null
          const metricMin = binEdges[0]
          const metricMax = binEdges[binEdges.length - 1]

          // V2: Use single threshold value from target segment
          const currentThreshold = targetStructureNode.threshold || ((metricMin + metricMax) / 2)

          return (
            <ThresholdHandles
              key={`sliders-${sourceNode.id}-to-${targetNode.id}`}
              orientation="vertical"
              bounds={{ min: 0, max: (sourceNode.y1 || 0) - (sourceNode.y0 || 0) }}
              thresholds={[currentThreshold]}
              metricRange={{ min: metricMin, max: metricMax }}
              position={{ x: ((sourceNode.x0 || 0) + (sourceNode.x1 || 0)) / 2, y: sourceNode.y0 || 0 }}
              parentOffset={{ x: layout.margin.left, y: layout.margin.top }}
              showThresholdLine={false}
              showDragTooltip={true}
              usePercentiles={false}
              onUpdate={(values) => {
                // V2: Call onThresholdUpdate with target segment node ID
                onThresholdUpdate(targetNode.id || '', values[0])
              }}
              onDragUpdate={(values) => {
                const newThreshold = values[0]
                const targetNodeId = targetNode.id || ''

                // Live preview using target node ID (immediate update for histogram line)
                setNodeDragThresholds(prev => ({
                  ...prev,
                  [targetNodeId]: values
                }))

                // Immediately notify parent of new threshold value (for label update)
                if (onOptimisticThresholdsChange) {
                  onOptimisticThresholdsChange({ [targetNodeId]: newThreshold })
                }

                // Debounce segment calculation for smooth transitions
                if (segmentUpdateTimerRef.current) {
                  clearTimeout(segmentUpdateTimerRef.current)
                }

                segmentUpdateTimerRef.current = setTimeout(() => {
                  // Calculate segment proportions if table data is available
                  if (tableData && targetStructureNode) {
                    try {
                      // Get parent node's feature IDs (features flowing into this segment)
                      const parentNode = sankeyStructure?.nodes.find((n: any) => n.id === targetStructureNode.parentId)
                      if (!parentNode) return

                      // Get stage configuration for metric, tags, and colors
                      const metric = targetStructureNode.metric
                      if (!metric) return

                      // Find the stage config based on metric
                      let stageConfig = null
                      for (const category of Object.values(TAG_CATEGORIES)) {
                        if (category.metric === metric) {
                          stageConfig = category
                          break
                        }
                      }
                      if (!stageConfig) return

                      // Calculate new groups with updated threshold
                      const groups = groupFeaturesByThresholds(
                        parentNode.featureIds,
                        metric,
                        [newThreshold],
                        tableData
                      )

                      if (groups.length > 0) {
                        // Convert groups to segment proportions
                        const newSegments = calculateSegmentProportions(
                          groups,
                          stageConfig.tags,
                          stageConfig.tagColors,
                          parentNode.featureCount
                        )

                        // Notify parent component of optimistic segments
                        if (onOptimisticSegmentsChange) {
                          onOptimisticSegmentsChange({ [targetNodeId]: newSegments })
                        }
                      }
                    } catch (error) {
                      console.warn('[onDragUpdate] Failed to calculate segments:', error)
                    }
                  }
                }, 100) // 150ms debounce for smooth updates
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
