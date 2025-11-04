// ============================================================================
// TAG ACTIONS
// Zustand store actions for tag management (Stage 1)
// ============================================================================

import type { StateCreator } from 'zustand'
import type {
  Tag,
  MetricWeights,
  MetricSignature,
  FeatureMatch,
  FeatureTableRow,
  CandidateVerificationState,
  FeatureListType,
  GroupExpansionState
} from '../types'
import {
  generateTagId,
  findCandidateFeatures,
  inferMetricSignature,
  inferMetricWeights,
  TAG_TEMPLATES
} from '../lib/tag-utils'

// ============================================================================
// TAG STATE INTERFACE
// ============================================================================

export interface TagState {
  // Tag data
  tags: Tag[]                                // All template tags
  selectedFeatureIds: Set<number>            // Features selected in TablePanel (checkboxes)
  activeTagId: string | null                 // Currently selected tag for assignment

  // Stage 2: Candidate discovery state
  candidateFeatures: FeatureMatch[]          // Current candidate list
  candidateStates: Map<number, CandidateVerificationState>  // Verification state per candidate
  currentWeights: MetricWeights | null       // Active weights for current candidate search
  currentSignature: MetricSignature | null   // Manually adjusted signature (null = use auto-inferred)
  highlightedFeatureId: number | null        // Feature to highlight in TablePanel
  candidateMethod: {
    useRangeFilter: boolean                  // Range-Based Filtering
    useWeightedDistance: boolean             // Weighted Distance
  }
  stdMultiplier: number                      // Standard deviation multiplier for signature inference
  savedWeightsBeforeDisable: MetricWeights | null       // Saved weights before disabling weighted distance
  savedSignatureBeforeDisable: MetricSignature | null   // Saved signature before disabling range filter

  // Group expansion state
  groupExpansionState: GroupExpansionState   // Tracks which score range groups are expanded/collapsed

  // Internal state
  _isRestoringTag: boolean                   // Flag to prevent signature clearing during tag restoration

  // Tag actions
  createTag: (name: string, color?: string) => string  // Returns new tag ID
  updateTag: (id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>) => void
  deleteTag: (id: string) => void
  setActiveTag: (id: string | null) => void
  initializeTemplateTags: () => void
  assignFeaturesToTag: (tagId: string) => void

  // Feature selection actions
  toggleFeatureSelection: (featureId: number) => void
  selectFeatures: (featureIds: number[]) => void
  clearFeatureSelection: () => void
  selectAllFeatures: () => void
  removeFromSelection: (featureId: number) => void

  // Tag-feature operations
  addFeaturesToTag: (tagId: string, featureIds: Set<number>) => void
  removeFeatureFromTag: (tagId: string, featureId: number) => void
  getFeatureTags: (featureId: number) => Tag[]

  // Stage 2: Candidate discovery actions
  refreshCandidates: () => void
  acceptCandidate: (featureId: number) => void
  rejectCandidate: (featureId: number) => void
  markCandidateUnsure: (featureId: number) => void
  clearCandidateState: (featureId: number) => void
  undoRejection: (tagId: string, featureId: number) => void
  setHighlightedFeature: (featureId: number | null) => void

  // Stage 2: Weight management actions
  updateMetricWeight: (metric: keyof MetricWeights, weight: number) => void
  resetWeightsToAuto: () => void

  // Stage 2: Signature management actions
  setCurrentSignature: (signature: MetricSignature | null) => void

  // Stage 2: Method selection actions
  toggleRangeFilter: () => void
  toggleWeightedDistance: () => void
  setStdMultiplier: (multiplier: number) => void

  // Group expansion actions
  toggleGroupExpansion: (listType: FeatureListType, rangeLabel: string) => void
  isGroupExpanded: (listType: FeatureListType, rangeLabel: string) => boolean
}

// ============================================================================
// TAG ACTIONS CREATOR
// ============================================================================

export const createTagActions: StateCreator<
  any,
  [],
  [],
  TagState
