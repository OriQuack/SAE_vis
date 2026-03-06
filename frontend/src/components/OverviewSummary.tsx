import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store'
import { getTagColor } from '../lib/tag-system'
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE,
  TAG_CATEGORIES
} from '../lib/constants'
import '../styles/OverviewSummary.css'

interface OverviewSummaryProps {
  className?: string
}

// Tag display names for Stage 3 causes (well-explained merges to Stage 2)
const CAUSE_TAG_CONFIG: Record<string, { display: string }> = {
  'missed-N-gram': { display: 'Missed Syntax' },
  'missed-context': { display: 'Missed Context' },
  'noisy-activation': { display: 'Noisy Activation' }
}

/**
 * OverviewSummary - Stage 4 summary view showing manual vs auto tagging breakdown per tag
 */
const OverviewSummary: React.FC<OverviewSummaryProps> = ({ className = '' }) => {
  const {
    pairSelectionStates,
    pairSelectionSources,
    featureSelectionStates,
    featureSelectionSources,
    causeSelectionStates,
    causeSelectionSources
  } = useVisualizationStore()

  // Stage 1: Count by tag (Fragmented / Monosemantic)
  // Manual = click source (direct user clicks), Auto = threshold or predicted
  const stage1Counts = useMemo(() => {
    const counts = {
      'Incoherent Splitting': { manual: 0, auto: 0 },
      Monosemantic: { manual: 0, auto: 0 }
    }
    pairSelectionStates.forEach((state, key) => {
      const tag = state === 'selected' ? 'Incoherent Splitting' : 'Monosemantic'
      const isManual = pairSelectionSources.get(key) === 'click'
      counts[tag][isManual ? 'manual' : 'auto']++
    })
    return counts
  }, [pairSelectionStates, pairSelectionSources])

  // Stage 2: Count by tag (Well-Explained / Need Revision)
  // Includes Stage 3 'well-explained' merged into Well-Explained
  // Manual = click source (direct user clicks), Auto = threshold or predicted
  const stage2Counts = useMemo(() => {
    const counts = {
      'Well-Explained': { manual: 0, auto: 0 },
      'Need Revision': { manual: 0, auto: 0 }
    }
    featureSelectionStates.forEach((state, id) => {
      const tag = state === 'selected' ? 'Well-Explained' : 'Need Revision'
      const isManual = featureSelectionSources.get(id) === 'click'
      counts[tag][isManual ? 'manual' : 'auto']++
    })
    // Merge Stage 3 'well-explained' into Stage 2 Well-Explained
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'well-explained') {
        const isManual = causeSelectionSources.get(id) === 'click'
        counts['Well-Explained'][isManual ? 'manual' : 'auto']++
      }
    })
    return counts
  }, [featureSelectionStates, featureSelectionSources, causeSelectionStates, causeSelectionSources])

  // Stage 3: Count by cause tag (well-explained excluded, merged to Stage 2)
  // Manual = click source (direct user clicks), Auto = threshold or predicted
  const stage3Counts = useMemo(() => {
    const counts: Record<string, { manual: number; auto: number }> = {
      'missed-N-gram': { manual: 0, auto: 0 },
      'missed-context': { manual: 0, auto: 0 },
      'noisy-activation': { manual: 0, auto: 0 }
    }
    causeSelectionStates.forEach((tag, id) => {
      if (tag !== 'well-explained' && counts[tag]) {
        const isManual = causeSelectionSources.get(id) === 'click'
        counts[tag][isManual ? 'manual' : 'auto']++
      }
    })
    return counts
  }, [causeSelectionStates, causeSelectionSources])

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
              stage1Counts['Incoherent Splitting']
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
          <div className="subheader">2. {TAG_CATEGORIES[TAG_CATEGORY_QUALITY].label}</div>
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
          <div className="subheader">3. {TAG_CATEGORIES[TAG_CATEGORY_CAUSE].label}</div>
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
