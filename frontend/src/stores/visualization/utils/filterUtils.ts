import type { Filters } from '../../../services/types'

/**
 * Check if any filters are currently active
 */
export function hasActiveFilters(filters: Filters): boolean {
  return Object.values(filters).some(filterArray => filterArray && filterArray.length > 0)
}

/**
 * Check if filters have changed between two filter objects
 */
export function filtersHaveChanged(oldFilters: Filters, newFilters: Filters): boolean {
  return JSON.stringify(oldFilters) !== JSON.stringify(newFilters)
}

/**
 * Create a deep copy of filters object
 */
export function cloneFilters(filters: Filters): Filters {
  return {
    sae_id: filters.sae_id ? [...filters.sae_id] : [],
    explanation_method: filters.explanation_method ? [...filters.explanation_method] : [],
    llm_explainer: filters.llm_explainer ? [...filters.llm_explainer] : [],
    llm_scorer: filters.llm_scorer ? [...filters.llm_scorer] : []
  }
}