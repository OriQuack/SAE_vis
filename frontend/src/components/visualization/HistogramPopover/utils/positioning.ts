// ============================================================================
// POSITIONING UTILITIES
// ============================================================================

export interface PopoverPosition {
  x: number
  y: number
  transform: string
  placement: 'top' | 'bottom' | 'left' | 'right'
}

export interface ResponsiveSize {
  width: number
  height: number
}

export function calculateOptimalPosition(
  clickPosition: { x: number, y: number },
  popoverSize: { width: number, height: number },
  margin: number = 20
): PopoverPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  // Use fixed right positioning for histogram popovers
  let placement: PopoverPosition['placement'] = 'right'
  let x = clickPosition.x
  let y = clickPosition.y
  let transform = 'translate(0%, -50%)'

  // Ensure the popover fits vertically on screen
  const halfHeight = popoverSize.height / 2
  if (y - halfHeight < margin) {
    y = halfHeight + margin
    transform = 'translate(0%, -50%)'
  } else if (y + halfHeight > viewport.height - margin) {
    y = viewport.height - halfHeight - margin
    transform = 'translate(0%, -50%)'
  }

  // Ensure the popover fits horizontally on screen
  if (x + popoverSize.width > viewport.width - margin) {
    x = viewport.width - popoverSize.width - margin
    transform = 'translate(0%, -50%)'
  }

  return { x, y, transform, placement }
}

export function calculateResponsiveSize(
  defaultWidth: number,
  defaultHeight: number,
  metricsCount: number = 1
): ResponsiveSize {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }

  const adjustedHeight = metricsCount > 1 ? defaultHeight + ((metricsCount - 1) * 260) : defaultHeight

  const maxWidth = Math.min(defaultWidth, viewport.width * 0.9)
  const maxHeight = Math.min(adjustedHeight, viewport.height * 0.85)

  const minWidth = Math.max(420, maxWidth)
  const minHeight = Math.max(280, maxHeight)

  return {
    width: minWidth,
    height: minHeight
  }
}