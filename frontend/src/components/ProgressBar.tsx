import React from 'react'
import '../styles/ProgressBar.css'

interface ProgressBarProps {
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ className = '' }) => {
  return (
    <div className={`progress-bar ${className}`}>
      <div className="progress-bar__placeholder">
        <p>Linear Set Visualization</p>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Feature overlap visualization will be displayed here
        </p>
      </div>
    </div>
  )
}

export default ProgressBar
