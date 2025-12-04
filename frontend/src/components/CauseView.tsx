import React, { useMemo, useEffect } from 'react'
import { useVisualizationStore } from '../store/index'
import type { SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import UMAPScatter from './UMAPScatter'
import { TAG_CATEGORY_QUALITY } from '../lib/constants'
import { getTagColor } from '../lib/tag-system'
import '../styles/CauseView.css'

// ============================================================================
// CAUSE VIEW - Root cause analysis workflow (Stage 3)
// ============================================================================
// Layout: [SelectionPanel bar] | [Content: placeholder]

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

  // ============================================================================
  // STAGE 3 REVISITING - Restore state when returning from Stage 4+
  // ============================================================================
  useEffect(() => {
    if (isRevisitingStage3 && stage3FinalCommit) {
      console.log('[CauseView] Revisiting Stage 3, restoring from saved commit')

      // Restore cause selection states to store
      restoreCauseSelectionStates(stage3FinalCommit.causeSelectionStates, stage3FinalCommit.causeSelectionSources)
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

  // Initialize stage3FinalCommit with initial state when first entering Stage 3
  // This ensures we can restore even if user does nothing and moves to Stage 4
  useEffect(() => {
    // Only initialize when: not revisiting, no saved commit yet, and we have features
    if (!isRevisitingStage3 && !stage3FinalCommit && selectedFeatureIds && selectedFeatureIds.size > 0) {
      console.log('[CauseView] Initializing Stage 3 commit with initial state:', selectedFeatureIds.size, 'features')
      setStage3FinalCommit({
        causeSelectionStates: new Map(causeSelectionStates),
        causeSelectionSources: new Map(causeSelectionSources),
        featureIds: new Set(selectedFeatureIds),
        counts: {
          noisyActivation: 0,
          missedContext: 0,
          missedNgram: 0,
          unsure: selectedFeatureIds.size,
          total: selectedFeatureIds.size
        }
      })
    }
  }, [isRevisitingStage3, stage3FinalCommit, selectedFeatureIds, setStage3FinalCommit, causeSelectionStates, causeSelectionSources])

  // Get tag color for header badge (Need Revision - parent tag from Stage 2)
  const needRevisionColor = getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af'

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
        <SelectionPanel
          mode="feature"
          tagLabel="Cause"
          onCategoryRefsReady={onCategoryRefsReady}
          filteredFeatureIds={selectedFeatureIds || undefined}
        />

        {/* Right column: UMAP Scatter content */}
        <div className="cause-view__content">
          <UMAPScatter
            featureIds={selectedFeatureIds ? Array.from(selectedFeatureIds) : []}
            className="cause-view__umap"
          />
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseView)
