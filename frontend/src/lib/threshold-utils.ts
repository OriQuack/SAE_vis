/**
 * Feature Group Utilities
 *
 * Core algorithms for building Sankey diagrams from feature groups via Set intersection.
 * Replaces backend classification with frontend computation for instant threshold updates.
 */

import type {
  FeatureGroup,
} from '../types'

// ============================================================================
// BACKEND RESPONSE PROCESSING
// ============================================================================

/**
 * Convert backend FeatureGroupResponse to FeatureGroup[] with Sets.
 * Handles both standard metrics (feature_ids) and consistency metrics (feature_ids_by_source).
 *
 * @param response - Backend response
 * @returns Array of FeatureGroup with Sets
 */
export function processFeatureGroupResponse(response: {
  metric: string
  groups: Array<{
    group_index: number
    range_label: string
    feature_ids?: number[]
    feature_ids_by_source?: Record<string, number[]>
    feature_count: number
  }>
  total_features: number
}): FeatureGroup[] {
  return response.groups.map(group => {
    let featureIds: Set<number>

    if (group.feature_ids) {
      // Standard metric: direct feature_ids
      featureIds = new Set(group.feature_ids)
    } else if (group.feature_ids_by_source) {
      // Consistency metric: flatten feature_ids_by_source
      const allIds = Object.values(group.feature_ids_by_source).flat()
      featureIds = new Set(allIds)
    } else {
      // Empty group
      featureIds = new Set()
    }

    return {
      groupIndex: group.group_index,
      rangeLabel: group.range_label,
      featureIds,
      featureCount: group.feature_count
    }
  })
}

// ============================================================================
// FRONTEND THRESHOLD GROUPING
// ============================================================================

/**
 * Group features by threshold ranges using local metric values.
 * Replaces backend /api/feature-groups call for instant threshold updates.
 *
 * @param parentFeatureIds - Set of feature IDs from parent node
 * @param metric - Metric name (e.g., "decoder_similarity", "quality_score")
 * @param thresholds - Threshold values to split by (unsorted is OK)
 * @param tableData - Pre-loaded table data with all metric values
 * @returns Array of feature groups (N+1 groups from N thresholds)
 */
export function groupFeaturesByThresholds(
  parentFeatureIds: Set<number>,
  metric: string,
  thresholds: number[],
  tableData: any // Type as FeatureTableDataResponse if imported
): FeatureGroup[] {
  // 1. Extract metric values for parent's features
  const metricValues = new Map<number, number>()

  if (!tableData || !tableData.features || tableData.features.length === 0) {
    console.warn('[groupFeaturesByThresholds] ⚠️ No table data available')
    return []
  }

  for (const feature of tableData.features) {
    if (parentFeatureIds.has(feature.feature_id)) {
      let metricValue: number | null = null

      // Special handling for decoder_similarity
      if (metric === 'decoder_similarity') {
        // First, check if decoder_similarity_merge_threshold exists (new metric)
        if (feature.decoder_similarity_merge_threshold !== null &&
            feature.decoder_similarity_merge_threshold !== undefined &&
            !isNaN(feature.decoder_similarity_merge_threshold)) {
          metricValue = feature.decoder_similarity_merge_threshold
        }
        // Fallback: extract max cosine_similarity from array (old behavior)
        else if (Array.isArray(feature[metric]) && feature[metric].length > 0) {
          metricValue = Math.max(...feature[metric].map((item: any) => item.cosine_similarity))
        }
      }
      // Special handling for quality_score (average across explainers)
      else if (metric === 'quality_score' && feature.explainers) {
        const explainerValues: number[] = []
        for (const explainerKey in feature.explainers) {
          const explainerData = feature.explainers[explainerKey]
          if (explainerData.quality_score !== null && explainerData.quality_score !== undefined) {
            explainerValues.push(explainerData.quality_score)
          }
        }
        if (explainerValues.length > 0) {
          metricValue = explainerValues.reduce((a, b) => a + b, 0) / explainerValues.length
        }
      }
      // Direct metric access for other metrics
      else {
        metricValue = feature[metric]
      }

      // Only add if valid numeric value
      if (metricValue !== null && metricValue !== undefined && !isNaN(metricValue)) {
        metricValues.set(feature.feature_id, Number(metricValue))
      }
    }
  }

  // 2. Sort thresholds in ascending order
  const sortedThresholds = [...thresholds].sort((a, b) => a - b)

  // 3. Create N+1 groups from N thresholds
  const groups: FeatureGroup[] = []

  for (let i = 0; i <= sortedThresholds.length; i++) {
    const featureIds = new Set<number>()
    let rangeLabel: string

    if (i === 0) {
      // Group 0: < threshold[0]
      rangeLabel = `< ${sortedThresholds[0].toFixed(2)}`
      for (const [featureId, value] of metricValues) {
        if (value < sortedThresholds[0]) {
          featureIds.add(featureId)
        }
      }
    } else if (i === sortedThresholds.length) {
      // Last group: >= threshold[i-1]
      rangeLabel = `>= ${sortedThresholds[i - 1].toFixed(2)}`
      for (const [featureId, value] of metricValues) {
        if (value >= sortedThresholds[i - 1]) {
          featureIds.add(featureId)
        }
      }
    } else {
      // Middle groups: threshold[i-1] <= value < threshold[i]
      rangeLabel = `${sortedThresholds[i - 1].toFixed(2)} - ${sortedThresholds[i].toFixed(2)}`
      for (const [featureId, value] of metricValues) {
        if (value >= sortedThresholds[i - 1] && value < sortedThresholds[i]) {
          featureIds.add(featureId)
        }
      }
    }

    groups.push({
      groupIndex: i,
      rangeLabel,
      featureIds,
      featureCount: featureIds.size
    })
  }

  console.log(`[groupFeaturesByThresholds] ✅ Created ${groups.length} groups for ${metric}:`,
    groups.map(g => `${g.rangeLabel} (${g.featureCount} features)`).join(', '))

  return groups
}

/**
 * Calculate segment proportions for v2 segment nodes from feature groups.
 * Converts feature groups into NodeSegment[] format with colors and proportional heights.
 *
 * @param groups - Feature groups from groupFeaturesByThresholds()
 * @param tags - Tag names for each group (from stage config)
 * @param tagColors - Color mapping for tags (from tag-constants.ts)
 * @param totalFeatures - Total number of features in parent node
 * @returns Array of NodeSegment with proportional heights and colors
 */
export function calculateSegmentProportions(
  groups: FeatureGroup[],
  tags: string[],
  tagColors: Record<string, string>,
  totalFeatures: number
): any[] { // Returns NodeSegment[]
  if (totalFeatures === 0) {
    console.warn('[calculateSegmentProportions] ⚠️ Total features is 0')
    return []
  }

  let currentY = 0
  const segments = groups.map((group, index) => {
    const tagName = tags[index] || `Group ${index}`
    const height = group.featureCount / totalFeatures
    const color = tagColors[tagName] || '#999999'

    const segment = {
      tagName,
      featureIds: group.featureIds,
      featureCount: group.featureCount,
      color,
      height,
      yPosition: currentY
    }

    currentY += height
    return segment
  })

  return segments
}
