import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import {
  calculateSankeyLayout,
  validateSankeyData,
  validateDimensions,
  getNodeColor,
  getLinkColor,
  getSankeyPath,
  formatNodeTooltip,
  formatLinkTooltip,
  SANKEY_COLORS,
  DEFAULT_ANIMATION
} from '../utils/d3-helpers'
import type { TooltipData, D3SankeyNode, D3SankeyLink, NodeCategory, MetricType } from '../services/types'
import {
  getParentNodeId,
  isScoreAgreementNode
} from '../services/types'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Helper function to get parent node name from parent node ID
function getParentNodeName(parentNodeId: string, allNodes: D3SankeyNode[]): string {
  const parentNode = allNodes.find(node => node.id === parentNodeId)
  return parentNode ? parentNode.name : parentNodeId
}

// Map node categories to appropriate metrics for histogram display
function getMetricsForNode(node: D3SankeyNode): MetricType[] | null {
  switch (node.category) {
    case 'root':
      return null // No histogram for "All Features" - nothing to threshold yet

    case 'feature_splitting':
      return null // No histogram for feature splitting - it's a boolean field (true/false/null), not a continuous metric

    case 'semantic_distance':
      return ['semdist_mean'] // Single histogram for semantic distance classification

    case 'score_agreement':
      return ['score_detection', 'score_fuzz', 'score_simulation'] // Three stacked histograms for score agreement

    default:
      return null
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showTooltips?: boolean
  showHistogramOnClick?: boolean  // Enable histogram popover on node/link clicks
}

interface TooltipProps {
  data: TooltipData | null
  visible: boolean
}

interface LegendProps {
  colors: typeof SANKEY_COLORS
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

const Tooltip: React.FC<TooltipProps> = ({ data, visible }) => {
  if (!visible || !data) return null

  return (
    <div
      className="sankey-tooltip"
      style={{
        position: 'absolute',
        left: data.x + 10,
        top: data.y - 10,
        transform: 'translateY(-100%)',
        pointerEvents: 'none',
        zIndex: 1000
      }}
    >
      <div className="sankey-tooltip__content">
        <div className="sankey-tooltip__title">{data.title}</div>
        <div className="sankey-tooltip__body">
          {data.content.map((item: { label: string; value: string | number }, index: number) => (
            <div key={index} className="sankey-tooltip__row">
              <span className="sankey-tooltip__label">{item.label}:</span>
              <span className="sankey-tooltip__value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LEGEND COMPONENT
// ============================================================================

const Legend: React.FC<LegendProps> = ({ colors }) => {
  const legendItems = [
    { key: 'root', label: 'All Features' },
    { key: 'feature_splitting', label: 'Feature Splitting' },
    { key: 'semantic_distance', label: 'Semantic Distance' },
    { key: 'score_agreement', label: 'Score Agreement' }
  ] as const

  return (
    <div className="sankey-legend">
      <div className="sankey-legend__title">Categories</div>
      <div className="sankey-legend__items">
        {legendItems.map(({ key, label }) => (
          <div key={key} className="sankey-legend__item">
            <div
              className="sankey-legend__color"
              style={{ backgroundColor: colors[key] }}
            />
            <span className="sankey-legend__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// NODE COMPONENT
// ============================================================================

const SankeyNodeComponent: React.FC<{
  node: D3SankeyNode
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, node: D3SankeyNode) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, node: D3SankeyNode) => void
  thresholdGroupInfo?: {
    hasGroup: boolean
    groupSize: number
    primaryMetric?: MetricType
  }
}> = ({ node, animationDuration, onHover, onLeave, onHistogramClick, thresholdGroupInfo }) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = useCallback((event: React.MouseEvent) => {
    setIsHovered(true)
    onHover(event, node)
  }, [node, onHover])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    onLeave()
  }, [onLeave])

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (onHistogramClick) {
      onHistogramClick(event, node)
    }
  }, [onHistogramClick, node])

  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node.category as NodeCategory)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0

  // Determine if this node has threshold group styling
  const hasThresholdGroup = thresholdGroupInfo?.hasGroup && thresholdGroupInfo.groupSize > 1
  const strokeColor = isHovered ? '#ffffff' : (hasThresholdGroup ? '#3b82f6' : 'none')
  const strokeWidth = isHovered ? 2 : (hasThresholdGroup ? 1.5 : 0)
  const strokeDasharray = hasThresholdGroup ? '3,2' : 'none'

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{
          transition: `all ${animationDuration}ms ease-out`,
          cursor: onHistogramClick ? 'pointer' : 'default',
          filter: isHovered ? 'brightness(1.1)' : 'none'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onHistogramClick ? handleClick : undefined}
        aria-label={`${node.name}: ${node.feature_count} features${hasThresholdGroup ? ` (shares thresholds with ${thresholdGroupInfo.groupSize - 1} other nodes)` : ''}`}
      />

      {/* Node label */}
      <text
        x={node.x1 + 6}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#374151"
        fontWeight={isHovered ? 600 : 400}
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      {/* Feature count */}
      <text
        x={node.x1 + 6}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#6b7280"
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>

      {/* Threshold group indicator */}
      {hasThresholdGroup && (
        <g>
          <circle
            cx={node.x1 - 8}
            cy={node.y0 + 8}
            r={4}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={node.x1 - 8}
            y={node.y0 + 8}
            textAnchor="middle"
            dy="0.35em"
            fontSize={8}
            fill="#ffffff"
            fontWeight={600}
            style={{ pointerEvents: 'none' }}
          >
            {thresholdGroupInfo.groupSize}
          </text>
        </g>
      )}
    </g>
  )
}

// ============================================================================
// LINK COMPONENT
// ============================================================================

const SankeyLinkComponent: React.FC<{
  link: D3SankeyLink
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, link: D3SankeyLink) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, link: D3SankeyLink) => void
}> = ({ link, animationDuration, onHover, onLeave, onHistogramClick }) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = useCallback((event: React.MouseEvent) => {
    setIsHovered(true)
    onHover(event, link)
  }, [link, onHover])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    onLeave()
  }, [onLeave])

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (onHistogramClick) {
      onHistogramClick(event, link)
    }
  }, [onHistogramClick, link])

  const sourceNode = typeof link.source === 'object' ? link.source : null
  if (!sourceNode) return null

  const path = getSankeyPath(link)
  const color = getLinkColor(sourceNode.category as NodeCategory)

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, link.width || 0)}
      opacity={isHovered ? 0.9 : 0.6}
      style={{
        transition: `all ${animationDuration}ms ease-out`,
        cursor: onHistogramClick ? 'pointer' : 'default'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onHistogramClick ? handleClick : undefined}
      aria-label={`Flow: ${link.value} features from ${sourceNode.name}`}
    />
  )
}

