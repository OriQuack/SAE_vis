import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { VisualizationState } from './types'
import { createFilterSlice } from './slices/filterSlice'
import { createThresholdSlice } from './slices/thresholdSlice'
import { createPopoverSlice } from './slices/popoverSlice'
import { createApiSlice } from './slices/apiSlice'

export const useVisualizationStore = create<VisualizationState>()(
  devtools(
    (...a) => ({
      ...createFilterSlice(...a),
      ...createThresholdSlice(...a),
      ...createPopoverSlice(...a),
      ...createApiSlice(...a)
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