/**
 * Filter-related type definitions
 */

export interface Filters {
  sae_id: string[]
  explanation_method: string[]
  llm_explainer: string[]
  llm_scorer: string[]
}

export interface FilterOptions {
  sae_id: string[]
  explanation_method: string[]
  llm_explainer: string[]
  llm_scorer: string[]
}

export type FilterKey = keyof Filters

export interface FilterUpdate {
  key: FilterKey
  values: string[]
}

export const DEFAULT_FILTERS: Filters = {
  sae_id: [],
  explanation_method: [],
  llm_explainer: [],
  llm_scorer: []
}