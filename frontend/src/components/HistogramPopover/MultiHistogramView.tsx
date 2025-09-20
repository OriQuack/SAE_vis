import React from 'react'
import { HISTOGRAM_COLORS } from '../../utils/d3-helpers'
import type { TooltipData, HistogramData, MultiHistogramLayout, MetricType } from '../../services/types'
import { IndividualHistogram } from './IndividualHistogram'
import { CHART_STYLES } from './utils/styles'

interface MultiHistogramViewProps {
  layout: MultiHistogramLayout
  histogramData: Record<string, HistogramData>
  currentThresholds: Record<string, number | undefined>
  animationDuration: number
  containerSize: { width: number; height: number }
  onThresholdChange: (metric: string, threshold: number) => void
  onTooltipChange: (tooltip: TooltipData | null, visible: boolean) => void
  svgRef: React.RefObject<SVGSVGElement>
  allNodeThresholds: Record<string, any>
  thresholdNodeId: string
}

export const MultiHistogramView: React.FC<MultiHistogramViewProps> = React.memo(({
  layout,
  histogramData,
  currentThresholds,
  animationDuration,
  containerSize,
  onThresholdChange,
  onTooltipChange,
  svgRef,
  allNodeThresholds,
  thresholdNodeId
}) => {
  return (
    <div className="histogram-popover__chart" style={CHART_STYLES.container}>
      <svg
        ref={svgRef}
        width={containerSize.width - 16}
        height={layout.totalHeight}
        className="histogram-popover__svg"
        style={CHART_STYLES.svg}
      >
        {/* Background */}
        <rect
          width={containerSize.width - 16}
          height={layout.totalHeight}
          fill={HISTOGRAM_COLORS.background}
        />

        {/* Render individual histograms */}
        {layout.charts.map((chartLayout) => {
          const metric = chartLayout.metric
          const metricData = histogramData[metric as MetricType]
          const threshold = currentThresholds[metric] || metricData?.statistics.mean || 0.5

          // Debug logging
          console.log(`Rendering ${metric}: threshold=${threshold}, from currentThresholds=${currentThresholds[metric]}, nodeThresholds=`, allNodeThresholds[thresholdNodeId])

          if (!metricData) return null

          return (
            <IndividualHistogram
              key={metric}
              layout={chartLayout}
              histogramData={metricData}
              threshold={threshold}
              animationDuration={animationDuration}
              onThresholdChange={onThresholdChange}
              onTooltipChange={onTooltipChange}
              parentSvgRef={svgRef}
            />
          )
        })}
      </svg>
    </div>
  )
})

MultiHistogramView.displayName = 'MultiHistogramView'

export default MultiHistogramView