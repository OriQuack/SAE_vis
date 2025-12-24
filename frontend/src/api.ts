import msgpack from 'msgpack-lite'
import pako from 'pako'
import type {
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
  FeatureDetail,
  Filters,
  TableDataRequest,
  FeatureTableDataResponse,
  ActivationExamples,
  SimilaritySortRequest,
  SimilaritySortResponse,
  PairSimilaritySortRequest,
  PairSimilaritySortResponse,
  SimilarityHistogramRequest,
  SimilarityScoreHistogramResponse,
  PairSimilarityHistogramRequest,
  CauseSimilaritySortRequest,
  CauseSimilaritySortResponse,
  CauseSimilarityHistogramRequest,
  CauseSimilarityHistogramResponse,
  UmapProjectionResponse,
  MultiModalityResponse,
  CauseClassificationResponse,
  Stage3QualityScoresRequest
} from './types'

// ============================================================================
// METRIC NAME MAPPING (Frontend → Backend)
// ============================================================================

/**
 * Map frontend metric names to backend metric names
 * Frontend uses "semantic_similarity" for display, but backend expects "semsim_mean"
 */
const FRONTEND_TO_BACKEND_METRIC: Record<string, string> = {
  'semantic_similarity': 'semsim_mean'
  // All other metrics (decoder_similarity, score_embedding, quality_score, etc.) use same name
}

/**
 * Convert frontend metric name to backend metric name
 */
function mapMetricToBackend(metric: string): string {
  return FRONTEND_TO_BACKEND_METRIC[metric] || metric
}

// ============================================================================
// API CONFIGURATION
// ============================================================================
const API_BASE_URL = "/api"

const API_ENDPOINTS = {
  FILTER_OPTIONS: "/filter-options",
  HISTOGRAM_DATA: "/histogram-data",
  FEATURE_DETAIL: "/feature",
  TABLE_DATA: "/table-data",
  FEATURE_GROUPS: "/feature-groups",
  ACTIVATION_EXAMPLES: "/activation-examples",
  ACTIVATION_EXAMPLES_CACHED: "/activation-examples-cached",
  SIMILARITY_SORT: "/similarity-sort",
  PAIR_SIMILARITY_SORT: "/pair-similarity-sort",
  SIMILARITY_SCORE_HISTOGRAM: "/similarity-score-histogram",
  PAIR_SIMILARITY_SCORE_HISTOGRAM: "/pair-similarity-score-histogram",
  CAUSE_SIMILARITY_SORT: "/cause-similarity-sort",
  CAUSE_SIMILARITY_SCORE_HISTOGRAM: "/cause-similarity-score-histogram",
  CLUSTER_CANDIDATES: "/cluster-candidates",
  SEGMENT_CLUSTER_PAIRS: "/segment-cluster-pairs",
  UMAP_PROJECTION: "/umap-projection",
  CAUSE_CLASSIFICATION: "/cause-classification",
  MULTI_MODALITY_TEST: "/multi-modality-test",
  STAGE3_QUALITY_SCORES: "/stage3-quality-scores"
} as const

