import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api, ApiClientError } from '../services/api'
import type {
  Filters,
  Thresholds,
  NodeThresholds,
  HierarchicalThresholds,
  PopoverState,
  FilterOptions,
  HistogramData,
  SankeyData,
  LoadingState,
  ErrorState,
  MetricType
} from '../services/types'
import {
  getThresholdGroupId,
  getNodesInThresholdGroup,
  getEffectiveThreshold
} from '../services/types'

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface VisualizationState {
  // Filter state
  filters: Filters

  // Threshold state
  thresholds: Thresholds
  nodeThresholds: NodeThresholds
  hierarchicalThresholds: HierarchicalThresholds

  // Popover state
  popoverState: PopoverState

  // API data
  filterOptions: FilterOptions | null
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null

  // UI state
  loading: LoadingState
  errors: ErrorState

  // Current metric for histogram
  currentMetric: MetricType

  // Actions
  setFilters: (filters: Partial<Filters>) => void
  setThresholds: (thresholds: Partial<Thresholds>) => void
  setCurrentMetric: (metric: MetricType) => void

  // Node threshold actions (legacy)
  setNodeThreshold: (nodeId: string, metric: MetricType, threshold: number) => void
  clearNodeThreshold: (nodeId: string, metric?: MetricType) => void
  resetNodeThresholds: () => void

  // Hierarchical threshold actions
  setThresholdGroup: (groupId: string, metric: MetricType, threshold: number) => void
  clearThresholdGroup: (groupId: string, metric?: MetricType) => void
  getEffectiveThresholdForNode: (nodeId: string, metric: MetricType) => number
  getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => string[]

  // Popover actions
  showHistogramPopover: (nodeId: string, nodeName: string, metrics: MetricType[], position: { x: number, y: number }, parentNodeId?: string, parentNodeName?: string) => void
  hideHistogramPopover: () => void

  // API actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (debounced?: boolean, nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], debounced?: boolean, nodeId?: string) => Promise<void>
  fetchSankeyData: (debounced?: boolean, nodeThresholdsOverride?: NodeThresholds) => Promise<void>

  // Error handling
  clearError: (key: keyof ErrorState) => void
  clearAllErrors: () => void

  // Reset actions
  resetFilters: () => void
  resetThresholds: () => void
  resetAll: () => void
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialFilters: Filters = {
  sae_id: [],
  explanation_method: [],
  llm_explainer: [],
  llm_scorer: []
}

// Default thresholds - these will be automatically updated to the mean values
// from the histogram data once it's fetched
const initialThresholds: Thresholds = {
  semdist_mean: 0.1,  // Default to middle of range (0-1), will be replaced with actual mean
  score_high: 0.5     // Default to middle of range (0-1), will be replaced with actual mean
}

const initialNodeThresholds: NodeThresholds = {}

const initialHierarchicalThresholds: HierarchicalThresholds = {
  global_thresholds: initialThresholds
}

const initialPopoverState: PopoverState = {
  histogram: null
}

const initialLoading: LoadingState = {
  filters: false,
  histogram: false,
  sankey: false,
  comparison: false
}

const initialErrors: ErrorState = {
  filters: null,
  histogram: null,
  sankey: null,
  comparison: null
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'INVALID_FILTERS':
        return 'Invalid filter selection. Please check your selections and try again.'
      case 'INSUFFICIENT_DATA':
        return 'Not enough data matches your current filters. Try adjusting your selection.'
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your connection.'
      case 'INTERNAL_ERROR':
        return 'A server error occurred. Please try again later.'
      default:
        return error.message
    }
  }
  return 'An unexpected error occurred'
}

