import React, { useMemo } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import { DEFAULT_ANIMATION } from '../utils/d3-helpers'
import { Tooltip } from '../components/shared/Tooltip'
import { ErrorMessage } from '../components/shared/ErrorMessage'
import { SankeyHeader } from './SankeyDiagram/SankeyHeader'
import { SankeyNode } from './SankeyDiagram/SankeyNode'
import { SankeyLink } from './SankeyDiagram/SankeyLink'
import { SankeyStageLabels } from './SankeyDiagram/SankeyStageLabels'
import { useSankeyLayout } from './SankeyDiagram/hooks/useSankeyLayout'
import { useSankeyInteractions } from './SankeyDiagram/hooks/useSankeyInteractions'
import { useThresholdGroups } from './SankeyDiagram/hooks/useThresholdGroups'


interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showTooltips?: boolean
  showHistogramOnClick?: boolean
}


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

  // Use custom hooks for layout calculation and validation
  const { layout, validationErrors, isValid } = useSankeyLayout({
    data,
    containerSize: { width, height }
  })

  // Use custom hooks for interactions
  const {
    tooltip,
    showTooltip,
    containerSize,
    containerRef,
    handleNodeHover,
    handleLinkHover,
    handleHoverLeave,
    handleNodeHistogramClick,
    handleLinkHistogramClick
  } = useSankeyInteractions({
    data,
    showTooltips,
    showHistogramOnClick,
    showHistogramPopover,
    defaultWidth: width,
    defaultHeight: height
  })

  // Use custom hook for threshold groups
  const { allNodeThresholdGroups } = useThresholdGroups({
    data,
    layout,
    getNodesInSameThresholdGroup
  })

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
      <SankeyHeader summary={summary} />

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

      {/* Loading state */}
      {loading && (
        <div className="sankey-diagram__loading">
          <div className="sankey-diagram__loading-spinner" />
          <span>Loading Sankey diagram...</span>
        </div>
      )}

      {/* Main visualization */}
      {layout && data && !loading && !error && isValid && (
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

              {/* Stage labels */}
              <SankeyStageLabels nodes={layout.nodes} />
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