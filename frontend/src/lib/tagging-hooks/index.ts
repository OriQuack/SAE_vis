// ============================================================================
// Tagging Hooks - Reusable hooks for the tagging workflow
// ============================================================================
// These hooks extract common logic from FeatureSplitView and QualityView

export { usePaginatedList } from './usePaginatedList'
export type { default as UsePaginatedListReturn } from './usePaginatedList'

export { useListNavigation } from './useListNavigation'
export type { ListSource } from './useListNavigation'

export { useBoundaryItems } from './useBoundaryItems'

export { useSortableList } from './useSortableList'

export {
  useCommitHistory,
  createPairCommitHistoryOptions,
  createFeatureCommitHistoryOptions
} from './useCommitHistory'
export type {
  SelectionState,
  SelectionSource,
  CommitType,
  Commit
} from './useCommitHistory'

export { useBimodalStatus } from './useBimodalStatus'

export { useTaggingStatus } from './useTaggingStatus'

export { useThresholdPreview } from './useThresholdPreview'