function hasActiveFilters(filters: Filters): boolean {
  return Object.values(filters).some(filterArray => filterArray && filterArray.length > 0)
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useVisualizationStore = create<VisualizationState>()(
  devtools(
    (set, get) => ({
      // Initial state
      filters: initialFilters,
      thresholds: initialThresholds,
      nodeThresholds: initialNodeThresholds,
      hierarchicalThresholds: initialHierarchicalThresholds,
      popoverState: initialPopoverState,
      filterOptions: null,
      histogramData: null,
      sankeyData: null,
      loading: initialLoading,
      errors: initialErrors,
      currentMetric: 'semdist_mean',

      // ============================================================================
      // BASIC SETTERS
      // ============================================================================

      setFilters: (newFilters: Partial<Filters>) => {
        set(
          (state) => ({
            filters: { ...state.filters, ...newFilters },
            errors: { ...state.errors, histogram: null, sankey: null }
          }),
          false,
          'setFilters'
        )
      },

      setThresholds: (newThresholds: Partial<Thresholds>) => {
        set(
          (state) => ({
            thresholds: { ...state.thresholds, ...newThresholds },
            errors: { ...state.errors, sankey: null }
          }),
          false,
          'setThresholds'
        )
      },

      setCurrentMetric: (metric: MetricType) => {
        set(
          (state) => ({
            currentMetric: metric,
            errors: { ...state.errors, histogram: null }
          }),
          false,
          'setCurrentMetric'
        )
      },

      // ============================================================================
      // NODE THRESHOLD ACTIONS
      // ============================================================================

      setNodeThreshold: (parentNodeId: string, metric: MetricType, threshold: number) => {
        console.log(`🎯 Setting parent node threshold: ${parentNodeId}.${metric} = ${threshold}`)

        set(
          (state) => {
            const newNodeThresholds = {
              ...state.nodeThresholds,
              [parentNodeId]: {
                ...state.nodeThresholds[parentNodeId],
                [metric]: threshold
              }
            }

            console.log('🎯 New nodeThresholds state:', JSON.stringify(newNodeThresholds, null, 2))

            // Immediately trigger Sankey refresh with the new thresholds to avoid race condition
            const { filters } = state
            const hasActiveFilters = Object.values(filters).some(
              filterArray => filterArray && filterArray.length > 0
            )

            if (hasActiveFilters) {
              // Use setTimeout to ensure the state update completes first
              setTimeout(() => {
                get().fetchSankeyData(false, newNodeThresholds)
              }, 0)
            }

            return {
              nodeThresholds: newNodeThresholds,
              errors: { ...state.errors, sankey: null }
            }
          },
          false,
          'setNodeThreshold'
        )
      },

      clearNodeThreshold: (parentNodeId: string, metric?: MetricType) => {
        set(
          (state) => {
            const nodeThresholds = { ...state.nodeThresholds }

            if (metric) {
              // Clear specific metric for parent node
              if (nodeThresholds[parentNodeId]) {
                const updatedNode = { ...nodeThresholds[parentNodeId] }
                delete updatedNode[metric]

                if (Object.keys(updatedNode).length === 0) {
                  delete nodeThresholds[parentNodeId]
                } else {
                  nodeThresholds[parentNodeId] = updatedNode
                }
              }
            } else {
              // Clear all thresholds for parent node
              delete nodeThresholds[parentNodeId]
            }

            return {
              nodeThresholds,
              errors: { ...state.errors, sankey: null }
            }
          },
          false,
          'clearNodeThreshold'
        )
      },

      resetNodeThresholds: () => {
        set(
          (state) => ({
            nodeThresholds: initialNodeThresholds,
            errors: { ...state.errors, sankey: null }
          }),
          false,
          'resetNodeThresholds'
        )
      },

      // ============================================================================
      // HIERARCHICAL THRESHOLD ACTIONS
      // ============================================================================

      setThresholdGroup: (groupId: string, metric: MetricType, threshold: number) => {
        console.log(`🎯 Setting threshold group: ${groupId}.${metric} = ${threshold}`)

        set(
          (state) => {
            const newHierarchical = { ...state.hierarchicalThresholds }

            // Handle semantic distance threshold groups
            if (metric === 'semdist_mean' && groupId.startsWith('split_') && !groupId.includes('_semdist_')) {
              newHierarchical.semantic_distance_groups = {
                ...newHierarchical.semantic_distance_groups,
                [groupId]: threshold
              }
            }
            // Handle score agreement threshold groups
            else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                     groupId.includes('_semdist_')) {
              // Get existing scores or use global defaults
              const existingScores = newHierarchical.score_agreement_groups?.[groupId] || {}
              const globalScore = state.thresholds.score_high

              // Set all three scores - use existing values or global defaults
              newHierarchical.score_agreement_groups = {
                ...newHierarchical.score_agreement_groups,
                [groupId]: {
                  score_fuzz: existingScores.score_fuzz ?? globalScore,
                  score_simulation: existingScores.score_simulation ?? globalScore,
                  score_detection: existingScores.score_detection ?? globalScore,
                  // Update the specific metric with the new threshold
                  [metric]: threshold
                }
              }
            }

            console.log('🎯 New hierarchicalThresholds state:', JSON.stringify(newHierarchical, null, 2))

            // Immediately trigger Sankey refresh with the new hierarchical thresholds
            const { filters } = state
            const hasActiveFilters = Object.values(filters).some(
              filterArray => filterArray && filterArray.length > 0
            )

            if (hasActiveFilters) {
              // Use setTimeout to ensure the state update completes first
              setTimeout(() => {
                get().fetchSankeyData(false)
              }, 0)
            }

            return {
              hierarchicalThresholds: newHierarchical,
              errors: { ...state.errors, sankey: null }
            }
          },
          false,
          'setThresholdGroup'
        )
      },

      clearThresholdGroup: (groupId: string, metric?: MetricType) => {
        set(
          (state) => {
            const newHierarchical = { ...state.hierarchicalThresholds }

            if (metric) {
              // Clear specific metric for the group
              if (metric === 'semdist_mean' && newHierarchical.semantic_distance_groups?.[groupId]) {
                const { [groupId]: removed, ...rest } = newHierarchical.semantic_distance_groups
                newHierarchical.semantic_distance_groups = rest
              } else if ((metric === 'score_fuzz' || metric === 'score_simulation' || metric === 'score_detection') &&
                         newHierarchical.score_agreement_groups?.[groupId]) {
                const groupScores = { ...newHierarchical.score_agreement_groups[groupId] }
                delete groupScores[metric]

                if (Object.keys(groupScores).length === 0) {
                  const { [groupId]: removed, ...rest } = newHierarchical.score_agreement_groups
                  newHierarchical.score_agreement_groups = rest
                } else {
                  newHierarchical.score_agreement_groups = {
                    ...newHierarchical.score_agreement_groups,
                    [groupId]: groupScores
                  }
                }
              }
            } else {
              // Clear all thresholds for the group
              if (newHierarchical.semantic_distance_groups?.[groupId]) {
                const { [groupId]: removed, ...rest } = newHierarchical.semantic_distance_groups
                newHierarchical.semantic_distance_groups = rest
              }
              if (newHierarchical.score_agreement_groups?.[groupId]) {
                const { [groupId]: removed, ...rest } = newHierarchical.score_agreement_groups
                newHierarchical.score_agreement_groups = rest
              }
            }

            return {
              hierarchicalThresholds: newHierarchical,
              errors: { ...state.errors, sankey: null }
            }
          },
          false,
          'clearThresholdGroup'
        )
      },

      getEffectiveThresholdForNode: (nodeId: string, metric: MetricType) => {
        const { hierarchicalThresholds } = get()
        return getEffectiveThreshold(nodeId, metric, hierarchicalThresholds)
      },

      getNodesInSameThresholdGroup: (nodeId: string, metric: MetricType) => {
        const { sankeyData } = get()
        if (!sankeyData) return []

        const groupId = getThresholdGroupId(nodeId, metric)
        if (!groupId) return [nodeId] // Node doesn't belong to a group, only itself

        return getNodesInThresholdGroup(groupId, sankeyData.nodes, metric)
      },

      // ============================================================================
      // POPOVER ACTIONS
      // ============================================================================

      showHistogramPopover: (nodeId: string, nodeName: string, metrics: MetricType[], position: { x: number, y: number }, parentNodeId?: string, parentNodeName?: string) => {
        set(
          (state) => ({
            popoverState: {
              ...state.popoverState,
              histogram: {
                nodeId,
                nodeName,
                parentNodeId,
                parentNodeName,
                metrics,
                position,
                visible: true
              }
            },
            currentMetric: metrics[0], // Set first metric as current for backwards compatibility
            errors: { ...state.errors, histogram: null }
          }),
          false,
          'showHistogramPopover'
        )
      },

      hideHistogramPopover: () => {
        set(
          (state) => ({
            popoverState: {
              ...state.popoverState,
              histogram: null
            }
          }),
          false,
          'hideHistogramPopover'
        )
      },

      // ============================================================================
      // API ACTIONS
      // ============================================================================

      fetchFilterOptions: async () => {
        set(
          (state) => ({
            loading: { ...state.loading, filters: true },
            errors: { ...state.errors, filters: null }
          }),
          false,
          'fetchFilterOptions:start'
        )

        try {
          const filterOptions = await api.getFilterOptions()

          set(
            (state) => ({
              filterOptions,
              loading: { ...state.loading, filters: false }
            }),
            false,
            'fetchFilterOptions:success'
          )
        } catch (error) {
          const errorMessage = getErrorMessage(error)

          set(
            (state) => ({
              loading: { ...state.loading, filters: false },
              errors: { ...state.errors, filters: errorMessage }
            }),
            false,
            'fetchFilterOptions:error'
          )

          console.error('Failed to fetch filter options:', error)
        }
      },

      fetchHistogramData: async (debounced: boolean = false, nodeId?: string) => {
        const { filters, currentMetric } = get()

        // Don't fetch if no filters are active
        if (!hasActiveFilters(filters)) {
          set(
            (state) => ({
              histogramData: null,
              loading: { ...state.loading, histogram: false }
            }),
            false,
            'fetchHistogramData:noFilters'
          )
          return
        }

        set(
          (state) => ({
            loading: { ...state.loading, histogram: true },
            errors: { ...state.errors, histogram: null }
          }),
          false,
          'fetchHistogramData:start'
        )

        try {
          const request = {
            filters,
            metric: currentMetric,
            bins: 20,
            ...(nodeId && { nodeId })
          }

          const histogramData = debounced
            ? await api.getHistogramDataDebounced(request)
            : await api.getHistogramData(request)

          // Automatically update the threshold to the mean value
          const newThreshold = histogramData.statistics.mean

          set(
            (state) => {
              const thresholdKey = currentMetric === 'semdist_mean'
                ? 'semdist_mean'
                : currentMetric.includes('score') ? 'score_high' : currentMetric

              return {
                histogramData: { [currentMetric]: histogramData } as Record<string, HistogramData>,
                loading: { ...state.loading, histogram: false },
                // Update the global threshold to the mean value
                thresholds: {
                  ...state.thresholds,
                  ...(thresholdKey in state.thresholds && { [thresholdKey]: newThreshold })
                }
              }
            },
            false,
            'fetchHistogramData:success'
          )
        } catch (error) {
          const errorMessage = getErrorMessage(error)

          set(
            (state) => ({
              loading: { ...state.loading, histogram: false },
              errors: { ...state.errors, histogram: errorMessage }
            }),
            false,
            'fetchHistogramData:error'
          )

          console.error('Failed to fetch histogram data:', error)
        }
      },

      fetchMultipleHistogramData: async (metrics: MetricType[], debounced: boolean = false, nodeId?: string) => {
        const { filters } = get()

        // Don't fetch if no filters are active
        if (!hasActiveFilters(filters)) {
          set(
            (state) => ({
              histogramData: null,
              loading: { ...state.loading, histogram: false }
            }),
            false,
            'fetchMultipleHistogramData:noFilters'
          )
          return
        }

        set(
          (state) => ({
            loading: { ...state.loading, histogram: true },
            errors: { ...state.errors, histogram: null }
          }),
          false,
          'fetchMultipleHistogramData:start'
        )

        try {
          // Create parallel API requests for all metrics
          const requests = metrics.map(metric => {
            const request = {
              filters,
              metric,
              bins: 20,
              ...(nodeId && { nodeId })
            }

            return debounced
              ? api.getHistogramDataDebounced(request)
              : api.getHistogramData(request)
          })

          // Execute all requests in parallel
          const histogramResults = await Promise.all(requests)

          // Build the histogram data map
          const histogramDataMap: Record<string, HistogramData> = {}
          metrics.forEach((metric, index) => {
            histogramDataMap[metric] = histogramResults[index]
          })

          // Automatically update thresholds to the mean values
          const newThresholds = { ...get().thresholds }

          metrics.forEach((metric, index) => {
            const meanValue = histogramResults[index].statistics.mean

            if (metric === 'semdist_mean') {
              newThresholds.semdist_mean = meanValue
            } else if (metric.includes('score')) {
              // For score metrics, update the score_high threshold
              // We'll use the average of all score means if multiple scores are fetched
              const scoreMetrics = metrics.filter(m => m.includes('score'))
              if (scoreMetrics.length > 0) {
                const scoreMeans = scoreMetrics.map((_, idx) =>
                  metrics.indexOf(_) !== -1 ? histogramResults[metrics.indexOf(_)].statistics.mean : 0
                ).filter(v => v > 0)
                newThresholds.score_high = scoreMeans.reduce((a, b) => a + b, 0) / scoreMeans.length
              }
            }
          })

          set(
            (state) => ({
              histogramData: histogramDataMap,
              loading: { ...state.loading, histogram: false },
              thresholds: newThresholds
            }),
            false,
            'fetchMultipleHistogramData:success'
          )
        } catch (error) {
          const errorMessage = getErrorMessage(error)

          set(
            (state) => ({
              loading: { ...state.loading, histogram: false },
              errors: { ...state.errors, histogram: errorMessage }
            }),
            false,
            'fetchMultipleHistogramData:error'
          )

          console.error('Failed to fetch multiple histogram data:', error)
        }
      },

      fetchSankeyData: async (debounced: boolean = false, nodeThresholdsOverride?: NodeThresholds) => {
        const { filters, thresholds, nodeThresholds, hierarchicalThresholds } = get()
        const actualNodeThresholds = nodeThresholdsOverride || nodeThresholds

        // Don't fetch if no filters are active
        if (!hasActiveFilters(filters)) {
          set(
            (state) => ({
              sankeyData: null,
              loading: { ...state.loading, sankey: false }
            }),
            false,
            'fetchSankeyData:noFilters'
          )
          return
        }

        set(
          (state) => ({
            loading: { ...state.loading, sankey: true },
            errors: { ...state.errors, sankey: null }
          }),
          false,
          'fetchSankeyData:start'
        )

        try {
          // Create request with hierarchical thresholds
          const request = {
            filters,
            thresholds,
            ...(Object.keys(actualNodeThresholds).length > 0 && { nodeThresholds: actualNodeThresholds }),
            hierarchicalThresholds
          }

          // Debug: Log the request to see what hierarchical thresholds are being sent
          console.log('🔍 Sankey API Request:', JSON.stringify(request, null, 2))

          const sankeyData = debounced
            ? await api.getSankeyDataDebounced(request)
            : await api.getSankeyData(request)

          set(
            (state) => ({
              sankeyData,
              loading: { ...state.loading, sankey: false }
            }),
            false,
            'fetchSankeyData:success'
          )
        } catch (error) {
          const errorMessage = getErrorMessage(error)

          set(
            (state) => ({
              loading: { ...state.loading, sankey: false },
              errors: { ...state.errors, sankey: errorMessage }
            }),
            false,
            'fetchSankeyData:error'
          )

          console.error('Failed to fetch Sankey data:', error)
        }
      },

      // ============================================================================
      // ERROR HANDLING
      // ============================================================================

      clearError: (key: keyof ErrorState) => {
        set(
          (state) => ({
            errors: { ...state.errors, [key]: null }
          }),
          false,
          'clearError'
        )
      },

      clearAllErrors: () => {
        set(
          () => ({
            errors: initialErrors
          }),
          false,
          'clearAllErrors'
        )
      },

      // ============================================================================
      // RESET ACTIONS
      // ============================================================================

      resetFilters: () => {
        set(
          (state) => ({
            filters: initialFilters,
            histogramData: null,
            sankeyData: null,
            errors: { ...state.errors, histogram: null, sankey: null }
          }),
          false,
          'resetFilters'
        )
      },

      resetThresholds: () => {
        set(
          (state) => ({
            thresholds: initialThresholds,
            nodeThresholds: initialNodeThresholds,
            hierarchicalThresholds: initialHierarchicalThresholds,
            errors: { ...state.errors, sankey: null }
          }),
          false,
          'resetThresholds'
        )
      },

      resetAll: () => {
        // Clear any pending debounced requests
        api.clearDebounce()

        set(
          () => ({
            filters: initialFilters,
            thresholds: initialThresholds,
            nodeThresholds: initialNodeThresholds,
            hierarchicalThresholds: initialHierarchicalThresholds,
            popoverState: initialPopoverState,
            filterOptions: null,
            histogramData: null,
            sankeyData: null,
            loading: initialLoading,
            errors: initialErrors,
            currentMetric: 'semdist_mean' as MetricType
          }),
          false,
          'resetAll'
        )
      }
    }),
    {
      name: 'visualization-store',
      // Only persist filters and thresholds, not data or loading states
      partialize: (state: any) => ({
        filters: state.filters,
        thresholds: state.thresholds,
        nodeThresholds: state.nodeThresholds,
        hierarchicalThresholds: state.hierarchicalThresholds,
        currentMetric: state.currentMetric
      })
    }
  )
)

