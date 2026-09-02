import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { getTagColor, getTagDisplayLabel } from '../lib/tag-system'
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE,
  TAG_CATEGORIES
} from '../lib/constants'
import { buildExportData } from '../lib/export-utils'
import '../styles/OverviewSummary.css'

interface OverviewSummaryProps {
  className?: string
}

/**
 * OverviewSummary - Summary view showing manual/auto/thresholded breakdown per tag across all stages
 */
const OverviewSummary: React.FC<OverviewSummaryProps> = ({ className = '' }) => {
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const stage1FinalCommit = useVisualizationStore(state => state.stage1FinalCommit)
  const stage2FinalCommit = useVisualizationStore(state => state.stage2FinalCommit)
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates)
  const pairSelectionSources = useVisualizationStore(state => state.pairSelectionSources)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates)
  const causeSelectionSources = useVisualizationStore(state => state.causeSelectionSources)

  // Build export data once and derive all counts from it
  const exportData = useMemo(() => buildExportData({
    sankeyNodes: leftPanel?.sankeyStructure?.nodes,
    stage1FinalCommit,
    stage2FinalCommit,
    pairSelectionStates,
    pairSelectionSources,
    featureSelectionStates,
    featureSelectionSources,
    causeSelectionStates,
    causeSelectionSources
  }), [
    leftPanel, stage1FinalCommit, stage2FinalCommit,
    pairSelectionStates, pairSelectionSources,
    featureSelectionStates, featureSelectionSources,
    causeSelectionStates, causeSelectionSources
  ])

  const s1 = exportData.stage1_featureSplitting
  const s2 = exportData.stage2_quality
  const s3 = exportData.stage3_cause

  // Helper to render a tag row with colored badge
  const renderTagRow = (
    tagName: string,
    tagColor: string,
    counts: { manual: number; auto: number }
  ) => (
    <div key={tagName} className="overview-summary__tag">
      <span
        className="view-tag-badge"
        style={{ backgroundColor: tagColor }}
      >
        {tagName}
      </span>
      <div className="overview-summary__tag-counts">
        <span className="overview-summary__count">
          Manual {counts.manual.toLocaleString()}
        </span>
        <span className="overview-summary__count">
          Auto {counts.auto.toLocaleString()}
        </span>
      </div>
    </div>
  )

  return (
    <div className={`overview-summary ${className}`}>
      <div className="overview-summary__content">
        {/* Stage 1 */}
        <div className="overview-summary__stage">
          <div className="subheader">1. {TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].label}</div>
          <div className="overview-summary__tags">
            {renderTagRow(
              'Incoherent Splitting',
              getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Incoherent Splitting') || '#9ca3af',
              { manual: s1.incoherentSplitting.manual.length, auto: s1.incoherentSplitting.auto.length }
            )}
            {renderTagRow(
              getTagDisplayLabel('Monosemantic'),
              getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || '#9ca3af',
              { manual: s1.monosemantic.manual.length, auto: s1.monosemantic.auto.length }
            )}
          </div>
        </div>

        {/* Stage 2 */}
        <div className="overview-summary__stage">
          <div className="subheader">2. {TAG_CATEGORIES[TAG_CATEGORY_QUALITY].label}</div>
          <div className="overview-summary__tags">
            {renderTagRow(
              'Well-Explained',
              getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#9ca3af',
              { manual: s2.wellExplained.manual.length, auto: s2.wellExplained.auto.length }
            )}
            {renderTagRow(
              'Need Revision',
              getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af',
              { manual: s2.needRevision.manual.length, auto: s2.needRevision.auto.length }
            )}
          </div>
        </div>

        {/* Stage 3 */}
        <div className="overview-summary__stage">
          <div className="subheader">3. {TAG_CATEGORIES[TAG_CATEGORY_CAUSE].label}</div>
          <div className="overview-summary__tags">
            {renderTagRow(
              'Well-Explained',
              getTagColor(TAG_CATEGORY_CAUSE, 'Well-Explained') || '#9ca3af',
              { manual: s3.wellExplained.manual.length, auto: s3.wellExplained.auto.length }
            )}
            {renderTagRow(
              'Missed Syntax',
              getTagColor(TAG_CATEGORY_CAUSE, 'Missed Syntax') || '#9ca3af',
              { manual: s3.missedSyntax.manual.length, auto: s3.missedSyntax.auto.length }
            )}
            {renderTagRow(
              'Missed Context',
              getTagColor(TAG_CATEGORY_CAUSE, 'Missed Context') || '#9ca3af',
              { manual: s3.missedContext.manual.length, auto: s3.missedContext.auto.length }
            )}
            {renderTagRow(
              'Noisy Activation',
              getTagColor(TAG_CATEGORY_CAUSE, 'Noisy Activation') || '#9ca3af',
              { manual: s3.noisyActivation.manual.length, auto: s3.noisyActivation.auto.length }
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(OverviewSummary)
