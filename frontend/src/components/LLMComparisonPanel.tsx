import React from 'react'
import { LLMComparisonVisualization } from './LLMComparisonVisualization'
import { LLMComparisonSelection } from './LLMComparisonSelection'
import '../styles/LLMComparisonPanel.css'

interface LLMComparisonPanelProps {
  className?: string
}

export const LLMComparisonPanel: React.FC<LLMComparisonPanelProps> = ({ className = '' }) => {
  return (
    <div className={`llm-comparison-panel ${className}`}>
      <div className="llm-comparison-panel__visualization">
        <LLMComparisonVisualization />
      </div>
      <div className="llm-comparison-panel__selection">
        <LLMComparisonSelection />
      </div>
    </div>
  )
}

export default LLMComparisonPanel
