// ============================================================================
// TAG ACTIONS
// Zustand store actions for tag management (Stage 1)
// ============================================================================

import type { StateCreator } from 'zustand'
import type {
  Tag,
  MetricSignature,
  FeatureMatch,
  FeatureTableRow
} from '../types'
import {
  generateTagId,
  findCandidateFeatures,
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

  // Tag actions
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

  // Candidate discovery (Stage 2 preview)
  findCandidates: (tagId: string, limit?: number) => FeatureMatch[]
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

  // ============================================================================
  // TAG CRUD OPERATIONS
  // ============================================================================

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
  // CANDIDATE DISCOVERY (Stage 2 Preview)
  // ============================================================================

  findCandidates: (tagId, limit = 10) => {
    const tag = get().tags.find((t: Tag) => t.id === tagId)
    const tableData = get().tableData

    if (!tag || !tableData) {
      console.warn('[Tag System] Cannot find candidates: tag or table data not available')
      return []
    }

    // Find candidates using Euclidean distance
    const candidates = findCandidateFeatures(
      tableData.features,
      tag.metricSignature,
      tag.featureIds,  // Exclude already tagged features
      limit
    )

    console.log('[Tag System] Found', candidates.length, 'candidates for tag:', tagId)
    return candidates
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
          selectedIds.forEach(id => updatedFeatureIds.add(id))
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
  }
})