// ============================================================================
// SELECTOR HOOKS
// ============================================================================

// Convenience selectors for common state combinations
export const useFilters = () => useVisualizationStore((state) => state.filters)
export const useThresholds = () => useVisualizationStore((state) => state.thresholds)
export const useNodeThresholds = () => useVisualizationStore((state) => state.nodeThresholds)
export const useHierarchicalThresholds = () => useVisualizationStore((state) => state.hierarchicalThresholds)
export const usePopoverState = () => useVisualizationStore((state) => state.popoverState)
export const useFilterOptions = () => useVisualizationStore((state) => state.filterOptions)
export const useHistogramData = () => useVisualizationStore((state) => state.histogramData)
export const useSankeyData = () => useVisualizationStore((state) => state.sankeyData)
export const useLoading = () => useVisualizationStore((state) => state.loading)
export const useErrors = () => useVisualizationStore((state) => state.errors)

// Combined selectors
export const useFilterState = () => useVisualizationStore((state) => ({
  filters: state.filters,
  filterOptions: state.filterOptions,
  loading: state.loading.filters,
  error: state.errors.filters
}))

export const useHistogramState = () => useVisualizationStore((state) => ({
  data: state.histogramData,
  threshold: state.thresholds.semdist_mean,
  metric: state.currentMetric,
  loading: state.loading.histogram,
  error: state.errors.histogram
}))

// New selector for getting histogram data for a specific metric
export const useHistogramDataForMetric = (metric: MetricType) => useVisualizationStore((state) =>
  state.histogramData?.[metric] || null
)

export const useSankeyState = () => useVisualizationStore((state) => ({
  data: state.sankeyData,
  loading: state.loading.sankey,
  error: state.errors.sankey
}))


// Get threshold for specific node and metric
export const useNodeThreshold = (parentNodeId: string, metric: MetricType) =>
  useVisualizationStore((state) => state.nodeThresholds[parentNodeId]?.[metric])

export default useVisualizationStore