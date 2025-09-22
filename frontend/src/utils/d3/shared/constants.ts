// Shared constants for d3 utilities

import type { AnimationConfig } from './types'

// Default animation configuration
export const DEFAULT_ANIMATION: AnimationConfig = {
  duration: 300,
  easing: 'ease-out'
} as const

// Common dimension constraints
export const MIN_DIMENSIONS = {
  width: 200,
  height: 150
} as const

// Common color values used across modules
export const COMMON_COLORS = {
  background: '#f8fafc',
  grid: '#e2e8f0',
  text: '#374151',
  axis: '#6b7280',
  primary: '#3b82f6',
  success: '#10b981',
  neutral: '#6b7280'
} as const