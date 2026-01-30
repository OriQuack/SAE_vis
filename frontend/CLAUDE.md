# Frontend CLAUDE.md - SAE Feature Visualization React Application

Professional guidance for the React frontend of the SAE Feature Visualization research prototype.

## Frontend Architecture Overview

**Purpose**: Interactive visualization interface for exploring SAE feature explanation reliability
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: Smart tree-based Sankey building with frontend-side set intersection + SVM-based similarity scoring + Query by Committee (QBC) active learning

## Important Development Principles

### This is a Conference Prototype
- **Avoid over-engineering**: Use straightforward React patterns suitable for research demonstrations
- **Simple solutions first**: Don't add complex state management, optimization, or abstraction unless clearly needed
- **Research-focused**: Prioritize easy modification and exploration over production patterns
- **Demo reliability**: Code should work reliably for demonstrations

### Code Quality Guidelines

**Before Making Changes:**
1. **Search existing code**: Use Grep to find similar components or utilities before creating new ones
2. **Check lib/ directory**: Many D3 utilities and helpers already exist - reuse or extend them
3. **Review store/**: Understand existing state management patterns before adding new state
4. **Ask about patterns**: If implementing something that feels common, check if it exists first

**After Making Changes:**
1. **Remove dead code**: Delete unused components, functions, and imports
2. **Clean up styles**: Remove unused CSS classes, especially in component-specific CSS files
3. **Update types**: Keep types.ts synchronized with your changes
4. **Run linter**: `npm run lint` to catch errors and warnings

## Core Architecture

### Tree-Based Sankey Building
Instead of backend computing the entire tree, frontend builds it dynamically:

```typescript
// Backend sends simple groups, frontend builds tree
Backend: {groups: [{feature_ids, range_label}]}
Frontend: Tree Building with Set Intersection

// Cache feature groups globally
featureGroupCache["semdist_mean:0.3,0.7"] = response.groups

// Build Sankey tree using set intersection
function buildChildNodes(parent: SankeyTreeNode, groups: FeatureGroup[]) {
  for (const group of groups) {
    const childFeatures = intersection(parent.featureIds, group.feature_ids)
    if (childFeatures.size > 0) {
      createChildNode(parent, childFeatures, group.range_label)
    }
  }
}
```

**Performance Benefits**:
- **Cache Hit**: Instant tree rebuild (no backend call)
- **Cache Miss**: ~50ms for new feature groups
- **Set Intersection**: O(min(|A|,|B|)) complexity
- **Threshold Changes**: Local recomputation only

### Zustand State Management (Modularized)
```
store/
├── index.ts                          # Main store composition
├── sankey-actions.ts                 # Sankey tree operations
├── feature-split-actions.ts          # Stage 1: Pair mode (clustering, similarity)
├── quality-actions.ts                # Stage 2: Feature mode (quality assessment)
├── cause-actions.ts                  # Stage 3: Cause mode (multi-class classification)
├── common-actions.ts                 # Shared operations
├── activation-actions.ts             # Activation data loading
└── utils.ts                          # Store helper functions
```

## 4-Stage Tagging Workflow

The application implements a 4-stage workflow for tagging features:

| Stage | Component | Mode | Items | Tags |
|-------|-----------|------|-------|------|
| 1. Feature Splitting | `FeatureSplitView.tsx` | `pair` | Feature pairs | Fragmented / Monosemantic |
| 2. Quality Assessment | `QualityView.tsx` | `feature` | Individual features | Well-Explained / Need Revision |
| 3. Root Cause Analysis | `CauseView.tsx` | `cause` | Individual features | Pattern Miss / Context Miss / Noisy Activation |
| 4. Summary | `RegenerationView.tsx` | summary | Overview | Manual vs Auto breakdown |

### Stage 3: Root Cause Analysis (CauseView)
- **RadViz Scatter**: Softmax-weighted 2D positioning using SVM decision scores toward 3 category anchors
- **Metrics**: intra_feature_sim, score_embedding, score_fuzz, score_detection, explanation_semantic_sim, frac_nonzero
- **Initial State**: All features start as "unsure" (no pre-assignment)
- **Manual Tagging**: Click features to assign cause categories (Pattern Miss / Context Miss / Noisy Activation)
- **SVM Classification**: After tagging 2+ features per category, SVM predicts remaining
- **Query by Committee (QBC)**: RF + MLP trained alongside SVM; vote entropy identifies disagreement cases
- **Decision Flip Rate**: Tracks prediction stability across tagging iterations (ConvergenceIndicator)
- **Decision Margin Histogram**: CauseMarginHistogram shows SVM confidence with filtering support and batch tagging
- **Contour Visualization**: Density contours show predicted category distributions on RadViz
- **Bootstrap → Learn → Apply**: StageAccordionList guides users through active learning workflow
- **Representative Sampling**: Cold start with diversity-based feature sampling

### Stage 4: Summary (RegenerationView)
- **OverviewSummary**: Shows manual vs auto tagging breakdown per tag across all stages
- **SankeyDiagram**: Final flow visualization with all stages
- **Tag Statistics**: Counts of manually tagged vs auto-tagged items per category

### Shared Components Across Stages
Both Stage 1 and Stage 2 share the same layout pattern:
- **SelectionPanel** (left): Selection state bar + commit history
- **ThresholdTaggingPanel** (bottom): Histogram + boundary lists
- **DecisionMarginHistogram**: SVM decision margin histogram with threshold handles

## Project Structure

```
frontend/src/
├── components/                    # React Components (30 files)
│   ├── App.tsx                   # Main application + stage routing (NOT in components/)
│   ├── AppHeader.tsx             # Header with logo
│   ├── SankeyDiagram.tsx         # Sankey visualization with inline histograms
│   ├── SankeyOverlay.tsx         # Stage addition interface
│   ├── SankeyToSelectionFlowOverlay.tsx # Flow visualization overlay
│   ├── FeatureSplitView.tsx      # Stage 1: Feature splitting
│   ├── FeatureSplitPairViewer.tsx # Pair viewer for Stage 1
│   ├── QualityView.tsx           # Stage 2: Quality assessment
│   ├── CauseView.tsx             # Stage 3: Root cause analysis
│   ├── CauseRadViz.tsx           # RadViz scatter plot for cause categories (Stage 3)
│   ├── CauseMarginHistogram.tsx  # Decision margin histogram for Stage 3
│   ├── StageAccordionList.tsx    # Bootstrap → Learn → Apply workflow
│   ├── BatchTaggingPanel.tsx     # Batch tagging operations panel
│   ├── ParallelCoordinates.tsx   # Parallel coordinates visualization
│   ├── ConvergenceIndicator.tsx  # Decision Flip Rate sparkline
│   ├── SelectionPanel.tsx        # Unified selection panel
│   ├── SelectionBar.tsx          # Selection state bar
│   ├── TagStagePanel.tsx         # Stage navigation
│   ├── ThresholdTaggingPanel.tsx # Bottom tagging panel (pair/feature)
│   ├── DecisionMarginHistogram.tsx # SVM decision margin histogram
│   ├── ThresholdHandles.tsx      # Draggable threshold handles
│   ├── ScrollableItemList.tsx    # Scrollable item list
│   ├── ActivationExamplePanel.tsx # Activation display panel
│   ├── ExplanationPanel.tsx      # Explanation text with highlights
│   ├── ConsensusSection.tsx      # Consensus phrase clustering display
│   ├── Indicators.tsx            # TagBadge, MetricBar, QBC vote indicators
│   ├── Tooltip.tsx               # Reusable tooltip with composition pattern
│   ├── ExplainerComparisonGrid.tsx # Cross-explainer comparison
│   ├── FlowPanel.tsx             # Flow panel for stage transitions
│   ├── RegenerationView.tsx      # Stage 4: Summary overview
│   └── OverviewSummary.tsx       # Stage 4: Manual vs auto tagging breakdown
├── lib/                          # Utilities (21 files + 10 tagging hooks)
│   ├── constants.ts              # App constants, tag categories, metrics
│   ├── sankey-utils.ts           # Sankey layout calculations
│   ├── sankey-builder.ts         # Tree building logic
│   ├── sankey-stages.ts          # Stage configuration
│   ├── sankey-histogram-utils.ts # Inline histograms
│   ├── sankey-selection-flow-utils.ts # Flow overlay calculations
│   ├── histogram-utils.ts        # Histogram processing
│   ├── threshold-utils.ts        # Threshold path handling
│   ├── flow-utils.ts             # Flow panel utilities
│   ├── table-data-utils.ts       # Table data processing
│   ├── tag-system.ts             # Tag colors/labels
│   ├── hierarchical-colors.ts    # CIELAB color assignment
│   ├── circle-encoding-utils.ts  # Circle encoding for scores
│   ├── modality-utils.ts         # Modality detection helpers
│   ├── explainer-grid-utils.ts   # Explainer comparison grid
│   ├── activation-utils.ts       # Activation processing
│   ├── pairUtils.ts              # Pair key utilities
│   ├── cause-tagging-utils.ts    # Cause category metric calculations
│   ├── cause-visualization-utils.ts  # Cause scales, contours, colors
│   ├── radviz-utils.ts           # RadViz positioning, anchors, scales
│   ├── color-utils.tsx           # Color manipulation utilities
│   ├── triangle-grid.ts          # Triangle grid layout utilities
│   ├── utils.ts                  # General helpers
│   └── tagging-hooks/            # Reusable tagging hooks (10 files)
│       ├── index.ts              # Hook exports
│       ├── useThresholdPreview.ts # Threshold preview state
│       ├── useTaggingStatus.ts   # Tagging status tracking
│       ├── useCommitHistory.ts   # Commit history management
│       ├── useListNavigation.ts  # List navigation state
│       ├── usePaginatedList.ts   # Pagination logic
│       ├── useBoundaryItems.ts   # Boundary item detection
│       ├── useSortableList.ts    # Sortable list logic
│       └── useBimodalStatus.ts   # Bimodal distribution status
├── store/                        # Zustand State (8 files)
│   ├── index.ts                  # Main store composition
│   ├── sankey-actions.ts         # Sankey operations
│   ├── feature-split-actions.ts  # Stage 1 actions
│   ├── quality-actions.ts        # Stage 2 actions
│   ├── cause-actions.ts          # Stage 3 actions
│   ├── common-actions.ts         # Shared actions
│   ├── activation-actions.ts     # Activation loading
│   └── utils.ts                  # Store utilities
├── styles/                       # CSS Files (28 files)
│   ├── base.css                  # Base styles, CSS variables, unified styling
│   ├── index.css                 # Global styles
│   ├── App.css                   # Main app layout
│   ├── SankeyDiagram.css         # Sankey styles
│   ├── SankeyToSelectionFlowOverlay.css # Flow overlay styles
│   ├── FeatureSplitView.css      # Stage 1 styles
│   ├── FeatureSplitPairViewer.css # Pair viewer styles
│   ├── QualityView.css           # Stage 2 styles
│   ├── CauseView.css             # Stage 3 styles
│   ├── CauseRadViz.css           # RadViz scatter styles (Stage 3)
│   ├── CauseMarginHistogram.css  # Stage 3 histogram styles
│   ├── StageAccordionList.css    # Bootstrap/Learn/Apply workflow styles
│   ├── BatchTaggingPanel.css     # Batch tagging panel styles
│   ├── Tooltip.css               # Unified tooltip styles
│   ├── ConvergenceIndicator.css  # Decision Flip Rate sparkline styles
│   ├── SelectionPanel.css        # Selection panel styles
│   ├── SelectionBar.css          # Selection bar styles
│   ├── TagStagePanel.css         # Stage panel styles
│   ├── ThresholdTaggingPanel.css # Bottom panel styles
│   ├── DecisionMarginHistogram.css # Decision margin histogram styles
│   ├── ScrollableItemList.css    # Scrollable list styles
│   ├── ActivationExamplePanel.css # Activation panel styles
│   ├── ConsensusSection.css      # Consensus phrase clustering styles
│   ├── ExplainerComparisonGrid.css # Comparison grid styles
│   ├── FlowPanel.css             # Flow panel styles
│   ├── TagAutomaticPopover.css   # Legacy popover styles
│   ├── AppHeader.css             # Header styles
│   ├── RegenerationView.css      # Stage 4 regeneration styles
│   └── OverviewSummary.css       # Stage 4 summary styles
├── types.ts                      # TypeScript types
├── api.ts                        # API client
└── main.tsx                      # Entry point
```

## Key Components

### Main Views

**App.tsx** (in src/, not components/) - Main Orchestrator
- Health check on startup
- Stage-based view routing
- Layout orchestration based on `activeStageCategory`
- Comparison overlay management

**SankeyDiagram.tsx** - Tree Visualization
- D3-Sankey integration with hierarchical coloring
- Inline histogram rendering
- Node click handling → SankeyOverlay
- Segment-based selection with flow overlay
- Threshold handle integration

**FeatureSplitView.tsx** - Stage 1: Feature Splitting
- Mode: `pair`
- Pair list with hierarchical clustering
- FeatureSplitPairViewer for pair analysis
- DecisionMarginHistogram for histogram-based tagging
- Commit history for state snapshots
- Tags: Fragmented (selected) / Monosemantic (rejected)

**QualityView.tsx** - Stage 2: Quality Assessment
- Mode: `feature`
- Layout mirrors FeatureSplitView
- SelectionPanel (left) + placeholder (top) + ThresholdTaggingPanel (bottom)
- SVM-based similarity scoring for features
- Commit history for state snapshots
- Tags: Well-Explained (selected) / Need Revision (rejected)

**CauseView.tsx** - Stage 3: Root Cause Analysis
- Mode: `cause`
- RadViz scatter plot with softmax-weighted positioning toward category anchors
- CauseMarginHistogram for SVM decision margin visualization with filtering and batch tagging
- Features start as "unsure" (no pre-assignment)
- SVM-based classification after manual tagging
- Query by Committee (QBC) for detecting disagreement cases
- Decision Flip Rate tracking with ConvergenceIndicator
- Tags: Pattern Miss / Context Miss / Noisy Activation
- StageAccordionList for Bootstrap → Learn → Apply workflow
- Cold start with representative sampling

**CauseRadViz.tsx** - RadViz Visualization (Stage 3)
- Canvas-based scatter plot for performance with SVG overlay
- Softmax-weighted positioning: features positioned using `softmax(decision_scores)` as weights toward category anchors
- 3 category anchors arranged in equilateral triangle: Pattern Miss, Context Miss, Noisy Activation
- Density contours per cause category after SVM classification
- Category filtering via legend interaction
- Contour update when predictions change
- Uses radviz-utils.ts for positioning calculations

**CauseMarginHistogram.tsx** - Decision Margin Histogram (Stage 3)
- SVM decision margin histogram with threshold handles
- Category-colored stacked bars (manual vs auto distinction)
- Supports filtering features by histogram bins
- Bin hover interaction with RadViz scatter highlighting

**StageAccordionList.tsx** - Active Learning Workflow
- Bootstrap → Learn → Apply stage progression
- Bootstrap options: Representatives (diversity sampling) or By Score (ascending/descending)
- Learn stage: Review SVM predictions, accept/reject
- Apply stage: Batch apply threshold-based tagging
- Smart pulsing indicators when ready to advance

**ConvergenceIndicator.tsx** - Decision Flip Rate
- Sparkline visualization of flip rate history (sliding window of 10 iterations)
- Stacked bar showing category distribution per iteration
- Reference lines at 10%, 25%, 50% flip rate
- Stage-aware coloring (Stage 1/2: selected/rejected, Stage 3: cause categories)

**RegenerationView.tsx** - Stage 4: Summary
- Layout with SankeyDiagram (left) + OverviewSummary (right)
- Shows final tagging results overview
- Displays Sankey with all completed stages
- Manual vs auto tagging statistics per category

**OverviewSummary.tsx** - Tagging Statistics
- Manual vs auto tagging breakdown per tag
- Aggregates counts across all 3 tagging stages
- Shows fragmented/monosemantic, well-explained/need-revision, cause categories

### Selection & Tagging

**SelectionPanel.tsx** - Unified Selection Interface
- Handles 3 modes: feature, pair, cause
- Selection state bar with 4 categories
- Commit history circles
- Auto-tagging preview integration

**SelectionBar.tsx** - Selection State Visualization
- Vertical/horizontal stacked bar
- 4 categories: confirmed, expanded, rejected, unsure
- Preview state with stripe pattern overlay
- Interactive category filtering

**TagStagePanel.tsx** - Tag Stage Management
- 3-stage workflow navigation
- Stage activation and completion tracking

**ThresholdTaggingPanel.tsx** - Bottom Panel for Tagging
- Supports both `pair` and `feature` modes
- Contains: DecisionMarginHistogram + buttons + boundary lists
- Mode-specific labels and item rendering

**DecisionMarginHistogram.tsx** - Histogram-Based Tagging
- SVM decision margin histogram
- Dual thresholds (select/reject)
- Real-time preview
- Modality detection integration
- Supports both `pair` and `feature` modes

### Visualization Components

**SankeyToSelectionFlowOverlay.tsx** - Flow Visualization
- Renders flows from Sankey segments to SelectionBar
- SVG path calculations
- Cross-component positioning

**FeatureSplitPairViewer.tsx** - Pair Analysis (Stage 1)
- Interactive pair exploration
- Decoder similarity visualization
- Selection/rejection interface

**ScrollableItemList.tsx** - Boundary Lists
- Scrollable list with fixed height
- Color-coded selection states
- Click handlers for navigation

**ActivationExamplePanel.tsx** - Activation Display
- Shows activation examples for features
- Token highlighting with activation values

**ExplanationPanel.tsx** - Explanation Display
- Explanation text with keyword highlights
- Cross-explainer comparison support

**ConsensusSection.tsx** - Consensus Phrase Display
- Displays HDBSCAN-clustered phrases sorted by activation similarity
- Shows cluster medoids with expansion to view all phrases
- Visual indicators for outliers vs clustered phrases
- Loads data via /api/consensus/{feature_id} endpoint

**Indicators.tsx** - Visual Indicators
- **TagBadge**: Unified tag badge showing Feature ID + Tag Name with category colors
- **MetricBar**: Horizontal bar for metric values with optional uncertainty display
- **QBC Vote Indicators**: Shows committee vote disagreement (RF/MLP vs SVM)
- Circle encoding for score visualization
- Auto-tag stripe pattern overlay for threshold/predicted items

**Tooltip.tsx** - Reusable Tooltip
- Composition pattern for flexible content: Tooltip.Header, Tooltip.Summary, Tooltip.Row
- Positioned tooltips with automatic viewport boundary detection
- Consistent styling across all visualizations (histogram, RadViz, etc.)

## SVM-Based Similarity Scoring

Both Stage 1 (pairs) and Stage 2 (features) use the same SVM-based scoring mechanism:

1. **Manual Tagging**: User tags 3+ items as selected and 3+ as rejected
2. **SVM Training**: Backend trains SVM on manual selections
3. **Query by Committee**: Backend trains RF + MLP alongside SVM to detect disagreement
4. **Scoring**: All items scored by distance from decision boundary
5. **Histogram**: Scores displayed in DecisionMarginHistogram with dual thresholds
6. **Modality Detection**: Hartigan's Dip test + GMM analysis
7. **Decision Flip Rate**: Track prediction stability across iterations
8. **Auto-Tagging**: Items beyond thresholds auto-tagged on "Apply Threshold"
9. **Commit History**: Each apply creates a restorable state snapshot

### Tag Selection Sources (SelectionSource type)
Items can be tagged via three mechanisms:
- **clicked**: User manually clicked to tag the item
- **threshold**: Auto-tagged by applying threshold boundaries
- **predicted**: SVM prediction accepted during batch tagging

## Tagging Hooks (lib/tagging-hooks/)

Reusable React hooks for tagging functionality across stages:

| Hook | Purpose |
|------|---------|
| `useThresholdPreview` | Manages threshold preview state and calculations |
| `useTaggingStatus` | Tracks tagging status (ready, pending, complete) |
| `useCommitHistory` | Manages commit history for state snapshots |
| `useListNavigation` | Handles list navigation with keyboard/click |
| `usePaginatedList` | Pagination logic for large item lists |
| `useBoundaryItems` | Detects items at threshold boundaries |
| `useSortableList` | Sortable list with drag/reorder support |
| `useBimodalStatus` | Tracks bimodal distribution status |

## Development Workflow

### Starting Development
```bash
cd frontend
npm install
npm run dev -- --port 3003
```

### Logs
- **Backend Log**: `/home/dohyun/interface/backend.log` - Check this file for backend errors and API debugging

### Build & Lint
```bash
npm run build      # Production build
npm run lint       # ESLint check
npm run typecheck  # Type check
```

## Key Implementation Patterns

### React-D3 Integration
```typescript
function SankeyDiagram() {
  const svgRef = useRef<SVGSVGElement>(null)

  // D3 calculations in useMemo
  const {nodes, links} = useMemo(() => {
    return calculateSankeyLayout(sankeyData, width, height)
  }, [sankeyData, width, height])

  // React renders using D3-calculated positions
  return (
    <svg ref={svgRef}>
      {nodes.map(node => (
        <g key={node.id} transform={`translate(${node.x0},${node.y0})`}>
          {/* Node rendering */}
        </g>
      ))}
    </svg>
  )
}
```

### State Management Rules
1. **Never mutate state directly** - Use Zustand actions
2. **Keep derived state in useMemo** - Don't store computed values
3. **Use proper typing** - All state must be typed
4. **Action naming** - Use verb prefixes (set, update, fetch, etc.)

### Mode-Aware Components
Components like `ThresholdTaggingPanel` and `DecisionMarginHistogram` support multiple modes:
```typescript
// Mode determines: item type, labels, selection states, API calls
interface Props {
  mode: 'feature' | 'pair'  // Stage 2 vs Stage 1
  // Mode-specific props
  leftItems?: PairItemWithMetadata[]      // pair mode
  leftFeatures?: FeatureItemWithMetadata[] // feature mode
}
```

### Performance Patterns
```typescript
// Memoization for expensive calculations
const processedData = useMemo(() => computeExpensiveData(rawData), [rawData])

