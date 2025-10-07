import React, { useMemo, useState } from 'react'
import { useVisualizationStore } from '../store'
import '../styles/ProgressBar.css'

const TOTAL_FEATURES = 824

interface ProgressBarProps {
  className?: string
}

interface FeatureSegment {
  featureId: number
  groupMemberships: Array<{
    groupId: string
    groupName: string
    selections: Array<{
      metricType: string
      color: string
    }>
  }>
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ className = '' }) => {
  const thresholdGroups = useVisualizationStore(state => state.thresholdGroups)
  const [hoveredFeatureId, setHoveredFeatureId] = useState<number | null>(null)

  // Calculate feature segments with group memberships
  const featureSegments = useMemo(() => {
    const segments: FeatureSegment[] = []

    // Initialize all features
    for (let i = 0; i < TOTAL_FEATURES; i++) {
      segments.push({
        featureId: i,
        groupMemberships: []
      })
    }

    // Process each threshold group
    thresholdGroups.forEach(group => {
      if (!group.visible) return // Skip hidden groups

      // Track which features belong to this group
      const groupFeatureSet = new Set<number>()

      // Process each selection in the group
      group.selections.forEach(selection => {
        // Add all feature IDs from this selection to the set
        selection.featureIds?.forEach(featureId => {
          if (featureId < TOTAL_FEATURES) {
            groupFeatureSet.add(featureId)

            // Find or create group membership for this feature
            let segment = segments[featureId]
            let membership = segment.groupMemberships.find(m => m.groupId === group.id)

            if (!membership) {
              membership = {
                groupId: group.id,
                groupName: group.name,
                selections: []
              }
              segment.groupMemberships.push(membership)
            }

            // Add this selection's metric to the membership
            membership.selections.push({
              metricType: selection.metricType,
              color: selection.color
            })
          }
        })
      })
    })

    return segments
  }, [thresholdGroups])

  // Calculate segment colors
  const getSegmentStyle = (segment: FeatureSegment): React.CSSProperties => {
    const { groupMemberships } = segment

    if (groupMemberships.length === 0) {
      // No group membership - use default gray
      return { backgroundColor: '#e5e7eb' }
    }

    if (groupMemberships.length === 1) {
      // Single group membership - use the first selection's color
      const firstColor = groupMemberships[0].selections[0]?.color || '#e5e7eb'
      return { backgroundColor: firstColor }
    }

    // Multiple group memberships - create a gradient
    const colors = groupMemberships
      .flatMap(m => m.selections.map(s => s.color))
      .filter((c, i, arr) => arr.indexOf(c) === i) // Unique colors

    if (colors.length === 1) {
      return { backgroundColor: colors[0] }
    }

    // Create linear gradient for multiple colors
    const gradientStops = colors.map((color, index) => {
      const percent = (index * 100) / (colors.length - 1)
      return `${color} ${percent}%`
    }).join(', ')

    return {
      background: `linear-gradient(90deg, ${gradientStops})`
    }
  }

  // Generate tooltip text
  const getTooltipText = (segment: FeatureSegment): string => {
    if (segment.groupMemberships.length === 0) {
      return `Feature ${segment.featureId}: No threshold groups`
    }

    const lines = [`Feature ${segment.featureId}:`]
    segment.groupMemberships.forEach(membership => {
      const metrics = membership.selections.map(s => s.metricType).join(', ')
      lines.push(`  ${membership.groupName}: ${metrics}`)
    })

    return lines.join('\n')
  }

  return (
    <div className={`progress-bar ${className}`}>
      <div className="progress-bar__header">
        <span className="progress-bar__legend">
          {thresholdGroups.filter(g => g.visible).map(group => (
            <span key={group.id} className="progress-bar__legend-item">
              <span
                className="progress-bar__legend-color"
                style={{
                  backgroundColor: group.selections[0]?.color || '#e5e7eb'
                }}
              />
              <span className="progress-bar__legend-label">{group.name}</span>
            </span>
          ))}
        </span>
      </div>

      <div className="progress-bar__container">
        <div className="progress-bar__track">
          {featureSegments.map(segment => (
            <div
              key={segment.featureId}
              className={`progress-bar__segment ${
                segment.groupMemberships.length > 0 ? 'progress-bar__segment--active' : ''
              } ${hoveredFeatureId === segment.featureId ? 'progress-bar__segment--hovered' : ''}`}
              style={{
                ...getSegmentStyle(segment),
                width: `${100 / TOTAL_FEATURES}%`
              }}
              title={getTooltipText(segment)}
              onMouseEnter={() => setHoveredFeatureId(segment.featureId)}
              onMouseLeave={() => setHoveredFeatureId(null)}
            />
          ))}
        </div>

        {/* Feature ID labels at intervals */}
        <div className="progress-bar__labels">
          {[0, 100, 200, 300, 400, 500, 600, 700, 800].map(id => (
            <span
              key={id}
              className="progress-bar__label"
              style={{ left: `${(id / TOTAL_FEATURES) * 100}%` }}
            >
              {id}
            </span>
          ))}
          <span
            className="progress-bar__label"
            style={{ left: '100%' }}
          >
            {TOTAL_FEATURES - 1}
          </span>
        </div>
      </div>

      {/* Hover details */}
      {hoveredFeatureId !== null && (
        <div className="progress-bar__hover-details">
          {getTooltipText(featureSegments[hoveredFeatureId])}
        </div>
      )}
    </div>
  )
}

export default ProgressBar