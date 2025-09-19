/**
 * Filter state management slice
 */

import { StateCreator } from 'zustand'
import { Filters, FilterOptions, FilterKey } from '../../types'
import { apiClient } from '../../services/api'

export interface FilterSlice {
  // State
  filters: Filters
  filterOptions: FilterOptions | null
  loadingFilters: boolean
  filterError: string | null

  // Actions
  setFilter: (key: FilterKey, values: string[]) => void
  setFilters: (filters: Partial<Filters>) => void
  clearFilters: () => void
  fetchFilterOptions: () => Promise<void>
}

export const createFilterSlice: StateCreator<FilterSlice> = (set, get) => ({
  // Initial state
  filters: {
    sae_id: [],
    explanation_method: [],
    llm_explainer: [],
    llm_scorer: []
  },
  filterOptions: null,
  loadingFilters: false,
  filterError: null,

  // Actions
  setFilter: (key, values) => {
    set(state => ({
      filters: {
        ...state.filters,
        [key]: values
      },
      filterError: null
    }))
  },

  setFilters: (newFilters) => {
    set(state => ({
      filters: {
        ...state.filters,
        ...newFilters
      },
      filterError: null
    }))
  },

  clearFilters: () => {
    set({
      filters: {
        sae_id: [],
        explanation_method: [],
        llm_explainer: [],
        llm_scorer: []
      },
      filterError: null
    })
  },

  fetchFilterOptions: async () => {
    set({ loadingFilters: true, filterError: null })

    try {
      const options = await apiClient.getFilterOptions()
      set({
        filterOptions: options,
        loadingFilters: false
      })
    } catch (error) {
      set({
        filterError: error instanceof Error ? error.message : 'Failed to fetch filter options',
        loadingFilters: false
      })
    }
  }
})