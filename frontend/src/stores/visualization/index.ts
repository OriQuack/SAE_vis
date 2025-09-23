import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { VisualizationState } from './types'
import { createFilterSlice } from './slices/filterSlice'
import { createThresholdSlice } from './slices/thresholdSlice'
import { createPopoverSlice } from './slices/popoverSlice'
import { createApiSlice } from './slices/apiSlice'
import { createViewSlice } from './slices/viewSlice'
import { createCompositeActions } from './actions/compositeActions'

export const useVisualizationStore = create<VisualizationState>()(
  devtools(
    (set, get, api) => ({
      ...createFilterSlice(set, get, api),
      ...createThresholdSlice(set, get, api),
      ...createPopoverSlice(set, get, api),
      ...createApiSlice(set, get, api),
      ...createViewSlice(set, get, api),
      ...createCompositeActions(set, get),
      resetAll: () => {
        const state = get()
        state.resetFilters()
        state.resetThresholds()
        state.clearAllErrors()
        state.resetView()
      }
    }),
    {
      name: 'visualization-store'
    }
  )
)

// Re-export all selectors for easy access
export * from './selectors'

// Re-export types for components that need them
export type { VisualizationState } from './types'