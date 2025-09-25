import React, { useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { DEFAULT_ANIMATION, calculateSankeyLayout, validateSankeyData, validateDimensions, getNodeColor, getLinkColor, getSankeyPath, SANKEY_COLORS } from '../lib/d3-utils'
import { useResizeObserver } from '../lib/utils'
import { getParentNodeId, isScoreAgreementNode } from '../types'
import type { D3SankeyNode, D3SankeyLink, SankeyData, NodeCategory, MetricType } from '../types'

// ==================== INLINE COMPONENTS ====================
const ErrorMessage: React.FC<{ message: string; className?: string }> = ({ message, className }) => (
  <div className={`error-message ${className || ''}`} style={{ color: 'red', padding: '8px', margin: '8px 0' }}>
    {message}
  </div>
)


// ==================== CONSTANTS ====================
const STAGE_LABELS = [
  'All Features',
  'Feature Splitting',
  'Semantic Distance',
  'Score Agreement'
]

const LEGEND_ITEMS = [
  { key: 'root', label: 'All Features' },
  { key: 'feature_splitting', label: 'Feature Splitting' },
  { key: 'semantic_distance', label: 'Semantic Distance' },
  { key: 'score_agreement', label: 'Score Agreement' }
] as const

// ==================== UTILITY FUNCTIONS ====================
function getParentNodeName(parentNodeId: string, allNodes: D3SankeyNode[]): string {
  const parentNode = allNodes.find(node => node.id === parentNodeId)
  return parentNode ? parentNode.name : parentNodeId
}

function getMetricsForNode(node: D3SankeyNode): MetricType[] | null {
  switch (node.category) {
    case 'root':
      return null // No histogram for "All Features" - nothing to threshold yet

    case 'feature_splitting':
      return ['feature_splitting'] // Single histogram for feature splitting classification (cosine similarity metric)

    case 'semantic_distance':
      return ['semdist_mean'] // Single histogram for semantic distance classification

    case 'score_agreement':
      return ['score_detection', 'score_fuzz', 'score_simulation'] // Three stacked histograms for score agreement

    default:
      return null
  }
}

// ==================== INTERFACES ====================
interface ThresholdGroupInfo {
  hasGroup: boolean
  groupSize: number
  primaryMetric?: string
}

interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showHistogramOnClick?: boolean
}

interface SankeyNodeComponentProps {
  node: D3SankeyNode
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, node: D3SankeyNode) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, node: D3SankeyNode) => void
  thresholdGroupInfo?: ThresholdGroupInfo
}

interface SankeyLinkComponentProps {
  link: D3SankeyLink
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, link: D3SankeyLink) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, link: D3SankeyLink) => void
}

interface SankeyHeaderProps {
  summary: {
    totalFeatures: number
    totalNodes: number
    totalLinks: number
    stages: number
  } | null
}

interface SankeyLegendProps {
  colors: typeof SANKEY_COLORS
}

interface SankeyStageLabelsProps {
  nodes: D3SankeyNode[]
}

// ==================== SUB-COMPONENTS ====================
const SankeyNode = React.memo(({
  node,
  animationDuration,
  onHover,
  onLeave,
  onHistogramClick,
  thresholdGroupInfo
}: SankeyNodeComponentProps) => {
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

  const color = getNodeColor(node)
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
        x={node.x0 - 6}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#374151"
        fontWeight={isHovered ? 600 : 400}
        textAnchor="end"
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      {/* Feature count */}
      <text
        x={node.x0 - 6}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#6b7280"
        textAnchor="end"
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>
    </g>
  )
})

const SankeyLink: React.FC<SankeyLinkComponentProps> = React.memo(({
  link,
  animationDuration,
  onHover,
  onLeave,
  onHistogramClick
}) => {
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
  const color = getLinkColor(link)

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
})

