import React, { useRef, useEffect, useState } from 'react'
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
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!visible || !data || !tooltipRef.current) return

    const tooltip = tooltipRef.current
    const tooltipRect = tooltip.getBoundingClientRect()

    // Center the tooltip horizontally on the provided x coordinate
    let x = data.x - tooltipRect.width / 2
    let y = data.y

    // Adjust horizontal position to keep tooltip on screen
    if (x + tooltipRect.width > window.innerWidth - 10) {
      x = window.innerWidth - tooltipRect.width - 10
    }
    if (x < 10) {
      x = 10
    }

    // Position above the target element with some spacing
    y = y - tooltipRect.height - 10

    // If tooltip would go above viewport, position below instead
    if (y < 10) {
      y = data.y + 20
    }

    setPosition({ x, y })
  }, [data, visible])

  if (!visible || !data) return null

  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    pointerEvents: 'none',
    zIndex,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight: '1.4',
    maxWidth: '300px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(8px)',
    transition: 'opacity 150ms ease-out',
    opacity: visible ? 1 : 0
  }

  const titleStyle: React.CSSProperties = {
    fontWeight: '600',
    marginBottom: data.content.length > 0 ? '6px' : '0',
    fontSize: '14px',
    color: '#ffffff'
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '3px'
  }

  const labelStyle: React.CSSProperties = {
    color: '#cccccc',
    marginRight: '8px',
    fontWeight: '500'
  }

  const valueStyle: React.CSSProperties = {
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'right'
  }

  return (
    <div
      ref={tooltipRef}
      className={`tooltip ${className}`}
      style={baseStyle}
    >
      <div style={titleStyle}>{data.title}</div>
      {data.content.map((item: { label: string; value: string | number }, index: number) => (
        <div key={index} style={rowStyle}>
          <span style={labelStyle}>{item.label}:</span>
          <span style={valueStyle}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export default Tooltip