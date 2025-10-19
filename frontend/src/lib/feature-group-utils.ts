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
  TreeBasedSankeyStructure
} from '../types'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================



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
export function computeSankeyStructure(
  stages: StageDefinition[],
  metricGroups: Map<string, FeatureGroup[]>,
  allFeatures: Set<number>
): ComputedSankeyStructure {
  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []
  const nodeFeatures = new Map<string, Set<number>>()

  // Root node contains all features
  const rootNode: SankeyNode = {
    id: 'root',
    name: 'All Features',
    stage: 0,
    feature_count: allFeatures.size,
    category: 'root' as NodeCategory,
    feature_ids: Array.from(allFeatures)
  }
  nodes.push(rootNode)
  nodeFeatures.set('root', new Set(allFeatures))

  // If no stages, return root-only structure
  if (stages.length === 0) {
    return { nodes, links, nodeFeatures }
  }

  // Build tree level by level
  let currentLevelNodes = [rootNode]

  for (const stage of stages) {
    const nextLevelNodes: SankeyNode[] = []
    const groups = metricGroups.get(stage.metric)

    if (!groups || groups.length === 0) {
      console.warn(`No groups found for metric ${stage.metric}`)
      continue
    }

    // For each node in current level
    for (const parentNode of currentLevelNodes) {
      const parentFeatures = nodeFeatures.get(parentNode.id)!

      // Create child nodes by intersecting with each group
      for (const group of groups) {
        const childFeatures = intersection(parentFeatures, group.featureIds)

        // Skip empty nodes
        if (childFeatures.size === 0) {
          continue
        }

        // Generate child node ID
        const childId = buildNodeId(parentNode.id, stage.index, group.groupIndex)

        // Create child node
        const childNode: SankeyNode = {
          id: childId,
          name: group.rangeLabel,
          stage: stage.index + 1,
          feature_count: childFeatures.size,
          category: getCategoryForMetric(stage.metric),
          feature_ids: Array.from(childFeatures)
        }

        nodes.push(childNode)
        nodeFeatures.set(childId, childFeatures)
        nextLevelNodes.push(childNode)

        // Create link from parent to child
        links.push({
          source: parentNode.id,
          target: childId,
          value: childFeatures.size
        })
      }
    }

    currentLevelNodes = nextLevelNodes

    // Early exit if no nodes at this level
    if (currentLevelNodes.length === 0) {
      console.warn(`No features at stage ${stage.index}`)
      break
    }
  }

  return { nodes, links, nodeFeatures }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fast Set intersection using JavaScript Set.
 * Iterates over the smaller set for optimal performance.
 *
 * @param setA - First set
 * @param setB - Second set
 * @returns Intersection of both sets
 */
export function intersection(setA: Set<number>, setB: Set<number>): Set<number> {
  const result = new Set<number>()

  // Iterate over smaller set for performance
  const smaller = setA.size < setB.size ? setA : setB
  const larger = setA.size < setB.size ? setA : setB

  for (const item of smaller) {
    if (larger.has(item)) {
      result.add(item)
    }
  }

  return result
}

/**
 * Build node ID following convention: root, stage0_group0, stage0_group0_stage1_group0
 *
 * @param parentId - Parent node ID
 * @param stageIndex - Stage index (0-based)
 * @param groupIndex - Group index within stage (0-based)
 * @returns Node ID string
 */
function buildNodeId(parentId: string, stageIndex: number, groupIndex: number): string {
  if (parentId === 'root') {
    return `stage${stageIndex}_group${groupIndex}`
  }
  return `${parentId}_stage${stageIndex}_group${groupIndex}`
}

/**
 * Get category for metric (for node coloring).
 *
 * @param metric - Metric name
 * @returns Node category
 */
function getCategoryForMetric(metric: string): NodeCategory {
  // Feature splitting metrics
  if (metric === 'feature_splitting') {
    return 'feature_splitting' as NodeCategory
  }

  // Semantic distance metrics
  if (metric === 'semdist_mean' || metric === 'semdist_max') {
    return 'semantic_similarity' as NodeCategory
  }

  // Score metrics (standard)
  if (metric.startsWith('score_')) {
    return 'score_agreement' as NodeCategory
  }

  // Consistency metrics
  if (metric.includes('consistency') || metric === 'overall_score') {
    return 'consistency' as NodeCategory
  }

  // Fallback
  return 'root' as NodeCategory
}

// ============================================================================
// TREE-BASED SANKEY BUILDING
// ============================================================================

/**
 * Convert a tree of SankeyTreeNodes to D3-compatible Sankey structure.
 * This function traverses the tree and creates the flat nodes/links arrays needed by D3.
 *
 * @param tree - Map of node ID to SankeyTreeNode
 * @returns TreeBasedSankeyStructure with nodes, links, and metadata
 */
export function convertTreeToSankeyStructure(tree: Map<string, SankeyTreeNode>): TreeBasedSankeyStructure {
  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []
  let maxDepth = 0

  // Walk the tree to build nodes and links
  tree.forEach((node) => {
    // Create node for D3
    const sankeyNode: SankeyNode = {
      id: node.id,
      name: node.rangeLabel,
      stage: node.depth,
      feature_count: node.featureCount,
      category: getNodeCategory(node),
      feature_ids: Array.from(node.featureIds)
    }
    nodes.push(sankeyNode)

    // Track max depth
    if (node.depth > maxDepth) {
      maxDepth = node.depth
    }

    // Create links to children
    if (node.children.length > 0) {
      node.children.forEach(childId => {
        const child = tree.get(childId)
        if (child && child.featureCount > 0) {
          links.push({
            source: node.id,
            target: childId,
            value: child.featureCount
          })
        }
      })
    }
  })

  return {
    tree,
    nodes,
    links,
    maxDepth
  }
}

/**
 * Get the category for a tree node based on its position and metric.
 *
 * @param node - SankeyTreeNode
 * @returns NodeCategory for coloring
 */
function getNodeCategory(node: SankeyTreeNode): NodeCategory {
  // Root node
  if (node.depth === 0) {
    return 'root' as NodeCategory
  }

  // Use metric to determine category
  if (node.metric) {
    return getCategoryForMetric(node.metric)
  }

  // Default fallback
  return 'feature_splitting' as NodeCategory
}

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
