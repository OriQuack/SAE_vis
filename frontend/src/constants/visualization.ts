/**
 * Centralized visualization configuration constants
 */

export const VIZ_CONFIG = {
  // Sankey diagram configuration
  SANKEY: {
    NODE_WIDTH: 15,
    NODE_PADDING: 10,
    LINK_OPACITY: 0.5,
    LINK_HOVER_OPACITY: 0.8,
    ANIMATION_DURATION: 300,
    COLORS: {
      NODES: {
        SOURCE: '#3b82f6',      // Blue
        INTERMEDIATE: '#8b5cf6', // Purple
        TARGET: '#10b981'       // Green
      },
      LINKS: {
        DEFAULT: '#94a3b8',
        HOVER: '#64748b',
        SELECTED: '#3b82f6'
      }
    },
    TOOLTIP: {
      OFFSET_X: 10,
      OFFSET_Y: -10,
      MAX_WIDTH: 300
    }
  },

  // Histogram configuration
  HISTOGRAM: {
    DEFAULT_BINS: 20,
    MIN_BINS: 10,
    MAX_BINS: 50,
    DEBOUNCE_DELAY: 300,
    ANIMATION_DURATION: 200,
    COLORS: {
      BAR: '#3b82f6',
      BAR_HOVER: '#2563eb',
      THRESHOLD_LINE: '#ef4444',
      THRESHOLD_AREA: 'rgba(239, 68, 68, 0.1)',
      AXIS: '#64748b',
      GRID: '#e2e8f0'
    },
    MARGINS: {
      TOP: 20,
      RIGHT: 20,
      BOTTOM: 40,
      LEFT: 50
    },
    AXIS: {
      TICK_SIZE: 5,
      TICK_PADDING: 8,
      LABEL_OFFSET: 35
    }
  },

  // Filter panel configuration
  FILTERS: {
    DROPDOWN: {
      MAX_HEIGHT: 300,
      ITEM_HEIGHT: 36,
      SEARCH_DEBOUNCE: 200
    },
    ANIMATION_DURATION: 150
  },

  // Performance thresholds
  PERFORMANCE: {
    RENDER_WARNING_THRESHOLD: 100, // ms
    API_TIMEOUT: 30000, // ms
    CACHE_SIZE: 100,
    CACHE_TTL: 900000, // 15 minutes
    ENABLE_LOGGING: import.meta.env.DEV
  },

  // Layout configuration
  LAYOUT: {
    SIDEBAR_WIDTH: 320,
    MIN_CONTENT_WIDTH: 600,
    BREAKPOINTS: {
      MOBILE: 640,
      TABLET: 768,
      DESKTOP: 1024,
      WIDE: 1280
    },
    SPACING: {
      XS: 4,
      SM: 8,
      MD: 16,
      LG: 24,
      XL: 32
    }
  },

  // Animation configuration
  ANIMATION: {
    DEFAULT_DURATION: 300,
    FAST: 150,
    SLOW: 500,
    EASING: {
      DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
      EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
      EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      SPRING: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }
  },

  // Threshold configuration
  THRESHOLDS: {
    SEMDIST_MEAN: {
      MIN: 0,
      MAX: 1,
      DEFAULT: 0.5,
      STEP: 0.01,
      PRECISION: 2
    },
    SCORE_HIGH: {
      MIN: 0,
      MAX: 1,
      DEFAULT: 0.5,
      STEP: 0.01,
      PRECISION: 2
    }
  },

  // Error messages
  ERRORS: {
    GENERIC: 'An unexpected error occurred. Please try again.',
    API_TIMEOUT: 'Request timed out. Please check your connection.',
    INVALID_DATA: 'Received invalid data from server.',
    INSUFFICIENT_DATA: 'Not enough data to generate visualization.',
    NETWORK: 'Network error. Please check your connection.'
  },

  // Success messages
  SUCCESS: {
    DATA_LOADED: 'Data loaded successfully',
    FILTERS_APPLIED: 'Filters applied',
    THRESHOLD_UPDATED: 'Threshold updated'
  }
} as const

// Type exports for type safety
export type VizConfig = typeof VIZ_CONFIG
export type SankeyConfig = typeof VIZ_CONFIG.SANKEY
export type HistogramConfig = typeof VIZ_CONFIG.HISTOGRAM
export type FilterConfig = typeof VIZ_CONFIG.FILTERS
export type LayoutConfig = typeof VIZ_CONFIG.LAYOUT

// Helper functions
export const getResponsiveValue = (width: number) => {
  const { BREAKPOINTS } = VIZ_CONFIG.LAYOUT
  if (width < BREAKPOINTS.MOBILE) return 'mobile'
  if (width < BREAKPOINTS.TABLET) return 'tablet'
  if (width < BREAKPOINTS.DESKTOP) return 'desktop'
  if (width < BREAKPOINTS.WIDE) return 'wide'
  return 'ultra-wide'
}

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export const getColorForMetric = (metric: string): string => {
  const colorMap: Record<string, string> = {
    semdist_mean: '#3b82f6',
    score_high: '#10b981',
    score_low: '#ef4444',
    confidence: '#8b5cf6'
  }
  return colorMap[metric] || '#6b7280'
}