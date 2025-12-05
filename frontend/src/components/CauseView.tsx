import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { useVisualizationStore } from '../store/index'
import type { SelectionCategory, FeatureTableRow } from '../types'
import SelectionPanel from './SelectionPanel'
import UMAPScatter from './UMAPScatter'
import { ScrollableItemList } from './ScrollableItemList'
import { TagBadge, CauseMetricBars } from './Indicators'
import ActivationExample from './ActivationExamplePanel'
import { HighlightedExplanation } from './ExplanationPanel'
import ModalityIndicator from './ModalityIndicator'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import { getExplainerDisplayName } from '../lib/table-data-utils'
import { SEMANTIC_SIMILARITY_COLORS } from '../lib/color-utils'
import type { CauseCategory } from '../lib/umap-utils'
import '../styles/CauseView.css'

// ============================================================================
// CAUSE VIEW - Root cause analysis workflow (Stage 3)
// ============================================================================
// Layout: [SelectionPanel bar] | [Content: UMAP + Selected Features List]

// Map CauseCategory to display tag names
const CAUSE_TAG_NAMES: Record<CauseCategory, string> = {
  'noisy-activation': 'Noisy Activation',
  'missed-N-gram': 'Missed N-gram',
  'missed-context': 'Missed Context',
  'well-explained': 'Well-Explained'
}

// Pagination constant
const ITEMS_PER_PAGE = 8

interface CauseViewProps {
  className?: string
  onCategoryRefsReady?: (refs: Map<SelectionCategory, HTMLDivElement>) => void
}

