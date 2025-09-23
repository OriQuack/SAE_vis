import React from 'react'
import { LEGEND_ITEMS, SANKEY_COLORS } from './utils/constants'

interface SankeyLegendProps {
  colors: typeof SANKEY_COLORS
}

export const SankeyLegend: React.FC<SankeyLegendProps> = React.memo(({ colors }) => {
  return (
    <div className="sankey-legend">
      <div className="sankey-legend__title">Categories</div>
      <div className="sankey-legend__items">
        {LEGEND_ITEMS.map(({ key, label }) => (
          <div key={key} className="sankey-legend__item">
            <div
              className="sankey-legend__color"
              style={{ backgroundColor: colors[key] }}
            />
            <span className="sankey-legend__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

SankeyLegend.displayName = 'SankeyLegend'

export default SankeyLegend