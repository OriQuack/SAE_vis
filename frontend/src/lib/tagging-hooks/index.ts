// ============================================================================
// Tagging Hooks - Reusable hooks for the tagging workflow
// ============================================================================
// These hooks extract common logic from FeatureSplitView and QualityView

export { useSortableList, stageToSortConfig, sortConfigToStage } from './useSortableList'
export type { SortMode, ActiveStage, BootstrapMode } from './useSortableList'

export {
  useCommitHistory,
  createPairCommitHistoryOptions,
  createFeatureCommitHistoryOptions,
  createCauseCommitHistoryOptions,
  isUserConfirmed
} from './useCommitHistory'
export type {
  SelectionState,
  SelectionSource,
  CommitType,
  Commit,
  CauseCategory,
  DisplayCommit,
  StoreSyncOptions
} from './useCommitHistory'

export { useTaggingStatus } from './useTaggingStatus'

export { useThresholdPreview } from './useThresholdPreview'

export { useTaggingNavigation } from './useTaggingNavigation'

export { useMainListScroll } from './useMainListScroll'