const API_BASE = API_BASE_URL

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FILTER_OPTIONS}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch filter options: ${response.status}`)
  }
  return response.json()
}

export async function getHistogramData(request: HistogramDataRequest): Promise<HistogramData> {
  const backendRequest = {
    ...request,
    metric: mapMetricToBackend(request.metric),  // Map frontend metric to backend metric
    thresholdPath: request.thresholdPath?.map(constraint => ({
      metric: mapMetricToBackend(constraint.metric),  // Map threshold path metrics too
      range_label: constraint.rangeLabel
    }))
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.HISTOGRAM_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backendRequest)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Histogram API error:', response.status, errorText)
    throw new Error(`Failed to fetch histogram data: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getFeatureDetail(featureId: number, params: Partial<Filters> = {}): Promise<FeatureDetail> {
  const url = new URL(`${API_BASE}${API_ENDPOINTS.FEATURE_DETAIL}/${featureId}`, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value && Array.isArray(value) && value.length > 0) {
      value.forEach(v => url.searchParams.append(key, v))
    }
  })

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Failed to fetch feature detail: ${response.status}`)
  }
  return response.json()
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch('/health')
    return response.ok
  } catch {
    return false
  }
}

export async function getTableData(request: TableDataRequest): Promise<FeatureTableDataResponse> {
  const response = await fetch(`${API_BASE}${API_ENDPOINTS.TABLE_DATA}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Table API error:', response.status, errorText)
    throw new Error(`Failed to fetch table data: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getFeatureGroups(request: {
  filters: Filters
  metric: string
  thresholds: number[]
}): Promise<{
  metric: string
  groups: Array<{
    group_index: number
    range_label: string
    feature_ids?: number[]
    feature_ids_by_source?: Record<string, number[]>
    feature_count: number
  }>
  total_features: number
}> {
  // Map frontend metric to backend metric before sending request
  const backendRequest = {
    ...request,
    metric: mapMetricToBackend(request.metric)
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FEATURE_GROUPS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backendRequest)
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Feature groups API error:', response.status, errorText)
    throw new Error(`Failed to fetch feature groups: ${response.status} - ${errorText}`)
  }
  return response.json()
}

export async function getActivationExamples(
  featureIds: number[]
): Promise<Record<number, ActivationExamples>> {
  console.log('[API] getActivationExamples called with', featureIds.length, 'feature IDs:', featureIds.slice(0, 10))

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.ACTIVATION_EXAMPLES}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ feature_ids: featureIds })
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Activation examples error:', response.status, errorText)
    throw new Error(`Failed to fetch activation examples: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  console.log('[API] getActivationExamples response:', {
    examplesCount: data.examples ? Object.keys(data.examples).length : 0,
    sampleKeys: data.examples ? Object.keys(data.examples).slice(0, 5) : []
  })
  return data.examples || {}
}

/**
 * Get ALL activation examples as pre-computed cached data (MessagePack + gzip).
 *
 * This is the optimized bulk loading endpoint that returns all ~16k features
 * in a single request using binary serialization and compression.
 *
 * Performance: ~15-25s vs ~100s for chunked JSON loading
 *
 * @returns Record mapping feature_id to ActivationExamples
 */
export async function getAllActivationExamplesCached(): Promise<Record<number, ActivationExamples>> {
  const startTime = performance.now()
  console.log('[API] getAllActivationExamplesCached: Starting cached fetch...')

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.ACTIVATION_EXAMPLES_CACHED}`)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Cached activation examples error:', response.status, errorText)
    throw new Error(`Failed to fetch cached activation examples: ${response.status} - ${errorText}`)
  }

  const fetchTime = performance.now() - startTime
  console.log(`[API] getAllActivationExamplesCached: Fetch completed in ${fetchTime.toFixed(0)}ms`)

  // Get the compressed binary data
  const compressedData = await response.arrayBuffer()
  const compressedSize = compressedData.byteLength

  // Decompress gzip
  const decompressStart = performance.now()
  const decompressed = pako.ungzip(new Uint8Array(compressedData))
  const decompressTime = performance.now() - decompressStart
  console.log(`[API] getAllActivationExamplesCached: Decompressed ${(compressedSize / 1024 / 1024).toFixed(2)}MB → ${(decompressed.byteLength / 1024 / 1024).toFixed(2)}MB in ${decompressTime.toFixed(0)}ms`)

  // Decode MessagePack
  const decodeStart = performance.now()
  const data = msgpack.decode(decompressed) as { examples: Record<number, ActivationExamples> }
  const decodeTime = performance.now() - decodeStart

  const totalTime = performance.now() - startTime
  const featureCount = Object.keys(data.examples || {}).length

  console.log(`[API] getAllActivationExamplesCached: Decoded ${featureCount} features in ${decodeTime.toFixed(0)}ms (total: ${totalTime.toFixed(0)}ms)`)

  return data.examples || {}
}

export async function getSimilaritySort(
  selectedIds: number[],
  rejectedIds: number[],
  featureIds: number[]
): Promise<SimilaritySortResponse> {
  console.log('[API] getSimilaritySort called with:', {
    selectedCount: selectedIds.length,
    rejectedCount: rejectedIds.length,
    totalFeatures: featureIds.length
  })

  const requestBody: SimilaritySortRequest = {
    selected_ids: selectedIds,
    rejected_ids: rejectedIds,
    feature_ids: featureIds
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.SIMILARITY_SORT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Similarity sort error:', response.status, errorText)
    throw new Error(`Failed to calculate similarity sort: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getSimilaritySort response:', {
    sortedCount: data.sorted_features?.length || 0,
    totalFeatures: data.total_features,
    hasWeights: data.weights_used && data.weights_used.length > 0
  })

  return data
}

