// ============================================================================
// TAG MANAGEMENT PANEL COMPONENT
// Main orchestrator for tag assignment workflow with pre-defined templates
// ============================================================================

import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import type { MetricSignature, FeatureTableRow } from '../types'
import { inferMetricSignature } from '../lib/tag-utils'
import { useResizeObserver } from '../lib/utils'
import TagList from './TagList'
import TagCandidateMethod from './TagCandidateMethod'
import TagValidation from './TagValidation'
import '../styles/TagManagementPanel.css'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TagManagementPanel: React.FC = () => {
  // Store state
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const tableData = useVisualizationStore(state => state.tableData)
  const stdMultiplier = useVisualizationStore(state => state.stdMultiplier)
  const currentSignature = useVisualizationStore(state => state.currentSignature)
  const _isRestoringTag = useVisualizationStore(state => state._isRestoringTag)

  // Store actions
  const setCurrentSignature = useVisualizationStore(state => state.setCurrentSignature)

  // Get selected features from table data
  const selectedFeatures = useMemo(() => {
    if (!tableData || !tableData.features) return []
    return tableData.features.filter((f: FeatureTableRow) =>
      selectedFeatureIds.has(f.feature_id)
    )
  }, [tableData, selectedFeatureIds])

  // Infer signature from selected features
  const inferredSignature = useMemo(() => {
    if (selectedFeatures.length === 0) {
      return {
        decoder_similarity: { min: 0.3, max: 1.0 },
        embedding: { min: 0.3, max: 1.0 },
        fuzz: { min: 0.3, max: 1.0 },
        detection: { min: 0.3, max: 1.0 },
        semantic_similarity: { min: 0.3, max: 1.0 },
        quality_score: { min: 0.3, max: 1.0 }
      }
    }
    return inferMetricSignature(selectedFeatures, stdMultiplier)
  }, [selectedFeatures, stdMultiplier])

  // Local state for manually adjusted signature
  const [manualSignature, setManualSignature] = React.useState<MetricSignature>(inferredSignature)

  // Update manual signature when inferred changes
  React.useEffect(() => {
    setManualSignature(inferredSignature)
  }, [inferredSignature])

  // Sync local manual signature with store's currentSignature during tag restoration
  React.useEffect(() => {
    if (_isRestoringTag && currentSignature) {
      setManualSignature(currentSignature)
      console.log('[TagManagementPanel] Synced manual signature from store during restoration')
    }
  }, [_isRestoringTag, currentSignature])

  // Resize observer for responsive layout
  const containerElementRef = React.useRef<HTMLDivElement | null>(null)
  const { ref: containerRef, size: containerSize } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 1920,
    defaultHeight: 540,
    debounceMs: 16,
    debugId: 'tag-panel'
  })

  // Combined ref callback
  const setContainerRef = React.useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node
    containerRef(node)
  }, [containerRef])

  // Calculate column dimensions from container size
  const columnDimensions = useMemo(() => {
    const columnWidth = (containerSize.width) / 4

    const panelVerticalPadding = 2 * 8
    const columnHeight = containerSize.height - panelVerticalPadding

    const columnBorder = 2
    const titleHeight = 24
    const radarWidth = columnWidth
    const radarHeight = columnHeight - columnBorder - titleHeight

    return {
      columnWidth,
      columnHeight,
      radarWidth,
      radarHeight
    }
  }, [containerSize.width, containerSize.height])

  // Handle signature manual adjustment
  const handleSignatureChange = (signature: MetricSignature) => {
    setManualSignature(signature)
    // Update store signature - this will trigger refreshCandidates automatically
    setCurrentSignature(signature)
  }

  // Handle reset to auto-inferred signature
  const handleResetSignature = React.useCallback(() => {
    setManualSignature(inferredSignature)
    // Clear manual signature in store to use auto-inferred
    setCurrentSignature(null)
  }, [inferredSignature, setCurrentSignature])

  // Reset to auto-inferred signature when selection changes
  React.useEffect(() => {
    // Skip clearing signature if we're restoring from a tag
    if (_isRestoringTag) {
      return
    }
    // Clear manual signature when selection changes to revert to auto-inferred
    setCurrentSignature(null)
  }, [selectedFeatureIds, setCurrentSignature, _isRestoringTag])

  return (
    <div className="tag-management-panel" ref={setContainerRef}>
      <div className="tag-panel__grid">
        {/* Column 1: Template Tags */}
        <TagList />

        {/* Column 2: Candidate Discovery Methods */}
        <TagCandidateMethod
          selectedFeatures={selectedFeatures}
          inferredSignature={inferredSignature}
          manualSignature={manualSignature}
          onSignatureChange={handleSignatureChange}
          onResetSignature={handleResetSignature}
          columnDimensions={columnDimensions}
        />

        {/* Column 3: Feature Lists Validation */}
        <TagValidation />
      </div>
    </div>
  )
}

export default TagManagementPanel
