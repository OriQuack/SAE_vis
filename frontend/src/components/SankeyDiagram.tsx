import React, { useState, useCallback, useMemo } from 'react'
import { useVisualizationStore } from '../store'
import {
  DEFAULT_ANIMATION,
  calculateSankeyLayout,
  validateSankeyData,
  validateDimensions,
  getNodeColor,
  getLinkColor,
  getSankeyPath,
  calculateStageLabels,
  applyRightToLeftTransform,
  RIGHT_SANKEY_MARGIN
} from '../lib/d3-sankey-utils'
import { calculateVerticalBarNodeLayout } from '../lib/d3-sankey-utils'
import {
  getNodeMetrics,
  getAvailableStages,
  canAddStage,
  hasChildren
} from '../lib/threshold-utils'
import { useResizeObserver } from '../lib/utils'
import type { D3SankeyNode, D3SankeyLink } from '../types'
import {
  PANEL_LEFT,
  PANEL_RIGHT
} from '../lib/constants'
import { SankeyOverlay, AVAILABLE_STAGES } from './SankeyOverlay'
import '../styles/SankeyDiagram.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showHistogramOnClick?: boolean
  flowDirection?: 'left-to-right' | 'right-to-left'
  panel?: typeof PANEL_LEFT | typeof PANEL_RIGHT
}

// ==================== HELPER COMPONENTS ====================
const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="sankey-error">
    {message}
  </div>
)

const SankeyNode: React.FC<{
  node: D3SankeyNode
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick?: (e: React.MouseEvent) => void
  onAddStage?: (e: React.MouseEvent) => void
  onRemoveStage?: (e: React.MouseEvent) => void
  isHovered: boolean
  isHighlighted: boolean
  canAddStage: boolean
  canRemoveStage: boolean
  flowDirection: 'left-to-right' | 'right-to-left'
  animationDuration: number
}> = ({
  node,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onAddStage,
  onRemoveStage,
  isHovered,
  isHighlighted,
  canAddStage,
  canRemoveStage,
  flowDirection,
  animationDuration
}) => {
  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0
  const isRightToLeft = flowDirection === 'right-to-left'
  const labelX = isRightToLeft ? node.x1 + 6 : node.x0 - 6
  const textAnchor = isRightToLeft ? 'start' : 'end'
  const buttonX = isRightToLeft ? node.x0 - 15 : node.x1 + 15

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        stroke="none"
        strokeWidth={0}
        style={{
        //   transition: `all ${animationDuration}ms ease-out`,
          cursor: onClick ? 'pointer' : 'default',
          filter: isHovered || isHighlighted ? 'brightness(1.1)' : 'none'
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />

      <text
        x={labelX}
        y={(node.y0 + node.y1) / 2}
        dy="0.35em"
        fontSize={12}
        fill="#000000"
        opacity={1}
        fontWeight={isHovered ? 600 : 400}
        textAnchor={textAnchor}
        style={{
          transition: `font-weight ${animationDuration}ms ease-out`,
          pointerEvents: 'none'
        }}
      >
        {node.name}
      </text>

      <text
        x={labelX}
        y={(node.y0 + node.y1) / 2 + 14}
        dy="0.35em"
        fontSize={10}
        fill="#000000"
        opacity={1}
        textAnchor={textAnchor}
        style={{ pointerEvents: 'none' }}
      >
        ({node.feature_count.toLocaleString()})
      </text>

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
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onAddStage}
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
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            +
          </text>
        </g>
      )}

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
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onRemoveStage}
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
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
}

const SankeyLink: React.FC<{
  link: D3SankeyLink
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick?: (e: React.MouseEvent) => void
  animationDuration: number
  gradientId?: string
  isHovered: boolean
}> = ({ link, onMouseEnter, onMouseLeave, onClick, animationDuration, gradientId, isHovered }) => {
  const sourceNode = typeof link.source === 'object' ? link.source : null
  if (!sourceNode) return null

  const path = getSankeyPath(link)
  const baseColor = gradientId ? `url(#${gradientId})` : getLinkColor(link)

  // Check if this is initial state root link (root → placeholder)
  const targetNode = typeof link.target === 'object' ? link.target : null
  const isInitialStateRootLink = sourceNode.id === 'root' && targetNode?.id === 'placeholder_vertical_bar'

  // Apply opacity:
  // - Initial state root links: 15% opacity ('26' hex), no hover effect
  // - Regular links: 25% opacity ('40' hex), hover to 37.5% ('60' hex)
  let color: string
  if (isInitialStateRootLink) {
    color = baseColor.replace('40', '26')  // Initial state: 15%, no hover
  } else if (isHovered) {
    color = baseColor.replace('40', '60')  // Hover: 37.5%
  } else {
    color = baseColor  // Normal: 25%
  }

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, link.width || 0)}
      opacity={1.0}
      style={{
        transition: `stroke ${animationDuration}ms ease-out`,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  )
}

