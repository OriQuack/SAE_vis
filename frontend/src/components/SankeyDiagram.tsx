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
} from '../lib/sankey-utils'
import { calculateVerticalBarNodeLayout } from '../lib/sankey-utils'
// Removed: SankeyTreeNode, getNodeMetrics, getNodeSegments - using v2 system
import { useResizeObserver } from '../lib/utils'
import type { D3SankeyNode, D3SankeyLink } from '../types'
import {
  PANEL_LEFT,
  PANEL_RIGHT
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
}> = ({
  node,
  onMouseEnter,
  onMouseLeave,
  onClick,
  isHovered,
  isHighlighted,
  isSelected = false,
  flowDirection: _flowDirection,
  animationDuration: _animationDuration
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
        fillOpacity={0.85}
        stroke={isSelected ? '#2563eb' : color}
        strokeWidth={isSelected ? 4 : 1}
        style={{
          cursor: onClick ? 'pointer' : 'default',
          filter: (isHovered || isHighlighted) ? 'brightness(1.1)' : 'none'
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
  isHovered: boolean
}> = ({ link, onMouseEnter, onMouseLeave, onClick, isHovered }) => {
  const sourceNode = typeof link.source === 'object' ? link.source : null
  if (!sourceNode) return null

  const path = getSankeyPath(link)
  const baseColor = getLinkColor(link)

  // Apply opacity by replacing last 2 characters (opacity suffix)
  const color = isHovered ? baseColor.slice(0, -2) + '48' : baseColor

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, link.width || 0)}
      opacity={1.0}
      style={{
        transition: `all 500ms cubic-bezier(0.4, 0.0, 0.2, 1)`,
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
  sankeyStructure?: any | null  // V2: simplified structure
  selectedSegment?: { nodeId: string; segmentIndex: number } | null  // V2: segment selection
  optimisticSegments?: any[]  // V2: preview segments during threshold drag
}> = ({ node, scrollState, flowDirection: _flowDirection, onClick, onMouseEnter, onMouseLeave, isSelected = false, isHovered = false, featureSelectionStates, tableSortedFeatureIds, sankeyStructure, selectedSegment, optimisticSegments }) => {
  const layout = calculateVerticalBarNodeLayout(node, scrollState, featureSelectionStates, tableSortedFeatureIds)

  // Check if this is a placeholder node
  const isPlaceholder = node.id === 'placeholder_vertical_bar'

  // V2: Get segments from sankeyStructure (with optimistic preview support)
  const stageSegments = useMemo(() => {
    if (!sankeyStructure) return []

    const structureNode = sankeyStructure.nodes.find((n: any) => n.id === node.id)
    if (!structureNode || structureNode.type !== 'segment') return []

    // Use optimistic segments if available (during threshold drag), otherwise use committed segments
    const segments = optimisticSegments || structureNode.segments

    // Convert segments to rendering format
    return segments.map((seg: any) => ({
      y: node.y0! + seg.yPosition * ((node.y1! - node.y0!) || 0),
      height: seg.height * ((node.y1! - node.y0!) || 0),
      color: seg.color,
      label: seg.tagName,
      featureCount: seg.featureCount
    }))
  }, [sankeyStructure, node, optimisticSegments])

  // Calculate bounding box for selection border
  const boundingBox = layout.subNodes.length > 0 ? {
    x: Math.min(...layout.subNodes.map(sn => sn.x)),
    y: Math.min(...layout.subNodes.map(sn => sn.y)),
    width: layout.totalWidth,
    height: Math.max(...layout.subNodes.map(sn => sn.y + sn.height)) - Math.min(...layout.subNodes.map(sn => sn.y))
  } : null

  return (
    <g
      className={`sankey-vertical-bar-node ${isSelected ? 'sankey-vertical-bar-node--selected' : ''} ${isHovered ? 'sankey-vertical-bar-node--hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Render vertical bar with stage segments or as single unified rectangle */}
      {stageSegments.length > 0 ? (
        // Render segmented bar (progressive reveal)
        stageSegments.map((segment: any, index: number) => (
          <rect
            key={`segment-${index}`}
            className="sankey-vertical-bar-segment"
            x={node.x0}
            y={segment.y}
            width={(node.x1 || 0) - (node.x0 || 0)}
            height={segment.height}
            fill={segment.color}
            opacity={0.85}
            stroke="#ffffff"
            strokeWidth={1}
            style={{
              transition: 'all 300ms ease-out'
            }}
          >
            <title>{`${segment.label}\n${segment.featureCount} features`}</title>
          </rect>
        ))
      ) : (
        // Render solid bar (terminal node or LLM explainer bars)
        layout.subNodes.length > 0 && (
          <rect
            className="sankey-vertical-bar-rect"
            x={layout.subNodes[0].x}
            y={Math.min(...layout.subNodes.map(sn => sn.y))}
            width={layout.totalWidth}
            height={Math.max(...layout.subNodes.map(sn => sn.y + sn.height)) - Math.min(...layout.subNodes.map(sn => sn.y))}
            fill={node.colorHex || layout.subNodes[0].color}
            opacity={0.85}
            stroke="none"
            strokeDasharray={isPlaceholder ? "3,3" : undefined}
          />
        )
      )}

      {/* Selection border - either on specific segment or entire bar */}
      {isSelected && (() => {
        // V2: If a specific segment is selected for this node, highlight only that segment
        if (selectedSegment && selectedSegment.nodeId === node.id && stageSegments.length > 0) {
          const segment = stageSegments[selectedSegment.segmentIndex]
          if (segment) {
            return (
              <rect
                x={(node.x0 || 0) - 2}
                y={segment.y - 2}
                width={((node.x1 || 0) - (node.x0 || 0)) + 4}
                height={segment.height + 4}
                fill="none"
                stroke="#2563eb"
                strokeWidth={3}
                pointerEvents="none"
                style={{
                  transition: 'all 300ms ease-out'
                }}
              />
            )
          }
        }

        // Default: highlight entire bar
        if (!boundingBox) return null
        return (
          <rect
            x={boundingBox.x - 2}
            y={boundingBox.y - 2}
            width={boundingBox.width + 4}
            height={boundingBox.height + 4}
            fill="none"
            stroke="#2563eb"
            strokeWidth={4}
            rx={2}
            style={{
              pointerEvents: 'none',
              transition: `all 500ms cubic-bezier(0.4, 0.0, 0.2, 1)`
            }}
          />
        )
      })()}

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
          style={{
            pointerEvents: 'none',
            transition: `all 500ms cubic-bezier(0.4, 0.0, 0.2, 1)`
          }}
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

  // Get data from store - V2 SIMPLIFIED SYSTEM
  const d3Layout = useVisualizationStore(state => state[panelKey].d3Layout)
  const sankeyStructure = useVisualizationStore(state => state[panelKey].sankeyStructure)
  const filters = useVisualizationStore(state => state[panelKey].filters)
  const histogramData = useVisualizationStore(state => state[panelKey].histogramData)
  const loading = useVisualizationStore(state => state.loading[loadingKey])
  const error = useVisualizationStore(state => state.errors[errorKey])
  const hoveredAlluvialNodeId = useVisualizationStore(state => state.hoveredAlluvialNodeId)
  const hoveredAlluvialPanel = useVisualizationStore(state => state.hoveredAlluvialPanel)
  const tableScrollState = useVisualizationStore(state => state.tableScrollState)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const tableData = useVisualizationStore(state => state.tableData)
  const {
    showHistogramPopover,
    updateStageThreshold,
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

  // V2 SIMPLIFIED SYSTEM: use d3Layout directly
  const data = useMemo(() => {
    if (!d3Layout || !sankeyStructure) {
      console.log(`[SankeyDiagram ${panel}] ⚠️ No D3 layout data`)
      return null
    }

    console.log(`[SankeyDiagram ${panel}] ✅ Using V2 SIMPLIFIED system`, {
      nodes: d3Layout.nodes.length,
      links: d3Layout.links.length,
      currentStage: sankeyStructure.currentStage
    })

    // Return D3 layout in SankeyData format
    return {
      nodes: d3Layout.nodes,
      links: d3Layout.links,
      metadata: {
        total_features: d3Layout.nodes.find((n: any) => n.id === 'root')?.feature_count || 0,
        applied_filters: filters
      }
    }
  }, [d3Layout, sankeyStructure, filters, panel])

  // Track previous data for smooth transitions
  const [displayData, setDisplayData] = useState(data)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
  const [optimisticSegments, setOptimisticSegments] = useState<Record<string, any[]>>({})
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
    if (!showHistogramOnClick || !sankeyStructure) return

    // V2: Only show histograms for segment nodes with metrics
    const structureNode = sankeyStructure.nodes.find(n => n.id === node.id)
    if (!structureNode || structureNode.type !== 'segment') return

    const metric = structureNode.metric
    if (!metric) return

    const containerRect = containerElementRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(node.id, node.name, [metric as any], position, undefined, undefined, panel, node.category)
  }, [showHistogramOnClick, showHistogramPopover, sankeyStructure, panel])

  const handleLinkHistogramClick = useCallback((link: D3SankeyLink) => {
    if (!showHistogramOnClick) return

    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return

    // V2: Delegate to node histogram click
    handleNodeHistogramClick(sourceNode)
  }, [showHistogramOnClick, handleNodeHistogramClick])

  // REMOVED: handleAddStageClick - No longer needed with fixed 3-stage auto-expansion
  // const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
  //   event.stopPropagation()
  //   // ... implementation removed
  // }, [sankeyTree, computedSankey])

  // REMOVED: handleStageSelect and handleOverlayMetricClick - No longer needed with fixed 3-stage auto-expansion
  // const handleStageSelect = useCallback(async (stageTypeId: string) => { ... }, [inlineSelector, panel])
  // const handleOverlayMetricClick = useCallback(async (metric: string) => { ... }, [panel])

  const handleThresholdUpdate = useCallback((nodeId: string, newThreshold: number) => {
    console.log('[SankeyDiagram.handleThresholdUpdate] 🎯 Threshold updated:', {
      nodeId,
      newThreshold,
      panel
    })

    // V2: Determine which stage this node belongs to
    if (nodeId === 'stage1_segment') {
      updateStageThreshold(1, newThreshold, panel)
    } else if (nodeId === 'stage2_segment') {
      updateStageThreshold(2, newThreshold, panel)
    }
  }, [updateStageThreshold, panel])

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
      <div className="sankey-diagram__header">
        <h3 className="sankey-diagram__title">Filter View</h3>
        <p className="sankey-diagram__instruction">Move threshold do filter candidates</p>
      </div>
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
                  onMouseEnter={() => setHoveredLinkIndex(index)}
                  onMouseLeave={() => setHoveredLinkIndex(null)}
                  onClick={showHistogramOnClick ? () => handleLinkHistogramClick(link) : undefined}
                  isHovered={hoveredLinkIndex === index}
                />
              ))}
            </g>

            {/* Metric labels removed - metric name now shown in node labels */}

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
                          sankeyStructure={sankeyStructure}
                          selectedSegment={selectedSegment}
                          optimisticSegments={optimisticSegments[node.id || '']}
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
                    />
                  )
                })
              })()}
            </g>

            {/* Sankey Overlay - histograms and threshold sliders (V2) */}
            <SankeyOverlay
              layout={layout}
              histogramData={histogramData}
              animationDuration={animationDuration}
              sankeyStructure={sankeyStructure}
              onThresholdUpdate={handleThresholdUpdate}
              tableData={tableData}
              onOptimisticSegmentsChange={setOptimisticSegments}
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
                  const isHovered = hoveredNodeId === node.id

                  // Get segments for this node (with optimistic preview support)
                  const structureNode = sankeyStructure?.nodes.find((n: any) => n.id === node.id)
                  const segments = structureNode?.type === 'segment'
                    ? (optimisticSegments[node.id || ''] || structureNode.segments || [])
                    : []

                  // Render labels for each segment
                  if (segments.length > 0) {
                    return (
                      <g key={`label-${node.id}`}>
                        {segments.map((segment: any, segmentIndex: number) => {
                          // Calculate segment position
                          const segmentY = (node.y0 || 0) + segment.yPosition * ((node.y1 || 0) - (node.y0 || 0))
                          const segmentHeight = segment.height * ((node.y1 || 0) - (node.y0 || 0))
                          const segmentCenterY = segmentY + segmentHeight / 2

                          // Prepare label lines (tag name + metric comparison + feature count)
                          // Only segment nodes have metric and threshold
                          const metric = structureNode?.type === 'segment' ? structureNode.metric : null
                          const threshold = structureNode?.type === 'segment' ? structureNode.threshold : null
                          const comparison = segmentIndex === 0 ? '<' : '≥'
                          // Replace underscores with spaces and capitalize first letter of each word
                          const metricDisplay = metric ? metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : ''

                          const labelLines = [
                            segment.tagName,
                            metricDisplay && threshold !== null ? `${metricDisplay} ${comparison} ${threshold.toFixed(2)}` : '',
                            `(${segment.featureCount.toLocaleString()})`
                          ].filter(line => line !== '') // Remove empty metric line if no metric

                          // Calculate vertical offset to center label group
                          const lineHeight = 14
                          const totalHeight = labelLines.length * lineHeight
                          const verticalOffset = -totalHeight / 2 + lineHeight

                          return (
                            <g key={`segment-label-${segmentIndex}`}>
                              {labelLines.map((line: string, lineIndex: number) => (
                                <g key={lineIndex}>
                                  {/* White stroke outline */}
                                  <text
                                    x={labelX}
                                    y={segmentCenterY + verticalOffset + (lineIndex * lineHeight)}
                                    dy="0.35em"
                                    fontSize={lineIndex === 0 ? 12 : 10}
                                    fill="white"
                                    stroke="white"
                                    strokeWidth={3}
                                    opacity={1}
                                    fontWeight={isHovered ? 700 : 600}
                                    textAnchor={textAnchor}
                                    style={{
                                      pointerEvents: 'none',
                                      transition: `all 300ms ease-out`
                                    }}
                                  >
                                    {line}
                                  </text>
                                  {/* Black text on top */}
                                  <text
                                    x={labelX}
                                    y={segmentCenterY + verticalOffset + (lineIndex * lineHeight)}
                                    dy="0.35em"
                                    fontSize={lineIndex === 0 ? 12 : 10}
                                    fill="#000000"
                                    opacity={1}
                                    fontWeight={isHovered ? 700 : 600}
                                    textAnchor={textAnchor}
                                    style={{
                                      pointerEvents: 'none',
                                      transition: `all 300ms ease-out`
                                    }}
                                  >
                                    {line}
                                  </text>
                                </g>
                              ))}
                            </g>
                          )
                        })}
                      </g>
                    )
                  }

                  // Fallback: if no segments, render simple label for terminal/regular vertical bar nodes
                  const fallbackLabelX = isRightToLeft ? node.x1! + 6 : node.x0! - 6
                  const fallbackTextAnchor = isRightToLeft ? 'start' : 'end'
                  const fallbackIsHovered = hoveredNodeId === node.id
                  const fallbackNodeCenterY = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2

                  // Split name into lines and add feature count
                  const fallbackNameLines = node.name.split('\n')
                  const fallbackAllLines = [...fallbackNameLines, `(${node.feature_count.toLocaleString()})`]

                  const fallbackLineHeight = 14
                  const fallbackTotalHeight = fallbackAllLines.length * fallbackLineHeight
                  const fallbackVerticalOffset = -fallbackTotalHeight / 2 + fallbackLineHeight / 2

                  return (
                    <g key={`label-${node.id}`}>
                      {fallbackAllLines.map((line: string, lineIndex: number) => (
                        <g key={lineIndex}>
                          {/* White stroke outline */}
                          <text
                            x={fallbackLabelX}
                            y={fallbackNodeCenterY + fallbackVerticalOffset + (lineIndex * fallbackLineHeight)}
                            dy="0.35em"
                            fontSize={lineIndex === fallbackAllLines.length - 1 ? 10 : 12}
                            fill="white"
                            stroke="white"
                            strokeWidth={3}
                            opacity={1}
                            fontWeight={fallbackIsHovered ? 700 : 600}
                            textAnchor={fallbackTextAnchor}
                            style={{
                              pointerEvents: 'none',
                              transition: `all 300ms ease-out`
                            }}
                          >
                            {line}
                          </text>
                          {/* Black text on top */}
                          <text
                            x={fallbackLabelX}
                            y={fallbackNodeCenterY + fallbackVerticalOffset + (lineIndex * fallbackLineHeight)}
                            dy="0.35em"
                            fontSize={lineIndex === fallbackAllLines.length - 1 ? 10 : 12}
                            fill="#000000"
                            opacity={1}
                            fontWeight={fallbackIsHovered ? 700 : 600}
                            textAnchor={fallbackTextAnchor}
                            style={{
                              pointerEvents: 'none',
                              transition: `all 300ms ease-out`
                            }}
                          >
                            {line}
                          </text>
                        </g>
                      ))}
                    </g>
                  )
                }

                // Regular nodes
                // Check if this is root node with/without children
                let labelX: number
                let textAnchor: 'start' | 'end' | 'middle'
                let showLabel = true

                // V2: Check if root has children in sankeyStructure
                if (node.id === 'root' && sankeyStructure) {
                  const hasChildren = sankeyStructure.links.some((l: any) => l.source === 'root')
                  if (!hasChildren) {
                    labelX = node.x1! + 6
                    textAnchor = 'start'
                  } else {
                    showLabel = false
                    labelX = node.x0! - 6
                    textAnchor = 'end'
                  }
                } else {
                  labelX = isRightToLeft ? node.x1! + 6 : node.x0! - 6
                  textAnchor = isRightToLeft ? 'start' : 'end'
                }

                if (!showLabel) return null

                const isHovered = hoveredNodeId === node.id

                // Split name into lines and add feature count on separate line
                const nameLines = node.name.split('\n')
                const allLines = [...nameLines, `(${node.feature_count.toLocaleString()})`]

                // Calculate vertical offset to center entire label group
                const lineHeight = 14
                const totalHeight = allLines.length * lineHeight
                const verticalOffset = -totalHeight / 2 + lineHeight / 2
                const nodeCenterY = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2

                return (
                  <g key={`label-${node.id}`}>
                    {allLines.map((line, index) => {
                      const labelText = line
                      return (
                        <g key={index}>
                          {/* White stroke outline */}
                          <text
                            x={labelX}
                            y={nodeCenterY + verticalOffset + (index * lineHeight)}
                            dy="0.35em"
                            fontSize={index === 0 ? 12 : 10}
                            fill="white"
                            stroke="white"
                            strokeWidth={3}
                            opacity={1}
                            fontWeight={isHovered ? 700 : 600}
                            textAnchor={textAnchor}
                            style={{
                              pointerEvents: 'none',
                              transition: `all 500ms cubic-bezier(0.4, 0.0, 0.2, 1)`
                            }}
                          >
                            {labelText}
                          </text>
                          {/* Black text on top */}
                          <text
                            x={labelX}
                            y={nodeCenterY + verticalOffset + (index * lineHeight)}
                            dy="0.35em"
                            fontSize={index === 0 ? 12 : 10}
                            fill="#000000"
                            opacity={1}
                            fontWeight={isHovered ? 700 : 600}
                            textAnchor={textAnchor}
                            style={{
                              pointerEvents: 'none',
                              transition: `all 500ms cubic-bezier(0.4, 0.0, 0.2, 1)`
                            }}
                          >
                            {labelText}
                          </text>
                        </g>
                      )
                    })}
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