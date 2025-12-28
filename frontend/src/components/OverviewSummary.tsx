import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { getTagColor } from '../lib/tag-system'
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/constants'
import '../styles/OverviewSummary.css'

interface OverviewSummaryProps {
  className?: string
}

// Tag display names for Stage 3 causes (well-explained merges to Stage 2)
const CAUSE_TAG_CONFIG: Record<string, { display: string }> = {
  'noisy-activation': { display: 'Noisy Activation' },
  'missed-context': { display: 'Context Miss' },
  'missed-N-gram': { display: 'Pattern Miss' }
}

/**
 * OverviewSummary - Stage 4 summary view showing manual vs auto tagging breakdown per tag
 */
const OverviewSummary: React.FC<OverviewSummaryProps> = ({ className = '' }) => {
  const {
    manuallyTaggedPairs,
    manuallyTaggedFeatures,
    manuallyTaggedCauses,
    pairSelectionStates,
    featureSelectionStates,
    causeSelectionStates,
    causeSelectionSources,
    sankeyStructure
  } = useVisualizationStore()

  // Extract well-explained feature IDs from Stage 3 segment
  const wellExplainedFeatureIds = useMemo(() => {
    if (!sankeyStructure) return new Set<number>()
    const stage3Node = sankeyStructure.nodes.find((n) => n.id === 'stage3_segment')
    if (stage3Node?.type === 'segment' && stage3Node.segments?.[1]?.featureIds) {
      return stage3Node.segments[1].featureIds
    }
    return new Set<number>()
  }, [sankeyStructure])

  // Stage 1: Count by tag (Fragmented / Monosemantic)
  const stage1Counts = useMemo(() => {
    const counts = {
      Fragmented: { manual: 0, auto: 0 },
      Monosemantic: { manual: 0, auto: 0 }
    }
    pairSelectionStates.forEach((state, key) => {
      const tag = state === 'selected' ? 'Fragmented' : 'Monosemantic'
      const isManual = manuallyTaggedPairs.has(key)
      counts[tag][isManual ? 'manual' : 'auto']++
    })
    return counts
  }, [pairSelectionStates, manuallyTaggedPairs])

  // Stage 2: Count by tag (Well-Explained / Need Revision)
  // Includes Stage 3 'well-explained' merged into Well-Explained
  const stage2Counts = useMemo(() => {
    const counts = {
      'Well-Explained': { manual: 0, auto: 0 },
      'Need Revision': { manual: 0, auto: 0 }
    }
    featureSelectionStates.forEach((state, id) => {
      const tag = state === 'selected' ? 'Well-Explained' : 'Need Revision'
      const isManual = manuallyTaggedFeatures.has(id)
      counts[tag][isManual ? 'manual' : 'auto']++
    })
    // Merge Stage 3 'well-explained' into Stage 2 Well-Explained
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'well-explained') {
        const isManual = manuallyTaggedCauses.has(id)
        counts['Well-Explained'][isManual ? 'manual' : 'auto']++
      }
    })
    return counts
  }, [featureSelectionStates, manuallyTaggedFeatures, causeSelectionStates, manuallyTaggedCauses])

  // Stage 3: Count by cause tag (well-explained excluded, merged to Stage 2)
  const stage3Counts = useMemo(() => {
    const counts: Record<string, { manual: number; auto: number }> = {
      'noisy-activation': { manual: 0, auto: 0 },
      'missed-context': { manual: 0, auto: 0 },
      'missed-N-gram': { manual: 0, auto: 0 }
    }
    causeSelectionStates.forEach((tag, id) => {
      if (tag !== 'well-explained' && counts[tag]) {
        const isManual = manuallyTaggedCauses.has(id)
        counts[tag][isManual ? 'manual' : 'auto']++
      }
    })
    return counts
  }, [causeSelectionStates, manuallyTaggedCauses])

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
          <div className="subheader">1. Detect Feature Splitting</div>
          <div className="overview-summary__tags">
            {renderTagRow(
              'Fragmented',
              getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Fragmented') || '#9ca3af',
              stage1Counts.Fragmented
            )}
            {renderTagRow(
              'Monosemantic',
              getTagColor(TAG_CATEGORY_FEATURE_SPLITTING, 'Monosemantic') || '#9ca3af',
              stage1Counts.Monosemantic
            )}
          </div>
        </div>

        {/* Stage 2 */}
        <div className="overview-summary__stage">
          <div className="subheader">2. Check Quality</div>
          <div className="overview-summary__tags">
            {renderTagRow(
              'Well-Explained',
              getTagColor(TAG_CATEGORY_QUALITY, 'Well-Explained') || '#9ca3af',
              stage2Counts['Well-Explained']
            )}
            {renderTagRow(
              'Need Revision',
              getTagColor(TAG_CATEGORY_QUALITY, 'Need Revision') || '#9ca3af',
              stage2Counts['Need Revision']
            )}
          </div>
        </div>

        {/* Stage 3 */}
        <div className="overview-summary__stage">
          <div className="subheader">3. Investigate Cause</div>
          <div className="overview-summary__tags">
            {Object.entries(stage3Counts).map(([key, counts]) => {
              const displayName = CAUSE_TAG_CONFIG[key]?.display || key
              return renderTagRow(
                displayName,
                getTagColor(TAG_CATEGORY_CAUSE, displayName) || '#9ca3af',
                counts
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default React.memo(OverviewSummary)
