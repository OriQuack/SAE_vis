import React from 'react'
import { useVisualizationStore } from '../../stores/store'
import { DEFAULT_ANIMATION } from '../../utils/d3-helpers'
import { ErrorMessage } from '../shared/ErrorMessage'
import { SankeyNode } from './SankeyDiagram/SankeyNode'
import { SankeyLink } from './SankeyDiagram/SankeyLink'
import { useSankeyLayout } from './SankeyDiagram/hooks/useSankeyLayout'
import { useSankeyInteractions } from './SankeyDiagram/hooks/useSankeyInteractions'
import { useThresholdGroups } from './SankeyDiagram/hooks/useThresholdGroups'


interface SankeyDiagramProps {
  width?: number
  height?: number
  className?: string
  animationDuration?: number
  showHistogramOnClick?: boolean
}


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

  // Use custom hooks for layout calculation and validation
  const { layout, validationErrors, isValid } = useSankeyLayout({
    data: displayData,
    containerSize: { width, height }
  })

  // Use custom hooks for interactions
  const {
    containerSize,
    containerRef,
    handleNodeHover,
    handleLinkHover,
    handleHoverLeave,
    handleNodeHistogramClick,
    handleLinkHistogramClick
  } = useSankeyInteractions({
    data: displayData,
    showHistogramOnClick,
    showHistogramPopover,
    defaultWidth: width,
    defaultHeight: height
  })

  // Use custom hook for threshold groups
  const { allNodeThresholdGroups } = useThresholdGroups({
    data: displayData,
    layout,
    getNodesInSameThresholdGroup
  })


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

          {/* Subtle loading overlay when updating */}
          {isUpdating && (
            <div
              className="sankey-diagram__updating-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                pointerEvents: 'none'
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Updating...
              </div>
            </div>
          )}
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