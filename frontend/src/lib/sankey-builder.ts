/**
 * Sankey Builder - Fixed 3-Stage Architecture
 *
 * Core building logic for the fixed 3-stage Sankey progression:
 * Stage 1: Feature Splitting (decoder_similarity)
 * Stage 2: Quality Assessment (quality_score)
 * Stage 3: Cause Determination (pre-defined groups)
 */

import type {
  SimplifiedSankeyNode,
  RegularSankeyNode,
  SegmentSankeyNode,
  TerminalSankeyNode,
  SankeyLink,
  SankeyStructure,
  NodeSegment,
  Filters
} from '../types'
import { getStageConfig } from './sankey-stages'
import { processFeatureGroupResponse } from './threshold-utils'
import { TAG_CATEGORIES, UNSURE_GRAY } from './constants'
import * as api from '../api'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate segments for a segment node using API + Set intersection.
 * Each segment represents a tag group with proportional height.
 *
 * @param filters - Current filters
 * @param parentFeatureIds - Features from parent node to intersect with
 * @param metric - Metric used for grouping
 * @param threshold - Threshold value for split
 * @param tags - Tag names for each group
 * @param tagColors - Colors for each tag (from tag constants)
 * @returns Array of node segments with proportional heights
 */
export async function calculateSegments(
  filters: Filters,
  parentFeatureIds: Set<number>,
  metric: string,
  threshold: number,
  tags: string[],
  tagColors: Record<string, string>
): Promise<NodeSegment[]> {
  // Call API to get feature groups
  const response = await api.getFeatureGroups({
    filters,
    metric,
    thresholds: [threshold]
  })

  // Process response to extract groups
  const groups = processFeatureGroupResponse(response)

  // Calculate total features for proportional heights
  const totalFeatures = parentFeatureIds.size
  let currentY = 0

  // Map groups to segments with Set intersection
  const segments: NodeSegment[] = groups.map((group, index) => {
    // Intersect group features with parent features
    const intersectedFeatures = new Set<number>()
    for (const id of group.featureIds) {
      if (parentFeatureIds.has(id)) {
        intersectedFeatures.add(id)
      }
    }

    const tagName = tags[index] || `Group ${index}`
    const height = intersectedFeatures.size / totalFeatures
    const color = tagColors[tagName] || '#999999'

    const segment: NodeSegment = {
      tagName,
      featureIds: intersectedFeatures,
      featureCount: intersectedFeatures.size,
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
 * Get tag colors from tag category configuration
 */
function getTagColors(categoryId: string): Record<string, string> {
  const category = TAG_CATEGORIES[categoryId]
  if (!category || !category.tagColors) {
    return {}
  }
  return category.tagColors
}

/**
 * Derive Fragmented and Monosemantic feature sets from pair selection states.
 * - Fragmented: features with ANY pair tagged as "selected"
 * - Monosemantic: ALL other features (including untagged/unsure)
 *
 * @param allClusterPairs - All pairs from clustering
 * @param pairSelectionStates - Map of pair_key -> 'selected' | 'rejected'
 * @param parentFeatureIds - Features to consider (from parent node)
 * @returns { fragmentedIds, monosematicIds }
 */
export function deriveFeatureSetsFromPairSelections(
  allClusterPairs: Array<{ main_id: number; similar_id: number; pair_key: string }>,
  pairSelectionStates: Map<string, 'selected' | 'rejected'>,
  parentFeatureIds: Set<number>
): { fragmentedIds: Set<number>; monosematicIds: Set<number> } {
  const fragmentedIds = new Set<number>()

  // Find all features that have ANY pair tagged as "selected" (Fragmented)
  for (const pair of allClusterPairs) {
    // Only consider pairs within parent feature set
    if (!parentFeatureIds.has(pair.main_id) || !parentFeatureIds.has(pair.similar_id)) {
      continue
    }

    const pairState = pairSelectionStates.get(pair.pair_key)

    if (pairState === 'selected') {
      // Both features in a selected pair are Fragmented
      fragmentedIds.add(pair.main_id)
      fragmentedIds.add(pair.similar_id)
    }
  }

  // Monosemantic = ALL features that are NOT Fragmented
  const monosematicIds = new Set<number>()
  for (const featureId of parentFeatureIds) {
    if (!fragmentedIds.has(featureId)) {
      monosematicIds.add(featureId)
    }
  }

  return { fragmentedIds, monosematicIds }
}

// ============================================================================
// STAGE BUILDERS
// ============================================================================

/**
 * Build Stage 1: Feature Splitting
 *
 * Creates:
 * - Root node (regular)
 * - Segment node with Monosemantic/Fragmented segments
 *
 * @param filters - Current filters
 * @param allFeatures - All feature IDs after filtering
 * @param threshold - Optional custom threshold (default: 0.4)
 * @returns Sankey structure for Stage 1
 */
export async function buildStage1(
  filters: Filters,
  allFeatures: Set<number>,
  threshold?: number
): Promise<SankeyStructure> {
  const config = getStageConfig(1)
  const actualThreshold = threshold ?? config.defaultThreshold ?? 0.4

  // 1. Create root node
  const rootNode: RegularSankeyNode = {
    id: 'root',
    type: 'regular',
    featureIds: allFeatures,
    featureCount: allFeatures.size,
    parentId: null,
    depth: 0,
    tagName: 'All Features',
    color: '#d1d5db'  // Gray
  }

  // 2. Calculate segments for Feature Splitting using API
  const tagColors = getTagColors(config.categoryId)
  const segments = await calculateSegments(
    filters,
    allFeatures,
    config.metric!,
    actualThreshold,
    config.tags,
    tagColors
  )

  // 3. Create segment node
  const segmentNode: SegmentSankeyNode = {
    id: 'stage1_segment',
    type: 'segment',
    metric: config.metric,
    threshold: actualThreshold,
    parentId: 'root',
    depth: 1,
    featureIds: allFeatures,
    featureCount: allFeatures.size,
    segments
  }

  // 4. Create link
  const link: SankeyLink = {
    source: 'root',
    target: 'stage1_segment',
    value: allFeatures.size
  }

  return {
    nodes: [rootNode, segmentNode],
    links: [link],
    currentStage: 1
  }
}

/**
 * Build Stage 2: Quality Assessment
 *
 * Expands the Stage 1 segment node into:
 * - Monosemantic node (regular) → Quality segment node
 * - Fragmented node (terminal) at rightmost position
 *
 * @param filters - Current filters
 * @param stage1Structure - Previous stage structure
 * @param threshold - Optional custom threshold (default from TAG_CATEGORIES)
 * @returns Sankey structure for Stage 2
 */
export async function buildStage2(
  filters: Filters,
  stage1Structure: SankeyStructure,
  threshold?: number
): Promise<SankeyStructure> {
  const config = getStageConfig(2)
  const actualThreshold = threshold ?? config.defaultThreshold ?? 0.6

  // Get the segment node from Stage 1
  const stage1Segment = stage1Structure.nodes.find(n => n.id === 'stage1_segment') as SegmentSankeyNode
  if (!stage1Segment) {
    throw new Error('Stage 1 segment node not found')
  }

  // Get feature sets from Stage 1 segments
  const monosematicSegment = stage1Segment.segments[0]  // < 0.4 (low decoder similarity)
  const fragmentedSegment = stage1Segment.segments[1]   // >= 0.4 (high decoder similarity)

  const nodes: SimplifiedSankeyNode[] = [stage1Structure.nodes[0]]  // Keep root
  const links: SankeyLink[] = []

  // 1. Create Monosemantic node (regular)
  const monosematicNode: RegularSankeyNode = {
    id: 'monosemantic',
    type: 'regular',
    featureIds: monosematicSegment.featureIds,
    featureCount: monosematicSegment.featureCount,
    parentId: 'root',
    depth: 1,
    tagName: 'Monosemantic',
    color: monosematicSegment.color
  }
  nodes.push(monosematicNode)

  // Link: root → monosemantic
  links.push({
    source: 'root',
    target: 'monosemantic',
    value: monosematicSegment.featureCount
  })

  // 2. Create Fragmented terminal node
  const fragmentedNode: TerminalSankeyNode = {
    id: 'fragmented_terminal',
    type: 'terminal',
    position: 'rightmost',
    featureIds: fragmentedSegment.featureIds,
    featureCount: fragmentedSegment.featureCount,
    parentId: 'root',
    depth: 1,
    tagName: 'Fragmented',
    color: fragmentedSegment.color
  }
  nodes.push(fragmentedNode)

  // Link: root → fragmented
  links.push({
    source: 'root',
    target: 'fragmented_terminal',
    value: fragmentedSegment.featureCount
  })

  // 3. Calculate Quality segments for Monosemantic features using API
  const tagColors = getTagColors(config.categoryId)
  const segments = await calculateSegments(
    filters,
    monosematicNode.featureIds,
    config.metric!,
    actualThreshold,
    config.tags,
    tagColors
  )

  // 4. Create Quality segment node (only if monosemantic has features)
  if (monosematicNode.featureCount > 0) {
    const qualitySegmentNode: SegmentSankeyNode = {
      id: 'stage2_segment',
      type: 'segment',
      metric: config.metric,
      threshold: actualThreshold,
      parentId: 'monosemantic',
      depth: 2,
      featureIds: monosematicNode.featureIds,
      featureCount: monosematicNode.featureCount,
      segments
    }
    nodes.push(qualitySegmentNode)

    // Link: monosemantic → quality segment
    links.push({
      source: 'monosemantic',
      target: 'stage2_segment',
      value: monosematicNode.featureCount
    })
  }

  // Filter out nodes with 0 features and their associated links
  const filteredNodes = nodes.filter(n => n.featureCount > 0)
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
  const filteredLinks = links.filter(l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target))

  return {
    nodes: filteredNodes,
    links: filteredLinks,
    currentStage: 2
  }
}

/**
 * Build Stage 2 using actual tagged feature states instead of threshold segments.
 * This should be called when transitioning from Feature Splitting to Quality.
 *
 * Uses pair selection states to derive:
 * - Fragmented: features with ANY pair tagged as "selected"
 * - Monosemantic: ALL other features (including untagged/unsure)
 *
 * @param filters - Current filters
 * @param stage1Structure - Previous stage structure
 * @param allClusterPairs - All pairs from clustering
 * @param pairSelectionStates - Map of pair_key -> 'selected' | 'rejected'
 * @param threshold - Optional custom threshold for Quality stage (default from TAG_CATEGORIES)
 * @returns Sankey structure for Stage 2
 */
export async function buildStage2FromTaggedStates(
  filters: Filters,
  stage1Structure: SankeyStructure,
  allClusterPairs: Array<{ main_id: number; similar_id: number; pair_key: string }>,
  pairSelectionStates: Map<string, 'selected' | 'rejected'>,
  threshold?: number
): Promise<SankeyStructure> {
  const stage1Config = getStageConfig(1)
  const stage2Config = getStageConfig(2)
  const actualThreshold = threshold ?? stage2Config.defaultThreshold ?? 0.6

  // Get root features from Stage 1
  const rootNode = stage1Structure.nodes.find(n => n.id === 'root')
  if (!rootNode) {
    throw new Error('Root node not found')
  }
  const allFeatures = rootNode.featureIds

  // Derive feature sets from pair selections (NOT from threshold)
  const { fragmentedIds, monosematicIds } = deriveFeatureSetsFromPairSelections(
    allClusterPairs,
    pairSelectionStates,
    allFeatures
  )

  console.log('[buildStage2FromTaggedStates] Feature sets derived from pair selections:', {
    fragmented: fragmentedIds.size,
    monosemantic: monosematicIds.size,
    total: allFeatures.size
  })

  // Get tag colors for Feature Splitting stage
  const featureSplittingColors = getTagColors(stage1Config.categoryId)

  const nodes: SimplifiedSankeyNode[] = [stage1Structure.nodes[0]]  // Keep root
  const links: SankeyLink[] = []

  // 1. Create Monosemantic node (regular)
  const monosematicNode: RegularSankeyNode = {
    id: 'monosemantic',
    type: 'regular',
    featureIds: monosematicIds,
    featureCount: monosematicIds.size,
    parentId: 'root',
    depth: 1,
    tagName: 'Monosemantic',
    color: featureSplittingColors['Monosemantic'] || '#999999'
  }
  nodes.push(monosematicNode)

  // Link: root → monosemantic
  links.push({
    source: 'root',
    target: 'monosemantic',
    value: monosematicIds.size
  })

  // 2. Create Fragmented terminal node
  const fragmentedNode: TerminalSankeyNode = {
    id: 'fragmented_terminal',
    type: 'terminal',
    position: 'rightmost',
    featureIds: fragmentedIds,
    featureCount: fragmentedIds.size,
    parentId: 'root',
    depth: 1,
    tagName: 'Fragmented',
    color: featureSplittingColors['Fragmented'] || '#F0E442'
  }
  nodes.push(fragmentedNode)

  // Link: root → fragmented
  links.push({
    source: 'root',
    target: 'fragmented_terminal',
    value: fragmentedIds.size
  })

  // 3. Calculate Quality segments for Monosemantic features using API (only if monosemantic has features)
  if (monosematicNode.featureCount > 0) {
    const qualityColors = getTagColors(stage2Config.categoryId)
    const segments = await calculateSegments(
      filters,
      monosematicNode.featureIds,
      stage2Config.metric!,
      actualThreshold,
      stage2Config.tags,
      qualityColors
    )

    // 4. Create Quality segment node
    const qualitySegmentNode: SegmentSankeyNode = {
      id: 'stage2_segment',
      type: 'segment',
      metric: stage2Config.metric,
      threshold: actualThreshold,
      parentId: 'monosemantic',
      depth: 2,
      featureIds: monosematicNode.featureIds,
      featureCount: monosematicNode.featureCount,
      segments
    }
    nodes.push(qualitySegmentNode)

    // Link: monosemantic → quality segment
    links.push({
      source: 'monosemantic',
      target: 'stage2_segment',
      value: monosematicNode.featureCount
    })
  }

  // Filter out nodes with 0 features and their associated links
  const filteredNodes = nodes.filter(n => n.featureCount > 0)
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
  const filteredLinks = links.filter(l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target))

  return {
    nodes: filteredNodes,
    links: filteredLinks,
    currentStage: 2
  }
}

/**
 * Build Stage 3: Cause Determination
 *
 * Expands the Stage 2 segment node into:
 * - Need Revision node (regular) → Cause segment node (4 pre-defined groups)
 * - Well-Explained node (terminal) at rightmost position
 *
 * @param stage2Structure - Previous stage structure
 * @returns Sankey structure for Stage 3
 */
export function buildStage3(
  stage2Structure: SankeyStructure
): SankeyStructure {
  // Get the segment node from Stage 2
  const stage2Segment = stage2Structure.nodes.find(n => n.id === 'stage2_segment') as SegmentSankeyNode
  if (!stage2Segment) {
    throw new Error('Stage 2 segment node not found')
  }

  // Get feature sets from Stage 2 segments
  const needRevisionSegment = stage2Segment.segments[0]  // < threshold (low quality)
  const wellExplainedSegment = stage2Segment.segments[1]  // >= threshold (high quality)

  // Copy existing nodes except the stage2 segment
  const nodes: SimplifiedSankeyNode[] = stage2Structure.nodes.filter(n => n.id !== 'stage2_segment')
  const links: SankeyLink[] = [...stage2Structure.links.filter(l => l.target !== 'stage2_segment')]

  // 1. Create Need Revision node (regular)
  const needRevisionNode: RegularSankeyNode = {
    id: 'need_revision',
    type: 'regular',
    featureIds: needRevisionSegment.featureIds,
    featureCount: needRevisionSegment.featureCount,
    parentId: 'monosemantic',
    depth: 2,
    tagName: 'Need Revision',
    color: needRevisionSegment.color
  }
  nodes.push(needRevisionNode)

  // Link: monosemantic → need_revision
  links.push({
    source: 'monosemantic',
    target: 'need_revision',
    value: needRevisionSegment.featureCount
  })

  // 2. Create Well-Explained terminal node
  const wellExplainedNode: TerminalSankeyNode = {
    id: 'well_explained_terminal',
    type: 'terminal',
    position: 'rightmost',
    featureIds: wellExplainedSegment.featureIds,
    featureCount: wellExplainedSegment.featureCount,
    parentId: 'monosemantic',
    depth: 2,
    tagName: 'Well-Explained',
    color: wellExplainedSegment.color
  }
  nodes.push(wellExplainedNode)

  // Link: monosemantic → well_explained
  links.push({
    source: 'monosemantic',
    target: 'well_explained_terminal',
    value: wellExplainedSegment.featureCount
  })

  // 3. Create single "Unsure" segment for Stage 3
  // Unlike Stages 1 & 2, Stage 3 has no threshold to pre-filter features
  // All features start as "Unsure" and get tagged by user
  const segments: NodeSegment[] = [{
    tagName: 'Unsure',
    featureIds: needRevisionNode.featureIds,
    featureCount: needRevisionNode.featureCount,
    color: UNSURE_GRAY,
    height: 1.0,
    yPosition: 0
  }]

  // 4. Create Cause segment node (only if need_revision has features)
  if (needRevisionNode.featureCount > 0) {
    const causeSegmentNode: SegmentSankeyNode = {
      id: 'stage3_segment',
      type: 'segment',
      metric: null,  // No metric for Cause stage
      threshold: null,
      parentId: 'need_revision',
      depth: 3,
      featureIds: needRevisionNode.featureIds,
      featureCount: needRevisionNode.featureCount,
      segments
    }
    nodes.push(causeSegmentNode)

    // Link: need_revision → cause segment
    links.push({
      source: 'need_revision',
      target: 'stage3_segment',
      value: needRevisionNode.featureCount
    })
  }

  // Filter out nodes with 0 features and their associated links
  const filteredNodes = nodes.filter(n => n.featureCount > 0)
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id))
  const filteredLinks = links.filter(l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target))

  return {
    nodes: filteredNodes,
    links: filteredLinks,
    currentStage: 3
  }
}

