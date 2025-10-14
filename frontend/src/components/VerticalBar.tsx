import React from 'react'
import '../styles/VerticalBar.css'

// ============================================================================
// TYPES
// ============================================================================

interface VerticalBarProps {
  className?: string
}

// ============================================================================
// VERTICAL BAR COMPONENT
// ============================================================================

/**
 * VerticalBar Component
 *
 * A thin vertical separator panel positioned between the control column (left)
 * and visualization column (right). This component serves as a visual separator
 * and can be enhanced in the future for interactive features such as:
 * - Panel resizing (drag to adjust column widths)
 * - Quick action buttons
 * - Visual indicators
 *
 * Current implementation: Simple visual separator with consistent styling
 */
const VerticalBar: React.FC<VerticalBarProps> = ({ className = '' }) => {
  return (
    <div className={`vertical-bar${className ? ` ${className}` : ''}`}>
      <div className="vertical-bar__content">
        {/* Future enhancement: Add interactive elements here */}
      </div>
    </div>
  )
}

export default VerticalBar
