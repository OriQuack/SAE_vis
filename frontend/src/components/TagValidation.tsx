// ============================================================================
// TAG VALIDATION COMPONENT
// Feature lists for validation: Selected, Candidates, Rejected
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import '../styles/TagValidation.css'

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

  const sortedIds = useMemo(() => Array.from(featureIds).sort((a, b) => a - b), [featureIds])
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
  }, [sortedIds])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  if (sortedIds.length === 0) {
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
        {sortedIds.map(id => (
          <div
            key={id}
            className="selected-item"
            onClick={() => setHighlightedFeature(id)}
            style={{ cursor: 'pointer' }}
            title="Click to jump to feature in table"
          >
            <span className="selected-item__id">F{id}</span>
            <button
              className="selected-item__btn"
              onClick={(e) => {
                e.stopPropagation()
                removeFromSelection(id)
              }}
              title="Remove from selection"
            >
              ✗
            </button>
          </div>
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
  const markCandidateUnsure = useVisualizationStore(state => state.markCandidateUnsure)
  const setHighlightedFeature = useVisualizationStore(state => state.setHighlightedFeature)

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
  }, [candidateFeatures])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

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
        {candidateFeatures.map(candidate => {
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
              <span className="candidate-item__metrics">
                E:{candidate.metricValues.embedding.toFixed(2)} F:{candidate.metricValues.fuzz.toFixed(2)} D:{candidate.metricValues.detection.toFixed(2)}
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
                  className="candidate-item__btn candidate-item__btn--unsure"
                  onClick={(e) => {
                    e.stopPropagation()
                    markCandidateUnsure(candidate.featureId)
                  }}
                  title="Mark as unsure"
                >
                  ?
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
        })}
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

  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  const activeTag = tags.find(t => t.id === activeTagId)
  const rejectedIds = useMemo(() => Array.from(activeTag?.rejectedFeatureIds || []).sort((a, b) => a - b), [activeTag?.rejectedFeatureIds])

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
  }, [rejectedIds])

  const { scrollTop, scrollHeight, clientHeight } = scrollState
  const maxScroll = scrollHeight - clientHeight
  const scrollPercent = maxScroll > 0 ? scrollTop / maxScroll : 0
  const isScrollable = scrollHeight > clientHeight

  if (rejectedIds.length === 0) {
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
        {rejectedIds.map(id => (
          <div
            key={id}
            className="rejected-item"
            onClick={() => setHighlightedFeature(id)}
            style={{ cursor: 'pointer' }}
            title="Click to jump to feature in table"
          >
            <span className="rejected-item__id">F{id}</span>
            <button
              className="rejected-item__btn"
              onClick={(e) => {
                e.stopPropagation()
                activeTagId && undoRejection(activeTagId, id)
              }}
              title="Move to candidates"
            >
              ←
            </button>
          </div>
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
            <span className="feature-list__subtitle">up to 20 shown</span>
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
