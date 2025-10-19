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
import { calculateVerticalBarNodeLayout } from '../lib/d3-vertical-bar-sankey-utils'
import { useResizeObserver } from '../lib/utils'
import { findNodeById, getNodeMetrics, canAddStageToNode, getAvailableStageTypes, AVAILABLE_STAGE_TYPES } from '../lib/threshold-utils'
import type { D3SankeyNode, D3SankeyLink, StageTypeConfig } from '../types'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'
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
  isHovered: boolean
  animationDuration: number
}> = ({ link, onMouseEnter, onMouseLeave, onClick, isHovered, animationDuration }) => {
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
        transition: `opacity ${animationDuration}ms ease-out, stroke ${animationDuration}ms ease-out`,
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
}> = ({ node, scrollState, onAddStage, onRemoveStage, canAddStage, canRemoveStage, flowDirection, animationDuration: _animationDuration }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState, 0)

  // Calculate button position (same logic as standard nodes)
  const isRightToLeft = flowDirection === 'right-to-left'
  const buttonX = isRightToLeft && node.x0 !== undefined ? node.x0 - 15 : (node.x1 !== undefined ? node.x1 + 15 : 0)
  const buttonY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  return (
    <g className="sankey-vertical-bar-node">
      {/* Render three vertical bars */}
      {layout.subNodes.map((subNode) => (
        <g key={subNode.id}>
          {/* Bar rectangle */}
          <rect
            x={subNode.x}
            y={subNode.y}
            width={subNode.width}
            height={subNode.height}
            fill={subNode.color}
            opacity={subNode.selected ? 0.7 : 0.3}
            stroke="#e5e7eb"
            strokeWidth={0.5}
            rx={3}
          />
          {/* Model name label */}
          <text
            x={subNode.x + subNode.width / 2}
            y={subNode.y - 10}
            textAnchor="middle"
            fontSize={12}
            fontWeight={subNode.selected ? 600 : 500}
            fill="#374151"
            opacity={subNode.selected ? 1.0 : 0.5}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {subNode.modelName}
          </text>
        </g>
      ))}

      {/* Global scroll indicator spanning all three bars */}
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

      {/* Add stage button */}
      {canAddStage && (
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

      {/* Remove stage button */}
      {canRemoveStage && (
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

  // Get data from store - use new system for left panel if available
  const sankeyData = useVisualizationStore(state => state[panelKey].sankeyData)
  const computedSankey = useVisualizationStore(state => state[panelKey].computedSankey)
  const filters = useVisualizationStore(state => state[panelKey].filters)
  const thresholdTree = useVisualizationStore(state => state[panelKey].thresholdTree)
  const loading = useVisualizationStore(state => state.loading[loadingKey])
  const error = useVisualizationStore(state => state.errors[errorKey])
  const hoveredAlluvialNodeId = useVisualizationStore(state => state.hoveredAlluvialNodeId)
  const hoveredAlluvialPanel = useVisualizationStore(state => state.hoveredAlluvialPanel)
  const tableScrollState = useVisualizationStore(state => state.tableScrollState)
  const sankeyTree = useVisualizationStore(state => state[panelKey].sankeyTree)
  const { showHistogramPopover, addStageToNode, removeNodeStage } = useVisualizationStore()

  // Determine data source based on availability (new system preferred)
  const data = useMemo(() => {
    console.log(`[SankeyDiagram ${panel}] Data source check:`, {
      hasComputedSankey: !!computedSankey,
      hasSankeyData: !!sankeyData,
      computedSankeyNodes: computedSankey?.nodes.length,
      sankeyDataNodes: sankeyData?.nodes.length,
      sankeyTreeExists: !!sankeyTree,
      sankeyTreeSize: sankeyTree?.size
    })

    if (computedSankey) {
      console.log(`[SankeyDiagram ${panel}] ✅ Using TREE-BASED system`, {
        nodes: computedSankey.nodes.length,
        links: computedSankey.links.length,
        maxDepth: computedSankey.maxDepth
      })
      // New simplified system: wrap computed structure in SankeyData format
      return {
        nodes: computedSankey.nodes,
        links: computedSankey.links,
        metadata: {
          total_features: computedSankey.nodes.find(n => n.id === 'root')?.feature_count || 0,
          applied_filters: filters,
          applied_thresholds: thresholdTree
        }
      }
    }

    console.log(`[SankeyDiagram ${panel}] ⚠️  Using OLD system (fallback)`, {
      nodes: sankeyData?.nodes.length || 0,
      links: sankeyData?.links.length || 0
    })
    // Fallback to old system if computed data not available
    return sankeyData
  }, [computedSankey, sankeyData, filters, thresholdTree, panel, sankeyTree])

  // Track previous data for smooth transitions
  const [displayData, setDisplayData] = useState(data)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
  const [inlineSelector, setInlineSelector] = useState<{
    nodeId: string
    position: { x: number; y: number }
    availableStages: StageTypeConfig[]
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
    if (!showHistogramOnClick || !thresholdTree) return

    const treeNode = findNodeById(thresholdTree, node.id)
    if (!treeNode) return

    const metrics = getNodeMetrics(treeNode)
    if (!metrics || metrics.length === 0) return

    const containerRect = containerElementRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(node.id, node.name, metrics, position, undefined, undefined, panel, node.category)
  }, [showHistogramOnClick, showHistogramPopover, thresholdTree, panel])

  const handleLinkHistogramClick = useCallback((link: D3SankeyLink) => {
    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return
    handleNodeHistogramClick(sourceNode)
  }, [handleNodeHistogramClick])

  const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()

    let availableStages: StageTypeConfig[] = []

    if (sankeyTree && computedSankey) {
      // Tree-based system: all stage types are available for any node
      availableStages = [...AVAILABLE_STAGE_TYPES]
    } else if (thresholdTree) {
      // Old system: check which stages can be added to this node
      if (!canAddStageToNode(thresholdTree, node.id)) return
      availableStages = getAvailableStageTypes(thresholdTree, node.id)
    } else {
      return
    }

    if (availableStages.length === 0) return

    const rect = event.currentTarget.getBoundingClientRect()

    setInlineSelector({
      nodeId: node.id,
      position: { x: rect.left + rect.width + 10, y: rect.top },
      availableStages
    })
  }, [sankeyTree, computedSankey, thresholdTree])

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
      defaultMetric: stageType.defaultMetric,
      defaultThresholds: stageType.defaultThresholds
    })

    setInlineSelector(null)

    // Use tree-based system
    const metric = stageType.defaultMetric
    const thresholds = stageType.defaultThresholds

    if (metric && thresholds) {
      console.log('[SankeyDiagram.handleStageSelect] ✅ Calling addStageToNode with:', { metric, thresholds })
      await addStageToNode(inlineSelector.nodeId, metric, thresholds, panel)

      // Show histogram popover after adding stage (only if old system is active)
      if (thresholdTree) {
        setTimeout(() => {
          const parentNode = layout?.nodes.find(n => n.id === inlineSelector.nodeId)
          if (parentNode) {
            handleNodeHistogramClick(parentNode)
          }
        }, 500)
      }
    } else {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Missing metric or thresholds:', {
        metric,
        thresholds,
        stageType
      })
    }
  }, [inlineSelector, thresholdTree, addStageToNode, panel, layout, handleNodeHistogramClick])

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
                  isHovered={hoveredLinkIndex === index}
                  animationDuration={animationDuration}
                  onMouseEnter={() => setHoveredLinkIndex(index)}
                  onMouseLeave={() => setHoveredLinkIndex(null)}
                  onClick={showHistogramOnClick ? () => handleLinkHistogramClick(link) : undefined}
                />
              ))}
            </g>

            {/* Nodes */}
            <g className="sankey-diagram__nodes">
              {layout.nodes.map((node) => {
                // Calculate common props for both node types
                // Use tree-based system for button visibility
                let canAdd = false
                let canRemove = false

                if (sankeyTree && computedSankey) {
                  // Tree-based system: any node can have children added
                  const treeNode = sankeyTree.get(node.id)
                  canAdd = treeNode !== undefined
                  // Node can be removed if it has children
                  canRemove = treeNode !== undefined && treeNode.children.length > 0
                } else if (thresholdTree) {
                  // Old system fallback
                  canAdd = canAddStageToNode(thresholdTree, node.id) &&
                           getAvailableStageTypes(thresholdTree, node.id).length > 0
                  const treeNode = findNodeById(thresholdTree, node.id)
                  canRemove = !!treeNode && treeNode.children_ids.length > 0
                }

                const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                    hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')

                // Check if this is a vertical bar node
                if (node.node_type === 'vertical_bar') {
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
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* Inline Stage Selector */}
      {inlineSelector && (
        <>
          <div
            className="sankey-stage-selector-overlay"
            onClick={() => setInlineSelector(null)}
          />
          <div
            className="sankey-stage-selector"
            style={{
              left: Math.min(inlineSelector.position.x, window.innerWidth - 200),
              top: Math.min(inlineSelector.position.y, window.innerHeight - 200)
            }}
          >
            {inlineSelector.availableStages.map((stageType) => (
              <div
                key={stageType.id}
                onClick={() => handleStageSelect(stageType.id)}
                className="sankey-stage-selector__item"
              >
                <div className="sankey-stage-selector__item-title">
                  {stageType.name}
                </div>
                <div className="sankey-stage-selector__item-description">
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