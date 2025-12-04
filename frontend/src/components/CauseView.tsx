import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import type { SelectionCategory } from '../types'
import SelectionPanel from './SelectionPanel'
import { TAG_CATEGORY_CAUSE, TAG_CATEGORY_QUALITY } from '../lib/constants'
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
          mode="cause"
          tagLabel="Cause"
          onCategoryRefsReady={onCategoryRefsReady}
          filteredFeatureIds={selectedFeatureIds || undefined}
        />

        {/* Right column: Placeholder content */}
        <div className="cause-view__content">
          <div className="cause-view__placeholder">
            <span className="cause-view__placeholder-text">
              Cause analysis content coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(CauseView)