export async function getPairSimilaritySort(
  selectedPairKeys: string[],
  rejectedPairKeys: string[],
  pairKeys: string[]
): Promise<PairSimilaritySortResponse> {
  console.log('[API] getPairSimilaritySort called with:', {
    selectedCount: selectedPairKeys.length,
    rejectedCount: rejectedPairKeys.length,
    totalPairs: pairKeys.length
  })

  const requestBody: PairSimilaritySortRequest = {
    selected_pair_keys: selectedPairKeys,
    rejected_pair_keys: rejectedPairKeys,
    pair_keys: pairKeys
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.PAIR_SIMILARITY_SORT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Pair similarity sort error:', response.status, errorText)
    throw new Error(`Failed to calculate pair similarity sort: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getPairSimilaritySort response:', {
    sortedCount: data.sorted_pairs?.length || 0,
    totalPairs: data.total_pairs,
    hasWeights: data.weights_used && data.weights_used.length > 0
  })

  return data
}

// ============================================================================
// SIMILARITY HISTOGRAM API (for automatic tagging)
// ============================================================================

export async function getSimilarityScoreHistogram(
  selectedIds: number[],
  rejectedIds: number[],
  featureIds: number[]
): Promise<SimilarityScoreHistogramResponse> {
  console.log('[API] getSimilarityScoreHistogram called with:', {
    selectedCount: selectedIds.length,
    rejectedCount: rejectedIds.length,
    totalFeatures: featureIds.length
  })

  const requestBody: SimilarityHistogramRequest = {
    selected_ids: selectedIds,
    rejected_ids: rejectedIds,
    feature_ids: featureIds
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.SIMILARITY_SCORE_HISTOGRAM}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Similarity score histogram error:', response.status, errorText)
    throw new Error(`Failed to fetch similarity score histogram: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getSimilarityScoreHistogram response:', {
    totalItems: data.total_items,
    scoresCount: data.scores ? Object.keys(data.scores).length : 0,
    histogramBins: data.histogram?.bins?.length || 0,
    statistics: data.statistics
  })

  return data
}

/**
 * Get pair similarity score histogram (Simplified Flow).
 *
 * Simplified Flow (recommended):
 *   - Pass feature_ids + threshold
 *   - Backend generates pairs via clustering and trains SVM
 *
 * Legacy Flow (backward compatibility):
 *   - Pass explicit pairKeys
 *   - Backend scores provided pairs
 *
 * @param selectedPairKeys - Manually selected pairs (training data)
 * @param rejectedPairKeys - Manually rejected pairs (training data)
 * @param options - Either { featureIds, threshold } or { pairKeys }
 */
export async function getPairSimilarityScoreHistogram(
  selectedPairKeys: string[],
  rejectedPairKeys: string[],
  options: { featureIds: number[], threshold: number } | { pairKeys: string[] }
): Promise<SimilarityScoreHistogramResponse> {
  const isSimplifiedFlow = 'featureIds' in options

  console.log('[API] getPairSimilarityScoreHistogram called with:', {
    selectedCount: selectedPairKeys.length,
    rejectedCount: rejectedPairKeys.length,
    flow: isSimplifiedFlow ? 'simplified (feature_ids + threshold)' : 'legacy (explicit pair_keys)',
    ...(isSimplifiedFlow
      ? { featureCount: options.featureIds.length, threshold: options.threshold }
      : { totalPairs: options.pairKeys.length })
  })

  const requestBody: PairSimilarityHistogramRequest = {
    selected_pair_keys: selectedPairKeys,
    rejected_pair_keys: rejectedPairKeys,
    ...(isSimplifiedFlow
      ? { feature_ids: options.featureIds, threshold: options.threshold }
      : { pair_keys: options.pairKeys })
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.PAIR_SIMILARITY_SCORE_HISTOGRAM}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Pair similarity score histogram error:', response.status, errorText)
    throw new Error(`Failed to fetch pair similarity score histogram: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getPairSimilarityScoreHistogram response:', {
    totalItems: data.total_items,
    scoresCount: data.scores ? Object.keys(data.scores).length : 0,
    histogramBins: data.histogram?.bins?.length || 0,
    statistics: data.statistics
  })

  return data
}

// ============================================================================
// CAUSE SIMILARITY API (Multi-class One-vs-Rest SVM)
// ============================================================================

export async function getCauseSimilaritySort(
  causeSelections: Record<number, string>,
  featureIds: number[]
): Promise<CauseSimilaritySortResponse> {
  console.log('[API] getCauseSimilaritySort called with:', {
    taggedCount: Object.keys(causeSelections).length,
    totalFeatures: featureIds.length
  })

  const requestBody: CauseSimilaritySortRequest = {
    cause_selections: causeSelections,
    feature_ids: featureIds
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.CAUSE_SIMILARITY_SORT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Cause similarity sort error:', response.status, errorText)
    throw new Error(`Failed to calculate cause similarity sort: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getCauseSimilaritySort response:', {
    sortedCount: data.sorted_features?.length || 0,
    totalFeatures: data.total_features
  })

  return data
}