const SankeyLegend: React.FC<SankeyLegendProps> = React.memo(({ colors }) => {
  return (
    <div className="sankey-legend">
      <div className="sankey-legend__title">Categories</div>
      <div className="sankey-legend__items">
        {LEGEND_ITEMS.map(({ key, label }) => (
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
})

const SankeyHeader: React.FC<SankeyHeaderProps> = React.memo(({ summary }) => {
  return (
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
      <SankeyLegend colors={SANKEY_COLORS} />
    </div>
  )
})

const SankeyStageLabels: React.FC<SankeyStageLabelsProps> = React.memo(({ nodes }) => {
  const uniqueStages = Array.from(new Set(nodes.map(node => node.stage)))

  return (
    <g className="sankey-diagram__stage-labels">
      {uniqueStages.map(stage => {
        const stageNodes = nodes.filter(node => node.stage === stage)
        const avgX = stageNodes.reduce((sum, node) => sum + ((node.x0 || 0) + (node.x1 || 0)) / 2, 0) / stageNodes.length

        return (
          <text
            key={stage}
            x={avgX}
            y={15}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#374151"
          >
            Stage {stage + 1}: {STAGE_LABELS[stage] || `Stage ${stage + 1}`}
          </text>
        )
      })}
    </g>
  )
})

// Set display names
SankeyNode.displayName = 'SankeyNode'
SankeyLink.displayName = 'SankeyLink'
SankeyLegend.displayName = 'SankeyLegend'
SankeyHeader.displayName = 'SankeyHeader'
SankeyStageLabels.displayName = 'SankeyStageLabels'

// ==================== MAIN COMPONENT ====================
export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  width = 800,
  height = 600,
  className = '',
  animationDuration = DEFAULT_ANIMATION.duration,
  showHistogramOnClick = true
}) => {
  const data = useVisualizationStore(state => state.sankeyData)
  const loading = useVisualizationStore(state => state.loading.sankey)
  const error = useVisualizationStore(state => state.errors.sankey)

  // Use previous data when loading to prevent flickering
  const [displayData, setDisplayData] = React.useState(data)
  const [isUpdating, setIsUpdating] = React.useState(false)

  React.useEffect(() => {
    if (!loading && data) {
      setDisplayData(data)
      setIsUpdating(false)
    } else if (loading && displayData) {
      // Only show updating state if we have previous data
      setIsUpdating(true)
    }
  }, [data, loading, displayData])

  const { showHistogramPopover, getNodesInSameThresholdGroup } = useVisualizationStore()

  // ==================== SANKEY LAYOUT LOGIC ====================
  const { layout, validationErrors, isValid } = useMemo(() => {
    // Validation
    const errors: string[] = []

    if (displayData) {
      // Validate Sankey data structure

      // Check node structure

      // Check link structure
      const validationErrors = validateSankeyData(displayData)
      errors.push(...validationErrors)
      if (validationErrors.length > 0) {
        console.warn('SankeyDiagram: Validation errors:', validationErrors)
      }
    }

    errors.push(...validateDimensions(width, height))

    // Calculate layout with error handling
    let calculatedLayout = null
    if (displayData && errors.length === 0) {
      try {
        calculatedLayout = calculateSankeyLayout(displayData, width, height)
      } catch (error) {
        console.error('Sankey layout calculation failed:', error)
        errors.push(`Sankey layout error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    const valid = errors.length === 0 && calculatedLayout !== null

    return {
      layout: calculatedLayout,
      validationErrors: errors,
      isValid: valid
    }
  }, [displayData, width, height])

  // ==================== INTERACTIONS LOGIC ====================
  // Resize observer hook
  const { ref: containerRef, size: containerSize } = useResizeObserver({
    defaultWidth: width,
    defaultHeight: height
  })

  // Empty hover handlers (visual effects handled in components, no tooltips)
  const handleNodeHover = useCallback((_event: React.MouseEvent, _node: D3SankeyNode) => {
    // No tooltip logic - visual effects are handled in the component itself
  }, [])

  const handleLinkHover = useCallback((_event: React.MouseEvent, _link: D3SankeyLink) => {
    // No tooltip logic - visual effects are handled in the component itself
  }, [])

  const handleHoverLeave = useCallback(() => {
    // No tooltip logic - visual effects are handled in the component itself
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

    const containerRect = containerRef.current?.getBoundingClientRect()

    // Position popover on the right side of the Sankey diagram
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    // Determine the parent node ID for hierarchical thresholds
    let parentNodeId: string | undefined = undefined
    let parentNodeName: string | undefined = undefined

    // For score agreement nodes, use the semantic distance parent for grouping
    // but the score node ID itself for storing thresholds
    if (isScoreAgreementNode(node.id)) {
      // For score metrics, we need to use the semantic parent for backend lookup
      const semanticParent = getParentNodeId(node.id)
      // But we pass the score node ID itself so thresholds are stored correctly
      parentNodeId = semanticParent
      parentNodeName = semanticParent && displayData ? getParentNodeName(semanticParent, displayData.nodes) : undefined
    }
    // For semantic distance nodes, use the node ID itself as the parent for threshold grouping
    else if (node.category === 'semantic_distance') {
      parentNodeId = node.id
      parentNodeName = node.name
    }

    showHistogramPopover(node.id, node.name, metrics, position, parentNodeId, parentNodeName)
  }, [showHistogramOnClick, showHistogramPopover, displayData, containerRef])

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

    const containerRect = containerRef.current?.getBoundingClientRect()

    // Position popover on the right side of the Sankey diagram
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    // Determine the parent node ID for hierarchical thresholds
    let parentNodeId: string | undefined = undefined
    let parentNodeName: string | undefined = undefined

    // For score agreement nodes, use the semantic distance parent for grouping
    if (isScoreAgreementNode(sourceNode.id)) {
      // For score metrics, we need the semantic parent for backend lookup
      const semanticParent = getParentNodeId(sourceNode.id)
      parentNodeId = semanticParent
      parentNodeName = semanticParent && displayData ? getParentNodeName(semanticParent, displayData.nodes) : undefined
    }
    // For semantic distance nodes, use the node ID itself as the parent for threshold grouping
    else if (sourceNode.category === 'semantic_distance') {
      parentNodeId = sourceNode.id
      parentNodeName = sourceNode.name
    }

    showHistogramPopover(sourceNode.id, sourceNode.name, metrics, position, parentNodeId, parentNodeName)
  }, [showHistogramOnClick, showHistogramPopover, displayData, containerRef])

  // ==================== THRESHOLD GROUPS LOGIC ====================
  // Calculate threshold group information for all nodes
  const allNodeThresholdGroups = useMemo(() => {
    if (!displayData || !layout) return new Map<string, ThresholdGroupInfo>()

    const nodeGroupMap = new Map<string, ThresholdGroupInfo>()

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
  }, [displayData, layout, getNodesInSameThresholdGroup])

  // ==================== RENDER ====================
  return (
    <div className={`sankey-diagram ${className}`}>

      {/* Error display */}
      {error && (
        <ErrorMessage
          message={error}
          className="sankey-diagram__error"
        />
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="sankey-diagram__validation-errors">
          {validationErrors.map((error, index) => (
            <ErrorMessage
              key={index}
              message={error}
              className="sankey-diagram__validation-error"
            />
          ))}
        </div>
      )}

      {/* Main visualization */}
      {layout && displayData && !error && isValid && (
        <div
          ref={containerRef}
          className="sankey-diagram__container"
          style={{
            width: '100%',
            height: containerSize.height,
            position: 'relative'
          }}
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
                  <SankeyLink
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
                  const thresholdGroupInfo = allNodeThresholdGroups.get(node.id) || { hasGroup: false, groupSize: 1 }

                  return (
                    <SankeyNode
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

            </g>
          </svg>

        </div>
      )}

      {/* Empty state - only show if no displayData */}
      {!displayData && !loading && !error && (
        <div className="sankey-diagram__empty">
          <div className="sankey-diagram__empty-icon">📊</div>
          <div className="sankey-diagram__empty-title">No Data Available</div>
          <div className="sankey-diagram__empty-description">
            Select filters to generate the Sankey diagram
          </div>
        </div>
      )}

    </div>
  )
}

export default SankeyDiagram