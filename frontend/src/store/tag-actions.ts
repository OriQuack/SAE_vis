// ============================================================================
// TAG ACTIONS
// Zustand store actions for tag management (Stage 1)
// ============================================================================

import type { StateCreator } from 'zustand'
import type {
  Tag,
  MetricWeights,
  FeatureMatch,
  FeatureTableRow,
  CandidateVerificationState
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
  highlightedFeatureId: number | null        // Feature to highlight in TablePanel

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
}

// ============================================================================
// TAG ACTIONS CREATOR
// ============================================================================

export const createTagActions: StateCreator<
  any,
  [],
  [],
  TagState
> = (set, get) => ({
  // Initial state
  tags: [],
  selectedFeatureIds: new Set<number>(),
  activeTagId: null,

  // Stage 2 initial state
  candidateFeatures: [],
  candidateStates: new Map<number, CandidateVerificationState>(),
  currentWeights: null,
  highlightedFeatureId: null,

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
        feature_splitting: { min: 0.0, max: 1.0 },
        embedding: { min: 0.0, max: 1.0 },
        fuzz: { min: 0.0, max: 1.0 },
        detection: { min: 0.0, max: 1.0 },
        semantic_similarity: { min: 0.0, max: 1.0 },
        quality_score: { min: 0.0, max: 1.0 }
      },
      featureIds: new Set<number>(),
      rejectedFeatureIds: new Set<number>(),  // Initialize rejected set (Stage 2)
      metricWeights: undefined,  // Auto-inferred by default
      color: color || '#3b82f6'  // Default to blue
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
    set({ activeTagId: id })
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
      templateSource: template.name
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
      }),
      // Clear selection after assignment
      selectedFeatureIds: new Set<number>()
    }))

    console.log('[Tag System] Assigned', selectedIds.size, 'features to tag:', tagId)
  },

  // ============================================================================
  // STAGE 2: CANDIDATE DISCOVERY ACTIONS
  // ============================================================================

  refreshCandidates: () => {
    const { selectedFeatureIds, activeTagId, tags, tableData } = get() as any

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

    // Infer signature from selected features
    const signature = inferMetricSignature(selectedFeatures)

    // Use tag's custom weights or infer from signature
    const weights = activeTag?.metricWeights || inferMetricWeights(signature)

    // Find candidates excluding selected + rejected features
    const rejectedIds = activeTag?.rejectedFeatureIds || new Set<number>()
    const candidates = findCandidateFeatures(
      tableData.features,
      signature,
      selectedFeatureIds,
      rejectedIds,
      weights,
      20  // Top 20 candidates
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
        feature_splitting: 1.0,
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
      })
    }))

    console.log('[Tag System] Reset weights to auto-inferred')

    // Trigger refresh with auto-inferred weights
    get().refreshCandidates()
  }
})