// ============================================================================
// MAIN SANKEY DIAGRAM COMPONENT
// ============================================================================

export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  width = 800,
  height = 600,
  className = '',
  animationDuration = DEFAULT_ANIMATION.duration,
  showTooltips = true,
  showHistogramOnClick = true
}) => {
  const data = useVisualizationStore(state => state.sankeyData)
  const loading = useVisualizationStore(state => state.loading.sankey)
  const error = useVisualizationStore(state => state.errors.sankey)
  const { showHistogramPopover, getNodesInSameThresholdGroup } = useVisualizationStore()

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)

  // Local state
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [containerSize, setContainerSize] = useState({ width, height })

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (data) {
      errors.push(...validateSankeyData(data))
    }

    errors.push(...validateDimensions(containerSize.width, containerSize.height))

    return errors
  }, [data, containerSize])

  // Calculate layout
  const layout = useMemo(() => {
    if (!data || validationErrors.length > 0) return null
    return calculateSankeyLayout(data, containerSize.width, containerSize.height)
  }, [data, containerSize, validationErrors])

  // Calculate threshold group information for all nodes (MOVED OUTSIDE MAP TO FIX HOOKS VIOLATION)
  const allNodeThresholdGroups = useMemo(() => {
    if (!data || !layout) return new Map()

    const nodeGroupMap = new Map()

    for (const node of layout.nodes) {
      const metrics = getMetricsForNode(node)
      if (!metrics) {
        nodeGroupMap.set(node.id, { hasGroup: false, groupSize: 1 })
        continue
      }

      // Check each metric to see if this node belongs to a threshold group
      let found = false
      for (const metric of metrics) {
        const groupNodes = getNodesInSameThresholdGroup(node.id, metric)
        if (groupNodes.length > 1) {
          nodeGroupMap.set(node.id, {
            hasGroup: true,
            groupSize: groupNodes.length,
            primaryMetric: metric
          })
          found = true
          break
        }
      }

      if (!found) {
        nodeGroupMap.set(node.id, { hasGroup: false, groupSize: 1 })
      }
    }

    return nodeGroupMap
  }, [data, layout, getNodesInSameThresholdGroup])

  // Handle container resize
  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setContainerSize({
        width: rect.width || width,
        height: rect.height || height
      })
    }
  }, [width, height])

  // Set up resize observer
  useEffect(() => {
    handleResize()

    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [handleResize])

  // Handle node hover
  const handleNodeHover = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!showTooltips) return

    const rect = event.currentTarget.getBoundingClientRect()

    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      title: node.name,
      content: formatNodeTooltip(node)
    })
    setShowTooltip(true)
  }, [showTooltips])

  // Handle link hover
  const handleLinkHover = useCallback((event: React.MouseEvent, link: D3SankeyLink) => {
    if (!showTooltips) return

    setTooltip({
      x: event.clientX,
      y: event.clientY,
      title: 'Flow',
      content: formatLinkTooltip(link)
    })
    setShowTooltip(true)
  }, [showTooltips])

  const handleHoverLeave = useCallback(() => {
    setShowTooltip(false)
  }, [])

  // Handle node histogram click with threshold group information
  const handleNodeHistogramClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!showHistogramOnClick) return

    event.stopPropagation()

    // Get appropriate metrics for this node
    const metrics = getMetricsForNode(node)
    if (!metrics) {
      // No histogram should be shown for this node type (e.g., root nodes)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()

    // Calculate position relative to viewport for accurate placement
    const position = {
      x: rect.left + rect.width / 2,  // Center horizontally on the node
      y: rect.top + window.scrollY     // Account for page scroll
    }

    // If container exists, ensure position is relative to the whole page
    if (containerRect) {
      // Adjust for container offset if needed
      position.x = Math.max(position.x, containerRect.left + 50)  // Minimum offset from container edge
      position.x = Math.min(position.x, containerRect.right - 50) // Maximum offset from container edge
    }

    // Check if this is a score agreement node to provide parent context
    const parentNodeId = isScoreAgreementNode(node.id) ? getParentNodeId(node.id) : undefined
    const parentNodeName = parentNodeId && data ? getParentNodeName(parentNodeId, data.nodes) : undefined

    showHistogramPopover(node.id, node.name, metrics, position, parentNodeId || undefined, parentNodeName || undefined)
  }, [showHistogramOnClick, showHistogramPopover, data])

  // Handle link histogram click (show histogram for source node) with threshold group information
  const handleLinkHistogramClick = useCallback((event: React.MouseEvent, link: D3SankeyLink) => {
    if (!showHistogramOnClick) return

    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return

    // Get appropriate metrics for the source node
    const metrics = getMetricsForNode(sourceNode)
    if (!metrics) {
      // No histogram should be shown for this node type (e.g., root nodes)
      return
    }

    event.stopPropagation()

    // Use click position relative to viewport with scroll compensation
    const position = {
      x: event.clientX,                    // Mouse x position relative to viewport
      y: event.clientY + window.scrollY    // Mouse y position with scroll offset
    }

    // Ensure position is within reasonable bounds
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    // Keep position within viewport bounds with some padding
    position.x = Math.max(50, Math.min(position.x, viewport.width - 50))
    position.y = Math.max(50, Math.min(position.y + window.scrollY, viewport.height + window.scrollY - 50))

    // Check if this is a score agreement node to provide parent context
    const parentNodeId = isScoreAgreementNode(sourceNode.id) ? getParentNodeId(sourceNode.id) : undefined
    const parentNodeName = parentNodeId && data ? getParentNodeName(parentNodeId, data.nodes) : undefined

    showHistogramPopover(sourceNode.id, sourceNode.name, metrics, position, parentNodeId || undefined, parentNodeName || undefined)
  }, [showHistogramOnClick, showHistogramPopover, data])

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!data) return null

    const totalFeatures = data.metadata.total_features
    const totalNodes = data.nodes.length
    const totalLinks = data.links.length

    return {
      totalFeatures,
      totalNodes,
      totalLinks,
      stages: Math.max(...data.nodes.map(node => node.stage)) + 1
    }
  }, [data])

  return (
    <div className={`sankey-diagram ${className}`}>
      {/* Header */}
      <div className="sankey-diagram__header">
        <div className="sankey-diagram__title-section">
          <h3 className="sankey-diagram__title">Feature Flow Analysis</h3>
          {summary && (
            <div className="sankey-diagram__summary">
              <span className="sankey-diagram__stat">
                {summary.totalFeatures.toLocaleString()} features
              </span>
              <span className="sankey-diagram__stat">
                {summary.stages} stages
              </span>
              <span className="sankey-diagram__stat">
                {summary.totalNodes} categories
              </span>
            </div>
          )}
        </div>
        <Legend colors={SANKEY_COLORS} />
      </div>

      {/* Error display */}
      {error && (
        <div className="sankey-diagram__error">
          <span className="sankey-diagram__error-icon">⚠️</span>
          <span className="sankey-diagram__error-text">{error}</span>
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="sankey-diagram__validation-errors">
          {validationErrors.map((error, index) => (
            <div key={index} className="sankey-diagram__validation-error">
              {error}
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="sankey-diagram__loading">
          <div className="sankey-diagram__loading-spinner" />
          <span>Loading Sankey diagram...</span>
        </div>
      )}

      {/* Main visualization */}
      {layout && data && !loading && !error && validationErrors.length === 0 && (
        <div
          ref={containerRef}
          className="sankey-diagram__container"
          style={{ width: '100%', height: containerSize.height }}
        >
          <svg
            width={containerSize.width}
            height={containerSize.height}
            className="sankey-diagram__svg"
          >
            {/* Background */}
            <rect
              width={containerSize.width}
              height={containerSize.height}
              fill="#ffffff"
            />

            {/* Chart area */}
            <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
              {/* Links (render first so nodes appear on top) */}
              <g className="sankey-diagram__links">
                {layout.links.map((link, index) => (
                  <SankeyLinkComponent
                    key={`link-${index}`}
                    link={link}
                    index={index}
                    animationDuration={animationDuration}
                    onHover={handleLinkHover}
                    onLeave={handleHoverLeave}
                    onHistogramClick={handleLinkHistogramClick}
                  />
                ))}
              </g>

              {/* Nodes */}
              <g className="sankey-diagram__nodes">
                {layout.nodes.map((node, index) => {
                  // Get pre-calculated threshold group information for this node
                  const thresholdGroupInfo = allNodeThresholdGroups.get(node.id) || { hasGroup: false, groupSize: 1 }

                  return (
                    <SankeyNodeComponent
                      key={node.id}
                      node={node}
                      index={index}
                      animationDuration={animationDuration}
                      onHover={handleNodeHover}
                      onLeave={handleHoverLeave}
                      onHistogramClick={handleNodeHistogramClick}
                      thresholdGroupInfo={thresholdGroupInfo}
                    />
                  )
                })}
              </g>

              {/* Stage labels */}
              <g className="sankey-diagram__stage-labels">
                {Array.from(new Set(layout.nodes.map(node => node.stage))).map(stage => {
                  const stageNodes = layout.nodes.filter(node => node.stage === stage)
                  const avgX = stageNodes.reduce((sum, node) => sum + ((node.x0 || 0) + (node.x1 || 0)) / 2, 0) / stageNodes.length

                  const stageLabels = ['All Features', 'Feature Splitting', 'Semantic Distance', 'Score Agreement']

                  return (
                    <text
                      key={stage}
                      x={avgX}
                      y={-5}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill="#374151"
                    >
                      Stage {stage + 1}: {stageLabels[stage] || `Stage ${stage + 1}`}
                    </text>
                  )
                })}
              </g>
            </g>
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="sankey-diagram__empty">
          <div className="sankey-diagram__empty-icon">📊</div>
          <div className="sankey-diagram__empty-title">No Data Available</div>
          <div className="sankey-diagram__empty-description">
            Select filters to generate the Sankey diagram
          </div>
        </div>
      )}

      {/* Tooltip */}
      {showTooltips && <Tooltip data={tooltip} visible={showTooltip} />}
    </div>
  )
}

export default SankeyDiagram