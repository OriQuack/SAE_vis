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
import { useResizeObserver } from '../lib/utils'
import { findNodeById, getNodeMetrics, canAddStageToNode, getAvailableStageTypes } from '../lib/threshold-utils'
import type { D3SankeyNode, D3SankeyLink, AddStageConfig, StageTypeConfig } from '../types'
import { PANEL_LEFT, PANEL_RIGHT } from '../lib/constants'
import '../styles/SankeyDiagram.css'

// ==================== INTERFACES ====================
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

const MetricSelectorModal: React.FC<{
  onConfirm: (selectedMetrics: string[]) => void
  onCancel: () => void
}> = ({ onConfirm, onCancel }) => {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['score_fuzz', 'score_simulation', 'score_detection'])

  const availableMetrics = [
    { id: 'score_fuzz', name: 'Fuzz Score', description: 'String fuzzy matching score' },
    { id: 'score_simulation', name: 'Simulation Score', description: 'Activation simulation score' },
    { id: 'score_detection', name: 'Detection Score', description: 'Pattern detection score' },
    { id: 'score_embedding', name: 'Embedding Score', description: 'Semantic embedding score' }
  ]

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId)
        ? prev.filter(m => m !== metricId)
        : [...prev, metricId]
    )
  }

  const handleConfirm = () => {
    if (selectedMetrics.length === 0) {
      alert('Please select at least one metric')
      return
    }
    onConfirm(selectedMetrics)
  }

  return (
    <div className="sankey-metric-modal-overlay" onClick={onCancel}>
      <div className="sankey-metric-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="sankey-metric-modal__title">
          Select Scoring Metrics
        </h3>
        <p className="sankey-metric-modal__description">
          Choose one or more scoring metrics to compare for agreement analysis:
        </p>
        <div className="sankey-metric-modal__list">
          {availableMetrics.map(metric => (
            <label
              key={metric.id}
              className={`sankey-metric-modal__metric ${
                selectedMetrics.includes(metric.id) ? 'sankey-metric-modal__metric--selected' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedMetrics.includes(metric.id)}
                onChange={() => toggleMetric(metric.id)}
                className="sankey-metric-modal__checkbox"
              />
              <div className="sankey-metric-modal__metric-content">
                <div className="sankey-metric-modal__metric-name">
                  {metric.name}
                </div>
                <div className="sankey-metric-modal__metric-description">
                  {metric.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="sankey-metric-modal__info">
          <strong>Selected: {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''}</strong>
          <br />
          This will create {Math.pow(2, selectedMetrics.length)} categories (2^{selectedMetrics.length} combinations)
        </div>
        <div className="sankey-metric-modal__actions">
          <button
            onClick={onCancel}
            className="sankey-metric-modal__button sankey-metric-modal__button--cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedMetrics.length === 0}
            className="sankey-metric-modal__button sankey-metric-modal__button--confirm"
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const loading = useVisualizationStore(state => state.loading[loadingKey])
  const error = useVisualizationStore(state => state.errors[errorKey])
  const hoveredAlluvialNodeId = useVisualizationStore(state => state.hoveredAlluvialNodeId)
  const hoveredAlluvialPanel = useVisualizationStore(state => state.hoveredAlluvialPanel)
  const { showHistogramPopover, addStageToTree, removeStageFromTree } = useVisualizationStore()

  // Track previous data for smooth transitions
  const [displayData, setDisplayData] = useState(data)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
  const [inlineSelector, setInlineSelector] = useState<{
    nodeId: string
    position: { x: number; y: number }
    availableStages: StageTypeConfig[]
  } | null>(null)
  const [metricSelectorState, setMetricSelectorState] = useState<{
    nodeId: string
    stageType: StageTypeConfig
    position: { x: number; y: number }
  } | null>(null)

  // Resize observer hook with minimal debounce for responsiveness
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: width,
    defaultHeight: height,
    debounceMs: 16,  // ~60fps for smooth resizing
    debugId: panel
  })

  // Debug: Log containerSize changes
  React.useEffect(() => {
    console.log(`[SankeyDiagram ${panel}] containerSize:`, containerSize)
  }, [containerSize, panel])

  // Update display data when loading completes
  React.useEffect(() => {
    if (!loading && data) {
      setDisplayData(data)
    }
  }, [data, loading])

  // Calculate layout with memoization
  const { layout, validationErrors } = useMemo(() => {
    const errors = validateDimensions(containerSize.width, height)

    if (displayData) {
      errors.push(...validateSankeyData(displayData))
    }

    if (errors.length > 0 || !displayData) {
      return { layout: null, validationErrors: errors }
    }

    console.log(`[SankeyDiagram ${panel}] Calculating layout with container size:`, containerSize)

    try {
      // Use different margins for right panel
      const margin = flowDirection === 'right-to-left' ? RIGHT_SANKEY_MARGIN : undefined
      let calculatedLayout = calculateSankeyLayout(displayData, containerSize.width, height, margin)

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
  }, [displayData, containerSize.width, height, flowDirection])

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

    const containerRect = containerRef.current?.getBoundingClientRect()
    const position = {
      x: containerRect ? containerRect.right + 20 : window.innerWidth - 600,
      y: containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2
    }

    showHistogramPopover(node.id, node.name, metrics, position, undefined, undefined, panel, node.category)
  }, [showHistogramOnClick, showHistogramPopover, thresholdTree, containerRef, panel])

  const handleLinkHistogramClick = useCallback((link: D3SankeyLink) => {
    const sourceNode = typeof link.source === 'object' ? link.source : null
    if (!sourceNode) return
    handleNodeHistogramClick(sourceNode)
  }, [handleNodeHistogramClick])

  const handleAddStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    if (!thresholdTree) return

    event.stopPropagation()

    if (!canAddStageToNode(thresholdTree, node.id)) return

    const availableStages = getAvailableStageTypes(thresholdTree, node.id)
    const rect = event.currentTarget.getBoundingClientRect()

    setInlineSelector({
      nodeId: node.id,
      position: { x: rect.left + rect.width + 10, y: rect.top },
      availableStages
    })
  }, [thresholdTree])

  const handleRemoveStageClick = useCallback((event: React.MouseEvent, node: D3SankeyNode) => {
    event.stopPropagation()
    removeStageFromTree(node.id, panel)
  }, [removeStageFromTree, panel])

  const handleStageSelect = useCallback((stageTypeId: string) => {
    if (!inlineSelector || !thresholdTree) return

    const stageType = inlineSelector.availableStages.find(s => s.id === stageTypeId)
    if (!stageType) return

    setInlineSelector(null)

    const config: AddStageConfig = {
      stageType: stageTypeId,
      splitRuleType: stageType.defaultSplitRule,
      metric: stageType.defaultMetric,
      thresholds: stageType.defaultThresholds,
      // Use selected scoring metrics from store for score_agreement stage
      ...(stageTypeId === 'score_agreement' && {
        selectedScoreMetrics: useVisualizationStore.getState().selectedScoringMetrics
      })
    }

    addStageToTree(inlineSelector.nodeId, config, panel)

    // Show histogram popover after adding stage
    setTimeout(() => {
      const parentNode = layout?.nodes.find(n => n.id === inlineSelector.nodeId)
      if (parentNode) {
        handleNodeHistogramClick(parentNode)
      }
    }, 500)
  }, [inlineSelector, thresholdTree, addStageToTree, panel, layout, handleNodeHistogramClick, containerRef])

  const handleMetricSelectionConfirm = useCallback((selectedMetrics: string[]) => {
    if (!metricSelectorState || !thresholdTree) return

    const config: AddStageConfig = {
      stageType: 'score_agreement',
      splitRuleType: 'pattern',
      selectedScoreMetrics: selectedMetrics,
      thresholds: selectedMetrics.map((metric) => metric === 'score_simulation' ? 0.1 : 0.5)
    }

    addStageToTree(metricSelectorState.nodeId, config, panel)
    setMetricSelectorState(null)

    // Show histogram popover after adding stage
    setTimeout(() => {
      const parentNode = layout?.nodes.find(n => n.id === metricSelectorState.nodeId)
      if (parentNode) {
        handleNodeHistogramClick(parentNode)
      }
    }, 500)
  }, [metricSelectorState, thresholdTree, addStageToTree, panel, layout, handleNodeHistogramClick])

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
        ref={containerRef}
        className="sankey-diagram__container"
        style={{ width: '100%', height: height, position: 'relative' }}
      >
        <svg width={containerSize.width} height={height} className="sankey-diagram__svg">
          <rect width={containerSize.width} height={height} fill="#ffffff" />

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
                const canAdd = thresholdTree && canAddStageToNode(thresholdTree, node.id) &&
                               getAvailableStageTypes(thresholdTree, node.id).length > 0
                const treeNode = thresholdTree && findNodeById(thresholdTree, node.id)
                const canRemove = treeNode && treeNode.children_ids.length > 0
                const isHighlighted = hoveredAlluvialNodeId === node.id &&
                                    hoveredAlluvialPanel === (panel === PANEL_LEFT ? 'left' : 'right')

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

      {/* Metric Selector Modal */}
      {metricSelectorState && (
        <MetricSelectorModal
          onConfirm={handleMetricSelectionConfirm}
          onCancel={() => setMetricSelectorState(null)}
        />
      )}
    </div>
  )
}

export default SankeyDiagram