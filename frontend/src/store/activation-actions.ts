import * as api from '../api'
import type { ActivationExamples } from '../types'

// ============================================================================
// MODULE-LEVEL CACHE
// ============================================================================

/**
 * Module-level cache for activation examples.
 *
 * This cache persists outside the React/Zustand lifecycle, surviving:
 * - React StrictMode double-renders
 * - Zustand store recreations
 * - Component remounts
 *
 * Only cleared on actual page reload or explicit clearActivationCache() call.
 * This is critical because activation data never changes during a session.
 */
let activationExamplesCache: Record<number, ActivationExamples> | null = null
let activationFetchInProgress = false

// ============================================================================
// ACTIVATION DATA ACTIONS
// ============================================================================

/**
 * Factory function to create activation data-related actions for the store
 *
 * This module provides centralized caching and request deduplication for
 * activation examples data, eliminating duplicate fetches across components.
 */
export const createActivationActions = (set: any, get: any) => ({
  /**
   * Fetch activation examples for given feature IDs with smart deduplication
   *
   * Features:
   * - Skips already-cached features (cache hit)
   * - Skips currently-loading features (deduplication)
   * - Batches remaining features into single API call
   * - Updates global cache for all components to use
   *
   * @param featureIds - Array of feature IDs to fetch
   * @returns Promise that resolves when fetch completes
   */
  fetchActivationExamples: async (featureIds: number[]) => {
    const { activationExamples, activationLoading } = get()

    if (!featureIds || featureIds.length === 0) {
      console.log('[Store.fetchActivationExamples] No feature IDs provided, skipping')
      return
    }

    // Filter out already-cached and currently-loading features
    const uniqueIds = Array.from(new Set(featureIds))
    const uncachedIds = uniqueIds.filter(id => {
      const isCached = activationExamples[id] !== undefined
      const isLoading = activationLoading.has(id)
      return !isCached && !isLoading
    })

    if (uncachedIds.length === 0) {
      console.log('[Store.fetchActivationExamples] All features already cached or loading, skipping')
      return
    }

    console.log('[Store.fetchActivationExamples] Fetching activation examples:', {
      requested: featureIds.length,
      unique: uniqueIds.length,
      uncached: uncachedIds.length,
      sampleIds: uncachedIds.slice(0, 10)
    })

    // Mark features as loading (deduplication)
    set((state: any) => ({
      activationLoading: new Set([...state.activationLoading, ...uncachedIds]),
      activationLoadingState: true
    }))

    try {
      // Fetch activation examples from API
      const examples = await api.getActivationExamples(uncachedIds)

      console.log('[Store.fetchActivationExamples] Received activation examples:', {
        fetched: Object.keys(examples).length,
        sampleKeys: Object.keys(examples).slice(0, 5)
      })

      // Merge into global cache
      set((state: any) => ({
        activationExamples: {
          ...state.activationExamples,
          ...examples
        },
        // Remove fetched IDs from loading set
        activationLoading: new Set(
          Array.from(state.activationLoading as Set<number>).filter(
            (id: number) => !uncachedIds.includes(id)
          )
        )
      }))

      // Check if all loading complete
      const updatedState = get()
      if (updatedState.activationLoading.size === 0) {
        set({ activationLoadingState: false })
      }

      console.log('[Store.fetchActivationExamples] Successfully cached activation examples')
    } catch (error) {
      console.error('[Store.fetchActivationExamples] Failed to fetch:', error)

      // Remove failed IDs from loading set
      set((state: any) => ({
        activationLoading: new Set(
          Array.from(state.activationLoading as Set<number>).filter(
            (id: number) => !uncachedIds.includes(id)
          )
        ),
        activationLoadingState: state.activationLoading.size > uncachedIds.length
      }))

      throw error
    }
  },

  /**
   * Get activation data for a specific feature (selector)
   *
   * @param featureId - Feature ID to retrieve
   * @returns Activation examples or undefined if not cached
   */
  getActivationData: (featureId: number): ActivationExamples | undefined => {
    const state = get()
    return state.activationExamples[featureId]
  },

  /**
   * Check if activation data is cached for a feature
   *
   * @param featureId - Feature ID to check
   * @returns true if cached, false otherwise
   */
  isActivationDataCached: (featureId: number): boolean => {
    const state = get()
    return state.activationExamples[featureId] !== undefined
  },

  /**
   * Check if activation data is currently loading for a feature
   *
   * @param featureId - Feature ID to check
   * @returns true if loading, false otherwise
   */
  isActivationDataLoading: (featureId: number): boolean => {
    const state = get()
    return state.activationLoading.has(featureId)
  },

  /**
   * Pre-fetch activation data for all features in table
   *
   * This is called automatically after fetchTableData() completes.
   * It batches ALL feature IDs (main table + similar features) into
   * a single API call, so components render instantly from cache.
   *
   * ⚠️ LIMITATION: Only pre-fetches features from initial 824-row table.
   *    Full dataset has 16,384 features. Additional features appear when
   *    decoder similarity stages are added.
   *
   * 🔧 TEMPORARY FIX: DecoderSimilarityTable.tsx has a useEffect that fetches
   *    missing features on-demand. Remove that when full dataset is loaded.
   *
   * TODO: Implement one of:
   *       1. Pre-fetch all 16,384 features (memory intensive but simple)
   *       2. Pagination/virtual scrolling with on-demand loading
   *       3. Load full table data initially instead of filtered 824 rows
   */
  prefetchAllActivationData: async () => {
    const state = get()
    const { tableData } = state

    if (!tableData || !tableData.features) {
      console.log('[Store.prefetchAllActivationData] No table data available, skipping')
      return
    }

    console.log('[Store.prefetchAllActivationData] Starting pre-fetch for all activation data')

    // Collect ALL feature IDs that will be needed
    const allFeatureIds = new Set<number>()

    // 1. Main table features
    tableData.features.forEach((feature: any) => {
      allFeatureIds.add(feature.feature_id)
    })

    // 2. Similar features from decoder similarity data (if available)
    // These are shown in DecoderSimilarityTable when stages are added
    tableData.features.forEach((feature: any) => {
      if (feature.top_similar_features) {
        feature.top_similar_features.forEach((similar: any) => {
          allFeatureIds.add(similar.feature_id)
        })
      }
    })

    const featureIdArray = Array.from(allFeatureIds)

    console.log('[Store.prefetchAllActivationData] Total unique features to pre-fetch:', {
      mainFeatures: tableData.features.length,
      totalUnique: featureIdArray.length,
      sampleIds: featureIdArray.slice(0, 10)
    })

    // Fetch all at once
    await state.fetchActivationExamples(featureIdArray)

    console.log('[Store.prefetchAllActivationData] Pre-fetch complete - all components can render instantly')
  },

  /**
   * Fetch ALL activation examples in parallel chunks for fast initialization.
   *
   * This enables loading all 16k+ activation examples during init by:
   * - Splitting feature IDs into manageable chunks
   * - Firing all chunk requests in parallel
   * - Leveraging existing fetchActivationExamples for caching/deduplication
   *
   * @param featureIds - Array of ALL feature IDs to fetch
   * @param chunkSize - Number of features per chunk (default 2000)
   *
   * @deprecated Use fetchAllActivationsCached() for better performance
   */
  fetchAllActivationsChunked: async (featureIds: number[], chunkSize: number = 2000) => {
    if (!featureIds || featureIds.length === 0) {
      console.log('[Store.fetchAllActivationsChunked] No feature IDs provided, skipping')
      return
    }

    // Split into chunks
    const chunks: number[][] = []
    for (let i = 0; i < featureIds.length; i += chunkSize) {
      chunks.push(featureIds.slice(i, i + chunkSize))
    }

    console.log(`[Store.fetchAllActivationsChunked] Loading ${featureIds.length} features in ${chunks.length} parallel chunks (${chunkSize} per chunk)`)

    const startTime = performance.now()

    // Fire all chunks in parallel - fetchActivationExamples handles caching/deduplication
    await Promise.all(chunks.map((chunk, index) => {
      console.log(`[Store.fetchAllActivationsChunked] Starting chunk ${index + 1}/${chunks.length} (${chunk.length} features)`)
      return get().fetchActivationExamples(chunk)
    }))

    const duration = performance.now() - startTime
    console.log(`[Store.fetchAllActivationsChunked] ✅ All ${featureIds.length} activation examples loaded in ${duration.toFixed(0)}ms`)
  },

  /**
   * Fetch ALL activation examples using pre-computed cached endpoint.
   *
   * This is the OPTIMIZED method for loading all activation examples:
   * - Single request for all ~16k features
   * - Binary format (MessagePack + gzip) for fast transfer
   * - Pre-computed on backend startup
   *
   * Performance: ~15-25s vs ~100s for chunked JSON loading
   */
  fetchAllActivationsCached: async () => {
    // Check module-level cache first (survives store recreation)
    if (activationExamplesCache && Object.keys(activationExamplesCache).length > 0) {
      console.log('[Store.fetchAllActivationsCached] Using module-level cache:', {
        cacheSize: Object.keys(activationExamplesCache).length
      })
      set({
        activationExamples: activationExamplesCache,
        activationLoading: new Set<number>(),
        activationLoadingState: false
      })
      return
    }

    // Check module-level loading flag (prevents race condition across store recreations)
    if (activationFetchInProgress) {
      console.log('[Store.fetchAllActivationsCached] Fetch already in progress (module-level), skipping')
      return
    }

    const state = get()

    // Check store-level cache (fallback)
    const cacheSize = Object.keys(state.activationExamples).length
    if (cacheSize > 0) {
      console.log('[Store.fetchAllActivationsCached] Store cache already populated:', { cacheSize })
      // Also update module-level cache for future store recreations
      activationExamplesCache = state.activationExamples
      return
    }

    console.log('[Store.fetchAllActivationsCached] Starting cached activation fetch...')

    // Set both module-level and store-level loading flags
    activationFetchInProgress = true
    set({ activationLoadingState: true })

    const startTime = performance.now()

    try {
      // Fetch all activation examples from cached endpoint
      const examples = await api.getAllActivationExamplesCached()

      const featureCount = Object.keys(examples).length
      const duration = performance.now() - startTime

      console.log(`[Store.fetchAllActivationsCached] ✅ Loaded ${featureCount} features in ${duration.toFixed(0)}ms`)

      // Store in both module-level and store-level cache
      activationExamplesCache = examples
      activationFetchInProgress = false

      set({
        activationExamples: examples,
        activationLoading: new Set<number>(),
        activationLoadingState: false
      })

    } catch (error) {
      console.error('[Store.fetchAllActivationsCached] Failed:', error)
      activationFetchInProgress = false
      set({ activationLoadingState: false })
      throw error
    }
  },

  /**
   * Clear activation cache (for memory management or testing)
   * Clears both module-level and store-level caches.
   */
  clearActivationCache: () => {
    console.log('[Store.clearActivationCache] Clearing activation examples cache (both module and store level)')
    // Clear module-level cache
    activationExamplesCache = null
    activationFetchInProgress = false
    // Clear store-level cache
    set({
      activationExamples: {},
      activationLoading: new Set<number>(),
      activationLoadingState: false
    })
  }
})
