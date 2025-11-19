/**
 * Feature Group Utilities
 *
 * Core algorithms for building Sankey diagrams from feature groups via Set intersection.
 * Replaces backend classification with frontend computation for instant threshold updates.
 */

import type {
  SankeyNode,
  SankeyLink,
  NodeCategory,
  StageDefinition,
  FeatureGroup,
  ComputedSankeyStructure,
  SankeyTreeNode,
  TreeBasedSankeyStructure,
  MetricType
} from '../types'
import { TAG_CATEGORIES } from './tag-constants'
import { METRIC_DISPLAY_NAMES } from './constants'


// ============================================================================
// CORE ALGORITHM
// ============================================================================

/**
 * Compute Sankey structure from stage definitions and feature groups.
 *
 * This is the heart of the new system - builds the entire Sankey tree
 * by computing intersections at each level.
 *
 * @param stages - Ordered list of stage definitions
 * @param metricGroups - Map of metric name to feature groups
 * @param allFeatures - Complete set of feature IDs after filtering
 * @returns Complete Sankey structure with nodes, links, and feature sets
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================


// ============================================================================
// TREE-BASED SANKEY BUILDING
// ============================================================================


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
// TREE NODE HELPERS FOR SANKEY DIAGRAM
// ============================================================================

/**
 * Get metrics that should be shown in histogram popover for a node.
 *
 * Shows the metric used for the NEXT stage (children), not the current node's metric.
 * This allows users to see the distribution of the metric they'll use for grouping.
 *
 * @param node - SankeyTreeNode to get metrics for
 * @param tree - Full tree map for reference
 * @returns Array of metrics to display in histogram
 */
export function getNodeMetrics(
  node: SankeyTreeNode,
  _tree: Map<string, SankeyTreeNode>  // Unused after architecture change
): MetricType[] {
  // If node has children, show the metric used to split this node
  // With new architecture, metric is on the parent (this node)
  if (node.children.length > 0 && node.metric) {
    return [node.metric as MetricType]
  }

  // Leaf node (no children): show nothing
  return []
}

/**
 * Get all metrics used in the path from root to this node.
 * Helper function for getAvailableStages.
 *
 * @param node - SankeyTreeNode to start from
 * @param tree - Full tree map
 * @returns Set of metric names used in ancestor path
 */
export function getMetricsInPath(
  node: SankeyTreeNode,
  tree: Map<string, SankeyTreeNode>
): Set<string> {
  const metrics = new Set<string>()
  let currentNode: SankeyTreeNode | undefined = node

  // Traverse up the tree to root
  while (currentNode) {
    if (currentNode.metric) {
      metrics.add(currentNode.metric)
    }

    // Move to parent
    if (currentNode.parentId) {
      currentNode = tree.get(currentNode.parentId)
    } else {
      break
    }
  }

  return metrics
}

/**
 * Get available stages that can be added to this node.
 * Filters out stages whose metrics are already used in the path from root to this node.
 *
 * @param node - SankeyTreeNode to check
 * @param tree - Full tree map
 * @param allStages - All possible stage options
 * @returns Array of available stages that can be added
 */
export function getAvailableStages<T extends { metric: string }>(
  node: SankeyTreeNode,
  tree: Map<string, SankeyTreeNode>,
  allStages: T[]
): T[] {
  // Get metrics already used in this path
  const usedMetrics = getMetricsInPath(node, tree)

  // Filter out stages with metrics already in use
  return allStages.filter(stage => !usedMetrics.has(stage.metric))
}

/**
 * Check if a stage can be added to this node.
 * In the new tree-based system, any node can have children.
 *
 * @param node - SankeyTreeNode to check
 * @returns Always true (any node can have stages added)
 */
export function canAddStage(_node: SankeyTreeNode): boolean {
  return true
}

/**
 * Check if a node has children.
 * Used to determine if remove button should be shown.
 *
 * @param node - SankeyTreeNode to check
 * @returns True if node has children
 */
export function hasChildren(node: SankeyTreeNode): boolean {
  return node.children.length > 0
}

/**
 * Get the path of metric constraints from root to this node.
 * Returns the sequence of metric ranges that define this node's feature set.
 * This represents the intersection of all parent constraints.
 *
 * @param nodeId - Node ID to get path constraints for
 * @param tree - SankeyTreeNode map
 * @returns Array of metric constraints from root to node
 */
