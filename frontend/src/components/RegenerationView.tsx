import React from 'react'
import SankeyDiagram from './SankeyDiagram'
import OverviewSummary from './OverviewSummary'
import '../styles/RegenerationView.css'

interface RegenerationViewProps {
  className?: string
}

const RegenerationView: React.FC<RegenerationViewProps> = ({ className = '' }) => {
  return (
    <div className={`regeneration-view ${className}`}>
      <div className="regeneration-view__top">
        <SankeyDiagram
          flowDirection="left-to-right"
          panel="left"
        />
        <OverviewSummary />
      </div>
      <div className="regeneration-view__bottom">
        {/* Placeholder for future content */}
      </div>
    </div>
  )
}

export default React.memo(RegenerationView)
