import React, { useMemo, useState, useRef, useEffect } from 'react'
import type { D3SankeyNode, D3SankeyLink, HistogramData, SankeyLayout, SankeyTreeNode } from '../types'
import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  CONSISTENCY_THRESHOLDS
} from '../lib/constants'
import {
  calculateNodeHistogramLayout,
  shouldDisplayNodeHistogram,
  getNodeHistogramMetric,
  hasOutgoingLinks,
  calculateHistogramYAxisTicks
} from '../lib/sankey-histogram-utils'
// Removed: getNodeThresholds, getExactMetricFromPercentile - using v2 simplified system
import { calculateHorizontalBarSegments } from '../lib/histogram-utils'
import { scaleLinear } from 'd3-scale'
import { ThresholdHandles } from './ThresholdHandles'
// Removed: TAG_CATEGORIES import - not needed in v2

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

// REMOVED: AVAILABLE_STAGES - using fixed stage configs from lib/sankey-stages.ts

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

  // Calculate histogram layout (V2: metric passed as prop)
  const layout = useMemo(() => {
    if (!histogramData) return null
    return calculateNodeHistogramLayout(node, histogramData, links, metric)
  }, [node, histogramData, links, metric])

  // V2: Use single threshold (drag or committed)
  const threshold = dragThreshold ?? committedThreshold
  const thresholds = threshold !== null ? [threshold] : []

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

  // Get bar color as fallback (metric-specific color for background)
  const barColor = layout.bars[0]?.color || '#94a3b8'

  return (
    <g
      transform={`translate(${layout.x}, ${layout.y})`}
      style={{
        pointerEvents: 'none', // Don't interfere with interactions
        transition: `opacity ${animationDuration}ms ease-out`
      }}
    >

      {/* Render horizontal histogram bars - with neutral color */}
      {barSegments.map((segments, barIndex) => (
        <g key={barIndex}>
          {segments.map((segment, segmentIndex) => {
            // Use neutral color for all histogram bars
            const fillColor = '#94a3b8'

            return (
              <rect
                key={`${barIndex}-${segmentIndex}`}
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
            x2={layout.width}
            y2={thresholdY}
            stroke="#474747ff"
            strokeWidth={2}
            strokeDasharray="2,2"
            opacity={0.85}
            style={{
              pointerEvents: 'none'
            }}
          />
        )
      })}

      {/* Threshold labels - tag names above/below each threshold */}
      {yScale && thresholds.length > 0 && (() => {
        // V2: Get segments from targetSegmentNode
        if (!targetSegmentNode || targetSegmentNode.type !== 'segment') return null
        if (!targetSegmentNode.segments || targetSegmentNode.segments.length !== 2) return null

        const seg0 = targetSegmentNode.segments[0]
        const seg1 = targetSegmentNode.segments[1]

        // Get tag names and colors from segments
        const tag0 = seg0.tagName
        const tag1 = seg1.tagName
        const color0 = seg0.color || '#4b5563'
        const color1 = seg1.color || '#4b5563'

        // Capitalize tag names for display
        const capitalizeTag = (tag: string) => tag.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')

        return thresholds.map((threshold, index) => {
          const thresholdY = yScale(threshold)

          // Position labels above and below the threshold, left-aligned
          // Note: Histogram is inverted (top = small values, bottom = large values)
          // So group 0 (lower values) appears above, group 1 (higher values) below
          const labelAboveY = thresholdY - 8   // 8px above threshold
          const labelBelowY = thresholdY + 16  // 16px below threshold (accounts for text height)
          const labelX = 5                     // Left edge with 5px padding

          const tag0Text = `↑ ${capitalizeTag(tag0)}`
          const tag1Text = `↓ ${capitalizeTag(tag1)}`

          return (
            <g key={`threshold-labels-${index}`}>
              {/* Label above threshold (group 0 - lower metric values) with upward arrow */}
              {/* White stroke outline */}
              <text
                x={labelX}
                y={labelAboveY}
                fontSize={10}
                fill="white"
                stroke="white"
                strokeWidth={3}
                fontWeight={600}
                textAnchor="start"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {tag0Text}
              </text>
              {/* Colored text on top */}
              <text
                x={labelX}
                y={labelAboveY}
                fontSize={10}
                fill={color0}
                fontWeight={600}
                textAnchor="start"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {tag0Text}
              </text>

              {/* Label below threshold (group 1 - higher metric values) with downward arrow */}
              {/* White stroke outline */}
              <text
                x={labelX}
                y={labelBelowY}
                fontSize={10}
                fill="white"
                stroke="white"
                strokeWidth={3}
                fontWeight={600}
                textAnchor="start"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {tag1Text}
              </text>
              {/* Colored text on top */}
              <text
                x={labelX}
                y={labelBelowY}
                fontSize={10}
                fill={color1}
                fontWeight={600}
                textAnchor="start"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {tag1Text}
              </text>
            </g>
          )
        })
      })()}

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
}

export const SankeyOverlay: React.FC<SankeyOverlayProps> = ({
  layout,
  histogramData,
  animationDuration,
  sankeyStructure,
  onThresholdUpdate
}) => {
  // V2: Get current stage from sankeyStructure
  const currentStage = sankeyStructure?.currentStage || 1

  // Track drag preview thresholds by node ID (for live histogram updates without committing)
  const [nodeDragThresholds, setNodeDragThresholds] = useState<Record<string, number[]>>({})

  // V2: Cleanup drag thresholds when structure updates
  React.useEffect(() => {
    if (!sankeyStructure) return

    const timeoutId = setTimeout(() => {
      setNodeDragThresholds({})  // Simply clear all drag thresholds
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [sankeyStructure])

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

          const { min, max } = metricHistogramData.statistics
          const metricMin = min - 0.01
          const metricMax = max + 0.01

          // V2: Use single threshold value from target segment
          const currentThreshold = targetStructureNode.threshold || ((metricMin + metricMax) / 2)

          return (
            <ThresholdHandles
              key={`sliders-${sourceNode.id}-to-${targetNode.id}`}
              orientation="vertical"
              bounds={{ min: 0, max: (sourceNode.y1 || 0) - (sourceNode.y0 || 0) }}
              thresholds={[currentThreshold]}
              metricRange={{ min: metricMin, max: metricMax }}
              position={{ x: sourceNode.x0 || 0, y: sourceNode.y0 || 0 }}
              parentOffset={{ x: layout.margin.left, y: layout.margin.top }}
              showThresholdLine={false}
              showDragTooltip={false}
              usePercentiles={false}
              onUpdate={(values) => {
                // V2: Call onThresholdUpdate with target segment node ID
                onThresholdUpdate(targetNode.id || '', values[0])
              }}
              onDragUpdate={(values) => {
                // Live preview using target node ID
                setNodeDragThresholds(prev => ({
                  ...prev,
                  [targetNode.id || '']: values
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
