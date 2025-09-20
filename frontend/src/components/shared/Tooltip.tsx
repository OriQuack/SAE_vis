import React from 'react'
import type { TooltipData } from '../../services/types'

// ============================================================================
// TYPES
// ============================================================================

interface TooltipProps {
  data: TooltipData | null
  visible: boolean
  className?: string
  zIndex?: number
}

// ============================================================================
// SHARED TOOLTIP COMPONENT
// ============================================================================

export const Tooltip: React.FC<TooltipProps> = ({
  data,
  visible,
  className = '',
  zIndex = 1000
}) => {
  if (!visible || !data) return null

  return (
    <div
      className={`tooltip ${className}`}
      style={{
        position: 'absolute',
        left: data.x + 10,
        top: data.y - 10,
        transform: 'translateY(-100%)',
        pointerEvents: 'none',
        zIndex
      }}
    >
      <div className="tooltip__content">
        <div className="tooltip__title">{data.title}</div>
        <div className="tooltip__body">
          {data.content.map((item: { label: string; value: string | number }, index: number) => (
            <div key={index} className="tooltip__row">
              <span className="tooltip__label">{item.label}:</span>
              <span className="tooltip__value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Tooltip