const VerticalBarSankeyNode: React.FC<{
  node: D3SankeyNode
  scrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null
  onAddStage?: (e: React.MouseEvent) => void
  onRemoveStage?: (e: React.MouseEvent) => void
  canAddStage: boolean
  canRemoveStage: boolean
  flowDirection: 'left-to-right' | 'right-to-left'
  animationDuration: number
  totalFeatureCount?: number
  nodeStartIndex?: number
}> = ({ node, scrollState, onAddStage, onRemoveStage, canAddStage, canRemoveStage, flowDirection, animationDuration: _animationDuration, totalFeatureCount = 0, nodeStartIndex = 0 }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState, totalFeatureCount, nodeStartIndex)

  // Check if this is a placeholder node
  const isPlaceholder = node.id === 'placeholder_vertical_bar'

  // Calculate button position (same logic as standard nodes)
  const isRightToLeft = flowDirection === 'right-to-left'
  const buttonX = isRightToLeft && node.x0 !== undefined ? node.x0 - 15 : (node.x1 !== undefined ? node.x1 + 15 : 0)
  const buttonY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  // Calculate label position (same as normal nodes)
  const labelX = isRightToLeft && node.x1 !== undefined ? node.x1 + 6 : (node.x0 !== undefined ? node.x0 - 6 : 0)
  const textAnchor = isRightToLeft ? 'start' : 'end'
  const labelY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  return (
    <g className="sankey-vertical-bar-node">
      {/* Render vertical bar */}
      {layout.subNodes.map((subNode) => {
        return (
          <g key={subNode.id}>
            {/* Bar rectangle */}
            <rect
              x={subNode.x}
              y={subNode.y}
              width={subNode.width}
              height={subNode.height}
              fill={subNode.color}
              opacity={isPlaceholder ? 0.4 : (subNode.selected ? 0.7 : 0.3)}
              stroke="#e5e7eb"
              strokeWidth={0.5}
              strokeDasharray={isPlaceholder ? "3,3" : undefined}
              rx={3}
            />
          </g>
        )
      })}

      {/* Global scroll indicator */}
      {layout.scrollIndicator && layout.subNodes.length > 0 && (
        <rect
          x={layout.subNodes[0].x}
          y={layout.scrollIndicator.y}
          width={layout.totalWidth}
          height={layout.scrollIndicator.height}
          fill="rgba(30, 41, 59, 0.25)"
          stroke="#1e293b"
          strokeWidth={1.5}
          rx={3}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Node name and feature count labels (same as normal nodes) */}
      {!isPlaceholder && (
        <>
          <text
            x={labelX}
            y={labelY}
            dy="0.35em"
            fontSize={12}
            fill="#000000"
            opacity={1}
            fontWeight={400}
            textAnchor={textAnchor}
            style={{ pointerEvents: 'none' }}
          >
            {node.name}
          </text>
          <text
            x={labelX}
            y={labelY + 14}
            dy="0.35em"
            fontSize={10}
            fill="#000000"
            opacity={1}
            textAnchor={textAnchor}
            style={{ pointerEvents: 'none' }}
          >
            ({node.feature_count.toLocaleString()})
          </text>
        </>
      )}

      {/* Add stage button - not shown for placeholder */}
      {canAddStage && !isPlaceholder && (
        <g className="sankey-node-add-stage">
          <circle
            cx={buttonX}
            cy={buttonY}
            r={12}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onAddStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={buttonY}
            dy="0.35em"
            fontSize={14}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            +
          </text>
        </g>
      )}

      {/* Remove stage button - not shown for placeholder */}
      {canRemoveStage && !isPlaceholder && (
        <g className="sankey-node-remove-stage">
          <circle
            cx={buttonX}
            cy={buttonY}
            r={12}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
            style={{
              cursor: 'pointer',
              opacity: 0.7,
            //   transition: `all ${animationDuration}ms ease-out`
            }}
            onClick={onRemoveStage}
            onMouseEnter={(e) => e.stopPropagation()}
          />
          <text
            x={buttonX}
            y={buttonY}
            dy="0.35em"
            fontSize={16}
            fill="#ffffff"
            fontWeight="bold"
            textAnchor="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  )
}

// ==================== MAIN COMPONENT ====================
export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  width = 800,
  height = 800,
  className = '',
  animationDuration = DEFAULT_ANIMATION.duration,
  showHistogramOnClick = true,
  flowDirection = 'left-to-right',
  panel = PANEL_LEFT
}) => {
  const panelKey = panel === PANEL_LEFT ? 'leftPanel' : 'rightPanel'
  const loadingKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'
  const errorKey = panel === PANEL_LEFT ? 'sankeyLeft' : 'sankeyRight'

  // Get data from store - NEW TREE-BASED SYSTEM ONLY
  const computedSankey = useVisualizationStore(state => state[panelKey].computedSankey)
  const filters = useVisualizationStore(state => state[panelKey].filters)
  const histogramData = useVisualizationStore(state => state[panelKey].histogramData)
  const loading = useVisualizationStore(state => state.loading[loadingKey])
  const error = useVisualizationStore(state => state.errors[errorKey])
  const hoveredAlluvialNodeId = useVisualizationStore(state => state.hoveredAlluvialNodeId)
  const hoveredAlluvialPanel = useVisualizationStore(state => state.hoveredAlluvialPanel)
  const tableScrollState = useVisualizationStore(state => state.tableScrollState)
  const sankeyTree = useVisualizationStore(state => state[panelKey].sankeyTree)
  const { showHistogramPopover, addUnsplitStageToNode, removeNodeStage } = useVisualizationStore()

  // NEW TREE-BASED SYSTEM: use computedSankey directly
  const data = useMemo(() => {
    if (!computedSankey) {
      console.log(`[SankeyDiagram ${panel}] ⚠️ No computed sankey data`)
      return null
    }

    console.log(`[SankeyDiagram ${panel}] ✅ Using TREE-BASED system`, {
      nodes: computedSankey.nodes.length,
      links: computedSankey.links.length,
      maxDepth: computedSankey.maxDepth,
      sankeyTreeSize: sankeyTree?.size
    })

    // Return computed structure in SankeyData format
    return {
      nodes: computedSankey.nodes,
      links: computedSankey.links,
      metadata: {
        total_features: computedSankey.nodes.find(n => n.id === 'root')?.feature_count || 0,
        applied_filters: filters
      }
    }
  }, [computedSankey, filters, panel, sankeyTree])

  // Track previous data for smooth transitions
  const [displayData, setDisplayData] = useState(data)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
  const [inlineSelector, setInlineSelector] = useState<{
    nodeId: string
    position: { x: number; y: number }
    availableStages: any[]
  } | null>(null)

  // Resize observer hook with minimal debounce for responsiveness
  const containerElementRef = React.useRef<HTMLDivElement | null>(null)
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: width,
    defaultHeight: height,
    debounceMs: 16,  // ~60fps for smooth resizing
    debugId: panel
  })

  // Combined ref callback to support both resize observer and direct access
  const setContainerRef = React.useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node
    containerRef(node)
  }, [containerRef])

  // Update display data when loading completes
  React.useEffect(() => {
    if (!loading && data) {
      setDisplayData(data)
    }
  }, [data, loading])

  // Calculate layout with memoization
  const { layout, validationErrors } = useMemo(() => {
    const errors = validateDimensions(containerSize.width, containerSize.height)

    if (displayData) {
      errors.push(...validateSankeyData(displayData))
    }

    if (errors.length > 0 || !displayData) {
      return { layout: null, validationErrors: errors }
    }

    // console.log(`[SankeyDiagram ${panel}] Calculating layout with container size:`, containerSize)

    try {
      // Use different margins for right panel
      const margin = flowDirection === 'right-to-left' ? RIGHT_SANKEY_MARGIN : undefined
      let calculatedLayout = calculateSankeyLayout(displayData, containerSize.width, containerSize.height, margin)

      if (flowDirection === 'right-to-left' && calculatedLayout) {
        calculatedLayout = applyRightToLeftTransform(calculatedLayout, containerSize.width)
      }

      return { layout: calculatedLayout, validationErrors: [] }
    } catch (error) {
      console.error('Sankey layout calculation failed:', error)
      return {
        layout: null,
        validationErrors: [`Layout error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }
    }
  }, [displayData, containerSize.width, containerSize.height, flowDirection])

  // Calculate stage labels
  const stageLabels = useMemo(() => {
    return calculateStageLabels(layout, displayData)
  }, [layout, displayData])

  // Event handlers
  const handleNodeHistogramClick = useCallback((node: D3SankeyNode) => {
    if (!showHistogramOnClick || !sankeyTree) return

    const treeNode = sankeyTree.get(node.id)
    if (!treeNode) return

    // Get metrics for this node (root shows all, others show their metric)
    const metrics = getNodeMetrics(treeNode, sankeyTree)
    if (metrics.length === 0) return

    const containerRect = containerElementRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(node.id, node.name, metrics, position, undefined, undefined, panel, node.category)
  }, [showHistogramOnClick, showHistogramPopover, sankeyTree, panel])

  const handleLinkHistogramClick = useCallback((link: D3SankeyLink) => {
    if (!showHistogramOnClick || !sankeyTree) return

    const sourceNode = typeof link.source === 'object' ? link.source : null
    const targetNode = typeof link.target === 'object' ? link.target : null

    if (!sourceNode || !targetNode) return

    // Get the metric from the target node (the stage the link flows into)
    const metric = targetNode.metric
    if (!metric) {
      // If no metric, fall back to showing all metrics for the source node
      handleNodeHistogramClick(sourceNode)
      return
    }

    // Show histogram for only this specific metric
    const containerRect = containerElementRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(sourceNode.id, sourceNode.name, [metric as any], position, undefined, undefined, panel, sourceNode.category)
  }, [showHistogramOnClick, showHistogramPopover, sankeyTree, panel, handleNodeHistogramClick])

  const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()

    // NEW TREE SYSTEM: get available stages (filter out already-used metrics)
    if (!sankeyTree || !computedSankey) return

    const treeNode = sankeyTree.get(node.id)
    if (!treeNode) return

    const availableStages = getAvailableStages(treeNode, sankeyTree, AVAILABLE_STAGES)
    if (availableStages.length === 0) return

    const rect = event.currentTarget.getBoundingClientRect()

    // Position popup next to button with center Y aligned
    setInlineSelector({
      nodeId: node.id,
      position: {
        x: rect.left + rect.width + 10,
        y: rect.top + rect.height / 2  // Center Y of button
      },
      availableStages
    })
  }, [sankeyTree, computedSankey])

  const handleRemoveStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()

    // Use tree-based system for both panels
    if (sankeyTree) {
      // Remove all descendants of this node
      removeNodeStage(node.id, panel)
    }
  }, [removeNodeStage, panel, sankeyTree])

  const handleStageSelect = useCallback(async (stageTypeId: string) => {
    if (!inlineSelector) return

    const stageType = inlineSelector.availableStages.find(s => s.id === stageTypeId)
    if (!stageType) {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Stage type not found:', stageTypeId)
      return
    }

    console.log('[SankeyDiagram.handleStageSelect] 🎯 Stage selected:', {
      stageTypeId,
      stageType,
      metric: stageType.metric
    })

    setInlineSelector(null)

    // Use tree-based system with unsplit stage (no thresholds initially)
    const metric = stageType.metric

    if (metric) {
      console.log('[SankeyDiagram.handleStageSelect] ✅ Calling addUnsplitStageToNode with:', { metric })
      await addUnsplitStageToNode(inlineSelector.nodeId, metric, panel)

      // Show histogram popover after adding stage
      setTimeout(() => {
        const parentNode = layout?.nodes.find(n => n.id === inlineSelector.nodeId)
        if (parentNode) {
          handleNodeHistogramClick(parentNode)
        }
      }, 500)
    } else {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Missing metric:', {
        metric,
        stageType
      })
    }
  }, [inlineSelector, addUnsplitStageToNode, panel, layout, handleNodeHistogramClick])

  const handleOverlayMetricClick = useCallback(async (metric: string) => {
    console.log('[SankeyDiagram.handleOverlayMetricClick] 🎯 Metric clicked:', {
      metric
    })

    // Add unsplit stage to root node (no thresholds initially)
    await addUnsplitStageToNode('root', metric, panel)

    // Show histogram popover after adding stage
    setTimeout(() => {
      const rootNode = layout?.nodes.find(n => n.id === 'root')
      if (rootNode) {
        handleNodeHistogramClick(rootNode)
      }
    }, 500)
  }, [addUnsplitStageToNode, panel, layout, handleNodeHistogramClick])

  // Render
  if (error) {
    return <ErrorMessage message={error} />
  }

  if (validationErrors.length > 0) {
    return (
      <div>
        {validationErrors.map((err, i) => (
          <ErrorMessage key={i} message={err} />
        ))}
      </div>
    )
  }

  if (!displayData && !loading) {
    return (
      <div className={`sankey-diagram ${className}`}>
        <div className="sankey-diagram__empty">
          <div className="sankey-diagram__empty-icon">📊</div>
          <div className="sankey-diagram__empty-title">No Data Available</div>
          <div className="sankey-diagram__empty-description">
            Select filters to generate the Sankey diagram
          </div>
        </div>
      </div>
    )
  }

  if (!layout || !displayData) {
    return null
  }

  return (
    <div className={`sankey-diagram ${className}`}>
      <div
        ref={setContainerRef}
        className="sankey-diagram__container"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <svg width={containerSize.width} height={containerSize.height} className="sankey-diagram__svg">
          <rect width={containerSize.width} height={containerSize.height} fill="#ffffff" />

          <g transform={`translate(${layout.margin.left},${layout.margin.top})`}>
            {/* Stage labels */}
            <g className="sankey-diagram__stage-labels">
              {stageLabels.map((label) => (
                <text
                  key={`stage-${label.stage}`}
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

            {/* Links */}
            <g className="sankey-diagram__links">
              {layout.links.map((link, index) => (
                <SankeyLink
                  key={`link-${index}`}
                  link={link}
                  animationDuration={animationDuration}
                  onMouseEnter={() => setHoveredLinkIndex(index)}
                  onMouseLeave={() => setHoveredLinkIndex(null)}
                  onClick={showHistogramOnClick ? () => handleLinkHistogramClick(link) : undefined}
                  isHovered={hoveredLinkIndex === index}
                />
              ))}
            </g>

            {/* Nodes */}
            <g className="sankey-diagram__nodes">
              {(() => {
                // Get all vertical bar nodes sorted by y position (top to bottom)
                const verticalBarNodes = layout.nodes
                  .filter(n => n.node_type === 'vertical_bar')
                  .sort((a, b) => (a.y0 || 0) - (b.y0 || 0))

                // Calculate total features and cumulative indices for vertical bars
                const totalFeatures = verticalBarNodes.reduce((sum, node) => sum + (node.feature_count || 0), 0)
                const nodeIndices = new Map<string, number>()
                let cumulativeIndex = 0
                verticalBarNodes.forEach(node => {
                  nodeIndices.set(node.id, cumulativeIndex)
                  cumulativeIndex += node.feature_count || 0
                })

                return layout.nodes.map((node) => {
                  // Calculate common props for both node types
                  // Use tree-based system for button visibility
                  let canAdd = false
                  let canRemove = false

                  if (sankeyTree && computedSankey) {
                    // Tree-based system: check if node exists and can have children
                    const treeNode = sankeyTree.get(node.id)
                    if (treeNode) {
                      // Don't show + button on root when it has no children (overlay is showing)
                      if (node.id === 'root' && treeNode.children.length === 0) {
                        canAdd = false
                      } else {
                        canAdd = canAddStage(treeNode)
                      }
                      canRemove = hasChildren(treeNode)
                    }
                  }

                  const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                      hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')

                  // Check if this is a vertical bar node
                  if (node.node_type === 'vertical_bar') {
                    const nodeStartIndex = nodeIndices.get(node.id) || 0
                    return (
                      <VerticalBarSankeyNode
                        key={node.id}
                        node={node}
                        scrollState={tableScrollState}
                        onAddStage={canAdd ? (e) => handleAddStageClick(e, node) : undefined}
                        onRemoveStage={canRemove ? (e) => handleRemoveStageClick(e, node) : undefined}
                        canAddStage={!!canAdd}
                        canRemoveStage={!!canRemove}
                        flowDirection={flowDirection}
                        animationDuration={animationDuration}
                        totalFeatureCount={totalFeatures}
                        nodeStartIndex={nodeStartIndex}
                      />
                    )
                  }

                // Otherwise render standard node
                return (
                  <SankeyNode
                    key={node.id}
                    node={node}
                    isHovered={hoveredNodeId === node.id}
                    isHighlighted={isHighlighted}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={showHistogramOnClick ? () => handleNodeHistogramClick(node) : undefined}
                    onAddStage={canAdd ? (e) => handleAddStageClick(e, node) : undefined}
                    onRemoveStage={canRemove ? (e) => handleRemoveStageClick(e, node) : undefined}
                    canAddStage={!!canAdd}
                    canRemoveStage={!!canRemove}
                    flowDirection={flowDirection}
                    animationDuration={animationDuration}
                  />
                )
              })
            })()}
            </g>

            {/* Sankey Overlay - histograms, metric overlay, stage selector */}
            <SankeyOverlay
              layout={layout}
              histogramData={histogramData}
              animationDuration={animationDuration}
              sankeyTree={sankeyTree}
              inlineSelector={inlineSelector}
              onMetricClick={handleOverlayMetricClick}
              onStageSelect={handleStageSelect}
              onSelectorClose={() => setInlineSelector(null)}
            />
          </g>
        </svg>
      </div>
    </div>
  )
}

export default SankeyDiagram