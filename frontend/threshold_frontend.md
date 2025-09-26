  1. Threshold Type Hierarchy

  Basic Threshold Types (types.ts:17-23)

  interface Thresholds {
    feature_splitting: number    // Stage 1: Cosine similarity threshold
    semdist_mean: number        // Stage 2: Semantic distance threshold
    score_fuzz: number          // Stage 3: Fuzz score threshold
    score_detection: number     // Stage 3: Detection score threshold
    score_simulation: number    // Stage 3: Simulation score threshold
  }

  Hierarchical Threshold Structure (types.ts:25-29)

  interface HierarchicalThresholds {
    global_thresholds: Thresholds                                    // DEFAULT
  VALUES
    score_agreement_groups?: Record<string, Record<string, number>>  //
  PARENT-BASED OVERRIDES
    individual_node_groups?: Record<string, Record<string, number>>  //
  NODE-SPECIFIC OVERRIDES
  }

  2. Three-Level Threshold Hierarchy

  Level 1: Global Thresholds

  - Purpose: Default values for all nodes
  - Initial Values: { feature_splitting: 0.1, semdist_mean: 0.1, score_fuzz: 0.5,
  score_detection: 0.5, score_simulation: 0.2 }
  - Source: store.ts:104-112
  - Usage: Fallback when no specific overrides exist

  Level 2: Score Agreement Groups

  - Purpose: Threshold overrides for score metrics based on parent semantic
  distance node
  - Structure: score_agreement_groups[parentNodeId][scoreMetric] = threshold
  - Key Insight: Score thresholds are grouped by their semantic distance parent
  - Logic: All score agreement nodes under the same semantic distance parent share
  threshold settings
  - Source: store.ts:214-230

  Level 3: Individual Node Groups

  - Purpose: Node-specific threshold overrides for non-score metrics
  - Structure: individual_node_groups[nodeKey][metric] = threshold
  - Key Format: Node keys are prefixed with node_ (e.g.,
  node_split_true_semdist_high)
  - Usage: Granular control for specific nodes
  - Source: store.ts:232-250

  3. Threshold Resolution Algorithm (HistogramPopover.tsx:356-398)

  The frontend uses a sophisticated fallback hierarchy to resolve threshold values:

  function getEffectiveThreshold(metric: string): number {
    // 1. Check if it's a score metric
    const isScoreMetric = metric.startsWith('score_')

    if (parentNodeId) {
      if (isScoreMetric) {
        // 2a. Check score_agreement_groups first
        if
  (hierarchicalThresholds.score_agreement_groups?.[parentNodeId]?.[metric]) {
          return
  hierarchicalThresholds.score_agreement_groups[parentNodeId][metric]
        }
      } else {
        // 2b. Check individual_node_groups for non-score metrics
        const nodeKey = `node_${parentNodeId}`
        if (hierarchicalThresholds.individual_node_groups?.[nodeKey]?.[metric]) {
          return hierarchicalThresholds.individual_node_groups[nodeKey][metric]
        }
      }
    }

    // 3. Fallback to global thresholds
    if (hierarchicalThresholds.global_thresholds[metric]) {
      return hierarchicalThresholds.global_thresholds[metric]
    }

    // 4. Final fallback to histogram mean
    return histogramData[metric].statistics.mean
  }

  4. Threshold-to-Visualization Flow

  Stage 1: Feature Splitting (SankeyDiagram.tsx:36-37)

  - Node Type: feature_splitting category
  - Threshold: feature_splitting value (cosine similarity)
  - Purpose: Binary classification of features as True/False
  - UI: Single histogram with draggable threshold line

  Stage 2: Semantic Distance (SankeyDiagram.tsx:39-40)

  - Node Type: semantic_distance category
  - Threshold: semdist_mean value
  - Purpose: Classify into High/Low semantic distance
  - UI: Single histogram with draggable threshold line

  Stage 3: Score Agreement (SankeyDiagram.tsx:42-43)

  - Node Type: score_agreement category
  - Thresholds: score_detection, score_fuzz, score_simulation
  - Purpose: Multi-threshold classification into 4 categories:
    - All 3 High (all scores ≥ threshold)
    - 2 of 3 High (exactly 2 scores ≥ threshold)
    - 1 of 3 High (exactly 1 score ≥ threshold)
    - All 3 Low (all scores < threshold)
  - UI: Three stacked histograms with individual threshold controls

  5. Parent-Child Threshold Relationships

  Critical Logic: Score Agreement Grouping (SankeyDiagram.tsx:410-423)

  if (isScoreAgreementNode(node.id)) {
    // For score metrics, use semantic distance parent for grouping
    const semanticParent = getParentNodeId(node.id)  // extract
  "split_true_semdist_high"
    parentNodeId = semanticParent
    parentNodeName = getParentNodeName(semanticParent, allNodes)
  }

  Key Insight: Score agreement nodes inherit threshold grouping from their semantic
   distance parent, not their direct node ID. This means:
  - split_true_semdist_high_agree_all3high
  - split_true_semdist_high_agree_2of3high
  - split_true_semdist_high_agree_1of3high
  - split_true_semdist_high_agree_all3low

  All share thresholds because they have the same semantic parent:
  split_true_semdist_high

  6. Interactive Threshold Manipulation

  Slider Interaction (HistogramPopover.tsx:444-453)

  const handleSliderMouseDown = (event: React.MouseEvent) => {
    setIsDraggingSlider(true)
    draggingMetricRef.current = metric
    draggingChartRef.current = chart

    // Calculate threshold from mouse position
    const newValue = calculateThresholdFromEvent(event)
    if (newValue !== null) handleThresholdChange(newValue)
  }

  Threshold Update Flow (HistogramPopover.tsx:430-435)

  const handleThresholdChange = (newThreshold: number) => {
    const clampedThreshold = Math.max(min, Math.min(max, newThreshold))
    const panel = popoverData?.panel || 'left'
    setHierarchicalThresholds({ [metric]: clampedThreshold }, parentNodeId, panel)
  }

  7. Visual Threshold Indicators

  Histogram Bars (HistogramPopover.tsx:478-480)

  const barColor = bin.x0 >= threshold ?
    HISTOGRAM_COLORS.threshold :  // Green for above threshold
    HISTOGRAM_COLORS.bars         // Gray for below threshold

  Threshold Line (d3-utils.ts:266-277)

  - Purpose: Visual indicator showing current threshold position
  - Color: #10b981 (green)
  - Interaction: Draggable for real-time adjustment
  - Position: Calculated using D3 linear scale

  8. State Management Integration

  Dual Panel Support (store.ts:171-193)

  The store supports independent threshold management for left and right panels:
  setHierarchicalThresholds: (thresholds, parentNodeId, panel = 'left') => {
    const panelKey = panel === 'left' ? 'leftPanel' : 'rightPanel'
    // Update thresholds for specific panel
  }

  Automatic Threshold Updates (store.ts:428-444)

  When histogram data is fetched, thresholds can be automatically updated to
  histogram means:
  // Update global thresholds with mean values from histogram data
  const newThresholds: Partial<Thresholds> = {}
  for (const metric of metrics) {
    if (data.statistics.mean !== undefined) {
      newThresholds[metric] = data.statistics.mean
    }
  }

  Key Architectural Insights

  1. Three-Tier Hierarchy: Global → Group → Individual provides flexible threshold
  management
  2. Metric-Specific Grouping: Score metrics vs. non-score metrics use different
  grouping strategies
  3. Parent-Based Inheritance: Score nodes inherit from semantic distance parents,
  enabling logical threshold sharing
  4. Real-Time Updates: Dragging sliders immediately updates thresholds and
  re-renders visualizations
  5. Panel Independence: Left and right panels maintain separate threshold states
  for comparison
  6. Visual Feedback: Color-coded histograms and threshold lines provide immediate
  visual feedback
  7. Fallback Strategy: Robust hierarchy ensures thresholds always resolve to valid
   values

  The system is highly sophisticated, supporting complex hierarchical threshold
  management while maintaining an intuitive user interface through draggable
  histogram interactions.