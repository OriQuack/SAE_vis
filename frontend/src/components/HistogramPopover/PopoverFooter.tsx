import React from 'react'
import { FOOTER_STYLES } from './utils/styles'
import type { MetricType, HistogramData } from '../../services/types'

interface PopoverFooterProps {
  metrics: string[]
  currentThresholds: Record<string, number | undefined>
  histogramData: Record<string, HistogramData> | null
  isSingleMetric: boolean
}

export const PopoverFooter: React.FC<PopoverFooterProps> = React.memo(({
  metrics,
  currentThresholds,
  histogramData,
  isSingleMetric
}) => {
  if (isSingleMetric) {
    return null
  }

  if (!histogramData || metrics.length <= 1) {
    return null
  }

  const combinedStyles = {
    ...FOOTER_STYLES.base,
    ...FOOTER_STYLES.multi
  }

  return (
    <div className="histogram-popover__footer" style={combinedStyles}>
      <div className="histogram-popover__multi-summary" style={FOOTER_STYLES.multiSummary}>
        {metrics.map((metric) => {
          const threshold = currentThresholds[metric]
          const metricData = histogramData[metric as MetricType]
          const defaultThreshold = metricData?.statistics.mean || 0.5
          const effectiveValue = threshold !== undefined ? threshold : defaultThreshold
          const isDefault = threshold === undefined

          return (
            <div key={metric} style={FOOTER_STYLES.metricItem}>
              <span style={FOOTER_STYLES.metricLabel}>
                {metric.replace('score_', '').replace('_', ' ')}:
              </span>
              <span style={FOOTER_STYLES.metricValue}>
                {effectiveValue.toFixed(3)}
              </span>
              {isDefault && (
                <span style={FOOTER_STYLES.metricDefault}>
                  (default)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

PopoverFooter.displayName = 'PopoverFooter'

export default PopoverFooter