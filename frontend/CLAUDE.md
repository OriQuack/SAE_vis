# Frontend CLAUDE.md - SAE Feature Visualization React Application

Professional guidance for the React frontend of the SAE Feature Visualization research prototype.

## Frontend Architecture Overview

**Purpose**: Interactive visualization interface for exploring SAE feature explanation reliability
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: Smart tree-based Sankey building with frontend-side set intersection

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
├── cause-actions.ts                  # Stage 3: Cause mode
├── common-actions.ts                 # Shared operations
├── activation-actions.ts             # Activation data
└── utils.ts                          # Store helper functions
```

## 3-Stage Tagging Workflow

The application implements a 3-stage workflow for tagging features:

| Stage | Component | Mode | Items | Tags |
|-------|-----------|------|-------|------|
| 1. Feature Splitting | `FeatureSplitView.tsx` | `pair` | Feature pairs | Fragmented / Monosemantic |
| 2. Quality Assessment | `QualityView.tsx` | `feature` | Individual features | Well-Explained / Need Revision |
| 3. Root Cause Analysis | (coming soon) | `cause` | Individual features | TBD |

### Shared Components Across Stages
Both Stage 1 and Stage 2 share the same layout pattern:
- **SelectionPanel** (left): Selection state bar + commit history
- **ThresholdTaggingPanel** (bottom): Histogram + boundary lists
- **TagAutomaticPanel**: SVM-based similarity scoring histogram

## Key Components

### Main Views

**App.tsx** - Main Orchestrator
- Health check on startup
- Stage-based view routing
- Layout orchestration based on `activeStageCategory`

**SankeyDiagram.tsx** - Tree Visualization
- D3-Sankey integration
- Inline histogram rendering
- Node click handling → SankeyOverlay
- Threshold handle integration

**FeatureSplitView.tsx** - Stage 1: Feature Splitting
- Mode: `pair`
- Pair list with hierarchical clustering
- FeatureSplitPairViewer for pair analysis
- TagAutomaticPanel for histogram-based tagging
- Commit history for state snapshots
- Tags: Fragmented (selected) / Monosemantic (rejected)

**QualityView.tsx** - Stage 2: Quality Assessment
- Mode: `feature`
- Layout mirrors FeatureSplitView
- SelectionPanel (left) + placeholder (top) + ThresholdTaggingPanel (bottom)
- SVM-based similarity scoring for features
- Commit history for state snapshots
- Tags: Well-Explained (selected) / Need Revision (rejected)

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
- Contains: TagAutomaticPanel + buttons + boundary lists
- Mode-specific labels and item rendering

**TagAutomaticPanel.tsx** - Histogram-Based Tagging
- SVM similarity score histogram
- Dual thresholds (select/reject)
- Real-time preview
- Supports both `pair` and `feature` modes

### Visualization Components

**SankeyHistogramPopover.tsx** - Threshold Editing
- Histogram visualization
- Draggable threshold handles
- Portal-based rendering

**FeatureSplitPairViewer.tsx** - Pair Analysis (Stage 1)
- Interactive pair exploration
- Decoder similarity visualization
- Selection/rejection interface

**ScrollableItemList.tsx** - Boundary Lists
- Scrollable list with fixed height
- Color-coded selection states
- Click handlers for navigation

## SVM-Based Similarity Scoring

Both Stage 1 (pairs) and Stage 2 (features) use the same SVM-based scoring mechanism:

1. **Manual Tagging**: User tags 3+ items as selected and 3+ as rejected
2. **SVM Training**: Backend trains SVM on manual selections
3. **Scoring**: All items scored by distance from decision boundary
4. **Histogram**: Scores displayed in histogram with dual thresholds
5. **Auto-Tagging**: Items beyond thresholds auto-tagged on "Apply Threshold"
6. **Commit History**: Each apply creates a restorable state snapshot

## Project Structure

```
frontend/src/
├── components/                    # React Components
│   ├── App.tsx                   # Main application + stage routing
│   ├── SankeyDiagram.tsx         # Sankey visualization
│   ├── SankeyOverlay.tsx         # Stage addition interface
│   ├── SankeyHistogramPopover.tsx # Histogram popover
│   ├── FeatureSplitView.tsx      # Stage 1: Feature splitting
│   ├── FeatureSplitPairViewer.tsx # Pair viewer for Stage 1
│   ├── QualityView.tsx           # Stage 2: Quality assessment
│   ├── SelectionPanel.tsx        # Unified selection panel
│   ├── SelectionBar.tsx          # Selection state bar
│   ├── TagStagePanel.tsx         # Stage navigation
│   ├── ThresholdTaggingPanel.tsx # Bottom tagging panel (pair/feature)
│   ├── TagAutomaticPanel.tsx     # Histogram + auto-tagging
│   ├── TagAutomaticPopover.tsx   # Legacy threshold tagging popover
│   ├── ScrollableItemList.tsx    # Scrollable item list
│   ├── ActivationExample.tsx     # Activation display
│   ├── TableExplanation.tsx      # Explanation text
│   ├── QualityScoreBreakdown.tsx # Score breakdown
│   ├── AppHeader.tsx             # Header
│   └── _QualityTable.deprecated.tsx # (deprecated, not imported)
├── lib/                          # Utilities
│   ├── constants.ts              # App constants, tag categories
│   ├── sankey-utils.ts           # Sankey calculations
│   ├── sankey-histogram-utils.ts # Inline histograms
│   ├── histogram-utils.ts        # Histogram processing
│   ├── table-utils.ts            # Table layout
│   ├── color-utils.tsx           # Color encoding
│   ├── tag-system.ts             # Tag colors/labels
│   ├── utils.ts                  # General helpers
│   └── ...                       # Other utilities
├── store/                        # Zustand State
│   ├── index.ts                  # Main store composition
│   ├── sankey-actions.ts         # Sankey operations
│   ├── feature-split-actions.ts  # Stage 1 actions
│   ├── quality-actions.ts        # Stage 2 actions
│   ├── cause-actions.ts          # Stage 3 actions
│   ├── common-actions.ts         # Shared actions
│   └── ...
├── styles/                       # CSS Files
│   ├── FeatureSplitView.css      # Stage 1 styles
│   ├── QualityView.css           # Stage 2 styles
│   ├── ThresholdTaggingPanel.css # Bottom panel styles
│   └── *.css                     # Other component styles
├── types.ts                      # TypeScript types
├── api.ts                        # API client
└── main.tsx                      # Entry point
```

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
npx tsc --noEmit   # Type check
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
Components like `ThresholdTaggingPanel` and `TagAutomaticPanel` support multiple modes:
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
