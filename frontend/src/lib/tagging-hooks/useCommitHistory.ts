import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { FlipTrackingInfo } from '../../types'

// ============================================================================
// useCommitHistory - Generic commit history for tagging state snapshots
// ============================================================================
// Extracts common commit history logic from FeatureSplitView, QualityView, and CauseView

export type SelectionState = 'selected' | 'rejected'
export type SelectionSource = 'click' | 'threshold' | 'predicted'
export type CommitType = 'initial' | 'apply' | 'tagAll' | 'verify'

// CauseCategory for Stage 3 (multi-class instead of binary)
export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

// Helper: Check if a source is user-confirmed (should be used for SVM training)
export function isUserConfirmed(source: SelectionSource | undefined): boolean {
  return source === 'click' || source === 'threshold'
}

export interface Commit<TStates, TSources, TCounts = void> {
  id: number
  type: CommitType
  states: TStates
  sources: TSources
  counts?: TCounts  // Optional counts for tooltip preview
  featureIds?: Set<number>  // Feature IDs for stage revisiting
  flipTracking?: FlipTrackingInfo | null  // Decision flip rate tracking state
}

// Display commit format for store (without full states/sources)
export interface DisplayCommit<TCounts = void> {
  id: number
  type: CommitType
  counts?: TCounts
}

// Store sync options - encapsulates all the store sync logic from views
export interface StoreSyncOptions<TStates, TSources, TCounts> {
  // Read from store (for initialization when revisiting)
  isRevisiting: boolean
  stageCommitHistory: DisplayCommit<TCounts>[]
  stageCommitData: Map<number, { states: TStates; sources: TSources; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }> | null
  stageCurrentCommitIndex: number

  // Write to store (for sync) - receives partial updates
  setStoreCommitHistory: (commits: DisplayCommit<TCounts>[]) => void
  setStoreCommitData: (data: Map<number, { states: TStates; sources: TSources; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }>) => void
  setStoreCurrentCommitIndex: (index: number) => void

  // Stage-specific final commit update
  setFinalCommit: (data: { states: TStates; sources: TSources; featureIds: Set<number>; counts: TCounts }) => void
}

interface UseCommitHistoryOptions<TStates, TSources, TCounts = void> {
  /** Function to get current states from store */
  getStatesFromStore: () => TStates
  /** Function to get current sources from store */
  getSourcesFromStore: () => TSources
  /** Function to restore states to store */
  restoreToStore: (states: TStates, sources: TSources) => void
  /** Function to clone states (for immutability) */
  cloneStates: (states: TStates) => TStates
  /** Function to clone sources (for immutability) */
  cloneSources: (sources: TSources) => TSources
  /** Function to create empty states */
  createEmptyStates: () => TStates
  /** Function to create empty sources */
  createEmptySources: () => TSources
  /** Maximum number of commits to keep (default: 10) */
  maxCommits?: number

  // === New options for extended functionality ===

  /** Calculate counts from current state (for commit storage and tooltip preview) */
  calculateCounts?: () => TCounts
  /** Get current feature IDs (for stage revisiting) */
  getFeatureIds?: () => Set<number> | null
  /** Called after creating a commit (for stage-final saving) */
  onCommitCreated?: (commit: Commit<TStates, TSources, TCounts>) => void
  /** Get current flip tracking state (for saving in commits) */
  getFlipTracking?: () => FlipTrackingInfo | null
  /** Restore flip tracking state (when navigating commit history) */
  restoreFlipTracking?: (ft: FlipTrackingInfo | null) => void
  /** Initial commit to restore from (for revisiting a stage) - single commit, backward compatible */
  initialCommit?: Commit<TStates, TSources, TCounts> | null
  /** Full commit array to restore from (for stage revisiting with history) - takes priority over initialCommit */
  initialCommits?: Commit<TStates, TSources, TCounts>[] | null
  /** Index to restore to (for stage revisiting with history) */
  initialIndex?: number | null

  // === Store sync options (replaces duplicated effects in views) ===

