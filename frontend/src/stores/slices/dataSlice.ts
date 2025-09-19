/**
 * Data state management slice (API data, loading states, errors)
 */

import { StateCreator } from 'zustand'
import { apiClient } from '../../services/api'
import {
  SankeyData,
  HistogramData,
  ComparisonData,
  FeatureDetails,
  MetricType,
  Filters,
  Thresholds,
  HierarchicalThresholds,
  NodeThresholds
} from '../../types'

export interface DataSlice {
  // Sankey data
  sankeyData: SankeyData | null
  loadingSankey: boolean
  sankeyError: string | null

  // Histogram data
  histogramCache: Map<string, HistogramData>
  loadingHistogram: Set<string>
  histogramError: string | null

  // Comparison data
  comparisonData: ComparisonData | null
  loadingComparison: boolean
  comparisonError: string | null

  // Feature details
  featureCache: Map<string, FeatureDetails>
  loadingFeature: Set<string>

  // Actions
  fetchSankeyData: (
    filters: Filters,
    thresholds: Thresholds,
    nodeThresholds?: NodeThresholds,
    hierarchicalThresholds?: HierarchicalThresholds
  ) => Promise<void>

  fetchHistogramData: (
    filters: Filters,
    metric: MetricType,
    nodeId?: string,
    bins?: number
  ) => Promise<HistogramData | null>

  fetchComparisonData: (
    filters1: Filters,
    filters2: Filters,
    thresholds: Thresholds
  ) => Promise<void>

  fetchFeatureDetails: (featureId: string) => Promise<FeatureDetails | null>

  clearCache: () => void
  clearErrors: () => void
}

const HISTOGRAM_CACHE_KEY = (
  filters: Filters,
  metric: MetricType,
  nodeId?: string
): string => {
  const filterStr = JSON.stringify(filters)
  return `${filterStr}_${metric}_${nodeId || 'global'}`
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
  // Initial state
  sankeyData: null,
  loadingSankey: false,
  sankeyError: null,

  histogramCache: new Map(),
  loadingHistogram: new Set(),
  histogramError: null,

  comparisonData: null,
  loadingComparison: false,
  comparisonError: null,

  featureCache: new Map(),
  loadingFeature: new Set(),

  // Actions
  fetchSankeyData: async (filters, thresholds, nodeThresholds, hierarchicalThresholds) => {
    set({ loadingSankey: true, sankeyError: null })

    try {
      const data = await apiClient.getSankeyData({
        filters,
        thresholds,
        nodeThresholds,
        hierarchicalThresholds
      })

      set({
        sankeyData: data,
        loadingSankey: false
      })
    } catch (error) {
      set({
        sankeyError: error instanceof Error ? error.message : 'Failed to fetch Sankey data',
        loadingSankey: false
      })
    }
  },

  fetchHistogramData: async (filters, metric, nodeId, bins = 20) => {
    const cacheKey = HISTOGRAM_CACHE_KEY(filters, metric, nodeId)
    const state = get()

    // Check cache
    if (state.histogramCache.has(cacheKey)) {
      return state.histogramCache.get(cacheKey)!
    }

    // Check if already loading
    if (state.loadingHistogram.has(cacheKey)) {
      return null
    }

    // Mark as loading
    set(state => ({
      loadingHistogram: new Set(state.loadingHistogram).add(cacheKey),
      histogramError: null
    }))

    try {
      const data = await apiClient.getHistogramData({
        filters,
        metric,
        nodeId,
        bins
      })

      set(state => {
        const newCache = new Map(state.histogramCache)
        const newLoading = new Set(state.loadingHistogram)

        newCache.set(cacheKey, data)
        newLoading.delete(cacheKey)

        return {
          histogramCache: newCache,
          loadingHistogram: newLoading
        }
      })

      return data
    } catch (error) {
      set(state => {
        const newLoading = new Set(state.loadingHistogram)
        newLoading.delete(cacheKey)

        return {
          loadingHistogram: newLoading,
          histogramError: error instanceof Error ? error.message : 'Failed to fetch histogram data'
        }
      })

      return null
    }
  },

  fetchComparisonData: async (filters1, filters2, thresholds) => {
    set({ loadingComparison: true, comparisonError: null })

    try {
      const data = await apiClient.getComparisonData({
        filters1,
        filters2,
        thresholds
      })

      set({
        comparisonData: data,
        loadingComparison: false
      })
    } catch (error) {
      set({
        comparisonError: error instanceof Error ? error.message : 'Failed to fetch comparison data',
        loadingComparison: false
      })
    }
  },

  fetchFeatureDetails: async (featureId) => {
    const state = get()

    // Check cache
    if (state.featureCache.has(featureId)) {
      return state.featureCache.get(featureId)!
    }

    // Check if already loading
    if (state.loadingFeature.has(featureId)) {
      return null
    }

    // Mark as loading
    set(state => ({
      loadingFeature: new Set(state.loadingFeature).add(featureId)
    }))

    try {
      const data = await apiClient.getFeatureDetails(featureId)

      set(state => {
        const newCache = new Map(state.featureCache)
        const newLoading = new Set(state.loadingFeature)

        newCache.set(featureId, data)
        newLoading.delete(featureId)

        return {
          featureCache: newCache,
          loadingFeature: newLoading
        }
      })

      return data
    } catch (error) {
      set(state => {
        const newLoading = new Set(state.loadingFeature)
        newLoading.delete(featureId)

        return { loadingFeature: newLoading }
      })

      return null
    }
  },

  clearCache: () => {
    set({
      histogramCache: new Map(),
      featureCache: new Map()
    })
  },

  clearErrors: () => {
    set({
      sankeyError: null,
      histogramError: null,
      comparisonError: null
    })
  }
})