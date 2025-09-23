import type { UISliceCreator } from './types'
import {
  INITIAL_POPOVER_STATE,
  INITIAL_LOADING,
  INITIAL_ERRORS
} from './types'

export const createUISlice: UISliceCreator = (set) => ({
  // ============================================================================
  // UI STATE
  // ============================================================================

  viewState: 'empty',
  popoverState: INITIAL_POPOVER_STATE,
  loading: INITIAL_LOADING,
  errors: INITIAL_ERRORS,

  // ============================================================================
  // VIEW STATE ACTIONS
  // ============================================================================

  setViewState: (newState) => {
    set(() => ({
      viewState: newState
    }))
  },

  showVisualization: () => {
    set(() => ({
      viewState: 'visualization'
    }))
  },

  editFilters: () => {
    set(() => ({
      viewState: 'filtering'
    }))
  },

  removeVisualization: () => {
    set(() => ({
      viewState: 'empty'
    }))
  },

  // ============================================================================
  // POPOVER ACTIONS
  // ============================================================================

  showHistogramPopover: (nodeId, nodeName, metrics, position, parentNodeId, parentNodeName) => {
    set(() => ({
      popoverState: {
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
      errors: {
        ...INITIAL_ERRORS,
        histogram: null // Clear histogram errors when showing popover
      }
    }))
  },

  hideHistogramPopover: () => {
    set(() => ({
      popoverState: {
        histogram: null
      }
    }))
  },

  // ============================================================================
  // LOADING STATE ACTIONS
  // ============================================================================

  setLoading: (key, value) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [key]: value
      }
    }))
  },

  // ============================================================================
  // ERROR STATE ACTIONS
  // ============================================================================

  setError: (key, error) => {
    set((state) => ({
      errors: {
        ...state.errors,
        [key]: error
      }
    }))
  },

  clearError: (key) => {
    set((state) => ({
      errors: {
        ...state.errors,
        [key]: null
      }
    }))
  },

  clearAllErrors: () => {
    set(() => ({
      errors: INITIAL_ERRORS
    }))
  },

  // ============================================================================
  // RESET ACTION
  // ============================================================================

  resetUI: () => {
    set(() => ({
      viewState: 'empty',
      popoverState: INITIAL_POPOVER_STATE,
      loading: INITIAL_LOADING,
      errors: INITIAL_ERRORS
    }))
  }
})