// React.memo for expensive components
export const ExpensiveViz = React.memo(({data}) => {
  // Component
})

// Debouncing for user interactions
const debouncedUpdate = useMemo(
  () => debounce(updateThresholds, 300),
  [updateThresholds]
)
```

## API Endpoints Used

| Endpoint | Usage |
|----------|-------|
| GET /health | Health check on startup |
| GET /api/filter-options | Load filter choices |
| POST /api/feature-groups | Feature grouping for Sankey |
| POST /api/histogram-data | Histograms for popovers |
| POST /api/table-data | Feature table data |
| POST /api/segment-cluster-pairs | Get all cluster pairs |
| POST /api/similarity-sort | Sort features by SVM |
| POST /api/pair-similarity-sort | Sort pairs by SVM |
| POST /api/similarity-score-histogram | Feature histogram + modality |
| POST /api/pair-similarity-score-histogram | Pair histogram + modality |
| POST /api/cause-classification | SVM cause classification (Stage 3) |
| POST /api/cold-start/representative | Representative features for cold start |
| GET /api/consensus/{feature_id} | Consensus phrases for a feature |
| POST /api/activation-examples | On-demand activation data |
| GET /api/activation-examples-cached | Pre-computed activation blob |

## Common Issues & Solutions

### Issue: Sankey not updating after threshold change
**Solution**: Ensure `recomputeSankeyTree()` is called after tree modification

### Issue: API calls failing with CORS
**Solution**: Backend must include frontend port in CORS origins

### Issue: State updates not reflected
**Solution**: Check Zustand action is properly updating state

### Issue: Hook dependency warnings
**Solution**: Either add dependencies or use eslint-disable with explanation

### Issue: Mode-specific rendering not working
**Solution**: Check `mode` prop is correctly passed and used in conditionals

### Issue: Flow overlay positioning incorrect
**Solution**: Ensure ref callbacks are properly updating segment/category refs

---

## Remember

**This is a research prototype for conference demonstrations**

When working on frontend code:
- **Avoid over-engineering**: Use simple React patterns
- **Clean up after changes**: Remove unused components, functions, styles, imports
- **Reuse existing code**: Check lib/, store/, components/ first
- **Run linter**: Always check `npm run lint` before committing
- **Mode awareness**: Components often support multiple modes (pair/feature) - check existing patterns

The goal is a flexible, maintainable visualization tool, not a production application.
