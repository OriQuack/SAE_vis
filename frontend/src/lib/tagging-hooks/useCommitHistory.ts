import { useState, useCallback, useEffect } from 'react'

// ============================================================================
// useCommitHistory - Generic commit history for tagging state snapshots
// ============================================================================
// Extracts common commit history logic from FeatureSplitView, QualityView, and CauseView

export type SelectionState = 'selected' | 'rejected'
export type SelectionSource = 'manual' | 'auto'
export type CommitType = 'initial' | 'apply' | 'tagAll'

// CauseCategory for Stage 3 (multi-class instead of binary)
export type CauseCategory = 'noisy-activation' | 'missed-N-gram' | 'missed-context' | 'well-explained'

export interface Commit<TStates, TSources, TCounts = void> {
  id: number
  type: CommitType
  states: TStates
  sources: TSources
  counts?: TCounts  // Optional counts for tooltip preview
  featureIds?: Set<number>  // Feature IDs for stage revisiting
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
  /** Initial commit to restore from (for revisiting a stage) */
  initialCommit?: Commit<TStates, TSources, TCounts> | null
}

interface UseCommitHistoryReturn<TStates, TSources, TCounts = void> {
  /** All commits in history */
  commits: Commit<TStates, TSources, TCounts>[]
  /** Current commit index */
  currentCommitIndex: number
  /** Save current state to current commit (before switching) */
  saveCurrentState: () => void
  /** Create a new commit with current store state */
  createCommit: (type: 'apply' | 'tagAll') => void
  /** Restore state from a specific commit */
  restoreCommit: (index: number) => void
  /** Combined handler: save current, restore target (for commit circle clicks) */
  handleCommitClick: (index: number) => void
  /** Create commit after async operation (use in setTimeout) */
  createCommitAsync: (type: 'apply' | 'tagAll') => void
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
    // New options
    calculateCounts,
    getFeatureIds,
    onCommitCreated,
    initialCommit
  } = options

  // Initial commit with empty state (or restored from initialCommit)
  const [commits, setCommits] = useState<Commit<TStates, TSources, TCounts>[]>(() => {
    if (initialCommit) {
      // If we have an initial commit (revisiting), start with initial + that commit
      return [
        {
          id: 0,
          type: 'initial',
          states: createEmptyStates(),
          sources: createEmptySources(),
          counts: undefined,
          featureIds: undefined
        },
        initialCommit
      ]
    }
    return [
      {
        id: 0,
        type: 'initial',
        states: createEmptyStates(),
        sources: createEmptySources(),
        counts: undefined,
        featureIds: undefined
      }
    ]
  })

  const [currentCommitIndex, setCurrentCommitIndex] = useState(() => initialCommit ? 1 : 0)

  // Restore state from initialCommit on mount (for revisiting)
  useEffect(() => {
    if (initialCommit) {
      restoreToStore(initialCommit.states, initialCommit.sources)
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

      return commit
    },
    [cloneStates, cloneSources, calculateCounts, getFeatureIds]
  )

  // Save current store state to current commit
  const saveCurrentState = useCallback(() => {
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
        featureIds: getFeatureIds ? (getFeatureIds() ? new Set(getFeatureIds()!) : existingCommit.featureIds) : existingCommit.featureIds
      }
      return updated
    })
  }, [getStatesFromStore, getSourcesFromStore, cloneStates, cloneSources, calculateCounts, getFeatureIds, currentCommitIndex])

  // Create a new commit (synchronous version)
  const createCommit = useCallback(
    (type: 'apply' | 'tagAll') => {
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
    (type: 'apply' | 'tagAll') => {
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
      setCurrentCommitIndex(index)
    },
    [commits, restoreToStore]
  )

  // Combined handler for commit circle clicks
  const handleCommitClick = useCallback(
    (commitIndex: number) => {
      if (commitIndex < 0 || commitIndex >= commits.length) return
      if (commitIndex === currentCommitIndex) return

      // Save current state to current commit before switching
      saveCurrentState()

      // Restore the target commit
      const targetCommit = commits[commitIndex]
      restoreToStore(targetCommit.states, targetCommit.sources)
      setCurrentCommitIndex(commitIndex)
    },
    [commits, currentCommitIndex, saveCurrentState, restoreToStore]
  )

  return {
    commits,
    currentCommitIndex,
    saveCurrentState,
    createCommit,
    restoreCommit,
    handleCommitClick,
    createCommitAsync
  }
}

// ============================================================================
// Convenience factories for Map-based selection states
// ============================================================================

/** Create options for pair selection (string keys) - Stage 1 */
export function createPairCommitHistoryOptions(
  getStatesFromStore: () => Map<string, SelectionState>,
  getSourcesFromStore: () => Map<string, SelectionSource>,
  restoreToStore: (states: Map<string, SelectionState>, sources: Map<string, SelectionSource>) => void
): Omit<UseCommitHistoryOptions<Map<string, SelectionState>, Map<string, SelectionSource>>, 'calculateCounts' | 'getFeatureIds' | 'onCommitCreated' | 'initialCommit'> {
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
): Omit<UseCommitHistoryOptions<Map<number, SelectionState>, Map<number, SelectionSource>>, 'calculateCounts' | 'getFeatureIds' | 'onCommitCreated' | 'initialCommit'> {
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
): Omit<UseCommitHistoryOptions<Map<number, CauseCategory>, Map<number, SelectionSource>>, 'calculateCounts' | 'getFeatureIds' | 'onCommitCreated' | 'initialCommit'> {
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