export function getNodeThresholdPath(
  nodeId: string,
  tree: Map<string, SankeyTreeNode>
): Array<{ metric: string; rangeLabel: string }> {
  const constraints: Array<{ metric: string; rangeLabel: string }> = []
  let currentNode = tree.get(nodeId)

  // Walk up to root, collecting constraints
  // With new architecture, metric that created a node is on its PARENT
  while (currentNode && currentNode.depth > 0) {
    // Metric that created this node is on the PARENT
    const parent = currentNode.parentId ? tree.get(currentNode.parentId) : undefined
    if (parent?.metric && currentNode.rangeLabel) {
      constraints.unshift({
        metric: parent.metric,
        rangeLabel: currentNode.rangeLabel
      })
    }
    currentNode = parent
  }

  return constraints
}

/**
 * Get ALL threshold values for a node.
 * These are the thresholds THIS node uses to split into children.
 * Returns empty array if node has no thresholds.
 *
 * @param nodeId - Node ID to get thresholds for
 * @param tree - SankeyTreeNode map
 * @returns Array of threshold values
 */
export function getNodeThresholds(
  nodeId: string,
  tree: Map<string, SankeyTreeNode>
): number[] {
  const node = tree.get(nodeId)
  return node?.thresholds || []
}

/**
 * Pre-compute exact percentile to metric mappings for a node.
 * Ensures tooltip displays exact values that will be sent to backend.
 */
export function precomputePercentileMap(
  metricValues: number[],
  percentiles: number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
): Map<number, number> {
  const map = new Map<number, number>()

  if (metricValues.length === 0) {
    return map
  }

  const sorted = [...metricValues].sort((a, b) => a - b)

  for (const percentile of percentiles) {
    const threshold = calculateThresholdFromPercentile(sorted, percentile)
    map.set(percentile, threshold)
  }

  map.set(0, sorted[0])
  map.set(1, sorted[sorted.length - 1])

  return map
}

/**
 * Get exact metric value for a percentile using pre-computed map.
 * Interpolates between nearest values for smooth dragging.
 * NO FALLBACK - percentileMap must exist.
 */
export function getExactMetricFromPercentile(
  percentile: number,
  percentileMap: Map<number, number> | undefined
): number {
  if (!percentileMap || percentileMap.size === 0) {
    console.error('[getExactMetricFromPercentile] percentileMap is missing! This should never happen.')
    throw new Error('percentileMap is required for exact threshold calculations')
  }

  if (percentileMap.has(percentile)) {
    return percentileMap.get(percentile)!
  }

  const percentiles = Array.from(percentileMap.keys()).sort((a, b) => a - b)

  if (percentile <= percentiles[0]) {
    return percentileMap.get(percentiles[0])!
  }
  if (percentile >= percentiles[percentiles.length - 1]) {
    return percentileMap.get(percentiles[percentiles.length - 1])!
  }

  let lowerIndex = 0
  for (let i = 0; i < percentiles.length - 1; i++) {
    if (percentiles[i] <= percentile && percentiles[i + 1] > percentile) {
      lowerIndex = i
      break
    }
  }

  const lowerPercentile = percentiles[lowerIndex]
  const upperPercentile = percentiles[lowerIndex + 1]
  const lowerValue = percentileMap.get(lowerPercentile)!
  const upperValue = percentileMap.get(upperPercentile)!

  const ratio = (percentile - lowerPercentile) / (upperPercentile - lowerPercentile)
  return lowerValue + ratio * (upperValue - lowerValue)
}

// ============================================================================
// PERCENTILE-BASED THRESHOLD CALCULATION
// ============================================================================

/**
 * Calculate metric threshold value from percentile position.
 *
 * This enables visual/percentile-based splitting where users drag a handle to
 * a visual position (e.g., 40% of node height) and we calculate the metric value
 * that splits features at that percentile.
 *
 * @param metricValues - Array of metric values for features in the node
 * @param percentile - Percentile position (0-1, where 0.4 = 40th percentile)
 * @returns Metric threshold value at the specified percentile
 *
 * @example
 * // Features with metric values: [0.1, 0.2, 0.3, 0.4, 0.5]
 * calculateThresholdFromPercentile([0.1, 0.2, 0.3, 0.4, 0.5], 0.4)
 * // Returns ~0.2 (40% of features have values ≤ 0.2)
 */
