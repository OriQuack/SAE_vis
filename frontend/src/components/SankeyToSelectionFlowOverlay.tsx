import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore as useVisualizationStore } from '../store'
import {
  calculateSankeyToSelectionFlows,
  calculateCauseStageFlows
} from '../lib/sankey-selection-flow-utils'
import { SANKEY_COLORS } from '../lib/constants'
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

  // Container element - use state instead of ref to trigger re-renders
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null)

  // Determine current table mode based on active stage
  const tableMode = useMemo((): 'feature' | 'pair' | 'cause' => {
    if (activeStageCategory === 'cause') return 'cause'
    if (activeStageNodeId && activeStageCategory === 'decoder_similarity') return 'pair'
    return 'feature'
  }, [activeStageNodeId, activeStageCategory])

  // Build selection state map based on table mode
  const selectionState = useMemo(() => {
    const state = {
      confirmed: new Set<number>(),
      autoSelected: new Set<number>(),
      rejected: new Set<number>(),
      autoRejected: new Set<number>(),
      unsure: new Set<number>()
    }

    if (tableMode === 'feature') {
      // Feature mode: use featureSelectionStates
      featureSelectionStates.forEach((selectionType, featureId) => {
        if (selectionType === 'selected') {
          const source = useVisualizationStore.getState().featureSelectionSources.get(featureId)
          if (source === 'predicted') {
            state.autoSelected.add(featureId)
          } else {
            state.confirmed.add(featureId)
          }
        } else if (selectionType === 'rejected') {
          const source = useVisualizationStore.getState().featureSelectionSources.get(featureId)
          if (source === 'predicted') {
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
          if (source === 'predicted') {
            state.autoSelected.add(mainId)
            state.autoSelected.add(similarId)
          } else {
            state.confirmed.add(mainId)
            state.confirmed.add(similarId)
          }
        } else if (selectionType === 'rejected') {
          const source = useVisualizationStore.getState().pairSelectionSources.get(pairKey)
          if (source === 'predicted') {
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

  // State to hold calculated flows - updated via useEffect after DOM paint
  const [flows, setFlows] = useState<FlowPathData[]>([])

  // Calculate flows callback - reads DOM positions
  const calculateFlows = useCallback((): FlowPathData[] => {
    if (!selectedSankeySegment || !containerElement || segmentRefs.size === 0 || categoryRefs.size === 0) {
      return []
    }

    const containerRect = containerElement.getBoundingClientRect()
    const nodes = sankeyStructure?.nodes || []

    // Special handling for stage3_segment: show flows from ALL segments
    // In Stage 3 (CauseView), all cause category segments flow to the selection bar
    // Note: We check nodeId directly instead of tableMode because activeCauseStageNode may not be set
    if (selectedSankeySegment.nodeId === 'stage3_segment') {
      // Find the stage3_segment node to get total feature count
      const stage3Node = nodes.find((n: { id: string }) => n.id === 'stage3_segment')
      const totalFeatureCount = stage3Node?.featureCount || 0

      // Gather ALL segment refs for stage3_segment
      const allSegmentRefs: SVGRectElement[] = []
      segmentRefs.forEach((ref, key) => {
        if (key.startsWith('stage3_segment_')) {
          allSegmentRefs.push(ref)
        }
      })

      // If no segments exist yet (initial state), fall back to single-node flow
      if (allSegmentRefs.length === 0) {
        // Use the default single-segment flow calculation
        const segmentKey = `${selectedSankeySegment.nodeId}_${selectedSankeySegment.segmentIndex}`
        const segmentRef = segmentRefs.get(segmentKey)

        if (!segmentRef) {
          return []
        }

        return calculateSankeyToSelectionFlows(
          selectedSankeySegment,
          segmentRef,
          categoryRefs,
          nodes,
          selectionState,
          containerRect
        )
      }

      // Original logic: show flows from all segments when they exist
      return calculateCauseStageFlows(
        allSegmentRefs,
        'stage3_segment',
        totalFeatureCount,
        containerRect
      )
    }

    // Default behavior: single segment flow
    const segmentKey = `${selectedSankeySegment.nodeId}_${selectedSankeySegment.segmentIndex}`
    const segmentRef = segmentRefs.get(segmentKey)

    if (!segmentRef) {
      return []
    }

    return calculateSankeyToSelectionFlows(
      selectedSankeySegment,
      segmentRef,
      categoryRefs,
      nodes,
      selectionState,
      containerRect
    )
  }, [selectedSankeySegment, containerElement, segmentRefs, categoryRefs, sankeyStructure, selectionState])

  // Update flows after DOM has been painted with new positions
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const calculatedFlows = calculateFlows()
        setFlows(calculatedFlows)
      })
    })
    return () => cancelAnimationFrame(rafId)
  }, [calculateFlows])

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
            {flows.map((flow) => {
              // For stage 3, use pre-computed sankey link color (opacity baked in) to avoid confusion with unsure color
              const isStage3 = selectedSankeySegment?.nodeId === 'stage3_segment'
              const fillColor = isStage3 ? SANKEY_COLORS.LINK_COLOR : flow.color
              const fillOpacity = isStage3 ? 1.0 : 0.3

              return (
                <path
                  key={flow.id}
                  className="sankey-to-selection-flow-overlay__flow"
                  d={flow.pathD}
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                  stroke="none"
                  style={{
                    pointerEvents: 'none'
                  }}
                >
                  <title>{`${flow.featureCount} features → Selection Bar`}</title>
                </path>
              )
            })}
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
