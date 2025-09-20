import type { StateCreator } from 'zustand'
import type { FilterSlice, VisualizationState } from '../types'
import { INITIAL_FILTERS } from '../constants'

export const createFilterSlice: StateCreator<
  VisualizationState,
  [],
  [],
  FilterSlice
> = (set) => ({
  // ============================================================================
  // FILTER STATE
  // ============================================================================

  filters: INITIAL_FILTERS,
  filterOptions: null,

  // ============================================================================
  // FILTER ACTIONS
  // ============================================================================

  setFilters: (newFilters) => {
    set(
      (state) => ({
        filters: { ...state.filters, ...newFilters },
        errors: { ...state.errors, histogram: null, sankey: null }
      }),
      false,
      'setFilters'
    )
  },

  resetFilters: () => {
    set(
      (state) => ({
        filters: INITIAL_FILTERS,
        histogramData: null,
        sankeyData: null,
        errors: { ...state.errors, histogram: null, sankey: null }
      }),
      false,
      'resetFilters'
    )
  }
})