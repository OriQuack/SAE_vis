import type { VisualizationState } from '../types'
import { INITIAL_ERRORS } from '../constants'

/**
 * Composite actions that coordinate multiple slice updates
 */
export const createCompositeActions = (
  set: (
    _partial: VisualizationState | Partial<VisualizationState> | ((_state: VisualizationState) => VisualizationState | Partial<VisualizationState>),
    _replace?: boolean
  ) => void,
  _get: () => VisualizationState
) => ({
  /**
   * Clear all errors across all slices
   */
  clearAllErrors: () => {
    set((_state) => ({
      errors: INITIAL_ERRORS
    }))
  },

  /**
   * Clear errors for specific operations (e.g., after successful filter change)
   */
  clearErrorsAfterFilterChange: () => {
    set((state) => ({
      errors: {
        ...state.errors,
        histogram: null,
        sankey: null
      }
    }))
  },

  /**
   * Clear errors for specific operations (e.g., after successful threshold change)
   */
  clearErrorsAfterThresholdChange: () => {
    set((state) => ({
      errors: {
        ...state.errors,
        sankey: null
      }
    }))
  },

  /**
   * Reset all data when filters change significantly
   */
  resetDataOnFilterChange: () => {
    set((state) => ({
      histogramData: null,
      sankeyData: null,
      errors: {
        ...state.errors,
        histogram: null,
        sankey: null
      }
    }))
  },

  /**
   * Set loading state for multiple operations
   */
  setLoadingStates: (loadingStates: Partial<typeof INITIAL_ERRORS>) => {
    set((state) => ({
      loading: {
        ...state.loading,
        ...loadingStates
      }
    }))
  }
})