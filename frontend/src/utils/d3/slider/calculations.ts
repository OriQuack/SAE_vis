// Slider calculation utilities

import { SLIDER_SNAP_CONFIG } from './constants'

/**
 * Convert value to position along slider track
 * @param value - Current value
 * @param min - Minimum value
 * @param max - Maximum value
 * @param width - Track width in pixels
 * @returns Position in pixels
 */
export function valueToPosition(value: number, min: number, max: number, width: number): number {
  if (max === min) return 0
  return ((value - min) / (max - min)) * width
}

/**
 * Convert position to value along slider track
 * @param position - Position in pixels
 * @param min - Minimum value
 * @param max - Maximum value
 * @param width - Track width in pixels
 * @returns Clamped value
 */
export function positionToValue(position: number, min: number, max: number, width: number): number {
  if (width === 0) return min
  const ratio = Math.max(0, Math.min(1, position / width))
  return min + ratio * (max - min)
}

/**
 * Snap value to nearest tick mark
 * @param value - Current value
 * @param min - Minimum value
 * @param max - Maximum value
 * @param tickCount - Number of tick marks (default: 10)
 * @returns Snapped value
 */
export function snapToNearestTick(
  value: number,
  min: number,
  max: number,
  tickCount: number = SLIDER_SNAP_CONFIG.defaultTickCount
): number {
  if (max === min || tickCount <= 0) return value

  const tickSize = (max - min) / tickCount
  const tickIndex = Math.round((value - min) / tickSize)
  return Math.max(min, Math.min(max, min + tickIndex * tickSize))
}

/**
 * Check if value should snap to tick
 * @param value - Current value
 * @param min - Minimum value
 * @param max - Maximum value
 * @param tickCount - Number of tick marks
 * @param threshold - Snap threshold as percentage of range (default: 5%)
 * @returns Whether value should snap
 */
export function shouldSnapToTick(
  value: number,
  min: number,
  max: number,
  tickCount: number = SLIDER_SNAP_CONFIG.defaultTickCount,
  threshold: number = SLIDER_SNAP_CONFIG.snapThreshold
): boolean {
  if (max === min || tickCount <= 0) return false

  const range = max - min
  const snapDistance = range * threshold
  const snappedValue = snapToNearestTick(value, min, max, tickCount)

  return Math.abs(value - snappedValue) <= snapDistance
}