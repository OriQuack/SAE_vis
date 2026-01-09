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
import { processFeatureGroupResponse } from './threshold-utils'
import { TAG_CATEGORIES, TAG_CATEGORY_QUALITY, TAG_CATEGORY_CAUSE, getStageConfig } from './constants'
import { getBadgeColors } from './tag-system'
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

  // 3. Create Cause segment node (only if need_revision has features)
  // Initially empty segments - will be populated by cause tagging via updateStage3CauseSegments
  // SankeyDiagram.tsx fallback rendering handles the "Unsure" display before segments are set
  if (needRevisionNode.featureCount > 0) {
    const causeSegmentNode: SegmentSankeyNode = {
      id: 'stage3_segment',
      type: 'segment',
      metric: 'cause_category',  // Shows cause category distribution from tagging
      threshold: null,  // Not used for cause categories (no threshold-based split)
      parentId: 'need_revision',
      depth: 3,
      featureIds: needRevisionNode.featureIds,
      featureCount: needRevisionNode.featureCount,
      segments: []  // Empty initially - populated by updateStage3CauseSegments when tagging occurs
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
 * Build Stage 3 using actual tagged feature states instead of threshold segments.
 *
 * This should be called when transitioning from Quality to Cause stage with existing tags.
 * Uses featureSelectionStates to derive:
 * - Well-Explained: features tagged as 'selected'
 * - Need Revision: features tagged as 'rejected' OR untagged
 *
 * @param stage2Structure - Previous stage structure
 * @param featureSelectionStates - Map of feature_id -> 'selected' | 'rejected'
 * @param monosematicFeatureIds - Features from monosemantic node (Stage 1 → Stage 2)
 * @returns Sankey structure for Stage 3
 */
export function buildStage3FromTaggedStates(
  stage2Structure: SankeyStructure,
  featureSelectionStates: Map<number, 'selected' | 'rejected'>,
  monosematicFeatureIds: Set<number>
): SankeyStructure {
  // 1. Derive Well-Explained and Need Revision sets from feature selection states
  const wellExplainedIds = new Set<number>()
  const needRevisionIds = new Set<number>()

  for (const featureId of monosematicFeatureIds) {
    const state = featureSelectionStates.get(featureId)
    if (state === 'selected') {
      wellExplainedIds.add(featureId)
    } else {
      // 'rejected' or untagged → Need Revision
      needRevisionIds.add(featureId)
    }
  }

  console.log('[buildStage3FromTaggedStates] Feature sets derived from tagged states:', {
    wellExplained: wellExplainedIds.size,
    needRevision: needRevisionIds.size,
    total: monosematicFeatureIds.size
  })

  // Get tag colors from quality category
  const qualityColors = getTagColors(TAG_CATEGORY_QUALITY)

  // Copy existing nodes except the stage2 segment
  const nodes: SimplifiedSankeyNode[] = stage2Structure.nodes.filter(n => n.id !== 'stage2_segment')
  const links: SankeyLink[] = [...stage2Structure.links.filter(l => l.target !== 'stage2_segment')]

  // 2. Create Need Revision node (regular)
  const needRevisionNode: RegularSankeyNode = {
    id: 'need_revision',
    type: 'regular',
    featureIds: needRevisionIds,
    featureCount: needRevisionIds.size,
    parentId: 'monosemantic',
    depth: 2,
    tagName: 'Need Revision',
    color: qualityColors['Need Revision'] || '#999999'
  }
  nodes.push(needRevisionNode)

  // Link: monosemantic → need_revision
  links.push({
    source: 'monosemantic',
    target: 'need_revision',
    value: needRevisionIds.size
  })

  // 3. Create Well-Explained terminal node
  const wellExplainedNode: TerminalSankeyNode = {
    id: 'well_explained_terminal',
    type: 'terminal',
    position: 'rightmost',
    featureIds: wellExplainedIds,
    featureCount: wellExplainedIds.size,
    parentId: 'monosemantic',
    depth: 2,
    tagName: 'Well-Explained',
    color: qualityColors['Well-Explained'] || '#4CAF50'
  }
  nodes.push(wellExplainedNode)

  // Link: monosemantic → well_explained
  links.push({
    source: 'monosemantic',
    target: 'well_explained_terminal',
    value: wellExplainedIds.size
  })

  // 4. Create Cause segment node (only if need_revision has features)
  // Initially empty segments - will be populated by cause tagging via updateStage3CauseSegments
  if (needRevisionNode.featureCount > 0) {
    const causeSegmentNode: SegmentSankeyNode = {
      id: 'stage3_segment',
      type: 'segment',
      metric: 'cause_category',  // Shows cause category distribution from tagging
      threshold: null,  // Not used for cause categories (no threshold-based split)
      parentId: 'need_revision',
      depth: 3,
      featureIds: needRevisionIds,
      featureCount: needRevisionIds.size,
      segments: []  // Empty initially - populated by updateStage3CauseSegments when tagging occurs
    }
    nodes.push(causeSegmentNode)

    // Link: need_revision → cause segment
    links.push({
      source: 'need_revision',
      target: 'stage3_segment',
      value: needRevisionIds.size
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

/**
 * Update Stage 3 segments based on cause category tagging.
 *
 * Unlike Stages 1 & 2 which use threshold-based segmentation,
 * Stage 3 shows the distribution of cause categories based on tagging.
 *
 * @param structure - Current Sankey structure (must be Stage 3)
 * @param causeSelectionStates - Map of feature_id -> cause category
 * @returns Updated Sankey structure with cause category segments
 */
export function updateStage3CauseSegments(
  structure: SankeyStructure,
  causeSelectionStates: Map<number, string>
): SankeyStructure {
  const segmentNode = structure.nodes.find(n => n.id === 'stage3_segment') as SegmentSankeyNode
  if (!segmentNode) {
    console.warn('[updateStage3CauseSegments] Stage 3 segment node not found')
    return structure
  }

  // Avoid division by zero
  if (segmentNode.featureCount === 0) {
    return structure
  }

  // Group features by cause category (excluding well-explained which goes to terminal)
  const causeCategories = ['missed-N-gram', 'missed-context', 'noisy-activation'] as const
  const categoryFeatures: Map<string, Set<number>> = new Map()

  causeCategories.forEach(cat => categoryFeatures.set(cat, new Set()))

  segmentNode.featureIds.forEach(featureId => {
    const category = causeSelectionStates.get(featureId)
    if (category && causeCategories.includes(category as typeof causeCategories[number])) {
      categoryFeatures.get(category)!.add(featureId)
    }
  })

  // Calculate total tagged features for proportions
  const totalTagged = Array.from(categoryFeatures.values()).reduce((sum, set) => sum + set.size, 0)

  // If no features are tagged yet, return structure unchanged (show "Unsure" fallback)
  if (totalTagged === 0) {
    return structure
  }

  // Build segments array
  const tagColors = getBadgeColors(TAG_CATEGORY_CAUSE)
  const segments: NodeSegment[] = []
  let yPosition = 0

  causeCategories.forEach((category, index) => {
    const featureIds = categoryFeatures.get(category)!
    if (featureIds.size > 0) {
      const height = featureIds.size / segmentNode.featureCount
      segments.push({
        tagName: category === 'noisy-activation' ? 'Noisy Activation'
               : category === 'missed-N-gram' ? 'Missed N-gram'
               : 'Missed Context',
        featureIds,
        featureCount: featureIds.size,
        color: tagColors[index] || '#888',
        height,
        yPosition
      })
      yPosition += height
    }
  })

  // Update segment node
  const updatedSegmentNode: SegmentSankeyNode = {
    ...segmentNode,
    metric: 'cause_category',
    threshold: null,
    segments
  }

  const updatedNodes = structure.nodes.map(n =>
    n.id === 'stage3_segment' ? updatedSegmentNode : n
  )

  return {
    ...structure,
    nodes: updatedNodes
  }
}

// ============================================================================
// STAGE 4 BUILDERS
// ============================================================================

/**
 * Derive feature sets from cause selection states.
 * Groups features by their cause category tag.
 *
 * @param parentFeatureIds - Features from parent node (need_revision)
 * @param causeSelectionStates - Map of feature_id -> cause category
 * @returns Record of cause category -> Set of feature IDs
 */
export function deriveFeatureSetsFromCauseSelections(
  parentFeatureIds: Set<number>,
  causeSelectionStates: Map<number, string>
): Record<string, Set<number>> {
  const causeSets: Record<string, Set<number>> = {
    'well-explained': new Set<number>(),
    'noisy-activation': new Set<number>(),
    'missed-context': new Set<number>(),
    'missed-N-gram': new Set<number>()
  }

  for (const featureId of parentFeatureIds) {
    const causeTag = causeSelectionStates.get(featureId)
    if (causeTag && causeSets[causeTag]) {
      causeSets[causeTag].add(featureId)
    }
    // Features without a cause tag are not included (unsure)
  }

  return causeSets
}

/**
 * Build Stage 4: Summary
 *
 * Expands the Stage 3 segment node into terminal nodes for each cause category.
 * Uses actual cause selection states (from CauseView tagging) to determine
 * which features belong to which cause category.
 *
 * @param stage3Structure - Previous stage structure
 * @param causeSelectionStates - Map of feature_id -> cause category
 * @returns Sankey structure for Stage 4
 */
export function buildStage4FromTaggedStates(
  stage3Structure: SankeyStructure,
  causeSelectionStates: Map<number, string>
): SankeyStructure {
  // Get the need_revision node (parent of stage3_segment)
  const needRevisionNode = stage3Structure.nodes.find(n => n.id === 'need_revision')
  if (!needRevisionNode || !needRevisionNode.featureIds) {
    throw new Error('need_revision node not found')
  }

  // Derive feature sets from cause selections
  const causeSets = deriveFeatureSetsFromCauseSelections(
    needRevisionNode.featureIds,
    causeSelectionStates
  )

  console.log('[buildStage4FromTaggedStates] Feature sets derived from cause selections:', {
    wellExplained: causeSets['well-explained'].size,
    noisyActivation: causeSets['noisy-activation'].size,
    missedContext: causeSets['missed-context'].size,
    missedNgram: causeSets['missed-N-gram'].size,
    total: needRevisionNode.featureIds.size
  })

  // Get tag colors for cause categories
  const causeColors = getTagColors(TAG_CATEGORY_CAUSE)

  // Get features tagged 'well-explained' in Stage 3 - these merge back to Stage 2's Well-Explained
  const wellExplainedFromCause = causeSets['well-explained']

  // Copy existing nodes except stage3_segment, merging well-explained cause features
  const nodes: SimplifiedSankeyNode[] = stage3Structure.nodes
    .filter(n => n.id !== 'stage3_segment')
    .map(n => {
      // Merge Stage 3 well-explained features into existing well_explained_terminal
      if (n.id === 'well_explained_terminal' && wellExplainedFromCause.size > 0) {
        const mergedFeatureIds = new Set([...n.featureIds, ...wellExplainedFromCause])
        return {
          ...n,
          featureIds: mergedFeatureIds,
          featureCount: mergedFeatureIds.size
        } as SimplifiedSankeyNode
      }
      return n
    })

  const links: SankeyLink[] = [...stage3Structure.links.filter(l => l.target !== 'stage3_segment')]

  // Add link from need_revision → well_explained_terminal for cause well-explained features
  if (wellExplainedFromCause.size > 0) {
    links.push({
      source: 'need_revision',
      target: 'well_explained_terminal',
      value: wellExplainedFromCause.size
    })
  }

  // Create terminal nodes for cause categories (excluding well-explained, which merges to Stage 2)
  const causeCategories = [
    { id: 'pattern_miss_terminal', tagName: 'Pattern Miss', key: 'missed-N-gram' },
    { id: 'context_miss_terminal', tagName: 'Context Miss', key: 'missed-context' },
    { id: 'noisy_activation_terminal', tagName: 'Noisy Activation', key: 'noisy-activation' }
  ]

  // Find index of first terminal node to insert cause terminals before it
  // This ensures cause terminals appear ABOVE existing terminals (well_explained, fragmented)
  const firstTerminalIndex = nodes.findIndex(n => n.type === 'terminal')
  const insertIndex = firstTerminalIndex >= 0 ? firstTerminalIndex : nodes.length

  // Collect all cause terminal nodes first
  const causeTerminalNodes: TerminalSankeyNode[] = []

  for (const category of causeCategories) {
    const featureIds = causeSets[category.key]
    if (featureIds.size > 0) {
      const terminalNode: TerminalSankeyNode = {
        id: category.id,
        type: 'terminal',
        position: 'rightmost',
        featureIds: featureIds,
        featureCount: featureIds.size,
        parentId: 'need_revision',
        depth: 3,
        tagName: category.tagName,
        color: causeColors[category.tagName] || '#999999'
      }
      causeTerminalNodes.push(terminalNode)

      // Link: need_revision → terminal node
      links.push({
        source: 'need_revision',
        target: category.id,
        value: featureIds.size
      })
    }
  }

  // Insert cause terminals before existing terminals
  nodes.splice(insertIndex, 0, ...causeTerminalNodes)

  return {
    nodes,
    links,
    currentStage: 4
  }
}
