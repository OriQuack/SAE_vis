// ============================================================================
// TAG VALIDATION COMPONENT
// Feature lists for validation: Selected, Candidates, Rejected
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import { groupFeaturesByScore, computeFeatureScore, inferMetricSignature, inferMetricWeights } from '../lib/tag-utils'
import '../styles/TagValidation.css'

// ============================================================================
// SHARED FEATURE GROUP COMPONENT
// Collapsible group with score range and batch actions
// ============================================================================

interface FeatureGroupProps<T> {
  rangeLabel: string                    // e.g., "1.00 - 0.95"
  features: T[]                         // Features in this group
  count: number                         // Number of features
  isExpanded: boolean                   // Expansion state
  onToggle: () => void                  // Toggle expansion
  actionButtons?: React.ReactNode       // Batch action buttons (optional)
  renderFeature: (feature: T) => React.ReactNode  // Individual feature renderer
  className?: string                    // Additional CSS class
  stackedHeader?: boolean               // Use stacked layout for header (2 lines)
}

function FeatureGroup<T>({
  rangeLabel,
  features,
  count,
  isExpanded,
  onToggle,
  actionButtons,
  renderFeature,
  className = '',
  stackedHeader = false
}: FeatureGroupProps<T>) {
  return (
    <div className={`feature-group ${className}`}>
      <div
        className={`feature-group__header ${stackedHeader ? 'feature-group__header--stacked' : ''}`}
        onClick={onToggle}
      >
        <div className="feature-group__info">
          <span className={`feature-group__chevron ${isExpanded ? 'feature-group__chevron--expanded' : ''}`}>
            ▶
          </span>
          <span className="feature-group__range">{rangeLabel}</span>
          <span className="feature-group__count">({count})</span>
        </div>
        {actionButtons && (
          <div
            className="feature-group__actions"
            onClick={(e) => e.stopPropagation()} // Prevent toggle when clicking buttons
          >
            {actionButtons}
          </div>
        )}
      </div>
      {isExpanded && (
        <div className="feature-group__body">
          {features.map((feature) => renderFeature(feature))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SELECTED FEATURES LIST SUB-COMPONENT
// ============================================================================

interface SelectedFeaturesListProps {
  featureIds: Set<number>
  className?: string
}

const SelectedFeaturesList: React.FC<SelectedFeaturesListProps> = ({
  featureIds,
  className = ''
}) => {
  const removeFromSelection = useVisualizationStore(state => state.removeFromSelection)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)
  const toggleGroupExpansion = useVisualizationStore(state => state.toggleGroupExpansion)
  const isGroupExpanded = useVisualizationStore(state => state.isGroupExpanded)
  const groupExpansionState = useVisualizationStore(state => state.groupExpansionState)
  const tableData = useVisualizationStore(state => state.tableData)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const currentSignature = useVisualizationStore(state => state.currentSignature)
  const currentWeights = useVisualizationStore(state => state.currentWeights)
  const stdMultiplier = useVisualizationStore(state => state.stdMultiplier)

  // Compute scores and group selected features
  const groupedFeatures = useMemo(() => {
    if (!tableData || featureIds.size === 0) return []

    // Get selected features from table data
    const selectedFeatures = tableData.features.filter(f => featureIds.has(f.feature_id))
    if (selectedFeatures.length === 0) return []

    // Determine signature and weights
    const signature = currentSignature || inferMetricSignature(selectedFeatures, stdMultiplier)
    const weights = currentWeights ||
      (selectedFeatures.length < 3
        ? { feature_splitting: 1.0, embedding: 1.0, fuzz: 1.0, detection: 1.0, semantic_similarity: 1.0, quality_score: 1.0 }
        : inferMetricWeights(signature))

    // Compute scores for each feature
    const featuresWithScores = Array.from(featureIds).map(featureId => ({
      featureId,
      score: computeFeatureScore(featureId, tableData.features, signature, weights)
    }))

    // Group by score
    return groupFeaturesByScore(featuresWithScores)
  }, [featureIds, tableData, currentSignature, currentWeights, stdMultiplier])

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    // Throttled scroll handler using requestAnimationFrame
    const handleScroll = () => {
      if (rafIdRef.current !== null) return // Already scheduled

      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    // Initial measurement (immediate)
    updateScrollState()

    // Scroll events (throttled with RAF)
    list.addEventListener('scroll', handleScroll)

    // Resize events (immediate, since they're infrequent)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [groupedFeatures, groupExpansionState])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  // Batch remove handler
  const handleBatchRemove = (features: Array<{ featureId: number; score: number }>) => {
    features.forEach(f => removeFromSelection(f.featureId))
  }

  if (featureIds.size === 0) {
    return (
      <div className={`selected-features-list ${className}`}>
        <p className="selected-features-list__empty">
          No features selected. Select features from the table below.
        </p>
      </div>
    )
  }

  return (
    <div className={`selected-features-list ${className}`}>
      <div className="selected-features-list__list" ref={listRef}>
        {groupedFeatures.map(group => (
          <FeatureGroup
            key={group.rangeLabel}
            rangeLabel={group.rangeLabel}
            features={group.features}
            count={group.count}
            isExpanded={isGroupExpanded('selected', group.rangeLabel)}
            onToggle={() => toggleGroupExpansion('selected', group.rangeLabel)}
            stackedHeader={true}
            actionButtons={
              <button
                className="feature-group__btn feature-group__btn--remove"
                onClick={() => handleBatchRemove(group.features)}
                title="Remove all from selection"
              >
                ✗
              </button>
            }
            renderFeature={(feature) => (
              <div
                key={feature.featureId}
                className="selected-item"
                onClick={() => setHighlightedFeature(feature.featureId)}
                style={{ cursor: 'pointer' }}
                title="Click to jump to feature in table"
              >
                <span className="selected-item__id">F{feature.featureId}</span>
                <span className="selected-item__score">{feature.score.toFixed(2)}</span>
                <button
                  className="selected-item__btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFromSelection(feature.featureId)
                  }}
                  title="Remove from selection"
                >
                  ✗
                </button>
              </div>
            )}
          />
        ))}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CANDIDATES LIST SUB-COMPONENT
// ============================================================================

interface CandidatesListProps {
  className?: string
}

const CandidatesList: React.FC<CandidatesListProps> = ({ className = '' }) => {
  const candidateFeatures = useVisualizationStore(state => state.candidateFeatures)
  const candidateStates = useVisualizationStore(state => state.candidateStates)
  const acceptCandidate = useVisualizationStore(state => state.acceptCandidate)
  const rejectCandidate = useVisualizationStore(state => state.rejectCandidate)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)
  const toggleGroupExpansion = useVisualizationStore(state => state.toggleGroupExpansion)
  const isGroupExpanded = useVisualizationStore(state => state.isGroupExpanded)
  const groupExpansionState = useVisualizationStore(state => state.groupExpansionState)

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  // Group candidates by score
  const groupedCandidates = useMemo(() => {
    return groupFeaturesByScore(candidateFeatures)
  }, [candidateFeatures])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    const handleScroll = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    updateScrollState()
    list.addEventListener('scroll', handleScroll)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [groupedCandidates, groupExpansionState])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  // Batch accept/reject handlers
  const handleBatchAccept = (features: typeof candidateFeatures) => {
    features.forEach(candidate => acceptCandidate(candidate.featureId))
  }

  const handleBatchReject = (features: typeof candidateFeatures) => {
    features.forEach(candidate => rejectCandidate(candidate.featureId))
  }

  if (candidateFeatures.length === 0) {
    return (
      <div className={`candidate-list ${className}`}>
        <p className="candidate-list__empty">
          No candidates found. Select features to find similar patterns.
        </p>
      </div>
    )
  }

  return (
    <div className={`candidate-list-wrapper ${className}`}>
      <div className="candidate-list" ref={listRef}>
        {groupedCandidates.map(group => (
          <FeatureGroup
            key={group.rangeLabel}
            rangeLabel={group.rangeLabel}
            features={group.features}
            count={group.count}
            isExpanded={isGroupExpanded('candidates', group.rangeLabel)}
            onToggle={() => toggleGroupExpansion('candidates', group.rangeLabel)}
            actionButtons={
              <>
                <button
                  className="feature-group__btn feature-group__btn--accept"
                  onClick={() => handleBatchAccept(group.features)}
                  title="Accept all in group"
                >
                  ✓
                </button>
                <button
                  className="feature-group__btn feature-group__btn--reject"
                  onClick={() => handleBatchReject(group.features)}
                  title="Reject all in group"
                >
                  ✗
                </button>
              </>
            }
            renderFeature={(candidate) => {
              const state = candidateStates.get(candidate.featureId) || 'pending'
              return (
                <div
                  key={candidate.featureId}
                  className={`candidate-item candidate-item--${state}`}
                  onClick={() => setHighlightedFeature(candidate.featureId)}
                >
                  <span className="candidate-item__id">F{candidate.featureId}</span>
                  <span
                    className="candidate-item__score"
                    style={{
                      color: candidate.score > 0.7 ? '#10b981' : candidate.score > 0.4 ? '#f59e0b' : '#ef4444'
                    }}
                  >
                    {candidate.score.toFixed(2)}
                  </span>
                  <div className="candidate-item__actions">
                    <button
                      className="candidate-item__btn candidate-item__btn--accept"
                      onClick={(e) => {
                        e.stopPropagation()
                        acceptCandidate(candidate.featureId)
                      }}
                      title="Accept candidate"
                    >
                      ✓
                    </button>
                    <button
                      className="candidate-item__btn candidate-item__btn--reject"
                      onClick={(e) => {
                        e.stopPropagation()
                        rejectCandidate(candidate.featureId)
                      }}
                      title="Reject candidate"
                    >
                      ✗
                    </button>
                  </div>
                </div>
              )
            }}
          />
        ))}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// REJECTED LIST SUB-COMPONENT
// ============================================================================

interface RejectedListProps {
  className?: string
}

const RejectedList: React.FC<RejectedListProps> = ({ className = '' }) => {
  const activeTagId = useVisualizationStore(state => state.activeTagId)
  const tags = useVisualizationStore(state => state.tags)
  const undoRejection = useVisualizationStore(state => state.undoRejection)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)
  const toggleGroupExpansion = useVisualizationStore(state => state.toggleGroupExpansion)
  const isGroupExpanded = useVisualizationStore(state => state.isGroupExpanded)
  const groupExpansionState = useVisualizationStore(state => state.groupExpansionState)
  const tableData = useVisualizationStore(state => state.tableData)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const currentSignature = useVisualizationStore(state => state.currentSignature)
  const currentWeights = useVisualizationStore(state => state.currentWeights)
  const stdMultiplier = useVisualizationStore(state => state.stdMultiplier)

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  const activeTag = tags.find(t => t.id === activeTagId)
  const rejectedIds = activeTag?.rejectedFeatureIds || new Set<number>()

  // Compute scores and group rejected features
  const groupedFeatures = useMemo(() => {
    if (!tableData || rejectedIds.size === 0 || selectedFeatureIds.size === 0) return []

    // Get selected features for signature/weights calculation
    const selectedFeatures = tableData.features.filter(f => selectedFeatureIds.has(f.feature_id))
    if (selectedFeatures.length === 0) return []

    // Determine signature and weights
    const signature = currentSignature || inferMetricSignature(selectedFeatures, stdMultiplier)
    const weights = currentWeights ||
      (selectedFeatures.length < 3
        ? { feature_splitting: 1.0, embedding: 1.0, fuzz: 1.0, detection: 1.0, semantic_similarity: 1.0, quality_score: 1.0 }
        : inferMetricWeights(signature))

    // Compute scores for each rejected feature
    const featuresWithScores = Array.from(rejectedIds).map(featureId => ({
      featureId,
      score: computeFeatureScore(featureId, tableData.features, signature, weights)
    }))

    // Group by score
    return groupFeaturesByScore(featuresWithScores)
  }, [rejectedIds, tableData, selectedFeatureIds, currentSignature, currentWeights, stdMultiplier])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const updateScrollState = () => {
      setScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    const handleScroll = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        rafIdRef.current = null
      })
    }

    updateScrollState()
    list.addEventListener('scroll', handleScroll)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [groupedFeatures, groupExpansionState])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  // Batch restore handler
  const handleBatchRestore = (features: Array<{ featureId: number; score: number }>) => {
    if (!activeTagId) return
    features.forEach(f => undoRejection(activeTagId, f.featureId))
  }

  if (rejectedIds.size === 0) {
    return (
      <div className={`rejected-list ${className}`}>
        <p className="rejected-list__empty">
          No rejected features yet.
        </p>
      </div>
    )
  }

  return (
    <div className={`rejected-list-wrapper ${className}`}>
      <div className="rejected-list" ref={listRef}>
        {groupedFeatures.map(group => (
          <FeatureGroup
            key={group.rangeLabel}
            rangeLabel={group.rangeLabel}
            features={group.features}
            count={group.count}
            isExpanded={isGroupExpanded('rejected', group.rangeLabel)}
            onToggle={() => toggleGroupExpansion('rejected', group.rangeLabel)}
            stackedHeader={true}
            actionButtons={
              <button
                className="feature-group__btn feature-group__btn--restore"
                onClick={() => handleBatchRestore(group.features)}
                title="Restore all to candidates"
              >
                ←
              </button>
            }
            renderFeature={(feature) => (
              <div
                key={feature.featureId}
                className="rejected-item"
                onClick={() => setHighlightedFeature(feature.featureId)}
                style={{ cursor: 'pointer' }}
                title="Click to jump to feature in table"
              >
                <span className="rejected-item__id">F{feature.featureId}</span>
                <span className="rejected-item__score">{feature.score.toFixed(2)}</span>
                <button
                  className="rejected-item__btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    activeTagId && undoRejection(activeTagId, feature.featureId)
                  }}
                  title="Move to candidates"
                >
                  ←
                </button>
              </div>
            )}
          />
        ))}
      </div>
      {isScrollable && (
        <div className="scroll-indicator">
          <div
            className="scroll-indicator__thumb"
            style={{
              height: `${(clientHeight / scrollHeight) * 100}%`,
              top: `${scrollPercent * (100 - (clientHeight / scrollHeight) * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN TAG VALIDATION COMPONENT
// ============================================================================

interface TagValidationProps {
  className?: string
}

const TagValidation: React.FC<TagValidationProps> = ({ className = '' }) => {
  // Store state
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const activeTagId = useVisualizationStore(state => state.activeTagId)
  const candidateFeatures = useVisualizationStore(state => state.candidateFeatures)
  const tags = useVisualizationStore(state => state.tags)

  // Get active tag
  const activeTag = tags.find(t => t.id === activeTagId)

  // Get counts for titles
  const rejectedCount = activeTag?.rejectedFeatureIds?.size || 0

  return (
    <div className={`tag-panel__column tag-panel__features ${className}`}>
      <h4 className="tag-panel__column-title">Validation</h4>
      <div className={`feature-lists ${!activeTagId ? 'feature-lists--disabled' : ''}`}>
        <div className="feature-list feature-list--selected">
          <h5 className="feature-list__title">Selected ({selectedFeatureIds.size})</h5>
          <SelectedFeaturesList featureIds={selectedFeatureIds} />
        </div>
        <div className="feature-list feature-list--candidates">
          <h5 className="feature-list__title">
            Top Candidates ({candidateFeatures.length})
            <span className="feature-list__subtitle">up to 100 shown</span>
          </h5>
          <CandidatesList />
        </div>
        <div className="feature-list feature-list--rejected">
          <h5 className="feature-list__title">Rejected ({rejectedCount})</h5>
          <RejectedList />
        </div>
      </div>
    </div>
  )
}

export default TagValidation