  /** Store sync configuration - handles all store synchronization automatically */
  storeSync?: StoreSyncOptions<TStates, TSources, TCounts>
  /** Selection states for debounced sync (required if storeSync is provided) */
  selectionStates?: TStates
  /** Selection sources for debounced sync (required if storeSync is provided) */
  selectionSources?: TSources
}

interface UseCommitHistoryReturn<TStates, TSources, TCounts = void> {
  /** All commits in history */
  commits: Commit<TStates, TSources, TCounts>[]
  /** Current commit index */
  currentCommitIndex: number
  /** Update current commit in-place with current store state (for manual tag sync) */
  updateCurrentCommit: () => void
  /** Create a new commit with current store state */
  createCommit: (type: 'apply' | 'tagAll' | 'verify') => void
  /** Restore state from a specific commit */
  restoreCommit: (index: number) => void
  /** Combined handler: restore target commit (for commit circle clicks) */
  handleCommitClick: (index: number) => void
  /** Create commit after async operation (use in setTimeout) */
  createCommitAsync: (type: 'apply' | 'tagAll' | 'verify') => void
}

const DEFAULT_MAX_COMMITS = 10

export function useCommitHistory<TStates, TSources, TCounts = void>(
  options: UseCommitHistoryOptions<TStates, TSources, TCounts>
): UseCommitHistoryReturn<TStates, TSources, TCounts> {
  const {
    getStatesFromStore,
    getSourcesFromStore,
    restoreToStore,
    cloneStates,
    cloneSources,
    createEmptyStates,
    createEmptySources,
    maxCommits = DEFAULT_MAX_COMMITS,
    // Extended options
    calculateCounts,
    getFeatureIds,
    getFlipTracking,
    restoreFlipTracking,
    onCommitCreated,
    initialCommit,
    initialCommits: initialCommitsProp,
    initialIndex: initialIndexProp,
    // Store sync options
    storeSync,
    selectionStates,
    selectionSources
  } = options

  // ============================================================================
  // STORE SYNC: Build initial commits from store data (if revisiting)
  // ============================================================================
  // This replaces the initialCommitsForRevisit, savedCurrentIndex, and
  // initialCommitForRevisit useMemos that were duplicated in each view

  const initialCommitsFromStoreSync = useMemo((): Commit<TStates, TSources, TCounts>[] | null => {
    if (!storeSync?.isRevisiting) return null
    if (!storeSync.stageCommitData || storeSync.stageCommitData.size === 0) return null
    if (!storeSync.stageCommitHistory || storeSync.stageCommitHistory.length === 0) return null

    // Reconstruct full commit array from stored data
    const commits: Commit<TStates, TSources, TCounts>[] = []
    for (let i = 0; i < storeSync.stageCommitHistory.length; i++) {
      const historyEntry = storeSync.stageCommitHistory[i]
      const commitData = storeSync.stageCommitData.get(i)

      if (historyEntry && commitData) {
        commits.push({
          id: historyEntry.id,
          type: historyEntry.type,
          states: cloneStates(commitData.states),
          sources: cloneSources(commitData.sources),
          counts: historyEntry.counts,
          featureIds: commitData.featureIds ? new Set(commitData.featureIds) : undefined,
          flipTracking: commitData.flipTracking ?? null
        })
      }
    }

    return commits.length > 0 ? commits : null
  }, [storeSync?.isRevisiting, storeSync?.stageCommitData, storeSync?.stageCommitHistory, cloneStates, cloneSources])

  const savedCurrentIndexFromStoreSync = useMemo((): number | null => {
    if (!storeSync?.isRevisiting) return null
    if (storeSync.stageCurrentCommitIndex === undefined) return null
    return storeSync.stageCurrentCommitIndex
  }, [storeSync?.isRevisiting, storeSync?.stageCurrentCommitIndex])

  // Merge storeSync values with props (storeSync takes priority when revisiting)
  const initialCommits = initialCommitsFromStoreSync ?? initialCommitsProp
  const initialIndex = savedCurrentIndexFromStoreSync ?? initialIndexProp

  // Initialize with Commit 0 (hidden baseline) and Commit 1 (user's working commit)
  // User always starts at Commit 1; Commit 0 is just an empty baseline
  const [commits, setCommits] = useState<Commit<TStates, TSources, TCounts>[]>(() => {
    // Priority 1: Full commit history restoration (for stage revisiting with full history)
    if (initialCommits && initialCommits.length > 0) {
      return initialCommits
    }

    // Commit 0: Hidden empty baseline
    const commit0: Commit<TStates, TSources, TCounts> = {
      id: 0,
      type: 'initial',
      states: createEmptyStates(),
      sources: createEmptySources(),
      counts: undefined,
      featureIds: undefined
    }

    // Priority 2: Single commit restoration (backward compatible)
    if (initialCommit) {
      // If we have an initial commit (revisiting), use it as Commit 1
      return [commit0, initialCommit]
    }

    // Default: Fresh start - Commit 1 is user's working commit (empty, ready for manual tags)
    const commit1: Commit<TStates, TSources, TCounts> = {
      id: 1,
      type: 'initial',
      states: createEmptyStates(),
      sources: createEmptySources(),
      counts: undefined,
      featureIds: undefined
    }

    return [commit0, commit1]
  })

  // Start at the specified index, or default to Commit 1
  const [currentCommitIndex, setCurrentCommitIndex] = useState(() => {
    if (initialIndex !== undefined && initialIndex !== null && initialIndex >= 0) {
      return initialIndex
    }
    return 1
  })

  // Restore state from initial data on mount (for revisiting)
  useEffect(() => {
    // Priority 1: Full history restoration - restore the commit at initialIndex
    if (initialCommits && initialCommits.length > 0) {
      const targetIndex = (initialIndex !== undefined && initialIndex !== null && initialIndex >= 0 && initialIndex < initialCommits.length)
        ? initialIndex
        : Math.min(1, initialCommits.length - 1) // Default to index 1 or last available
      const targetCommit = initialCommits[targetIndex]
      if (targetCommit) {
        restoreToStore(targetCommit.states, targetCommit.sources)
        if (restoreFlipTracking) {
          restoreFlipTracking(targetCommit.flipTracking ?? null)
        }
      }
      return
    }

    // Priority 2: Single commit restoration (backward compatible)
    if (initialCommit) {
      restoreToStore(initialCommit.states, initialCommit.sources)
      if (restoreFlipTracking) {
        restoreFlipTracking(initialCommit.flipTracking ?? null)
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper to build commit data
  const buildCommitData = useCallback(
    (type: CommitType, states: TStates, sources: TSources): Commit<TStates, TSources, TCounts> => {
      const commit: Commit<TStates, TSources, TCounts> = {
        id: 0, // Will be set by caller
        type,
        states: cloneStates(states),
        sources: cloneSources(sources)
      }

      // Add counts if calculator provided
      if (calculateCounts) {
        commit.counts = calculateCounts()
      }

      // Add featureIds if getter provided
      if (getFeatureIds) {
        const ids = getFeatureIds()
        if (ids) {
          commit.featureIds = new Set(ids)
        }
      }

      // Save flipTracking state if getter provided
      if (getFlipTracking) {
        commit.flipTracking = getFlipTracking()
      }

      return commit
    },
    [cloneStates, cloneSources, calculateCounts, getFeatureIds, getFlipTracking]
  )

  // Update current commit in-place with current store state
  // Called via effect when manual tags change (debounced in views)
  const updateCurrentCommit = useCallback(() => {
    const currentStates = getStatesFromStore()
    const currentSources = getSourcesFromStore()

    setCommits(prev => {
      const updated = [...prev]
      const existingCommit = updated[currentCommitIndex]
      updated[currentCommitIndex] = {
        ...existingCommit,
        states: cloneStates(currentStates),
        sources: cloneSources(currentSources),
        counts: calculateCounts ? calculateCounts() : existingCommit.counts,
        featureIds: getFeatureIds ? (getFeatureIds() ? new Set(getFeatureIds()!) : existingCommit.featureIds) : existingCommit.featureIds,
        flipTracking: getFlipTracking ? getFlipTracking() : existingCommit.flipTracking
      }
      return updated
    })
  }, [getStatesFromStore, getSourcesFromStore, cloneStates, cloneSources, calculateCounts, getFeatureIds, getFlipTracking, currentCommitIndex])

  // Create a new commit (synchronous version)
  const createCommit = useCallback(
    (type: 'apply' | 'tagAll' | 'verify') => {
      const currentStates = getStatesFromStore()
      const currentSources = getSourcesFromStore()

      const newCommit = buildCommitData(type, currentStates, currentSources)

      setCommits(prev => {
        newCommit.id = prev.length
        let newHistory = [...prev, newCommit]
        // Trim to maxCommits, keeping initial commit
        if (newHistory.length > maxCommits) {
          newHistory = [newHistory[0], ...newHistory.slice(-(maxCommits - 1))]
        }
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, maxCommits - 1))

      // Notify callback
      if (onCommitCreated) {
        onCommitCreated(newCommit)
      }
    },
    [getStatesFromStore, getSourcesFromStore, buildCommitData, maxCommits, onCommitCreated]
  )

  // Create commit after async operation (for use in setTimeout after store updates)
  const createCommitAsync = useCallback(
    (type: 'apply' | 'tagAll' | 'verify') => {
      // Get fresh state from store (after async update)
      const currentStates = getStatesFromStore()
      const currentSources = getSourcesFromStore()

      let createdCommit: Commit<TStates, TSources, TCounts> | null = null

      setCommits(prev => {
        const newCommit = buildCommitData(type, currentStates, currentSources)
        newCommit.id = prev.length

        let newHistory = [...prev, newCommit]
        if (newHistory.length > maxCommits) {
          newHistory = [newHistory[0], ...newHistory.slice(-(maxCommits - 1))]
        }

        createdCommit = newCommit
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, maxCommits - 1))

      // Notify callback (deferred to ensure state is updated)
      if (onCommitCreated && createdCommit) {
        // Use setTimeout to ensure the state update has propagated
        setTimeout(() => {
          if (createdCommit) onCommitCreated(createdCommit)
        }, 0)
      }
    },
    [getStatesFromStore, getSourcesFromStore, buildCommitData, maxCommits, onCommitCreated]
  )

  // Restore state from a specific commit
  const restoreCommit = useCallback(
    (index: number) => {
      if (index < 0 || index >= commits.length) return

      const targetCommit = commits[index]
      restoreToStore(targetCommit.states, targetCommit.sources)
      if (restoreFlipTracking) {
        restoreFlipTracking(targetCommit.flipTracking ?? null)
      }
      setCurrentCommitIndex(index)
    },
    [commits, restoreToStore, restoreFlipTracking]
  )

  // Handler for commit circle clicks
  // No need to save current state - it's already up-to-date via effect sync
  const handleCommitClick = useCallback(
    (commitIndex: number) => {
      if (commitIndex < 0 || commitIndex >= commits.length) return
      if (commitIndex === currentCommitIndex) return

      // Simply restore the target commit
      const targetCommit = commits[commitIndex]
      restoreToStore(targetCommit.states, targetCommit.sources)
      if (restoreFlipTracking) {
        restoreFlipTracking(targetCommit.flipTracking ?? null)
      }
      setCurrentCommitIndex(commitIndex)
    },
    [commits, currentCommitIndex, restoreToStore, restoreFlipTracking]
  )

  // ============================================================================
  // STORE SYNC: Effects to sync with global store (when storeSync is provided)
  // ============================================================================
  // These replace the duplicated effects in FeatureSplitView, QualityView, CauseView

  // Track when we're writing to store to avoid circular updates
  const isWritingToStoreRef = useRef(false)

  // Track previous final commit data to avoid redundant setFinalCommit calls
  // This prevents cascading updates when commit data hasn't actually changed
  const prevFinalCommitRef = useRef<{
    statesSize: number
    sourcesSize: number
    featureIdsSize: number
  } | null>(null)

  // Keep storeSync in a ref to avoid circular dependencies in Effect 1
  // The storeSync object changes when store values change, but Effect 1 only needs the setters
  const storeSyncRef = useRef(storeSync)
  useEffect(() => {
    storeSyncRef.current = storeSync
  }, [storeSync])

  // Keep clone functions in refs to avoid Effect 1 dependency changes
  const cloneStatesRef = useRef(cloneStates)
  const cloneSourcesRef = useRef(cloneSources)
  useEffect(() => {
    cloneStatesRef.current = cloneStates
    cloneSourcesRef.current = cloneSources
  }, [cloneStates, cloneSources])

  // Effect 1: Sync local commit history to global store for SelectionPanel display and restoration
  // IMPORTANT: Uses refs instead of direct dependencies to avoid circular updates
  useEffect(() => {
    const sync = storeSyncRef.current
    if (!sync) return

    // Mark that we're about to write to store
    isWritingToStoreRef.current = true

    // Convert commits to display format (without full states/sources)
    const displayCommits: DisplayCommit<TCounts>[] = commits.map(c => ({
      id: c.id,
      type: c.type,
      counts: c.counts
    }))

    // Build full commit data for restoration
    const commitData = new Map<number, { states: TStates; sources: TSources; featureIds?: Set<number>; flipTracking?: FlipTrackingInfo | null }>()
    commits.forEach((c, index) => {
      commitData.set(index, {
        states: cloneStatesRef.current(c.states),
        sources: cloneSourcesRef.current(c.sources),
        featureIds: c.featureIds ? new Set(c.featureIds) : undefined,
        flipTracking: c.flipTracking ?? null
      })
    })

    // Update store
    sync.setStoreCommitHistory(displayCommits)
    sync.setStoreCommitData(commitData)
    sync.setStoreCurrentCommitIndex(currentCommitIndex)

    // Also update final commit with current commit state (for stage revisiting)
    // The commit already stores featureIds from when it was created
    const currentCommit = commits[currentCommitIndex]
    if (currentCommit && currentCommit.featureIds && currentCommit.featureIds.size > 0 && currentCommit.counts) {
      // Check if final commit data actually changed to avoid redundant calls
      // This prevents cascading updates when Effect 3 updates the current commit
      const newData = {
        statesSize: currentCommit.states instanceof Map ? (currentCommit.states as Map<unknown, unknown>).size : 0,
        sourcesSize: currentCommit.sources instanceof Map ? (currentCommit.sources as Map<unknown, unknown>).size : 0,
        featureIdsSize: currentCommit.featureIds.size
      }

      const prev = prevFinalCommitRef.current
      const hasChanged = !prev ||
        prev.statesSize !== newData.statesSize ||
        prev.sourcesSize !== newData.sourcesSize ||
        prev.featureIdsSize !== newData.featureIdsSize

      if (hasChanged) {
        prevFinalCommitRef.current = newData
        sync.setFinalCommit({
          states: cloneStatesRef.current(currentCommit.states),
          sources: cloneSourcesRef.current(currentCommit.sources),
          featureIds: new Set(currentCommit.featureIds),
          counts: currentCommit.counts
        })
      }
    }
  }, [commits, currentCommitIndex]) // Only depend on actual data changes, not storeSync reference

  // Effect 2: Keep updateCurrentCommit ref in sync (avoids infinite loop in debounced effect)
  const updateCurrentCommitRef = useRef(updateCurrentCommit)
  useEffect(() => {
    updateCurrentCommitRef.current = updateCurrentCommit
  }, [updateCurrentCommit])

  // Effect 3: Sync manual tag changes to current commit (debounced)
  // This ensures current commit always reflects the latest manual tags
  useEffect(() => {
    if (!storeSyncRef.current) return
    if (selectionStates === undefined || selectionSources === undefined) return

    const timeoutId = setTimeout(() => {
      updateCurrentCommitRef.current()
    }, 50)
    return () => clearTimeout(timeoutId)
    // Only re-run when selection states actually change
  }, [selectionStates, selectionSources])

  // Effect 4: Sync from store's commit index when it changes externally (e.g., from SelectionPanel click)
  // This effect intentionally depends on storeSync?.stageCurrentCommitIndex to react to external changes
  useEffect(() => {
    if (!storeSync) return

    // Skip if we just wrote to the store ourselves
    if (isWritingToStoreRef.current) {
      isWritingToStoreRef.current = false
      return
    }

    const storeIndex = storeSync.stageCurrentCommitIndex
    if (storeIndex !== currentCommitIndex && storeIndex >= 0 && storeIndex < commits.length) {
      restoreCommit(storeIndex)
    }
    // Note: We depend on storeSync?.stageCurrentCommitIndex to detect external changes,
    // but NOT on the full storeSync object to avoid circular updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSync?.stageCurrentCommitIndex, currentCommitIndex, commits.length, restoreCommit])

  return {
    commits,
    currentCommitIndex,
    updateCurrentCommit,
    createCommit,
    restoreCommit,
    handleCommitClick,
    createCommitAsync
  }
}

// ============================================================================
// Convenience factories for Map-based selection states
// ============================================================================

// Options that are excluded from factory return types (caller provides these)
type ExcludedFactoryOptions = 'calculateCounts' | 'getFeatureIds' | 'getFlipTracking' | 'restoreFlipTracking' | 'onCommitCreated' | 'initialCommit' | 'initialCommits' | 'initialIndex' | 'storeSync' | 'selectionStates' | 'selectionSources'

/** Create options for pair selection (string keys) - Stage 1 */
export function createPairCommitHistoryOptions(
  getStatesFromStore: () => Map<string, SelectionState>,
  getSourcesFromStore: () => Map<string, SelectionSource>,
  restoreToStore: (states: Map<string, SelectionState>, sources: Map<string, SelectionSource>) => void
): Omit<UseCommitHistoryOptions<Map<string, SelectionState>, Map<string, SelectionSource>>, ExcludedFactoryOptions> {
  return {
    getStatesFromStore,
    getSourcesFromStore,
    restoreToStore,
    cloneStates: (states) => new Map(states),
    cloneSources: (sources) => new Map(sources),
    createEmptyStates: () => new Map(),
    createEmptySources: () => new Map()
  }
}

/** Create options for feature selection (number keys) - Stage 2 */
export function createFeatureCommitHistoryOptions(
  getStatesFromStore: () => Map<number, SelectionState>,
  getSourcesFromStore: () => Map<number, SelectionSource>,
  restoreToStore: (states: Map<number, SelectionState>, sources: Map<number, SelectionSource>) => void
): Omit<UseCommitHistoryOptions<Map<number, SelectionState>, Map<number, SelectionSource>>, ExcludedFactoryOptions> {
  return {
    getStatesFromStore,
    getSourcesFromStore,
    restoreToStore,
    cloneStates: (states) => new Map(states),
    cloneSources: (sources) => new Map(sources),
    createEmptyStates: () => new Map(),
    createEmptySources: () => new Map()
  }
}

/** Create options for cause selection (number keys, CauseCategory values) - Stage 3 */
export function createCauseCommitHistoryOptions(
  getStatesFromStore: () => Map<number, CauseCategory>,
  getSourcesFromStore: () => Map<number, SelectionSource>,
  restoreToStore: (states: Map<number, CauseCategory>, sources: Map<number, SelectionSource>) => void
): Omit<UseCommitHistoryOptions<Map<number, CauseCategory>, Map<number, SelectionSource>>, ExcludedFactoryOptions> {
  return {
    getStatesFromStore,
    getSourcesFromStore,
    restoreToStore,
    cloneStates: (states) => new Map(states),
    cloneSources: (sources) => new Map(sources),
    createEmptyStates: () => new Map(),
    createEmptySources: () => new Map()
  }
}

export default useCommitHistory
