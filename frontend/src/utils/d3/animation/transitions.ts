// Animation and transition utilities

import type { AnimationConfig } from '../shared'

/**
 * Apply CSS transition to SVG element
 * @param element - SVG element to animate
 * @param config - Animation configuration
 */
export function createTransition(element: SVGElement, config: AnimationConfig): void {
  element.style.transition = `all ${config.duration}ms ${config.easing}`
}