export async function getCauseSimilarityScoreHistogram(
  causeSelections: Record<number, string>,
  featureIds: number[]
): Promise<CauseSimilarityHistogramResponse> {
  console.log('[API] getCauseSimilarityScoreHistogram called with:', {
    taggedCount: Object.keys(causeSelections).length,
    totalFeatures: featureIds.length
  })

  const requestBody: CauseSimilarityHistogramRequest = {
    cause_selections: causeSelections,
    feature_ids: featureIds
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.CAUSE_SIMILARITY_SCORE_HISTOGRAM}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Cause similarity score histogram error:', response.status, errorText)
    throw new Error(`Failed to fetch cause similarity score histogram: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getCauseSimilarityScoreHistogram response:', {
    totalItems: data.total_items,
    scoresCount: data.scores ? Object.keys(data.scores).length : 0,
    histogramsCount: data.histograms ? Object.keys(data.histograms).length : 0
  })

  return data
}

// ============================================================================
// MULTI-MODALITY TEST
// ============================================================================

export async function getMultiModalityTest(
  featureIds: number[],
  causeSelections: Record<number, string>
): Promise<MultiModalityResponse> {
  console.log('[API] getMultiModalityTest called with:', {
    totalFeatures: featureIds.length,
    taggedCount: Object.keys(causeSelections).length
  })

  const requestBody = {
    feature_ids: featureIds,
    cause_selections: causeSelections
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.MULTI_MODALITY_TEST}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Multi-modality test error:', response.status, errorText)
    throw new Error(`Failed to fetch multi-modality test: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getMultiModalityTest response:', {
    aggregateScore: data.multimodality?.aggregate_score,
    categoryCount: data.multimodality?.category_results?.length
  })

  return data
}

// ============================================================================
// CLUSTER-BASED PAIR GENERATION (Simplified Flow)
// ============================================================================

export interface ClusterPair {
  main_id: number
  similar_id: number
  pair_key: string
  cluster_id: number
}

export interface ClusterInfo {
  cluster_id: number
  feature_ids: number[]
  pair_count: number
}

export interface AllClusterPairsResponse {
  pairs: ClusterPair[]                    // Full pair objects for frontend use
  pair_keys: string[]                     // Backward compatibility
  clusters: ClusterInfo[]
  feature_to_cluster: Record<number, number>
  total_clusters: number
  total_pairs: number
  threshold_used: number
}

/**
 * Get ALL cluster-based pairs for a set of features (Simplified Flow).
 *
 * This is the SINGLE endpoint for pair generation:
 * - No sampling (returns ALL pairs from ALL clusters)
 * - Frontend controls display sampling
 * - Used for both candidate display AND histogram
 *
 * @param featureIds - Feature IDs to cluster
 * @param threshold - Clustering threshold (0-1)
 * @returns Complete pair information with metadata
 */
