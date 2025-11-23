import React, { useState, useMemo } from 'react'
import { useStore as useVisualizationStore } from '../store'
import {
  calculateSankeyToSelectionFlows
} from '../lib/sankey-selection-flow-utils'
import type { SelectionCategory, FlowPathData } from '../types'
import '../styles/SankeyToSelectionFlowOverlay.css'

interface SankeyToSelectionFlowOverlayProps {
  className?: string
  segmentRefs?: Map<string, SVGRectElement>  // Segment refs from SankeyDiagram
  categoryRefs?: Map<SelectionCategory, HTMLDivElement>  // Category refs from SelectionBar
}

/**
 * SankeyToSelectionFlowOverlay - Visualizes flows from Sankey node segments to SelectionBar
 *
 * Features:
 * - Thick Sankey-style flow visualization with width proportional to segment height
 * - Smooth bezier curves connecting segment to entire SelectionBar
 * - Only renders when a segment is selected
 * - Passive visualization (no interaction) - relies on segment selection from SankeyDiagram
 */
export const SankeyToSelectionFlowOverlay: React.FC<SankeyToSelectionFlowOverlayProps> = ({
  className = '',
  segmentRefs = new Map(),
  categoryRefs = new Map()
}) => {
  // Get state from store
  const selectedSankeySegment = useVisualizationStore(state => state.selectedSankeySegment)
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const activeStageCategory = useVisualizationStore(state => state.activeStageCategory)
  const activeCauseStageNode = useVisualizationStore(state => state.activeCauseStageNode)

  // Container element - use state instead of ref to trigger re-renders
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null)

  // Determine current table mode based on active stage
  const tableMode = useMemo((): 'feature' | 'pair' | 'cause' => {
    if (activeCauseStageNode) return 'cause'
    if (activeStageNodeId && activeStageCategory === 'decoder_similarity') return 'pair'
    return 'feature'
  }, [activeStageNodeId, activeStageCategory, activeCauseStageNode])

  // Build selection state map based on table mode
  const selectionState = useMemo(() => {
    const state = {
      confirmed: new Set<number>(),
      expanded: new Set<number>(),
      rejected: new Set<number>(),
      autoRejected: new Set<number>(),
      unsure: new Set<number>()
    }

    if (tableMode === 'feature') {
      // Feature mode: use featureSelectionStates
      featureSelectionStates.forEach((selectionType, featureId) => {
        if (selectionType === 'selected') {
          const source = useVisualizationStore.getState().featureSelectionSources.get(featureId)
          if (source === 'auto') {
            state.expanded.add(featureId)
          } else {
            state.confirmed.add(featureId)
          }
        } else if (selectionType === 'rejected') {
          const source = useVisualizationStore.getState().featureSelectionSources.get(featureId)
          if (source === 'auto') {
            state.autoRejected.add(featureId)
          } else {
            state.rejected.add(featureId)
          }
        }
      })
    } else if (tableMode === 'pair') {
      // Pair mode: extract feature IDs from pair keys
      pairSelectionStates.forEach((selectionType, pairKey) => {
        const [mainId, similarId] = pairKey.split('-').map(Number)
        if (selectionType === 'selected') {
          const source = useVisualizationStore.getState().pairSelectionSources.get(pairKey)
          if (source === 'auto') {
            state.expanded.add(mainId)
            state.expanded.add(similarId)
          } else {
            state.confirmed.add(mainId)
            state.confirmed.add(similarId)
          }
        } else if (selectionType === 'rejected') {
          const source = useVisualizationStore.getState().pairSelectionSources.get(pairKey)
          if (source === 'auto') {
            state.autoRejected.add(mainId)
            state.autoRejected.add(similarId)
          } else {
            state.rejected.add(mainId)
            state.rejected.add(similarId)
          }
        }
      })
    } else if (tableMode === 'cause') {
      // Cause mode: map cause categories to selection state
      // For now, treat all tagged features as "confirmed" (can be refined later)
      causeSelectionStates.forEach((_, featureId) => {
        state.confirmed.add(featureId)
      })
    }

    // Mark all other features as unsure
    // TODO: Get full feature list from table data if needed

    return state
  }, [tableMode, featureSelectionStates, pairSelectionStates, causeSelectionStates])

  // Calculate flows from selected segment (recalculates on every render for responsive positioning)
  const calculateFlows = (): FlowPathData[] => {
    if (!selectedSankeySegment || !containerElement || segmentRefs.size === 0 || categoryRefs.size === 0) {
      return []
    }

    const segmentKey = `${selectedSankeySegment.nodeId}_${selectedSankeySegment.segmentIndex}`
    const segmentRef = segmentRefs.get(segmentKey)

    if (!segmentRef) {
      return []
    }

    // Recalculate positions every render - positions change with window resize, gap changes, etc.
    const containerRect = containerElement.getBoundingClientRect()
    const nodes = sankeyStructure?.nodes || []

    const calculatedFlows = calculateSankeyToSelectionFlows(
      selectedSankeySegment,
      segmentRef,
      categoryRefs,
      nodes,
      selectionState,
      containerRect
    )

    return calculatedFlows
  }

  const flows = calculateFlows()

  // Always render the container div (needed for containerElement ref)
  // Only show flows when selection exists
  return (
    <div
      ref={setContainerElement}
      className={`sankey-to-selection-flow-overlay ${className}`}
    >
      {selectedSankeySegment && flows.length > 0 && (
        <svg
          className="sankey-to-selection-flow-overlay__svg"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100
          }}
        >
          <g className="sankey-to-selection-flow-overlay__flows">
            {flows.map((flow) => (
              <path
                key={flow.id}
                className="sankey-to-selection-flow-overlay__flow"
                d={flow.pathD}
                fill={flow.color}
                fillOpacity={0.3}
                stroke="none"
                style={{
                  pointerEvents: 'none'
                }}
              >
                <title>{`${flow.featureCount} features → Selection Bar`}</title>
              </path>
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}

/**
 * HOC to inject refs from parent components
 * This allows SankeyDiagram and SelectionPanel to pass refs to the overlay
 */
export interface WithFlowRefsProps {
  onSegmentRefsReady?: (refs: Map<string, SVGRectElement>) => void
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void
}

export default SankeyToSelectionFlowOverlay
