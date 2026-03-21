import msgpack from 'msgpack-lite'
import pako from 'pako'
import type {
  FilterOptions,
  HistogramData,
  HistogramDataRequest,
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
  CauseClassificationResponse,
  WeightedFeatureId,
  WeightedPairKey,
  CauseSelectionItem,
  ConsensusResponse
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
  TABLE_DATA: "/table-data",
  FEATURE_GROUPS: "/feature-groups",
  ACTIVATION_EXAMPLES: "/activation-examples",
  ACTIVATION_EXAMPLES_CACHED: "/activation-examples-cached",
  SIMILARITY_SORT: "/similarity-sort",
  PAIR_SIMILARITY_SORT: "/pair-similarity-sort",
  SIMILARITY_SCORE_HISTOGRAM: "/similarity-score-histogram",
  PAIR_SIMILARITY_SCORE_HISTOGRAM: "/pair-similarity-score-histogram",
  FILTERED_CLUSTER_PAIRS: "/filtered-cluster-pairs",
  CAUSE_CLASSIFICATION: "/cause-classification",
  COLD_START_SUGGESTIONS: "/cold-start-suggestions",
  FEATURE_CONSENSUS: "/feature-consensus"
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
    console.error('[API] activating examples error:', response.status, errorText)
    throw new Error(`Failed to fetch activating examples: ${response.status} - ${errorText}`)
  }
  const data = await response.json()
  console.log('[API] getActivationExamples response:', {
    examplesCount: data.examples ? Object.keys(data.examples).length : 0,
    sampleKeys: data.examples ? Object.keys(data.examples).slice(0, 5) : []
  })
  return data.examples || {}
}

// ============================================================================
// IndexedDB Cache for Activation Data
// ============================================================================

const IDB_NAME = 'activation-cache'
const IDB_STORE = 'blobs'
const IDB_KEY = 'activations'

interface CachedActivationData {
  contentLength: string
  data: Record<number, ActivationExamples>
}

function openActivationDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase): Promise<CachedActivationData | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
    req.onsuccess = () => resolve(req.result as CachedActivationData | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, value: CachedActivationData): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(value, IDB_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get ALL activating examples as pre-computed cached data (MessagePack + gzip).
 *
 * This is the optimized bulk loading endpoint that returns all ~16k features
 * in a single request using binary serialization and compression.
 *
 * Performance: ~15-25s vs ~100s for chunked JSON loading
 *
 * @returns Record mapping feature_id to ActivationExamples
 */
// Stores Content-Length from last successful fetch (used as IndexedDB cache key)
let _lastFetchContentLength: string | null = null

async function fetchActivationsCachedOnce(): Promise<Record<number, ActivationExamples>> {
  const startTime = performance.now()

  // Timeout after 2 minutes for the large (~136MB) transfer
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${API_ENDPOINTS.ACTIVATION_EXAMPLES_CACHED}`, {
      signal: controller.signal
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Activation data fetch timed out after 120 seconds')
    }
    throw error
  }

  if (!response.ok) {
    clearTimeout(timeoutId)
    const errorText = await response.text()
    console.error('[API] Cached activating examples error:', response.status, errorText)
    throw new Error(`Failed to fetch cached activating examples: ${response.status} - ${errorText}`)
  }

  const fetchTime = performance.now() - startTime
  console.log(`[API] getAllActivationExamplesCached: Fetch completed in ${fetchTime.toFixed(0)}ms`)

  // Get the compressed binary data
  const compressedData = await response.arrayBuffer()
  clearTimeout(timeoutId)

  // Validate response is not empty or truncated
  if (compressedData.byteLength === 0) {
    throw new Error('Activation data response was empty')
  }
  const expectedLength = response.headers.get('Content-Length')
  if (expectedLength && compressedData.byteLength !== parseInt(expectedLength, 10)) {
    throw new Error(`Activation data truncated: received ${compressedData.byteLength} bytes, expected ${expectedLength}`)
  }

  const compressedSize = compressedData.byteLength

  // Store Content-Length for IndexedDB cache key
  _lastFetchContentLength = expectedLength || String(compressedSize)

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

  if (featureCount === 0) {
    throw new Error('Activation data decoded but contained 0 features')
  }

  console.log(`[API] getAllActivationExamplesCached: Decoded ${featureCount} features in ${decodeTime.toFixed(0)}ms (total: ${totalTime.toFixed(0)}ms)`)

  return data.examples
}

const ACTIVATION_FETCH_MAX_RETRIES = 3

export async function getAllActivationExamplesCached(): Promise<Record<number, ActivationExamples>> {
  const startTime = performance.now()

  // Step 1: Check IndexedDB cache — validate against backend Content-Length via HEAD request
  try {
    const db = await openActivationDB()
    const cached = await idbGet(db)
    db.close()
    if (cached && cached.contentLength && cached.data) {
      const featureCount = Object.keys(cached.data).length
      if (featureCount > 0) {
        // Validate: check if backend blob size changed (catches pipeline reruns + threshold changes)
        try {
          const headResp = await fetch(`${BASE_URL}/api/activation-examples-cached`, { method: 'HEAD' })
          const backendLength = headResp.headers.get('Content-Length')
          if (backendLength && backendLength !== cached.contentLength) {
            console.log(`[API] IndexedDB cache stale — backend ${backendLength} vs cached ${cached.contentLength}, refetching`)
          } else {
            console.log(`[API] getAllActivationExamplesCached: IndexedDB cache hit — ${featureCount} features in ${(performance.now() - startTime).toFixed(0)}ms`)
            return cached.data
          }
        } catch {
          // HEAD request failed — use cache anyway
          console.log(`[API] getAllActivationExamplesCached: IndexedDB cache hit (HEAD check skipped) — ${featureCount} features`)
          return cached.data
        }
      }
    }
  } catch (e) {
    console.warn('[API] IndexedDB cache read failed, falling back to fetch:', e)
  }

  // Step 2: Cache miss — fetch from backend with retries
  console.log('[API] getAllActivationExamplesCached: Cache miss, fetching from backend...')
  let data: Record<number, ActivationExamples> | null = null
  let contentLength: string | null = null

  for (let attempt = 1; attempt <= ACTIVATION_FETCH_MAX_RETRIES; attempt++) {
    try {
      data = await fetchActivationsCachedOnce()
      // Retrieve Content-Length for cache key (stored during fetch)
      contentLength = _lastFetchContentLength
      break
    } catch (error) {
      if (attempt === ACTIVATION_FETCH_MAX_RETRIES) throw error
      const delay = 1000 * Math.pow(2, attempt - 1)
      console.warn(`[API] getAllActivationExamplesCached: Attempt ${attempt}/${ACTIVATION_FETCH_MAX_RETRIES} failed, retrying in ${delay}ms...`, error)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  if (!data) throw new Error('Unreachable')

  // Step 3: Save to IndexedDB for next reload
  if (contentLength) {
    const saveStart = performance.now()
    try {
      const db = await openActivationDB()
      await idbPut(db, { contentLength, data })
      db.close()
      console.log(`[API] getAllActivationExamplesCached: Saved to IndexedDB in ${(performance.now() - saveStart).toFixed(0)}ms`)
    } catch (e) {
      console.warn('[API] IndexedDB cache write failed (non-fatal):', e)
    }
  }

  return data
}

export async function getSimilaritySort(
  selectedItems: WeightedFeatureId[],
  rejectedItems: WeightedFeatureId[],
  featureIds: number[]
): Promise<SimilaritySortResponse> {
  console.log('[API] getSimilaritySort called with:', {
    selectedCount: selectedItems.length,
    rejectedCount: rejectedItems.length,
    totalFeatures: featureIds.length
  })

  const requestBody: SimilaritySortRequest = {
    selected_items: selectedItems,
    rejected_items: rejectedItems,
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
  selectedItems: WeightedPairKey[],
  rejectedItems: WeightedPairKey[],
  pairKeys: string[]
): Promise<PairSimilaritySortResponse> {
  console.log('[API] getPairSimilaritySort called with:', {
    selectedCount: selectedItems.length,
    rejectedCount: rejectedItems.length,
    totalPairs: pairKeys.length
  })

  const requestBody: PairSimilaritySortRequest = {
    selected_items: selectedItems,
    rejected_items: rejectedItems,
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
  selectedItems: WeightedFeatureId[],
  rejectedItems: WeightedFeatureId[],
  featureIds: number[]
): Promise<SimilarityScoreHistogramResponse> {
  console.log('[API] getSimilarityScoreHistogram called with:', {
    selectedCount: selectedItems.length,
    rejectedCount: rejectedItems.length,
    totalFeatures: featureIds.length
  })

  const requestBody: SimilarityHistogramRequest = {
    selected_items: selectedItems,
    rejected_items: rejectedItems,
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
 * @param selectedItems - Manually selected pairs with sources (training data)
 * @param rejectedItems - Manually rejected pairs with sources (training data)
 * @param options - Either { featureIds, threshold } or { pairKeys }
 */
export async function getPairSimilarityScoreHistogram(
  selectedItems: WeightedPairKey[],
  rejectedItems: WeightedPairKey[],
  options: { featureIds: number[], threshold: number } | { pairKeys: string[] }
): Promise<SimilarityScoreHistogramResponse> {
  const isSimplifiedFlow = 'featureIds' in options

  console.log('[API] getPairSimilarityScoreHistogram called with:', {
    selectedCount: selectedItems.length,
    rejectedCount: rejectedItems.length,
    flow: isSimplifiedFlow ? 'simplified (feature_ids + threshold)' : 'legacy (explicit pair_keys)',
    ...(isSimplifiedFlow
      ? { featureCount: options.featureIds.length, threshold: options.threshold }
      : { totalPairs: options.pairKeys.length })
  })

  const requestBody: PairSimilarityHistogramRequest = {
    selected_items: selectedItems,
    rejected_items: rejectedItems,
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
 * Get filtered cluster-based pairs for a set of features.
 *
 * Uses the filtered endpoint which applies:
 * - Condition 1: decoder_similarity > (1 - threshold)
 * - Condition 2/3: Feature in top-20 semantic OR top-10 decoder ranking
 * - Fallback: Every feature gets at least one pair
 *
 * @param featureIds - Feature IDs to cluster
 * @param threshold - Clustering threshold (0-1)
 * @returns Filtered pair information with metadata
 */
export async function getAllClusterPairs(
  featureIds: number[],
  threshold: number = 0.5
): Promise<AllClusterPairsResponse> {
  console.log(`[API.getAllClusterPairs] Requesting filtered pairs for ${featureIds.length} features at threshold ${threshold}`)

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FILTERED_CLUSTER_PAIRS}`, {
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
    console.error('[API] Get filtered cluster pairs error:', response.status, errorText)
    throw new Error(`Failed to fetch filtered cluster pairs: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log(`[API.getAllClusterPairs] Received ${data.total_pairs} filtered pairs from ${data.total_clusters} clusters`)
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
 * @param causeSelections - Map of feature_id to cause selection with source (manual tags only)
 * @returns Classification results with predicted category and decision scores
 */
export async function getCauseClassification(
  featureIds: number[],
  causeSelections: Record<number, CauseSelectionItem>
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
// COLD-START SUGGESTIONS
// ============================================================================

export interface ColdStartSuggestion {
  id: string
  cluster_id: number
  is_medoid: boolean
  diversity_reason: string
  metrics?: Record<string, number>
}

export interface ColdStartSuggestionsResponse {
  suggestions: ColdStartSuggestion[]
  total_suggestions: number
  mode: 'feature' | 'pair'
  num_clusters: number
  cache_hit: boolean
}

/**
 * Get cold-start suggestions for bootstrapping SVM training.
 *
 * Uses Kennard-Stone algorithm to select diverse, representative samples
 * from the metric space. Helps users tag effectively before the SVM
 * can train (minimum 3 selected + 3 rejected required).
 *
 * @param mode - 'feature' for Stage 2, 'pair' for Stage 1
 * @param featureIds - Feature IDs in current segment
 * @param numSuggestions - Number of suggestions (default 20)
 * @param threshold - Clustering threshold (required for pair mode)
 */
export async function getColdStartSuggestions(
  mode: 'feature' | 'pair',
  featureIds: number[],
  numSuggestions: number = 20,
  threshold?: number,
  randomSeed?: number,
  method?: 'kennard-stone' | 'typiclust' | 'typiclust_odal',
  anomalyRatio?: number
): Promise<ColdStartSuggestionsResponse> {
  console.log('[API] getColdStartSuggestions called with:', {
    mode,
    featureCount: featureIds.length,
    numSuggestions,
    threshold
  })

  const requestBody = {
    mode,
    feature_ids: featureIds,
    num_suggestions: numSuggestions,
    ...(threshold !== undefined && { threshold }),
    ...(randomSeed !== undefined && { random_seed: randomSeed }),
    ...(method !== undefined && { method }),
    ...(anomalyRatio !== undefined && { anomaly_ratio: anomalyRatio })
  }

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.COLD_START_SUGGESTIONS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] Cold-start suggestions error:', response.status, errorText)
    throw new Error(`Failed to fetch cold-start suggestions: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('[API] getColdStartSuggestions response:', {
    totalSuggestions: data.total_suggestions,
    numClusters: data.num_clusters,
    cacheHit: data.cache_hit
  })

  return data
}

// ============================================================================
// CONSENSUS API
// ============================================================================

/**
 * Get consensus data for ALL features in a single request.
 *
 * Returns a map of feature_id → consensus data, preloaded at startup
 * to eliminate per-feature round-trips.
 *
 * @returns Record mapping feature_id to ConsensusResponse
 */
export async function getAllConsensus(): Promise<Record<number, ConsensusResponse>> {
  console.log('[API] getAllConsensus: fetching all consensus data...')
  const startTime = performance.now()

  const response = await fetch(`${API_BASE}${API_ENDPOINTS.FEATURE_CONSENSUS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API] All consensus error:', response.status, errorText)
    throw new Error(`Failed to fetch all consensus: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const featureCount = Object.keys(data).length
  const duration = performance.now() - startTime
  console.log(`[API] getAllConsensus: loaded ${featureCount} features in ${duration.toFixed(0)}ms`)

  return data
}
