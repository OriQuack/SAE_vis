import React, { useCallback } from 'react'
import { HEADER_STYLES } from './utils/styles'

interface PopoverHeaderProps {
  nodeName: string
  parentNodeName?: string
  metrics: string[]
  onClose: () => void
}

export const PopoverHeader: React.FC<PopoverHeaderProps> = React.memo(({
  nodeName,
  parentNodeName,
  metrics,
  onClose
}) => {
  const handleCloseMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    Object.assign(e.currentTarget.style, HEADER_STYLES.closeButtonHover)
  }, [])

  const handleCloseMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent'
    e.currentTarget.style.color = '#6b7280'
  }, [])

  const formatMetricText = (metrics: string[]) => {
    if (metrics.length === 1) {
      return metrics[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
    return `${metrics.length} Score Metrics`
  }

  return (
    <div className="histogram-popover__header" style={HEADER_STYLES.container}>
      <div className="histogram-popover__title-section" style={HEADER_STYLES.titleSection}>
        <h4 className="histogram-popover__title" style={HEADER_STYLES.title}>
          {nodeName}
        </h4>
        {parentNodeName && (
          <span className="histogram-popover__parent" style={HEADER_STYLES.parent}>
            Thresholds for: {parentNodeName}
          </span>
        )}
        <span className="histogram-popover__metric" style={HEADER_STYLES.metric}>
          {formatMetricText(metrics)}
        </span>
      </div>
      <button
        className="histogram-popover__close"
        onClick={onClose}
        aria-label="Close histogram popover"
        style={HEADER_STYLES.closeButton}
        onMouseEnter={handleCloseMouseEnter}
        onMouseLeave={handleCloseMouseLeave}
      >
        ×
      </button>
    </div>
  )
})

PopoverHeader.displayName = 'PopoverHeader'

export default PopoverHeader