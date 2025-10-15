/**
 * D3 Vertical Bar Utilities
 *
 * Following project pattern: "D3 for calculations, React for rendering"
 *
 * Provides utility functions for vertical bar panel calculations showing
 * LLM explainer selection with scroll indicators.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ExplainerBarData {
  id: string
  modelName: string
  featureCount: number
  explanationCount: number
  color: string
  selected: boolean
}

export interface ScrollIndicator {
  y: number
  height: number
}

export interface SelectionSegment {
  y: number
  height: number
  color: string
}

export interface BarLayout {
  x: number
  width: number
  barY: number
  barHeight: number
  labelY: number
  scrollIndicator: ScrollIndicator | null
  selectionSegments: SelectionSegment[]
}

export interface MultiBarLayout {
  width: number
  height: number
  bars: Array<{
    data: ExplainerBarData
    layout: BarLayout
  }>
  maxCount: number
}

// ============================================================================
// COLOR SCHEMES
// ============================================================================

// Single gray color for all bars (selection shown via opacity)
const BAR_COLOR = '#9ca3af'  // Gray-400

/**
 * Get color for an explainer (same gray for all)
 */
export function getExplainerColor(_explainerId: string, _selected: boolean = true): string {
  return BAR_COLOR
}

/**
 * Get display name for an explainer
 */
export function getExplainerDisplayName(explainerId: string): string {
  const nameMap: Record<string, string> = {
    'llama': 'Llama',
    'qwen': 'Qwen',
    'openai': 'OpenAI'
  }
  return nameMap[explainerId] || explainerId
}

// ============================================================================
// SELECTION SEGMENT CALCULATIONS
// ============================================================================

/**
 * Calculate selection segments for a single bar
 *
 * Converts selected feature indices into visual segments on the vertical bar.
 * Assumes features are sorted in the same order as the table.
 * Merges consecutive selections into continuous segments for efficiency.
 *
 * @param selectedFeatureIndices - Array of selected feature row indices (0-based)
 * @param totalFeatureCount - Total number of features in the table
 * @param barY - Y position of the bar's top edge
 * @param barHeight - Height of the bar
 * @param color - Color for the selection segments
 * @returns Array of selection segments with y, height, and color
 */
export function calculateSelectionSegments(
  selectedFeatureIndices: number[],
  totalFeatureCount: number,
  barY: number,
  barHeight: number,
  color: string
): SelectionSegment[] {
  if (selectedFeatureIndices.length === 0 || totalFeatureCount === 0) {
    return []
  }

  // Sort indices to identify consecutive ranges
  const sortedIndices = [...selectedFeatureIndices].sort((a, b) => a - b)

  // Calculate height per feature
  const featureHeight = barHeight / totalFeatureCount

  // Merge consecutive indices into continuous segments
  const segments: SelectionSegment[] = []
  let segmentStart = sortedIndices[0]
  let segmentEnd = sortedIndices[0]

  for (let i = 1; i < sortedIndices.length; i++) {
    const currentIndex = sortedIndices[i]
    if (currentIndex === segmentEnd + 1) {
      // Consecutive - extend current segment
      segmentEnd = currentIndex
    } else {
      // Gap found - finalize current segment and start new one
      segments.push({
        y: barY + segmentStart * featureHeight,
        height: (segmentEnd - segmentStart + 1) * featureHeight,
        color
      })
      segmentStart = currentIndex
      segmentEnd = currentIndex
    }
  }

  // Add final segment
  segments.push({
    y: barY + segmentStart * featureHeight,
    height: (segmentEnd - segmentStart + 1) * featureHeight,
    color
  })

  return segments
}

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculate layout for multiple vertical bars showing features and explanations
 *
 * Following project pattern: D3 calculations in utils, React renders the result
 *
 * @param data - Array of explainer bar data
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @param padding - Padding around the visualization
 * @param scrollState - Optional scroll state for scroll indicator
 * @param selectionData - Optional selection data: map of explainer ID to {featureIndices, color}
 * @param totalFeatureCount - Total number of features for selection calculation
 * @returns Layout calculations for rendering
 */
export function calculateMultiBarLayout(
  data: ExplainerBarData[],
  containerWidth: number,
  containerHeight: number,
  padding: { top: number; bottom: number; left: number; right: number } = {
    top: 40,
    bottom: 20,
    left: 20,
    right: 20
  },
  scrollState?: { scrollTop: number; scrollHeight: number; clientHeight: number } | null,
  selectionData?: Map<string, { featureIndices: number[]; color: string }>,
  totalFeatureCount: number = 0
): MultiBarLayout {
  if (data.length === 0) {
    return {
      width: containerWidth,
      height: containerHeight,
      bars: [],
      maxCount: 0
    }
  }

  // Available space
  const availableWidth = containerWidth - padding.left - padding.right
  const availableHeight = containerHeight - padding.top - padding.bottom

  // Calculate bar dimensions
  const numBars = data.length
  const barGap = 10
  const totalGapWidth = barGap * (numBars - 1)
  const barWidth = (availableWidth - totalGapWidth) / numBars

  // All bars have the same height (fill container)
  const barHeight = availableHeight
  const barY = padding.top

  // Calculate layout for each bar
  const bars = data.map((explainerData, index) => {
    const x = padding.left + index * (barWidth + barGap)

    // Calculate scroll indicator position if scroll state is available
    let scrollIndicator: ScrollIndicator | null = null
    if (scrollState) {
      // Defensive validation: ensure scroll state has valid values
      const hasValidValues =
        scrollState.scrollHeight > 0 &&
        scrollState.clientHeight > 0 &&
        scrollState.scrollTop >= 0

      if (!hasValidValues) {
        console.warn('[d3-vertical-bar-utils] Invalid scroll state values:', scrollState)
      }

      // Only create indicator if content is scrollable
      if (hasValidValues && scrollState.scrollHeight > scrollState.clientHeight) {
        const scrollPercentage = scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight)
        const visiblePercentage = scrollState.clientHeight / scrollState.scrollHeight

        const indicatorHeight = barHeight * visiblePercentage
        const indicatorY = barY + (barHeight - indicatorHeight) * scrollPercentage

        scrollIndicator = {
          y: indicatorY,
          height: indicatorHeight
        }

        console.log('[d3-vertical-bar-utils] Scroll indicator calculated:', {
          scrollPercentage,
          visiblePercentage,
          indicatorY,
          indicatorHeight
        })
      }
    }

    // Calculate selection segments if selection data is available
    let selectionSegments: SelectionSegment[] = []
    if (selectionData && totalFeatureCount > 0) {
      const selection = selectionData.get(explainerData.id)
      if (selection && selection.featureIndices.length > 0) {
        selectionSegments = calculateSelectionSegments(
          selection.featureIndices,
          totalFeatureCount,
          barY,
          barHeight,
          selection.color
        )
      }
    }

    return {
      data: explainerData,
      layout: {
        x,
        width: barWidth,
        barY,
        barHeight,
        labelY: padding.top - 10,
        scrollIndicator,
        selectionSegments
      }
    }
  })

  return {
    width: containerWidth,
    height: containerHeight,
    bars,
    maxCount: 0
  }
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format count for display
 *
 * @param count - Numeric count
 * @returns Formatted count string
 */
export function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toString()
}

/**
 * Format percentage for display
 *
 * @param value - Value
 * @param total - Total
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
