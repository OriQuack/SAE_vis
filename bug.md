Sankey System Architecture Analysis

  System Overview: Tree-Based Sankey with Feature Group Caching

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                          SANKEY SYSTEM ARCHITECTURE                          │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                        USER INTERACTION LAYER                       │    │
  │  │                                                                      │    │
  │  │  [Click Node] → [Select Metric] → [Drag Threshold Slider]          │    │
  │  │       ↓               ↓                      ↓                       │    │
  │  │  Show Histogram   Add Stage          Update Thresholds              │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                         STORE ACTIONS LAYER                         │    │
  │  │                       (sankey-actions.ts)                           │    │
  │  │                                                                      │    │
  │  │  • initializeSankeyTree()     - Create root node                   │    │
  │  │  • loadRootFeatures()          - Fetch all features from backend   │    │
  │  │  • addUnsplitStageToNode()     - Add stage with empty thresholds   │    │
  │  │  • updateNodeThresholds()      - Update thresholds + rebuild tree  │    │
  │  │  • removeNodeStage()           - Remove stage and descendants      │    │
  │  │  • recomputeSankeyTree()       - Convert tree to D3 format         │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                      TREE DATA STRUCTURE                            │    │
  │  │                 Map<string, SankeyTreeNode>                         │    │
  │  │                                                                      │    │
  │  │  SankeyTreeNode:                                                    │    │
  │  │    - id: string                    - featureIds: Set<number>       │    │
  │  │    - parentId: string | null       - featureCount: number          │    │
  │  │    - metric: string | null         - rangeLabel: string            │    │
  │  │    - thresholds: number[]          - children: string[]            │    │
  │  │    - depth: number                                                  │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                    FEATURE GROUP CACHING                            │    │
  │  │                  cachedGroups: Record<string, FeatureGroup[]>      │    │
  │  │                                                                      │    │
  │  │  Cache Key Format: "metric:threshold1,threshold2,..."              │    │
  │  │  Example: "score_embedding:0.3,0.7"                                │    │
  │  │                                                                      │    │
  │  │  Benefits:                                                          │    │
  │  │    ✓ Instant threshold updates (no backend call)                   │    │
  │  │    ✓ Efficient tree rebuilding                                     │    │
  │  │    ✓ Reduced API load                                              │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                         BACKEND API LAYER                           │    │
  │  │                  POST /api/feature-groups                           │    │
  │  │                                                                      │    │
  │  │  Request:  { filters, metric, thresholds }                         │    │
  │  │  Response: { groups: [{featureIds, rangeLabel, count}] }          │    │
  │  │                                                                      │    │
  │  │  Backend Logic: Simple feature grouping (N thresholds → N+1 groups)│    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                    D3 VISUALIZATION LAYER                           │    │
  │  │                 (d3-sankey-utils.ts)                                │    │
  │  │                                                                      │    │
  │  │  • calculateSankeyLayout()     - D3 layout calculation             │    │
  │  │  • stageBasedAlign()           - Node alignment by stage           │    │
  │  │  • smartNodeSort()             - Sort nodes within stage           │    │
  │  │  • calculateStageLabels()      - Stage label positioning           │    │
  │  │  • applyRightToLeftTransform() - Mirror for right panel            │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  │                                   ↓                                          │
  │  ┌────────────────────────────────────────────────────────────────────┐    │
  │  │                     REACT RENDERING LAYER                           │    │
  │  │              (SankeyDiagram.tsx, SankeyOverlay.tsx)                │    │
  │  │                                                                      │    │
  │  │  • SankeyNode           - Node rectangles + labels                 │    │
  │  │  • SankeyLink           - Flow paths                               │    │
  │  │  • SankeyNodeHistogram  - Histogram bars on nodes                  │    │
  │  │  • NodeThresholdSliders - Draggable threshold handles              │    │
  │  │  • NodeButtons          - Add/Remove stage buttons                 │    │
  │  │  • MetricOverlayPanel   - Initial metric selection                 │    │
  │  └────────────────────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────────────────────┘

  Detailed Flow Diagrams

  1. Initial Tree Creation Flow

  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 1: Initialize Sankey Tree                                 │
  ├────────────────────────────────────────────────────────────────┤
  │ initializeSankeyTree(panel)                                    │
  │   ↓                                                             │
  │ Create root node:                                              │
  │   {                                                             │
  │     id: 'root',                                                 │
  │     parentId: null,                                             │
  │     metric: null,                                               │
  │     thresholds: [],                                             │
  │     depth: 0,                                                   │
  │     children: [],                                               │
  │     featureIds: new Set(),      ← Empty initially              │
  │     featureCount: 0,                                            │
  │     rangeLabel: 'All Features'                                  │
  │   }                                                             │
  │   ↓                                                             │
  │ Store in sankeyTree: Map([['root', rootNode]])                 │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 2: Load Root Features                                     │
  ├────────────────────────────────────────────────────────────────┤
  │ loadRootFeatures(panel)                                        │
  │   ↓                                                             │
  │ API Call: getFeatureGroups({                                   │
  │   filters,                                                      │
  │   metric: 'root',                                               │
  │   thresholds: []         ← Empty = get all features            │
  │ })                                                              │
  │   ↓                                                             │
  │ Response: { groups: [{featureIds: [1,2,3,...], count: 1648}]} │
  │   ↓                                                             │
  │ Update root node:                                               │
  │   rootNode.featureIds = Set(response.groups[0].featureIds)    │
  │   rootNode.featureCount = response.groups[0].count            │
  │   ↓                                                             │
  │ recomputeSankeyTree(panel)                                     │
  │   ↓                                                             │
  │ Tree-based system now active!                                   │
  └────────────────────────────────────────────────────────────────┘

  2. Adding a Stage Flow

  ┌──────────────────────────────────────────────────────────────────┐
  │ USER ACTION: Click "+" button on node → Select metric from menu │
  └──────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 1: Add Unsplit Stage                                      │
  ├────────────────────────────────────────────────────────────────┤
  │ addUnsplitStageToNode(nodeId, metric, panel)                  │
  │   ↓                                                             │
  │ Get parent node from tree                                       │
  │   ↓                                                             │
  │ Create single child node:                                       │
  │   {                                                             │
  │     id: `${nodeId}_stage${newDepth}_group0`,                   │
  │     parentId: nodeId,                                           │
  │     metric: null,              ← No metric on child            │
  │     thresholds: [],            ← Empty = unsplit               │
  │     depth: parentDepth + 1,                                     │
  │     children: [],                                               │
  │     featureIds: new Set(parent.featureIds), ← COPY all         │
  │     featureCount: parent.featureCount,                          │
  │     rangeLabel: 'All'                                           │
  │   }                                                             │
  │   ↓                                                             │
  │ Update parent node:                                             │
  │   parent.metric = metric       ← Set metric on PARENT          │
  │   parent.thresholds = []       ← Empty = unsplit state         │
  │   parent.children = [childId]                                   │
  │   ↓                                                             │
  │ Fetch histogram data for metric (for node overlay viz)         │
  │   ↓                                                             │
  │ recomputeSankeyTree(panel)                                     │
  │   ↓                                                             │
  │ RESULT: Single unsplit child node appears                      │
  │         User can now drag sliders to set thresholds            │
  └────────────────────────────────────────────────────────────────┘

  3. Updating Thresholds Flow (COMPLEX - POTENTIAL BUGS HERE)

  ┌──────────────────────────────────────────────────────────────────┐
  │ USER ACTION: Drag threshold slider on node                       │
  └──────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 1: Check Cache for Feature Groups                         │
  ├────────────────────────────────────────────────────────────────┤
  │ updateNodeThresholds(nodeId, newThresholds, panel)            │
  │   ↓                                                             │
  │ Get node from tree                                              │
  │ Get metric from node                                            │
  │   ↓                                                             │
  │ Create cache key: `${metric}:${thresholds.join(',')}`         │
  │ Example: "score_embedding:0.3,0.7"                            │
  │   ↓                                                             │
  │ Check cache:                                                    │
  │   if (cachedGroups[cacheKey]) {                                │
  │     groups = cachedGroups[cacheKey]  ← INSTANT! No API call   │
  │   } else {                                                      │
  │     API Call: getFeatureGroups({filters, metric, thresholds}) │
  │     Cache response: cachedGroups[cacheKey] = groups           │
  │   }                                                             │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 2: Collect Subtree Structure (BEFORE modifications)       │
  ├────────────────────────────────────────────────────────────────┤
  │ collectSubtreeStructure(tree, nodeId)                          │
  │   ↓                                                             │
  │ Recursively collect all descendants:                            │
  │   SubtreeSplitState {                                           │
  │     nodeId, metric, thresholds,                                 │
  │     featureIds: Set<number>,                                    │
  │     rangeLabel,                                                 │
  │     children: SubtreeSplitState[]  ← Recursive!                │
  │   }                                                             │
  │   ↓                                                             │
  │ IMPORTANT: This captures the ENTIRE subtree structure          │
  │            BEFORE any modifications                             │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 3: Delete All Descendants                                 │
  ├────────────────────────────────────────────────────────────────┤
  │ deleteDescendants(nodeId)                                      │
  │   ↓                                                             │
  │ Recursively delete all child nodes from tree                   │
  │ Clear node.children array                                       │
  │   ↓                                                             │
  │ ⚠️  DANGER ZONE: Tree is now in inconsistent state            │
  │                  (parent has no children but subtree was       │
  │                   captured above)                               │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 4: Rebuild Children with New Groups                       │
  ├────────────────────────────────────────────────────────────────┤
  │ For each group in newGroups:                                   │
  │   ↓                                                             │
  │ Calculate intersected features:                                 │
  │   if (node.id === 'root' || node.featureCount === 0) {        │
  │     intersectedFeatures = group.featureIds  ← Use all          │
  │   } else {                                                      │
  │     intersectedFeatures = node.featureIds ∩ group.featureIds  │
  │     ← INTERSECTION ALGORITHM                                    │
  │   }                                                             │
  │   ↓                                                             │
  │ Create child node:                                              │
  │   {                                                             │
  │     id: `${nodeId}_stage${depth+1}_group${index}`,            │
  │     parentId: nodeId,                                           │
  │     metric: null,              ← No metric initially           │
  │     thresholds: [],                                             │
  │     depth: node.depth + 1,                                      │
  │     children: [],                                               │
  │     featureIds: intersectedFeatures,                            │
  │     featureCount: intersectedFeatures.size,                     │
  │     rangeLabel: group.rangeLabel                                │
  │   }                                                             │
  │   ↓                                                             │
  │ Add to tree and parent.children                                 │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 5: Match with Old Subtree and Rebuild Recursively         │
  ├────────────────────────────────────────────────────────────────┤
  │ For each new child:                                             │
  │   ↓                                                             │
  │ Find best matching old child by FEATURE OVERLAP:               │
  │   bestMatch = null                                              │
  │   bestOverlap = 0                                               │
  │   for each oldChild in subtreeStructure:                        │
  │     overlap = |newChild.featureIds ∩ oldChild.featureIds|     │
  │     if (overlap > bestOverlap):                                 │
  │       bestOverlap = overlap                                     │
  │       bestMatch = oldChild                                      │
  │   ↓                                                             │
  │ ⚠️  BUG RISK: If multiple old children have similar overlaps, │
  │              we might match the wrong one!                      │
  │   ↓                                                             │
  │ If bestMatch found AND has metric AND overlap > 0:             │
  │   ↓                                                             │
  │   Get cached groups for child's metric+thresholds              │
  │   Set child.metric = bestMatch.metric                          │
  │   Set child.thresholds = bestMatch.thresholds                  │
  │   ↓                                                             │
  │   Recursively rebuild: rebuildNodeAndDescendants(              │
  │     tree, childId, childGroups, bestMatch.children             │
  │   )  ← Pass old grandchildren for matching                     │
  │   ↓                                                             │
  │   Check if rebuilt child has ≤1 children:                      │
  │     if (child.children.length <= 1 && child.thresholds.length > 0): │
  │       child.thresholds = []  ← Reset "boundary thresholds"     │
  │       ⚠️  BUG RISK: Might incorrectly reset legitimate        │
  │                     single-child splits!                        │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 6: Refresh Histogram Data for Rebuilt Nodes               │
  ├────────────────────────────────────────────────────────────────┤
  │ For each node that was rebuilt with a metric:                  │
  │   fetchHistogramData(metric, nodeId, panel)                    │
  │   ↓                                                             │
  │ This ensures slider positioning is correct after parent        │
  │ threshold changes                                               │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 7: Recompute Sankey for Rendering                         │
  ├────────────────────────────────────────────────────────────────┤
  │ recomputeSankeyTree(panel)                                     │
  │   ↓                                                             │
  │ convertTreeToSankeyStructure(sankeyTree)                       │
  │   ↓                                                             │
  │ Update computedSankey in store                                  │
  │   ↓                                                             │
  │ RESULT: Sankey diagram updates with new structure               │
  └────────────────────────────────────────────────────────────────┘

  4. D3 Layout Calculation Flow

  ┌────────────────────────────────────────────────────────────────┐
  │ INPUT: computedSankey = { nodes: [], links: [] }              │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 1: Filter and Transform Nodes                             │
  ├────────────────────────────────────────────────────────────────┤
  │ calculateSankeyLayout(sankeyData, width, height, margin)      │
  │   ↓                                                             │
  │ Build referencedNodeIds Set from links                         │
  │   ↓                                                             │
  │ Filter nodes:                                                   │
  │   - Keep if referenced in links OR feature_count > 0           │
  │   ↓                                                             │
  │ Create nodeIdMap for quick index lookup                        │
  │   ↓                                                             │
  │ Transform links: Convert string IDs to array indices           │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 2: Build Parent-Child Relationships                       │
  ├────────────────────────────────────────────────────────────────┤
  │ Create nodeMap: Map<string, D3SankeyNode>                     │
  │ Create childToParentMap: Map<string, string>                  │
  │   ↓                                                             │
  │ For each link:                                                  │
  │   childToParentMap.set(targetId, sourceId)                     │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 3: Sort Nodes (CRITICAL FOR VISUAL ORDERING)              │
  ├────────────────────────────────────────────────────────────────┤
  │ smartNodeSort(a, b):                                           │
  │   ↓                                                             │
  │ 1. Sort by stage (depth) first                                 │
  │   if (a.stage !== b.stage): return a.stage - b.stage          │
  │   ↓                                                             │
  │ 2. Within same stage, get parent IDs:                          │
  │   parentA = childToParentMap.get(a.id) || extractParentId(a.id) │
  │   parentB = childToParentMap.get(b.id) || extractParentId(b.id) │
  │   ↓                                                             │
  │ 3. If different parents, sort by parent's Y position:          │
  │   if (parentA !== parentB):                                     │
  │     return parentNodeA.y0 - parentNodeB.y0                     │
  │   ↓                                                             │
  │ 4. Same parent: Apply category-specific sorting                │
  │   getCategorySortOrder(nodeId, category)                       │
  │   ↓                                                             │
  │ 5. Fallback: original index order                              │
  │   ↓                                                             │
  │ ⚠️  BUG RISK: Y positions used for sorting might not be set   │
  │              yet during first layout pass!                      │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 4: D3 Sankey Layout Generation                            │
  ├────────────────────────────────────────────────────────────────┤
  │ sankeyGenerator = sankey()                                     │
  │   .nodeWidth(15)                                                │
  │   .nodePadding(10)                                              │
  │   .extent([[1, 1], [width - 1, height - 1]])                  │
  │   .nodeAlign(stageBasedAlign)  ← Align by stage number        │
  │   .nodeSort(smartNodeSort)      ← Custom sort function        │
  │   .linkSort(linkSort)           ← Sort links by node index    │
  │   ↓                                                             │
  │ sankeyLayout = sankeyGenerator({ nodes, links })               │
  │   ↓                                                             │
  │ D3 calculates node positions (x0, x1, y0, y1) and link paths  │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ STEP 5: Special Case Handling                                  │
  ├────────────────────────────────────────────────────────────────┤
  │ Expand vertical bar nodes (3x width):                          │
  │   if (node.node_type === 'vertical_bar'):                      │
  │     node.x1 = node.x0 + (nodeWidth * 6)                        │
  │   ↓                                                             │
  │ Handle 1-node case (root only):                                │
  │   Position single node on left with 200px height               │
  │   ↓                                                             │
  │ Handle 2-node case (root + vertical_bar):                      │
  │   Position root on left, vertical bar on right                 │
  └────────────────────────────────────────────────────────────────┘
                            ↓
  ┌────────────────────────────────────────────────────────────────┐
  │ OUTPUT: SankeyLayout { nodes, links, width, height, margin }  │
  └────────────────────────────────────────────────────────────────┘

  Identified Bugs and Issues

  🐛 Bug 1: Unsafe Subtree Matching by Feature Overlap (sankey-actions.ts:334-345)

  Location: updateNodeThresholds() → rebuildNodeAndDescendants() → Best match finding

  Issue:
  // Find best matching old child by feature overlap (not by index!)
  let bestMatch: SubtreeSplitState | null = null
  let bestOverlap = 0

  for (const oldChild of subtreeStructure) {
    const overlap = [...intersectedFeatures].filter(id => oldChild.featureIds.has(id)).length
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestMatch = oldChild
    }
  }

  Problem: If multiple old children have similar feature overlaps (e.g., 45 vs 47 features), the
  algorithm picks the first one with highest overlap, which might not be the correct match
  semantically. This can lead to:
  - Wrong metrics being applied to nodes
  - Incorrect threshold values being restored
  - Subtree structure being attached to wrong parent

  Example Scenario:
  Old structure:
    Node A (50 features, metric: embedding) → splits into:
      - Child 1 (25 features, range: < 0.5, metric: fuzz)
      - Child 2 (25 features, range: ≥ 0.5, metric: detection)

  After parent threshold change:
    Node A (48 features) → splits into:
      - New Child 1 (24 features, range: < 0.5)
      - New Child 2 (24 features, range: ≥ 0.5)

  Feature overlap:
    - New Child 1 overlaps 23 features with Old Child 1
    - New Child 1 overlaps 22 features with Old Child 2

    → Correctly matches Old Child 1

  BUT if overlaps are:
    - New Child 1 overlaps 20 features with Old Child 1
    - New Child 1 overlaps 21 features with Old Child 2

    → INCORRECTLY matches Old Child 2 (fuzz metric gets detection subtree!)

  Fix Suggestion: Add additional matching criteria beyond overlap count:
  1. Check if range labels match (e.g., "< 0.5" vs "≥ 0.5")
  2. Check if old child's metric is compatible with new parent's splits
  3. Prefer matches where old child was at same group index


  🐛 Bug 3: Histogram Fetch Errors Silently Suppressed (sankey-actions.ts:169-175)

  Location: addUnsplitStageToNode() → Histogram data fetch

  Issue:
  try {
    await state.fetchHistogramData(metric as MetricType, nodeId, panel)
    console.log(`[Store.addUnsplitStageToNode] ✅ Histogram data fetched...`)
  } catch (error) {
    console.warn(`[Store.addUnsplitStageToNode] ⚠️ Failed to fetch histogram data:`, error)
    // Don't fail the entire operation if histogram fetch fails
  }

  Problem: If histogram fetch fails, the operation continues silently. This leads to:
  - No histogram bars displayed on node
  - Threshold sliders unusable (no min/max values)
  - User has no indication anything went wrong
  - Node appears "broken" but no error shown

  Fix Suggestion: Show user-visible warning or retry mechanism

  🐛 Bug 4: Stage Label Category Assumption (d3-sankey-utils.ts:486-506)

  Location: calculateStageLabels() → Label text calculation

  Issue:
  nodesByStage.forEach((nodes, stage) => {
    if (nodes.length === 0) return

    let label: string

    if (stage === 0) {
      // Stage 0 (root): always use category display name
      const category = nodes[0].category  ← Assumes nodes[0] exists
      label = CATEGORY_DISPLAY_NAMES[category] || category
    } else {
      // Other stages: use category display name (derived from parent metric)
      const category = nodes[0].category  ← Assumes all nodes have same category!
      label = CATEGORY_DISPLAY_NAMES[category] || category
    }
    // ...
  })

  Problem: Code assumes all nodes in a stage have the same category. With tree-based system
  allowing different nodes at same depth to have different metrics, this breaks.

  Example:
  Stage 2 nodes:
    - Node A (category: feature_splitting, from parent with metric: feature_splitting)
    - Node B (category: score_agreement, from different parent with metric: detection)

  Label shows: nodes[0].category = "feature_splitting"
  → But Node B should show "score_agreement"!

  Fix Suggestion: Calculate per-node labels or group by category within stage


  Architecture Strengths

  ✅ Feature Group Caching: Excellent performance optimization✅ Set Intersection Algorithm:
  Efficient O(min(|A|, |B|)) complexity✅ Tree-Based Structure: Flexible, supports branching✅
  Separation of Concerns: Clear separation between store, D3 utils, and React components✅ Type 
  Safety: Comprehensive TypeScript types

  Architecture Weaknesses

  ❌ Complex State Management: Tree modifications during iteration create fragile state❌ Implicit 
  Assumptions: Code assumes nodes behave consistently (e.g., same category in stage)❌ Error 
  Handling: Silent failures in several places (histogram fetch, subtree matching)❌ User Feedback:
  Unclear visual states (unsplit vs split with boundary thresholds)❌ Tightly Coupled: Subtree
  preservation logic deeply coupled to feature overlap heuristic

  This analysis should give you a comprehensive understanding of the Sankey logic, its data flow,
  and the bugs present in the current implementation.