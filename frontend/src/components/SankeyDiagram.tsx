import React, { useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { DEFAULT_ANIMATION, calculateSankeyLayout, validateSankeyData, validateDimensions, getNodeColor, getLinkColor, getSankeyPath, SANKEY_COLORS, useResizeObserver } from '../lib/d3-sankey-utils'
import { findNodeById, getNodeMetrics } from '../lib/threshold-utils'
import { canAddStageToNode, getAvailableStageTypes } from '../lib/dynamic-tree-builder'
import type { D3SankeyNode, D3SankeyLink, MetricType, ThresholdTree, SankeyThreshold } from '../types'
import type { AddStageConfig, StageTypeConfig } from '../lib/dynamic-tree-builder'
import { PANEL_LEFT, PANEL_RIGHT, LEGEND_ITEMS, CATEGORY_DISPLAY_NAMES } from '../lib/constants'

// ==================== INLINE COMPONENTS ====================
const ErrorMessage: React.FC<{ message: string; className?: string }> = ({ message, className }) => (
  <div className={`error-message ${className || ''}`} style={{ color: 'red', padding: '8px', margin: '8px 0' }}>
    {message}
  </div>
)


// ==================== UTILITY FUNCTIONS ====================

function getMetricsForNodeId(nodeId: string, thresholdTree: ThresholdTree): MetricType[] | null {
  // Use the threshold tree to determine metrics for a node
  const treeNode = findNodeById(thresholdTree, nodeId)

  if (!treeNode) {
    console.warn(`Node ${nodeId} not found in threshold tree`)
    return null
  }

  return getNodeMetrics(treeNode as SankeyThreshold)
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
  flowDirection?: 'left-to-right' | 'right-to-left'
  panel?: typeof PANEL_LEFT | typeof PANEL_RIGHT
}

interface SankeyNodeComponentProps {
  node: D3SankeyNode
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, node: D3SankeyNode) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, node: D3SankeyNode) => void
  onAddStageClick?: (event: React.MouseEvent, node: D3SankeyNode) => void
  onRemoveStageClick?: (event: React.MouseEvent, node: D3SankeyNode) => void
  thresholdGroupInfo?: ThresholdGroupInfo
  flowDirection?: 'left-to-right' | 'right-to-left'
  canAddStage?: boolean
  canRemoveStage?: boolean
}

interface SankeyLinkComponentProps {
  link: D3SankeyLink
  index: number
  animationDuration: number
  onHover: (event: React.MouseEvent, link: D3SankeyLink) => void
  onLeave: () => void
  onHistogramClick?: (event: React.MouseEvent, link: D3SankeyLink) => void
}

interface SankeyLegendProps {
  colors: typeof SANKEY_COLORS
}

