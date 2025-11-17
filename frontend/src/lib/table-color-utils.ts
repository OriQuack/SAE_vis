// ============================================================================
// TABLE COLOR UTILITIES
// Centralized color logic for all table components
// ============================================================================

import { SELECTION_CATEGORY_COLORS } from './constants'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_FEATURE_SPLITTING, getBadgeColors } from './tag-constants'

/**
 * Table mode types
 */
export type TableMode = 'feature' | 'pair' | 'cause'

/**
 * Selection state types
 */
export type SelectionState = 'selected' | 'rejected' | null | undefined

/**
 * Selection source types
 */
export type SelectionSource = 'manual' | 'auto' | null | undefined

/**
 * Badge configuration with label and color
 */
export interface BadgeConfig {
  selected: {
    label: string
    color: string
  }
  rejected: {
    label: string
    color: string
  }
}

/**
 * Get row background color based on selection state and source
 *
 * Color Rules:
 * - Confirmed (manual selected): Blue #3b82f6
 * - Expanded (auto selected): Cyan #67e8f9
 * - Rejected (manual rejected): Red #ef4444
 * - Auto-Rejected: Pink #f9a8d4
 * - Unsure: null (no background color)
 *
 * @param selectionState - The selection state ('selected', 'rejected', or null)
 * @param selectionSource - The source ('manual', 'auto', or null)
 * @param mode - The table mode (unused but kept for API consistency)
 * @returns The hex color string or null if unsure
 */
export function getRowBackgroundColor(
  selectionState: SelectionState,
  selectionSource: SelectionSource,
): string | null {
  if (selectionState === 'selected') {
    // Manual selected → Blue
    if (selectionSource === 'auto') {
      return SELECTION_CATEGORY_COLORS.EXPANDED.HEX  // Cyan #67e8f9
    } else {
      return SELECTION_CATEGORY_COLORS.CONFIRMED.HEX  // Blue #3b82f6
    }
  } else if (selectionState === 'rejected') {
    // Manual rejected → Red, Auto rejected → Pink
    if (selectionSource === 'auto') {
      return SELECTION_CATEGORY_COLORS.AUTO_REJECTED.HEX  // Pink #f9a8d4
    } else {
      return SELECTION_CATEGORY_COLORS.REJECTED.HEX  // Red #ef4444
    }
  }

  // Unsure state - no background color
  return null
}

/**
 * Get badge configuration (labels and colors) for a specific table mode
 * Badges use tag-specific colors, NOT selection colors
 *
 * @param mode - The table mode
 * @returns Badge configuration with selected/rejected labels and colors
 */
export function getBadgeConfig(mode: TableMode): BadgeConfig {
  if (mode === 'feature') {
    // Quality stage - Well-Explained vs Need Revision
    const category = TAG_CATEGORY_QUALITY
    const colors = getBadgeColors(category)

    return {
      selected: {
        label: 'Well-Explained',
        color: colors['Well-Explained'] || '#10b981'  // Green fallback
      },
      rejected: {
        label: 'Need Revision',
        color: colors['Need Revision'] || '#ef4444'  // Red fallback
      }
    }
  } else if (mode === 'pair') {
    // Feature splitting stage - Fragmented vs Monosemantic
    const category = TAG_CATEGORY_FEATURE_SPLITTING
    const colors = getBadgeColors(category)

    return {
      selected: {
        label: 'Fragmented',
        color: colors['Fragmented'] || '#10b981'  // Green fallback
      },
      rejected: {
        label: 'Monosemantic',
        color: colors['Monosemantic'] || '#ef4444'  // Red fallback
      }
    }
  } else {
    // Cause stage - use generic labels with selection colors
    // Note: Cause mode no longer uses special orange/purple/blue colors
    return {
      selected: {
        label: 'Selected',
        color: SELECTION_CATEGORY_COLORS.CONFIRMED.HEX  // Blue
      },
      rejected: {
        label: 'Rejected',
        color: SELECTION_CATEGORY_COLORS.REJECTED.HEX  // Red
      }
    }
  }
}

/**
 * Add opacity to a hex color
 * Converts #RRGGBB to #RRGGBBAA (hex with alpha)
 *
 * @param hex - The hex color string (e.g., '#3b82f6')
 * @param opacity - Opacity value 0-1 (e.g., 0.3 for 30%)
 * @returns Hex color with alpha channel (e.g., '#3b82f64D')
 */
export function addOpacityToHex(hex: string, opacity: number): string {
  // Remove '#' if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex

  // Convert opacity (0-1) to hex (00-FF)
  const alpha = Math.round(opacity * 255)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()

  return `#${cleanHex}${alphaHex}`
}

/**
 * Generate CSS custom properties for row styling
 * Used to set both border color (full opacity) and background color (30% opacity)
 *
 * @param color - The base hex color (e.g., '#3b82f6')
 * @returns Object with CSS custom property values
 */
export function getRowStyleProperties(color: string | null): {
  '--row-color': string
  '--row-bg-color': string
} {
  if (!color) {
    // No color - return transparent
    return {
      '--row-color': 'transparent',
      '--row-bg-color': 'transparent'
    }
  }

  return {
    '--row-color': color,                      // Full opacity for borders
    '--row-bg-color': addOpacityToHex(color, 0.3)  // 30% opacity for background
  }
}

/**
 * Get CSS class name for row based on selection state
 *
 * @param selectionState - The selection state
 * @param selectionSource - The source
 * @returns CSS class name (e.g., 'table-panel__sub-row--confirmed')
 */
export function getRowCategoryClass(
  selectionState: SelectionState,
  selectionSource: SelectionSource
): string {
  if (selectionState === 'selected') {
    return selectionSource === 'auto'
      ? 'table-panel__sub-row--expanded'
      : 'table-panel__sub-row--confirmed'
  } else if (selectionState === 'rejected') {
    return selectionSource === 'auto'
      ? 'table-panel__sub-row--autoRejected'
      : 'table-panel__sub-row--rejected'
  }
  return ''  // No class for unsure state
}
