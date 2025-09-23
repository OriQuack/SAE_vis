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

  const spaceTop = clickPosition.y
  const spaceBottom = viewport.height - clickPosition.y
  const spaceLeft = clickPosition.x

  let placement: PopoverPosition['placement'] = 'bottom'
  let x = clickPosition.x
  let y = clickPosition.y
  let transform = ''

  if (spaceTop >= popoverSize.height + margin) {
    placement = 'top'
    y = clickPosition.y - margin
    transform = 'translate(-50%, -100%)'
  }
  else if (spaceBottom >= popoverSize.height + margin) {
    placement = 'bottom'
    y = clickPosition.y + margin
    transform = 'translate(-50%, 0%)'
  }
  else if (spaceLeft >= popoverSize.width + margin) {
    placement = 'left'
    x = clickPosition.x - margin
    y = clickPosition.y
    transform = 'translate(-100%, -50%)'
  }
  else {
    placement = 'right'
    x = clickPosition.x + margin
    y = clickPosition.y
    transform = 'translate(0%, -50%)'
  }

  if (placement === 'top' || placement === 'bottom') {
    const halfWidth = popoverSize.width / 2
    if (x - halfWidth < margin) {
      x = halfWidth + margin
    } else if (x + halfWidth > viewport.width - margin) {
      x = viewport.width - halfWidth - margin
    }
  }

  if (placement === 'left' || placement === 'right') {
    const halfHeight = popoverSize.height / 2
    if (y - halfHeight < margin) {
      y = halfHeight + margin
    } else if (y + halfHeight > viewport.height - margin) {
      y = viewport.height - halfHeight - margin
    }
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