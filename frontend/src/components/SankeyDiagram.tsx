import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import {
  DEFAULT_ANIMATION,
  calculateSankeyLayout,
  validateSankeyData,
  validateDimensions,
  getNodeColor,
  getLinkColor,
  getSankeyPath,
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
import { getNodesContainingFeatures } from '../store/sankey-actions'
import { useResizeObserver } from '../lib/utils'
import type { D3SankeyNode, D3SankeyLink } from '../types'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_DISPLAY_NAMES,
  CATEGORY_DECODER_SIMILARITY
} from '../lib/constants'
import { SankeyOverlay, SankeyInlineSelector, AVAILABLE_STAGES } from './SankeyOverlay'
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
  isHovered: boolean
  isHighlighted: boolean
  isSelected?: boolean
  flowDirection: 'left-to-right' | 'right-to-left'
  animationDuration: number
  sankeyTree?: Map<string, any> | null
}> = ({
  node,
  onMouseEnter,
  onMouseLeave,
  onClick,
  isHovered,
  isHighlighted,
  isSelected = false,
  flowDirection,
  animationDuration,
  sankeyTree
}) => {
  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0
  const isRightToLeft = flowDirection === 'right-to-left'

  // Special handling for root node label
  let labelX: number
  let textAnchor: 'start' | 'end' | 'middle'
  let showLabel = true

  if (node.id === 'root' && sankeyTree) {
    const rootTreeNode = sankeyTree.get('root')
    if (rootTreeNode && rootTreeNode.children.length === 0) {
      // Root with no children (initial state): show label on the right
      labelX = node.x1 + 6
      textAnchor = 'start'
    } else if (rootTreeNode && rootTreeNode.children.length > 0) {
      // Root with children (metric selected): hide label
      showLabel = false
      labelX = node.x0 - 6 // Dummy value, won't be used
      textAnchor = 'end'
    } else {
      // Fallback (shouldn't happen)
      labelX = isRightToLeft ? node.x1 + 6 : node.x0 - 6
      textAnchor = isRightToLeft ? 'start' : 'end'
    }
  } else {
    // Normal nodes: use flow direction
    labelX = isRightToLeft ? node.x1 + 6 : node.x0 - 6
    textAnchor = isRightToLeft ? 'start' : 'end'
  }

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        stroke={isSelected ? '#2563eb' : 'none'}
        strokeWidth={isSelected ? 3 : 0}
        style={{
        //   transition: `all ${animationDuration}ms ease-out`,
          cursor: onClick ? 'pointer' : 'default',
          filter: isSelected ? 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.5))' : (isHovered || isHighlighted ? 'brightness(1.1)' : 'none')
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />

      {showLabel && (
        <>
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
        </>
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

// Button data interface for deferred rendering
interface NodeButton {
  nodeId: string
  x: number
  y: number
  type: 'add' | 'remove'
  isHovered: boolean
  onClick: (e: React.MouseEvent) => void
}

// Standalone button rendering component
const NodeButtons: React.FC<{
  buttons: NodeButton[]
  animationDuration: number
}> = ({ buttons, animationDuration: _animationDuration }) => {
  return (
    <g className="sankey-node-buttons">
      {buttons.map((button) => {
        const isAdd = button.type === 'add'
        const buttonColor = isAdd ? '#3b82f6' : '#ef4444'
        const buttonSymbol = isAdd ? '+' : '×'
        const buttonFontSize = isAdd ? 12 : 12

        return (
          <g key={`${button.nodeId}-${button.type}`} className={`sankey-node-${button.type}-stage`}>
            <circle
              cx={button.x}
              cy={button.y}
              r={8}
              fill={buttonColor}
              stroke="#ffffff"
              strokeWidth={1.5}
              style={{
                cursor: 'pointer',
                opacity: button.isHovered ? 1 : 0.7,
              //   transition: `all ${animationDuration}ms ease-out`
              }}
              onClick={button.onClick}
              onMouseEnter={(e) => e.stopPropagation()}
            />
            <text
              x={button.x}
              y={button.y}
              dy="0.35em"
              fontSize={buttonFontSize}
              fill="#ffffff"
              fontWeight="bold"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {buttonSymbol}
            </text>
          </g>
        )
      })}
    </g>
  )
}

const VerticalBarSankeyNode: React.FC<{
  node: D3SankeyNode
  scrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null
  flowDirection: 'left-to-right' | 'right-to-left'
  onClick?: (e: React.MouseEvent) => void
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: () => void
  isSelected?: boolean
  isHovered?: boolean
}> = ({ node, scrollState, flowDirection, onClick, onMouseEnter, onMouseLeave, isSelected = false, isHovered = false }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState)

  // Check if this is a placeholder node
  const isPlaceholder = node.id === 'placeholder_vertical_bar'

  // Calculate label position (same as normal nodes)
  const isRightToLeft = flowDirection === 'right-to-left'
  const labelX = isRightToLeft && node.x1 !== undefined ? node.x1 + 6 : (node.x0 !== undefined ? node.x0 - 6 : 0)
  const textAnchor = isRightToLeft ? 'start' : 'end'
  const labelY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0

  // Calculate bounding box for selection border
  const boundingBox = layout.subNodes.length > 0 ? {
    x: Math.min(...layout.subNodes.map(sn => sn.x)),
    y: Math.min(...layout.subNodes.map(sn => sn.y)),
    width: layout.totalWidth,
    height: Math.max(...layout.subNodes.map(sn => sn.y + sn.height)) - Math.min(...layout.subNodes.map(sn => sn.y))
  } : null

  // Scroll indicator will be calculated using visibleFeatureIds from scrollState

  return (
    <g
      className={`sankey-vertical-bar-node ${isSelected ? 'sankey-vertical-bar-node--selected' : ''} ${isHovered ? 'sankey-vertical-bar-node--hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
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

      {/* Selection border around entire vertical bar */}
      {isSelected && boundingBox && (
        <rect
          x={boundingBox.x - 2}
          y={boundingBox.y - 2}
          width={boundingBox.width + 4}
          height={boundingBox.height + 4}
          fill="none"
          stroke="#2563eb"
          strokeWidth={3}
          rx={4}
          style={{
            filter: 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.5))',
            pointerEvents: 'none'
          }}
        />
      )}

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
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const {
    showHistogramPopover,
    addStageToNode,
    removeNodeStage,
    updateNodeThresholds,
    updateNodeThresholdsByPercentile,
    toggleNodeSelection,
    setActiveStageNode
  } = useVisualizationStore()

  // Compute node IDs that contain selected features (from DecoderSimilarityTable checkboxes)
  const featureHighlightedNodeIds = useMemo(() => {
    if (panel !== PANEL_LEFT || !sankeyTree) {
      return []
    }
    return getNodesContainingFeatures(sankeyTree, selectedFeatureIds)
  }, [panel, sankeyTree, selectedFeatureIds])

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
        total_features: computedSankey.nodes.find((n: any) => n.id === 'root')?.feature_count || 0,
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

  // Determine which vertical bar node should show the scroll indicator (winner-takes-all)
  // Must be called BEFORE all early returns to comply with Rules of Hooks
  const winnerNodeId = useMemo(() => {
    if (!layout || !layout.nodes || !tableScrollState || tableScrollState.scrollHeight === 0) {
      return null
    }

    // Find all vertical bar nodes
    const verticalBarNodes = layout.nodes.filter(node => node.node_type === 'vertical_bar')

    // For now, use simple heuristic: rightmost vertical bar node wins
    // (In future, could use feature ID intersection for more sophisticated selection)
    if (verticalBarNodes.length > 0) {
      // Sort by x position and pick rightmost
      const sorted = [...verticalBarNodes].sort((a, b) => {
        const aX = a.x0 ?? 0
        const bX = b.x0 ?? 0
        return bX - aX
      })
      return sorted[0].id
    }

    return null
  }, [layout, tableScrollState, panel])

  // Stage labels removed - metric labels now shown on links

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

    // Get the metric from the source node (the metric that created this link)
    const metric = sourceNode.metric
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

    // Add stage with default thresholds (immediate split)
    const metric = stageType.metric

    if (metric) {
      console.log('[SankeyDiagram.handleStageSelect] ✅ Calling addStageToNode with:', { metric })
      await addStageToNode(inlineSelector.nodeId, metric, panel)
    } else {
      console.error('[SankeyDiagram.handleStageSelect] ❌ Missing metric:', {
        metric,
        stageType
      })
    }
  }, [inlineSelector, addStageToNode, panel])

  const handleOverlayMetricClick = useCallback(async (metric: string) => {
    console.log('[SankeyDiagram.handleOverlayMetricClick] 🎯 Metric clicked:', {
      metric
    })

    // Add stage with default thresholds (immediate split)
    await addStageToNode('root', metric, panel)
  }, [addStageToNode, panel])

  const handleThresholdUpdate = useCallback((nodeId: string, newThresholds: number[]) => {
    console.log('[SankeyDiagram.handleThresholdUpdate] 🎯 Thresholds updated:', {
      nodeId,
      newThresholds,
      panel
    })
    updateNodeThresholds(nodeId, newThresholds, panel)
  }, [updateNodeThresholds, panel])

  const handleThresholdUpdateByPercentile = useCallback((nodeId: string, percentiles: number[]) => {
    console.log('[SankeyDiagram.handleThresholdUpdateByPercentile] 🎯 Percentiles updated:', {
      nodeId,
      percentiles,
      panel
    })
    updateNodeThresholdsByPercentile(nodeId, percentiles, panel)
  }, [updateNodeThresholdsByPercentile, panel])

  const handleNodeSelectionClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    console.log('[SankeyDiagram.handleNodeSelectionClick] ⚡ CLICK EVENT FIRED!')
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🔍 DEBUG: Node clicked:', {
      id: node.id,
      category: node.category,
      metric: node.metric,
      stage: node.stage,
      panel: panel,
      CATEGORY_DECODER_SIMILARITY: CATEGORY_DECODER_SIMILARITY
    })

    // Only allow selection in left panel
    if (panel !== PANEL_LEFT) {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ DEBUG: Ignoring click - not left panel')
      return
    }

    // Don't select root node or placeholder nodes
    if (node.id === 'root' || node.id === 'placeholder_vertical_bar') {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ DEBUG: Ignoring click - root or placeholder node')
      return
    }

    event.stopPropagation()

    // Check if this is a decoder similarity stage node using category
    // Category is already computed from parent's metric during tree-to-D3 conversion
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🔍 DEBUG: Checking category:', node.category, '===', CATEGORY_DECODER_SIMILARITY, '?', node.category === CATEGORY_DECODER_SIMILARITY)

    if (node.category === CATEGORY_DECODER_SIMILARITY) {
      console.log('[SankeyDiagram.handleNodeSelectionClick] 🎯 DEBUG: MATCH! Opening decoder similarity stage table')

      // IMPORTANT: Toggle selection FIRST for visual highlighting
      toggleNodeSelection(node.id)

      // THEN open the stage table
      setActiveStageNode(node.id, node.category)
      console.log('[SankeyDiagram.handleNodeSelectionClick] 🎯 Opening decoder similarity stage table for node:', node.id, 'category:', node.category)
      return
    }

    // Otherwise -> toggle node selection for table filtering
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🔍 DEBUG: No match, toggling node selection')
    toggleNodeSelection(node.id)
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🎯 Node selection toggled:', node.id)
  }, [panel, toggleNodeSelection, setActiveStageNode])

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

            {/* Metric labels - one per source node */}
            <g className="sankey-diagram__metric-labels">
              {(() => {
                // Group links by source node
                const sourceNodeMap = new Map<string, { node: D3SankeyNode; links: D3SankeyLink[] }>()

                layout.links.forEach(link => {
                  const sourceNode = typeof link.source === 'object' ? link.source : null
                  if (!sourceNode || !sourceNode.metric || !sourceNode.id) return

                  if (!sourceNodeMap.has(sourceNode.id)) {
                    sourceNodeMap.set(sourceNode.id, { node: sourceNode, links: [] })
                  }
                  sourceNodeMap.get(sourceNode.id)!.links.push(link)
                })

                // Render one label per source node
                return Array.from(sourceNodeMap.entries()).map(([nodeId, { node, links }]) => {
                  if (node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) return null

                  // Find the average target X position
                  const targetXPositions = links
                    .map(link => {
                      const targetNode = typeof link.target === 'object' ? link.target : null
                      return targetNode?.x0
                    })
                    .filter((x): x is number => x !== undefined)

                  if (targetXPositions.length === 0) return null

                  const avgTargetX = targetXPositions.reduce((sum, x) => sum + x, 0) / targetXPositions.length

                  // Position at horizontal center between source and average target
                  const labelX = (node.x1 + avgTargetX) / 2

                  // Find the topmost link from this source node
                  const topY = Math.min(
                    ...links.map(link => {
                      const targetNode = typeof link.target === 'object' ? link.target : null
                      return Math.min(node.y0!, targetNode?.y0 ?? Infinity)
                    })
                  )

                  const labelY = topY + 12  // 12px below the top edge

                  const metricLabel = METRIC_DISPLAY_NAMES[node.metric as keyof typeof METRIC_DISPLAY_NAMES] || node.metric

                  return (
                    <text
                      key={`metric-label-${nodeId}`}
                      x={labelX}
                      y={labelY}
                      dy="0.35em"
                      fontSize={10}
                      fill="#6b7280"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {metricLabel}
                    </text>
                  )
                })
              })()}
            </g>

            {/* Nodes */}
            <g className="sankey-diagram__nodes">
              {(() => {
                return layout.nodes.map((node) => {
                  const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                      hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')
                  const isSelected = panel === PANEL_LEFT && (
                    tableSelectedNodeIds.includes(node.id) ||
                    featureHighlightedNodeIds.includes(node.id)
                  )

                  // Check if this is a vertical bar node
                  if (node.node_type === 'vertical_bar') {
                    // Only pass scrollState to the winner node (winner-takes-all)
                    const shouldShowIndicator = winnerNodeId === node.id

                    return (
                      <VerticalBarSankeyNode
                        key={node.id}
                        node={node}
                        scrollState={shouldShowIndicator ? tableScrollState : null}
                        flowDirection={flowDirection}
                        onClick={(e) => handleNodeSelectionClick(e, node)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        isSelected={isSelected}
                        isHovered={hoveredNodeId === node.id}
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
                      isSelected={isSelected}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onClick={(e) => handleNodeSelectionClick(e, node)}
                      flowDirection={flowDirection}
                      animationDuration={animationDuration}
                      sankeyTree={sankeyTree}
                    />
                  )
                })
              })()}
            </g>

            {/* Sankey Overlay - histograms, metric overlay, threshold sliders */}
            <SankeyOverlay
              layout={layout}
              histogramData={histogramData}
              animationDuration={animationDuration}
              sankeyTree={sankeyTree}
              onMetricClick={handleOverlayMetricClick}
              onThresholdUpdate={handleThresholdUpdate}
              onThresholdUpdateByPercentile={handleThresholdUpdateByPercentile}
            />

            {/* Node Buttons - rendered after overlay to appear on top */}
            <g className="sankey-diagram__node-buttons">
              {(() => {
                const buttons: NodeButton[] = []
                const isRightToLeft = flowDirection === 'right-to-left'

                layout.nodes.forEach((node) => {
                  // Skip placeholder nodes
                  if (node.id === 'placeholder_vertical_bar') return

                  // Calculate button position
                  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
                    return
                  }

                  const buttonX = isRightToLeft ? node.x0 - 15 : node.x1 + 12
                  const buttonY = (node.y0 + node.y1) / 2

                  // Determine button visibility using tree-based system
                  let canAdd = false
                  let canRemove = false

                  if (sankeyTree && computedSankey) {
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

                  // Add button if applicable
                  if (canAdd) {
                    buttons.push({
                      nodeId: node.id || '',
                      x: buttonX,
                      y: buttonY,
                      type: 'add',
                      isHovered: hoveredNodeId === node.id,
                      onClick: (e) => handleAddStageClick(e, node)
                    })
                  }

                  // Remove button if applicable
                  if (canRemove) {
                    buttons.push({
                      nodeId: node.id || '',
                      x: buttonX,
                      y: buttonY,
                      type: 'remove',
                      isHovered: hoveredNodeId === node.id,
                      onClick: (e) => handleRemoveStageClick(e, node)
                    })
                  }
                })

                return <NodeButtons buttons={buttons} animationDuration={animationDuration} />
              })()}
            </g>
          </g>
        </svg>
      </div>

      {/* Inline Stage Selector - rendered outside SVG */}
      {inlineSelector && (
        <SankeyInlineSelector
          selector={inlineSelector}
          onStageSelect={handleStageSelect}
          onClose={() => setInlineSelector(null)}
        />
      )}
    </div>
  )
}

export default SankeyDiagram