// ==================== SUB-COMPONENTS ====================
const SankeyNode = React.memo(({
  node,
  animationDuration,
  onHover,
  onLeave,
  onHistogramClick,
  onAddStageClick,
  onRemoveStageClick,
  thresholdGroupInfo,
  flowDirection = 'left-to-right',
  canAddStage = false,
  canRemoveStage = false
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

  const handleAddStageClick = useCallback((event: React.MouseEvent) => {
    if (onAddStageClick) {
      onAddStageClick(event, node)
    }
  }, [onAddStageClick, node])

  const handleRemoveStageClick = useCallback((event: React.MouseEvent) => {
    if (onRemoveStageClick) {
      onRemoveStageClick(event, node)
    }
  }, [onRemoveStageClick, node])

  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0

  // Determine label positioning based on flow direction
  const isRightToLeft = flowDirection === 'right-to-left'
  const labelX = isRightToLeft ? node.x1 + 6 : node.x0 - 6
  const textAnchor = isRightToLeft ? 'start' : 'end'

  // Determine button positioning based on flow direction
  const buttonX = isRightToLeft ? node.x0 - 15 : node.x1 + 15

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
        x={labelX}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#374151"
        fontWeight={isHovered ? 600 : 400}
        textAnchor={textAnchor}
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      {/* Feature count */}
      <text
        x={labelX}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#6b7280"
        textAnchor={textAnchor}
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>

      {/* Add Stage button for leaf nodes */}
      {canAddStage && (
        <g className="sankey-node-add-stage">
          <circle
            cx={buttonX}
            cy={(node.y0 + node.y1) / 2}
            r={12}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: isHovered ? 1 : 0.7,
              transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={handleAddStageClick}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={(node.y0 + node.y1) / 2}
            dy="0.35em"
            fontSize={14}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            +
          </text>
        </g>
      )}

      {/* Remove Stage button for nodes with children */}
      {canRemoveStage && (
        <g className="sankey-node-remove-stage">
          <circle
            cx={buttonX}
            cy={(node.y0 + node.y1) / 2}
            r={12}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: isHovered ? 1 : 0.7,
              transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={handleRemoveStageClick}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={(node.y0 + node.y1) / 2}
            dy="0.35em"
            fontSize={16}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
})

const SankeyLink: React.FC<SankeyLinkComponentProps> = React.memo(({
  link,
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

// Set display names
SankeyNode.displayName = 'SankeyNode'
SankeyLink.displayName = 'SankeyLink'
SankeyLegend.displayName = 'SankeyLegend'

// ==================== MAIN COMPONENT ====================
export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  width = 800,
  height = 600,
  className = '',
  animationDuration = DEFAULT_ANIMATION.duration,
  showHistogramOnClick = true,
  flowDirection = 'left-to-right',
  panel = PANEL_LEFT
}) => {
  const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
  const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
  const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

  const data = useVisualizationStore(state => state[panelKey].sankeyData)
  const thresholdTree = useVisualizationStore(state => state[panelKey].thresholdTree)
  const loading = useVisualizationStore(state => state.loading[loadingKey] || (panel === PANEL_LEFT && state.loading.sankey))
  const error = useVisualizationStore(state => state.errors[errorKey] || (panel === PANEL_LEFT && state.errors.sankey))

  // Use previous data when loading to prevent flickering
  const [displayData, setDisplayData] = React.useState(data)
//   const [isUpdating, setIsUpdating] = React.useState(false)

  React.useEffect(() => {
    if (!loading && data) {
      setDisplayData(data)
    //   setIsUpdating(false)
    } else if (loading && displayData) {
      // Only show updating state if we have previous data
    //   setIsUpdating(true)
    }
  }, [data, loading, displayData])

  // Inline stage selector state
  const [inlineSelector, setInlineSelector] = useState<{
    nodeId: string
    position: { x: number; y: number }
    availableStages: StageTypeConfig[]
  } | null>(null)

  const { showHistogramPopover, addStageToTree, removeStageFromTree } = useVisualizationStore()

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
        // Use the same width for both panels to ensure consistent layout dimensions
        calculatedLayout = calculateSankeyLayout(displayData, width, height)

        // Apply right-to-left flow transformation if needed
        if (flowDirection === 'right-to-left' && calculatedLayout) {
          // Calculate the content area width for position reversal
          const contentAreaWidth = width - calculatedLayout.margin.left - calculatedLayout.margin.right

          // Reverse node positions for right-to-left flow
          calculatedLayout.nodes.forEach(sankeyNode => {
            const nodeX0 = sankeyNode.x0 || 0
            const nodeX1 = sankeyNode.x1 || 0

            // Mirror positions within content area and apply margin offset
            sankeyNode.x0 = contentAreaWidth - nodeX1 + calculatedLayout!.margin.left
            sankeyNode.x1 = contentAreaWidth - nodeX0 + calculatedLayout!.margin.left
          })

          // Adjust margins for right-aligned layout
          // Need more space on left for buttons, less on right
          calculatedLayout.margin = {
            ...calculatedLayout.margin,
            left: -45,
            right: 80
          }
        }
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
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
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

  // Handle node histogram click with simplified threshold tree logic
  const handleNodeHistogramClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!showHistogramOnClick || !thresholdTree) return

    event.stopPropagation()

    // Get appropriate metrics for this node using the threshold tree
    const metrics = getMetricsForNodeId(node.id, thresholdTree)
    if (!metrics || metrics.length === 0) {
      // No histogram should be shown for this node (e.g., leaf nodes)
      return
    }

    const containerRect = containerRef.current?.getBoundingClientRect()

    // Position popover on the right side of the Sankey diagram
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    // With the new tree system, we simply pass the node ID directly
    // No complex parent node logic needed - the tree handles the hierarchy
    showHistogramPopover(node.id, node.name, metrics, position, undefined, undefined, panel)
  }, [showHistogramOnClick, showHistogramPopover, thresholdTree, containerRef, panel])

  // Handle link histogram click (show histogram for source node) with simplified logic
  const handleLinkHistogramClick = useCallback((event: React.MouseEvent, link: D3SankeyLink) => {
    if (!showHistogramOnClick || !thresholdTree) return

    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return

    // Get appropriate metrics for the source node using the threshold tree
    const metrics = getMetricsForNodeId(sourceNode.id, thresholdTree)
    if (!metrics || metrics.length === 0) {
      // No histogram should be shown for this node (e.g., leaf nodes)
      return
    }

    event.stopPropagation()

    const containerRect = containerRef.current?.getBoundingClientRect()

    // Position popover on the right side of the Sankey diagram
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    // With the new tree system, we simply pass the node ID directly
    // No complex parent node logic needed - the tree handles the hierarchy
    showHistogramPopover(sourceNode.id, sourceNode.name, metrics, position, undefined, undefined, panel)
  }, [showHistogramOnClick, showHistogramPopover, thresholdTree, containerRef, panel])

  // Handle add stage click
  const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!thresholdTree) return

    event.stopPropagation()

    // Check if we can add a stage to this node
    if (!canAddStageToNode(thresholdTree, node.id)) {
      return
    }

    // Get available stage types for this node
    const availableStages = getAvailableStageTypes(thresholdTree, node.id)

    // Position dropdown near the button
    const rect = event.currentTarget.getBoundingClientRect()
    const position = {
      x: rect.left + rect.width + 10,
      y: rect.top
    }

    setInlineSelector({
      nodeId: node.id,
      position,
      availableStages
    })
  }, [thresholdTree])

  // Handle stage selection
  const handleStageSelect = useCallback((stageTypeId: string) => {
    if (!inlineSelector || !thresholdTree) return

    // Find the stage type config
    const stageType = inlineSelector.availableStages.find(s => s.id === stageTypeId)
    if (!stageType) return

    // Create config with defaults
    const config: AddStageConfig = {
      stageType: stageTypeId,
      splitRuleType: stageType.defaultSplitRule,
      metric: stageType.defaultMetric,
      thresholds: stageType.defaultThresholds
    }

    // Add stage to tree via store
    addStageToTree(inlineSelector.nodeId, config, panel)

    // Close inline selector
    setInlineSelector(null)

    // Show histogram popover for threshold adjustment after a short delay
    setTimeout(() => {
      const parentNodeId = inlineSelector.nodeId
      const parentNode = layout?.nodes.find(n => n.id === parentNodeId)

      if (parentNode) {
        const metrics = getMetricsForNodeId(parentNodeId, thresholdTree)
        if (metrics && metrics.length > 0) {
          // Calculate position for histogram popover
          const position = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
          }
          showHistogramPopover(parentNodeId, 'Node', metrics, position, undefined, undefined, panel)
        }
      }
    }, 500)
  }, [inlineSelector, thresholdTree, addStageToTree, panel, layout, showHistogramPopover])

  // Handle clicking outside to close dropdown
  const handleClickOutside = useCallback(() => {
    setInlineSelector(null)
  }, [])

  // Handle remove stage click
  const handleRemoveStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!thresholdTree) return

    event.stopPropagation()

    // Remove stage via store
    removeStageFromTree(node.id, panel)
  }, [thresholdTree, removeStageFromTree, panel])

  // ==================== SIMPLIFIED THRESHOLD LOGIC ====================
  // With the new tree system, we don't need complex threshold group logic
  const allNodeThresholdGroups = useMemo(() => {
    const nodeGroupMap = new Map<string, ThresholdGroupInfo>()

    // For now, just mark all nodes as not having groups
    // This simplifies the UI while maintaining backward compatibility
    if (layout) {
      for (const node of layout.nodes) {
        nodeGroupMap.set(node.id, { hasGroup: false, groupSize: 1 })
      }
    }

    return nodeGroupMap
  }, [layout])

  // ==================== STAGE LABEL CALCULATION ====================
  // Calculate stage positions and labels
  const stageLabels = useMemo(() => {
    if (!layout || !displayData) return []

    // Group nodes by stage
    const nodesByStage = new Map<number, D3SankeyNode[]>()
    layout.nodes.forEach(node => {
      const stage = node.stage
      if (!nodesByStage.has(stage)) {
        nodesByStage.set(stage, [])
      }
      nodesByStage.get(stage)!.push(node)
    })

    // Calculate position and label for each stage
    const labels: Array<{ x: number; y: number; label: string; stage: number }> = []
    nodesByStage.forEach((nodes, stage) => {
      if (nodes.length === 0) return

      // Get category from the first node in the stage
      const category = nodes[0].category
      const label = CATEGORY_DISPLAY_NAMES[category] || category

      // Calculate x position (average of all nodes in the stage)
      const avgX = nodes.reduce((sum, node) => sum + ((node.x0 || 0) + (node.x1 || 0)) / 2, 0) / nodes.length

      // Y position at the top of the diagram
      const y = -30

      labels.push({ x: avgX, y, label, stage })
    })

    return labels
  }, [layout, displayData])

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
              {/* Stage labels */}
              <g className="sankey-diagram__stage-labels">
                {stageLabels.map((label) => (
                  <text
                    key={`stage-label-${label.stage}`}
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={600}
                    fill="#374151"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label.label}
                  </text>
                ))}
              </g>

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

                  // Check if node can have stages AND if there are available stage types
                  const canAddStageStructurally = thresholdTree ? canAddStageToNode(thresholdTree, node.id) : false
                  const availableStages = canAddStageStructurally && thresholdTree ? getAvailableStageTypes(thresholdTree, node.id) : []
                  const canAddStageToThisNode = canAddStageStructurally && availableStages.length > 0

                  // Check if node has children (can remove stage)
                  const treeNode = thresholdTree ? findNodeById(thresholdTree, node.id) : null
                  const canRemoveStageFromThisNode = treeNode ? (treeNode.children_ids.length > 0) : false

                  return (
                    <SankeyNode
                      key={node.id}
                      node={node}
                      index={index}
                      animationDuration={animationDuration}
                      onHover={handleNodeHover}
                      onLeave={handleHoverLeave}
                      onHistogramClick={handleNodeHistogramClick}
                      onAddStageClick={handleAddStageClick}
                      onRemoveStageClick={handleRemoveStageClick}
                      thresholdGroupInfo={thresholdGroupInfo}
                      flowDirection={flowDirection}
                      canAddStage={canAddStageToThisNode}
                      canRemoveStage={canRemoveStageFromThisNode}
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

      {/* Inline Stage Selector */}
      {inlineSelector && (
        <>
          <div
            className="inline-selector-overlay"
            onClick={handleClickOutside}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
          />
          <div
            className="inline-stage-selector"
            style={{
              position: 'fixed',
              left: Math.min(inlineSelector.position.x, window.innerWidth - 200),
              top: Math.min(inlineSelector.position.y, window.innerHeight - 200),
              zIndex: 1000,
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              minWidth: '180px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}
          >
            {inlineSelector.availableStages.map((stageType) => (
              <div
                key={stageType.id}
                className="stage-option"
                onClick={() => handleStageSelect(stageType.id)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: '14px',
                  color: '#374151'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                  {stageType.name}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}>
                  {stageType.description}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}

export default SankeyDiagram