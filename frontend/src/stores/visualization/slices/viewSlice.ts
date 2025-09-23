import type { StateCreator } from 'zustand'
import type { ViewSlice, VisualizationState } from '../types'

export const createViewSlice: StateCreator<
  VisualizationState,
  [],
  [],
  ViewSlice
> = (set) => ({
  // ============================================================================
  // VIEW STATE
  // ============================================================================

  viewState: 'empty',

  // ============================================================================
  // VIEW ACTIONS
  // ============================================================================

  setViewState: (newState) => {
    set({ viewState: newState })
  },

  showVisualization: () => {
    set({
      viewState: 'visualization'
    })
  },

  editFilters: () => {
    set({
      viewState: 'filtering'
    })
  },

  removeVisualization: () => {
    set({
      viewState: 'empty'
    })
  },

  resetView: () => {
    set({
      viewState: 'empty'
    })
  }
})