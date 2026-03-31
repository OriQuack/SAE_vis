import React from 'react'
import '../styles/Tooltip.css'

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================
// Reusable tooltip component with composition pattern for flexible content.
// Based on the CauseMarginHistogram tooltip style.
//
// Usage:
// <Tooltip position={tooltipPosition}>
//   <Tooltip.Header>Title</Tooltip.Header>
//   <Tooltip.Summary>Total: 10 items</Tooltip.Summary>
//   <Tooltip.Row color="#ff0000">Label: 5</Tooltip.Row>
// </Tooltip>
// ============================================================================

interface TooltipProps {
  /** Position for the tooltip (x, y in viewport coordinates). If null, tooltip is hidden. */
  position: { x: number; y: number } | null
  /** Horizontal offset from position (default: 10) */
  offsetX?: number
  /** Vertical offset from position (default: -10) */
  offsetY?: number
  /** Center tooltip horizontally on position.x (default: false) */
  centered?: boolean
  /** Hide the arrow indicator (default: false) */
  hideArrow?: boolean
  /** Position tooltip above the cursor (default: false) */
  above?: boolean
  /** Content to render inside the tooltip */
  children: React.ReactNode
}

/**
 * Main Tooltip component - renders a positioned tooltip container
 */
const TooltipBase: React.FC<TooltipProps> = ({
  position,
  offsetX = 10,
  offsetY = -12,
  centered = false,
  hideArrow = false,
  above = false,
  children
}) => {
  if (!position) return null

  const transform = [
    centered ? 'translateX(-50%)' : '',
    above ? 'translateY(-100%)' : ''
  ].filter(Boolean).join(' ') || undefined

  return (
    <div
      className="tooltip"
      style={{
        left: position.x + offsetX,
        top: position.y + offsetY,
        ...(transform ? { transform } : {})
      }}
    >
      {!hideArrow && <span className="tooltip__arrow" />}
      {children}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface HeaderProps {
  children: React.ReactNode
}

/**
 * Tooltip.Header - Bold header text (typically for range/title)
 */
const Header: React.FC<HeaderProps> = ({ children }) => (
  <div className="tooltip__header">{children}</div>
)

interface SummaryProps {
  children: React.ReactNode
  /** Show the bottom border separator (default: true) */
  showSeparator?: boolean
}

/**
 * Tooltip.Summary - Summary line with optional bottom border separator
 */
const Summary: React.FC<SummaryProps> = ({ children, showSeparator = true }) => (
  <div className={`tooltip__summary${showSeparator ? '' : ' tooltip__summary--no-separator'}`}>{children}</div>
)

interface RowProps {
  /** Color for the swatch */
  color: string
  /** Content to display next to the swatch */
  children: React.ReactNode
  /** Use striped pattern for auto/predicted items (default: false) */
  striped?: boolean
}

/**
 * Tooltip.Row - Category row with color swatch and content
 */
const Row: React.FC<RowProps> = ({ color, children, striped = false }) => (
  <div className="tooltip__row">
    <span
      className={`tooltip__swatch${striped ? ' tooltip__swatch--striped' : ''}`}
      style={striped ? { '--swatch-color': color } as React.CSSProperties : { backgroundColor: color }}
    />
    <span>{children}</span>
  </div>
)

// ============================================================================
// COMPOSE TOOLTIP WITH SUB-COMPONENTS
// ============================================================================

type TooltipType = React.FC<TooltipProps> & {
  Header: typeof Header
  Summary: typeof Summary
  Row: typeof Row
}

export const Tooltip: TooltipType = Object.assign(TooltipBase, {
  Header,
  Summary,
  Row
})

// ============================================================================
// DATA-TOOLTIP LAYER — Global event-delegated tooltip for [data-tooltip] elements
// ============================================================================
// Mount once in App.tsx. Uses mouseover/mousemove/mouseout on document to
// detect hover on any [data-tooltip] element and renders a positioned Tooltip.
// ============================================================================

export const DataTooltipLayer: React.FC = () => {
  const [state, setState] = React.useState<{ text: string; title?: string; html?: boolean; x: number; y: number; below?: boolean } | null>(null)
  const activeRef = React.useRef(false)
  const layerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const findTooltipTarget = (e: Event): HTMLElement | null =>
      (e.target as HTMLElement)?.closest?.('[data-tooltip],[data-tooltip-html],[data-tooltip-title]') as HTMLElement | null

    const onOver = (e: MouseEvent) => {
      const target = findTooltipTarget(e)
      if (target) {
        activeRef.current = true
        const htmlContent = target.getAttribute('data-tooltip-html')
        const textContent = target.getAttribute('data-tooltip')
        const titleContent = target.getAttribute('data-tooltip-title') || undefined
        const below = target.hasAttribute('data-tooltip-below')
        const text = htmlContent || textContent
        if (!text && !titleContent) return
        if (below) {
          const rect = target.getBoundingClientRect()
          setState({ text: text || '', title: titleContent, html: !!htmlContent, x: rect.left + rect.width / 2, y: rect.bottom, below: true })
        } else {
          setState({ text: text || '', title: titleContent, html: !!htmlContent, x: e.clientX, y: e.clientY })
        }
      }
    }

    const onMove = (e: MouseEvent) => {
      if (activeRef.current) {
        setState(prev => prev ? (prev.below ? prev : { ...prev, x: e.clientX, y: e.clientY }) : null)
      }
    }

    const onOut = (e: MouseEvent) => {
      const target = findTooltipTarget(e)
      if (target) {
        const related = e.relatedTarget as HTMLElement | null
        if (!target.contains(related)) {
          activeRef.current = false
          setState(null)
        }
      }
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseout', onOut)
    }
  }, [])

  // Auto-flip tooltip when it overflows the viewport
  React.useLayoutEffect(() => {
    const el = layerRef.current?.querySelector('.tooltip') as HTMLElement | null
    if (!el || !state || state.below) return
    const rect = el.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${state.y - rect.height - 8}px`
    }
    if (rect.right > window.innerWidth) {
      el.style.left = `${state.x - rect.width - 8}px`
    }
  })

  if (!state) return null

  return (
    <div className="data-tooltip-layer" ref={layerRef}>
      <Tooltip position={{ x: state.x, y: state.y }} offsetX={state.below ? 0 : 12} offsetY={state.below ? 6 : -12} centered={state.below} hideArrow={state.below}>
        {state.title && <Tooltip.Header>{state.title}</Tooltip.Header>}
        {state.text && (
          <Tooltip.Summary showSeparator={false}>
            {state.html
              ? <span dangerouslySetInnerHTML={{ __html: state.text }} />
              : state.text}
          </Tooltip.Summary>
        )}
      </Tooltip>
    </div>
  )
}

export default Tooltip
