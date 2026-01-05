import React from 'react'
import '../styles/StatusPanel.css'

// ============================================================================
// STATUS PANEL - Full width status bar below view header
// ============================================================================

interface StatusPanelProps {
  className?: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({ className = '' }) => {
  return (
    <div className={`status-panel ${className}`}>
      <span className="status-panel__placeholder">Status placeholder</span>
    </div>
  )
}

export default React.memo(StatusPanel)
