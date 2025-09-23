import type { StateCreator } from 'zustand'
import type { PopoverSlice, VisualizationState } from '../types'
import { INITIAL_POPOVER_STATE } from '../constants'

export const createPopoverSlice: StateCreator<
  VisualizationState,
  [],
  [],
  PopoverSlice
> = (set) => ({
  // ============================================================================
  // POPOVER STATE
  // ============================================================================

  popoverState: INITIAL_POPOVER_STATE,

  // ============================================================================
  // POPOVER ACTIONS
  // ============================================================================

  showHistogramPopover: (nodeId, nodeName, metrics, position, parentNodeId, parentNodeName) => {
    set((state) => ({
      popoverState: {
        ...state.popoverState,
        histogram: {
          nodeId,
          nodeName,
          parentNodeId,
          parentNodeName,
          metrics,
          position,
          visible: true
        }
      },
      currentMetric: metrics[0], // Set first metric as current for backwards compatibility
      errors: { ...state.errors, histogram: null }
    }))
  },

  hideHistogramPopover: () => {
    set((state) => ({
      popoverState: {
        ...state.popoverState,
        histogram: null
      }
    }))
  }
})