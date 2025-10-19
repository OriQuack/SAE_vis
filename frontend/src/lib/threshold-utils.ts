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

  console.log(`[computeSankeyStructure] Starting with ${allFeatures.size} total features`)
  console.log(`  Stages to process: ${stages.map(s => s.metric).join(' -> ')}`)

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
    console.log(`\n[Stage ${stage.index}] Processing metric: ${stage.metric}`)
    const nextLevelNodes: SankeyNode[] = []
    const groups = metricGroups.get(stage.metric)

    if (!groups || groups.length === 0) {
      console.warn(`No groups found for metric ${stage.metric}`)
      continue
    }

    console.log(`  Found ${groups.length} groups for this metric`)
    let stageTotal = 0

    // For each node in current level
    for (const parentNode of currentLevelNodes) {
      const parentFeatures = nodeFeatures.get(parentNode.id)!
      console.log(`  Parent node "${parentNode.name}" has ${parentFeatures.size} features`)

      // Create child nodes by intersecting with each group
      for (const group of groups) {
        console.log(`    Intersecting with group "${group.rangeLabel}" (${group.featureIds.size} features)`)
        const childFeatures = intersection(parentFeatures, group.featureIds)

        // Skip empty nodes
        if (childFeatures.size === 0) {
          console.log(`      -> Empty intersection, skipping`)
          continue
        }
        console.log(`      -> Intersection has ${childFeatures.size} features`)
        stageTotal += childFeatures.size

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

    console.log(`  Stage ${stage.index} summary: ${nextLevelNodes.length} nodes, ${stageTotal} total features`)

    // Check for duplication
    const parentTotal = Array.from(currentLevelNodes).reduce((sum, node) => {
      const features = nodeFeatures.get(node.id)
      return sum + (features?.size || 0)
    }, 0)

    if (stageTotal > parentTotal && parentTotal > 0) {
      console.error(`  ERROR: Feature duplication detected! Children have ${stageTotal} but parents only have ${parentTotal}`)
    }
  }

  console.log(`\n[computeSankeyStructure] Complete: ${nodes.length} nodes, ${links.length} links`)

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
  const larger = setA.size < setB.size ? setB : setA  // FIXED: Swap setB and setA for larger

  for (const item of smaller) {
    if (larger.has(item)) {
      result.add(item)
    }
  }

  // Sanity check: intersection cannot be larger than the smallest input set
  if (result.size > Math.min(setA.size, setB.size)) {
    console.error(`[intersection] ERROR: Result size ${result.size} > min(${setA.size}, ${setB.size})`)
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
  console.log(`[processFeatureGroupResponse] Processing ${response.metric}:`)
  console.log(`  Total features from backend: ${response.total_features}`)
  console.log(`  Number of groups: ${response.groups.length}`)

  return response.groups.map(group => {
    let featureIds: Set<number>

    if (group.feature_ids) {
      // Standard metric: direct feature_ids
      featureIds = new Set(group.feature_ids)
      console.log(`  Group ${group.group_index} (${group.range_label}): ${group.feature_ids.length} ids -> Set size ${featureIds.size}`)
    } else if (group.feature_ids_by_source) {
      // Consistency metric: flatten feature_ids_by_source
      const allIds = Object.values(group.feature_ids_by_source).flat()
      const uniqueBefore = new Set(allIds)
      featureIds = new Set(allIds)
      console.log(`  Group ${group.group_index} (${group.range_label}): ${allIds.length} ids (${uniqueBefore.size} unique) -> Set size ${featureIds.size}`)

      // Check for duplicates
      if (allIds.length !== uniqueBefore.size) {
        console.warn(`    WARNING: Duplicates found! ${allIds.length - uniqueBefore.size} duplicate IDs`)
        // Show which sources contribute duplicates
        for (const [source, ids] of Object.entries(group.feature_ids_by_source)) {
          console.log(`      Source "${source}": ${ids.length} ids`)
        }
      }
    } else {
      // Empty group
      featureIds = new Set()
      console.log(`  Group ${group.group_index} (${group.range_label}): EMPTY`)
    }

    // Verify feature_count matches
    if (featureIds.size !== group.feature_count) {
      console.error(`  ERROR: Size mismatch! Set has ${featureIds.size} but feature_count is ${group.feature_count}`)
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
 * This allows users to see the distribution of the metric they'll use for splitting.
 *
 * @param node - SankeyTreeNode to get metrics for
 * @param tree - Full tree map for reference
 * @returns Array of metrics to display in histogram
 */
export function getNodeMetrics(
  node: SankeyTreeNode,
  tree: Map<string, SankeyTreeNode>
): MetricType[] {
  // If node has children, show the metric used for the next stage
  if (node.children.length > 0) {
    // Get first child to determine what metric was used for split
    const firstChild = tree.get(node.children[0])
    if (firstChild?.metric) {
      return [firstChild.metric as MetricType]
    }
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
  while (currentNode && currentNode.depth > 0) {
    if (currentNode.metric && currentNode.rangeLabel) {
      constraints.unshift({
        metric: currentNode.metric,
        rangeLabel: currentNode.rangeLabel
      })
    }
    currentNode = currentNode.parentId ? tree.get(currentNode.parentId) : undefined
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
