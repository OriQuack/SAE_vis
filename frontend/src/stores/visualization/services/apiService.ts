import { api } from '../../../services/api'
import type {
  FilterOptions,
  HistogramData,
  SankeyData,
  MetricType,
  Filters,
  Thresholds,
  NodeThresholds,
  HierarchicalThresholds
} from '../../../services/types'
import { API_CONFIG } from '../constants'

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface HistogramRequest {
  filters: Filters
  metric: MetricType
  bins?: number
  nodeId?: string
}

export interface SankeyRequest {
  filters: Filters
  thresholds: Thresholds
  nodeThresholds?: NodeThresholds
  hierarchicalThresholds: HierarchicalThresholds
}

export interface MultiHistogramRequest {
  filters: Filters
  metrics: MetricType[]
  bins?: number
  nodeId?: string
}

// ============================================================================
// API SERVICE CLASS
// ============================================================================

class VisualizationApiService {
  /**
   * Fetch available filter options from the backend
   */
  async fetchFilterOptions(): Promise<FilterOptions> {
    return await api.getFilterOptions()
  }

  /**
   * Fetch histogram data for a single metric
   */
  async fetchHistogramData(request: HistogramRequest, debounced = false): Promise<HistogramData> {
    const histogramRequest = {
      filters: request.filters,
      metric: request.metric,
      bins: request.bins ?? API_CONFIG.DEFAULT_BINS,
      ...(request.nodeId && { nodeId: request.nodeId })
    }

    return debounced
      ? await api.getHistogramDataDebounced(histogramRequest)
      : await api.getHistogramData(histogramRequest)
  }

  /**
   * Fetch histogram data for multiple metrics in parallel
   */
  async fetchMultipleHistogramData(request: MultiHistogramRequest, debounced = false): Promise<Record<string, HistogramData>> {
    const requests = request.metrics.map(metric => {
      const histogramRequest = {
        filters: request.filters,
        metric,
        bins: request.bins ?? API_CONFIG.DEFAULT_BINS,
        ...(request.nodeId && { nodeId: request.nodeId })
      }

      return debounced
        ? api.getHistogramDataDebounced(histogramRequest)
        : api.getHistogramData(histogramRequest)
    })

    // Execute all requests in parallel
    const results = await Promise.all(requests)

    // Build the histogram data map
    const histogramDataMap: Record<string, HistogramData> = {}
    request.metrics.forEach((metric, index) => {
      histogramDataMap[metric] = results[index]
    })

    return histogramDataMap
  }

  /**
   * Fetch Sankey diagram data
   */
  async fetchSankeyData(request: SankeyRequest, debounced = false): Promise<SankeyData> {
    const sankeyRequest = {
      filters: request.filters,
      thresholds: request.thresholds,
      ...(request.nodeThresholds && Object.keys(request.nodeThresholds).length > 0 && {
        nodeThresholds: request.nodeThresholds
      }),
      hierarchicalThresholds: request.hierarchicalThresholds
    }

    return debounced
      ? await api.getSankeyDataDebounced(sankeyRequest)
      : await api.getSankeyData(sankeyRequest)
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const visualizationApiService = new VisualizationApiService()