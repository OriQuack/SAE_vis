// Slider-specific constants

// Slider track dimensions and styling
export const SLIDER_TRACK = {
  height: 6,
  yOffset: 30,  // Distance below x-axis labels
  cornerRadius: 3
} as const

// Default snapping configuration
export const SLIDER_SNAP_CONFIG = {
  defaultTickCount: 10,
  snapThreshold: 0.05  // 5% of range for snap sensitivity
} as const