import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { useResizeObserver } from '../lib/utils'
import { sortFeatures } from '../lib/d3-table-utils'
import type { FeatureTableRow } from '../types'
import {
  calculateMultiBarLayout,
  getExplainerColor,
  getExplainerDisplayName,
  type ExplainerBarData,
  type MultiBarLayout
} from '../lib/d3-vertical-bar-utils'
import '../styles/VerticalBar.css'

// ============================================================================
// TYPES
// ============================================================================

interface VerticalBarProps {
  className?: string
}

// ============================================================================
// VERTICAL BAR COMPONENT
// ============================================================================

/**
 * VerticalBar Component
 *
 * A vertical separator panel showing three bars representing LLM explainers.
 * Displays selection state via opacity and includes scroll indicators.
 *
 * Following project pattern: D3 for calculations, React for rendering
 *
 * Features:
 * - Three vertical bars (one per LLM explainer: Llama, Qwen, OpenAI)
 * - Model name labels at the top
 * - Selection indicated by opacity (selected: 70%, unselected: 30%)
 * - Scroll indicators on selected bars showing table viewport position
 * - Responsive sizing with useResizeObserver
 */
const VerticalBar: React.FC<VerticalBarProps> = ({ className = '' }) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const tableScrollState = useVisualizationStore(state => state.tableScrollState)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const rightPanel = useVisualizationStore(state => state.rightPanel)

  // Sort state for matching table order
  const tableSortBy = useVisualizationStore(state => state.tableSortBy)
  const tableSortDirection = useVisualizationStore(state => state.tableSortDirection)

  // Use resize observer for responsive sizing (following project pattern)
  const { ref: containerRef, size: dimensions } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 0,
    defaultHeight: 0,
    debugId: 'VerticalBar'
  })

  // Get selected explainers from both panels
  const selectedExplainers = useMemo(() => {
    const selected = new Set<string>()

    // Add explainers from left panel
    if (leftPanel.filters.llm_explainer) {
      leftPanel.filters.llm_explainer.forEach(e => {
        // Normalize to lowercase and extract key name
        const normalized = e.toLowerCase()
        if (normalized.includes('llama')) selected.add('llama')
        else if (normalized.includes('qwen')) selected.add('qwen')
        else if (normalized.includes('gpt') || normalized.includes('openai')) selected.add('openai')
      })
    }

    // Add explainers from right panel
    if (rightPanel.filters.llm_explainer) {
      rightPanel.filters.llm_explainer.forEach(e => {
        const normalized = e.toLowerCase()
        if (normalized.includes('llama')) selected.add('llama')
        else if (normalized.includes('qwen')) selected.add('qwen')
        else if (normalized.includes('gpt') || normalized.includes('openai')) selected.add('openai')
      })
    }

    return selected
  }, [leftPanel.filters.llm_explainer, rightPanel.filters.llm_explainer])

  // Calculate data for each explainer from table data
  // ALWAYS show all three explainers
  const explainerData: ExplainerBarData[] = useMemo(() => {
    // Get unique feature IDs and explainer counts from table data
    const explainerStats: Record<string, { features: Set<number>; explanations: number }> = {}

    // Initialize stats for all explainers (always show all three)
    const allExplainers = ['llama', 'qwen', 'openai']
    allExplainers.forEach(id => {
      explainerStats[id] = { features: new Set(), explanations: 0 }
    })

    // Count features and explanations per explainer if we have data
    if (tableData && tableData.features && tableData.features.length > 0) {
      tableData.features.forEach((feature: FeatureTableRow) => {
        Object.keys(feature.explainers).forEach(explainerId => {
          if (explainerStats[explainerId]) {
            explainerStats[explainerId].features.add(feature.feature_id)
            explainerStats[explainerId].explanations += 1
          }
        })
      })
    }

    // Convert to array format - ALWAYS return all three bars
    return allExplainers.map(id => {
      const isSelected = selectedExplainers.has(id)
      return {
        id,
        modelName: getExplainerDisplayName(id),
        featureCount: explainerStats[id].features.size,
        explanationCount: explainerStats[id].explanations,
        color: getExplainerColor(id, isSelected),
        selected: isSelected
      }
    })
  }, [tableData, selectedExplainers])

  // Sort features to match table display order
  const sortedFeatures = useMemo(() => {
    return sortFeatures(
      tableData?.features || [],
      tableSortBy,
      tableSortDirection,
      tableData
    )
  }, [tableData, tableSortBy, tableSortDirection])

  // Calculate layout using D3 utilities (following project pattern)
  const layout: MultiBarLayout = useMemo(() => {
    if (dimensions.width === 0 || dimensions.height === 0) {
      return {
        width: 0,
        height: 0,
        bars: [],
        maxCount: 0,
        globalScrollIndicator: null
      }
    }

    console.log('[VerticalBar] Calculating layout with scroll state:', tableScrollState)

    return calculateMultiBarLayout(
      explainerData,
      dimensions.width,
      dimensions.height,
      { top: 30, bottom: 50, left: 10, right: 10 },
      tableScrollState,
      undefined, // No selection data in simplified table
      sortedFeatures.length
    )
  }, [explainerData, dimensions.width, dimensions.height, tableScrollState, sortedFeatures.length])

  return (
    <div
      className={`vertical-bar${className ? ` ${className}` : ''}`}
      ref={containerRef}
    >
      {/* Header */}
      <div className="vertical-bar__header">
        <span className="vertical-bar__title">LLM Explanations</span>
      </div>

      <div className="vertical-bar__content">
        {/* SVG Visualization */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <svg
            width={dimensions.width}
            height={dimensions.height}
            className="vertical-bar__svg"
          >
            {layout.bars.map((bar) => {
              const { data, layout: barLayout } = bar
              const barCenterX = barLayout.x + barLayout.width / 2

              return (
                <g key={data.id} className={`vertical-bar__bar-group ${data.selected ? 'selected' : 'unselected'}`}>
                  {/* Model name label at top */}
                  <text
                    x={barCenterX}
                    y={barLayout.labelY}
                    textAnchor="middle"
                    className={`vertical-bar__model-label ${data.selected ? 'selected' : 'unselected'}`}
                    fill="#374151"
                    fontSize="12"
                    fontWeight={data.selected ? '600' : '500'}
                    opacity={data.selected ? 1.0 : 0.5}
                  >
                    {data.modelName}
                  </text>

                  {/* Bar per explainer */}
                  <rect
                    x={barLayout.x}
                    y={barLayout.barY}
                    width={barLayout.width}
                    height={barLayout.barHeight}
                    fill={data.color}
                    className={`vertical-bar__bar ${data.selected ? 'selected' : 'unselected'}`}
                    opacity={data.selected ? 0.7 : 0.3}
                    rx="3"
                  />
                </g>
              )
            })}

            {/* Single global scroll indicator spanning all three bars */}
            {layout.globalScrollIndicator && layout.bars.length > 0 && (
              <rect
                x={layout.bars[0].layout.x}
                y={layout.globalScrollIndicator.y}
                width={layout.bars[layout.bars.length - 1].layout.x + layout.bars[layout.bars.length - 1].layout.width - layout.bars[0].layout.x}
                height={layout.globalScrollIndicator.height}
                className="vertical-bar__scroll-indicator"
                rx="3"
              />
            )}

          </svg>
        )}

        {/* Empty state message */}
        {layout.bars.length === 0 && (
          <div className="vertical-bar__empty-message">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="vertical-bar__icon"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="9 12 12 15 15 12" />
            </svg>
            <span className="vertical-bar__empty-text">No data</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default VerticalBar