/**
 * Update threshold for a specific stage without rebuilding downstream stages.
 * Only recalculates segments for the affected stage using API.
 *
 * @param filters - Current filters
 * @param structure - Current Sankey structure
 * @param stageNumber - Stage to update (1 or 2, not 3 since it has no threshold)
 * @param newThreshold - New threshold value
 * @returns Updated Sankey structure
 */
export async function updateStageThreshold(
  filters: Filters,
  structure: SankeyStructure,
  stageNumber: 1 | 2,
  newThreshold: number
): Promise<SankeyStructure> {
  if (stageNumber === 1) {
    // Update Stage 1 segment
    const segmentNode = structure.nodes.find(n => n.id === 'stage1_segment') as SegmentSankeyNode
    if (!segmentNode) {
      throw new Error('Stage 1 segment node not found')
    }

    const config = getStageConfig(1)
    const tagColors = getTagColors(config.categoryId)
    const updatedSegments = await calculateSegments(
      filters,
      segmentNode.featureIds,
      config.metric!,
      newThreshold,
      config.tags,
      tagColors
    )

    // Update segment node
    const updatedSegmentNode: SegmentSankeyNode = {
      ...segmentNode,
      threshold: newThreshold,
      segments: updatedSegments
    }

    const updatedNodes = structure.nodes.map(n =>
      n.id === 'stage1_segment' ? updatedSegmentNode : n
    )

    return {
      ...structure,
      nodes: updatedNodes
    }
  } else if (stageNumber === 2) {
    // Update Stage 2 segment
    const segmentNode = structure.nodes.find(n => n.id === 'stage2_segment') as SegmentSankeyNode
    if (!segmentNode) {
      throw new Error('Stage 2 segment node not found')
    }

    const config = getStageConfig(2)
    const tagColors = getTagColors(config.categoryId)
    const updatedSegments = await calculateSegments(
      filters,
      segmentNode.featureIds,
      config.metric!,
      newThreshold,
      config.tags,
      tagColors
    )

    // Update segment node
    const updatedSegmentNode: SegmentSankeyNode = {
      ...segmentNode,
      threshold: newThreshold,
      segments: updatedSegments
    }

    const updatedNodes = structure.nodes.map(n =>
      n.id === 'stage2_segment' ? updatedSegmentNode : n
    )

    return {
      ...structure,
      nodes: updatedNodes
    }
  }

  // Stage 3 has no threshold
  return structure
}
