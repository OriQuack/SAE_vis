import React, { useState, useCallback, useMemo } from 'react'
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
  getNodeMetrics
} from '../lib/threshold-utils'
import { useResizeObserver } from '../lib/utils'
import type { D3SankeyNode, D3SankeyLink } from '../types'
import {
  PANEL_LEFT,
  PANEL_RIGHT,
  METRIC_DISPLAY_NAMES
} from '../lib/constants'
import { SankeyOverlay } from './SankeyOverlay'
// SankeyInlineSelector removed - no longer needed with fixed 3-stage auto-expansion
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
  flowDirection: _flowDirection,
  animationDuration: _animationDuration,
  sankeyTree: _sankeyTree
}) => {
  if (node.x0 === undefined || node.x1 === undefined || node.y0 === undefined || node.y1 === undefined) {
    return null
  }

  const color = getNodeColor(node)
  const width = node.x1 - node.x0
  const height = node.y1 - node.y0

  return (
    <g className="sankey-node">
      <rect
        x={node.x0}
        y={node.y0}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.5}
        stroke={isSelected ? '#2563eb' : color}
        strokeWidth={isSelected ? 3 : 2}
        style={{
        //   transition: `all ${animationDuration}ms ease-out`,
          cursor: onClick ? 'pointer' : 'default',
          filter: isSelected ? 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.5))' : (isHovered || isHighlighted ? 'brightness(1.1)' : 'none')
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />
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
  flowDirection: 'left-to-right' | 'right-to-left'
  onClick?: (e: React.MouseEvent) => void
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: () => void
  isSelected?: boolean
  isHovered?: boolean
  featureSelectionStates?: Map<number, 'selected' | 'rejected'>
  tableSortedFeatureIds?: number[]
}> = ({ node, scrollState, flowDirection: _flowDirection, onClick, onMouseEnter, onMouseLeave, isSelected = false, isHovered = false, featureSelectionStates, tableSortedFeatureIds }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState, featureSelectionStates, tableSortedFeatureIds)

  // Check if this is a placeholder node
  const isPlaceholder = node.id === 'placeholder_vertical_bar'

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
      {/* Render vertical bar - as individual feature lines or fallback rectangle */}
      {layout.subNodes.map((subNode) => {
        // If featureId exists, render as a thin horizontal line
        if (subNode.featureId !== undefined) {
          return (
            <line
              key={subNode.id}
              x1={subNode.x}
              y1={subNode.y + subNode.height / 2}
              x2={subNode.x + subNode.width}
              y2={subNode.y + subNode.height / 2}
              stroke={subNode.color}
              strokeWidth={1}
              opacity={0.8}
            />
          )
        }

        // Fallback: render as rectangle (for nodes without feature data)
        return (
          <g key={subNode.id}>
            {/* Bar rectangle */}
            <rect
              className="sankey-vertical-bar-rect"
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
          rx={2}
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
          stroke="#4b5563"
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
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
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const tableData = useVisualizationStore(state => state.tableData)
  const {
    showHistogramPopover,
    // addStageToNode, // REMOVED: No longer needed with fixed 3-stage auto-expansion
    // removeNodeStage, // REMOVED: No longer needed with fixed 3-stage auto-expansion
    updateNodeThresholds,
    updateNodeThresholdsByPercentile,
    selectNodeWithCategory,
    getNodeCategory
  } = useVisualizationStore()

  // Extract sorted feature IDs from table data (for vertical bar feature line ordering)
  const tableSortedFeatureIds = useMemo(() => {
    if (!tableData || !tableData.features) {
      return null
    }
    return tableData.features.map((f: any) => f.feature_id)
  }, [tableData])

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
  // const [inlineSelector, setInlineSelector] = useState<...>(null) // REMOVED: No longer needed

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

  // Scroll indicator is now shown only on selected nodes (removed winner-takes-all logic)
  // This prevents the indicator from jumping around when thresholds change

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

  // REMOVED: handleAddStageClick - No longer needed with fixed 3-stage auto-expansion
  // const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
  //   event.stopPropagation()
  //   // ... implementation removed
  // }, [sankeyTree, computedSankey])

  // REMOVED: handleStageSelect and handleOverlayMetricClick - No longer needed with fixed 3-stage auto-expansion
  // const handleStageSelect = useCallback(async (stageTypeId: string) => { ... }, [inlineSelector, panel])
  // const handleOverlayMetricClick = useCallback(async (metric: string) => { ... }, [panel])

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
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🔍 Node clicked:', {
      id: node.id,
      node_type: node.node_type,
      stage: node.stage,
      panel: panel
    })

    // 1. Only allow selection in left panel
    if (panel !== PANEL_LEFT) {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ Ignoring click - not left panel')
      return
    }

    // 2. Only allow rightmost vertical bar nodes
    if (node.node_type !== 'vertical_bar') {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ Ignoring click - not a vertical bar node')
      return
    }

    if (!data || !data.nodes) {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ No data available')
      return
    }

    const maxStage = Math.max(...data.nodes.map((n: any) => n.stage))
    if (node.stage !== maxStage) {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ Ignoring click - not a rightmost node (stage:', node.stage, ', maxStage:', maxStage, ')')
      return
    }

    // 3. Skip root and placeholder nodes
    if (node.id === 'root' || node.id === 'placeholder_vertical_bar') {
      console.log('[SankeyDiagram.handleNodeSelectionClick] ⚠️ Ignoring click - root or placeholder node')
      return
    }

    event.stopPropagation()

    // 4. Check if this node is already selected (toggle behavior)
    const isAlreadySelected = tableSelectedNodeIds.includes(node.id)

    if (isAlreadySelected) {
      // Deselect: clear selection and active stage
      console.log('[SankeyDiagram.handleNodeSelectionClick] 🔄 Node already selected - deselecting')
      const { selectSingleNode, setActiveStageNode } = useVisualizationStore.getState()
      selectSingleNode(null)
      setActiveStageNode(null, null)
      console.log('[SankeyDiagram.handleNodeSelectionClick] ✅ Node deselected, showing all features')
      return
    }

    // 5. Get node category from tree
    const category = getNodeCategory(node.id)

    if (!category) {
      console.warn('[SankeyDiagram.handleNodeSelectionClick] ⚠️ Cannot determine category for node:', node.id)
      return
    }

    console.log('[SankeyDiagram.handleNodeSelectionClick] ✅ Category determined:', category)

    // 6. Select node and activate category (atomic operation with single-select)
    selectNodeWithCategory(node.id, category)
    console.log('[SankeyDiagram.handleNodeSelectionClick] 🎯 Selected node with category:', node.id, category)
  }, [panel, data, tableSelectedNodeIds, selectNodeWithCategory, getNodeCategory])

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

                  // Calculate label position based on stage gap
                  // This fixes positioning issues when targets are terminal nodes at stage 3
                  const firstTargetNode = links.length > 0 && typeof links[0].target === 'object'
                    ? links[0].target
                    : null

                  if (!firstTargetNode || firstTargetNode.x0 === undefined) return null

                  // Use a fixed offset approach: position label halfway to the next stage
                  // This works correctly even when all targets are vertical bars at stage 3
                  const labelX = node.x1 + (firstTargetNode.x0 - node.x1) / 2

                  // Find the topmost link from this source node
                  const topY = Math.min(
                    ...links.map(link => {
                      const targetNode = typeof link.target === 'object' ? link.target : null
                      return Math.min(node.y0!, targetNode?.y0 ?? Infinity)
                    })
                  )

                  const labelY = topY - 12  // 12px above the top edge

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
                // Calculate maxStage once for all nodes
                const maxStage = Math.max(...layout.nodes.map((n: any) => n.stage))

                return layout.nodes.map((node) => {
                  const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                      hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')
                  const isSelected = panel === PANEL_LEFT && tableSelectedNodeIds.includes(node.id)

                  // Determine if node is clickable (only rightmost vertical bars in left panel)
                  const isClickable = panel === PANEL_LEFT &&
                                      node.node_type === 'vertical_bar' &&
                                      node.stage === maxStage &&
                                      node.id !== 'root' &&
                                      node.id !== 'placeholder_vertical_bar'

                  // Check if this is a vertical bar node
                  if (node.node_type === 'vertical_bar') {
                    // Only show scroll indicator on selected nodes (not winner-takes-all)
                    // This prevents jumping when thresholds change
                    const shouldShowIndicator = isSelected

                    return (
                      <g
                        key={node.id}
                        style={{ cursor: isClickable ? 'pointer' : 'not-allowed' }}
                      >
                        <VerticalBarSankeyNode
                          node={node}
                          scrollState={shouldShowIndicator ? tableScrollState : null}
                          flowDirection={flowDirection}
                          onClick={(e) => handleNodeSelectionClick(e, node)}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          isSelected={isSelected}
                          isHovered={hoveredNodeId === node.id}
                          featureSelectionStates={featureSelectionStates}
                          tableSortedFeatureIds={tableSortedFeatureIds || undefined}
                        />
                      </g>
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

            {/* Sankey Overlay - histograms and threshold sliders */}
            <SankeyOverlay
              layout={layout}
              histogramData={histogramData}
              animationDuration={animationDuration}
              sankeyTree={sankeyTree}
              onThresholdUpdate={handleThresholdUpdate}
              onThresholdUpdateByPercentile={handleThresholdUpdateByPercentile}
            />

            {/* Node Labels - rendered after histograms to appear in front */}
            <g className="sankey-diagram__node-labels">
              {layout.nodes.map((node) => {
                const isRightToLeft = flowDirection === 'right-to-left'

                // Check if this is a vertical bar node
                if (node.node_type === 'vertical_bar') {
                  // Skip placeholder nodes
                  if (node.id === 'placeholder_vertical_bar') return null

                  const labelX = isRightToLeft && node.x1 !== undefined ? node.x1 + 6 : (node.x0 !== undefined ? node.x0 - 6 : 0)
                  const textAnchor = isRightToLeft ? 'start' : 'end'
                  const labelY = node.y0 !== undefined && node.y1 !== undefined ? (node.y0 + node.y1) / 2 : 0
                  const isHovered = hoveredNodeId === node.id

                  // Split name into lines and append feature count to the last line
                  const nameLines = node.name.split('\n')
                  const lastLineIndex = nameLines.length - 1

                  return (
                    <g key={`label-${node.id}`}>
                      {nameLines.map((line, index) => (
                        <text
                          key={index}
                          x={labelX}
                          y={labelY + (index * 14)}
                          dy="0.35em"
                          fontSize={index === 0 ? 12 : 10}
                          fill="#000000"
                          opacity={1}
                          fontWeight={isHovered ? 700 : 600}
                          textAnchor={textAnchor}
                          style={{ pointerEvents: 'none' }}
                        >
                          {line}{index === lastLineIndex ? ` (${node.feature_count.toLocaleString()})` : ''}
                        </text>
                      ))}
                    </g>
                  )
                }

                // Regular nodes
                // Check if this is root node with/without children
                let labelX: number
                let textAnchor: 'start' | 'end' | 'middle'
                let showLabel = true

                if (node.id === 'root' && sankeyTree) {
                  const rootTreeNode = sankeyTree.get('root')
                  if (rootTreeNode && rootTreeNode.children.length === 0) {
                    labelX = node.x1! + 6
                    textAnchor = 'start'
                  } else if (rootTreeNode && rootTreeNode.children.length > 0) {
                    showLabel = false
                    labelX = node.x0! - 6
                    textAnchor = 'end'
                  } else {
                    labelX = isRightToLeft ? node.x1! + 6 : node.x0! - 6
                    textAnchor = isRightToLeft ? 'start' : 'end'
                  }
                } else {
                  labelX = isRightToLeft ? node.x1! + 6 : node.x0! - 6
                  textAnchor = isRightToLeft ? 'start' : 'end'
                }

                if (!showLabel) return null

                const isHovered = hoveredNodeId === node.id

                // Split name into lines and append feature count to the last line
                const nameLines = node.name.split('\n')
                const lastLineIndex = nameLines.length - 1

                return (
                  <g key={`label-${node.id}`}>
                    {nameLines.map((line, index) => (
                      <text
                        key={index}
                        x={labelX}
                        y={((node.y0 ?? 0) + (node.y1 ?? 0)) / 2 + (index * 14)}
                        dy="0.35em"
                        fontSize={index === 0 ? 12 : 10}
                        fill="#000000"
                        opacity={1}
                        fontWeight={isHovered ? 700 : 600}
                        textAnchor={textAnchor}
                        style={{ pointerEvents: 'none' }}
                      >
                        {line}{index === lastLineIndex ? ` (${node.feature_count.toLocaleString()})` : ''}
                      </text>
                    ))}
                  </g>
                )
              })}
            </g>

            {/* Node Buttons - REMOVED: No longer needed with fixed 3-stage structure */}
          </g>
        </svg>
      </div>

      {/* REMOVED: Inline Stage Selector - no longer needed with fixed 3-stage auto-expansion */}
    </div>
  )
}

export default SankeyDiagram