export async function getAllClusterPairs(
  featureIds: number[],
  threshold: number = 0.5
): Promise<AllClusterPairsResponse> {
  console.log(`[API.getAllClusterPairs] Requesting ALL pairs for ${featureIds.length} features at threshold ${threshold}`)

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.SEGMENT_CLUSTER_PAIRS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      feature_ids: featureIds,
      threshold: threshold
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Get all cluster pairs error:', response.status, errorText)
    throw new Error(`Failed to fetch all cluster pairs: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log(`[API.getAllClusterPairs] Received ${data.total_pairs} pairs from ${data.total_clusters} clusters`)
  return data
}

// ============================================================================
// UMAP PROJECTION API (for Stage 3 Cause View)
// ============================================================================

/**
 * Get UMAP 2D projection for features.
 *
 * Projects features into 2D space using cause-related metrics:
 * - semantic_similarity (semsim_mean)
 * - score_detection
 * - score_embedding
 * - score_fuzz
 *
 * Used in Stage 3 (CauseView) to visualize "Need Revision" features
 * in a scatter plot for cause analysis.
 *
 * @param featureIds - Feature IDs to project (minimum 3)
 * @param options - Optional UMAP parameters
 * @returns 2D coordinates for each feature
 */
export async function getUmapProjection(
  featureIds: number[],
  options?: { nNeighbors?: number; minDist?: number; randomState?: number }
): Promise<UmapProjectionResponse> {
  console.log('[API] getUmapProjection called with:', {
    featureCount: featureIds.length,
    options
  })

  const requestBody = {
    feature_ids: featureIds,
    n_neighbors: options?.nNeighbors,
    min_dist: options?.minDist,
    random_state: options?.randomState
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.UMAP_PROJECTION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] UMAP projection error:', response.status, errorText)
    throw new Error(`Failed to fetch UMAP projection: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getUmapProjection response:', {
    pointCount: data.points?.length || 0,
    totalFeatures: data.total_features,
    paramsUsed: data.params_used
  })

  return data
}

/**
 * Get SVM cause classification for features.
 *
 * Classifies features into cause categories using One-vs-Rest SVMs.
 * Uses mean metric vectors per feature (averaged across 3 explainers).
 *
 * Requires at least one manually tagged feature per category.
 *
 * @param featureIds - Feature IDs to classify
 * @param causeSelections - Map of feature_id to cause category (manual tags only)
 * @returns Classification results with predicted category and decision scores
 */
export async function getCauseClassification(
  featureIds: number[],
  causeSelections: Record<number, string>
): Promise<CauseClassificationResponse> {
  console.log('[API] getCauseClassification called with:', {
    featureCount: featureIds.length,
    manualTagCount: Object.keys(causeSelections).length
  })

  const requestBody = {
    feature_ids: featureIds,
    cause_selections: causeSelections
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.CAUSE_CLASSIFICATION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Cause classification error:', response.status, errorText)
    throw new Error(`Failed to fetch cause classification: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getCauseClassification response:', {
    resultCount: data.results?.length || 0,
    totalFeatures: data.total_features,
    categoryCounts: data.category_counts
  })

  return data
}

// ============================================================================
// STAGE 3 QUALITY SCORES API (Using Stage 2 SVM)
// ============================================================================

/**
 * Get Stage 3 quality scores using Stage 2's SVM model.
 *
 * Trains an SVM on Stage 2's final Well-Explained vs Need Revision selections,
 * then scores all specified feature_ids to determine their proximity to the
 * Well-Explained decision boundary.
 *
 * Features with higher scores are closer to the Well-Explained class,
 * indicating they may have been borderline cases suitable for reconsideration.
 *
 * @param wellExplainedIds - Feature IDs tagged as Well-Explained in Stage 2
 * @param needRevisionIds - Feature IDs tagged as Need Revision in Stage 2
 * @param featureIds - Feature IDs to score (typically = needRevisionIds)
 * @returns Histogram response with scores and bimodality detection
 */
export async function getStage3QualityScores(
  wellExplainedIds: number[],
  needRevisionIds: number[],
  featureIds: number[]
): Promise<SimilarityScoreHistogramResponse> {
  console.log('[API] getStage3QualityScores called with:', {
    wellExplainedCount: wellExplainedIds.length,
    needRevisionCount: needRevisionIds.length,
    featuresToScore: featureIds.length
  })

  const requestBody: Stage3QualityScoresRequest = {
    well_explained_ids: wellExplainedIds,
    need_revision_ids: needRevisionIds,
    feature_ids: featureIds
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.STAGE3_QUALITY_SCORES}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Stage 3 quality scores error:', response.status, errorText)
    throw new Error(`Failed to fetch Stage 3 quality scores: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getStage3QualityScores response:', {
    totalItems: data.total_items,
    scoresCount: data.scores ? Object.keys(data.scores).length : 0,
    histogramBins: data.histogram?.bins?.length || 0,
    statistics: data.statistics,
    hasBimodality: !!data.bimodality
  })

  return data
}
