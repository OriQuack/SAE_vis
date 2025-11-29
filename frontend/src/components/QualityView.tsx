import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableRow, SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import ThresholdTaggingPanel from './ThresholdTaggingPanel'
import { isBimodalScore } from './BimodalityIndicator'
import { TAG_CATEGORY_QUALITY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import '../styles/QualityView.css'

// ============================================================================
// QUALITY VIEW - Organized layout for quality assessment workflow (Stage 2)
// ============================================================================
// Layout: [SelectionPanel bar] | [Top: placeholder] | [Bottom: ThresholdTaggingPanel]

// Commit history types
type SelectionState = 'selected' | 'rejected'
type SelectionSource = 'manual' | 'auto'

export interface QualityTagCommit {
  id: number
  type: 'initial' | 'apply' | 'tagAll'
  featureSelectionStates: Map<number, SelectionState>
  featureSelectionSources: Map<number, SelectionSource>
}

// Maximum number of commits to keep (oldest auto-removed)
const MAX_COMMITS = 10

interface QualityViewProps {
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void
}

const QualityView: React.FC<QualityViewProps> = ({
  className = '',
  onCategoryRefsReady
}) => {
  // Store state
  const tableData = useVisualizationStore(state => state.tableData)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const tagAutomaticState = useVisualizationStore(state => state.tagAutomaticState)
  const isDraggingThreshold = useVisualizationStore(state => state.isDraggingThreshold)
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const lastSortedSelectionSignature = useVisualizationStore(state => state.lastSortedSelectionSignature)
  const sortBySimilarity = useVisualizationStore(state => state.sortBySimilarity)
  const applySimilarityTags = useVisualizationStore(state => state.applySimilarityTags)
  const restoreFeatureSelectionStates = useVisualizationStore(state => state.restoreFeatureSelectionStates)
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // Local state
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  const [activeListSource, setActiveListSource] = useState<'all' | 'reject' | 'select'>('all')

  // ============================================================================
  // COMMIT HISTORY STATE - Save and restore tagging state snapshots
  // ============================================================================
  const [tagCommitHistory, setTagCommitHistory] = useState<QualityTagCommit[]>([
    { id: 0, type: 'initial', featureSelectionStates: new Map(), featureSelectionSources: new Map() }
  ])
  const [currentCommitIndex, setCurrentCommitIndex] = useState(0)

  // Dependencies for selectedFeatureIds
  const sankeyStructure = leftPanel?.sankeyStructure
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps
    const features = getSelectedNodeFeatures()
    console.log('[QualityView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds])

  // Filter tableData to only include selected features
  const filteredTableData = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) {
      return null
    }

    const filteredFeatures = tableData.features.filter((row: FeatureTableRow) => selectedFeatureIds.has(row.feature_id))

    return {
      rows: filteredFeatures
    }
  }, [tableData, selectedFeatureIds])

  // Build feature list with metadata
  const featureList = useMemo(() => {
    if (!filteredTableData?.rows) return []

    return filteredTableData.rows.map((row: FeatureTableRow) => ({
      featureId: row.feature_id,
      qualityScore: (row as any).quality_score || 0,
      row
    }))
  }, [filteredTableData])

  // Auto-populate similarity scores when feature list is ready or selection states change
  useEffect(() => {
    // Extract manual selections to compute signature
    const currentSelectedIds: number[] = []
    const currentRejectedIds: number[] = []
    featureSelectionStates.forEach((state, featureId) => {
      const source = featureSelectionSources.get(featureId)
      if (source === 'manual') {
        if (state === 'selected') currentSelectedIds.push(featureId)
        else if (state === 'rejected') currentRejectedIds.push(featureId)
      }
    })

    const hasRequiredSelections = currentSelectedIds.length >= 1 && currentRejectedIds.length >= 1

    // Compute current signature to detect if scores are stale
    const currentSignature = `selected:${currentSelectedIds.sort((a, b) => a - b).join(',')}|rejected:${currentRejectedIds.sort((a, b) => a - b).join(',')}`
    const scoresAreStale = lastSortedSelectionSignature !== currentSignature

    // Need to compute scores if: (1) empty OR (2) selection signature changed
    const needsScores = (similarityScores.size === 0 || scoresAreStale) && featureList.length > 0

    if (hasRequiredSelections && needsScores) {
      console.log('[QualityView] Computing similarity scores for', featureList.length, 'features (stale:', scoresAreStale, ')')
      sortBySimilarity()
    }
  }, [featureList, featureSelectionStates, featureSelectionSources, similarityScores.size, lastSortedSelectionSignature, sortBySimilarity])

  // When threshold dragging starts, switch to 'all' list
  useEffect(() => {
    if (isDraggingThreshold && (activeListSource === 'reject' || activeListSource === 'select')) {
      console.log('[QualityView] Threshold drag started, switching from', activeListSource, 'to all list')
      setActiveListSource('all')
      setCurrentFeatureIndex(0)
    }
  }, [isDraggingThreshold, activeListSource])

  // ============================================================================
  // BOUNDARY ITEMS LOGIC (for bottom row left/right lists)
  // ============================================================================

  type FeatureWithMetadata = {
    featureId: number
    qualityScore: number
    row: FeatureTableRow | null
  }

  // Keep previous boundary items during histogram reload
  const prevBoundaryItemsRef = useRef<{ rejectBelow: FeatureWithMetadata[], selectAbove: FeatureWithMetadata[] }>({ rejectBelow: [], selectAbove: [] })

  const boundaryItems = useMemo(() => {
    if (!tagAutomaticState?.histogramData) {
      if (prevBoundaryItemsRef.current.rejectBelow.length > 0 || prevBoundaryItemsRef.current.selectAbove.length > 0) {
        return prevBoundaryItemsRef.current
      }
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
    const rejectThreshold = tagAutomaticState?.rejectThreshold ?? -0.8

    if (featureList.length === 0) {
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    // Filter features that have SVM similarity scores
    const featuresWithScores = featureList.filter(f => similarityScores.has(f.featureId))

    if (featuresWithScores.length === 0) {
      return { rejectBelow: [] as FeatureWithMetadata[], selectAbove: [] as FeatureWithMetadata[] }
    }

    // REJECT THRESHOLD - Below reject: features < rejectThreshold, sorted descending (closest to threshold first)
    const rejectBelow = featuresWithScores
      .filter(f => similarityScores.get(f.featureId)! < rejectThreshold)
      .sort((a, b) => similarityScores.get(b.featureId)! - similarityScores.get(a.featureId)!)

    // SELECT THRESHOLD - Above select: features >= selectThreshold, sorted ascending (closest to threshold first)
    const selectAbove = featuresWithScores
      .filter(f => similarityScores.get(f.featureId)! >= selectThreshold)
      .sort((a, b) => similarityScores.get(a.featureId)! - similarityScores.get(b.featureId)!)

    const result = { rejectBelow, selectAbove }
    prevBoundaryItemsRef.current = result
    return result
  }, [featureList, tagAutomaticState, similarityScores])

  // Get tag color for header badge
  const wellExplainedColor = getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#4CAF50'

  // ============================================================================
  // CLICK HANDLERS
  // ============================================================================

  const handleBoundaryListClick = useCallback((listType: 'left' | 'right', index: number) => {
    const items = listType === 'left' ? boundaryItems.rejectBelow : boundaryItems.selectAbove
    if (index >= 0 && index < items.length) {
      setActiveListSource(listType === 'left' ? 'reject' : 'select')
      setCurrentFeatureIndex(index)
    }
  }, [boundaryItems.rejectBelow, boundaryItems.selectAbove])

  // ============================================================================
  // APPLY TAGS HANDLER
  // ============================================================================

  const handleApplyTags = useCallback(() => {
    // 1. Save current state to current commit before applying new tags
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    // 2. Apply auto-tags based on current thresholds
    applySimilarityTags()

    // 3. Create a new commit with the updated state
    setTimeout(() => {
      const store = useVisualizationStore.getState()
      const newCommit: QualityTagCommit = {
        id: tagCommitHistory.length,
        type: 'apply',
        featureSelectionStates: new Map(store.featureSelectionStates),
        featureSelectionSources: new Map(store.featureSelectionSources)
      }

      setTagCommitHistory(prev => {
        let newHistory = [...prev, newCommit]
        if (newHistory.length > MAX_COMMITS) {
          newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
        }
        return newHistory
      })

      setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))

      console.log('[QualityView] Created new commit, history length:', tagCommitHistory.length + 1)
    }, 0)

    // 4. Reset
    setCurrentFeatureIndex(0)
    setActiveListSource('all')
  }, [applySimilarityTags, featureSelectionStates, featureSelectionSources, currentCommitIndex, tagCommitHistory.length])

  // Handle commit circle click - restore state from that commit
  const handleCommitClick = useCallback((commitIndex: number) => {
    if (commitIndex < 0 || commitIndex >= tagCommitHistory.length) return
    if (commitIndex === currentCommitIndex) return

    // Save current state to current commit before switching
    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    // Restore the clicked commit's state
    const targetCommit = tagCommitHistory[commitIndex]
    restoreFeatureSelectionStates(targetCommit.featureSelectionStates, targetCommit.featureSelectionSources)

    setCurrentCommitIndex(commitIndex)

    console.log('[QualityView] Restored commit', commitIndex, 'with', targetCommit.featureSelectionStates.size, 'features')
  }, [tagCommitHistory, currentCommitIndex, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates])

  // ============================================================================
  // TAG ALL HANDLERS
  // ============================================================================

  const isBimodal = useMemo(() => {
    return isBimodalScore(tagAutomaticState?.histogramData?.bimodality)
  }, [tagAutomaticState?.histogramData?.bimodality])

  // Check if all features are tagged
  const allFeaturesTagged = useMemo(() => {
    if (featureList.length === 0) return false
    return featureList.every(f => featureSelectionStates.has(f.featureId))
  }, [featureList, featureSelectionStates])

  // Handle Tag All - Tag all unsure as Need Revision (rejected)
  const handleTagAllNeedRevision = useCallback(() => {
    console.log('[TagAll] Need Revision option clicked')

    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    const newStates = new Map(featureSelectionStates)
    const newSources = new Map(featureSelectionSources)

    let taggedCount = 0
    featureList.forEach(f => {
      if (!newStates.has(f.featureId)) {
        newStates.set(f.featureId, 'rejected')
        newSources.set(f.featureId, 'manual')
        taggedCount++
      }
    })

    console.log('[TagAll] Tagged', taggedCount, 'features as Need Revision')

    restoreFeatureSelectionStates(newStates, newSources)

    const newCommit: QualityTagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      featureSelectionStates: new Map(newStates),
      featureSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))
  }, [featureList, featureSelectionStates, featureSelectionSources, restoreFeatureSelectionStates, currentCommitIndex, tagCommitHistory.length])

  // Handle Tag All - By Decision Boundary
  const handleTagAllByBoundary = useCallback(() => {
    console.log('[TagAll] By Decision Boundary (score=0) option clicked')

    setTagCommitHistory(prev => {
      const updated = [...prev]
      updated[currentCommitIndex] = {
        ...updated[currentCommitIndex],
        featureSelectionStates: new Map(featureSelectionStates),
        featureSelectionSources: new Map(featureSelectionSources)
      }
      return updated
    })

    const newStates = new Map(featureSelectionStates)
    const newSources = new Map(featureSelectionSources)

    let selectedCount = 0
    let rejectedCount = 0

    featureList.forEach(f => {
      if (newStates.has(f.featureId)) return

      const score = similarityScores.get(f.featureId)
      if (score !== undefined) {
        if (score >= 0) {
          newStates.set(f.featureId, 'selected')
          newSources.set(f.featureId, 'manual')
          selectedCount++
        } else {
          newStates.set(f.featureId, 'rejected')
          newSources.set(f.featureId, 'manual')
          rejectedCount++
        }
      } else {
        newStates.set(f.featureId, 'rejected')
        newSources.set(f.featureId, 'manual')
        rejectedCount++
      }
    })

    console.log('[TagAll] By Decision Boundary results:', {
      wellExplainedAboveZero: selectedCount,
      needRevisionBelowZero: rejectedCount
    })

    restoreFeatureSelectionStates(newStates, newSources)

    const newCommit: QualityTagCommit = {
      id: tagCommitHistory.length,
      type: 'tagAll',
      featureSelectionStates: new Map(newStates),
      featureSelectionSources: new Map(newSources)
    }

    setTagCommitHistory(prev => {
      let newHistory = [...prev, newCommit]
      if (newHistory.length > MAX_COMMITS) {
        newHistory = [newHistory[0], ...newHistory.slice(-(MAX_COMMITS - 1))]
      }
      return newHistory
    })
    setCurrentCommitIndex(prev => Math.min(prev + 1, MAX_COMMITS - 1))
  }, [featureList, featureSelectionStates, featureSelectionSources, similarityScores, restoreFeatureSelectionStates, currentCommitIndex, tagCommitHistory.length])

  // Unified Tag All handler
  const handleTagAll = useCallback((method: 'left' | 'byBoundary') => {
    if (method === 'left') {
      handleTagAllNeedRevision()
    } else {
      handleTagAllByBoundary()
    }
  }, [handleTagAllNeedRevision, handleTagAllByBoundary])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`quality-view ${className}`}>
      {/* Header - Full width */}
      <div className="quality-view__header">
        <h3 className="quality-view__title">Quality Assessment</h3>
        <p className="quality-view__description">
          Validate features for{' '}
          <span
            className="quality-view__tag-badge"
            style={{ backgroundColor: wellExplainedColor }}
          >
            Well-Explained
          </span>
        </p>
      </div>

      {/* Body: SelectionPanel + Content area */}
      <div className="quality-view__body">
        {/* Left column: SelectionPanel vertical bar */}
        <SelectionPanel
          mode="feature"
          tagLabel="Quality"
          onCategoryRefsReady={onCategoryRefsReady}
          filteredFeatureIds={selectedFeatureIds || undefined}
          commitHistory={tagCommitHistory}
          currentCommitIndex={currentCommitIndex}
          onCommitClick={handleCommitClick}
        />

        {/* Right column: 2 rows */}
        <div className="quality-view__content">
          {/* Top row: Placeholder */}
          <div className="quality-view__row-top">
            <div className="quality-view__placeholder">
              <span className="quality-view__placeholder-text">Feature details coming soon</span>
            </div>
          </div>

          {/* Bottom row: ThresholdTaggingPanel */}
          <ThresholdTaggingPanel
            mode="feature"
            tagCategoryId={TAG_CATEGORY_QUALITY}
            leftFeatures={boundaryItems.rejectBelow}
            rightFeatures={boundaryItems.selectAbove}
            leftListLabel="Need Revision"
            rightListLabel="Well-Explained"
            histogramProps={{
              filteredFeatureIds: selectedFeatureIds || undefined
            }}
            onApplyTags={handleApplyTags}
            onTagAll={handleTagAll}
            onNextStage={moveToNextStep}
            onListItemClick={handleBoundaryListClick}
            activeListSource={activeListSource}
            currentIndex={currentFeatureIndex}
            isBimodal={isBimodal}
            allTagged={allFeaturesTagged}
          />
        </div>
      </div>
    </div>
  )
}

export default React.memo(QualityView)