export function calculateThresholdFromPercentile(
  metricValues: number[],
  percentile: number
): number {
  if (metricValues.length === 0) {
    return 0
  }

  // Sort values in ascending order
  const sorted = [...metricValues].sort((a, b) => a - b)

  // Calculate index for percentile (linear interpolation)
  const index = percentile * (sorted.length - 1)
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  // Handle edge cases
  if (lowerIndex === upperIndex || upperIndex >= sorted.length) {
    return sorted[lowerIndex]
  }

  // Linear interpolation between two nearest values
  const fraction = index - lowerIndex
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  return lowerValue + fraction * (upperValue - lowerValue)
}

/**
 * Approximate percentile threshold using histogram bin distribution.
 *
 * This is used during drag preview to convert percentile positions to metric
 * thresholds without needing access to individual feature values. It uses the
 * histogram bin counts to approximate where the percentile falls in the distribution.
 *
 * @param percentile - Percentile position (0-1, where 0.4 = 40th percentile)
 * @param bins - Array of feature counts per histogram bin
 * @param bin_edges - Array of bin edge values (length = bins.length + 1)
 * @returns Approximate metric threshold value for the given percentile
 *
 * @example
 * // Histogram with bins [10, 20, 30, 40] and edges [0, 0.25, 0.5, 0.75, 1.0]
 * // Total: 100 features
 * // 40th percentile (40 features) falls in bin 1 (10+20=30, then 10 more into bin 2)
 * approximatePercentileFromHistogram(0.4, [10, 20, 30, 40], [0, 0.25, 0.5, 0.75, 1.0])
 * // Returns ~0.4167 (25% into the third bin which spans 0.25-0.5)
 */
export function approximatePercentileFromHistogram(
  percentile: number,
  bins: number[],
  bin_edges: number[]
): number {
  // Validate inputs
  if (bins.length === 0 || bin_edges.length !== bins.length + 1) {
    return 0
  }

  // Handle edge cases
  if (percentile <= 0) return bin_edges[0]
  if (percentile >= 1) return bin_edges[bin_edges.length - 1]

  // Calculate total features and target count
  const totalFeatures = bins.reduce((sum, count) => sum + count, 0)
  if (totalFeatures === 0) return bin_edges[0]

  const targetCount = percentile * totalFeatures

  // Accumulate bin counts to find which bin contains the percentile
  let accumulatedCount = 0
  for (let i = 0; i < bins.length; i++) {
    const prevCount = accumulatedCount
    accumulatedCount += bins[i]

    // Found the bin containing our target percentile
    if (accumulatedCount >= targetCount) {
      const binStart = bin_edges[i]
      const binEnd = bin_edges[i + 1]

      // If bin is empty, return bin start
      if (bins[i] === 0) return binStart

      // Linear interpolation within the bin
      // Progress through bin = (features we need into this bin) / (total features in bin)
      const binProgress = (targetCount - prevCount) / bins[i]
      return binStart + binProgress * (binEnd - binStart)
    }
  }

  // Fallback: return maximum edge (shouldn't reach here if inputs are valid)
  return bin_edges[bin_edges.length - 1]
}

/**
 * Calculate percentile position from metric threshold value.
 *
 * This is the inverse of calculateThresholdFromPercentile - given a metric
 * threshold, find what percentile it represents in the distribution.
 *
 * @param metricValues - Array of metric values for features in the node
 * @param threshold - Metric threshold value
 * @returns Percentile position (0-1) that this threshold represents
 *
 * @example
 * // Features with metric values: [0.1, 0.2, 0.3, 0.4, 0.5]
 * calculatePercentileFromThreshold([0.1, 0.2, 0.3, 0.4, 0.5], 0.2)
 * // Returns 0.4 (0.2 is at the 40th percentile)
 */
export function calculatePercentileFromThreshold(
  metricValues: number[],
  threshold: number
): number {
  if (metricValues.length === 0) {
    return 0
  }

  // Sort values in ascending order
  const sorted = [...metricValues].sort((a, b) => a - b)

  // Count how many values are less than threshold
  let count = 0
  for (const value of sorted) {
    if (value < threshold) {
      count++
    } else {
      break
    }
  }

  // Return as percentile (0-1)
  return count / sorted.length
}