const CauseView: React.FC<CauseViewProps> = ({
  className = '',
  onCategoryRefsReady
}) => {
  // Store state
  const getSelectedNodeFeatures = useVisualizationStore(state => state.getSelectedNodeFeatures)

  // Dependencies for selectedFeatureIds
  const sankeyStructure = useVisualizationStore(state => state.leftPanel?.sankeyStructure)
  const selectedSegment = useVisualizationStore(state => state.selectedSegment)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)

  // Stage 3 revisiting state
  const isRevisitingStage3 = useVisualizationStore(state => state.isRevisitingStage3)
  const stage3FinalCommit = useVisualizationStore(state => state.stage3FinalCommit)
  const setStage3FinalCommit = useVisualizationStore(state => state.setStage3FinalCommit)
  const restoreCauseSelectionStates = useVisualizationStore(state => state.restoreCauseSelectionStates)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)
  const causeMetricScores = useVisualizationStore(state => state.causeMetricScores)

  // Multi-modality state
  const causeMultiModality = useVisualizationStore(state => state.causeMultiModality)
  const fetchMultiModality = useVisualizationStore(state => state.fetchMultiModality)

  // UMAP brushed features
  const umapBrushedFeatureIds = useVisualizationStore(state => state.umapBrushedFeatureIds)

  // Table data and activation examples for feature detail view
  const tableData = useVisualizationStore(state => state.tableData)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Cause category selection action
  const setCauseCategory = useVisualizationStore(state => state.setCauseCategory)
  const initializeCauseAutoTags = useVisualizationStore(state => state.initializeCauseAutoTags)

  // Local state for feature detail view
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState(600)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const hasAutoTaggedRef = useRef(false)

  // Top row feature list pagination - currentPage derived from currentFeatureIndex
  const currentPage = Math.floor(currentFeatureIndex / ITEMS_PER_PAGE)

  // ============================================================================
  // STAGE 3 REVISITING - Restore state when returning from Stage 4+
  // ============================================================================
  useEffect(() => {
    if (isRevisitingStage3 && stage3FinalCommit) {
      console.log('[CauseView] Revisiting Stage 3, restoring from saved commit')

      // Restore cause selection states to store
      restoreCauseSelectionStates(stage3FinalCommit.causeSelectionStates, stage3FinalCommit.causeSelectionSources)
      // Mark as already auto-tagged since we're restoring
      hasAutoTaggedRef.current = true
    }
  }, [isRevisitingStage3, stage3FinalCommit, restoreCauseSelectionStates])

  // Get selected feature IDs from the selected node/segment
  const selectedFeatureIds = useMemo(() => {
    // If revisiting Stage 3 and we have stored feature IDs, use those
    if (isRevisitingStage3 && stage3FinalCommit?.featureIds) {
      console.log('[CauseView] Using stored Stage 3 feature IDs:', stage3FinalCommit.featureIds.size)
      return stage3FinalCommit.featureIds
    }

    const _deps = { sankeyStructure, selectedSegment, tableSelectedNodeIds }
    void _deps
    const features = getSelectedNodeFeatures()
    console.log('[CauseView] Sankey segment features:', features?.size || 0)
    return features
  }, [getSelectedNodeFeatures, sankeyStructure, selectedSegment, tableSelectedNodeIds, isRevisitingStage3, stage3FinalCommit])

  // ============================================================================
  // AUTO-TAGGING - Initialize cause tags when entering Stage 3
  // ============================================================================
  useEffect(() => {
    // Skip if revisiting (will restore from commit) or already auto-tagged
    if (isRevisitingStage3 || hasAutoTaggedRef.current) return

    // Wait for all required data
    if (!selectedFeatureIds || selectedFeatureIds.size === 0) return
    if (!tableData?.features) return

    console.log('[CauseView] Auto-tagging features on Stage 3 entry:', selectedFeatureIds.size, 'features')

    // Run auto-tagging
    initializeCauseAutoTags(selectedFeatureIds)
    hasAutoTaggedRef.current = true
  }, [isRevisitingStage3, selectedFeatureIds, tableData, activationExamples, initializeCauseAutoTags])

  // Initialize stage3FinalCommit with initial state when first entering Stage 3
  // This ensures we can restore even if user does nothing and moves to Stage 4
  // Wait for auto-tagging to complete before creating the commit
  useEffect(() => {
    // Only initialize when: not revisiting, no saved commit yet, features exist, and auto-tagging is done
    if (!isRevisitingStage3 && !stage3FinalCommit && selectedFeatureIds && selectedFeatureIds.size > 0 && hasAutoTaggedRef.current) {
      // Calculate counts from auto-tagged states
      let noisyActivation = 0
      let missedContext = 0
      let missedNgram = 0
      let unsure = 0

      for (const featureId of selectedFeatureIds) {
        const category = causeSelectionStates.get(featureId)
        if (category === 'noisy-activation') noisyActivation++
        else if (category === 'missed-context') missedContext++
        else if (category === 'missed-N-gram') missedNgram++
        else unsure++
      }

      console.log('[CauseView] Initializing Stage 3 commit with auto-tagged state:', {
        total: selectedFeatureIds.size,
        noisyActivation,
        missedContext,
        missedNgram,
        unsure
      })

      setStage3FinalCommit({
        causeSelectionStates: new Map(causeSelectionStates),
        causeSelectionSources: new Map(causeSelectionSources),
        featureIds: new Set(selectedFeatureIds),
        counts: {
          noisyActivation,
          missedContext,
          missedNgram,
          unsure,
          total: selectedFeatureIds.size
        }
      })
    }
  }, [isRevisitingStage3, stage3FinalCommit, selectedFeatureIds, setStage3FinalCommit, causeSelectionStates, causeSelectionSources])

  // ============================================================================
  // MULTI-MODALITY - Fetch when there are enough manual tags
  // ============================================================================
  useEffect(() => {
    if (!selectedFeatureIds || selectedFeatureIds.size < 3) return

    // Count manually tagged features per category
    const manualTagsByCategory: Record<string, number> = {}
    causeSelectionStates.forEach((category, featureId) => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') {
        manualTagsByCategory[category] = (manualTagsByCategory[category] || 0) + 1
      }
    })

    // Need at least 2 different categories with manual tags
    const categoriesWithManualTags = Object.keys(manualTagsByCategory).length
    if (categoriesWithManualTags < 2) return

    // Build cause selections (manual only) for API call
    const causeSelections: Record<number, string> = {}
    causeSelectionStates.forEach((category, featureId) => {
      const source = causeSelectionSources.get(featureId)
      if (source === 'manual') {
        causeSelections[featureId] = category
      }
    })

    // Fetch multi-modality test
    const featureIds = Array.from(selectedFeatureIds)
    fetchMultiModality(featureIds, causeSelections)
  }, [selectedFeatureIds, causeSelectionStates, causeSelectionSources, fetchMultiModality])

  // Get tag color for header badge (Need Revision - parent tag from Stage 2)
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af'

  // Convert brushed feature IDs to array for ScrollableItemList
  const brushedFeatureList = useMemo(() => {
    return Array.from(umapBrushedFeatureIds)
  }, [umapBrushedFeatureIds])

  // Build feature list with metadata for the top row detail view (ALL features from segment)
  const featureListWithMetadata = useMemo(() => {
    if (!tableData?.features || !selectedFeatureIds || selectedFeatureIds.size === 0) return []

    const featureMap = new Map<number, FeatureTableRow>()
    tableData.features.forEach((row: FeatureTableRow) => {
      featureMap.set(row.feature_id, row)
    })

    return Array.from(selectedFeatureIds)
      .map(featureId => ({
        featureId,
        row: featureMap.get(featureId) || null
      }))
      .filter(item => item.row !== null)
  }, [tableData, selectedFeatureIds])

  // Pagination for the top row list
  const totalPages = Math.max(1, Math.ceil(featureListWithMetadata.length / ITEMS_PER_PAGE))
  const currentPageFeatures = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE
    return featureListWithMetadata.slice(start, start + ITEMS_PER_PAGE)
  }, [featureListWithMetadata, currentPage])

  // Reset feature index when brushed list changes
  useEffect(() => {
    if (currentFeatureIndex >= featureListWithMetadata.length && featureListWithMetadata.length > 0) {
      setCurrentFeatureIndex(featureListWithMetadata.length - 1)
    } else if (featureListWithMetadata.length === 0) {
      setCurrentFeatureIndex(0)
    }
  }, [featureListWithMetadata.length, currentFeatureIndex])

  // Track right panel width for ActivationExample
  useEffect(() => {
    if (!rightPanelRef.current) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width || 600
      setContainerWidth(width - 16)
    })
    observer.observe(rightPanelRef.current)
    return () => observer.disconnect()
  }, [])

  // Get selected feature data for right panel
  const selectedFeatureData = useMemo(() => {
    const feature = featureListWithMetadata[currentFeatureIndex]
    if (!feature) return null

    return {
      featureId: feature.featureId,
      row: feature.row,
      activation: activationExamples[feature.featureId] || null
    }
  }, [featureListWithMetadata, currentFeatureIndex, activationExamples])

  // Find the best explanation (max quality score)
  const bestExplanation = useMemo(() => {
    if (!selectedFeatureData?.row || !tableData?.explainer_ids) return null

    let bestExplainerId: string | null = null
    let bestScore = -Infinity
    let bestData: {
      highlightedExplanation: { segments: Array<{ text: string; highlight: boolean }> } | null
      explanationText: string | null
      qualityScore: number
    } | null = null

    for (const explainerId of tableData.explainer_ids) {
      const explainerData = selectedFeatureData.row?.explainers?.[explainerId]
      const score = explainerData?.quality_score
      if (score !== null && score !== undefined && score > bestScore) {
        bestScore = score
        bestExplainerId = explainerId
        bestData = {
          highlightedExplanation: explainerData?.highlighted_explanation ?? null,
          explanationText: explainerData?.explanation_text ?? null,
          qualityScore: score
        }
      }
    }

    if (!bestExplainerId || !bestData) return null

    return {
      explainerId: bestExplainerId,
      ...bestData
    }
  }, [selectedFeatureData, tableData?.explainer_ids])

  // Handle click on feature in top row list
  const handleFeatureListClick = useCallback((index: number) => {
    const globalIndex = currentPage * ITEMS_PER_PAGE + index
    setCurrentFeatureIndex(globalIndex)
  }, [currentPage])

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================

  const handleNavigatePrevious = useCallback(() => {
    setCurrentFeatureIndex(i => Math.max(0, i - 1))
  }, [])

  const handleNavigateNext = useCallback(() => {
    setCurrentFeatureIndex(i => Math.min(featureListWithMetadata.length - 1, i + 1))
  }, [featureListWithMetadata.length])

  // ============================================================================
  // TAG BUTTON HANDLERS
  // ============================================================================

  // Get current feature's cause selection state and source
  const currentCauseCategory = useMemo(() => {
    if (!selectedFeatureData) return null
    return causeSelectionStates.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, causeSelectionStates])

  const currentCauseSource = useMemo(() => {
    if (!selectedFeatureData) return null
    return causeSelectionSources.get(selectedFeatureData.featureId) || null
  }, [selectedFeatureData, causeSelectionSources])

  // Handle tag button click - set to specific category (no toggle off - must always have a tag)
  // Auto-tagged features can be confirmed by clicking the same category
  const handleTagClick = useCallback((category: CauseCategory) => {
    if (!selectedFeatureData) return
    const featureId = selectedFeatureData.featureId

    // If clicking same category and it's auto-tagged, confirm it (change to manual)
    // If clicking different category, set new category (will be manual)
    const isSameCategory = currentCauseCategory === category
    const isAutoTagged = currentCauseSource === 'auto'

    if (isSameCategory && !isAutoTagged) {
      // Already manually selected same category - do nothing
      return
    }

    // Either confirming auto tag or changing category - update with manual source
    setCauseCategory(featureId, category)

    // Auto-advance to next feature
    if (currentFeatureIndex < featureListWithMetadata.length - 1) {
      setTimeout(() => handleNavigateNext(), 150)
    }
  }, [selectedFeatureData, currentCauseCategory, currentCauseSource, setCauseCategory, currentFeatureIndex, featureListWithMetadata.length, handleNavigateNext])

  // Get colors for each cause category
  const noisyActivationColor = getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af'
  const missedNgramColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed N-gram') || '#9ca3af'
  const missedContextColor = getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af'
  const wellExplainedColor = getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#9ca3af'

  // Render feature item for top row ScrollableItemList (with click handler)
  const renderTopRowFeatureItem = useCallback((feature: typeof featureListWithMetadata[0], index: number) => {
    const causeCategory = causeSelectionStates.get(feature.featureId)
    const causeSource = causeSelectionSources.get(feature.featureId)
    const scores = causeMetricScores.get(feature.featureId)

    // All features must have a tag - use category name or default to Noisy Activation
    const tagName = causeCategory ? CAUSE_TAG_NAMES[causeCategory] : 'Noisy Activation'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
        <TagBadge
          featureId={feature.featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_CAUSE}
          onClick={() => handleFeatureListClick(index)}
          fullWidth={true}
          isAuto={causeSource === 'auto'}
        />
        <CauseMetricBars scores={scores ?? null} selectedCategory={causeCategory} />
      </div>
    )
  }, [causeSelectionStates, causeSelectionSources, causeMetricScores, handleFeatureListClick])

  // Render feature item for bottom row ScrollableItemList (no click handler)
  const renderBottomRowFeatureItem = useCallback((featureId: number) => {
    const causeCategory = causeSelectionStates.get(featureId)
    const causeSource = causeSelectionSources.get(featureId)
    const scores = causeMetricScores.get(featureId)

    // All features must have a tag - use category name or default to Noisy Activation
    const tagName = causeCategory ? CAUSE_TAG_NAMES[causeCategory] : 'Noisy Activation'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
        <TagBadge
          featureId={featureId}
          tagName={tagName}
          tagCategoryId={TAG_CATEGORY_CAUSE}
          fullWidth={true}
          isAuto={causeSource === 'auto'}
        />
        <CauseMetricBars scores={scores ?? null} selectedCategory={causeCategory} />
      </div>
    )
  }, [causeSelectionStates, causeSelectionSources, causeMetricScores])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`cause-view ${className}`}>
      {/* Header - Full width */}
      <div className="view-header">
        <span className="view-title">Cause Analysis</span>
        <span className="view-description">
          Determine root cause for features that{' '}
          <span
            className="view-tag-badge"
            style={{ backgroundColor: needRevisionColor }}
          >
            Need Revision
          </span>
        </span>
      </div>

      {/* Body: SelectionPanel + Content area */}
      <div className="cause-view__body">
        {/* Left column: SelectionPanel vertical bar */}
        {/* TODO: Stage 3 selection panel implementation */}
        <SelectionPanel
          stage="stage3"
          onCategoryRefsReady={onCategoryRefsReady}
          filteredFeatureIds={selectedFeatureIds || undefined}
        />

        {/* Right column: Top placeholder + Bottom UMAP section */}
        <div className="cause-view__content">
          {/* Top row: Feature list + Activation/Explanation panel */}
          <div className="cause-view__row-top">
            {/* Left: All features from segment */}
            <ScrollableItemList
              variant="cause"
              badges={[{ label: 'Features', count: featureListWithMetadata.length }]}
              items={currentPageFeatures}
              renderItem={renderTopRowFeatureItem}
              currentIndex={currentFeatureIndex % ITEMS_PER_PAGE}
              isActive={true}
              pageNavigation={{
                currentPage,
                totalPages,
                onPreviousPage: () => {
                  if (currentPage > 0) {
                    setCurrentFeatureIndex((currentPage - 1) * ITEMS_PER_PAGE)
                  }
                },
                onNextPage: () => {
                  if (currentPage < totalPages - 1) {
                    setCurrentFeatureIndex((currentPage + 1) * ITEMS_PER_PAGE)
                  }
                }
              }}
            />

            {/* Right panel: Activation examples and explanations */}
            <div className="cause-view__right-panel" ref={rightPanelRef}>
              {selectedFeatureData ? (
                <>
                  {/* Header row */}
                  <div className="cause-view__header-row">
                    <h4 className="subheader">Activation Examples</h4>
                    <span className="panel-header__id">#{selectedFeatureData.featureId}</span>
                    <div style={{ flex: 1 }} />
                    {/* Activation legend */}
                    <div className="cause-view__legend">
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--activation">token</span>:
                        <span className="legend-label">Activation Strength</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-sample legend-sample--intra">token</span>:
                        <span className="legend-label">Feature-Specific N-gram</span>
                      </div>
                    </div>
                  </div>

                  {/* Activation Examples Section */}
                  <div className="cause-view__activation-section">
                    <div className="cause-view__activation-examples">
                      {selectedFeatureData.activation ? (
                        <ActivationExample
                          examples={selectedFeatureData.activation}
                          containerWidth={containerWidth}
                          numQuantiles={4}
                          examplesPerQuantile={[2, 2, 2, 2]}
                          disableHover={true}
                        />
                      ) : (
                        <div className="cause-view__loading">Loading activation examples...</div>
                      )}
                    </div>
                  </div>

                  {/* Best Explanation Header - Outside bordered container */}
                  <div className="cause-view__explanation-header">
                    <h4 className="subheader">Best Explanation</h4>
                    {bestExplanation && (
                      <div className="pair-info__similarity">
                        <span className="similarity__label">Quality Score:</span>
                        <span className="similarity__value">
                          {bestExplanation.qualityScore.toFixed(3)}
                        </span>
                      </div>
                    )}
                    {/* Semantic similarity legend */}
                    <div className="cause-view__explanation-legend">
                      <span className="legend-group-label">Common Phrase Semantic Similarity:</span>
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.HIGH }} />
                        <span className="legend-label">≥0.85</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.MEDIUM }} />
                        <span className="legend-label">≥0.70</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: SEMANTIC_SIMILARITY_COLORS.LOW }} />
                        <span className="legend-label">≥0.60</span>
                      </div>
                    </div>
                  </div>

                  {/* Best Explanation Content - Bordered container */}
                  <div className="cause-view__explanation-section">
                    <div className="cause-view__explanation-content">
                      {bestExplanation ? (
                        <div className="cause-view__explainer-block">
                          <span
                            className={`cause-view__explainer-name cause-view__explainer-name--${bestExplanation.explainerId}`}
                          >
                            {getExplainerDisplayName(bestExplanation.explainerId)}
                          </span>
                          <span className="cause-view__explainer-text">
                            {bestExplanation.highlightedExplanation?.segments ? (
                              <HighlightedExplanation
                                segments={bestExplanation.highlightedExplanation.segments}
                                truncated={false}
                              />
                            ) : (
                              <span className="cause-view__no-explanation">
                                {bestExplanation.explanationText || 'No explanation available'}
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="cause-view__no-explanation">No explanations available</span>
                      )}
                    </div>
                  </div>

                  {/* Floating control panel at bottom */}
                  <div className="cause-view__floating-controls">
                    {/* Previous button */}
                    <button
                      className="nav__button"
                      onClick={handleNavigatePrevious}
                      disabled={currentFeatureIndex === 0}
                    >
                      ← Prev
                    </button>

                    {/* Selection buttons - all features must have a tag */}
                    <button
                      className={`selection__button selection__button--noisy-activation ${currentCauseCategory === 'noisy-activation' ? 'selected' : ''}`}
                      onClick={() => handleTagClick('noisy-activation')}
                      style={{ '--tag-color': noisyActivationColor } as React.CSSProperties}
                    >
                      Noisy Activation
                    </button>
                    <button
                      className={`selection__button selection__button--missed-N-gram ${currentCauseCategory === 'missed-N-gram' ? 'selected' : ''}`}
                      onClick={() => handleTagClick('missed-N-gram')}
                      style={{ '--tag-color': missedNgramColor } as React.CSSProperties}
                    >
                      Missed N-gram
                    </button>
                    <button
                      className={`selection__button selection__button--missed-context ${currentCauseCategory === 'missed-context' ? 'selected' : ''}`}
                      onClick={() => handleTagClick('missed-context')}
                      style={{ '--tag-color': missedContextColor } as React.CSSProperties}
                    >
                      Missed Context
                    </button>
                    <button
                      className={`selection__button selection__button--well-explained ${currentCauseCategory === 'well-explained' ? 'selected' : ''}`}
                      onClick={() => handleTagClick('well-explained')}
                      style={{ '--tag-color': wellExplainedColor } as React.CSSProperties}
                    >
                      Well-Explained
                    </button>

                    {/* Next button */}
                    <button
                      className="nav__button"
                      onClick={handleNavigateNext}
                      disabled={currentFeatureIndex >= featureListWithMetadata.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                </>
              ) : (
                <div className="cause-view__placeholder">
                  <span className="cause-view__placeholder-text">
                    Select a feature from the list to view details
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: UMAP + Modality Indicator + Selected features list */}
          <div className="cause-view__row-bottom">
            <UMAPScatter
              featureIds={selectedFeatureIds ? Array.from(selectedFeatureIds) : []}
              width={500}
              className="cause-view__umap"
            />
            <ModalityIndicator multimodality={causeMultiModality} />
            <ScrollableItemList
              variant="causeBrushed"
              badges={[{ label: 'Selected', count: brushedFeatureList.length }]}
              items={brushedFeatureList}
              renderItem={renderBottomRowFeatureItem}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseView)
