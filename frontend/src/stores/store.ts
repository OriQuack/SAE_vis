import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createDataSlice } from './dataSlice'
import { createUISlice } from './uiSlice'
import type { AppState } from './types'

// Combined store with both data and UI slices
export const useAppStore = create<AppState>()(
  devtools(
    (set, get, api) => ({
      ...createDataSlice(set, get, api),
      ...createUISlice(set, get, api),

      // Global reset action that resets both slices
      resetAll: () => {
        const state = get()
        state.resetData()
        state.resetUI()
      }
    }),
    {
      name: 'app-store'
    }
  )
)

// Export for backward compatibility during migration
export const useVisualizationStore = useAppStore

// Export types for components
export type { AppState } from './types'