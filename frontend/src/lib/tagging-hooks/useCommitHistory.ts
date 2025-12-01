import { useState, useCallback } from 'react'

// ============================================================================
// useCommitHistory - Generic commit history for tagging state snapshots
// ============================================================================
// Extracts common commit history logic from FeatureSplitView and QualityView

export type SelectionState = 'selected' | 'rejected'
export type SelectionSource = 'manual' | 'auto'
export type CommitType = 'initial' | 'apply' | 'tagAll'

export interface Commit<TStates, TSources> {
  id: number
  type: CommitType
  states: TStates
  sources: TSources
}

interface UseCommitHistoryOptions<TStates, TSources> {
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
}

interface UseCommitHistoryReturn<TStates, TSources> {
  /** All commits in history */
  commits: Commit<TStates, TSources>[]
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

export function useCommitHistory<TStates, TSources>(
  options: UseCommitHistoryOptions<TStates, TSources>
): UseCommitHistoryReturn<TStates, TSources> {
  const {
    getStatesFromStore,
    getSourcesFromStore,
    restoreToStore,
    cloneStates,
    cloneSources,
    createEmptyStates,
    createEmptySources,
    maxCommits = DEFAULT_MAX_COMMITS
  } = options

  // Initial commit with empty state
  const [commits, setCommits] = useState<Commit<TStates, TSources>[]>([
    {
      id: 0,
      type: 'initial',
      states: createEmptyStates(),
      sources: createEmptySources()
    }
  ])
  const [currentCommitIndex, setCurrentCommitIndex] = useState(0)

  // Save current store state to current commit
  const saveCurrentState = useCallback(() => {
    const currentStates = getStatesFromStore()
    const currentSources = getSourcesFromStore()

    setCommits(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        states: cloneStates(currentStates),
        sources: cloneSources(currentSources)
      }
      return updated
    })
  }, [getStatesFromStore, getSourcesFromStore, cloneStates, cloneSources, currentCommitIndex])

  // Create a new commit (synchronous version)
  const createCommit = useCallback(
    (type: 'apply' | 'tagAll') => {
      const currentStates = getStatesFromStore()
      const currentSources = getSourcesFromStore()

      const newCommit: Commit<TStates, TSources> = {
        id: commits.length,
        type,
        states: cloneStates(currentStates),
        sources: cloneSources(currentSources)
      }

      setCommits(prev => {
        let newHistory = [...prev, newCommit]
        // Trim to maxCommits, keeping initial commit
        if (newHistory.length > maxCommits) {
          newHistory = [newHistory[0], ...newHistory.slice(-(maxCommits - 1))]
        }
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, maxCommits - 1))
    },
    [getStatesFromStore, getSourcesFromStore, cloneStates, cloneSources, commits.length, maxCommits]
  )

  // Create commit after async operation (for use in setTimeout after store updates)
  const createCommitAsync = useCallback(
    (type: 'apply' | 'tagAll') => {
      // Get fresh state from store (after async update)
      const currentStates = getStatesFromStore()
      const currentSources = getSourcesFromStore()

      setCommits(prev => {
        const newCommit: Commit<TStates, TSources> = {
          id: prev.length,
          type,
          states: cloneStates(currentStates),
          sources: cloneSources(currentSources)
        }

        let newHistory = [...prev, newCommit]
        if (newHistory.length > maxCommits) {
          newHistory = [newHistory[0], ...newHistory.slice(-(maxCommits - 1))]
        }
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, maxCommits - 1))
    },
    [getStatesFromStore, getSourcesFromStore, cloneStates, cloneSources, maxCommits]
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
// Convenience factory for Map-based selection states
// ============================================================================

/** Create options for pair selection (string keys) */
export function createPairCommitHistoryOptions(
  getStatesFromStore: () => Map<string, SelectionState>,
  getSourcesFromStore: () => Map<string, SelectionSource>,
  restoreToStore: (states: Map<string, SelectionState>, sources: Map<string, SelectionSource>) => void
): UseCommitHistoryOptions<Map<string, SelectionState>, Map<string, SelectionSource>> {
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

/** Create options for feature selection (number keys) */
export function createFeatureCommitHistoryOptions(
  getStatesFromStore: () => Map<number, SelectionState>,
  getSourcesFromStore: () => Map<number, SelectionSource>,
  restoreToStore: (states: Map<number, SelectionState>, sources: Map<number, SelectionSource>) => void
): UseCommitHistoryOptions<Map<number, SelectionState>, Map<number, SelectionSource>> {
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
