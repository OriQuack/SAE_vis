/**
 * Combined store using modular slices
 * Single source of truth for application state
 */

import React from 'react'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import type { FilterSlice } from './slices/filterSlice'
import { createFilterSlice } from './slices/filterSlice'
import type { ThresholdSlice } from './slices/thresholdSlice'
import { createThresholdSlice } from './slices/thresholdSlice'
import type { DataSlice } from './slices/dataSlice'
import { createDataSlice } from './slices/dataSlice'

// Combined store type
export type StoreState = FilterSlice & ThresholdSlice & DataSlice

// Create the combined store with middleware
export const useStore = create<StoreState>()(
  devtools(
    subscribeWithSelector((...args) => ({
      ...createFilterSlice(...args),
      ...createThresholdSlice(...args),
      ...createDataSlice(...args)
    })),
    {
      name: 'visualization-store'
    }
  )
)

// Selector hooks for common patterns
export const useFilters = () => useStore((state) => state.filters)
export const useThresholds = () => useStore((state) => state.thresholds)
export const useSankeyData = () => useStore((state) => state.sankeyData)
export const useFilterOptions = () => useStore((state) => state.filterOptions)
export const useHistogramData = (nodeId: string, metric: string = 'semdist_mean') => {
  return useStore((state) => {
    const filterStr = JSON.stringify(state.filters)
    const cacheKey = `${filterStr}_${metric}_${nodeId}`
    return state.histogramCache.get(cacheKey)
  })
}

// Action hooks
export const useFilterActions = () => {
  const setFilter = useStore((state) => state.setFilter)
  const setFilters = useStore((state) => state.setFilters)
  const clearFilters = useStore((state) => state.clearFilters)
  const fetchFilterOptions = useStore((state) => state.fetchFilterOptions)

  return {
    setFilter,
    setFilters,
    clearFilters,
    fetchFilterOptions
  }
}

export const useThresholdActions = () => {
  const setThreshold = useStore((state) => state.setThreshold)
  const setThresholds = useStore((state) => state.setThresholds)
  const setNodeThreshold = useStore((state) => state.setNodeThreshold)
  const clearNodeThreshold = useStore((state) => state.clearNodeThreshold)
  const setThresholdGroup = useStore((state) => state.setThresholdGroup)
  const clearThresholdGroup = useStore((state) => state.clearThresholdGroup)
  const resetThresholds = useStore((state) => state.resetThresholds)
  const getEffectiveThresholdForNode = useStore((state) => state.getEffectiveThresholdForNode)

  return {
    setThreshold,
    setThresholds,
    setNodeThreshold,
    clearNodeThreshold,
    setThresholdGroup,
    clearThresholdGroup,
    resetThresholds,
    getEffectiveThresholdForNode
  }
}

export const useDataActions = () => {
  const fetchSankeyData = useStore((state) => state.fetchSankeyData)
  const fetchHistogramData = useStore((state) => state.fetchHistogramData)
  const fetchComparisonData = useStore((state) => state.fetchComparisonData)
  const fetchFeatureDetails = useStore((state) => state.fetchFeatureDetails)
  const clearCache = useStore((state) => state.clearCache)

  return {
    fetchSankeyData,
    fetchHistogramData,
    fetchComparisonData,
    fetchFeatureDetails,
    clearCache
  }
}

// Loading state selectors
export const useLoadingState = () => {
  const loadingFilters = useStore((state) => state.loadingFilters)
  const loadingSankey = useStore((state) => state.loadingSankey)
  const loadingHistogram = useStore((state) => state.loadingHistogram)
  const loadingComparison = useStore((state) => state.loadingComparison)
  const loadingFeature = useStore((state) => state.loadingFeature)

  return {
    loadingFilters,
    loadingSankey,
    loadingHistogram,
    loadingComparison,
    loadingFeature
  }
}

// Error state selectors
export const useErrorState = () => {
  const filterError = useStore((state) => state.filterError)
  const sankeyError = useStore((state) => state.sankeyError)
  const histogramError = useStore((state) => state.histogramError)
  const comparisonError = useStore((state) => state.comparisonError)

  return {
    filterError,
    sankeyError,
    histogramError,
    comparisonError
  }
}

// Combined selectors for common use cases
export const useVisualizationData = () => {
  const filters = useFilters()
  const thresholds = useThresholds()
  const sankeyData = useSankeyData()
  const loadingSankey = useStore((state) => state.loadingSankey)
  const sankeyError = useStore((state) => state.sankeyError)

  return {
    filters,
    thresholds,
    sankeyData,
    loading: loadingSankey,
    error: sankeyError
  }
}

// Node-specific data selector
export const useNodeData = (nodeId: string, metric: string = 'semdist_mean') => {
  const histogramData = useHistogramData(nodeId, metric)
  const getEffectiveThresholdForNode = useStore((state) => state.getEffectiveThresholdForNode)
  const nodeThreshold = useStore((state) => state.nodeThresholds[nodeId])

  // Use useCallback to create stable function references
  const getEffectiveThreshold = React.useCallback(
    (metricType: string) => getEffectiveThresholdForNode(nodeId, metricType as any),
    [getEffectiveThresholdForNode, nodeId]
  )

  return {
    histogramData,
    nodeThresholds: nodeThreshold || {},
    getEffectiveThreshold
  }
}

// Initialize store data on mount
export const initializeStore = async () => {
  const { fetchFilterOptions } = useStore.getState()
  await fetchFilterOptions()
}

// Export the store for direct access when needed
export default useStore