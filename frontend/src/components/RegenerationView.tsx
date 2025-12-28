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
        {/* Empty placeholder for future content */}
      </div>
      <div className="regeneration-view__bottom">
        <SankeyDiagram
          flowDirection="left-to-right"
          panel="left"
        />
        <OverviewSummary />
      </div>
    </div>
  )
}

export default React.memo(RegenerationView)
