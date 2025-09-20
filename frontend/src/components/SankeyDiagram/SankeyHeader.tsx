import React from 'react'
import { SankeyLegend } from './SankeyLegend'
import { SANKEY_COLORS } from './utils/constants'

interface SankeyHeaderProps {
  summary: {
    totalFeatures: number
    totalNodes: number
    totalLinks: number
    stages: number
  } | null
}

export const SankeyHeader: React.FC<SankeyHeaderProps> = React.memo(({ summary }) => {
  return (
    <div className="sankey-diagram__header">
      <div className="sankey-diagram__title-section">
        <h3 className="sankey-diagram__title">Feature Flow Analysis</h3>
        {summary && (
          <div className="sankey-diagram__summary">
            <span className="sankey-diagram__stat">
              {summary.totalFeatures.toLocaleString()} features
            </span>
            <span className="sankey-diagram__stat">
              {summary.stages} stages
            </span>
            <span className="sankey-diagram__stat">
              {summary.totalNodes} categories
            </span>
          </div>
        )}
      </div>
      <SankeyLegend colors={SANKEY_COLORS} />
    </div>
  )
})

SankeyHeader.displayName = 'SankeyHeader'