/**
 * Application configuration constants
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8003',
  TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
} as const

// Visualization Configuration
export const VIZ_CONFIG = {
  SANKEY: {
    NODE_WIDTH: 15,
    NODE_PADDING: 10,
    MIN_LINK_WIDTH: 1,
    MAX_LINK_WIDTH: 50,
    ANIMATION_DURATION: 300,
    COLORS: {
      ROOT: '#1f2937',
      SPLITTING: '#3b82f6',
      SEMANTIC: '#10b981',
      SCORE: '#f59e0b',
      LINK: '#9ca3af'
    }
  },
  HISTOGRAM: {
    DEFAULT_BINS: 20,
    MIN_BINS: 5,
    MAX_BINS: 50,
    HEIGHT: 200,
    WIDTH: 400,
    MARGIN: { top: 20, right: 20, bottom: 40, left: 40 },
    COLORS: {
      PRIMARY: '#3b82f6',
      SECONDARY: '#e5e7eb',
      THRESHOLD: '#ef4444'
    }
  },
  THRESHOLD: {
    DEBOUNCE_DELAY: 300,
    MIN_VALUE: 0,
    MAX_VALUE: 1,
    STEP: 0.01,
    PRECISION: 3
  }
} as const

// UI Configuration
export const UI_CONFIG = {
  TRANSITION_DURATION: 200,
  POPOVER_Z_INDEX: 1000,
  MODAL_Z_INDEX: 2000,
  TOOLTIP_DELAY: 500,
  ERROR_DISPLAY_DURATION: 5000,
  SUCCESS_DISPLAY_DURATION: 3000
} as const

// Feature Flags
export const FEATURES = {
  ENABLE_COMPARISON_VIEW: false,
  ENABLE_DEBUG_VIEW: false,
  ENABLE_EXPORT: false,
  ENABLE_ADVANCED_FILTERS: false,
  SHOW_PERFORMANCE_METRICS: process.env.NODE_ENV === 'development'
} as const

// Validation Rules
export const VALIDATION = {
  FILTER: {
    MIN_SELECTION: 0,
    MAX_SELECTION: 100
  },
  THRESHOLD: {
    SEMDIST_MIN: 0,
    SEMDIST_MAX: 1,
    SCORE_MIN: 0,
    SCORE_MAX: 1
  }
} as const

// Performance Configuration
export const PERFORMANCE = {
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 100,
  MAX_CACHE_SIZE: 100,
  MAX_CACHE_AGE: 10 * 60 * 1000, // 10 minutes
  VIRTUAL_SCROLL_BUFFER: 5,
  BATCH_SIZE: 50
} as const