> = (set, get, _store) => ({
  // Initial state
  tags: [],
  selectedFeatureIds: new Set<number>(),
  activeTagId: null,

  // Stage 2 initial state
  candidateFeatures: [],
  candidateStates: new Map<number, CandidateVerificationState>(),
  currentWeights: null,
  currentSignature: null,
  highlightedFeatureId: null,
  candidateMethod: {
    useRangeFilter: true,
    useWeightedDistance: true
  },
  stdMultiplier: 1.5,
  savedWeightsBeforeDisable: null,
  savedSignatureBeforeDisable: null,

  // Group expansion initial state
  groupExpansionState: new Map<string, boolean>(),

  // Internal state
  _isRestoringTag: false,

  // ============================================================================
  // TAG CRUD OPERATIONS
  // ============================================================================

  createTag: (name, color) => {
    const newTag: Tag = {
      id: generateTagId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metricSignature: {
        decoder_similarity: { min: 0.0, max: 1.0 },
        embedding: { min: 0.0, max: 1.0 },
        fuzz: { min: 0.0, max: 1.0 },
        detection: { min: 0.0, max: 1.0 },
        semantic_similarity: { min: 0.0, max: 1.0 },
        quality_score: { min: 0.0, max: 1.0 }
      },
      featureIds: new Set<number>(),
      rejectedFeatureIds: new Set<number>(),  // Initialize rejected set (Stage 2)
      metricWeights: undefined,  // Auto-inferred by default
      color: color || '#3b82f6',  // Default to blue
      // Initialize working state fields
      workingFeatureIds: new Set<number>(),
      savedManualSignature: undefined,
      savedCandidateStates: new Map<number, CandidateVerificationState>()
    }

    set((state: any) => ({
      tags: [...state.tags, newTag]
    }))

    console.log('[Tag System] Created new tag:', newTag.id, newTag.name)
    return newTag.id
  },

  updateTag: (id, updates) => {
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) =>
        tag.id === id
          ? { ...tag, ...updates, updatedAt: Date.now() }
          : tag
      )
    }))

    console.log('[Tag System] Updated tag:', id, updates)
  },

  deleteTag: (id) => {
    set((state: any) => ({
      tags: state.tags.filter((tag: Tag) => tag.id !== id),
      activeTagId: state.activeTagId === id ? null : state.activeTagId
    }))

    console.log('[Tag System] Deleted tag:', id)
  },

  setActiveTag: (id) => {
    const { activeTagId, tags, selectedFeatureIds, currentSignature, candidateStates } = get() as any

    // Auto-save current tag's working state before switching
    if (activeTagId) {
      set((state: any) => ({
        tags: state.tags.map((tag: Tag) => {
          if (tag.id === activeTagId) {
            return {
              ...tag,
              workingFeatureIds: new Set(selectedFeatureIds),
              savedManualSignature: currentSignature || undefined,
              savedCandidateStates: new Map(candidateStates),
              updatedAt: Date.now()
            }
          }
          return tag
        })
      }))
      console.log('[Tag System] Auto-saved working state for tag:', activeTagId)
    }

    // Set new active tag
    set({ activeTagId: id })

    // Restore new tag's working state
    if (id) {
      const newTag = tags.find((t: Tag) => t.id === id)
      if (newTag) {
        // Set restoration flag to prevent signature clearing
        set({ _isRestoringTag: true })

        // Restore working state
        set({
          selectedFeatureIds: new Set(newTag.workingFeatureIds || []),
          currentSignature: newTag.savedManualSignature || null,
          candidateStates: new Map(newTag.savedCandidateStates || new Map())
        })

        console.log('[Tag System] Restored working state for tag:', id, {
          selectedFeatures: newTag.workingFeatureIds?.size || 0,
          hasSignature: !!newTag.savedManualSignature,
          candidateStates: newTag.savedCandidateStates?.size || 0
        })

        // Clear restoration flag after a short delay to allow effects to run
        setTimeout(() => {
          set({ _isRestoringTag: false })
          // Trigger candidate refresh after restoration
          get().refreshCandidates()
        }, 0)
      }
    } else {
      // If deactivating tag, just clear the flag
      set({ _isRestoringTag: false })
    }

    console.log('[Tag System] Set active tag:', id)
  },

  // ============================================================================
  // FEATURE SELECTION OPERATIONS
  // ============================================================================

  toggleFeatureSelection: (featureId) => {
    set((state: any) => {
      const newSelection = new Set(state.selectedFeatureIds)
      if (newSelection.has(featureId)) {
        newSelection.delete(featureId)
      } else {
        newSelection.add(featureId)
      }
      console.log('[Tag System] Toggled feature selection:', featureId, 'Total selected:', newSelection.size)
      return { selectedFeatureIds: newSelection }
    })
  },

  selectFeatures: (featureIds) => {
    set({ selectedFeatureIds: new Set(featureIds) })
    console.log('[Tag System] Selected features:', featureIds.length)
  },

  clearFeatureSelection: () => {
    set({ selectedFeatureIds: new Set<number>() })
    console.log('[Tag System] Cleared feature selection')
  },

  selectAllFeatures: () => {
    const tableData = get().tableData
    if (tableData && tableData.features) {
      const allIds = tableData.features.map((f: FeatureTableRow) => f.feature_id)
      set({ selectedFeatureIds: new Set(allIds) })
      console.log('[Tag System] Selected all features:', allIds.length)
    }
  },

  removeFromSelection: (featureId) => {
    set((state: any) => {
      const newSelection = new Set(state.selectedFeatureIds)
      newSelection.delete(featureId)
      console.log('[Tag System] Removed feature from selection:', featureId, 'Remaining:', newSelection.size)
      return { selectedFeatureIds: newSelection }
    })

    // Trigger candidate refresh
    setTimeout(() => get().refreshCandidates(), 0)
  },

  // ============================================================================
  // TAG-FEATURE OPERATIONS
  // ============================================================================

  addFeaturesToTag: (tagId, featureIds) => {
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === tagId) {
          const updatedFeatureIds = new Set(tag.featureIds)
          featureIds.forEach(id => updatedFeatureIds.add(id))
          return {
            ...tag,
            featureIds: updatedFeatureIds,
            updatedAt: Date.now()
          }
        }
        return tag
      })
    }))

    console.log('[Tag System] Added features to tag:', tagId, 'Count:', featureIds.size)
  },

  removeFeatureFromTag: (tagId, featureId) => {
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === tagId) {
          const updatedFeatureIds = new Set(tag.featureIds)
          updatedFeatureIds.delete(featureId)
          return {
            ...tag,
            featureIds: updatedFeatureIds,
            updatedAt: Date.now()
          }
        }
        return tag
      })
    }))

    console.log('[Tag System] Removed feature from tag:', tagId, featureId)
  },

  getFeatureTags: (featureId) => {
    const tags = get().tags
    return tags.filter((tag: Tag) => tag.featureIds.has(featureId))
  },

  // ============================================================================
  // TEMPLATE INITIALIZATION
  // ============================================================================

  initializeTemplateTags: () => {
    const existingTags = get().tags

    // Only initialize if no tags exist yet
    if (existingTags.length > 0) {
      console.log('[Tag System] Template tags already initialized, skipping')
      return
    }

    // Create all 6 template tags with empty feature sets
    const templateTags: Tag[] = TAG_TEMPLATES.map((template) => ({
      id: generateTagId(),
      name: template.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metricSignature: template.signature,
      featureIds: new Set<number>(),  // Empty initially
      rejectedFeatureIds: new Set<number>(),  // Empty initially (Stage 2)
      metricWeights: undefined,  // Auto-inferred by default
      color: template.color,
      templateSource: template.name,
      // Initialize working state fields
      workingFeatureIds: new Set<number>(),
      savedManualSignature: undefined,
      savedCandidateStates: new Map<number, CandidateVerificationState>()
    }))

    set({ tags: templateTags })

    console.log('[Tag System] Initialized', templateTags.length, 'template tags:', templateTags.map(t => t.name))
  },

  // ============================================================================
  // FEATURE ASSIGNMENT
  // ============================================================================

  assignFeaturesToTag: (tagId) => {
    const selectedIds = get().selectedFeatureIds

    if (selectedIds.size === 0) {
      console.warn('[Tag System] Cannot assign features: no features selected')
      return
    }

    // Add selected features to tag (adds to existing)
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === tagId) {
          const updatedFeatureIds = new Set(tag.featureIds)
          selectedIds.forEach((id: number) => updatedFeatureIds.add(id))
          return {
            ...tag,
            featureIds: updatedFeatureIds,
            updatedAt: Date.now()
          }
        }
        return tag
      })
      // Note: Selection is now preserved and will be auto-saved when switching tags
    }))

    console.log('[Tag System] Assigned', selectedIds.size, 'features to tag:', tagId)
  },

  // ============================================================================
  // STAGE 2: CANDIDATE DISCOVERY ACTIONS
  // ============================================================================

  refreshCandidates: () => {
    const { selectedFeatureIds, activeTagId, tags, tableData, candidateMethod, stdMultiplier, currentSignature } = get() as any

    // Clear candidates if no selection or no table data
    if (selectedFeatureIds.size === 0 || !tableData) {
      set({
        candidateFeatures: [],
        candidateStates: new Map(),
        currentWeights: null
      })
      return
    }

    // Get active tag (optional - only needed for rejected list and custom weights)
    const activeTag = activeTagId ? tags.find((t: Tag) => t.id === activeTagId) : null

    // Get selected features
    const selectedFeatures = tableData.features.filter((f: FeatureTableRow) =>
      selectedFeatureIds.has(f.feature_id)
    )

    if (selectedFeatures.length === 0) {
      set({
        candidateFeatures: [],
        candidateStates: new Map(),
        currentWeights: null
      })
      return
    }

    // Use manual signature if available, otherwise infer from selected features
    const signature = currentSignature || inferMetricSignature(selectedFeatures, stdMultiplier)

    // Use tag's custom weights or infer from signature
    // When < 3 features, use equal weights (1.0) to avoid unstable inference
    const weights = activeTag?.metricWeights ||
      (selectedFeatures.length < 3
        ? { decoder_similarity: 1.0, embedding: 1.0, fuzz: 1.0, detection: 1.0, semantic_similarity: 1.0, quality_score: 1.0 }
        : inferMetricWeights(signature))

    // Find candidates excluding selected + rejected features
    const rejectedIds = activeTag?.rejectedFeatureIds || new Set<number>()
    const candidates = findCandidateFeatures(
      tableData.features,
      signature,
      selectedFeatureIds,
      rejectedIds,
      weights,
      100,  // Top 100 candidates
      candidateMethod  // Pass method configuration
    )

    // Update state
    set({
      candidateFeatures: candidates,
      candidateStates: new Map(),  // Reset verification states
      currentWeights: weights
    })

    console.log('[Tag System] Refreshed candidates:', candidates.length, 'found')
  },

  acceptCandidate: (featureId) => {
    const { selectedFeatureIds, candidateStates } = get() as any

    // Add to selected features (this will trigger auto-refresh)
    const newSelection = new Set(selectedFeatureIds)
    newSelection.add(featureId)

    // Update verification state
    const newStates = new Map(candidateStates)
    newStates.set(featureId, 'accepted' as CandidateVerificationState)

    set({
      selectedFeatureIds: newSelection,
      candidateStates: newStates
    })

    console.log('[Tag System] Accepted candidate:', featureId)

    // Trigger refresh (will be debounced in component)
    get().refreshCandidates()
  },

  rejectCandidate: (featureId) => {
    const { activeTagId, candidateStates } = get() as any

    if (!activeTagId) {
      console.warn('[Tag System] No active tag - cannot permanently reject. Marking as rejected state only.')
      // Still update verification state for visual feedback
      const newStates = new Map(candidateStates)
      newStates.set(featureId, 'rejected' as CandidateVerificationState)
      set({ candidateStates: newStates })
      return
    }

    // Add to tag's rejected list
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === activeTagId) {
          const rejectedIds = new Set(tag.rejectedFeatureIds || new Set())
          rejectedIds.add(featureId)
          return {
            ...tag,
            rejectedFeatureIds: rejectedIds,
            updatedAt: Date.now()
          }
        }
        return tag
      })
    }))

    // Update verification state
    const newStates = new Map(candidateStates)
    newStates.set(featureId, 'rejected' as CandidateVerificationState)

    set({ candidateStates: newStates })

    console.log('[Tag System] Rejected candidate:', featureId)

    // Trigger refresh to remove from list
    get().refreshCandidates()
  },

  markCandidateUnsure: (featureId) => {
    const { candidateStates } = get() as any

    const newStates = new Map(candidateStates)
    newStates.set(featureId, 'unsure' as CandidateVerificationState)

    set({ candidateStates: newStates })

    console.log('[Tag System] Marked candidate as unsure:', featureId)
  },

  clearCandidateState: (featureId) => {
    const { candidateStates } = get() as any

    const newStates = new Map(candidateStates)
    newStates.delete(featureId)

    set({ candidateStates: newStates })

    console.log('[Tag System] Cleared candidate state:', featureId)
  },

  undoRejection: (tagId, featureId) => {
    // Remove from tag's rejected list
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === tagId) {
          const rejectedIds = new Set(tag.rejectedFeatureIds || new Set())
          rejectedIds.delete(featureId)
          return {
            ...tag,
            rejectedFeatureIds: rejectedIds,
            updatedAt: Date.now()
          }
        }
        return tag
      })
    }))

    console.log('[Tag System] Undid rejection:', featureId, 'for tag:', tagId)

    // Trigger refresh to add back to candidates if applicable
    get().refreshCandidates()
  },

  setHighlightedFeature: (featureId) => {
    set({ highlightedFeatureId: featureId })
  },

  // ============================================================================
  // STAGE 2: WEIGHT MANAGEMENT ACTIONS
  // ============================================================================

  updateMetricWeight: (metric, weight) => {
    const { activeTagId, tags, currentWeights } = get() as any

    if (!activeTagId) {
      console.warn('[Tag System] No active tag to update weight')
      return
    }

    // Get or create weights object
    const activeTag = tags.find((t: Tag) => t.id === activeTagId)
    if (!activeTag) return

    const updatedWeights = {
      ...(activeTag.metricWeights || currentWeights || {
        decoder_similarity: 1.0,
        embedding: 1.0,
        fuzz: 1.0,
        detection: 1.0,
        semantic_similarity: 1.0,
        quality_score: 1.0
      }),
      [metric]: weight
    }

    // Update tag with custom weights
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === activeTagId) {
          return {
            ...tag,
            metricWeights: updatedWeights,
            updatedAt: Date.now()
          }
        }
        return tag
      })
    }))

    console.log('[Tag System] Updated weight for', metric, ':', weight)

    // Trigger refresh with new weights (will be debounced in component)
    get().refreshCandidates()
  },

  resetWeightsToAuto: () => {
    const { activeTagId } = get() as any

    if (!activeTagId) {
      console.warn('[Tag System] No active tag to reset weights')
      return
    }

    // Clear custom weights (will use auto-inferred)
    set((state: any) => ({
      tags: state.tags.map((tag: Tag) => {
        if (tag.id === activeTagId) {
          return {
            ...tag,
            metricWeights: undefined,
            updatedAt: Date.now()
          }
        }
        return tag
      }),
      currentSignature: null  // Also reset manual signature to auto-inferred
    }))

    console.log('[Tag System] Reset weights and signature to auto-inferred')

    // Trigger refresh with auto-inferred weights and signature
    get().refreshCandidates()
  },

  // ============================================================================
  // STAGE 2: METHOD SELECTION ACTIONS
  // ============================================================================

  toggleRangeFilter: () => {
    const state = get() as any
    const wasEnabled = state.candidateMethod.useRangeFilter

    if (wasEnabled) {
      // Disabling: Save current signature and set to full range (min: 0.0, max: 1.0)
      const fullRangeSignature: MetricSignature = {
        decoder_similarity: { min: 0.0, max: 1.0 },
        embedding: { min: 0.0, max: 1.0 },
        fuzz: { min: 0.0, max: 1.0 },
        detection: { min: 0.0, max: 1.0 },
        semantic_similarity: { min: 0.0, max: 1.0 },
        quality_score: { min: 0.0, max: 1.0 }
      }

      set({
        savedSignatureBeforeDisable: state.currentSignature, // Save current (may be null for auto-inferred)
        currentSignature: fullRangeSignature,
        candidateMethod: {
          ...state.candidateMethod,
          useRangeFilter: false
        }
      })

      console.log('[Tag System] Disabled range filter, saved signature:', state.currentSignature)
    } else {
      // Enabling: Restore saved signature
      set({
        currentSignature: state.savedSignatureBeforeDisable, // Restore (may be null)
        savedSignatureBeforeDisable: null,
        candidateMethod: {
          ...state.candidateMethod,
          useRangeFilter: true
        }
      })

      console.log('[Tag System] Enabled range filter, restored signature:', state.savedSignatureBeforeDisable)
    }

    // Trigger refresh with new method
    get().refreshCandidates()
  },

  toggleWeightedDistance: () => {
    const state = get() as any
    const wasEnabled = state.candidateMethod.useWeightedDistance

    if (wasEnabled) {
      // Disabling: Save current weights and set to uniform 1.0
      const uniformWeights: MetricWeights = {
        decoder_similarity: 1.0,
        embedding: 1.0,
        fuzz: 1.0,
        detection: 1.0,
        semantic_similarity: 1.0,
        quality_score: 1.0
      }

      set({
        savedWeightsBeforeDisable: state.currentWeights, // Save current (may be null for auto-inferred)
        currentWeights: uniformWeights,
        candidateMethod: {
          ...state.candidateMethod,
          useWeightedDistance: false
        }
      })

      console.log('[Tag System] Disabled weighted distance, saved weights:', state.currentWeights)
    } else {
      // Enabling: Restore saved weights
      set({
        currentWeights: state.savedWeightsBeforeDisable, // Restore (may be null)
        savedWeightsBeforeDisable: null,
        candidateMethod: {
          ...state.candidateMethod,
          useWeightedDistance: true
        }
      })

      console.log('[Tag System] Enabled weighted distance, restored weights:', state.savedWeightsBeforeDisable)
    }

    // Trigger refresh with new method
    get().refreshCandidates()
  },

  setCurrentSignature: (signature) => {
    set({ currentSignature: signature })

    console.log('[Tag System] Set current signature:', signature ? 'manual' : 'auto-inferred')

    // Trigger refresh with new signature
    get().refreshCandidates()
  },

  setStdMultiplier: (multiplier) => {
    set({ stdMultiplier: multiplier })

    console.log('[Tag System] Set std multiplier:', multiplier)

    // Clear manual signature when changing stdMultiplier (revert to auto-infer)
    set({ currentSignature: null })

    // Trigger refresh with new multiplier
    get().refreshCandidates()
  },

  // ============================================================================
  // GROUP EXPANSION ACTIONS
  // ============================================================================

  toggleGroupExpansion: (listType, rangeLabel) => {
    const key = `${listType}:${rangeLabel}`
    const { groupExpansionState } = get() as any

    const newState = new Map(groupExpansionState)
    const currentState = newState.get(key)

    if (currentState === undefined) {
      // First time accessing this group, determine smart default
      // Groups with score >= 0.80 start expanded
      const rangeMax = parseFloat(rangeLabel.split(' - ')[0])
      const shouldExpand = rangeMax >= 0.80
      newState.set(key, !shouldExpand) // Toggle from default
    } else {
      // Toggle existing state
      newState.set(key, !currentState)
    }

    set({ groupExpansionState: newState })

    console.log('[Tag System] Toggled group expansion:', key, '->', newState.get(key))
  },

  isGroupExpanded: (listType, rangeLabel) => {
    const key = `${listType}:${rangeLabel}`
    const { groupExpansionState } = get() as any

    const state = groupExpansionState.get(key)

    if (state === undefined) {
      // Smart default: groups with score >= 0.80 start expanded
      const rangeMax = parseFloat(rangeLabel.split(' - ')[0])
      return rangeMax >= 0.80
    }

    return state
  }
})
