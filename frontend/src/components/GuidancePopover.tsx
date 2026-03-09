import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import '../styles/GuidancePopover.css'

interface GuidancePopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  message: string
  onDismiss: () => void
  position?: 'below' | 'above'
}

export function GuidancePopover({ anchorRef, message, onDismiss, position = 'below' }: GuidancePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // Position relative to anchor
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const popoverWidth = 240
    setCoords({
      top: position === 'below' ? rect.bottom + 8 : rect.top - 8,
      left: Math.max(8, rect.left + rect.width / 2 - popoverWidth / 2)
    })
  }, [anchorRef, position])

  // Click-outside dismissal
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      onDismiss()
    }
  }, [onDismiss])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  if (!coords) return null

  return (
    <div
      ref={popoverRef}
      className={`guidance-popover guidance-popover--${position}`}
      style={{ top: coords.top, left: coords.left }}
    >
      <div className="guidance-popover__arrow" />
      <div className="guidance-popover__content">
        <button className="guidance-popover__dismiss" onClick={onDismiss} aria-label="Dismiss">✕</button>
        <span className="guidance-popover__message"><span className="guidance-popover__icon">💡</span>{message}</span>
      </div>
    </div>
  )
}

export default GuidancePopover
