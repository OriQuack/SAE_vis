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
  isFilterModalOpen: false,

  // ============================================================================
  // VIEW ACTIONS
  // ============================================================================

  setViewState: (newState) => {
    set(
      { viewState: newState },
      false,
      'setViewState'
    )
  },

  openFilterModal: () => {
    set(
      { isFilterModalOpen: true },
      false,
      'openFilterModal'
    )
  },

  closeFilterModal: () => {
    set(
      { isFilterModalOpen: false },
      false,
      'closeFilterModal'
    )
  },

  showVisualization: () => {
    set(
      (state) => ({
        viewState: 'visualization',
        isFilterModalOpen: false
      }),
      false,
      'showVisualization'
    )
  },

  editFilters: () => {
    set(
      {
        isFilterModalOpen: true
      },
      false,
      'editFilters'
    )
  },

  removeVisualization: () => {
    set(
      (state) => ({
        viewState: 'empty',
        isFilterModalOpen: false
      }),
      false,
      'removeVisualization'
    )
  },

  resetView: () => {
    set(
      {
        viewState: 'empty',
        isFilterModalOpen: false
      },
      false,
      'resetView'
    )
  }
})