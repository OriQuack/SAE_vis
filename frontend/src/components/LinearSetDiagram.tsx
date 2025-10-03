import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'
import { calculateLinearSetLayout, formatCount, LINEAR_DIAGRAM_MARGIN, generateDefaultCategoryGroups } from '../lib/d3-linear-set-utils'
import { METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_SIMULATION, METRIC_SCORE_EMBEDDING } from '../lib/constants'
import { useResizeObserver } from '../lib/utils'
import '../styles/LinearSetDiagram.css'

const SCORING_METRICS = [
  { id: METRIC_SCORE_FUZZ, label: 'Fuzz' },
  { id: METRIC_SCORE_DETECTION, label: 'Detection' },
  { id: METRIC_SCORE_SIMULATION, label: 'Simulation' },
  { id: METRIC_SCORE_EMBEDDING, label: 'Embedding' }
]

interface LinearSetDiagramProps {
  width?: number
  height?: number
}

interface TooltipData {
  x: number
  y: number
  columnLabel: string
  featureCount: number
}

export function LinearSetDiagram({ width: propWidth, height: propHeight }: LinearSetDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const setVisualizationData = useStore((state) => state.setVisualizationData)
  const selectedScoringMetrics = useStore((state) => state.selectedScoringMetrics)
  const scoringMetricThresholds = useStore((state) => state.scoringMetricThresholds)
  const categoryGroups = useStore((state) => state.categoryGroups)
  const toggleScoringMetric = useStore((state) => state.toggleScoringMetric)
  const fetchSetVisualizationData = useStore((state) => state.fetchSetVisualizationData)
  const updateCategoryGroup = useStore((state) => state.updateCategoryGroup)
  const removeCategoryGroup = useStore((state) => state.removeCategoryGroup)
  const moveColumnToGroup = useStore((state) => state.moveColumnToGroup)
  const showHistogramPopover = useStore((state) => state.showHistogramPopover)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState<string>('')

  // Handler for adding group
  const handleAddGroup = useCallback(() => {
    const state = useStore.getState()
    const newGroupName = `Group ${state.categoryGroups.length + 1}`
    state.addCategoryGroup(newGroupName, [], '#e5e7eb')
  }, [])

  // Use the same resize observer pattern as SankeyDiagram
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: propWidth || 300,
    defaultHeight: propHeight || 400,
    debounceMs: 16,  // ~60fps for smooth resizing
    debugId: 'LinearSetDiagram'
  })

  // Removed automatic threshold sync from tree to scoringMetricThresholds
  // The flow is now unidirectional: scoringMetricThresholds → tree (when creating stages)
  // This prevents threshold reversion when user modifies via Linear Set histogram

  // Initialize category groups when data changes
  useEffect(() => {
    console.log('[LinearSetDiagram] Checking if CategoryGroups need initialization')
    console.log('[LinearSetDiagram] setVisualizationData:', !!setVisualizationData, 'selectedScoringMetrics:', selectedScoringMetrics.length)

    if (!setVisualizationData || selectedScoringMetrics.length === 0) {
      console.log('[LinearSetDiagram] Skipping CategoryGroup initialization - missing data')
      return
    }

    // Generate columns to check if we need to initialize groups
    const { set_counts } = setVisualizationData
    const columnIds = Object.keys(set_counts)
    console.log('[LinearSetDiagram] Available columnIds:', columnIds.length)

    // If we have no groups or groups don't match current columns, initialize defaults
    if (categoryGroups.length === 0 || !categoryGroups.some(g => columnIds.includes(g.columnIds[0]))) {
      console.log('[LinearSetDiagram] Initializing default CategoryGroups...')

      // Calculate initial layout to get ordered columns
      const tempLayout = calculateLinearSetLayout(
        setVisualizationData,
        selectedScoringMetrics,
        containerSize.width,
        containerSize.height,
        [],
        LINEAR_DIAGRAM_MARGIN
      )

      // Generate default groups
      const defaultGroups = generateDefaultCategoryGroups(tempLayout.columns, selectedScoringMetrics.length)
      console.log('[LinearSetDiagram] Generated', defaultGroups.length, 'default groups:', defaultGroups.map(g => ({ id: g.id, name: g.name, cols: g.columnIds.length })))

      // Update store
      useStore.setState({ categoryGroups: defaultGroups })
      console.log('[LinearSetDiagram] CategoryGroups updated in store')
    } else {
      console.log('[LinearSetDiagram] CategoryGroups already initialized, skipping')
    }
  }, [setVisualizationData, selectedScoringMetrics, containerSize.width, containerSize.height])

  // Sync CategoryGroups with Sankey diagrams - rebuild score_agreement stages when groups change
  useEffect(() => {
    console.log('[LinearSetDiagram] CategoryGroups changed, count:', categoryGroups.length)
    if (categoryGroups.length === 0) {
      console.log('[LinearSetDiagram] No CategoryGroups, skipping rebuild')
      return
    }

    console.log('[LinearSetDiagram] CategoryGroups:', categoryGroups.map(g => ({ id: g.id, name: g.name })))

    const state = useStore.getState()
    const { addStageToTree, removeStageFromTree } = state

    // Helper to find nodes with score_agreement category
    const findScoreAgreementNodes = (nodes: any[]) => {
      return nodes.filter((node: any) => node.category === 'score_agreement')
    }

    // Rebuild score_agreement stage for left panel if it exists
    const leftScoreNodes = findScoreAgreementNodes(state.leftPanel.thresholdTree.nodes)
    console.log('[LinearSetDiagram] Left panel score_agreement nodes:', leftScoreNodes.length)

    if (leftScoreNodes.length > 0) {
      // Find parent node of score_agreement stage
      const parentNode = state.leftPanel.thresholdTree.nodes.find((node: any) =>
        node.children_ids?.some((childId: string) =>
          leftScoreNodes.some((scoreNode: any) => scoreNode.id === childId)
        )
      )

      if (parentNode) {
        console.log('[LinearSetDiagram] Rebuilding left panel score_agreement stage, parent:', parentNode.id)

        // Remove existing score_agreement stage
        removeStageFromTree(parentNode.id, 'left')

        // Re-add with CategoryGroup configuration (after state update)
        setTimeout(() => {
          console.log('[LinearSetDiagram] Re-adding left panel score_agreement stage')
          addStageToTree(parentNode.id, {
            stageType: 'score_agreement',
            thresholds: [
              state.scoringMetricThresholds.score_fuzz || 0.5,
              state.scoringMetricThresholds.score_detection || 0.5,
              state.scoringMetricThresholds.score_simulation || 0.1
            ]
          }, 'left')
        }, 0)
      }
    }

    // Rebuild score_agreement stage for right panel if it exists
    const rightScoreNodes = findScoreAgreementNodes(state.rightPanel.thresholdTree.nodes)
    console.log('[LinearSetDiagram] Right panel score_agreement nodes:', rightScoreNodes.length)

    if (rightScoreNodes.length > 0) {
      const parentNode = state.rightPanel.thresholdTree.nodes.find((node: any) =>
        node.children_ids?.some((childId: string) =>
          rightScoreNodes.some((scoreNode: any) => scoreNode.id === childId)
        )
      )

      if (parentNode) {
        console.log('[LinearSetDiagram] Rebuilding right panel score_agreement stage, parent:', parentNode.id)

        removeStageFromTree(parentNode.id, 'right')

        setTimeout(() => {
          console.log('[LinearSetDiagram] Re-adding right panel score_agreement stage')
          addStageToTree(parentNode.id, {
            stageType: 'score_agreement',
            thresholds: [
              state.scoringMetricThresholds.score_fuzz || 0.5,
              state.scoringMetricThresholds.score_detection || 0.5,
              state.scoringMetricThresholds.score_simulation || 0.1
            ]
          }, 'right')
        }, 0)
      }
    }
  }, [categoryGroups])

  useEffect(() => {
    if (!svgRef.current || !setVisualizationData || selectedScoringMetrics.length === 0) {
      return
    }

    // Calculate layout using D3
    const layout = calculateLinearSetLayout(
      setVisualizationData,
      selectedScoringMetrics,
      containerSize.width,
      containerSize.height,
      categoryGroups,
      LINEAR_DIAGRAM_MARGIN
    )

    // React renders the visualization
    const svg = svgRef.current
    svg.innerHTML = '' // Clear previous rendering

    // Create SVG group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(g)

    // No column separators - removed dotted lines

    // Render gray background covering entire linear diagram area
    if (layout.rows.length > 0 && layout.groupBars.length > 0) {
      const topY = layout.rows[0].y
      const lastGroupBar = layout.groupBars[layout.groupBars.length - 1]
      const bottomY = lastGroupBar.y + lastGroupBar.height

      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('x', LINEAR_DIAGRAM_MARGIN.left.toString())
      bgRect.setAttribute('y', topY.toString())
      bgRect.setAttribute('width', (containerSize.width - LINEAR_DIAGRAM_MARGIN.left - LINEAR_DIAGRAM_MARGIN.right).toString())
      bgRect.setAttribute('height', (bottomY - topY).toString())
      bgRect.setAttribute('fill', '#f3f4f6') // Gray 100
      bgRect.setAttribute('opacity', '0.6')
      bgRect.setAttribute('class', 'category-area-background')

      g.appendChild(bgRect)
    }

    // Render metric rows with line segments
    layout.rows.forEach((row) => {
      // Metric label on the left (using margin constant)
      const labelX = LINEAR_DIAGRAM_MARGIN.left - 5
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', labelX.toString())
      label.setAttribute('y', (row.y + row.height / 2).toString())
      label.setAttribute('text-anchor', 'end')
      label.setAttribute('dominant-baseline', 'middle')
      label.setAttribute('font-size', '10')
      label.setAttribute('font-weight', '600')
      label.setAttribute('fill', '#374151')
      label.textContent = row.metricLabel
      g.appendChild(label)

      // Render each line segment for this metric
      row.lineSegments.forEach((segment) => {
        // Find the column data for this segment
        const column = layout.columns.find(col => col.id === segment.columnId)

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', segment.x.toString())
        rect.setAttribute('y', row.y.toString())
        rect.setAttribute('width', segment.width.toString())
        rect.setAttribute('height', row.height.toString())
        rect.setAttribute('fill', row.color)
        rect.setAttribute('opacity', '0.7')
        rect.setAttribute('data-column-id', segment.columnId)
        rect.setAttribute('class', 'linear-diagram-segment')
        rect.style.cursor = 'pointer'

        // Add hover effect with tooltip - emphasize entire column
        rect.addEventListener('mouseenter', (e) => {
          // Highlight all segments in this column
          const allSegments = g.querySelectorAll(`[data-column-id="${segment.columnId}"]`)
          allSegments.forEach(seg => seg.setAttribute('opacity', '0.9'))

          if (column) {
            const svgRect = svgRef.current?.getBoundingClientRect()
            const tooltipX = e.clientX - (svgRect?.left || 0)
            const tooltipY = e.clientY - (svgRect?.top || 0)

            setTooltip({
              x: tooltipX,
              y: tooltipY,
              columnLabel: column.label,
              featureCount: column.featureCount
            })
          }
        })
        rect.addEventListener('mouseleave', () => {
          // Reset all segments in this column
          const allSegments = g.querySelectorAll(`[data-column-id="${segment.columnId}"]`)
          allSegments.forEach(seg => seg.setAttribute('opacity', '0.7'))
          setTooltip(null)
        })
        rect.addEventListener('click', (e) => {
          const svgRect = svgRef.current?.getBoundingClientRect()
          const position = {
            x: svgRect ? svgRect.right + 20 : window.innerWidth - 600,
            y: e.clientY
          }
          showHistogramPopover(
            undefined,
            column?.label || segment.columnId,
            selectedScoringMetrics,
            position,
            undefined,
            undefined,
            'left'
          )
        })

        g.appendChild(rect)
      })
    })

    // Render group rows
    layout.groupBars.forEach((groupBar) => {
      // Group label on the left
      const labelX = LINEAR_DIAGRAM_MARGIN.left - 22
      const groupLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      groupLabel.setAttribute('x', labelX.toString())
      groupLabel.setAttribute('y', (groupBar.y + groupBar.height / 2).toString())
      groupLabel.setAttribute('text-anchor', 'end')
      groupLabel.setAttribute('dominant-baseline', 'middle')
      groupLabel.setAttribute('font-size', '10')
      groupLabel.setAttribute('font-weight', '600')
      groupLabel.setAttribute('fill', '#374151')
      groupLabel.textContent = groupBar.name
      groupLabel.style.cursor = 'pointer'

      // Add double-click handler to label for editing
      groupLabel.addEventListener('dblclick', () => {
        setEditingGroupId(groupBar.id)
        setEditingGroupName(groupBar.name)
      })

      g.appendChild(groupLabel)

      // Edit button with pencil icon (smaller, white background, black icon)
      const editBtnX = LINEAR_DIAGRAM_MARGIN.left - 10
      const editBtnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      editBtnGroup.setAttribute('class', 'group-edit-btn')
      editBtnGroup.style.cursor = 'pointer'

      const editBtn = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      editBtn.setAttribute('cx', editBtnX.toString())
      editBtn.setAttribute('cy', (groupBar.y + groupBar.height / 2).toString())
      editBtn.setAttribute('r', '8')
      editBtn.setAttribute('fill', '#ffffff')
      editBtn.setAttribute('stroke', '#d1d5db')
      editBtn.setAttribute('stroke-width', '1')

      // Pencil icon path (scaled and positioned)
      const editIcon = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const iconScale = 0.4
      const iconOffsetX = editBtnX - 5
      const iconOffsetY = groupBar.y + groupBar.height / 2 - 5
      editIcon.setAttribute('d', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z')
      editIcon.setAttribute('fill', '#374151')
      editIcon.setAttribute('transform', `translate(${iconOffsetX}, ${iconOffsetY}) scale(${iconScale})`)
      editIcon.style.pointerEvents = 'none'

      editBtnGroup.addEventListener('mouseenter', () => {
        editBtn.setAttribute('fill', '#f3f4f6')
      })
      editBtnGroup.addEventListener('mouseleave', () => {
        editBtn.setAttribute('fill', '#ffffff')
      })
      editBtnGroup.addEventListener('click', () => {
        setEditingGroupId(groupBar.id)
        setEditingGroupName(groupBar.name)
      })

      editBtnGroup.appendChild(editBtn)
      editBtnGroup.appendChild(editIcon)
      g.appendChild(editBtnGroup)

      // Render column indicators for this group
      groupBar.columnIndicators.forEach((indicator) => {
        const indicatorRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        indicatorRect.setAttribute('x', indicator.x.toString())
        indicatorRect.setAttribute('y', groupBar.y.toString())
        indicatorRect.setAttribute('width', indicator.width.toString())
        indicatorRect.setAttribute('height', groupBar.height.toString())
        indicatorRect.setAttribute('fill', groupBar.color)
        indicatorRect.setAttribute('opacity', '0.7')
        indicatorRect.setAttribute('class', 'group-column-indicator')
        indicatorRect.setAttribute('rx', '2')
        indicatorRect.style.cursor = 'pointer'

        // Hover effect
        indicatorRect.addEventListener('mouseenter', () => {
          indicatorRect.setAttribute('opacity', '0.9')
        })
        indicatorRect.addEventListener('mouseleave', () => {
          indicatorRect.setAttribute('opacity', '0.7')
        })

        // Click to remove column from this group
        indicatorRect.addEventListener('click', () => {
          // Find which group this column currently belongs to
          const currentGroup = categoryGroups.find(g => g.columnIds.includes(indicator.columnId))
          if (currentGroup && currentGroup.id === groupBar.id) {
            // Remove from current group
            updateCategoryGroup(groupBar.id, {
              columnIds: groupBar.columnIds.filter(id => id !== indicator.columnId)
            })
          }
        })

        g.appendChild(indicatorRect)
      })

      // Render clickable areas for columns NOT in this group
      layout.columns.forEach((column) => {
        if (!groupBar.columnIds.includes(column.id)) {
          const emptyRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          emptyRect.setAttribute('x', column.x.toString())
          emptyRect.setAttribute('y', groupBar.y.toString())
          emptyRect.setAttribute('width', column.width.toString())
          emptyRect.setAttribute('height', groupBar.height.toString())
          emptyRect.setAttribute('fill', 'transparent')
          emptyRect.setAttribute('stroke', '#d1d5db')
          emptyRect.setAttribute('stroke-width', '1')
          emptyRect.setAttribute('stroke-dasharray', '2,2')
          emptyRect.setAttribute('class', 'group-column-empty')
          emptyRect.setAttribute('rx', '2')
          emptyRect.style.cursor = 'pointer'

          // Hover effect
          emptyRect.addEventListener('mouseenter', () => {
            emptyRect.setAttribute('fill', groupBar.color)
            emptyRect.setAttribute('opacity', '0.3')
          })
          emptyRect.addEventListener('mouseleave', () => {
            emptyRect.setAttribute('fill', 'transparent')
            emptyRect.setAttribute('opacity', '1')
          })

          // Click to add column to this group
          emptyRect.addEventListener('click', () => {
            // Find which group this column currently belongs to
            const currentGroup = categoryGroups.find(g => g.columnIds.includes(column.id))
            if (currentGroup) {
              // Move from current group to this group
              moveColumnToGroup(column.id, currentGroup.id, groupBar.id)
            } else {
              // Add to this group (if not in any group)
              updateCategoryGroup(groupBar.id, {
                columnIds: [...groupBar.columnIds, column.id]
              })
            }
          })

          g.appendChild(emptyRect)
        }
      })
    })

    // Render "+ Add Group" button below the group bars
    if (layout.groupBars.length > 0) {
      const lastGroupBar = layout.groupBars[layout.groupBars.length - 1]
      const addBtnY = lastGroupBar.y + lastGroupBar.height + 3
      const addBtnHeight = 18 // Same as groupBarHeight
      const addBtnX = LINEAR_DIAGRAM_MARGIN.left
      const addBtnWidth = containerSize.width - LINEAR_DIAGRAM_MARGIN.left - LINEAR_DIAGRAM_MARGIN.right

      // Button group
      const addBtnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      addBtnGroup.setAttribute('class', 'add-group-btn-svg')
      addBtnGroup.style.cursor = 'pointer'

      // Rectangular button background
      const addBtnRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      addBtnRect.setAttribute('x', addBtnX.toString())
      addBtnRect.setAttribute('y', addBtnY.toString())
      addBtnRect.setAttribute('width', addBtnWidth.toString())
      addBtnRect.setAttribute('height', addBtnHeight.toString())
      addBtnRect.setAttribute('fill', '#3b82f6')
      addBtnRect.setAttribute('stroke', '#ffffff')
      addBtnRect.setAttribute('stroke-width', '1')
      addBtnRect.setAttribute('rx', '2')
      addBtnRect.style.opacity = '0.7'

      // Plus sign
      const addBtnText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      addBtnText.setAttribute('x', (addBtnX + addBtnWidth / 2).toString())
      addBtnText.setAttribute('y', (addBtnY + addBtnHeight / 2).toString())
      addBtnText.setAttribute('dy', '0.35em')
      addBtnText.setAttribute('text-anchor', 'middle')
      addBtnText.setAttribute('font-size', '14')
      addBtnText.setAttribute('font-weight', 'bold')
      addBtnText.setAttribute('fill', '#ffffff')
      addBtnText.style.pointerEvents = 'none'
      addBtnText.style.userSelect = 'none'
      addBtnText.textContent = '+'

      addBtnGroup.addEventListener('mouseenter', () => {
        addBtnRect.style.opacity = '1'
      })
      addBtnGroup.addEventListener('mouseleave', () => {
        addBtnRect.style.opacity = '0.7'
      })
      addBtnGroup.addEventListener('click', handleAddGroup)

      addBtnGroup.appendChild(addBtnRect)
      addBtnGroup.appendChild(addBtnText)
      g.appendChild(addBtnGroup)
    }

  }, [setVisualizationData, selectedScoringMetrics, categoryGroups, containerSize.width, containerSize.height, handleAddGroup])

  return (
    <div className="linear-set-diagram-container">
      {/* Horizontal Metric Selector */}
      <div className="linear-set-diagram__selector">
        <div className="linear-set-diagram__selector-inner">
          {SCORING_METRICS.map((metric) => {
            const isSelected = selectedScoringMetrics.includes(metric.id)
            return (
              <div key={metric.id} className="linear-set-diagram__metric-item">
                <input
                  type="checkbox"
                  id={`metric-${metric.id}`}
                  checked={isSelected}
                  onChange={() => toggleScoringMetric(metric.id)}
                  className="linear-set-diagram__checkbox"
                />
                <label
                  htmlFor={`metric-${metric.id}`}
                  className="linear-set-diagram__label"
                >
                  {metric.label}
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Linear Set Diagram */}
      {!setVisualizationData || selectedScoringMetrics.length === 0 ? (
        <div className="linear-set-diagram__empty">
          Select scoring metrics to view linear set diagram
        </div>
      ) : (
        <div ref={containerRef} className="linear-set-diagram__viz-container">
          <svg
            ref={svgRef}
            width={containerSize.width}
            height={containerSize.height}
            className="linear-set-diagram__svg"
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="linear-set-diagram__tooltip"
              style={{
                left: tooltip.x - 10,
                top: tooltip.y - 60
              }}
            >
              <div className="linear-set-diagram__tooltip-title">
                {tooltip.columnLabel}
              </div>
              <div className="linear-set-diagram__tooltip-subtitle">
                {formatCount(tooltip.featureCount)} features
              </div>
            </div>
          )}

          {/* Edit Group Dialog */}
          {editingGroupId && (
            <div
              className="linear-set-diagram__edit-dialog"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setEditingGroupId(null)
                }
              }}
            >
              <div className="linear-set-diagram__edit-dialog-content">
                <input
                  type="text"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateCategoryGroup(editingGroupId, { name: editingGroupName })
                      setEditingGroupId(null)
                    } else if (e.key === 'Escape') {
                      setEditingGroupId(null)
                    }
                  }}
                  autoFocus
                  className="linear-set-diagram__edit-input"
                />
                <div className="linear-set-diagram__edit-actions">
                  <button
                    onClick={() => {
                      updateCategoryGroup(editingGroupId, { name: editingGroupName })
                      setEditingGroupId(null)
                    }}
                    className="linear-set-diagram__edit-btn linear-set-diagram__edit-btn--save"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      removeCategoryGroup(editingGroupId)
                      setEditingGroupId(null)
                    }}
                    className="linear-set-diagram__edit-btn linear-set-diagram__edit-btn--delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
