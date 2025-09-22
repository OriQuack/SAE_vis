// Utility functions for data formatting and display

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value)
}

export function formatInteger(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 })
}

export function formatDecimal(value: number, decimals: number = 3): string {
  return formatNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return formatNumber(value, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatCompact(value: number): string {
  return formatNumber(value, { notation: 'compact' })
}

export function formatSmartNumber(value: number): string {
  // Use scientific notation for very small values
  if (Math.abs(value) < 0.001 && value !== 0) {
    return value.toExponential(2)
  }

  // Use fixed decimal places for normal values
  if (Math.abs(value) < 1) {
    return value.toFixed(3)
  }

  // Use fewer decimal places for larger values
  return value.toFixed(2)
}

// ============================================================================
// STRING FORMATTING
// ============================================================================

export function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export function toSentenceCase(str: string): string {
  const words = str.replace(/_/g, ' ').toLowerCase().split(' ')
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  }
  return words.join(' ')
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// ============================================================================
// METRIC FORMATTING
// ============================================================================

export function formatMetricName(metric: string): string {
  const metricLabels: Record<string, string> = {
    'semdist_mean': 'Semantic Distance (Mean)',
    'semdist_max': 'Semantic Distance (Max)',
    'score_fuzz': 'Fuzz Score',
    'score_simulation': 'Simulation Score',
    'score_detection': 'Detection Score',
    'score_embedding': 'Embedding Score'
  }

  return metricLabels[metric] || toTitleCase(metric)
}

export function formatCategoryName(category: string): string {
  const categoryLabels: Record<string, string> = {
    'root': 'All Features',
    'feature_splitting': 'Feature Splitting',
    'semantic_distance': 'Semantic Distance',
    'score_agreement': 'Score Agreement'
  }

  return categoryLabels[category] || toTitleCase(category)
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

export function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000

  if (seconds < 1) {
    return `${Math.round(milliseconds)}ms`
  } else if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  } else {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// ============================================================================
// DATA SIZE FORMATTING
// ============================================================================

export function formatDataSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

export function isValidString(value: any): value is string {
  return typeof value === 'string' && value.length > 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

export function getUniqueValues<T>(array: T[]): T[] {
  return Array.from(new Set(array))
}

export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item)
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(item)
    return groups
  }, {} as Record<K, T[]>)
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

export function hexToRgba(hex: string, alpha: number = 1): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return hex

  const r = parseInt(result[1], 16)
  const g = parseInt(result[2], 16)
  const b = parseInt(result[3], 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getContrastColor(backgroundColor: string): string {
  // Simple contrast calculation - in production you might want something more sophisticated
  const rgb = backgroundColor.match(/\d+/g)
  if (!rgb) return '#000000'

  const brightness = (
    parseInt(rgb[0]) * 299 +
    parseInt(rgb[1]) * 587 +
    parseInt(rgb[2]) * 114
  ) / 1000

  return brightness > 128 ? '#000000' : '#ffffff'
}

export default {
  formatNumber,
  formatInteger,
  formatDecimal,
  formatPercentage,
  formatCompact,
  formatSmartNumber,
  toTitleCase,
  toSentenceCase,
  truncateText,
  formatMetricName,
  formatCategoryName,
  formatDuration,
  formatTimestamp,
  formatDataSize,
  isValidNumber,
  isValidString,
  clamp,
  getUniqueValues,
  groupBy,
  hexToRgba,
  getContrastColor
}