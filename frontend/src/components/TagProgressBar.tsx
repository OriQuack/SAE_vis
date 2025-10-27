// ============================================================================
// TAG PROGRESS BAR COMPONENT
// Vertical bar showing percentage of features that have been tagged
// ============================================================================

import React, { useMemo } from 'react'
import { useVisualizationStore } from '../store/index'
import '../styles/TagProgressBar.css'

const TagProgressBar: React.FC = () => {
  // Get tags and table data from store
  const tags = useVisualizationStore(state => state.tags)
  const tableData = useVisualizationStore(state => state.tableData)

  // Calculate tagged feature count and percentage
  const { taggedCount, totalFeatures, percentage } = useMemo(() => {
    // Get total features from table data
    const total = tableData?.features?.length || 0

    if (total === 0) {
      return { taggedCount: 0, totalFeatures: 0, percentage: 0 }
    }

    // Calculate union of all tagged features across all tags
    const taggedFeatureIds = new Set<number>()
    tags.forEach(tag => {
      tag.featureIds.forEach(id => taggedFeatureIds.add(id))
    })

    const tagged = taggedFeatureIds.size
    const pct = (tagged / total) * 100

    return {
      taggedCount: tagged,
      totalFeatures: total,
      percentage: pct
    }
  }, [tags, tableData])

  // Determine fill color based on percentage
  const getFillColor = () => {
    if (percentage === 0) return 'transparent' // Transparent for 0%
    if (percentage < 30) return '#fbbf24' // Amber for < 30%
    if (percentage < 70) return '#3b82f6' // Blue for 30-70%
    return '#10b981' // Green for >= 70%
  }

  return (
    <div className="tag-progress-bar-wrapper">
      {/* Percentage label at top */}
      <div className="tag-progress-bar-label">
        {percentage.toFixed(0)}%
      </div>

      {/* Full height bar with gradient fill from bottom */}
      <div
        className="tag-progress-bar-fill"
        style={{
          background: `linear-gradient(to top, ${getFillColor()} ${percentage}%, transparent ${percentage}%)`
        }}
        title={`${taggedCount} / ${totalFeatures} features tagged (${percentage.toFixed(0)}%)`}
      />
    </div>
  )
}

export default TagProgressBar