/**
 * Extract metric values for a set of feature IDs.
 *
 * This helper function is used by the percentile calculation logic to get
 * the actual metric values for features in a node so we can calculate percentiles.
 *
 * @param featureIds - Set of feature IDs to get metric values for
 * @param metric - Metric name to extract values for
 * @param cachedData - Optional cached feature data to avoid API calls
 * @returns Array of metric values (filtered for nulls)
 *
 * @example
 * const values = await getFeatureMetricValues(
 *   new Set([1, 5, 12, 23]),
 *   'semdist_mean',
 *   tableData // from store
 * )
 */
export async function getFeatureMetricValues(
  featureIds: Set<number>,
  metric: string,
  cachedData?: any // TODO: Type this properly with feature data structure
): Promise<number[]> {
  const values: number[] = []

  // If we have cached table data, use it
  if (cachedData?.features) {
    for (const feature of cachedData.features) {
      if (featureIds.has(feature.feature_id)) {
        let metricValue = feature[metric]

        // Special handling for decoder_similarity (it's an array of objects, not a scalar)
        // Backend returns: [{feature_id: 100, cosine_similarity: 0.95}, ...]
        // We extract the max cosine_similarity value (matching backend grouping logic)
        if (metric === 'decoder_similarity' && Array.isArray(metricValue) && metricValue.length > 0) {
          metricValue = Math.max(...metricValue.map((item: any) => item.cosine_similarity))
        }

        // Special handling for explainer-level metrics (embedding, quality_score)
        // These are nested inside feature.explainers[explainerKey].metric
        // We take the average across all explainers for this feature
        if (metric === 'quality_score' && feature.explainers) {
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

        if (metricValue !== null && metricValue !== undefined && !isNaN(metricValue)) {
          values.push(Number(metricValue))
        }
      }
    }
  }

  // TODO: If no cache, could fetch from API here
  // For now, return empty array if no cached data

  return values
}

// ============================================================================
// THRESHOLD LABEL HELPERS
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
 *
 * @example
 * // With thresholds [0.4] and decoder_similarity metric:
 * // Returns 2 groups: [< 0.40, >= 0.40]
 *
 * @example
 * // With thresholds [0.3, 0.7] and quality_score metric:
 * // Returns 3 groups: [< 0.30, 0.30 - 0.70, >= 0.70]
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

      // Special handling for decoder_similarity (extract max cosine_similarity)
      if (metric === 'decoder_similarity' && Array.isArray(feature[metric]) && feature[metric].length > 0) {
        metricValue = Math.max(...feature[metric].map((item: any) => item.cosine_similarity))
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

/**
 * Get tag name for a child node based on its group index and parent's category.
 * Used for labeling threshold handles on histograms.
 *
 * @param childNode - The child tree node to get tag name for
 * @param parentNode - The parent tree node (contains the metric that created the split)
 * @param sankeyTree - Full tree map (unused but kept for consistency)
 * @returns Tag name (e.g., "monosemantic", "fragmented") or null if not found
 *
 * @example
 * // For decoder_similarity split at 0.4:
 * // Child with ID "root_stage1_group0" returns "monosemantic"
 * // Child with ID "root_stage1_group1" returns "fragmented"
 */
export function getChildNodeTagName(
  childNode: SankeyTreeNode,
  parentNode: SankeyTreeNode,
): string | null {
  // Parent must have a metric to determine category
  if (!parentNode?.metric) {
    return null
  }

  // Find matching tag category by metric
  const category = Object.values(TAG_CATEGORIES).find(c => c.metric === parentNode.metric)
  if (!category || !category.tags || category.tags.length === 0) {
    return null
  }

  // Extract the LAST group index from child node ID
  // For "root_stage1_group0_stage2_group1", we want group1 (the last one)
  const matches = childNode.id.match(/group(\d+)/g)
  if (!matches || matches.length === 0) {
    return null
  }

  const lastMatch = matches[matches.length - 1]
  const groupIndexMatch = lastMatch.match(/\d+/)
  if (!groupIndexMatch) {
    return null
  }

  const groupIndex = parseInt(groupIndexMatch[0], 10)
  const tagName = category.tags[groupIndex]

  return tagName || null
}
